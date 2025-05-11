// This file defines extensions to core types
// Required to support Databricks-specific features

// LLMOptions extension
import { LLMOptions, CompletionOptions } from "../index";

// Add Databricks-specific options
declare module "../index" {
  // ChatMessage型の拡張でツール呼び出し関連プロパティを追加
  interface ChatMessage {
    /**
     * ツール呼び出しの結果に関連付けられたツール呼び出しID
     * ツール結果メッセージ（role: "tool"）で使用される
     */
    toolCallId?: string;
    
    /**
     * 思考メッセージの署名情報
     * 思考プロセス（role: "thinking"）で使用される
     */
    signature?: string;
    
    /**
     * 編集済み思考データ
     * 思考プロセスの非公開部分
     */
    redactedThinking?: any;
  }

  interface LLMOptions {
    /**
     * Whether to always log thinking process
     * If true, always log; if false, only log in development mode
     */
    thinkingProcess?: boolean;
    
    // 注意: Databricksエンドポイントはparallel_tool_callsパラメータをサポートしていません
    // このパラメータを含めるとエラーが発生します
    // parallel_tool_callsパラメータを意図的にコメントアウト
    // parallelToolCalls?: boolean;
  }

  // Add extension for CompletionOptions
  interface CompletionOptions {
    /**
     * Thinking mode configuration for Claude 3.7 models
     * Enables and configures thinking process
     */
    thinking?: {
      /**
       * Thinking mode type - currently only "enabled" is supported
       */
      type: string;
      
      /**
       * Token budget for thinking process
       * Default is half of max_tokens (up to 64000)
       */
      budget_tokens?: number;
    };
  }

  // Add further type extensions as needed
}
