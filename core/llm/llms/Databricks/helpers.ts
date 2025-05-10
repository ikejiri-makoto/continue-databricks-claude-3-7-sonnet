import { CompletionOptions } from "../../../index.js";
import { ToolCall } from "./types/types.js";

// 定数
const DEFAULT_MAX_TOKENS = 32000;
const MIN_MAX_TOKENS = 4096;

/**
 * DatabricksLLM用のヘルパー関数
 */
export class DatabricksHelpers {
  /**
   * リクエストパラメータの構築
   * @param options 補完オプション
   * @returns リクエストパラメータ
   */
  static buildRequestParameters(
    options: CompletionOptions
  ): Record<string, any> {
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
      finalOptions.stop = options.stop.filter(x => typeof x === 'string' && x.trim() !== "");
    }

    // デバッグログ
    console.log(`Token settings - max_tokens: ${maxTokens}, thinking budget: ${thinkingBudget}`);

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
}
