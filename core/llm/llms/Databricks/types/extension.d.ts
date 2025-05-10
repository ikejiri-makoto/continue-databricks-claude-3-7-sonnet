// 型定義の参照方法をトリプルスラッシュディレクティブに変更する
// 修正: パスを正しく指定
/// <reference path="../../../types/databricks-extensions.d.ts" />

// 記法その2: バックアップとして内容を完全インライン化
// 参照が解決できない場合でも型定義が機能するようにする
// databricks-extensions.d.tsの内容を直接コピー

// core/index.jsを拡張する型定義
declare module "../../../.." {
  // LLMOptions型に thinkingProcess を追加
  interface LLMOptions {
    /**
     * 思考プロセスを常にログに表示するかどうかの設定
     * trueの場合は常に表示、falseの場合は開発モードのみ表示
     */
    thinkingProcess?: boolean;
  }

  // CompletionOptions型に requestTimeout を追加
  interface CompletionOptions {
    /**
     * リクエストのタイムアウト (秒)
     * デフォルトは300秒 (5分)
     */
    requestTimeout?: number;
  }

  // ThinkingChatMessage型を拡張してroleプロパティの型を明確にする
  interface ThinkingChatMessage extends ChatMessage {
    role: "thinking";
    content: string | object;
    signature?: string;
    redactedThinking?: string;
    toolCalls?: any[];
  }
  
  // ToolCallインターフェースが存在しない場合、型安全性のために追加
  // coreモジュールで定義されている場合は無視される
  interface ToolCall {
    name: string;
    arguments: string | Record<string, any>;
    id?: string;
  }
}
