import { ChatMessage, ToolCallDelta as CoreToolCallDelta, ThinkingChatMessage } from "../../../index.js";
import { DatabricksHelpers } from "./helpers.js";
import "./types/extension.d.ts";
import {
  PersistentStreamState,
  ReconnectionResult,
  ResponseDelta,
  StreamingChunk,
  StreamingResponseResult,
  ToolCall,
  ToolCallResult
} from "./types/types.js";

// 共通ユーティリティのインポート
import { streamSse } from "../../stream.js";
import { getErrorMessage, isConnectionError } from "../../utils/errors.js";
import {
  extractValidJson,
  isValidJson,
  processJsonDelta,
  safeJsonParse,
  safeStringify
} from "../../utils/json.js";
import { extractContentAsString, extractQueryContext } from "../../utils/messageUtils.js";
import { JsonBufferHelpers } from "../../utils/streamProcessing.js";
import { isSearchTool, processSearchToolArguments, repairToolArguments } from "../../utils/toolUtils.js";

// 定数
const MAX_STATE_AGE_MS = 5 * 60 * 1000; // 5分
const THINKING_LOG_INTERVAL = 10; // 10チャンクごとにログ出力
const BUFFER_SIZE_THRESHOLD = 200; // 200文字以上でバッファ出力
const MAX_JSON_BUFFER_SIZE = 10000; // 最大JSONバッファサイズ
const MAX_LOOP_DETECTION_COUNT = 10; // 無限ループ検出のためのカウンター閾値
const MIN_UPDATE_INTERVAL_MS = 100; // 最小更新間隔（ミリ秒）
const JSON_RECOVERY_ATTEMPTS = 3; // JSONフラグメント修復の試行回数
const MAX_BUFFER_TIME_MS = 30000; // 最大バッファリング時間（30秒）
const MAX_IDENTICAL_UPDATES = 5; // 同一更新の最大許容回数

// 検索ツール引数の型定義
interface QueryArgs {
  query?: string;
  [key: string]: any;
}

/**
 * ストリーミングレスポンスの処理を担当するクラス
 * Databricks上のClaude 3.7 Sonnetからのストリーミングレスポンスを処理
 */
export class StreamingProcessor {
  // ストリーム状態を保持する静的変数
  private static persistentState: PersistentStreamState = {
    jsonBuffer: "",
    isBufferingJson: false,
    toolCallsInProgress: [],
    currentToolCallIndex: null,
    contentBuffer: "",
    lastReconnectTimestamp: 0,
    bufferingStartTime: undefined, // バッファリング開始時間を追跡
    lastProcessedToolCallId: "", // 最後に処理したツールコールID
    identicalUpdateCount: 0 // 同一更新の回数カウンター
  };
  
  // 状態更新のループ検出用カウンター
  private static stateUpdateCounter = 0;
  private static lastStateUpdateTime = 0;
  
  // 思考テキストバッファ - 文章を句読点ごとに区切るために使用
  private static thinkingTextBuffer: string = '';
  
  // 思考プロセスが開始されたかどうかを追跡するフラグ
  private static hasThinkingStarted: boolean = false;
  
  // 最後の思考テキスト - 重複を避けるために使用
  private static lastThinkingText: string = '';
  
  // JSON修復の試行回数を追跡
  private static jsonRepairAttempts: number = 0;
  
  // 前回のツールコールデータを記録して無限ループを検出
  private static lastToolCallData: string = '';
  private static toolCallUpdateCount: number = 0;

  /**
   * オブジェクトとしてのコンテンツかどうかを確認するタイプガード
   * @param content チェックする対象
   * @returns オブジェクトの場合true
   */
  private static isContentObject(content: any): content is { summary?: { text?: string } } {
    return typeof content === 'object' && content !== null;
  }

  /**
   * 配列要素かどうかを確認するタイプガード
   * @param content チェックする対象
   * @returns 配列の場合true
   */
  private static isArrayContent(content: any): content is any[] {
    return Array.isArray(content);
  }

  /**
   * ツール呼び出しを出力用に処理するヘルパー関数
   * ToolCall型とToolCallDelta型の互換性問題を解決します
   * 
   * @param toolCalls 処理するツール呼び出し配列
   * @returns 処理済みのツール呼び出し配列または未定義
   */
  private static processToolCallsForOutput(toolCalls: ToolCall[] | undefined): CoreToolCallDelta[] | undefined {
    if (!toolCalls || toolCalls.length === 0) {
      return undefined;
    }

    // すべてのツール呼び出しが適切なtypeプロパティを持っていることを確認
    // 明示的に"function"を指定し、コアの型と互換性を持たせる
    const processedToolCalls = toolCalls.map(call => ({
      ...call,
      type: "function" as const  // "function"リテラル型として明示
    }));
    
    // CoreToolCallDelta[]型として返す
    return processedToolCalls as unknown as CoreToolCallDelta[];
  }

  /**
   * 永続的なストリーム状態を取得
   * @returns 現在の永続的ストリーム状態
   */
  static getPersistentState(): PersistentStreamState {
    return { ...this.persistentState };
  }

  /**
   * 永続的なストリーム状態を更新
   * @param newState 新しい永続的ストリーム状態
   */
  static updatePersistentState(newState: Partial<PersistentStreamState>): void {
    // 現在時刻を取得
    const now = Date.now();
    
    // 無限ループ検出: 同じツールコールIDでの更新が続く場合
    if (newState.lastProcessedToolCallId && 
        newState.lastProcessedToolCallId === this.persistentState.lastProcessedToolCallId) {
      this.persistentState.identicalUpdateCount++;
      
      // 一定回数以上同じIDでの更新があれば無限ループとみなして状態リセット
      if (this.persistentState.identicalUpdateCount > MAX_IDENTICAL_UPDATES) {
        console.warn(`警告: 同じツールコールID "${newState.lastProcessedToolCallId}" で${MAX_IDENTICAL_UPDATES}回以上の更新を検出しました。状態をリセットします。`);
        this.resetPersistentState();
        return;
      }
    } else if (newState.lastProcessedToolCallId) {
      // 異なるIDが来たらカウンターをリセット
      this.persistentState.identicalUpdateCount = 0;
      this.persistentState.lastProcessedToolCallId = newState.lastProcessedToolCallId;
    }
    
    // 更新間隔をチェック - 短すぎる間隔での更新を防止
    if (now - this.lastStateUpdateTime < MIN_UPDATE_INTERVAL_MS) {
      this.stateUpdateCounter++;
      
      // 無限ループを検出
      if (this.stateUpdateCounter > MAX_LOOP_DETECTION_COUNT) {
        console.warn("警告: 状態更新の無限ループを検出しました。状態をリセットします。");
        this.resetPersistentState();
        this.stateUpdateCounter = 0;
        return;
      }
    } else {
      // 十分な間隔が空いた場合はカウンターをリセット
      this.stateUpdateCounter = 0;
      this.lastStateUpdateTime = now;
    }
    
    try {
      // JSONバッファサイズのチェック - 過大なバッファを防止
      if (newState.jsonBuffer && newState.jsonBuffer.length > MAX_JSON_BUFFER_SIZE) {
        console.warn(`JSONバッファサイズが大きすぎます (${newState.jsonBuffer.length} バイト)。バッファを切り詰めます。`);
        newState.jsonBuffer = newState.jsonBuffer.substring(0, MAX_JSON_BUFFER_SIZE);
      }
      
      // バッファリング開始時間を管理
      if (newState.isBufferingJson === true && this.persistentState.isBufferingJson === false) {
        // バッファリングが開始される場合、時刻を記録
        newState.bufferingStartTime = now;
      } else if (newState.isBufferingJson === false && this.persistentState.isBufferingJson === true) {
        // バッファリングが終了する場合、時刻をリセット
        newState.bufferingStartTime = undefined;
      }
      
      // 状態を更新
      this.persistentState = {
        ...this.persistentState,
        ...newState,
        lastReconnectTimestamp: newState.lastReconnectTimestamp || Date.now()
      };
      
      console.log(`永続的ストリーム状態を更新しました: JSON(${this.persistentState.jsonBuffer?.length || 0}バイト), バッファリング(${this.persistentState.isBufferingJson}), ツール呼び出し(${this.persistentState.toolCallsInProgress?.length || 0}件)`);
    } catch (error) {
      // エラーが発生した場合は状態をリセット
      console.error(`状態更新中にエラーが発生しました: ${getErrorMessage(error)}`);
      this.resetPersistentState();
    }
  }

  /**
   * 永続的なストリーム状態をリセット
   */
  static resetPersistentState(): void {
    this.persistentState = {
      jsonBuffer: "",
      isBufferingJson: false,
      toolCallsInProgress: [],
      currentToolCallIndex: null,
      contentBuffer: "",
      lastReconnectTimestamp: 0,
      bufferingStartTime: undefined,
      lastProcessedToolCallId: "",
      identicalUpdateCount: 0
    };
    this.stateUpdateCounter = 0;
    this.lastStateUpdateTime = 0;
    this.thinkingTextBuffer = ''; // 思考テキストバッファもリセット
    this.hasThinkingStarted = false; // 思考開始フラグをリセット
    this.lastThinkingText = ''; // 最後の思考テキストをリセット
    this.jsonRepairAttempts = 0; // JSON修復試行回数をリセット
    this.lastToolCallData = ''; // 最後のツールコールデータをリセット
    this.toolCallUpdateCount = 0; // ツールコール更新カウントをリセット
    console.log("永続的ストリーム状態をリセットしました");
  }

