import { StreamingError } from "./types.js";

// 注: このファイルは、Databricks固有のエラー処理ロジックを提供します
// 将来的に親ディレクトリに共通のエラー処理ロジックが実装された場合は、
// そちらをインポートするように変更することを検討してください

/**
 * エラーオブジェクトからエラーメッセージを安全に抽出するヘルパーメソッド
 * @param error 任意のエラーオブジェクト
 * @returns エラーメッセージ文字列
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || "不明なエラー";
  }
  
  if (typeof error === "object" && error !== null) {
    const err = error as StreamingError;
    return err.message || "詳細不明のエラー";
  }
  
  if (typeof error === "string") {
    return error;
  }
  
  return String(error) || "エラー情報なし";
}

/**
 * エラーがストリーミング接続切断関連かどうかを判定するヘルパーメソッド
 * @param error 任意のエラーオブジェクト
 * @returns 接続切断エラーの場合はtrue
 */
export function isConnectionError(error: unknown): boolean {
  // Errorインスタンスの場合
  if (error instanceof Error) {
    if (error.message && error.message.includes("Premature close")) {
      return true;
    }
  }
  
  // エラーオブジェクトの場合
  if (typeof error === "object" && error !== null) {
    const err = error as StreamingError;
    
    // メッセージでの判定
    if (err.message && err.message.includes("Premature close")) {
      return true;
    }
    
    // エラーコードでの判定
    if (err.code) {
      const connectionErrorCodes = [
        'ERR_STREAM_PREMATURE_CLOSE',
        'ECONNRESET',
        'ETIMEDOUT',
        'ECONNABORTED',
        'ENETUNREACH',
        'ENOTFOUND'
      ];
      return connectionErrorCodes.includes(err.code);
    }
  }
  
  return false;
}
