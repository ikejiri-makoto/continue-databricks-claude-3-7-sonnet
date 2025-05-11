import { ChatMessage, ThinkingChatMessage } from "../../../index.js";
import { ThinkingChunk, StreamingChunk, ResponseDelta, ToolCall, PersistentStreamState, ToolCallResult } from "./types/types.js";
import "./types/extension.d.ts";

// 共通ユーティリティのインポート
import { getErrorMessage } from "../../utils/errors.js";
import { 
  safeStringify, 
  isValidJson, 
  safeJsonParse, 
  extractValidJson, 
  processJsonDelta, 
  processToolArgumentsDelta, 
  repairDuplicatedJsonPattern 
} from "../../utils/json.js";
import { extractQueryContext } from "../../utils/messageUtils.js";
import { processContentDelta, JsonBufferHelpers } from "../../utils/streamProcessing.js";
import { isSearchTool, processSearchToolArguments } from "../../utils/toolUtils.js";

// 独自モジュールをインポート
import { ToolCallProcessor } from "./toolcalls.js";

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
  ) {
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

    // thinking（思考）モードの処理
    if (chunk.thinking) {
      const thinkingChunk = this.processThinkingChunk(chunk.thinking);
      result.thinkingMessage = thinkingChunk;
      return result;
    }

    // メッセージコンテンツの処理
    if (chunk.choices?.[0]?.delta?.content) {
      // コンテンツデルタを処理
      const newContent = chunk.choices[0].delta.content;
      
      // バッファリングされたコンテンツを処理
      const { updatedMessage, shouldYield } = this.processBufferedContent(
        newContent,
        currentMessage,
        this.persistentState.contentBuffer
      );
      
      result.updatedMessage = updatedMessage;
      result.shouldYieldMessage = shouldYield;
      
      // 状態を更新
      this.updatePersistentState({
        contentBuffer: shouldYield ? "" : this.persistentState.contentBuffer + newContent
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
  ) {
    const combinedContent = contentBuffer + newContent;
    
    // 文や段落の区切りを検出
    const isSentenceOrParagraphEnd = this.isTextBlockEnd(combinedContent);
    
    // バッファが特定のサイズを超えた場合も表示する
    const exceedsBufferThreshold = combinedContent.length >= BUFFER_SIZE_THRESHOLD;
    
    // 表示するべきか判定
    const shouldActuallyYield = isSentenceOrParagraphEnd || exceedsBufferThreshold;
    
    // 現在のメッセージのコンテンツを更新
    const updatedContent = this.updateMessageContent(currentMessage, combinedContent, shouldActuallyYield);
    
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
   * メッセージコンテンツを更新
   * @param currentMessage 現在のメッセージ
   * @param combinedContent 結合されたコンテンツ
   * @param shouldAppend 追加すべきかどうか
   * @returns 更新されたコンテンツ
   */
  private static updateMessageContent(
    currentMessage: ChatMessage,
    combinedContent: string,
    shouldAppend: boolean
  ): string {
    if (!shouldAppend) {
      return typeof currentMessage.content === "string" ? currentMessage.content : "";
    }
    
    // 既存のコンテンツにバッファの内容を追加
    if (typeof currentMessage.content === "string") {
      return currentMessage.content + combinedContent;
    } else {
      return combinedContent;
    }
  }

  /**
   * 思考チャンクを処理
   * @param thinkingChunk 思考チャンク
   * @returns 処理された思考メッセージ
   */
  private static processThinkingChunk(thinkingChunk: ThinkingChunk): ChatMessage {
    // 思考内容を適切にシリアライズ
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
  ): ToolCallResult {
    // デフォルトの戻り値を初期化
    const result = {
      updatedToolCalls: [...toolCalls],
      updatedCurrentToolCall: currentToolCall,
      updatedCurrentToolCallIndex: currentToolCallIndex,
      updatedJsonBuffer: jsonBuffer,
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
      // ここで新しいオブジェクトを生成し、変数に割り当てる（constに再代入しない）
      const updatedResultAfterIndexChange = this.handleToolCallIndexChange(
        result, 
        index, 
        messages
      );
      // 元のresultオブジェクトのプロパティを更新
      result.updatedToolCalls = updatedResultAfterIndexChange.updatedToolCalls;
      result.updatedCurrentToolCall = updatedResultAfterIndexChange.updatedCurrentToolCall;
      result.updatedCurrentToolCallIndex = updatedResultAfterIndexChange.updatedCurrentToolCallIndex;
      result.updatedJsonBuffer = updatedResultAfterIndexChange.updatedJsonBuffer;
      result.updatedIsBufferingJson = updatedResultAfterIndexChange.updatedIsBufferingJson;
    }
    
    // 関数名の更新
    if (toolCallDelta.function?.name && result.updatedCurrentToolCall) {
      // ここで新しいオブジェクトを生成し、変数に割り当てる（constに再代入しない）
      const updatedResultAfterFunctionName = this.updateToolCallFunctionName(
        result,
        toolCallDelta.function.name,
        messages
      );
      // 元のresultオブジェクトのプロパティを更新
      result.updatedToolCalls = updatedResultAfterFunctionName.updatedToolCalls;
      result.updatedCurrentToolCall = updatedResultAfterFunctionName.updatedCurrentToolCall;
      result.updatedCurrentToolCallIndex = updatedResultAfterFunctionName.updatedCurrentToolCallIndex;
      result.updatedJsonBuffer = updatedResultAfterFunctionName.updatedJsonBuffer;
      result.updatedIsBufferingJson = updatedResultAfterFunctionName.updatedIsBufferingJson;
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
            
            // 強化されたJSON処理: 共通ユーティリティのprocessToolArgumentsDeltaを使用
            try {
              // ツール引数のデルタを処理
              const toolArgsDelta = processToolArgumentsDelta(
                result.updatedJsonBuffer, 
                toolCallDelta.function.arguments
              );
              
              result.updatedJsonBuffer = toolArgsDelta.processedArgs;
              
              // JSONが完成したかチェック
              if (toolArgsDelta.isComplete) {
                // 検索ツールの場合は特別処理
                if (result.updatedCurrentToolCall && isSearchTool(result.updatedCurrentToolCall.function.name)) {
                  result.updatedCurrentToolCall.function.arguments = processSearchToolArguments(
                    result.updatedCurrentToolCall.function.name,
                    "",
                    result.updatedJsonBuffer,
                    messages
                  );
                } else {
                  // 通常のツールの場合は直接引数を設定
                  result.updatedCurrentToolCall.function.arguments = result.updatedJsonBuffer;
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
              
              // エラーが発生しても処理を継続
              // 代わりに従来のアプローチを試す
              result.updatedJsonBuffer += toolCallDelta.function.arguments;
              result.updatedIsBufferingJson = true;
              return result;
            }
          } else {
            // 二重化パターンをチェック
            let repairedArguments = toolCallDelta.function.arguments;
            const repeatedPattern = /\{\s*\"\w+\"\s*:\s*[^{]*\{\s*\"\w+\"\s*:/;
            if (repeatedPattern.test(repairedArguments)) {
              repairedArguments = repairDuplicatedJsonPattern(repairedArguments);
              
              // エラーメッセージのデバッグログ（実際のエラーを伝えずにデバッグに役立てる）
              if (repairedArguments !== toolCallDelta.function.arguments) {
                console.log(`ツール引数を修復しました: ${toolCallDelta.function.arguments} -> ${repairedArguments}`);
              }
            }
            
            // 標準的な引数更新処理
            const updatedResultAfterArguments = this.updateToolCallArguments(
              result,
              repairedArguments,
              messages
            );
            
            // 元のresultオブジェクトのプロパティを更新
            result.updatedToolCalls = updatedResultAfterArguments.updatedToolCalls;
            result.updatedCurrentToolCall = updatedResultAfterArguments.updatedCurrentToolCall;
            result.updatedCurrentToolCallIndex = updatedResultAfterArguments.updatedCurrentToolCallIndex;
            result.updatedJsonBuffer = updatedResultAfterArguments.updatedJsonBuffer;
            result.updatedIsBufferingJson = updatedResultAfterArguments.updatedIsBufferingJson;
            result.shouldYieldMessage = updatedResultAfterArguments.shouldYieldMessage;
          }
        }
      } catch (e) {
        // エラーが発生した場合は、元の処理を実行
        console.warn(`ツール引数の修復中にエラーが発生しました: ${getErrorMessage(e)}`);
        
        const updatedResultAfterArguments = this.updateToolCallArguments(
          result,
          toolCallDelta.function.arguments,
          messages
        );
        
        // 元のresultオブジェクトのプロパティを更新
        result.updatedToolCalls = updatedResultAfterArguments.updatedToolCalls;
        result.updatedCurrentToolCall = updatedResultAfterArguments.updatedCurrentToolCall;
        result.updatedCurrentToolCallIndex = updatedResultAfterArguments.updatedCurrentToolCallIndex;
        result.updatedJsonBuffer = updatedResultAfterArguments.updatedJsonBuffer;
        result.updatedIsBufferingJson = updatedResultAfterArguments.updatedIsBufferingJson;
        result.shouldYieldMessage = updatedResultAfterArguments.shouldYieldMessage;
      }
    }
    
    // ツール呼び出しが有効なものだけフィルタリング
    const validToolCalls = result.updatedToolCalls.filter(Boolean);
    result.shouldYieldMessage = validToolCalls.length > 0;
    
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
      newResult.updatedJsonBuffer = JsonBufferHelpers.resetBuffer();
      newResult.updatedIsBufferingJson = false;
    }
    
    // インデックスを更新
    newResult.updatedCurrentToolCallIndex = newIndex;
    
    // ツール呼び出し配列の拡張（必要に応じて）
    while (newResult.updatedToolCalls.length <= newIndex) {
      newResult.updatedToolCalls.push(null as unknown as ToolCall);
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
          console.log(`検索ツールの引数が既に存在するため、更新をスキップ: ${JSON.stringify(existingArgs)}`);
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
            newResult.updatedJsonBuffer = JsonBufferHelpers.resetBuffer();
            newResult.updatedIsBufferingJson = false;
            console.log(`JSONバッファをリセット: 完全なJSONを受信`);
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
      if (isValidJson(newResult.updatedJsonBuffer)) {
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
          newResult.updatedJsonBuffer,
          MAX_JSON_BUFFER_SIZE
        );
      }
      
      console.log(`JSONバッファ更新: ${newResult.updatedJsonBuffer}`);
      
      // 更新されたバッファが有効なJSONになったかチェック
      const validJson = extractValidJson(newResult.updatedJsonBuffer);
      if (validJson) {
        try {
          const parsedJson = safeJsonParse(validJson, null);
          if (parsedJson !== null) {
            console.log(`バッファがJSONとして完成: ${validJson}`);
            
            // パース済みJSONを引数に適用
            const updatedJsonResult = this.applyParsedJsonToArguments(newResult, parsedJson, messages);
            
            // バッファをリセット
            updatedJsonResult.updatedJsonBuffer = JsonBufferHelpers.resetBuffer();
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
    
    // 有効なJSONの抽出を試みる
    const validJson = extractValidJson(jsonBuffer);
    
    try {
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
        // 有効なJSONがない場合、破損したブール値を修復してみる
        const fixedJson = tryFixBrokenBooleanJson(jsonBuffer);
        if (fixedJson !== jsonBuffer) {
          const validFixedJson = extractValidJson(fixedJson);
          if (validFixedJson) {
            try {
              const parsedJson = JSON.parse(validFixedJson);
              
              // 検索ツールの場合は専用の処理
              if (isSearchTool(currentToolCall.function.name)) {
                currentToolCall.function.arguments = processSearchToolArguments(
                  currentToolCall.function.name,
                  currentToolCall.function.arguments || "",
                  JSON.stringify(parsedJson),
                  messages
                );
              } else {
                // その他の処理
                if (currentToolCall.function.arguments) {
                  const existingArgs = safeJsonParse(currentToolCall.function.arguments, {});
                  const mergedArgs = { ...existingArgs, ...parsedJson };
                  currentToolCall.function.arguments = JSON.stringify(mergedArgs);
                } else {
                  currentToolCall.function.arguments = JSON.stringify(parsedJson);
                }
              }
              
              return currentToolCall;
            } catch (e) {
              console.warn(`修復されたJSON解析エラー: ${e}`);
            }
          }
        }
        
        // 抽出できなかった場合は、そのままの値を使用
        if (isSearchTool(currentToolCall.function.name)) {
          currentToolCall.function.arguments = processSearchToolArguments(
            currentToolCall.function.name,
            currentToolCall.function.arguments || "",
            jsonBuffer,
            messages
          );
        } else {
          // その他のツールは既存の引数に追加
          if (currentToolCall.function.arguments) {
            currentToolCall.function.arguments += jsonBuffer;
          } else {
            currentToolCall.function.arguments = jsonBuffer;
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
  ) {
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
}

/**
 * 破損したブール値JSONを修復する試み
 * 典型的な破損パターン("rue"→"true", "als"→"false")を検出して修復
 * @param text 修復対象のテキスト
 * @returns 修復されたテキスト（修復できなかった場合は元のテキスト）
 */
function tryFixBrokenBooleanJson(text: string): string {
  if (!text || typeof text !== 'string') {
    return text;
  }
  
  let result = text;

  // "rue" -> "true" の修復 (trueが切断された場合)
  result = result.replace(/([{,]\s*"\w+"\s*:)\s*rue([,}])/g, '$1 true$2');
  
  // "als" または "alse" -> "false" の修復 (falseが切断された場合)
  result = result.replace(/([{,]\s*"\w+"\s*:)\s*als([,}])/g, '$1 false$2');
  result = result.replace(/([{,]\s*"\w+"\s*:)\s*alse([,}])/g, '$1 false$2');
  
  // "rue}" -> "true}" の修復 (特定のケース)
  if (result.includes('rue}')) {
    result = result.replace(/rue}/g, 'true}');
  }
  
  // "als}" -> "false}" の修復 (特定のケース)
  if (result.includes('als}')) {
    result = result.replace(/als}/g, 'false}');
  }
  
  // "alse}" -> "false}" の修復 (特定のケース)
  if (result.includes('alse}')) {
    result = result.replace(/alse}/g, 'false}');
  }
  
  return result;
}