  /**
   * 思考テキストを処理して完全な文章を抽出し、残りをバッファに保存
   * 「。」の句読点で区切られた完全な文章を検出
   * 
   * @param thinkingText 新しい思考テキスト
   * @returns {sentences: string[], remaining: string} 完全な文章の配列と残りのテキスト
   */
  private static processThinkingText(thinkingText: string): { 
    sentences: string[], 
    remaining: string 
  } {
    // 重複チェック - 同じ思考テキストが繰り返されないようにする
    if (this.lastThinkingText === thinkingText) {
      return { sentences: [], remaining: '' };
    }
    
    // 最後の思考テキストを更新
    this.lastThinkingText = thinkingText;
    
    // バッファに新しいテキストを追加
    this.thinkingTextBuffer += thinkingText;
    
    // 完全な文章を検出
    const sentences: string[] = [];
    let lastIndex = 0;
    
    // 日本語と英語の句読点を検索（全角・半角両方対応）
    const sentenceRegex = /([^。．]*[。．])/g;
    let match;
    
    while ((match = sentenceRegex.exec(this.thinkingTextBuffer)) !== null) {
      sentences.push(match[0]);
      lastIndex = match.index + match[0].length;
    }
    
    // 残りのテキスト（次の句読点までの部分）
    const remaining = this.thinkingTextBuffer.substring(lastIndex);
    
    // バッファを更新（残りのテキストのみ保持）
    this.thinkingTextBuffer = remaining;
    
    return { sentences, remaining };
  }

  /**
   * 思考テキストバッファをフラッシュ
   * ストリーム終了時やバッファが大きくなりすぎた場合に呼び出す
   * 
   * @param signature シグネチャ（存在する場合）
   * @returns 思考メッセージ、バッファが空の場合はnull
   */
  static flushThinkingBuffer(signature?: string): ThinkingChatMessage | null {
    if (this.thinkingTextBuffer && this.thinkingTextBuffer.length > 0) {
      console.log(` ${this.thinkingTextBuffer}`);
      
      const finalThinkingMessage: ThinkingChatMessage = {
        role: "thinking",
        content: this.thinkingTextBuffer,
        signature: signature
      };
      
      // バッファをリセット
      this.thinkingTextBuffer = '';
      
      return finalThinkingMessage;
    }
    
    return null;
  }

  /**
   * 正しい形式の思考モード対応アシスタントメッセージを生成する
   * 必要なtypeフィールドと正しい配列構造を含む
   * 
   * @param textContent テキスト内容
   * @param thinkingContent 思考プロセスの内容
   * @param thinkingSignature 思考プロセスの署名（オプション）
   * @param toolCalls ツール呼び出し配列（オプション）
   * @returns 思考モード対応のアシスタントメッセージ
   */
  static createThinkingModeAssistantMessage(
    textContent: string,
    thinkingContent: string,
    thinkingSignature?: string,
    toolCalls?: CoreToolCallDelta[]
  ): ChatMessage {
    // 思考モード対応のメッセージ構造を作成
    // content は配列形式が必要で、最初の要素は "reasoning" タイプでなければならない
    
    // 思考コンテンツを含む最初の要素
    const reasoningElement = {
      type: "text" as const, // TypeScriptエラー修正: "reasoning"ではなく"text"を使用
      text: thinkingContent // 思考プロセスのテキスト
    };
    
    // テキストコンテンツを含む2番目の要素
    const textElement = {
      type: "text" as const, // 必須: テキストタイプは "text" である必要がある
      text: textContent // 実際の応答テキスト
    };
    
    // 配列形式のcontent
    const contentArray = [reasoningElement, textElement];
    
    // 思考モード対応のアシスタントメッセージを返す
    // TypeScriptエラー修正: 型アサーションを使用して正しい型に変換
    const message: ChatMessage = {
      role: "assistant",
      content: contentArray as any, // 型アサーションを使用してMessageContentに変換
    };
    
    // ツール呼び出しがある場合は追加（型アサーションを使用して追加）
    if (toolCalls && toolCalls.length > 0) {
      (message as any).toolCalls = toolCalls;
    }
    
    return message;
  }

