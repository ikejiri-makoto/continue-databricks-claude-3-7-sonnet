import { ChatMessage, ThinkingChatMessage, ToolCallDelta as CoreToolCallDelta } from "../../../index.js";
import { DatabricksHelpers } from "./helpers.js";
import { 
  ThinkingChunk, 
  StreamingChunk, 
  ResponseDelta, 
  ToolCall, 
  PersistentStreamState, 
  ToolCallDelta,
  ToolCallResult,
  ReconnectionResult,
  StreamingResponseResult
} from "./types/types.js";
import "./types/extension.d.ts";

// 共通ユーティリティのインポート
import { getErrorMessage, isConnectionError } from "../../utils/errors.js";
import { 
  safeStringify, 
  isValidJson, 
  safeJsonParse, 
  extractValidJson, 
  processJsonDelta, 
  processToolArgumentsDelta, 
  repairDuplicatedJsonPattern,
  tryFixBrokenBooleanJson
} from "../../utils/json.js";
import { repairToolArguments } from "../../utils/toolUtils.js";
import { extractQueryContext, extractContentAsString } from "../../utils/messageUtils.js";
import { processContentDelta, JsonBufferHelpers } from "../../utils/streamProcessing.js";
import { isSearchTool, processSearchToolArguments } from "../../utils/toolUtils.js";
import { streamSse } from "../../stream.js";

// 独自モジュールをインポート
import { ToolCallProcessor } from "./toolcalls.js";

