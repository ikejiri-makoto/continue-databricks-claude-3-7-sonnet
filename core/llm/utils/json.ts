/**
 * オブジェクトを安全に文字列化するヘルパーメソッド
 * 様々なLLMプロバイダーでメッセージやレスポンスをシリアライズする際に使用
 * 
 * @param obj 文字列化するオブジェクト
 * @param defaultValue デフォルト値（オブジェクトがnullまたはundefinedの場合）
 * @returns 文字列化されたオブジェクト
 */
export function safeStringify(obj: any, defaultValue: string = ""): string {
  if (obj === null || obj === undefined) {
    return defaultValue;
  }
  
  if (typeof obj === "string") {
    return obj;
  }
  
  if (typeof obj === "object") {
    try {
      return JSON.stringify(obj);
    } catch (e) {
      console.error(`オブジェクトのシリアライズエラー:`, e);
      return defaultValue;
    }
  }
  
  return String(obj);
}

/**
 * 文字列がJSON形式として有効かどうかをチェックする
 * 
 * @param jsonString チェックする文字列
 * @returns 有効なJSONの場合はtrue、そうでない場合はfalse
 */
export function isValidJson(jsonString: string): boolean {
  if (!jsonString || jsonString.trim() === "") {
    return false;
  }
  
  try {
    JSON.parse(jsonString);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 部分的なJSONフラグメントを処理する
 * ストリーミングレスポンスからの不完全なJSONを処理する際に使用
 * 
 * @param fragment JSONフラグメント文字列
 * @returns パース済みのJSONオブジェクト、または処理できない場合はnull
 */
export function processJsonFragment(fragment: string): any | null {
  if (!fragment || fragment.trim() === "") {
    return null;
  }
  
  // 完全なJSONとして解析を試みる
  try {
    return JSON.parse(fragment);
  } catch (e) {
    // 特殊ケース: 完全なJSONではないが、単純な値の場合は適切なオブジェクトとして返す
    if (!fragment.includes('{') && !fragment.includes('}')) {
      const trimmedValue = fragment.trim();
      if (trimmedValue) {
        return { value: trimmedValue };
      }
    }
    
    // 処理できない場合はnullを返す（バッファリングが必要）
    return null;
  }
}