  /**
   * ストリーミングチャンクを処理し、適切なメッセージを生成
   * @param chunk 処理するチャンク
   * @param currentMessage 現在のメッセージ
   * @param toolCalls 現在のツール呼び出し配列
   * @param currentToolCall 現在処理中のツール呼び出し
   * @param currentToolCallIndex 現在のツール呼び出しインデックス
   * @param jsonBuffer JSONバッファ文字列
   * @param isBufferingJson JSONバッファリング中かどうか
   * @param messages 元のメッセージ配列
   * @param isReconnect 再接続フラグ
   * @returns 処理結果オブジェクト
   */
  static processChunk(
    chunk: StreamingChunk,
    currentMessage: ChatMessage,
    toolCalls: ToolCall[],
    currentToolCall: ToolCall | null,
    currentToolCallIndex: number | null,
    jsonBuffer: string,
    isBufferingJson: boolean,
    messages: ChatMessage[],
    isReconnect: boolean = false
  ): {
    updatedMessage: ChatMessage;
    updatedToolCalls: ToolCall[];
    updatedCurrentToolCall: ToolCall | null;
    updatedCurrentToolCallIndex: number | null;
    updatedJsonBuffer: string;
    updatedIsBufferingJson: boolean;
    thinkingMessage?: ChatMessage;
    shouldYieldMessage: boolean;
  } {
    // チャンクデータをログ出力（開発モードのみ）
    // if (process.env.NODE_ENV === 'development') {
    //   console.log(`処理チャンク: ${safeStringify(chunk, "<不明なチャンク>")}`);
    // } else {
      // 本番環境でも基本情報はログ出力
    //   console.log(`処理チャンク: ${safeStringify(chunk, "<不明なチャンク>")}`);
    // }
    
    // 再接続時は永続的な状態を適用
    if (isReconnect) {
      const state = this.getPersistentState();
      jsonBuffer = state.jsonBuffer || jsonBuffer;
      isBufferingJson = state.isBufferingJson || isBufferingJson;
      
      // ツール呼び出しの状態を復元（存在する場合のみ）
      if (state.toolCallsInProgress && Array.isArray(state.toolCallsInProgress) && state.toolCallsInProgress.length > 0) {
        toolCalls = [...state.toolCallsInProgress];
        
        if (state.currentToolCallIndex !== null && 
            toolCalls.length > state.currentToolCallIndex) {
          currentToolCall = toolCalls[state.currentToolCallIndex];
          currentToolCallIndex = state.currentToolCallIndex;
        }
      }
      
      console.log(`再接続処理: JSON(${jsonBuffer?.length || 0}バイト), バッファリング(${isBufferingJson}), ツール呼び出し(${toolCalls?.length || 0}件)`);
    }

    // デフォルトの戻り値
    const result = {
      updatedMessage: { ...currentMessage },
      updatedToolCalls: [...toolCalls],
      updatedCurrentToolCall: currentToolCall,
      updatedCurrentToolCallIndex: currentToolCallIndex,
      updatedJsonBuffer: jsonBuffer,
      updatedIsBufferingJson: isBufferingJson,
      thinkingMessage: undefined as ChatMessage | undefined, // 型アサーションで型を明示
      shouldYieldMessage: false
    };

    // チャンクデータがない場合は早期リターン
    if (!chunk) {
      console.warn("空のチャンクを受信しました。スキップします。");
      return result;
    }

    // *** 思考モード処理 ***
    // 思考データを抽出 - 共通ユーティリティを使用
    const thinkingData = DatabricksHelpers.extractThinkingData(chunk);
    
    if (thinkingData) {
      // 思考プロセスが開始されたことをマーク
      this.hasThinkingStarted = true;
      
      // 思考テキストを処理して完全な文章を抽出
      const processedText = this.processThinkingText(thinkingData.text);
      
      // 完全な文章があれば出力
      if (processedText.sentences.length > 0) {
        // 完全な文章をログに出力
        const completeText = processedText.sentences.join('');
        console.log(` ${completeText}`);
        
        // 思考メッセージを作成
        const thinkingMessage: ThinkingChatMessage = {
          role: "thinking",
          content: completeText,
          signature: thinkingData.signature
        };
        
        // 処理結果に思考メッセージを設定
        result.thinkingMessage = thinkingMessage;
        
        // 思考プロセスを含むアシスタントメッセージを更新
        // 現在のメッセージコンテンツを抽出（文字列または配列）
        const currentContent = extractContentAsString(currentMessage.content);
        
        // 思考モード対応の構造化メッセージを作成
        result.updatedMessage = this.createThinkingModeAssistantMessage(
          currentContent,
          completeText,
          thinkingData.signature,
          this.processToolCallsForOutput(result.updatedToolCalls)
        );
      } else {
        // 残りのテキストがバッファにある場合、サイズをチェック
        if (processedText.remaining.length > BUFFER_SIZE_THRESHOLD) {
          // バッファサイズが閾値を超えた場合は強制的に出力
          console.log(` ${processedText.remaining}`);
          
          // 思考メッセージを作成
          const thinkingMessage: ThinkingChatMessage = {
            role: "thinking",
            content: processedText.remaining,
            signature: thinkingData.signature
          };
          
          // バッファをリセット
          this.thinkingTextBuffer = '';
          
          // 処理結果に思考メッセージを設定
          result.thinkingMessage = thinkingMessage;
          
          // 思考プロセスを含むアシスタントメッセージを更新
          const currentContent = extractContentAsString(currentMessage.content);
          
          // 思考モード対応の構造化メッセージを作成
          result.updatedMessage = this.createThinkingModeAssistantMessage(
            currentContent,
            processedText.remaining,
            thinkingData.signature,
            this.processToolCallsForOutput(result.updatedToolCalls)
          );
        }
      }
      
      // 処理を完了して結果を返す
      return result;
    }
    
    // 通常のメッセージコンテンツの処理（思考モードではない場合）
    if (chunk.choices?.[0]?.delta?.content && 
        typeof chunk.choices[0].delta.content === 'string') {
      
      // コンテンツデルタを処理
      const newContent = chunk.choices[0].delta.content;
      
      // extractContentAsStringを使用して安全に現在のコンテンツを取得
      const currentContent = extractContentAsString(currentMessage.content);
      
      // 新しいコンテンツを追加
      const updatedContent = currentContent + newContent;
      
      // 思考プロセスが開始されている場合は、思考モード対応の構造化メッセージを作成
      if (this.hasThinkingStarted) {
        // 最後の思考テキストを取得
        const lastThinking = this.lastThinkingText || "思考処理を完了しました。";
        
        // 思考モード対応のメッセージ構造を作成
        result.updatedMessage = this.createThinkingModeAssistantMessage(
          updatedContent,
          lastThinking,
          undefined,
          this.processToolCallsForOutput(result.updatedToolCalls)
        );
      } else {
        // 思考プロセスが開始されていない場合は、通常のテキストメッセージを使用
        result.updatedMessage = {
          ...currentMessage,
          content: updatedContent
        };
      }
      
      // 更新はすぐに通知
      result.shouldYieldMessage = true;
      
      return result;
    }

    // ツールコールの処理
    if (chunk.choices?.[0]?.delta?.tool_calls && chunk.choices[0].delta.tool_calls.length > 0) {
      try {
        // 無限ループ検出: 同じツールコールデータが繰り返されていないかチェック
        const toolCallDataStr = safeStringify(chunk.choices[0].delta.tool_calls, "{}");
        if (toolCallDataStr === this.lastToolCallData) {
          this.toolCallUpdateCount++;
          
          // 同じデータが一定回数以上繰り返される場合は、ループとみなして処理をスキップ
          if (this.toolCallUpdateCount > MAX_IDENTICAL_UPDATES) {
            console.warn(`警告: 同じツールコールデータが${MAX_IDENTICAL_UPDATES}回以上繰り返されました。ループを回避するため処理をスキップします。`);
            return result;
          }
        } else {
          // 新しいデータの場合はカウンターをリセットして保存
          this.lastToolCallData = toolCallDataStr;
          this.toolCallUpdateCount = 0;
        }
        
        const processResult = this.processToolCallDelta(
          chunk.choices[0].delta,
          toolCalls,
          currentToolCall,
          currentToolCallIndex,
          jsonBuffer,
          isBufferingJson,
          messages
        );

        result.updatedToolCalls = processResult.updatedToolCalls;
        result.updatedCurrentToolCall = processResult.updatedCurrentToolCall;
        result.updatedCurrentToolCallIndex = processResult.updatedCurrentToolCallIndex;
        result.updatedJsonBuffer = processResult.updatedJsonBuffer;
        result.updatedIsBufferingJson = processResult.updatedIsBufferingJson;
        result.shouldYieldMessage = processResult.shouldYieldMessage;
        
        // 思考プロセスが開始されている場合は、思考モード対応の構造化メッセージを更新
        if (this.hasThinkingStarted) {
          // 最後の思考テキストを取得
          const lastThinking = this.lastThinkingText || "思考処理を完了しました。";
          const currentContent = extractContentAsString(currentMessage.content);
          
          // 思考モード対応のメッセージ構造を作成
          result.updatedMessage = this.createThinkingModeAssistantMessage(
            currentContent,
            lastThinking,
            undefined,
            this.processToolCallsForOutput(result.updatedToolCalls)
          );
        }
        
        // 現在のツールコールIDを記録して無限ループを検出
        if (result.updatedCurrentToolCall && result.updatedCurrentToolCall.id) {
          const lastProcessedToolCallId = result.updatedCurrentToolCall.id;
          
          // 永続的な状態を更新
          this.updatePersistentState({
            jsonBuffer: processResult.updatedJsonBuffer,
            isBufferingJson: processResult.updatedIsBufferingJson,
            toolCallsInProgress: processResult.updatedToolCalls,
            currentToolCallIndex: processResult.updatedCurrentToolCallIndex,
            lastProcessedToolCallId: lastProcessedToolCallId
          });
        } else {
          // ツールコールIDがない場合は通常の状態更新
          this.updatePersistentState({
            jsonBuffer: processResult.updatedJsonBuffer,
            isBufferingJson: processResult.updatedIsBufferingJson,
            toolCallsInProgress: processResult.updatedToolCalls,
            currentToolCallIndex: processResult.updatedCurrentToolCallIndex
          });
        }
      } catch (error) {
        console.error(`ツール呼び出し処理中にエラーが発生しました: ${getErrorMessage(error)}`);
        // エラーが発生しても処理を継続（結果はそのまま返す）
      }
      
      return result;
    }

    // 終了理由チェック - ツール呼び出しまたは完了のマーカーを探す
    if (chunk.choices?.[0]?.finish_reason === "tool_calls" || chunk.choices?.[0]?.finish_reason === "stop") {
      // ツール呼び出しか通常の終了が検出された場合、状態検証と必要に応じて修復を行う
      this.validateAndRepairState(result, messages);
      
      // 終了理由が検出されたら状態カウンターをリセットして無限ループを防止
      this.stateUpdateCounter = 0;
      this.toolCallUpdateCount = 0;
      this.lastToolCallData = '';
      
      // 明示的な終了理由があればメッセージを即時通知
      result.shouldYieldMessage = true;
    }

    return result;
  }

  /**
   * 状態を検証し必要に応じて修復する
   * チャンク処理の最後やストリーム終了時に呼び出される
   * 
   * @param result 現在の処理結果
   * @param messages メッセージ配列
   */
  private static validateAndRepairState(
    result: {
      updatedJsonBuffer: string,
      updatedIsBufferingJson: boolean,
      updatedCurrentToolCall: ToolCall | null,
      updatedCurrentToolCallIndex: number | null,
      updatedToolCalls: ToolCall[]
    }, 
    messages: ChatMessage[]
  ): void {
    // バッファリング中だがツール呼び出しがない場合
    if (result.updatedIsBufferingJson && !result.updatedCurrentToolCall) {
      console.warn("無効な状態: バッファリング中ですがツール呼び出しがありません。バッファをリセットします。");
      result.updatedIsBufferingJson = false;
      result.updatedJsonBuffer = "";
      return;
    }
    
    // まだバッファリング中の場合、完了したと見なすかどうかをチェック
    if (result.updatedIsBufferingJson && result.updatedJsonBuffer) {
      // バッファリングタイムアウトをチェック
      const bufferingStartTime = this.persistentState.bufferingStartTime || Date.now() - MAX_BUFFER_TIME_MS - 1;
      const bufferingTime = Date.now() - bufferingStartTime;
      
      if (bufferingTime > MAX_BUFFER_TIME_MS || result.updatedJsonBuffer.length > MAX_JSON_BUFFER_SIZE) {
        console.warn(`バッファリングタイムアウト (${Math.round(bufferingTime / 1000)}秒) または大きすぎるバッファ (${result.updatedJsonBuffer.length}バイト)。修復処理を行います。`);
        
        if (result.updatedCurrentToolCall) {
          try {
            // 修復を試みる
            const repairedJson = repairToolArguments(result.updatedJsonBuffer);
            
            // 修復されたJSONを設定
            result.updatedCurrentToolCall.function.arguments = repairedJson;
            
            if (result.updatedCurrentToolCallIndex !== null && 
                result.updatedCurrentToolCallIndex < result.updatedToolCalls.length) {
              result.updatedToolCalls[result.updatedCurrentToolCallIndex] = result.updatedCurrentToolCall;
            }
            
            console.log(`タイムアウトによる修復成功: ${repairedJson}`);
          } catch (e) {
            console.warn(`修復に失敗しました: ${getErrorMessage(e)}`);
          }
        }
        
        // バッファリング状態をリセット
        result.updatedIsBufferingJson = false;
        result.updatedJsonBuffer = "";
      }
    }
    
    // ツール呼び出しの検証 - 無効なツール呼び出しを削除
    result.updatedToolCalls = result.updatedToolCalls.filter(call => {
      // 最低限必要な情報を持っているか確認
      const isValid = call && 
                    call.id && 
                    call.function && 
                    typeof call.function.name === 'string' &&
                    call.function.name.trim() !== '';
      
      if (!isValid) {
        console.warn("無効なツール呼び出しを検出し、削除しました");
      }
      
      return isValid;
    });
    
    // ツール呼び出し情報の整合性チェック
    if (result.updatedCurrentToolCallIndex !== null) {
      // 現在のインデックスがツール呼び出し配列の範囲外の場合リセット
      if (result.updatedCurrentToolCallIndex >= result.updatedToolCalls.length || 
          result.updatedCurrentToolCallIndex < 0) {
        console.warn(`無効なツール呼び出しインデックス (${result.updatedCurrentToolCallIndex}) を検出しました。リセットします。`);
        result.updatedCurrentToolCallIndex = null;
        result.updatedCurrentToolCall = null;
      } else {
        // 現在のツール呼び出しとインデックスの整合性チェック
        result.updatedCurrentToolCall = result.updatedToolCalls[result.updatedCurrentToolCallIndex];
      }
    }
  }