// 定数
const MAX_STATE_AGE_MS = 5 * 60 * 1000; // 5分
const THINKING_LOG_INTERVAL = 10; // 10チャンクごとにログ出力
const BUFFER_SIZE_THRESHOLD = 100; // 100文字以上でバッファ出力
const MAX_JSON_BUFFER_SIZE = 10000; // 最大JSONバッファサイズ
const MAX_LOOP_DETECTION_COUNT = 10; // 無限ループ検出のためのカウンター閾値
const MIN_UPDATE_INTERVAL_MS = 100; // 最小更新間隔（ミリ秒）

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
    lastReconnectTimestamp: 0
  };
  
  // 状態更新のループ検出用カウンター
  private static stateUpdateCounter = 0;
  private static lastStateUpdateTime = 0;

  /**
   * contentがオブジェクト型かどうかを判定する型ガード関数
   * @param content 判定する対象
   * @returns オブジェクト型であればtrue、そうでなければfalse
   */
  private static isContentObject(content: any): content is { summary?: { text?: string } } {
    return typeof content === 'object' && content !== null;
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
      lastReconnectTimestamp: 0
    };
    this.stateUpdateCounter = 0;
    this.lastStateUpdateTime = 0;
    console.log("永続的ストリーム状態をリセットしました");
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
    if (process.env.NODE_ENV === 'development') {
      console.log(`処理チャンク: ${safeStringify(chunk, "<不明なチャンク>")}`);
    }
    
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

    // 思考モード処理 - choices[0].delta.content.summary.text形式を優先的に処理

    // ===== 優先順位1: choices[0].delta.content.summary.text形式（最も一般的な形式） =====
    if (chunk.choices && 
        Array.isArray(chunk.choices) && 
        chunk.choices.length > 0 && 
        chunk.choices[0]?.delta?.content) {
      
      const content = chunk.choices[0].delta.content;
      
      // オブジェクト型かつsummaryプロパティがある場合
      if (this.isContentObject(content) && 
          content.summary && 
          typeof content.summary === 'object' && 
          content.summary.text) {
        
        // 思考メッセージを作成
        const thinkingMessage: ThinkingChatMessage = {
          role: "thinking",
          content: content.summary.text,
          signature: chunk.choices[0].delta.signature || undefined
        };
        
        result.thinkingMessage = thinkingMessage;
        return result;
      }
    }
    
    // ===== 優先順位2: thinking直接形式 =====
    if (chunk.thinking !== undefined) {
      try {
        let thinkingText = "";
        
        // 思考データがオブジェクトの場合
        if (typeof chunk.thinking === 'object' && chunk.thinking !== null) {
          // textプロパティがあればそれを使用
          if (typeof (chunk.thinking as any).text === 'string') {
            thinkingText = (chunk.thinking as any).text;
          } 
          // summaryプロパティ内のテキストを検索
          else if (typeof (chunk.thinking as any).summary === 'object' && 
                  (chunk.thinking as any).summary !== null && 
                  typeof (chunk.thinking as any).summary.text === 'string') {
            thinkingText = (chunk.thinking as any).summary.text;
          }
          // その他の場合はfindTextPropertyを使用して再帰的に探索
          else {
            thinkingText = this.findTextProperty(chunk.thinking) || "[思考中...]";
          }
        } 
        // 思考データが文字列の場合
        else if (typeof chunk.thinking === 'string') {
          thinkingText = chunk.thinking;
        }
        
        // 思考メッセージを構築
        const thinkingMessage: ThinkingChatMessage = {
          role: "thinking",
          content: thinkingText || "[思考中...]",
          signature: typeof chunk.signature === 'string' ? chunk.signature : undefined
        };
        
        result.thinkingMessage = thinkingMessage;
        return result;
      } catch (error) {
        console.warn(`思考データの処理中にエラー: ${getErrorMessage(error)}`);
        // エラーが発生しても処理を続行
      }
    }
    
    // ===== 優先順位3: reasoning形式（Databricks特有） =====
    if (chunk.choices?.[0]?.delta?.reasoning) {
      try {
        const reasoningData = chunk.choices[0].delta.reasoning;
        let thinkingText = "";
        
        // テキストプロパティを探す
        if (typeof reasoningData === 'object' && reasoningData !== null) {
          if (typeof reasoningData.text === 'string') {
            thinkingText = reasoningData.text;
          } else if (reasoningData.summary?.text && typeof reasoningData.summary.text === 'string') {
            thinkingText = reasoningData.summary.text;
          } else {
            // オブジェクト内のテキストプロパティを再帰的に探す
            thinkingText = this.findTextProperty(reasoningData) || "[思考中...]";
          }
        } else if (typeof reasoningData === 'string') {
          thinkingText = reasoningData;
        }
        
        // 思考メッセージを作成
        const thinkingMessage: ThinkingChatMessage = {
          role: "thinking",
          content: thinkingText,
          signature: typeof reasoningData === 'object' && reasoningData !== null ? 
                    reasoningData.signature || undefined : 
                    undefined
        };
        
        result.thinkingMessage = thinkingMessage;
        return result;
      } catch (error) {
        console.warn(`reasoning形式の思考データ処理エラー: ${getErrorMessage(error)}`);
        // エラーが発生しても処理を続行
      }
    }
    
    // ===== 優先順位4: その他の思考データ形式 =====
    // いずれの形式にも当てはまらない場合は、思考チャンクとして処理を試みる
    if ((chunk.choices && Array.isArray(chunk.choices)) || 
        chunk.content || 
        chunk.summary) {
      try {
        const thinkingMessage = this.processThinkingChunk(chunk);
        
        // 内容があれば処理結果に設定
        if (thinkingMessage && 
            thinkingMessage.content && 
            extractContentAsString(thinkingMessage.content) !== "[思考中...]") {
          result.thinkingMessage = thinkingMessage;
          return result;
        }
      } catch (e) {
        // エラーが発生した場合は無視して次の処理に進む
        if (process.env.NODE_ENV === 'development') {
          console.warn(`思考データ処理中にエラー: ${getErrorMessage(e)}`);
        }
      }
    }

    // 通常のメッセージコンテンツの処理（思考モードではない場合）
    if (chunk.choices?.[0]?.delta?.content && 
        typeof chunk.choices[0].delta.content === 'string') {
      
      // コンテンツデルタを処理
      const newContent = chunk.choices[0].delta.content;
      
      // バッファリングされたコンテンツを処理
      const { updatedMessage, shouldYield } = this.processBufferedContent(
        newContent,
        currentMessage,
        this.persistentState.contentBuffer || ""
      );
      
      result.updatedMessage = updatedMessage;
      result.shouldYieldMessage = shouldYield;
      
      // 状態を更新
      if (shouldYield) {
        // バッファをリセット
        this.updatePersistentState({
          contentBuffer: ""
        });
      } else {
        this.updatePersistentState({
          contentBuffer: (this.persistentState.contentBuffer || "") + newContent
        });
      }
      
      return result;
    }

    // ツールコールの処理
    if (chunk.choices?.[0]?.delta?.tool_calls && chunk.choices[0].delta.tool_calls.length > 0) {
      try {
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
        
        // 永続的な状態を更新
        this.updatePersistentState({
          jsonBuffer: processResult.updatedJsonBuffer,
          isBufferingJson: processResult.updatedIsBufferingJson,
          toolCallsInProgress: processResult.updatedToolCalls,
          currentToolCallIndex: processResult.updatedCurrentToolCallIndex
        });
      } catch (error) {
        console.error(`ツール呼び出し処理中にエラーが発生しました: ${getErrorMessage(error)}`);
        // エラーが発生しても処理を継続（結果はそのまま返す）
      }
      
      return result;
    }

    return result;
  }

  /**
   * バッファリングされたコンテンツを処理して完全な文や段落を返す
   * @param newContent 新しいコンテンツ
   * @param currentMessage 現在のメッセージ
   * @param contentBuffer 現在のコンテンツバッファ
   * @returns 処理結果
   */
  private static processBufferedContent(
    newContent: string,
    currentMessage: ChatMessage,
    contentBuffer: string
  ): { updatedMessage: ChatMessage; shouldYield: boolean } {
    // 引数の安全性チェック
    const safeNewContent = newContent || "";
    const safeContentBuffer = contentBuffer || "";
    const combinedContent = safeContentBuffer + safeNewContent;
    
    // 空のバッファの場合は早期リターン
    if (!combinedContent) {
      return {
        updatedMessage: currentMessage,
        shouldYield: false
      };
    }
    
    // 文や段落の区切りを検出
    const isSentenceOrParagraphEnd = this.isTextBlockEnd(combinedContent);
    
    // バッファが特定のサイズを超えた場合も表示する
    const exceedsBufferThreshold = combinedContent.length >= BUFFER_SIZE_THRESHOLD;
    
    // 表示するべきか判定
    const shouldActuallyYield = isSentenceOrParagraphEnd || exceedsBufferThreshold;
    
    // 現在のメッセージのコンテンツを更新
    // extractContentAsStringを使用して安全に処理
    const currentContent = extractContentAsString(currentMessage.content);
    
    // 既存のコンテンツにバッファの内容を追加（必要に応じて）
    const updatedContent = shouldActuallyYield ? 
      currentContent + combinedContent : 
      currentContent;
    
    return {
      updatedMessage: {
        ...currentMessage,
        content: updatedContent
      },
      shouldYield: shouldActuallyYield
    };
  }

  /**
   * テキストブロックの終了かどうかを判定
   * @param text テキスト
   * @returns テキストブロックの終了かどうか
   */
  private static isTextBlockEnd(text: string): boolean {
    if (!text) return false;
    
    return (
      text.endsWith(".") || 
      text.endsWith("。") || 
      text.endsWith("!") || 
      text.endsWith("！") || 
      text.endsWith("?") || 
      text.endsWith("？") || 
      text.endsWith("\n") ||
      // 2行以上の改行がある場合は段落区切りとして扱う
      text.includes("\n\n")
    );
  }

  /**
  * 思考チャンクを処理
  * Claude 3.7 Sonnetの思考モードの応答を処理する
  * choices[0].delta.content.summary.textを最優先に処理する
  * @param thinkingData 思考データ
  * @returns 処理された思考メッセージ
  */
  private static processThinkingChunk(thinkingData: ThinkingChunk): ChatMessage {
    // 思考内容を適切にシリアライズ
    let newThinking = "";
    let signature: string | undefined = undefined;
    
    try {
      // ***** 最優先形式: choices[0].delta.content.summary.text *****
      if (thinkingData.choices && 
          Array.isArray(thinkingData.choices) && 
          thinkingData.choices.length > 0 && 
          thinkingData.choices[0]?.delta?.content?.summary?.text) {
        
        newThinking = thinkingData.choices[0].delta.content.summary.text;
        
        if (process.env.NODE_ENV === 'development') {
          console.log('最優先形式(choices.delta.content.summary.text)を検出しました');
        }
      }
      // ***** 次優先形式: content.summary.text *****
      else if (thinkingData.content?.summary?.text) {
        newThinking = thinkingData.content.summary.text;
        
        if (process.env.NODE_ENV === 'development') {
          console.log('content.summary.text形式を検出しました');
        }
      }
      // ***** 次優先形式: summary.text *****
      else if (thinkingData.summary?.text) {
        newThinking = thinkingData.summary.text;
        
        if (process.env.NODE_ENV === 'development') {
          console.log('summary.text形式を検出しました');
        }
      }
      // ***** 次優先形式: reasoning(.summary.text) *****
      else if (typeof thinkingData === 'object' && 
               thinkingData !== null && 
               'reasoning' in thinkingData) {
        
        const reasoningData = thinkingData.reasoning;
        
        if (typeof reasoningData === 'object' && reasoningData !== null) {
          if (reasoningData.text) {
            newThinking = reasoningData.text;
          } else if (reasoningData.summary?.text) {
            newThinking = reasoningData.summary.text;
          } else {
            // その他のプロパティを探索
            newThinking = this.findTextProperty(reasoningData) || "[思考中...]";
          }
        } else if (typeof reasoningData === 'string') {
          newThinking = reasoningData;
        }
        
        if (process.env.NODE_ENV === 'development') {
          console.log('reasoning形式を検出しました');
        }
      }
      // ***** 直接thinkingプロパティがある場合 *****
      else if (thinkingData.thinking) {
        if (typeof thinkingData.thinking === 'string') {
          newThinking = thinkingData.thinking;
        } else if (typeof thinkingData.thinking === 'object' && thinkingData.thinking !== null) {
          // オブジェクトからテキストを抽出
          newThinking = this.findTextProperty(thinkingData.thinking) || "[思考中...]";
        }
        
        if (process.env.NODE_ENV === 'development') {
          console.log('thinking直接形式を検出しました');
        }
      }
      // ***** 最終手段: オブジェクト全体を再帰的に探索 *****
      else {
        const textProperty = this.findTextProperty(thinkingData);
        if (textProperty) {
          newThinking = textProperty;
          
          if (process.env.NODE_ENV === 'development') {
            console.log('テキストプロパティを再帰的に抽出しました');
          }
        } else {
          newThinking = "[思考中...]";
          
          if (process.env.NODE_ENV === 'development') {
            console.log(`未知の形式: ${safeStringify(thinkingData, "<不明な形式>")}`);
          }
        }
      }
      
      // 署名情報の取得
      if (typeof thinkingData.signature === 'string') {
        signature = thinkingData.signature;
      } else if (thinkingData.choices?.[0]?.delta?.signature && 
                typeof thinkingData.choices[0].delta.signature === 'string') {
        signature = thinkingData.choices[0].delta.signature;
      }
      
    } catch (error) {
      // エラーログ
      console.error(`思考チャンクの処理中にエラー: ${getErrorMessage(error)}`);
      
      if (process.env.NODE_ENV === 'development') {
        console.error(`チャンクデータ: ${safeStringify(thinkingData, "<データエラー>")}`);
      }
      
      newThinking = "[思考データを処理中...]";
    }
    
    // 思考メッセージを構築して返す
    const thinkingMessage: ThinkingChatMessage = {
      role: "thinking",
      content: newThinking,
      signature: signature
    };
    
    // 思考プロセスをログ出力
    this.logThinkingProcess(thinkingMessage);
    
    return thinkingMessage;
  }
  
  /**
   * 思考データから有用なテキストプロパティを探す再帰的関数
   * [object Object]を避けてテキストを探索する
   * @param obj 探索対象のオブジェクト
   * @param depth 現在の再帰深度（無限ループ防止用）
   * @returns 見つかったテキストプロパティまたはnull
   */
  private static findTextProperty(obj: any, depth: number = 0): string | null {
    // 無限ループや過度に深い再帰を防止
    if (depth > 5) {
      return null;
    }
    
    // nullまたはundefinedの場合
    if (obj === null || obj === undefined) {
      return null;
    }
    
    // 文字列の場合は直接返す
    if (typeof obj === 'string') {
      return obj;
    }
    
    // オブジェクトの場合は再帰的に処理
    if (typeof obj === 'object') {
      // ===== 優先パターン1: choices[0].delta.content.summary.text形式 =====
      if (obj.choices && 
          Array.isArray(obj.choices) && 
          obj.choices.length > 0 && 
          obj.choices[0]?.delta?.content?.summary?.text) {
        return obj.choices[0].delta.content.summary.text;
      }
      
      // ===== 優先パターン2: content.summary.text形式 =====
      if (obj.content?.summary?.text) {
        return obj.content.summary.text;
      }
      
      // ===== 優先パターン3: summary.text形式 =====
      if (obj.summary?.text) {
        return obj.summary.text;
      }
      
      // ===== 優先パターン4: text直接形式 =====
      if (obj.text && typeof obj.text === 'string') {
        return obj.text;
      }
      
      // ===== 優先パターン5: reasoning形式 =====
      if (obj.reasoning) {
        if (typeof obj.reasoning === 'string') {
          return obj.reasoning;
        } else if (typeof obj.reasoning === 'object' && obj.reasoning !== null) {
          if (obj.reasoning.text) {
            return obj.reasoning.text;
          } else if (obj.reasoning.summary?.text) {
            return obj.reasoning.summary.text;
          }
          
          // reasoning内を再帰的に探索
          const reasoningText = this.findTextProperty(obj.reasoning, depth + 1);
          if (reasoningText) {
            return reasoningText;
          }
        }
      }
      
      // ===== 優先パターン6: thinking形式 =====
      if (obj.thinking) {
        if (typeof obj.thinking === 'string') {
          return obj.thinking;
        } else if (typeof obj.thinking === 'object' && obj.thinking !== null) {
          // thinking内を再帰的に探索
          const thinkingText = this.findTextProperty(obj.thinking, depth + 1);
          if (thinkingText) {
            return thinkingText;
          }
        }
      }
      
      // 優先的に探すプロパティ名
      const priorityProps = [
        'text', 'content', 'summary', 'thinking', 'reasoning',
        'delta', 'choices', 'message', 'value'
      ];
      
      // 優先プロパティを先に確認
      for (const prop of priorityProps) {
        if (obj[prop] !== undefined) {
          const result = this.findTextProperty(obj[prop], depth + 1);
          if (result) {
            return result;
          }
        }
      }
      
      // 配列の場合は各要素を確認
      if (Array.isArray(obj)) {
        for (const item of obj) {
          const result = this.findTextProperty(item, depth + 1);
          if (result) {
            return result;
          }
        }
      }
      
      // その他のすべてのプロパティを確認
      for (const key in obj) {
        // 既にチェック済みのプロパティはスキップ
        if (priorityProps.includes(key)) {
          continue;
        }
        
        const result = this.findTextProperty(obj[key], depth + 1);
        if (result) {
          return result;
        }
      }
    }
    
    return null;
  }

  /**
   * 思考プロセスのログ出力
   * @param thinkingMessage 思考メッセージ
   */
  private static logThinkingProcess(thinkingMessage: ThinkingChatMessage): void {
    // 思考メッセージのnullチェック
    if (!thinkingMessage) {
      return;
    }
    
    try {
      // extractContentAsStringを使用して安全にコンテンツを抽出
      const contentAsString = extractContentAsString(thinkingMessage.content);
      
      // 空のコンテンツチェック
      if (!contentAsString) {
        console.log('[思考プロセス] データがありません');
        return;
      }
      
      // 長い思考プロセスは省略して表示
      const truncatedThinking = contentAsString.length > 200 
        ? contentAsString.substring(0, 200) + '...' 
        : contentAsString;
      
      // シンプルにテキストとしてログ出力 - [object Object]を防止
      console.log('[思考プロセス]', truncatedThinking);
      
      // 署名情報はデバッグモードでのみ表示
      if (thinkingMessage.signature && process.env.NODE_ENV === 'development') {
        // 署名情報を文字列として安全に表示
        const signatureString = typeof thinkingMessage.signature === 'string' 
          ? thinkingMessage.signature.substring(0, 50) + (thinkingMessage.signature.length > 50 ? '...' : '')
          : '';
        
        if (signatureString) {
          console.log('[思考署名]', signatureString);
        }
      }
    } catch (error) {
      // ログ出力中のエラーはスキップして機能を継続
      console.log('[思考プロセス] データを処理中...');
    }
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
    
    // 新しいツール呼び出しの開始または別のインデックスへの切り替え
    if (result.updatedCurrentToolCallIndex !== index) {
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
    if (toolCallDelta.function?.arguments && result.updatedCurrentToolCall) {
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
                
                // ツール呼び出しを持つメッセージをyield
                result.shouldYieldMessage = true;
                return result;
              }
              
              // まだJSONが完成していない場合はバッファリングを継続
              result.updatedIsBufferingJson = true;
              return result;
            } catch (jsonError) {
              // JSONデルタ処理エラーの詳細をログ
              console.warn(`JSONデルタ処理エラー: ${getErrorMessage(jsonError)}`);
              console.warn(`現在のバッファ: ${result.updatedJsonBuffer}`);
              console.warn(`受信したデルタ: ${toolCallDelta.function.arguments}`);
              
              // 従来のアプローチを試す
              result.updatedJsonBuffer += toolCallDelta.function.arguments;
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
            
            return updatedJsonResult;
          }
        } catch (e) {
          // まだ不完全なJSONなのでバッファリングを続ける
          console.warn(`JSON解析エラー（バッファリング継続）: ${getErrorMessage(e)}`);
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
    let currentMessage: ChatMessage = { role: "assistant", content: "" };
    let toolCalls: ToolCall[] = [];
    let currentToolCall: ToolCall | null = null;
    let currentToolCallIndex: number | null = null;
    let jsonBuffer = "";
    let isBufferingJson = false;
    let isReconnect = retryCount > 0;
    
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
      // ストリーム処理開始時に状態カウンターをリセット
      this.stateUpdateCounter = 0;
      
      // SSEストリームを処理
      // 共通ユーティリティのstreamSseを使用してクロスプラットフォーム互換性を確保
      for await (const data of streamSse(response)) {
        try {
          // チャンク数をカウント
          chunkCount++;
          
          // 開発モード時のデバッグログ
          if (process.env.NODE_ENV === 'development') {
            try {
              // 思考チャンクの場合は特別な形式でログ出力
              if (data.thinking) {
                // thinking直接形式は使用せず、常にsummary.text形式として処理
                console.log(`処理チャンク(thinking): ${safeStringify({
                  type: 'thinking',
                  has_thinking: !!data.thinking,
                  has_signature: !!data.signature,
                  has_delta: !!data.delta,
                  has_choices: !!data.choices,
                }, "<不明なチャンク>")}`);
              } else if (data.choices?.[0]?.delta?.content) {
                if (typeof data.choices[0].delta.content === 'string') {
                  // 通常のコンテンツチャンク
                  console.log(`処理チャンク(content): ${safeStringify({
                    content_length: data.choices[0].delta.content.length,
                    content_snippet: data.choices[0].delta.content.substring(0, 50)
                  }, "<不明なチャンク>")}`);
                } else {
                  // 思考モードのコンテンツチャンク - summary.textフォーマットに注目
                  console.log(`処理チャンク(thinking_content): ${safeStringify({
                    has_summary: this.isContentObject(data.choices[0].delta.content) && !!data.choices[0].delta.content.summary,
                    summary_text: this.isContentObject(data.choices[0].delta.content) && 
                                data.choices[0].delta.content.summary?.text?.substring(0, 50)
                  }, "<不明なチャンク>")}`);
                }
              } else if (data.choices?.[0]?.delta?.tool_calls) {
                // ツール呼び出しチャンク
                console.log(`処理チャンク(tool_calls): ${safeStringify({
                  tool_calls_count: data.choices[0].delta.tool_calls.length,
                  first_tool: data.choices[0].delta.tool_calls[0]?.function?.name || '<名前なし>'
                }, "<不明なチャンク>")}`);
              } else {
                // その他のチャンク
                console.log(`処理チャンク: ${safeStringify(data, "<不明なチャンク>")}`);
              }
            } catch (e) {
              // ログ出力中のエラーは無視
              console.warn(`チャンクログ出力中にエラー: ${getErrorMessage(e)}`);
              // エラーが発生しても基本情報だけを出力
              console.log(`処理チャンク(基本情報のみ): ${Object.keys(data).join(', ')}`);
            }
          }
          
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
              // ツール呼び出し情報を含む新しいメッセージをyield
              const messageToYield: ChatMessage = {
                role: "assistant",
                content: currentMessage.content,
                toolCalls: this.processToolCallsForOutput(toolCalls)
              };
              
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
      
      // 検索ツールの引数を確認
      toolCalls = this.ensureSearchToolArguments(toolCalls, messages);
      
      // 最終結果をyield
      const finalMessageContent = extractContentAsString(currentMessage.content);
      if (toolCalls.length > 0 || finalMessageContent !== lastYieldedMessageContent) {
        const finalMessage: ChatMessage = {
          role: "assistant",
          content: currentMessage.content,
          toolCalls: this.processToolCallsForOutput(toolCalls)
        };
        
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