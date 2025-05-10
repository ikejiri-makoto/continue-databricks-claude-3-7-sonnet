import { ChatMessage, ThinkingChatMessage } from "../../../index.js";
import { ThinkingChunk, StreamingChunk, ResponseDelta, ToolCall, PersistentStreamState } from "./types/types.js";
import "./types/extension.d.ts";

// 共通ユーティリティのインポート
import { getErrorMessage, isConnectionError } from "../../utils/errors.js";
import { 
  safeStringify, 
  isValidJson, 
  safeJsonParse, 
  extractValidJson, 
  processJsonDelta,
  repairDuplicatedJsonPattern 
} from "../../utils/json.js";
import { extractQueryContext } from "../../utils/messageUtils.js";
import { processContentDelta, JsonBufferHelpers } from "../../utils/streamProcessing.js";
import { processSSEStream } from "../../utils/sseProcessing.js";
import { isSearchTool, processSearchToolArguments } from "../../utils/toolUtils.js";

// 独自モジュールをインポート
import { ToolCallProcessor } from "./toolcalls.js";
import { DatabricksHelpers } from "./helpers.js";
import { DatabricksErrorHandler } from "./errors.js";

// 定数
const MAX_STATE_AGE_MS = 5 * 60 * 1000; // 5分
const THINKING_LOG_INTERVAL = 10; // 10チャンクごとにログ出力
const BUFFER_SIZE_THRESHOLD = 100; // 100文字以上でバッファ出力
const MAX_JSON_BUFFER_SIZE = 10000; // 最大JSONバッファサイズ

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
  // ストリーミング状態を保持する静的変数
  private static persistentState: PersistentStreamState = {
    jsonBuffer: "",
    isBufferingJson: false,
    toolCallsInProgress: [],
    currentToolCallIndex: null,
    contentBuffer: "",
    lastReconnectTimestamp: 0
  };

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
    this.persistentState = {
      ...this.persistentState,
      ...newState,
      lastReconnectTimestamp: newState.lastReconnectTimestamp || Date.now()
    };
    console.log(`永続的ストリーム状態を更新しました: JSON(${this.persistentState.jsonBuffer.length}バイト), バッファリング(${this.persistentState.isBufferingJson}), ツール呼び出し(${this.persistentState.toolCallsInProgress.length}件)`);
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
    console.log("永続的ストリーム状態をリセットしました");
  }

  /**
   * ストリーミングレスポンスを処理
   * @param response HTTPレスポンス
   * @param messages 元のメッセージ配列
   * @param retryCount 現在のリトライ回数
   * @param alwaysLogThinking 思考プロセスを常にログに表示するかどうか
   * @returns 処理結果オブジェクト
   */
  static async processStreamingResponse(
    response: Response,
    messages: ChatMessage[],
    retryCount: number,
    alwaysLogThinking: boolean
  ): Promise<{
    success: boolean;
    messages: ChatMessage[];
    error?: Error;
    state?: any;
  }> {
    // ストリーミングレスポンスの処理
    let currentMessage: ChatMessage = { role: "assistant", content: "" };
    let toolCalls: ToolCall[] = [];
    let currentToolCall: ToolCall | null = null;
    let currentToolCallIndex: number | null = null;
    let thinkingChunkCount = 0;

    // JSONフラグメントのバッファリングのための変数
    let jsonBuffer: string = "";
    let isBufferingJson: boolean = false;
    
    // 返却するメッセージのコレクション
    const responseMessages: ChatMessage[] = [];

    console.log("------------- 応答処理開始 -------------");

    try {
      // 再接続フラグ - リトライ時にtrueに設定
      const isReconnect = retryCount > 0;

      // 再接続時に状態を復元
      if (isReconnect) {
        const recoveredState = this.handleReconnection(
          currentMessage,
          toolCalls,
          currentToolCall,
          currentToolCallIndex
        );
        
        // 復元された状態を適用
        currentMessage = recoveredState.restoredMessage;
        toolCalls = recoveredState.restoredToolCalls;
        currentToolCall = recoveredState.restoredCurrentToolCall;
        currentToolCallIndex = recoveredState.restoredCurrentToolCallIndex;
        jsonBuffer = recoveredState.restoredJsonBuffer;
        isBufferingJson = recoveredState.restoredIsBufferingJson;
      }

      // 共通のSSEストリーム処理ユーティリティを使用
      for await (const chunk of processSSEStream(response)) {
        // 受信したチャンクのデバッグ
        console.log(`Received chunk type: ${Object.keys(chunk).join(", ")}`);
        
        // ストリーミングチャンクを処理
        const processResult = this.processChunk(
          chunk,
          currentMessage,
          toolCalls,
          currentToolCall,
          currentToolCallIndex,
          jsonBuffer,
          isBufferingJson,
          messages,
          isReconnect // 再接続フラグを追加
        );
        
        // 処理結果を適用
        currentMessage = processResult.updatedMessage;
        toolCalls = processResult.updatedToolCalls;
        currentToolCall = processResult.updatedCurrentToolCall;
        currentToolCallIndex = processResult.updatedCurrentToolCallIndex;
        jsonBuffer = processResult.updatedJsonBuffer;
        isBufferingJson = processResult.updatedIsBufferingJson;
        
        // 思考メッセージがある場合
        if (processResult.thinkingMessage) {
          thinkingChunkCount++;
          
          //思考プロセスのログ出力 - alwaysLogThinkingフラグに基づいて制御
          if (alwaysLogThinking || process.env.NODE_ENV === 'development') {
            if (thinkingChunkCount % THINKING_LOG_INTERVAL === 0) {
              console.log(`\n===== 思考チャンク #${thinkingChunkCount} =====`);
              console.log(processResult.thinkingMessage.content.toString().substring(0, 100) + "...");
            }
          }
          
          responseMessages.push(processResult.thinkingMessage);
          continue;
        }
        
        // 通常のメッセージまたはツール呼び出しメッセージの場合
        if (processResult.shouldYieldMessage) {
          // ツール呼び出しがある場合、ツール呼び出しを含むメッセージをyield
          if (toolCalls.filter(Boolean).length > 0) {
            const msgWithTools: ChatMessage & {toolCalls?: ToolCall[]} = {
              role: "assistant",
              content: currentMessage.content,
              toolCalls: toolCalls.filter(Boolean)
            };
            
            responseMessages.push(msgWithTools);
          } else {
            // 通常のメッセージをyield
            responseMessages.push({ ...currentMessage });
          }
        }
      }

      // 正常に処理が完了したらループを終了
      console.log("ストリーミング処理が正常に完了しました。");
      
      // 処理完了時に永続的なストリーム状態をリセット
      this.resetPersistentState();

      // 未処理のJSONバッファとツール呼び出しの最終処理
      this.finalizeStreamingProcessing(
        jsonBuffer, 
        isBufferingJson, 
        currentToolCall, 
        currentToolCallIndex, 
        toolCalls, 
        messages
      );

      // 処理統計を出力
      if (thinkingChunkCount > 0 && (alwaysLogThinking || process.env.NODE_ENV === 'development')) {
        console.log(`\n===== 思考モード処理完了 =====`);
        console.log(`合計思考チャンク数: ${thinkingChunkCount}`);
      }

      console.log(`\n===== 応答処理完了 =====`);

      // 最終的なメッセージを返す
      const finalToolCalls = toolCalls.filter(Boolean);
      if (currentMessage.content || finalToolCalls.length > 0) {
        // 標準的なChatMessageを使いながら、toolCallsプロパティを追加
        const chatMsg: ChatMessage & {toolCalls?: ToolCall[]} = {
          role: "assistant",
          content: currentMessage.content
        };
        
        // ツール呼び出しがある場合は追加プロパティとして設定
        if (finalToolCalls.length > 0) {
          chatMsg.toolCalls = finalToolCalls;
        }
        
        responseMessages.push(chatMsg);
      }
      
      return { success: true, messages: responseMessages };
      
    } catch (streamError: unknown) {
      // エラーの詳細をログに記録
      const errorMessage = getErrorMessage(streamError);
      console.error(`Error processing streaming response: ${errorMessage}`);
      
      // エラー処理をエラーハンドラモジュールに委譲
      // 接続エラーの場合は状態を保持
      if (isConnectionError(streamError) || 
          (streamError instanceof DOMException && streamError.name === 'AbortError')) {
        
        // 状態を永続化して次回のリトライに備える
        this.updatePersistentState({
          jsonBuffer,
          isBufferingJson,
          toolCallsInProgress: toolCalls,
          currentToolCallIndex,
          lastReconnectTimestamp: Date.now()
        });
        
        return { 
          success: false, 
          messages: [], 
          error: streamError instanceof Error ? streamError : new Error(errorMessage),
          state: {
            jsonBuffer,
            isBufferingJson,
            toolCalls,
            currentToolCallIndex
          }
        };
      }
      
      // その他のエラーはそのまま投げる
      return { 
        success: false, 
        messages: [], 
        error: streamError instanceof Error ? streamError : new Error(errorMessage)
      };
    }
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
    // 再接続時は永続的な状態を適用
    if (isReconnect) {
      const state = this.getPersistentState();
      jsonBuffer = state.jsonBuffer || jsonBuffer;
      isBufferingJson = state.isBufferingJson || isBufferingJson;
      
      // ツール呼び出しの状態を復元（存在する場合のみ）
      if (state.toolCallsInProgress.length > 0) {
        toolCalls = [...state.toolCallsInProgress];
        
        if (state.currentToolCallIndex !== null && 
            toolCalls.length > state.currentToolCallIndex) {
          currentToolCall = toolCalls[state.currentToolCallIndex];
          currentToolCallIndex = state.currentToolCallIndex;
        }
      }
      
      console.log(`再接続処理: JSON(${jsonBuffer.length}バイト), バッファリング(${isBufferingJson}), ツール呼び出し(${toolCalls.length}件)`);
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

    try {
      // thinking（思考）モードの処理
      if (chunk.thinking) {
        const thinkingChunk = this.processThinkingChunk(chunk.thinking);
        result.thinkingMessage = thinkingChunk;
        return result;
      }

      // メッセージコンテンツの処理
      if (chunk.choices?.[0]?.delta?.content) {
        // 共通ユーティリティを使用してコンテンツデルタを処理
        const newContent = chunk.choices[0].delta.content;
        const processResult = this.processBufferedContent(
          newContent,
          currentMessage,
          this.persistentState.contentBuffer
        );
        
        result.updatedMessage = processResult.updatedMessage;
        result.shouldYieldMessage = processResult.shouldYield;
        
        // 状態を更新
        this.updatePersistentState({
          contentBuffer: processResult.shouldYield ? "" : this.persistentState.contentBuffer + newContent
        });
        
        return result;
      }

      // ツールコールの処理
      if (chunk.choices?.[0]?.delta?.tool_calls && chunk.choices[0].delta.tool_calls.length > 0) {
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
        
        return result;
      }
    } catch (error) {
      // チャンク処理中のエラーをログに記録し、現在の状態をそのまま返す
      console.error(`チャンク処理中のエラー: ${getErrorMessage(error)}`);
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
  ): { updatedMessage: ChatMessage, shouldYield: boolean } {
    const combinedContent = contentBuffer + newContent;
    
    // 文や段落の区切りを検出
    const isSentenceOrParagraphEnd = DatabricksHelpers.isTextBlockEnd(combinedContent);
    
    // バッファが特定のサイズを超えた場合も表示する
    const exceedsBufferThreshold = combinedContent.length >= BUFFER_SIZE_THRESHOLD;
    
    // 表示するべきか判定
    const shouldActuallyYield = isSentenceOrParagraphEnd || exceedsBufferThreshold;
    
    // 共通ユーティリティを使用して現在のメッセージのコンテンツを更新
    const processResult = processContentDelta(
      shouldActuallyYield ? combinedContent : "", 
      currentMessage
    );
    
    return {
      updatedMessage: processResult.updatedMessage,
      shouldYield: shouldActuallyYield
    };
  }

  /**
   * 思考チャンクを処理
   * @param thinkingChunk 思考チャンク
   * @returns 処理された思考メッセージ
   */
  private static processThinkingChunk(thinkingChunk: ThinkingChunk): ChatMessage {
    // 思考内容を適切にシリアライズ - 共通ユーティリティを使用
    let newThinking = "";
    if (typeof thinkingChunk.thinking === "string") {
      newThinking = thinkingChunk.thinking || "";
    } else if (thinkingChunk.thinking && typeof thinkingChunk.thinking === "object") {
      newThinking = safeStringify(thinkingChunk.thinking, "[思考データ]");
    }
    
    // 思考メッセージを返す
    const thinkingMessage: ThinkingChatMessage = {
      role: "thinking",
      content: newThinking,
      signature: thinkingChunk.signature
    };
    
    // デバッグモードに関わらず思考プロセスをコンソールに出力
    this.logThinkingProcess(thinkingMessage);
    
    return thinkingMessage;
  }

  /**
   * 思考プロセスをコンソールに出力
   * @param thinkingMessage 思考メッセージ
   */
  private static logThinkingProcess(thinkingMessage: ThinkingChatMessage): void {
    // 思考プロセスをコンソールに出力
    if (thinkingMessage && thinkingMessage.content) {
      // 長い思考プロセスは省略して表示
      const truncatedThinking = typeof thinkingMessage.content === 'string' && 
        thinkingMessage.content.length > 200 
        ? thinkingMessage.content.substring(0, 200) + '...' 
        : thinkingMessage.content;
      
      console.log('[思考プロセス]', truncatedThinking);
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
  ): {
    updatedToolCalls: ToolCall[];
    updatedCurrentToolCall: ToolCall | null;
    updatedCurrentToolCallIndex: number | null;
    updatedJsonBuffer: string;
    updatedIsBufferingJson: boolean;
    shouldYieldMessage: boolean;
  } {
    // デフォルトの戻り値を初期化
    const result = {
      updatedToolCalls: [...toolCalls],
      updatedCurrentToolCall: currentToolCall,
      updatedCurrentToolCallIndex: currentToolCallIndex,
      updatedJsonBuffer: jsonBuffer,
      updatedIsBufferingJson: isBufferingJson,
      shouldYieldMessage: false
    };

    try {
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
        // 現在のバッファリング中のJSONを処理
        this.finalizeCurrentJsonBuffer(result, messages);
        
        // インデックスを更新して新しいツール呼び出しを設定
        this.setupNewToolCall(result, index);
      }
      
      // 関数名の更新
      if (toolCallDelta.function?.name && result.updatedCurrentToolCall) {
        this.updateToolCallFunctionName(result, toolCallDelta.function.name, messages);
      }
      
      // 関数引数の更新
      if (toolCallDelta.function?.arguments && result.updatedCurrentToolCall) {
        try {
          this.processToolCallArguments(result, toolCallDelta.function.arguments, messages);
        } catch (e) {
          // エラーが発生した場合はログに記録
          console.warn(`ツール引数の処理中にエラーが発生しました: ${getErrorMessage(e)}`);
        }
      }
      
      // ツール呼び出しが有効なものだけフィルタリング
      const validToolCalls = result.updatedToolCalls.filter(Boolean);
      result.shouldYieldMessage = validToolCalls.length > 0;
    } catch (error) {
      // エラー処理
      console.error(`ツールコールデルタ処理中のエラー: ${getErrorMessage(error)}`);
    }
    
    return result;
  }

  /**
   * 現在のJSONバッファを最終処理する
   * @param result 現在の処理結果
   * @param messages メッセージ配列
   */
  private static finalizeCurrentJsonBuffer(
    result: {
      updatedToolCalls: ToolCall[];
      updatedCurrentToolCall: ToolCall | null;
      updatedCurrentToolCallIndex: number | null;
      updatedJsonBuffer: string;
      updatedIsBufferingJson: boolean;
    },
    messages: ChatMessage[]
  ): void {
    // バッファリング中のJSONがあれば処理
    if (result.updatedIsBufferingJson && result.updatedJsonBuffer && result.updatedCurrentToolCall) {
      try {
        // 引数の修復を試みる（共通ユーティリティを使用）
        const repairedBuffer = repairDuplicatedJsonPattern(result.updatedJsonBuffer);
        
        // 共通ユーティリティを使用して有効なJSONを抽出
        const validJson = extractValidJson(repairedBuffer);
        if (validJson) {
          result.updatedCurrentToolCall.function.arguments = processSearchToolArguments(
            result.updatedCurrentToolCall.function.name,
            result.updatedCurrentToolCall.function.arguments || "",
            validJson,
            messages
          );
        } else {
          // 有効なJSONがない場合はそのまま適用
          result.updatedCurrentToolCall.function.arguments = processSearchToolArguments(
            result.updatedCurrentToolCall.function.name,
            result.updatedCurrentToolCall.function.arguments || "",
            repairedBuffer,
            messages
          );
        }
      } catch (e) {
        console.warn(`JSONバッファ最終処理エラー: ${getErrorMessage(e)}`);
      }
      
      // 共通ユーティリティを使用してバッファをリセット
      result.updatedJsonBuffer = JsonBufferHelpers.resetBuffer();
      result.updatedIsBufferingJson = false;
    }
  }

  /**
   * 新しいツール呼び出しを設定する
   * @param result 現在の処理結果
   * @param newIndex 新しいインデックス
   */
  private static setupNewToolCall(
    result: {
      updatedToolCalls: ToolCall[];
      updatedCurrentToolCall: ToolCall | null;
      updatedCurrentToolCallIndex: number | null;
      updatedJsonBuffer: string;
      updatedIsBufferingJson: boolean;
    },
    newIndex: number
  ): void {
    // インデックスを更新
    result.updatedCurrentToolCallIndex = newIndex;
    
    // ツール呼び出し配列の拡張（必要に応じて）
    while (result.updatedToolCalls.length <= newIndex) {
      result.updatedToolCalls.push(null as unknown as ToolCall);
    }
    
    // 新しいツール呼び出しの初期化
    if (!result.updatedToolCalls[newIndex]) {
      const newToolCall: ToolCall = {
        id: `call_${Date.now()}_${newIndex}`,
        type: "function",
        function: {
          name: "",
          arguments: ""
        }
      };
      result.updatedToolCalls[newIndex] = newToolCall;
      result.updatedCurrentToolCall = newToolCall;
    } else {
      result.updatedCurrentToolCall = result.updatedToolCalls[newIndex];
    }
  }

  /**
   * ツール呼び出しの関数名を更新
   * @param result 現在の処理結果
   * @param functionName 関数名
   * @param messages メッセージ配列
   */
  private static updateToolCallFunctionName(
    result: {
      updatedToolCalls: ToolCall[];
      updatedCurrentToolCall: ToolCall | null;
      updatedCurrentToolCallIndex: number | null;
      updatedJsonBuffer: string;
      updatedIsBufferingJson: boolean;
    },
    functionName: string,
    messages: ChatMessage[]
  ): void {
    if (!result.updatedCurrentToolCall) {
      return;
    }
    
    result.updatedCurrentToolCall.function.name = functionName;
    
    // 検索ツールの場合、デフォルトの引数を事前設定（共通ユーティリティを活用）
    if (isSearchTool(result.updatedCurrentToolCall.function.name) && 
        !result.updatedCurrentToolCall.function.arguments) {
      const queryContext = extractQueryContext(messages);
      result.updatedCurrentToolCall.function.arguments = JSON.stringify({ query: queryContext });
    }
  }

  /**
   * ツール呼び出しの引数を処理
   * @param result 現在の処理結果
   * @param args 引数（文字列または任意のオブジェクト）
   * @param messages メッセージ配列
   */
  private static processToolCallArguments(
    result: {
      updatedToolCalls: ToolCall[];
      updatedCurrentToolCall: ToolCall | null;
      updatedCurrentToolCallIndex: number | null;
      updatedJsonBuffer: string;
      updatedIsBufferingJson: boolean;
      shouldYieldMessage?: boolean;
    },
    args: string | any,
    messages: ChatMessage[]
  ): void {
    if (!result.updatedCurrentToolCall) {
      return;
    }
    
    // 共通ユーティリティを使用して安全に文字列化
    const newArgs = typeof args === "string" 
      ? args 
      : safeStringify(args, "");
    
    if (!newArgs) {
      return; // 空の引数は無視
    }
    
    console.log(`ツール呼び出し引数処理: ${newArgs.substring(0, 50)}${newArgs.length > 50 ? '...' : ''}`);
    
    try {
      // 引数が重複または不正なJSONパターンを含む場合は事前修復
      // 共通ユーティリティの強化された関数を使用
      const repairedArgs = ToolCallProcessor.repairToolArguments(newArgs);
      const isModified = repairedArgs !== newArgs;
      
      if (isModified) {
        console.log(`引数不正検出と修復:
        元: ${newArgs.substring(0, 50)}${newArgs.length > 50 ? '...' : ''}
        後: ${repairedArgs.substring(0, 50)}${repairedArgs.length > 50 ? '...' : ''}`);
      }
      
      // 引数がJSONフラグメントかどうかを判断
      if (result.updatedIsBufferingJson || repairedArgs.trim().startsWith('{') || repairedArgs.trim().startsWith('[')) {
        // ToolCallProcessorの改善されたprocessToolArgumentsDeltaを使用
        const toolArgsDelta = ToolCallProcessor.processToolArgumentsDelta(
          result.updatedCurrentToolCall.function.name,
          result.updatedJsonBuffer,
          repairedArgs // 修復された引数を使用
        );
        
        result.updatedJsonBuffer = toolArgsDelta.processedArgs;
        result.updatedIsBufferingJson = !toolArgsDelta.isComplete;
        
        // JSONが完成したかチェック
        if (toolArgsDelta.isComplete) {
          try {
            // ツール呼び出しの引数を設定
            // 最終確認として有効なJSONか確認
            const finalArgs = result.updatedJsonBuffer;
            const validJson = extractValidJson(finalArgs);
            
            // 有効なJSONが抽出できれば使用する
            if (validJson) {
              result.updatedCurrentToolCall.function.arguments = validJson;
              console.log(`最終引数チェック後の有効JSON: ${validJson.substring(0, 50)}${validJson.length > 50 ? '...' : ''}`);
            } else {
              // 有効なJSONが抽出できない場合はそのまま使用
              result.updatedCurrentToolCall.function.arguments = finalArgs;
              console.log(`最終引数チェック失敗、そのまま使用: ${finalArgs.substring(0, 50)}${finalArgs.length > 50 ? '...' : ''}`);
            }
          } catch (e) {
            // エラーが発生した場合はバッファをそのまま使用
            result.updatedCurrentToolCall.function.arguments = result.updatedJsonBuffer;
            console.warn(`最終引数処理エラー: ${getErrorMessage(e)}`);
          }
          
          // バッファをリセット
          result.updatedJsonBuffer = JsonBufferHelpers.resetBuffer();
          result.updatedIsBufferingJson = false;
          
          // ツール呼び出しを持つメッセージをyield
          result.shouldYieldMessage = true;
          return;
        }
      } else {
        // 検索ツールの場合の特別処理
        if (isSearchTool(result.updatedCurrentToolCall.function.name)) {
          // 既に有効な引数がある場合は更新しない（冗長な更新を防止）
          if (result.updatedCurrentToolCall.function.arguments &&
              result.updatedCurrentToolCall.function.arguments !== "{}" &&
              result.updatedCurrentToolCall.function.arguments !== "") {
            
            try {
              // 共通ユーティリティで型付きで引数をパース
              const existingArgs = safeJsonParse<QueryArgs>(result.updatedCurrentToolCall.function.arguments, {});
              
              // 既に有効なqueryプロパティがある場合は更新をスキップ
              if (existingArgs && existingArgs.query && typeof existingArgs.query === "string" && 
                  existingArgs.query.trim() !== "") {
                console.log(`検索ツールの引数が既に存在するため、更新をスキップ: ${JSON.stringify(existingArgs)}`);
                return;
              }
            } catch (e) {
              // パースエラーの場合は通常の処理を続行
              console.warn(`検索ツール引数のパースエラー: ${getErrorMessage(e)}`);
            }
          }
        }
        
        // 非JSON引数の処理: 共通ユーティリティを使用してSearch引数を処理
        result.updatedCurrentToolCall.function.arguments = processSearchToolArguments(
          result.updatedCurrentToolCall.function.name,
          result.updatedCurrentToolCall.function.arguments || "",
          repairedArgs, // 修復された引数を使用
          messages
        );
      }
    } catch (error) {
      // エラー処理
      console.error(`ツール引数処理中の例外: ${getErrorMessage(error)}`);
    }
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
      // 重複パターンの修復を先に適用
      const repairedBuffer = repairDuplicatedJsonPattern(jsonBuffer);
      
      // 共通ユーティリティを使用して有効なJSONの抽出を試みる
      const validJson = extractValidJson(repairedBuffer);
      
      // 有効なJSONが抽出できた場合
      if (validJson) {
        const parsedJson = safeJsonParse(validJson, {});
        
        // 検索ツールの場合は専用の処理
        if (isSearchTool(currentToolCall.function.name)) {
          currentToolCall.function.arguments = processSearchToolArguments(
            currentToolCall.function.name,
            currentToolCall.function.arguments || "",
            JSON.stringify(parsedJson),
            messages
          );
        } else {
          // 既存の引数とマージ
          try {
            if (currentToolCall.function.arguments) {
              const existingArgs = safeJsonParse(currentToolCall.function.arguments, {});
              const mergedArgs = { ...existingArgs, ...parsedJson };
              currentToolCall.function.arguments = JSON.stringify(mergedArgs);
            } else {
              currentToolCall.function.arguments = JSON.stringify(parsedJson);
            }
          } catch (e) {
            currentToolCall.function.arguments = JSON.stringify(parsedJson);
          }
        }
      } else {
        // 抽出できなかった場合は、修復された値を使用
        if (isSearchTool(currentToolCall.function.name)) {
          currentToolCall.function.arguments = processSearchToolArguments(
            currentToolCall.function.name,
            currentToolCall.function.arguments || "",
            repairedBuffer,
            messages
          );
        } else {
          // その他のツールは既存の引数に追加
          if (currentToolCall.function.arguments) {
            currentToolCall.function.arguments += repairedBuffer;
          } else {
            currentToolCall.function.arguments = repairedBuffer;
          }
        }
      }
    } catch (e) {
      console.warn(`最終バッファ処理エラー: ${getErrorMessage(e)}`);
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
  ): {
    restoredMessage: ChatMessage;
    restoredToolCalls: ToolCall[];
    restoredCurrentToolCall: ToolCall | null;
    restoredCurrentToolCallIndex: number | null;
    restoredJsonBuffer: string;
    restoredIsBufferingJson: boolean;
  } {
    // 永続的な状態を取得
    const state = this.getPersistentState();
    
    // 最後の再接続から一定時間（5分以上）経過している場合は状態をリセット
    const stateAge = Date.now() - state.lastReconnectTimestamp;
    
    if (stateAge > MAX_STATE_AGE_MS) {
      console.log(`状態が古すぎるためリセットします (${Math.round(stateAge / 1000)}秒経過)`);
      this.resetPersistentState();
      
      return {
        restoredMessage: currentMessage,
        restoredToolCalls: toolCalls,
        restoredCurrentToolCall: currentToolCall,
        restoredCurrentToolCallIndex: currentToolCallIndex,
        restoredJsonBuffer: "",
        restoredIsBufferingJson: false
      };
    }
    
    // 永続的な状態を適用
    this.updatePersistentState({ lastReconnectTimestamp: Date.now() });
    
    console.log(`接続エラーからの回復処理を実行: JSON(${state.jsonBuffer.length}バイト), バッファリング(${state.isBufferingJson}), ツール呼び出し(${state.toolCallsInProgress.length}件)`);
    
    return {
      restoredMessage: currentMessage,
      restoredToolCalls: state.toolCallsInProgress.length > 0 ? [...state.toolCallsInProgress] : toolCalls,
      restoredCurrentToolCall: state.currentToolCallIndex !== null && 
                              state.toolCallsInProgress.length > state.currentToolCallIndex ? 
                              state.toolCallsInProgress[state.currentToolCallIndex] : 
                              currentToolCall,
      restoredCurrentToolCallIndex: state.currentToolCallIndex !== null ? state.currentToolCallIndex : currentToolCallIndex,
      restoredJsonBuffer: state.jsonBuffer,
      restoredIsBufferingJson: state.isBufferingJson
    };
  }

  /**
   * ストリーミング処理の最終処理
   * @param jsonBuffer JSONバッファ
   * @param isBufferingJson JSONバッファリング中フラグ
   * @param currentToolCall 現在のツール呼び出し
   * @param currentToolCallIndex 現在のツール呼び出しインデックス
   * @param toolCalls ツール呼び出し配列
   * @param messages メッセージ配列
   */
  static finalizeStreamingProcessing(
    jsonBuffer: string,
    isBufferingJson: boolean,
    currentToolCall: ToolCall | null,
    currentToolCallIndex: number | null,
    toolCalls: ToolCall[],
    messages: ChatMessage[]
  ): void {
    try {
      // 未処理のJSONバッファがあれば最終処理
      if (isBufferingJson && jsonBuffer) {
        currentToolCall = this.finalizeJsonBuffer(jsonBuffer, isBufferingJson, currentToolCall, messages);
        
        // currentToolCallが更新された場合、対応するtoolCallsも更新
        if (currentToolCall !== null && currentToolCallIndex !== null) {
          // 明示的な型アノテーションとキャストで型を確定させる
          const index: number = Number(currentToolCallIndex);
          
          // nullでないこと、有効な整数なこと、配列の範囲内であることを確認
          if (!Number.isNaN(index) && index >= 0 && index < toolCalls.length) {
            toolCalls[index] = currentToolCall;
          } else {
            console.warn(`無効なツール呼び出しインデックス: ${currentToolCallIndex}`);
          }
        }
      }

      // 検索ツールで引数がない場合、デフォルトのクエリを設定
      this.ensureSearchToolArguments(toolCalls, messages);
    } catch (error) {
      // エラーが発生した場合でも処理を続行
      console.error(`最終処理中のエラー: ${getErrorMessage(error)}`);
    }
  }
}