  /**
   * バッファリングタイムアウトが期限切れかどうかをチェック
   * @param isBufferingJson 現在バッファリング中かどうか
   * @param bufferingStartTime バッファリング開始時間
   * @param jsonBuffer 現在のJSONバッファ
   * @returns タイムアウトしている場合はtrue
   */
  private static hasBufferingTimeoutExpired(
    isBufferingJson: boolean,
    bufferingStartTime: number | undefined,
    jsonBuffer: string
  ): boolean {
    // バッファリングしていない場合はタイムアウトしていない
    if (!isBufferingJson) return false;
    
    // バッファリング開始時間が設定されていない場合はタイムアウトしていない
    if (!bufferingStartTime) return false;
    
    // バッファリング時間を計算
    const bufferingTime = Date.now() - bufferingStartTime;
    
    // 時間またはサイズによるタイムアウト条件をチェック
    return bufferingTime > MAX_BUFFER_TIME_MS || jsonBuffer.length > MAX_JSON_BUFFER_SIZE;
  }

  /**
   * ツールコールデルタを処理
   * @param delta レスポンスデルタ
   * @param toolCalls 現在のツール呼び出し配列
   * @param currentToolCall 現在処理中のツール呼び出し
   * @param currentToolCallIndex 現在のツール呼び出しインデックス
   * @param jsonBuffer JSONバッファ文字列
   * @param isBufferingJson JSONバッファリング中かどうか
   * @param messages 元のメッセージ配列
   * @returns 処理結果オブジェクト
   */
  private static processToolCallDelta(
    delta: ResponseDelta,
    toolCalls: ToolCall[],
    currentToolCall: ToolCall | null,
    currentToolCallIndex: number | null,
    jsonBuffer: string,
    isBufferingJson: boolean,
    messages: ChatMessage[]
  ): ToolCallResult {
    // デフォルトの戻り値を初期化
    const result: ToolCallResult = {
      updatedToolCalls: [...toolCalls],
      updatedCurrentToolCall: currentToolCall,
      updatedCurrentToolCallIndex: currentToolCallIndex,
      updatedJsonBuffer: jsonBuffer || "",
      updatedIsBufferingJson: isBufferingJson,
      shouldYieldMessage: false
    };

    // ツールコールデルタが存在しない場合は早期リターン
    if (!delta.tool_calls || delta.tool_calls.length === 0) {
      return result;
    }
    
    const toolCallDelta = delta.tool_calls[0];
    
    // インデックスが存在しない場合は早期リターン
    if (toolCallDelta.index === undefined) {
      return result;
    }
    
    // 現在のインデックスを更新
    const index = toolCallDelta.index;
    
    // バッファリングタイムアウトのチェック
    // 新しいプロパティbufferingStartTimeを使用
    const bufferingStartTime = isBufferingJson ? 
      (this.persistentState.bufferingStartTime || Date.now()) : undefined;
    
    if (this.hasBufferingTimeoutExpired(isBufferingJson, bufferingStartTime, jsonBuffer)) {
      console.warn("バッファリングタイムアウトが期限切れ。バッファ状態をリセットします。");
      result.updatedJsonBuffer = "";
      result.updatedIsBufferingJson = false;
      
      // もし現在のツールコールが存在していれば、不完全なJSONを保存
      if (result.updatedCurrentToolCall && jsonBuffer.length > 0) {
        try {
          // 最後のJSON修復を試みる
          const repairedJson = repairToolArguments(jsonBuffer);
          result.updatedCurrentToolCall.function.arguments = repairedJson;
          console.log(`タイムアウトによるJSON修復: ${repairedJson}`);
        } catch (e) {
          console.warn(`JSON修復エラー: ${getErrorMessage(e)}`);
        }
      }
    }
    
    // 新しいツール呼び出しの開始または別のインデックスへの切り替え
    if (result.updatedCurrentToolCallIndex !== index) {
      // もし現在JSONをバッファリング中であれば、
      // 次のツールに移る前に現在のツールの処理を完了させる
      if (result.updatedIsBufferingJson && 
          result.updatedJsonBuffer && 
          result.updatedCurrentToolCall) {
        try {
          // 最後のJSON修復を試みる
          this.jsonRepairAttempts++;
          if (this.jsonRepairAttempts <= JSON_RECOVERY_ATTEMPTS) {
            console.log(`ツール切り替え前のJSON修復を試みます (試行 ${this.jsonRepairAttempts}/${JSON_RECOVERY_ATTEMPTS})`);
            
            // 共通ユーティリティのrepairToolArgumentsを使用してJSONを修復
            const repairedJson = repairToolArguments(result.updatedJsonBuffer);
            
            // 成功した場合は現在のツールに適用
            if (isValidJson(repairedJson)) {
              // ツール引数を更新
              result.updatedCurrentToolCall.function.arguments = repairedJson;
              
              // バッファをリセット
              result.updatedJsonBuffer = "";
              result.updatedIsBufferingJson = false;
              
              console.log(`JSON修復に成功しました: ${repairedJson}`);
              this.jsonRepairAttempts = 0; // 成功したらカウンターをリセット
            }
          } else {
            // 試行回数が上限に達した場合はバッファをリセットして続行
            console.warn(`JSON修復の試行回数が上限(${JSON_RECOVERY_ATTEMPTS})に達しました。バッファをリセットします。`);
            result.updatedJsonBuffer = "";
            result.updatedIsBufferingJson = false;
            this.jsonRepairAttempts = 0; // カウンターをリセット
          }
        } catch (e) {
          console.warn(`ツール切り替え前のJSON修復中にエラーが発生しました: ${getErrorMessage(e)}`);
          // エラーがあっても次のツールに進む
          result.updatedJsonBuffer = "";
          result.updatedIsBufferingJson = false;
        }
      }
      
      // ツール呼び出しインデックスの変更を処理
      const indexChangeResult = this.handleToolCallIndexChange(
        result, 
        index, 
        messages
      );
      
      // 結果を更新
      Object.assign(result, indexChangeResult);
    }
    
    // 関数名の更新
    if (toolCallDelta.function?.name && result.updatedCurrentToolCall) {
      // 関数名の更新を処理
      const nameUpdateResult = this.updateToolCallFunctionName(
        result,
        toolCallDelta.function.name,
        messages
      );
      
      // 結果を更新
      Object.assign(result, nameUpdateResult);
    }
    
    // 関数引数の更新
    if (toolCallDelta.function?.arguments !== undefined && result.updatedCurrentToolCall) {
      try {
        // 引数が文字列であることを確認
        if (typeof toolCallDelta.function.arguments === 'string') {
          // 引数がJSONフラグメントかどうかを判断
          if (result.updatedIsBufferingJson || 
              toolCallDelta.function.arguments.trim().startsWith('{') || 
              toolCallDelta.function.arguments.trim().startsWith('[')) {
            
            // 共通ユーティリティのprocessJsonDeltaを使用
            try {
              const deltaResult = processJsonDelta(
                result.updatedJsonBuffer, 
                toolCallDelta.function.arguments
              );
              
              result.updatedJsonBuffer = deltaResult.combined;
              
              // JSONが完成したかチェック
              if (deltaResult.complete && deltaResult.valid) {
                // 共通ユーティリティのrepairToolArgumentsを使用してJSONを修復
                const repairedJson = repairToolArguments(result.updatedJsonBuffer);
                
                // 検索ツールの場合は特別処理
                if (result.updatedCurrentToolCall && isSearchTool(result.updatedCurrentToolCall.function.name)) {
                  result.updatedCurrentToolCall.function.arguments = processSearchToolArguments(
                    result.updatedCurrentToolCall.function.name,
                    "",
                    repairedJson,
                    messages
                  );
                } else {
                  // 通常のツールの場合は直接引数を設定
                  result.updatedCurrentToolCall.function.arguments = repairedJson;
                }
                
                // バッファをリセット
                result.updatedJsonBuffer = "";
                result.updatedIsBufferingJson = false;
                this.jsonRepairAttempts = 0; // 成功したらカウンターをリセット
                
                // バッファリング開始時間をリセット
                this.persistentState.bufferingStartTime = undefined;
                
                // ツール呼び出しを持つメッセージをyield
                result.shouldYieldMessage = true;
                return result;
              }
              
              // まだJSONが完成していない場合はバッファリングを継続
              if (!result.updatedIsBufferingJson) {
                // バッファリングを開始する場合、開始時間を記録
                this.persistentState.bufferingStartTime = Date.now();
              }
              result.updatedIsBufferingJson = true;
              return result;
            } catch (jsonError) {
              // JSONデルタ処理エラーの詳細をログ
              console.warn(`JSONデルタ処理エラー: ${getErrorMessage(jsonError)}`);
              console.warn(`現在のバッファ: ${result.updatedJsonBuffer}`);
              console.warn(`受信したデルタ: ${toolCallDelta.function.arguments}`);
              
              // JSONデルタ処理に失敗した場合は修復を試みる
              try {
                // JSONの修復を試みる（最大3回まで）
                this.jsonRepairAttempts++;
                if (this.jsonRepairAttempts <= JSON_RECOVERY_ATTEMPTS) {
                  console.log(`JSON修復を試みます (試行 ${this.jsonRepairAttempts}/${JSON_RECOVERY_ATTEMPTS})`);
                  
                  // 現在のバッファにデルタを追加
                  const combinedJson = result.updatedJsonBuffer + toolCallDelta.function.arguments;
                  
                  // 共通ユーティリティのrepairToolArgumentsを使用してJSONを修復
                  const repairedJson = repairToolArguments(combinedJson);
                  
                  // 成功した場合は適用
                  if (isValidJson(repairedJson)) {
                    // 修復に成功したらバッファを更新
                    result.updatedJsonBuffer = repairedJson;
                    console.log(`JSON修復に成功しました: ${repairedJson}`);
                    
                    // JSONが完成したかチェック
                    if (isValidJson(repairedJson)) {
                      // ツール引数に適用
                      if (result.updatedCurrentToolCall) {
                        result.updatedCurrentToolCall.function.arguments = repairedJson;
                      }
                      
                      // バッファをリセット
                      result.updatedJsonBuffer = "";
                      result.updatedIsBufferingJson = false;
                      this.jsonRepairAttempts = 0; // 成功したらカウンターをリセット
                      
                      // バッファリング開始時間をリセット
                      this.persistentState.bufferingStartTime = undefined;
                      
                      // ツール呼び出しを持つメッセージをyield
                      result.shouldYieldMessage = true;
                      return result;
                    }
                  } else {
                    // 修復に失敗した場合は従来のアプローチを使用
                    result.updatedJsonBuffer += toolCallDelta.function.arguments;
                  }
                } else {
                  // 試行回数が上限に達した場合はバッファをリセットして続行
                  console.warn(`JSON修復の試行回数が上限(${JSON_RECOVERY_ATTEMPTS})に達しました。標準処理を続行します。`);
                  result.updatedJsonBuffer += toolCallDelta.function.arguments;
                  this.jsonRepairAttempts = 0; // カウンターをリセット
                }
              } catch (repairError) {
                // 修復にも失敗した場合は従来のアプローチを使用
                console.warn(`JSON修復中に二次エラーが発生しました: ${getErrorMessage(repairError)}`);
                result.updatedJsonBuffer += toolCallDelta.function.arguments;
              }
              
              // まだバッファリング中でない場合は開始時間を記録
              if (!result.updatedIsBufferingJson) {
                this.persistentState.bufferingStartTime = Date.now();
              }
              result.updatedIsBufferingJson = true;
              
              // バッファサイズをチェック - 過大なバッファを防止
              if (result.updatedJsonBuffer.length > MAX_JSON_BUFFER_SIZE) {
                console.warn(`JSONバッファサイズが大きすぎます (${result.updatedJsonBuffer.length} バイト)。バッファを切り詰めます。`);
                result.updatedJsonBuffer = result.updatedJsonBuffer.substring(0, MAX_JSON_BUFFER_SIZE);
              }
              
              return result;
            }
          } else {
            // JSONフラグメント以外の処理
            
            // 共通ユーティリティのrepairToolArgumentsを使用して引数を修復
            let repairedArguments = repairToolArguments(toolCallDelta.function.arguments);
            
            // エラーメッセージのデバッグログ
            if (repairedArguments !== toolCallDelta.function.arguments) {
              console.log(`ツール引数を修復しました: ${toolCallDelta.function.arguments} -> ${repairedArguments}`);
            }
            
            // 標準的な引数更新処理
            const argsUpdateResult = this.updateToolCallArguments(
              result,
              repairedArguments,
              messages
            );
            
            // 結果を更新
            Object.assign(result, argsUpdateResult);
          }
        }
      } catch (e) {
        // エラーが発生した場合は、最も単純な処理を実行
        console.warn(`ツール引数の処理中にエラーが発生しました: ${getErrorMessage(e)}`);
        
        // エラーをログに記録して処理を継続
        if (result.updatedCurrentToolCall) {
          if (result.updatedCurrentToolCall.function.arguments) {
            result.updatedCurrentToolCall.function.arguments += String(toolCallDelta.function.arguments || "");
          } else {
            result.updatedCurrentToolCall.function.arguments = String(toolCallDelta.function.arguments || "");
          }
        }
      }
    }
    
    // ツール呼び出しが有効なものだけフィルタリング
    result.updatedToolCalls = result.updatedToolCalls.filter(Boolean);
    result.shouldYieldMessage = result.updatedToolCalls.length > 0;
    
    return result;
  }

