/**
 * ストリーミングエラーの基本インターフェース
 * 様々なLLMプロバイダーで使用できる一般的なエラー構造
 */
export interface BaseStreamingError {
  message?: string;
  code?: string;
  stack?: string;
}

/**
 * エラーオブジェクトからエラーメッセージを安全に抽出するヘルパーメソッド
 * 様々な形式のエラーオブジェクトから一貫したメッセージを取得する
 * @param error 任意のエラーオブジェクト
 * @returns エラーメッセージ文字列
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || "不明なエラー";
  }
  
  if (typeof error === "object" && error !== null) {
    const err = error as BaseStreamingError;
    return err.message || "詳細不明のエラー";
  }
  
  if (typeof error === "string") {
    return error;
  }
  
  return String(error) || "エラー情報なし";
}

/**
 * エラーがストリーミング接続切断関連かどうかを判定するヘルパーメソッド
 * 様々なLLMプロバイダーで使用できる
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
    const err = error as BaseStreamingError;
    
    // メッセージでの判定
    if (err.message && (
        err.message.includes("Premature close") ||
        err.message.includes("aborted") ||
        err.message.includes("network error") ||
        err.message.includes("timeout")
    )) {
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
