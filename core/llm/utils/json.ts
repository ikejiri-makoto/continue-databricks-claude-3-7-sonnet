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
  if (!jsonString || typeof jsonString !== 'string' || jsonString.trim() === "") {
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
 * 完全なJSONオブジェクトの範囲を検出し、余分なコンテンツを取り除く
 * 
 * @param text 処理する文字列
 * @returns 整理されたJSON文字列またはnull
 */
export function extractValidJson(text: string): string | null {
  if (!text || typeof text !== 'string' || text.trim() === "") {
    return null;
  }
  
  // 文字列を整理
  text = text.trim();
  
  // JSONオブジェクトまたは配列の開始を検索
  const startIndex = text.indexOf('{');
  const arrayStartIndex = text.indexOf('[');
  
  // JSONオブジェクトでもJSONアレイでもない場合
  if (startIndex === -1 && arrayStartIndex === -1) {
    return null;
  }
  
  // JSONの開始位置を決定
  const actualStartIndex = startIndex !== -1 ? 
    (arrayStartIndex !== -1 ? Math.min(startIndex, arrayStartIndex) : startIndex) : 
    arrayStartIndex;
  
  // 開始位置より前に余分な文字がある場合は削除
  if (actualStartIndex > 0) {
    text = text.substring(actualStartIndex);
  }
  
  // 深さを追跡して適切な終了ブレースを見つける
  let depth = 0;
  let inString = false;
  let escaped = false;
  let endIndex = -1;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
    } else if (char === '"') {
      inString = true;
    } else if (char === '{' || char === '[') {
      depth++;
    } else if (char === '}' || char === ']') {
      depth--;
      // 最上位レベルのブレースが閉じられた場合
      if (depth === 0) {
        endIndex = i + 1;
        break;
      }
    }
  }
  
  // 完全なJSONが見つかった場合
  if (endIndex !== -1) {
    return text.substring(0, endIndex);
  }
  
  return null;
}

/**
 * 文字列を安全にJSONとしてパースするユーティリティ
 * パースに失敗した場合はデフォルト値を返す
 * JSONの後に余分なコンテンツがある場合も処理できる
 * 
 * @param text パースする文字列
 * @param defaultValue パースに失敗した場合のデフォルト値
 * @returns パース済みオブジェクトまたはデフォルト値
 */
export function safeJsonParse<T>(text: string, defaultValue: T): T {
  if (!text || typeof text !== 'string' || text.trim() === "") {
    return defaultValue;
  }
  
  try {
    // まずそのままパースを試みる
    return JSON.parse(text) as T;
  } catch (e) {
    try {
      // パースに失敗した場合、有効なJSON部分を抽出して再試行
      const validJson = extractValidJson(text);
      
      if (validJson) {
        try {
          return JSON.parse(validJson) as T;
        } catch (innerError) {
          console.warn(`抽出されたJSON解析エラー: ${innerError}`);
        }
      }
      
      // JSONでない可能性のある引数をトリミング
      const trimmedText = text.trim();
      
      // 明らかにJSONオブジェクトの始まりがあるか確認
      if (trimmedText.startsWith('{') && trimmedText.includes('}')) {
        // 最後の閉じ括弧までをパースする試み
        const lastCloseBrace = trimmedText.lastIndexOf('}');
        if (lastCloseBrace > 0) {
          const potentialJson = trimmedText.substring(0, lastCloseBrace + 1);
          try {
            return JSON.parse(potentialJson) as T;
          } catch (e2) {
            console.warn(`部分JSONパースエラー: ${e2}`);
          }
        }
      }
      
      // 同様に配列の場合も処理
      if (trimmedText.startsWith('[') && trimmedText.includes(']')) {
        const lastCloseBracket = trimmedText.lastIndexOf(']');
        if (lastCloseBracket > 0) {
          const potentialJson = trimmedText.substring(0, lastCloseBracket + 1);
          try {
            return JSON.parse(potentialJson) as T;
          } catch (e2) {
            console.warn(`部分JSON配列パースエラー: ${e2}`);
          }
        }
      }
      
      console.warn(`JSON解析エラー: ${e}`);
      return defaultValue;
    } catch (outerError) {
      console.warn(`JSON処理中の予期しないエラー: ${outerError}`);
      return defaultValue;
    }
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
    
    // 有効なJSON部分を抽出して試す
    const validJson = extractValidJson(fragment);
    if (validJson) {
      try {
        return JSON.parse(validJson);
      } catch (innerError) {
        // 抽出したJSONも解析できない場合
      }
    }
    
    // 処理できない場合はnullを返す（バッファリングが必要）
    return null;
  }
}

/**
 * JSONオブジェクトを再帰的にマージする
 * ネストされたオブジェクトも適切にマージします
 * 
 * @param target マージ先のオブジェクト
 * @param source マージ元のオブジェクト
 * @returns マージされたオブジェクト
 */