  /**
   * ツール呼び出しインデックスの変更を処理
   * @param result 現在の処理結果
   * @param newIndex 新しいインデックス
   * @param messages メッセージ配列
   * @returns 更新された処理結果
   */
  private static handleToolCallIndexChange(
    result: ToolCallResult,
    newIndex: number,
    messages: ChatMessage[]
  ): ToolCallResult {
    // 引数の安全性チェック
    if (newIndex < 0) {
      console.warn(`無効なツール呼び出しインデックスを受信しました: ${newIndex}`);
      return result;
    }
    
    // 新しい結果オブジェクトを作成
    const newResult = { ...result };
    
    // 現在バッファリング中のJSONがあれば処理
    if (newResult.updatedIsBufferingJson && newResult.updatedJsonBuffer && newResult.updatedCurrentToolCall) {
      try {
        // 現在の引数にバッファの内容を適用
        const toolCall = newResult.updatedCurrentToolCall;
        
        // バッファから有効なJSONを抽出して適用
        const validJson = extractValidJson(newResult.updatedJsonBuffer);
        if (validJson) {
          toolCall.function.arguments = processSearchToolArguments(
            toolCall.function.name,
            toolCall.function.arguments || "",
            validJson,
            messages
          );
        } else {
          // 有効なJSONがない場合はそのまま適用
          toolCall.function.arguments = processSearchToolArguments(
            toolCall.function.name,
            toolCall.function.arguments || "",
            newResult.updatedJsonBuffer,
            messages
          );
        }
      } catch (e) {
        console.warn(`JSONバッファ処理エラー: ${getErrorMessage(e)}`);
      }
      
      // バッファをリセット
      newResult.updatedJsonBuffer = "";
      newResult.updatedIsBufferingJson = false;
      
      // バッファリング開始時間をリセット
      this.persistentState.bufferingStartTime = undefined;
    }
    
    // 現在のツール呼び出しのインデックスが同じなら再処理を避ける（無限ループ防止）
    if (newResult.updatedCurrentToolCallIndex === newIndex) {
      // 現在のツール呼び出しが存在し、完全に初期化されているか確認
      if (newResult.updatedCurrentToolCall && 
          newResult.updatedCurrentToolCall.function && 
          typeof newResult.updatedCurrentToolCall.function.name === 'string' &&
          newResult.updatedCurrentToolCall.function.name.trim() !== '') {
        console.log(`同じインデックス (${newIndex}) のツール呼び出しが再度処理されました。スキップします。`);
        return newResult;
      }
    }
    
    // インデックスを更新
    newResult.updatedCurrentToolCallIndex = newIndex;
    
    // ツール呼び出し配列の拡張（必要に応じて）
    while (newResult.updatedToolCalls.length <= newIndex) {
      newResult.updatedToolCalls.push({
        id: `call_${Date.now()}_${newResult.updatedToolCalls.length}`,
        type: "function",
        function: {
          name: "",
          arguments: ""
        }
      });
    }
    
    // 新しいツール呼び出しの初期化
    if (!newResult.updatedToolCalls[newIndex]) {
      const newToolCall: ToolCall = {
        id: `call_${Date.now()}_${newIndex}`,
        type: "function",
        function: {
          name: "",
          arguments: ""
        }
      };
      newResult.updatedToolCalls[newIndex] = newToolCall;
      newResult.updatedCurrentToolCall = newToolCall;
    } else {
      newResult.updatedCurrentToolCall = newResult.updatedToolCalls[newIndex];
    }
    
    return newResult;
  }

