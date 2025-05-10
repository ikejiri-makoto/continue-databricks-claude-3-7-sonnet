/**
 * SSE（Server-Sent Events）処理の共通ユーティリティ
 * このファイルには、様々なLLMプロバイダーで使用できるSSE処理のヘルパー関数が含まれています。
 */
import { streamResponse } from "../stream.js";

/**
 * SSEのデータ行を解析する
 * @param line 解析する行
 * @returns パース済みのデータオブジェクト
 */
function parseDataLine(line: string): any {
  const json = line.startsWith("data: ")
    ? line.slice("data: ".length)
    : line.slice("data:".length);

  try {
    const data = JSON.parse(json);
    if (data.error) {
      throw new Error(`Error streaming response: ${data.error}`);
    }

    return data;
  } catch (e) {
    throw new Error(`Malformed JSON sent from server: ${json}`);
  }
}

/**
 * SSEの行を解析してイベント種別と内容を抽出する
 * @param line 解析する行
 * @returns 完了フラグとデータオブジェクト
 */
function parseSseLine(line: string): { done: boolean; data: any } {
  if (line.startsWith("data: [DONE]")) {
    return { done: true, data: undefined };
  }
  if (line.startsWith("data:")) {
    return { done: false, data: parseDataLine(line) };
  }
  if (line.startsWith(": ping")) {
    return { done: true, data: undefined };
  }
  return { done: false, data: undefined };
}

/**
 * SSEストリームを解析し、チャンクデータを生成する
 * 様々なLLMプロバイダーのSSEレスポンス処理に使用可能
 * 
 * @param response サーバーからのレスポンス
 * @param customLineParser カスタム行パーサー（オプション）
 * @returns データチャンクを生成する非同期ジェネレーター
 */
export async function* processSSEStream(
  response: Response,
  customLineParser: (line: string) => { done: boolean; data: any } = parseSseLine
): AsyncGenerator<any> {
  let buffer = "";
  for await (const value of streamResponse(response)) {
    buffer += value;

    let position: number;
    while ((position = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, position);
      buffer = buffer.slice(position + 1);

      const { done, data } = customLineParser(line);
      if (done) {
        break;
      }
      if (data) {
        yield data;
      }
    }
  }

  // 最後に残ったバッファを処理
  if (buffer.length > 0) {
    const { done, data } = customLineParser(buffer);
    if (!done && data) {
      yield data;
    }
  }
}

/**
 * SSE処理に関する追加ヘルパー関数の集まり
 */
export const SSEHelpers = {
  /**
   * 標準的なSSE行パーサー
   */
  parseSseLine,
  
  /**
   * データ行パーサー
   */
  parseDataLine,
  
  /**
   * エラーメッセージを持つチャンクかどうかを確認
   * @param chunk SSEチャンク
   * @returns エラーメッセージを含む場合はtrue
   */
  hasError(chunk: any): boolean {
    return chunk && (chunk.error || (chunk.choices && chunk.choices[0]?.error));
  },
  
  /**
   * チャンクからエラーメッセージを抽出
   * @param chunk SSEチャンク
   * @returns エラーメッセージ文字列
   */
  extractErrorMessage(chunk: any): string {
    if (!chunk) return "不明なエラー";
    
    if (chunk.error) {
      return typeof chunk.error === "string" 
        ? chunk.error 
        : chunk.error.message || "API処理中にエラーが発生しました";
    }
    
    if (chunk.choices && chunk.choices[0]?.error) {
      return typeof chunk.choices[0].error === "string"
        ? chunk.choices[0].error
        : chunk.choices[0].error.message || "API処理中にエラーが発生しました";
    }
    
    return "不明なエラー";
  }
};
