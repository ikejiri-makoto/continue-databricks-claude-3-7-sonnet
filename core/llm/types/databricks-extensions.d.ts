/**
 * Databricks Claude 3.7 Sonnet インテグレーション用の型拡張
 * 
 * このファイルは、コアモジュールの既存型定義をDatabricks特有の機能をサポートするように拡張します。
 * 宣言的マージを使用して、既存のインターフェースに新しいプロパティを追加しています。
 * これにより、型安全性を保ちながらDatabricks固有の機能を実装できます。
 */

// core/index.js の型定義を拡張
declare module "../../index.js" {
  /**
   * LLMOptions型拡張 - Databricks固有のオプションを追加
   */
  interface LLMOptions {
    /**
     * 思考プロセスを常にログに表示するかどうかの設定
     * Claude 3.7 Sonnetの思考プロセス機能を制御します
     * 
     * @remarks
     * trueの場合は常に表示、falseの場合は開発モードのみ表示します。
     * デフォルトは明示的に設定されない限りtrueとなります。
     * 
     * @example
     * ```typescript
     * const options = {
     *   provider: "databricks",
     *   model: "databricks-claude-3-7-sonnet",
     *   thinkingProcess: true // 思考プロセスを常に表示
     * };
     * ```
     */
    thinkingProcess?: boolean;
    
    /**
     * 並列ツール呼び出しを許可するかどうか
     * 複数のツール呼び出しを同時に処理する機能を制御します
     * 
     * @remarks
     * falseの場合、一度に1つのツール呼び出しのみを処理します。
     * trueの場合、複数のツール呼び出しを並列に処理できます。
     * OpenAIスタイルの並列制御に基づいています。
     * 
     * @example
     * ```typescript
     * const options = {
     *   provider: "databricks",
     *   model: "databricks-claude-3-7-sonnet",
     *   parallelToolCalls: false // 並列ツール呼び出しを無効化
     * };
     * ```
     */
    parallelToolCalls?: boolean;
  }

  /**
   * CompletionOptions型拡張 - Databricks固有のオプションを追加
   */
  interface CompletionOptions {
    /**
     * リクエストのタイムアウト (秒)
     * APIリクエストの最大待機時間を制御します
     * 
     * @remarks
     * デフォルトは300秒 (5分)です。
     * 長時間実行されるリクエストの場合は、この値を増やすことができます。
     * 
     * @example
     * ```typescript
     * const options = {
     *   requestTimeout: 600 // 10分のタイムアウト
     * };
     * ```
     */
    requestTimeout?: number;
    
    /**
     * 並列ツール呼び出しの設定
     * 複数のツール呼び出しを同時に処理する機能を制御します
     * 
     * @remarks
     * デフォルトはfalse (並列ツール呼び出しを無効化)です。
     * trueに設定すると、複数のツール呼び出しを並列に処理できます。
     * 
     * @example
     * ```typescript
     * const options = {
     *   parallel_tool_calls: true // 並列ツール呼び出しを有効化
     * };
     * ```
     */
    parallel_tool_calls?: boolean;
  }

  /**
   * ThinkingChatMessage型拡張 - roleプロパティの型を明確化し、追加プロパティを定義
   */
  interface ThinkingChatMessage extends ChatMessage {
    /**
     * メッセージの役割 - "thinking"に固定
     */
    role: "thinking";
    
    /**
     * 思考プロセスの内容 - 文字列またはオブジェクト
     */
    content: string | object;
    
    /**
     * 思考プロセスの署名情報
     * Databricks特有の署名を保持します
     */
    signature?: string;
    
    /**
     * 編集済み思考内容
     * 元の思考内容から編集された結果を保持します
     */
    redactedThinking?: string;
    
    /**
     * ツール呼び出し情報
     * 思考プロセス内のツール呼び出しを保持します
     */
    toolCalls?: any[];
  }
}
