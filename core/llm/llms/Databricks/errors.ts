import { getErrorMessage, isConnectionError } from "../../utils/errors.js";
import { safeJsonParse } from "../../utils/json.js";

// 定数
const MAX_RETRIES = 3;
const MIN_BACKOFF_TIME = 2000; // 初期バックオフ時間 (2秒)
const MAX_BACKOFF_TIME = 30000; // 最大バックオフ時間 (30秒)

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
    
    // 型を明示的に指定
    interface ErrorResponse {
      error?: {
        message?: string;
      };
      message?: string;
    }
    
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
   */
  static async handleRetry(
    retryCount: number, 
    error: Error,
    state?: any
  ): Promise<void> {
    // バックオフ時間（指数バックオフ）- 初回は短めに、その後長めに
    const backoffTime = Math.min(MIN_BACKOFF_TIME * Math.pow(2, retryCount - 1), MAX_BACKOFF_TIME);
    console.log(`リトライ準備中 (${retryCount}/${MAX_RETRIES}): ${error.message || 'Unknown error'}`);
    
    // エラータイプに応じた処理
    if (isConnectionError(error)) {
      console.log(`接続エラーを検出: ${error.message}. リトライします。`);
    } else if (error instanceof DOMException && error.name === 'AbortError') {
      console.log(`タイムアウトによりリクエストが中止されました。リトライします。`);
    }
    
    // 状態が提供されていればその情報をログ出力
    if (state) {
      console.log(`状態情報: JSONバッファ(${state.jsonBuffer?.length || 0}文字), ツール呼び出し(${state.toolCalls?.length || 0}件)`);
    }
    
    console.log(`${backoffTime}ms後に再試行します...`);
    await new Promise(resolve => setTimeout(resolve, backoffTime));
  }

  /**
   * ストリーミングエラーの処理
   * @param error エラーオブジェクト
   * @param state 現在の状態
   * @returns エラー処理結果
   */
  static handleStreamingError(
    error: unknown,
    state: {
      jsonBuffer: string;
      isBufferingJson: boolean;
      toolCalls: any[];
      currentToolCallIndex: number | null;
    }
  ): {
    success: boolean;
    messages: any[];
    error: Error;
    state: any;
  } {
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
          jsonBuffer: state.jsonBuffer,
          isBufferingJson: state.isBufferingJson,
          toolCalls: state.toolCalls,
          currentToolCallIndex: state.currentToolCallIndex
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
}