  /**
   * ツール呼び出しの関数名を更新
   * @param result 現在の処理結果
   * @param functionName 関数名
   * @param messages メッセージ配列
   * @returns 更新された処理結果
   */
  private static updateToolCallFunctionName(
    result: ToolCallResult,
    functionName: string,
    messages: ChatMessage[]
  ): ToolCallResult {
    // 引数の安全性チェック
    if (!functionName) {
      return result;
    }
    
    // 新しい結果オブジェクトを作成
    const newResult = { ...result };
    
    if (!newResult.updatedCurrentToolCall) {
      return newResult;
    }
    
    // 関数名が既に設定されていて同じなら重複処理を避ける（無限ループ防止）
    if (newResult.updatedCurrentToolCall.function.name === functionName) {
      return newResult;
    }
    
    newResult.updatedCurrentToolCall.function.name = functionName;
    
    // 検索ツールの場合、デフォルトの引数を事前設定
    if (isSearchTool(newResult.updatedCurrentToolCall.function.name) && 
        !newResult.updatedCurrentToolCall.function.arguments) {
      const queryContext = extractQueryContext(messages);
      newResult.updatedCurrentToolCall.function.arguments = JSON.stringify({ query: queryContext });
    }
    
    return newResult;
  }

  /**
   * ツール呼び出しの引数を更新
   * @param result 現在の処理結果
   * @param args 引数（文字列または任意のオブジェクト）
   * @param messages メッセージ配列
   * @returns 更新された処理結果
   */
  private static updateToolCallArguments(
    result: ToolCallResult,
    args: string | any,
    messages: ChatMessage[]
  ): ToolCallResult {
    // 引数の安全性チェック
    if (args === undefined || args === null) {
      return result;
    }
    
    // 新しい結果オブジェクトを作成
    const newResult = { ...result };
    
    if (!newResult.updatedCurrentToolCall) {
      return newResult;
    }
    
    const newArgs = typeof args === "string" 
      ? args 
      : safeStringify(args, "");
    
    if (!newArgs) {
      return newResult; // 空の引数は無視
    }
    
    // 現在の引数と全く同じなら重複処理を避ける（無限ループ防止）
    if (newResult.updatedCurrentToolCall.function.arguments === newArgs) {
      return newResult;
    }
    
    // 検索ツールの場合の特別処理
    if (isSearchTool(newResult.updatedCurrentToolCall.function.name)) {
      return this.updateSearchToolArguments(newResult, newArgs, messages);
    } else {
      return this.updateGenericToolArguments(newResult, newArgs, messages);
    }
  }

  /**
   * 検索ツールの引数を更新
   * @param result 現在の処理結果
   * @param newArgs 新しい引数
   * @param messages メッセージ配列
   * @returns 更新された処理結果
   */
  private static updateSearchToolArguments(
    result: ToolCallResult,
    newArgs: string,
    messages: ChatMessage[]
  ): ToolCallResult {
    // 引数の安全性チェック
    if (!newArgs) {
      return result;
    }
    
    // 新しい結果オブジェクトを作成
    const newResult = { ...result };
    
    if (!newResult.updatedCurrentToolCall) {
      return newResult;
    }
    
    // 既に有効な引数がある場合は更新しない（冗長な更新を防止）
    if (newResult.updatedCurrentToolCall.function.arguments &&
        newResult.updatedCurrentToolCall.function.arguments !== "{}" &&
        newResult.updatedCurrentToolCall.function.arguments !== "") {
      
      try {
        // 型付きで引数をパース
        const existingArgs = safeJsonParse<QueryArgs>(newResult.updatedCurrentToolCall.function.arguments, {});
        
        // 既に有効なqueryプロパティがある場合は更新をスキップ
        if (existingArgs && existingArgs.query && typeof existingArgs.query === "string" && 
            existingArgs.query.trim() !== "") {
          if (process.env.NODE_ENV === 'development') {
            console.log(`検索ツールの引数が既に存在するため、更新をスキップ: ${safeStringify(existingArgs, "{}")}`);
          }
          return newResult;
        }
      } catch (e) {
        // パースエラーの場合は通常の処理を続行
      }
    }
    
    return this.processArgumentsWithJsonHandling(newResult, newArgs, messages);
  }

  /**
   * 一般的なツールの引数を更新
   * @param result 現在の処理結果
   * @param newArgs 新しい引数
   * @param messages メッセージ配列
   * @returns 更新された処理結果
   */
  private static updateGenericToolArguments(
    result: ToolCallResult,
    newArgs: string,
    messages: ChatMessage[]
  ): ToolCallResult {
    return this.processArgumentsWithJsonHandling(result, newArgs, messages);
  }

  /**
   * JSON処理を含む引数の処理
   * @param result 現在の処理結果
   * @param newArgs 新しい引数
   * @param messages メッセージ配列
   * @returns 更新された処理結果
   */
  private static processArgumentsWithJsonHandling(
    result: ToolCallResult,
    newArgs: string,
    messages: ChatMessage[]
  ): ToolCallResult {
    // 引数の安全性チェック
    if (!newArgs) {
      return result;
    }
    
    // 新しい結果オブジェクトを作成
    const newResult = { ...result };
    
    if (!newResult.updatedCurrentToolCall) {
      return newResult;
    }
    
    // 新しい引数から有効なJSONを抽出
    const validJson = extractValidJson(newArgs);
    
    if (validJson) {
      try {
        // 有効なJSONが抽出できた場合は、それをパースして処理
        const parsedJson = safeJsonParse(validJson, null);
        
        if (parsedJson !== null) {
          // 完全なJSONオブジェクトを受信した場合
          if (newResult.updatedIsBufferingJson) {
            // バッファリング中だった場合はリセット
            newResult.updatedJsonBuffer = "";
            newResult.updatedIsBufferingJson = false;
            this.persistentState.bufferingStartTime = undefined;
            if (process.env.NODE_ENV === 'development') {
              console.log(`JSONバッファをリセット: 完全なJSONを受信`);
            }
          }
          
          // パース済みJSONを引数に適用
          return this.applyParsedJsonToArguments(newResult, parsedJson, messages);
        }
      } catch (e) {
        // パースエラーの場合は、通常のバッファリング処理を継続
        console.warn(`JSONパースエラー（バッファリング処理を続行）: ${getErrorMessage(e)}`);
      }
    }
    
    // JSONとして処理できない場合やパースエラーの場合
    return this.handleNonJsonArguments(newResult, newArgs, messages);
  }

  /**
   * パース済みJSONを引数に適用
   * @param result 現在の処理結果
   * @param parsedJson パース済みJSONオブジェクト
   * @param messages メッセージ配列
   * @returns 更新された処理結果
   */
  private static applyParsedJsonToArguments(
    result: ToolCallResult,
    parsedJson: any,
    messages: ChatMessage[]
  ): ToolCallResult {
    // 引数の安全性チェック
    if (!parsedJson) {
      return result;
    }
    
    // 新しい結果オブジェクトを作成
    const newResult = { ...result };
    
    if (!newResult.updatedCurrentToolCall) {
      return newResult;
    }
    
    // 検索ツールの場合は専用メソッドで処理
    if (isSearchTool(newResult.updatedCurrentToolCall.function.name)) {
      newResult.updatedCurrentToolCall.function.arguments = processSearchToolArguments(
        newResult.updatedCurrentToolCall.function.name,
        newResult.updatedCurrentToolCall.function.arguments || "",
        JSON.stringify(parsedJson),
        messages
      );
    } else {
      // その他のツールは、標準的な処理を行う
      if (newResult.updatedCurrentToolCall.function.arguments) {
        try {
          const existingArgs = safeJsonParse(newResult.updatedCurrentToolCall.function.arguments, {});
          const mergedArgs = { ...existingArgs, ...parsedJson };
          newResult.updatedCurrentToolCall.function.arguments = JSON.stringify(mergedArgs);
        } catch (e) {
          // 既存の引数がJSONとして無効な場合は新しい引数で上書き
          newResult.updatedCurrentToolCall.function.arguments = JSON.stringify(parsedJson);
        }
      } else {
        // 引数がまだない場合は新しく設定
        newResult.updatedCurrentToolCall.function.arguments = JSON.stringify(parsedJson);
      }
    }
    
    // 更新をすぐに反映
    newResult.shouldYieldMessage = true;
    return newResult;
  }