export function deepMergeJson(target: any, source: any): any {
  // ターゲットオブジェクトのコピーを作成
  const output = Object.assign({}, target);
  
  // 両方がオブジェクトで、nullでない場合のみマージを行う
  if (isObject(target) && isObject(source)) {
    // ソースオブジェクトのすべてのキーを処理
    Object.keys(source).forEach(key => {
      // ソースの値がオブジェクトで、ターゲットの対応する値もオブジェクトの場合、再帰的にマージ
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = deepMergeJson(target[key], source[key]);
        }
      } else {
        // オブジェクトでない値の場合は単純に上書き
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  
  return output;
}

/**
 * 文字列からJSONを抽出し、残りの文字列も返す
 * 
 * @param text 処理する文字列
 * @returns [抽出されたJSON, 残りの文字列のタプル] または null
 */
export function extractJsonAndRemainder(text: string): [any, string] | null {
  const validJson = extractValidJson(text);
  
  if (!validJson) {
    return null;
  }
  
  try {
    const jsonObj = JSON.parse(validJson);
    const remainder = text.substring(text.indexOf(validJson) + validJson.length).trim();
    return [jsonObj, remainder];
  } catch (e) {
    return null;
  }
}

/**
 * JSONデルタを処理するユーティリティ
 * 断片的に受け取るJSONを適切に処理する
 * 
 * @param currentJson 現在のJSON文字列
 * @param deltaJson 新たに受け取ったJSONデルタ
 * @returns 処理結果オブジェクト
 */
export function processJsonDelta(
  currentJson: string,
  deltaJson: string
): { combined: string; complete: boolean; valid: boolean } {
  try {
    // デルタが空の場合は現在のJSONを返す
    if (!deltaJson || deltaJson.trim() === '') {
      return {
        combined: currentJson,
        complete: false,
        valid: isValidJson(currentJson)
      };
    }
    
    // デルタ前に重複パターン検出と修復を適用
    const repairedDelta = repairDuplicatedJsonPattern(deltaJson);
    
    // 現在のJSONが空でデルタが有効なJSONの場合
    if (!currentJson && isValidJson(repairedDelta)) {
      return {
        combined: repairedDelta,
        complete: true,
        valid: true
      };
    }
    
    // 結合して有効なJSONかチェック
    let combined = currentJson + repairedDelta;
    const validJson = extractValidJson(combined);
    const isValid = !!validJson;
    
    // 結合したものが有効でない場合、抽出を試みる
    if (!isValid) {
      if (validJson) {
        return {
          combined: validJson,
          complete: true,
          valid: true
        };
      }
    }
    
    // 完全なJSONかチェック
    const isComplete = isValid && 
      ((validJson?.trim().startsWith("{") && validJson?.trim().endsWith("}")) ||
       (validJson?.trim().startsWith("[") && validJson?.trim().endsWith("]")));
    
    return {
      combined: isValid ? validJson : combined,
      complete: isComplete,
      valid: isValid
    };
  } catch (error) {
    // エラー詳細をログに記録
    console.error(`JSON delta processing error: ${error instanceof Error ? error.message : String(error)}`);
    return {
      combined: currentJson,
      complete: false,
      valid: false
    };
  }
}

/**
 * JSONオブジェクトの二重化パターンを検出して修復
 * 様々なパターンに対応（混合パターンを含む）
 * 
 * @param jsonStr 処理するJSON文字列
 * @returns 修復されたJSON文字列
 */
export function repairDuplicatedJsonPattern(jsonStr: string): string {
  if (!jsonStr || typeof jsonStr !== 'string') {
    return jsonStr;
  }
  
  // デバッグログ追加
  const logInput = jsonStr.length > 50 ? 
    jsonStr.substring(0, 50) + "..." : jsonStr;
  console.log(`JSONパターン修復入力: ${logInput}`);
  
  // パターン1: {"key": "value"{"key": "value"...
  // 複数のパターンタイプを対応
  const duplicatedPattern = /\{\s*"\w+"\s*:\s*("[^"]*"|\d+|true|false|null)\s*\{/;
  if (duplicatedPattern.test(jsonStr)) {
    // 有効なJSONを抽出
    const validJson = extractValidJson(jsonStr);
    if (validJson) {
      console.log(`有効なJSON抽出: ${validJson.length > 50 ? validJson.substring(0, 50) + "..." : validJson}`);
      return validJson;
    }
    
    // 既存の一致パターン
    const duplicateExactPattern = /\{\s*"(\w+)"\s*:\s*"([^"]+)"\s*\}\s*\{\s*"\1"\s*:/;
    if (duplicateExactPattern.test(jsonStr)) {
      // 特定のパターンに対する修復
      // {"name": "value"}{"name": ... -> {"name": "value"}
      const result = jsonStr.replace(duplicateExactPattern, '{$1": "$2"}');
      console.log(`一致キーパターン修復: ${result.length > 50 ? result.substring(0, 50) + "..." : result}`);
      return result;
    }
    
    // メインキー検出
    const mainKey = jsonStr.match(/{"(\w+)"/)?.[1];
    if (mainKey) {
      // 単純な値パターン
      const simpleValuePattern = new RegExp(`{"${mainKey}"\\s*:\\s*("[^"]*"|\\d+|true|false|null)\\s*}`);
      const simpleMatch = jsonStr.match(simpleValuePattern);
      if (simpleMatch && simpleMatch[0]) {
        console.log(`単純値パターン検出: ${simpleMatch[0]}`);
        return simpleMatch[0];
      }
      
      // 混合パターン: {"filepath": "app.py"{"dirPath": "/", ...
      const mixedPattern = new RegExp(`{"${mainKey}"\\s*:\\s*("[^"]*"|\\d+|true|false|null)\\s*{`);
      if (mixedPattern.test(jsonStr)) {
        const firstPart = jsonStr.match(new RegExp(`{"${mainKey}"\\s*:\\s*("[^"]*"|\\d+|true|false|null)`))?.[0];
        if (firstPart) {
          const result = `${firstPart}}`;
          console.log(`混合パターン修復: ${result}`);
          return result;
        }
      }
      
      // 一般的な二重キーパターン (任意のキー)
      const doubleKeyPattern = /\{\s*"(\w+)"\s*:\s*"([^"]+)"\s*\{\s*"\w+"\s*:/;
      const generalMatch = jsonStr.match(doubleKeyPattern);
      if (generalMatch && generalMatch[1] && generalMatch[2]) {
        const result = `{"${generalMatch[1]}": "${generalMatch[2]}"}`;
        console.log(`一般二重キーパターン修復: ${result}`);
        return result;
      }
    }
  }
  
  // パターン2: ネストされたオブジェクトの二重化 {"key": {"nested": "value"}{"anotherKey": "value"}
  const nestedPattern = /}\s*{/;
  if (nestedPattern.test(jsonStr)) {
    const parts = jsonStr.split(/}\s*{/);
    if (parts.length > 1) {
      // 最初の部分に閉じ括弧を追加
      const result = parts[0] + '}';
      console.log(`ネストパターン修復: ${result}`);
      return result;
    }
  }
  
  // パターン3: 特定のツール呼び出しで見られる特殊パターン
  // {"filepath": "app.py"{"filepath": "app.py"{"dirPath": "/", "recursive": false}
  const repeatedFilepathPattern = /\{\s*"filepath"\s*:\s*"([^"]+)"\s*\{\s*"filepath"\s*:/;
  const filepathMatch = jsonStr.match(repeatedFilepathPattern);
  if (filepathMatch && filepathMatch[1]) {
    const result = `{"filepath": "${filepathMatch[1]}"}`;
    console.log(`filepath特殊パターン修復: ${result}`);
    return result;
  }
  
  // パターン4: filepath + dirPath混合パターン
  const mixedFilepathDirPathPattern = /\{\s*"filepath"\s*:\s*"([^"]+)"\s*\{\s*"dirPath"\s*:/;
  const mixedMatch = jsonStr.match(mixedFilepathDirPathPattern);
  if (mixedMatch && mixedMatch[1]) {
    const result = `{"filepath": "${mixedMatch[1]}"}`;
    console.log(`filepath+dirPath混合パターン修復: ${result}`);
    return result;
  }
  
  return jsonStr;
}

