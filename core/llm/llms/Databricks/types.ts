/**
 * @deprecated このモジュールは非推奨です。代わりに types/index.ts をインポートしてください。
 * すべての型定義は types/types.ts に移動されました。
 * このファイルは後方互換性のためにのみ残されています。
 * 
 * 例:
 * ```typescript
 * // 変更前
 * import { ToolCall } from "./types.ts";
 * 
 * // 変更後
 * import { ToolCall } from "./types/index.ts";
 * ```
 */

// すべての型定義を types/ ディレクトリからインポートして再エクスポート
export * from "./types/index.js";
