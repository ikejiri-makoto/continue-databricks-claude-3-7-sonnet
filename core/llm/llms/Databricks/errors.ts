import { getErrorMessage, isConnectionError } from "../../utils/errors.js";
import { safeJsonParse } from "../../utils/json.js";

// 定数
const MAX_RETRIES = 3;
const MIN_BACKOFF_TIME = 2000; // 初期バックオフ時間 (2秒)
const MAX_BACKOFF_TIME = 30000; // 最大バックオフ時間 (30秒)

/**
 * ストリーミング状態インターフェース
 * ストリーミング処理中の状態を表す
 */
export interface StreamingState {
  jsonBuffer: string;
  isBufferingJson: boolean;
  toolCalls: any[];
  currentToolCallIndex: number | null;
  [key: string]: any; // 追加のプロパティを許可
}

/**
 * エラー処理結果インターフェース
 * エラー処理の結果を表す
 */
export interface ErrorHandlingResult {
  success: boolean;
  messages: any[];
  error: Error;
  state: StreamingState;
}

/**
 * エラーレスポンスインターフェース
 * APIからのエラーレスポンスの形式
 */
export interface ErrorResponse {
  error?: {
    message?: string;
    type?: string;
    code?: string;
    param?: string;
  };
  message?: string;
  status?: number;
}

/**
 * Databricks固有のエラー処理を担当するクラス
 */
export class DatabricksErrorHandler {
  /**
   * エラーレスポンスをパース
   * @param response HTTPレスポンス
   * @returns パース済みエラーレスポンス
   */
  static async parseErrorResponse(
    response: Response
  ): Promise<{
    error: Error;
  }> {
    const errorText = await response.text();
    
    // 共通ユーティリティを使用してJSONパース
    const errorJson = safeJsonParse<ErrorResponse>(errorText, { error: { message: errorText } });
    console.log(`Request ID: ${response.headers.get("request-id")}, Status: ${response.status}`);
    
    // エラーメッセージを安全に取得（複数の場所を確認）
    const errorMessage = 
      (errorJson.error && errorJson.error.message) || // error.message が存在する場合
      errorJson.message || // トップレベルの message が存在する場合
      errorText; // どちらも存在しない場合は元のテキスト
    
    return {
      error: new Error(`Databricks API error: ${response.status} - ${errorMessage}`)
    };
  }

  /**
   * リトライ処理
   * @param retryCount リトライ回数
   * @param error エラー
   * @param state 状態オブジェクト（オプション）
   * @returns リトライすべきかどうか
   */
  static async handleRetry(
    retryCount: number, 
    error: unknown,
    state?: Partial<StreamingState>
  ): Promise<boolean> {
    // 最大リトライ回数を超えた場合
    if (retryCount >= MAX_RETRIES) {
      console.log(`最大リトライ回数(${MAX_RETRIES})に達しました: ${getErrorMessage(error)}`);
      return false;
    }
    
    // バックオフ時間（指数バックオフ）- 初回は短めに、その後長めに
    const backoffTime = Math.min(MIN_BACKOFF_TIME * Math.pow(2, retryCount - 1), MAX_BACKOFF_TIME);
    const errorMessage = getErrorMessage(error);
    console.log(`リトライ準備中 (${retryCount}/${MAX_RETRIES}): ${errorMessage}`);
    
    // エラータイプに応じた処理
    if (isConnectionError(error)) {
      console.log(`接続エラーを検出: ${errorMessage}. リトライします。`);
    } else if (error instanceof DOMException && error.name === 'AbortError') {
      console.log(`タイムアウトによりリクエストが中止されました。リトライします。`);
    } else {
      // リトライすべきでないエラータイプは早期リターン
      console.log(`リトライ不可能なエラータイプ: ${errorMessage}`);
      return false;
    }
    
    // 状態が提供されていればその情報をログ出力
    if (state) {
      console.log(`状態情報: JSONバッファ(${state.jsonBuffer?.length || 0}文字), ツール呼び出し(${state.toolCalls?.length || 0}件)`);
    }
    
    console.log(`${backoffTime}ms後に再試行します...`);
    await new Promise(resolve => setTimeout(resolve, backoffTime));
    return true;
  }

  /**
   * 標準的なリトライ処理を実行する便利なメソッド
   * @param operation 再試行する操作（関数）
   * @param state 現在の状態（オプション）
   * @returns 操作の結果
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    state?: Partial<StreamingState>
  ): Promise<T> {
    let retryCount = 0;
    
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        return await operation();
      } catch (error: unknown) {
        retryCount++;
        const shouldRetry = await this.handleRetry(retryCount, error, state);
        
        if (!shouldRetry) {
          throw error; // リトライ不可または最大回数超過の場合は例外再スロー
        }
      }
    }
  }

  /**
   * ストリーミングエラーの処理
   * @param error エラーオブジェクト
   * @param state 現在の状態
   * @returns エラー処理結果
   */
  static handleStreamingError(
    error: unknown,
    state: StreamingState
  ): ErrorHandlingResult {
    // エラーの詳細をログに記録
    const errorMessage = getErrorMessage(error);
    console.error(`Error processing streaming response: ${errorMessage}`);
    
    // 接続エラーやタイムアウトエラーの場合
    if (isConnectionError(error) || 
        (error instanceof DOMException && error.name === 'AbortError')) {
      
      return { 
        success: false, 
        messages: [], 
        error: error instanceof Error ? error : new Error(errorMessage),
        state: {
          ...state  // 状態を維持
        }
      };
    }
    
    // その他のエラー
    return { 
      success: false, 
      messages: [], 
      error: error instanceof Error ? error : new Error(errorMessage),
      state: {
        jsonBuffer: "",
        isBufferingJson: false,
        toolCalls: [],
        currentToolCallIndex: null
      }
    };
  }

  /**
   * エラーが一時的なものかどうかを判定
   * @param error エラーオブジェクト
   * @returns 一時的なエラーの場合はtrue
   */
  static isTransientError(error: unknown): boolean {
    // 接続エラーはすべて一時的とみなす
    if (isConnectionError(error)) {
      return true;
    }
    
    // DOMException（AbortError）も一時的とみなす
    if (error instanceof DOMException && error.name === 'AbortError') {
      return true;
    }
    
    // エラーメッセージに基づく判定
    const errorMessage = getErrorMessage(error).toLowerCase();
    const transientErrorPatterns = [
      'timeout',
      'timed out',
      'rate limit',
      'throttled',
      'too many requests',
      'service unavailable',
      'internal server error',
      'bad gateway',
      'gateway timeout',
      'temporarily unavailable'
    ];
    
    return transientErrorPatterns.some(pattern => errorMessage.includes(pattern));
  }
}
