import { ChatMessage } from "../../../index.js";
import { ThinkingChunk, StreamingChunk, ResponseDelta, ToolCall } from "./types.js";
import { getErrorMessage, isConnectionError } from "../../utils/errors.js";
import { safeStringify, isValidJson } from "../../utils/json.js";
import { extractQueryContext } from "../../utils/messageUtils.js";
import { processContentDelta, JsonBufferHelpers } from "../../utils/streamProcessing.js";
import { processSearchToolArguments, isSearchTool } from "../../utils/toolUtils.js";

/**
 * ストリーミングレスポンスの処理を担当するクラス
 * Databricks上のClaude 3.7 Sonnetからのストリーミングレスポンスを処理
 */
export class StreamingProcessor {
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
    messages: ChatMessage[]
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
      // 共通ユーティリティを使用してコンテンツを処理
      const { updatedMessage, shouldYield } = processContentDelta(
        chunk.choices[0].delta.content,
        currentMessage
      );
      result.updatedMessage = updatedMessage;
      result.shouldYieldMessage = shouldYield;
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
      
      return result;
    }

    return result;
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
    return {
      role: "thinking",
      content: newThinking,
      signature: thinkingChunk.signature
    };
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
      // 現在バッファリング中のJSONがあれば処理
      if (result.updatedIsBufferingJson && result.updatedJsonBuffer && result.updatedCurrentToolCall) {
        try {
          // 現在の引数にバッファの内容を適用
          const toolCall = result.updatedCurrentToolCall;
          toolCall.function.arguments = processSearchToolArguments(
            toolCall.function.name,
            toolCall.function.arguments || "",
            result.updatedJsonBuffer,
            messages
          );
        } catch (e) {
          console.warn(`JSONバッファ処理エラー: ${e}`);
        }
        
        // バッファをリセット
        result.updatedJsonBuffer = JsonBufferHelpers.resetBuffer();
        result.updatedIsBufferingJson = false;
      }
      
      // インデックスを更新
      result.updatedCurrentToolCallIndex = index;
      
      // ツール呼び出し配列の拡張（必要に応じて）
      while (result.updatedToolCalls.length <= index) {
        result.updatedToolCalls.push(null as unknown as ToolCall);
      }
      
      // 新しいツール呼び出しの初期化
      if (!result.updatedToolCalls[index]) {
        const newToolCall: ToolCall = {
          id: toolCallDelta.id || `call_${Date.now()}_${index}`,
          type: "function",
          function: {
            name: "",
            arguments: ""
          }
        };
        result.updatedToolCalls[index] = newToolCall;
        result.updatedCurrentToolCall = newToolCall;
      } else {
        result.updatedCurrentToolCall = result.updatedToolCalls[index];
      }
    }
    
    // 関数名の更新
    if (toolCallDelta.function?.name && result.updatedCurrentToolCall) {
      result.updatedCurrentToolCall.function.name = toolCallDelta.function.name;
      
      // 検索ツールの場合、デフォルトの引数を事前設定
      if (isSearchTool(result.updatedCurrentToolCall.function.name) && 
          !result.updatedCurrentToolCall.function.arguments) {
        const queryContext = extractQueryContext(messages);
        result.updatedCurrentToolCall.function.arguments = JSON.stringify({ query: queryContext });
      }
    }
    
    // 関数引数の更新
    if (toolCallDelta.function?.arguments && result.updatedCurrentToolCall) {
      const newArgs = typeof toolCallDelta.function.arguments === "string" 
        ? toolCallDelta.function.arguments 
        : safeStringify(toolCallDelta.function.arguments, "");
      
      if (!newArgs) {
        return result; // 空の引数は無視
      }
      
      // 重要な修正点: 検索ツールの場合、既に有効な引数がある場合は更新しない
      if (isSearchTool(result.updatedCurrentToolCall.function.name) && 
          result.updatedCurrentToolCall.function.arguments &&
          result.updatedCurrentToolCall.function.arguments !== "{}" &&
          result.updatedCurrentToolCall.function.arguments !== "") {
        
        try {
          // 既存の引数をパース
          const existingArgs = JSON.parse(result.updatedCurrentToolCall.function.arguments);
          
          // 既に有効なqueryプロパティがある場合は更新をスキップ
          if (existingArgs.query && typeof existingArgs.query === "string" && 
              existingArgs.query.trim() !== "") {
            console.log(`検索ツールの引数が既に存在するため、更新をスキップ: ${JSON.stringify(existingArgs)}`);
            return result;
          }
        } catch (e) {
          // パースエラーの場合は通常の処理を続行
        }
      }
      
      // JSONの処理 - 新しい引数が完全なJSONかどうかをチェック
      try {
        const parsedJson = JSON.parse(newArgs);
        
        // 完全なJSONオブジェクトを受信した場合
        if (result.updatedIsBufferingJson) {
          // バッファリング中だった場合はリセット
          result.updatedJsonBuffer = JsonBufferHelpers.resetBuffer();
          result.updatedIsBufferingJson = false;
          console.log(`JSONバッファをリセット: 完全なJSONを受信`);
        }
        
        // 検索ツールの場合は専用メソッドで処理
        if (isSearchTool(result.updatedCurrentToolCall.function.name)) {
          result.updatedCurrentToolCall.function.arguments = processSearchToolArguments(
            result.updatedCurrentToolCall.function.name,
            result.updatedCurrentToolCall.function.arguments || "",
            JSON.stringify(parsedJson),
            messages
          );
        } else {
          // その他のツールは、標準的な処理を行う
          if (result.updatedCurrentToolCall.function.arguments) {
            try {
              const existingArgs = JSON.parse(result.updatedCurrentToolCall.function.arguments);
              const mergedArgs = { ...existingArgs, ...parsedJson };
              result.updatedCurrentToolCall.function.arguments = JSON.stringify(mergedArgs);
            } catch (e) {
              // 既存の引数がJSONとして無効な場合は新しい引数で上書き
              result.updatedCurrentToolCall.function.arguments = JSON.stringify(parsedJson);
            }
          } else {
            // 引数がまだない場合は新しく設定
            result.updatedCurrentToolCall.function.arguments = JSON.stringify(parsedJson);
          }
        }
      } catch (e) {
        // 完全なJSONではない場合
        if (newArgs.trim().startsWith('{')) {
          // 新しいJSONバッファリングを開始
          result.updatedIsBufferingJson = true;
          result.updatedJsonBuffer = JsonBufferHelpers.addToBuffer(newArgs, "");
          console.log(`JSONバッファリング開始: ${result.updatedJsonBuffer}`);
        } else if (result.updatedIsBufferingJson) {
          // 既存のバッファに追加
          result.updatedJsonBuffer = JsonBufferHelpers.addToBuffer(newArgs, result.updatedJsonBuffer);
          console.log(`JSONバッファ追加: ${result.updatedJsonBuffer}`);
          
          // バッファが完全なJSONになったかチェック
          try {
            const parsedJson = JSON.parse(result.updatedJsonBuffer);
            console.log(`バッファがJSONとして完成: ${JSON.stringify(parsedJson)}`);
            
            // 検索ツールの場合は専用メソッドで処理
            if (isSearchTool(result.updatedCurrentToolCall.function.name)) {
              result.updatedCurrentToolCall.function.arguments = processSearchToolArguments(
                result.updatedCurrentToolCall.function.name,
                result.updatedCurrentToolCall.function.arguments || "",
                JSON.stringify(parsedJson),
                messages
              );
            } else {
              // その他のツールは、標準的な処理を行う
              if (result.updatedCurrentToolCall.function.arguments) {
                try {
                  const existingArgs = JSON.parse(result.updatedCurrentToolCall.function.arguments);
                  const mergedArgs = { ...existingArgs, ...parsedJson };
                  result.updatedCurrentToolCall.function.arguments = JSON.stringify(mergedArgs);
                } catch (e) {
                  // 既存の引数がJSONとして無効な場合は新しい引数で上書き
                  result.updatedCurrentToolCall.function.arguments = JSON.stringify(parsedJson);
                }
              } else {
                // 引数がまだない場合は新しく設定
                result.updatedCurrentToolCall.function.arguments = JSON.stringify(parsedJson);
              }
            }
            
            // バッファをリセット
            result.updatedJsonBuffer = JsonBufferHelpers.resetBuffer();
            result.updatedIsBufferingJson = false;
          } catch (e) {
            // まだ不完全なJSONなのでバッファリングを続ける
          }
        } else {
          // JSON形式でない引数と、バッファリング中でもない場合
          if (isSearchTool(result.updatedCurrentToolCall.function.name)) {
            // 検索ツールの場合は専用メソッドで処理
            result.updatedCurrentToolCall.function.arguments = processSearchToolArguments(
              result.updatedCurrentToolCall.function.name,
              result.updatedCurrentToolCall.function.arguments || "",
              newArgs,
              messages
            );
          } else {
            // その他のツールは単純に連結
            if (result.updatedCurrentToolCall.function.arguments) {
              result.updatedCurrentToolCall.function.arguments += newArgs;
            } else {
              result.updatedCurrentToolCall.function.arguments = newArgs;
            }
          }
        }
      }
    }
    
    // ツール呼び出しが有効なものだけフィルタリング
    const validToolCalls = result.updatedToolCalls.filter(Boolean);
    result.shouldYieldMessage = validToolCalls.length > 0;
    
    return result;
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
      // 有効なJSONとして解析を試みる
      if (isValidJson(jsonBuffer)) {
        const parsedJson = JSON.parse(jsonBuffer);
        
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
              const existingArgs = JSON.parse(currentToolCall.function.arguments);
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
        // 不完全なJSONの場合、検索ツールならクエリとして処理
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
      console.warn(`最終バッファ処理エラー: ${e}`);
    }

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
}