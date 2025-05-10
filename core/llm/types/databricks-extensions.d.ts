// 既存の型定義を拡張
declare module "../../index.js" {
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
}
