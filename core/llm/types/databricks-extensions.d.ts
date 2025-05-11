// このファイルは、コア型の拡張を定義します
// Databricks特有の機能をサポートするために必要です

// LLMOptionsの拡張
import { LLMOptions } from "../index";

// Databricks特有のオプションを追加
declare module "../index" {
  interface LLMOptions {
    /**
     * 思考プロセスを常にログに表示するかどうかの設定
     * trueの場合は常に表示、falseの場合は開発モードのみ表示
     */
    thinkingProcess?: boolean;
    
    /**
     * 並列ツール呼び出しを許可するかどうか
     * falseの場合、一度に1つのツール呼び出しのみを処理する
     * OpenAIスタイルの並列制御に基づく
     */
    parallelToolCalls?: boolean;
  }

  // 必要であればさらに型拡張を追加
}