/**
 * ツール引数をデルタベースで処理
 * 部分的なJSONフラグメントを累積し、完全なJSONになるまで処理
 * 
 * @param currentArgs 現在の引数文字列
 * @param deltaArgs 新しい引数フラグメント
 * @returns 処理結果オブジェクト
 */
export function processToolArgumentsDelta(
  currentArgs: string,
  deltaArgs: string
): { processedArgs: string; isComplete: boolean } {
  // 空のフラグメントは無視
  if (!deltaArgs || deltaArgs.trim() === '') {
    return { 
      processedArgs: currentArgs, 
      isComplete: isValidJson(currentArgs) 
    };
  }
  
  // デルタ前に重複パターン検出と修復を適用
  const repairedDelta = repairDuplicatedJsonPattern(deltaArgs);
  
  // JSONデルタ処理を使用
  const result = processJsonDelta(currentArgs, repairedDelta);
  
  // 完全なJSONかどうかをチェック
  if (result.complete && result.valid) {
    // 有効なJSONを抽出
    const validJson = extractValidJson(result.combined);
    if (validJson) {
      try {
        // JSONとして解析してみる
        const parsed = JSON.parse(validJson);
        return {
          processedArgs: JSON.stringify(parsed),
          isComplete: true
        };
      } catch (e) {
        // 解析エラーの場合は不完全とみなす
        console.warn(`JSONパース失敗: ${e instanceof Error ? e.message : String(e)}`);
        return {
          processedArgs: result.combined,
          isComplete: false
        };
      }
    }
  }
  
  // まだ完全なJSONではない場合
  return {
    processedArgs: result.combined,
    isComplete: false
  };
}

/**
 * 値がオブジェクトかどうかを判定するヘルパー関数
 * 
 * @param item チェックする値
 * @returns オブジェクトの場合はtrue、そうでない場合はfalse
 */
function isObject(item: any): boolean {
  return (item && typeof item === 'object' && !Array.isArray(item) && item !== null);
}