  /**
   * JSON以外の引数を処理
   * @param result 現在の処理結果
   * @param newArgs 新しい引数
   * @param messages メッセージ配列
   * @returns 更新された処理結果
   */
  private static handleNonJsonArguments(
    result: ToolCallResult,
    newArgs: string,
    messages: ChatMessage[]
  ): ToolCallResult {
    // 引数の安全性チェック
    if (!newArgs) {
      return result;
    }
    
    // 新しい結果オブジェクトを作成
    const newResult = { ...result };
    
    if (!newResult.updatedCurrentToolCall) {
      return newResult;
    }
    
    // JSONバッファリングの処理
    if (newArgs.trim().startsWith('{') || newResult.updatedIsBufferingJson) {
      // JSONバッファリングが進行中またはJSON開始文字を検出
      if (!newResult.updatedIsBufferingJson) {
        // バッファリングを開始する場合、開始時間を記録
        this.persistentState.bufferingStartTime = Date.now();
      }
      newResult.updatedIsBufferingJson = true;
      
      // 既存のバッファが有効なJSONを含むか確認
      if (newResult.updatedJsonBuffer && isValidJson(newResult.updatedJsonBuffer)) {
        // 既に有効なJSONがあれば、それを適用して新しいバッファを開始
        try {
          const parsedBuffer = safeJsonParse(newResult.updatedJsonBuffer, {});
          newResult.updatedCurrentToolCall.function.arguments = processSearchToolArguments(
            newResult.updatedCurrentToolCall.function.name,
            newResult.updatedCurrentToolCall.function.arguments || "",
            JSON.stringify(parsedBuffer),
            messages
          );
          
          // 新しいバッファを開始
          newResult.updatedJsonBuffer = newArgs;
        } catch (e) {
          // パースエラーの場合は既存のバッファに追加
          newResult.updatedJsonBuffer = JsonBufferHelpers.addToBuffer(
            newArgs, 
            newResult.updatedJsonBuffer,
            MAX_JSON_BUFFER_SIZE
          );
        }
      } else {
        // 既存のバッファに追加
        newResult.updatedJsonBuffer = JsonBufferHelpers.addToBuffer(
          newArgs, 
          newResult.updatedJsonBuffer || "",
          MAX_JSON_BUFFER_SIZE
        );
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`JSONバッファ更新: ${newResult.updatedJsonBuffer}`);
      }
      
      // 更新されたバッファが有効なJSONになったかチェック
      const validJson = extractValidJson(newResult.updatedJsonBuffer);
      if (validJson) {
        try {
          const parsedJson = safeJsonParse(validJson, null);
          if (parsedJson !== null) {
            if (process.env.NODE_ENV === 'development') {
              console.log(`バッファがJSONとして完成: ${validJson}`);
            }
            
            // パース済みJSONを引数に適用
            const updatedJsonResult = this.applyParsedJsonToArguments(newResult, parsedJson, messages);
            
            // バッファをリセット
            updatedJsonResult.updatedJsonBuffer = "";
            updatedJsonResult.updatedIsBufferingJson = false;
            this.persistentState.bufferingStartTime = undefined;
            
            // 更新をすぐに反映
            updatedJsonResult.shouldYieldMessage = true;
            return updatedJsonResult;
          }
        } catch (e) {
          // まだ不完全なJSONなのでバッファリングを続ける
          console.warn(`JSON解析エラー（バッファリング継続）: ${getErrorMessage(e)}`);
        }
      }
      
      // バッファリングタイムアウトのチェック
      if (this.hasBufferingTimeoutExpired(newResult.updatedIsBufferingJson, 
                                         this.persistentState.bufferingStartTime, 
                                         newResult.updatedJsonBuffer)) {
        console.warn("バッファリングタイムアウトが期限切れ。バッファを修復して適用します。");
        try {
          // バッファを修復して適用
          const repairedJson = repairToolArguments(newResult.updatedJsonBuffer);
          newResult.updatedCurrentToolCall.function.arguments = repairedJson;
          
          // バッファをリセット
          newResult.updatedJsonBuffer = "";
          newResult.updatedIsBufferingJson = false;
          this.persistentState.bufferingStartTime = undefined;
          console.log(`タイムアウトによるJSON修復: ${repairedJson}`);
          
          // 更新をすぐに反映
          newResult.shouldYieldMessage = true;
        } catch (e) {
          console.warn(`JSON修復エラー: ${getErrorMessage(e)}`);
          // 修復に失敗した場合も状態をリセット
          newResult.updatedJsonBuffer = "";
          newResult.updatedIsBufferingJson = false;
          this.persistentState.bufferingStartTime = undefined;
        }
      }
    } else {
      // 非JSONフォーマットの引数の処理
      if (isSearchTool(newResult.updatedCurrentToolCall.function.name)) {
        // 検索ツールの場合は専用メソッドで処理
        newResult.updatedCurrentToolCall.function.arguments = processSearchToolArguments(
          newResult.updatedCurrentToolCall.function.name,
          newResult.updatedCurrentToolCall.function.arguments || "",
          newArgs,
          messages
        );
      } else {
        // その他のツールは単純に連結
        if (newResult.updatedCurrentToolCall.function.arguments) {
          newResult.updatedCurrentToolCall.function.arguments += newArgs;
        } else {
          newResult.updatedCurrentToolCall.function.arguments = newArgs;
        }
      }
      
      // 更新をすぐに反映
      newResult.shouldYieldMessage = true;
    }
    
