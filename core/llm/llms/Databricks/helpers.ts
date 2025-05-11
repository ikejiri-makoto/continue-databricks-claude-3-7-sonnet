import { ChatMessage, CompletionOptions } from "../../../index.js";
import { DatabricksCompletionOptions, ToolCall } from "./types/types.js";
import { safeStringify, safeJsonParse, isValidJson, extractValidJson } from "../../utils/json.js";
import { isSearchTool } from "../../utils/toolUtils.js";

// 定数
const DEFAULT_MAX_TOKENS = 32000;
const MIN_MAX_TOKENS = 4096;

/**
 * DatabricksLLM用のヘルパー関数
 * リクエストパラメータの構築、状態の初期化、非ストリーミングレスポンスの処理などを担当
 */
export class DatabricksHelpers {
  /**
   * OpenAI形式のオプションに変換
   * CompletionOptionsをDatabricksのリクエストパラメータに変換
   * 
   * @param options 補完オプション
   * @returns 変換されたリクエストパラメータ
   */
  static convertArgs(options: DatabricksCompletionOptions): Record<string, any> {
    // モデル名の設定（デフォルト値またはユーザー指定値）
    const modelName = options.model || "databricks-claude-3-7-sonnet";
    
    // max_tokensのデフォルト値または指定値を取得
    // 最小値を設定して小さすぎる値を防止（少なくとも4096）
    const maxTokens = Math.max(options.maxTokens || DEFAULT_MAX_TOKENS, MIN_MAX_TOKENS);
    
    // 思考予算を計算 - max_tokensの半分または最大64000を上限とする
    // 常にmax_tokensよりも小さくなるようにする
    const thinkingBudget = Math.min(Math.floor(maxTokens * 0.5), 64000);
    
    // OpenAI互換形式のリクエストパラメータ
    const finalOptions: Record<string, any> = {
      model: modelName,
      max_tokens: maxTokens,
      temperature: options.temperature ?? 1,
      top_p: options.topP,
      stream: options.stream ?? true,
    };

    // 空でないstop配列のみを含める
    if (options.stop && Array.isArray(options.stop) && options.stop.length > 0) {
      finalOptions.stop = options.stop.filter((x: string) => typeof x === 'string' && x.trim() !== "");
    }

    // タイムアウト設定はDatabricksエンドポイントでサポートされていないためリクエストボディに含めない
    // Fetch APIのtimeoutオプションとAbortControllerで処理する

    // デバッグログ
    console.log(`Token settings - max_tokens: ${maxTokens}, thinking budget: ${thinkingBudget}`);

    // ツール関連のパラメータがある場合のみ追加
    if (options.tools && Array.isArray(options.tools) && options.tools.length > 0) {
      finalOptions.tools = options.tools.map((tool: any) => ({
        type: "function",
        function: {
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters,
        }
      }));

      // parallel_tool_callsパラメータはDatabricksのエンドポイントでサポートされていないため、
      // このパラメータは含めない（含めるとBad Requestエラーが発生する）
      // 注：parallel_tool_calls関連のパラメータは完全に除外

      // ツールがあるにもかかわらずQueryパラメータが不足する可能性のある特定のツールを検出
      const searchTools = options.tools.filter((tool: any) => 
        isSearchTool(tool.function.name)
      );

      if (searchTools.length > 0) {
        console.log(`検索ツールが検出されました: ${searchTools.map((t: any) => t.function.name).join(', ')}`);
      }
    }

    if (options.toolChoice) {
      finalOptions.tool_choice = {
        type: "function",
        function: {
          name: options.toolChoice.function.name
        }
      };
    }

    // Databricksがサポートしないその他のパラメータを除外
    // (明示的に定義されたfinalOptionsのプロパティのみが含まれる)

    return finalOptions;
  }

  /**
   * ストリーミング処理の初期状態を作成
   * @returns 初期状態オブジェクト
   */
  static initializeStreamingState(): {
    currentMessage: {
      role: string;
      content: string;
    };
    toolCalls: ToolCall[];
    currentToolCall: ToolCall | null;
    currentToolCallIndex: number | null;
    jsonBuffer: string;
    isBufferingJson: boolean;
    thinkingChunkCount: number;
  } {
    return {
      currentMessage: { role: "assistant", content: "" },
      toolCalls: [],
      currentToolCall: null,
      currentToolCallIndex: null,
      jsonBuffer: "",
      isBufferingJson: false,
      thinkingChunkCount: 0
    };
  }
  
  /**
   * テキストブロックの終了を判定
   * @param text テキスト
   * @returns テキストブロックの終了かどうか
   */
  static isTextBlockEnd(text: string): boolean {
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
   * オブジェクトを安全に文字列化する
   * @param obj 文字列化するオブジェクト
   * @param defaultValue デフォルト値
   * @returns 文字列化されたオブジェクト
   */
  static safeStringify(obj: any, defaultValue: string = ""): string {
    // 共通ユーティリティの関数を使用
    return safeStringify(obj, defaultValue);
  }
  
  /**
   * 非ストリーミングレスポンスを処理
   * @param response HTTPレスポンス
   * @returns 処理されたメッセージ
   */
  static async processNonStreamingResponse(
    response: Response
  ): Promise<ChatMessage> {
    const data = await response.json();
    return { 
      role: "assistant", 
      content: safeStringify(data.choices[0].message.content, "")
    };
  }

  /**
   * コンテンツデルタの処理
   * @param newContent 新しいコンテンツ
   * @param currentContent 現在のコンテンツ
   * @returns 処理されたコンテンツ
   */
  static processContentDelta(newContent: string, currentContent: string): string {
    return currentContent + newContent;
  }
  
  /**
   * メッセージが有効なJSON形式か検証
   * @param message チェックするメッセージ
   * @returns 有効なJSONの場合はtrue
   */
  static isValidJsonMessage(message: string): boolean {
    // 共通ユーティリティを直接使用してJSONの検証
    if (!message.trim().startsWith('{') && !message.trim().startsWith('[')) {
      return false;
    }
      
    return isValidJson(message);
  }
  
  /**
   * リクエストボディのログ出力（デバッグ用）
   * @param requestBody リクエストボディ
   */
  static logRequestBody(requestBody: any): void {
    // 短縮バージョンのリクエストボディを出力（巨大な場合は一部をトリミング）
    const messages = requestBody.messages || [];
    
    const truncatedMessages = messages.map((msg: any) => {
      if (typeof msg.content === 'string' && msg.content.length > 100) {
        return {
          ...msg,
          content: msg.content.substring(0, 100) + '...'
        };
      }
      return msg;
    });
    
    const truncatedBody = {
      ...requestBody,
      messages: truncatedMessages
    };
    
    console.log('Request body (truncated):', JSON.stringify(truncatedBody, null, 2));
  }
}