    return newResult;
  }

  /**
   * 未処理のJSONバッファを最終処理
   * @param jsonBuffer JSONバッファ文字列
   * @param isBufferingJson JSONバッファリング中かどうか
   * @param currentToolCall 現在処理中のツール呼び出し
   * @param messages 元のメッセージ配列
   * @returns 更新されたツール呼び出し
   */
  static finalizeJsonBuffer(
    jsonBuffer: string,
    isBufferingJson: boolean,
    currentToolCall: ToolCall | null,
    messages: ChatMessage[]
  ): ToolCall | null {
    if (!isBufferingJson || !jsonBuffer || !currentToolCall) {
      return currentToolCall;
    }

    console.log(`最終JSONバッファの処理: ${jsonBuffer}`);
    
    try {
      // ツール引数を共通ユーティリティを使用して修復
      const repairedJson = repairToolArguments(jsonBuffer);
      
      // 検索ツールの場合は専用の処理を使用
      if (isSearchTool(currentToolCall.function.name)) {
        currentToolCall.function.arguments = processSearchToolArguments(
          currentToolCall.function.name,
          currentToolCall.function.arguments || "",
          repairedJson,
          messages
        );
      } else {
        // 修復されたJSONが完全であればそのまま使用
        if (isValidJson(repairedJson)) {
          // 既存の引数があればマージを試みる
          if (currentToolCall.function.arguments && currentToolCall.function.arguments.trim() !== "" && currentToolCall.function.arguments.trim() !== "{}") {
            try {
              // 既存引数と新しい引数を両方パースしてマージ
              const existingArgs = safeJsonParse(currentToolCall.function.arguments, {});
              const newArgs = safeJsonParse(repairedJson, {});
              const mergedArgs = { ...existingArgs, ...newArgs };
              currentToolCall.function.arguments = JSON.stringify(mergedArgs);
            } catch (e) {
              // マージに失敗した場合は修復されたJSONを使用
              currentToolCall.function.arguments = repairedJson;
            }
          } else {
            // 既存の引数がない場合は修復されたJSONを使用
            currentToolCall.function.arguments = repairedJson;
          }
        } else {
          // 修復しても有効なJSONにならない場合
          if (currentToolCall.function.arguments) {
            currentToolCall.function.arguments += jsonBuffer; // 既存の引数に追加
          } else {
            currentToolCall.function.arguments = jsonBuffer; // そのまま使用
          }
        }
      }
    } catch (e) {
      console.warn(`最終バッファ処理エラー: ${getErrorMessage(e)}`);
      
      // エラーが発生した場合は元のバッファをそのまま使用
      if (!currentToolCall.function.arguments) {
        currentToolCall.function.arguments = jsonBuffer;
      }
    }

    // バッファリング開始時間をリセット
    this.persistentState.bufferingStartTime = undefined;
    
    // 永続的な状態をリセット
    this.resetPersistentState();

    return currentToolCall;
  }

  /**
   * 検索ツールの引数を確認し、必要に応じてデフォルトのクエリを設定
   * @param toolCalls ツール呼び出し配列
   * @param messages メッセージ配列
   * @returns 更新されたツール呼び出し配列
   */
  static ensureSearchToolArguments(
    toolCalls: ToolCall[],
    messages: ChatMessage[]
  ): ToolCall[] {
    if (!toolCalls || !Array.isArray(toolCalls)) {
      return [];
    }
    
    return toolCalls.map(tool => {
      if (tool && isSearchTool(tool.function.name) && 
          (!tool.function.arguments || tool.function.arguments === "{}")) {
        const queryContext = extractQueryContext(messages);
        tool.function.arguments = JSON.stringify({ query: queryContext });
      }
      return tool;
    });
  }
  
  /**
   * 接続エラー発生時のストリーム状態復元処理
   * @param currentMessage 現在のメッセージ
   * @param toolCalls ツール呼び出し配列
   * @param currentToolCall 現在処理中のツール呼び出し
   * @param currentToolCallIndex 現在のツール呼び出しインデックス
   * @returns 復元された状態
   */
  static handleReconnection(
    currentMessage: ChatMessage,
    toolCalls: ToolCall[],
    currentToolCall: ToolCall | null,
    currentToolCallIndex: number | null
  ): ReconnectionResult {
    // 永続的な状態を取得
    const state = this.getPersistentState();
    
    // 最後の再接続から一定時間（5分以上）経過している場合は状態をリセット
    const stateAge = Date.now() - (state.lastReconnectTimestamp || 0);
    
    if (stateAge > MAX_STATE_AGE_MS) {
      console.log(`状態が古すぎるためリセットします (${Math.round(stateAge / 1000)}秒経過)`);
      this.resetPersistentState();
      
      return {
        restoredMessage: currentMessage,
        restoredToolCalls: toolCalls || [],
        restoredCurrentToolCall: currentToolCall,
        restoredCurrentToolCallIndex: currentToolCallIndex,
        restoredJsonBuffer: "",
        restoredIsBufferingJson: false
      };
    }
    
    // 永続的な状態を適用
    this.updatePersistentState({ lastReconnectTimestamp: Date.now() });
    
    console.log(`接続エラーからの回復処理を実行: JSON(${state.jsonBuffer?.length || 0}バイト), バッファリング(${state.isBufferingJson || false}), ツール呼び出し(${state.toolCallsInProgress?.length || 0}件)`);
    
    return {
      restoredMessage: currentMessage,
      restoredToolCalls: state.toolCallsInProgress && state.toolCallsInProgress.length > 0 ? 
                        [...state.toolCallsInProgress] : 
                        toolCalls || [],
      restoredCurrentToolCall: state.currentToolCallIndex !== null && 
                              state.toolCallsInProgress && 
                              state.toolCallsInProgress.length > state.currentToolCallIndex ? 
                              state.toolCallsInProgress[state.currentToolCallIndex] : 
                              currentToolCall,
      restoredCurrentToolCallIndex: state.currentToolCallIndex !== null ? state.currentToolCallIndex : currentToolCallIndex,
      restoredJsonBuffer: state.jsonBuffer || "",
      restoredIsBufferingJson: state.isBufferingJson || false
    };
  }

  /**
   * ストリーミングレスポンスの処理
   * @param response API応答
   * @param messages 元のメッセージ配列
   * @param retryCount 現在のリトライカウント
   * @param alwaysLogThinking 思考プロセスを常にログ出力するかどうか
   * @returns 処理結果
   */
  static async processStreamingResponse(
    response: Response, 
    messages: ChatMessage[], 
    retryCount: number,
    alwaysLogThinking: boolean = false
  ): Promise<StreamingResponseResult> {
    // 初期状態の設定
    let currentMessage: ChatMessage = { 
      role: "assistant", 
      content: "" 
    };
    
    // 思考モードが有効な場合は初期メッセージを思考モード対応の構造に設定
    if (this.hasThinkingStarted) {
      currentMessage = this.createThinkingModeAssistantMessage(
        "", // 初期テキストは空
        "思考プロセスを開始します...", // 初期思考テキスト
        undefined // 署名なし
      );
    }
    
    let toolCalls: ToolCall[] = [];
    let currentToolCall: ToolCall | null = null;
    let currentToolCallIndex: number | null = null;
    let jsonBuffer = "";
    let isBufferingJson = false;
    let isReconnect = retryCount > 0;
    
    // 処理開始時にカウンターと状態をリセット
    this.stateUpdateCounter = 0;
    this.toolCallUpdateCount = 0;
    this.lastToolCallData = '';
    this.persistentState.identicalUpdateCount = 0;
    
    // 再接続時の状態復元
    if (isReconnect) {
      console.log(`再接続を検出: リトライカウント = ${retryCount}`);
      const reconnectResult = this.handleReconnection(
        currentMessage, toolCalls, currentToolCall, currentToolCallIndex
      );
      
      // 状態を復元
      currentMessage = reconnectResult.restoredMessage;
      toolCalls = reconnectResult.restoredToolCalls;
      currentToolCall = reconnectResult.restoredCurrentToolCall;
      currentToolCallIndex = reconnectResult.restoredCurrentToolCallIndex;
      jsonBuffer = reconnectResult.restoredJsonBuffer;
      isBufferingJson = reconnectResult.restoredIsBufferingJson;
    }
    
    const responseMessages: ChatMessage[] = [];
    let lastYieldedMessageContent = "";
    let chunkCount = 0;
    
    try {
      // SSEストリームを処理
      // 共通ユーティリティのstreamSseを使用してクロスプラットフォーム互換性を確保
      for await (const data of streamSse(response)) {
        try {
          // チャンク数をカウント
          chunkCount++;
          
          // チャンクを処理
          const result = this.processChunk(
            data,
            currentMessage,
            toolCalls,
            currentToolCall,
            currentToolCallIndex,
            jsonBuffer,
            isBufferingJson,
            messages,
            isReconnect
          );
          
          // 結果を更新
          currentMessage = result.updatedMessage;
          toolCalls = result.updatedToolCalls;
          currentToolCall = result.updatedCurrentToolCall;
          currentToolCallIndex = result.updatedCurrentToolCallIndex;
          jsonBuffer = result.updatedJsonBuffer;
          isBufferingJson = result.updatedIsBufferingJson;
          isReconnect = false; // 最初のチャンク処理後は再接続フラグをリセット
          
          // 思考メッセージをyield
          if (result.thinkingMessage) {
            responseMessages.push(result.thinkingMessage);
          }
          
          // メッセージをyield
          if (result.shouldYieldMessage) {
            // extractContentAsStringを使用して現在のメッセージ内容を文字列として取得
            const currentContentAsString = extractContentAsString(currentMessage.content);
            
            if (currentContentAsString !== lastYieldedMessageContent) {
              // 思考モードが有効な場合は、思考モード対応の構造化メッセージを確認
              if (this.hasThinkingStarted) {
                // 現在のメッセージが既に正しい形式かどうかを確認
                if (!Array.isArray(currentMessage.content)) {
                  // もし配列形式でなければ、思考モード対応の構造に変換
                  currentMessage = this.createThinkingModeAssistantMessage(
                    currentContentAsString,
                    this.lastThinkingText || "思考処理を完了しました。",
                    undefined,
                    this.processToolCallsForOutput(toolCalls)
                  );
                }
              }
              
              // 現在のメッセージをコピー
              const messageToYield: ChatMessage = { ...currentMessage };
              
              // ツール呼び出しがある場合は追加
              if (toolCalls && toolCalls.length > 0) {
                // TypeScriptエラー修正: 型アサーションを使用
                (messageToYield as any).toolCalls = this.processToolCallsForOutput(toolCalls);
              }
              
              responseMessages.push(messageToYield);
              lastYieldedMessageContent = currentContentAsString;
            }
          }
          
          // 定期的に永続状態をチェック - 無限ループ防止
          if (chunkCount % 20 === 0) {
            // 安全のためにカウンターをリセット
            this.stateUpdateCounter = 0;
          }
        } catch (err) {
          console.warn(`チャンクの処理中にエラーが発生しました: ${getErrorMessage(err)}`);
          // エラーがあっても処理を継続
        }
      }
      
      // 最終的なJSONバッファを処理
      if (isBufferingJson && jsonBuffer && currentToolCall) {
        const finalizedToolCall = this.finalizeJsonBuffer(
          jsonBuffer,
          isBufferingJson,
          currentToolCall,
          messages
        );
        
        if (finalizedToolCall && currentToolCallIndex !== null) {
          toolCalls[currentToolCallIndex] = finalizedToolCall;
        }
      }
      
      // 最終的な思考テキストバッファを処理
      if (this.thinkingTextBuffer && this.thinkingTextBuffer.length > 0) {
        const finalThinkingMessage = this.flushThinkingBuffer();
        if (finalThinkingMessage) {
          responseMessages.push(finalThinkingMessage);
        }
      }
      
      // 検索ツールの引数を確認
      toolCalls = this.ensureSearchToolArguments(toolCalls, messages);
      
      // 最終結果をyield
      const finalMessageContent = extractContentAsString(currentMessage.content);
      
      // 最終メッセージが既存のメッセージと異なる場合、または思考モードが有効だが最終メッセージが正しい形式でない場合
      if (toolCalls.length > 0 || finalMessageContent !== lastYieldedMessageContent || 
          (this.hasThinkingStarted && !Array.isArray(currentMessage.content))) {
        
        // 思考モードが有効な場合は、思考モード対応の構造化メッセージを作成
        let finalMessage: ChatMessage;
        
        if (this.hasThinkingStarted) {
          finalMessage = this.createThinkingModeAssistantMessage(
            finalMessageContent,
            this.lastThinkingText || "思考処理を完了しました。",
            undefined,
            this.processToolCallsForOutput(toolCalls)
          );
        } else {
          // 通常のメッセージを作成
          finalMessage = {
            role: "assistant",
            content: finalMessageContent
          };
          
          // TypeScriptエラー修正: 型アサーションを使用
          if (toolCalls.length > 0) {
            (finalMessage as any).toolCalls = this.processToolCallsForOutput(toolCalls);
          }
        }
        
        responseMessages.push(finalMessage);
      }
      
      // 永続的な状態をリセット
      this.resetPersistentState();
      
      return { success: true, messages: responseMessages };
    } catch (error) {
      // エラーが発生した場合は状態を保持して返す
      console.error(`ストリーミング処理エラー: ${getErrorMessage(error)}`);
      
      if (isConnectionError(error)) {
        console.log("接続エラーを検出しました - 再接続時に状態を復元します");
        
        // 状態を更新
        this.updatePersistentState({
          jsonBuffer,
          isBufferingJson,
          toolCallsInProgress: toolCalls,
          currentToolCallIndex,
          lastReconnectTimestamp: Date.now()
        });
      } else {
        // 接続エラー以外の場合は状態をリセット
        this.resetPersistentState();
      }
      
      return { 
        success: false, 
        messages: [], 
        error: error instanceof Error ? error : new Error(getErrorMessage(error)),
        state: {
          message: currentMessage,
          toolCalls,
          currentToolCall,
          currentToolCallIndex,
          jsonBuffer,
          isBufferingJson
        }
      };
    }
  }
}