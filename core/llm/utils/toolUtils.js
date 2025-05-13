import { extractQueryContext } from "./messageUtils.js";
import { extractValidJson, safeJsonParse, safeStringify } from "./json.js";

/**
 * 検索ツールかどうかを判断する関数
 * 
 * この関数は、与えられたツール名が検索関連のツールであるかを判断します。
 * 英語の"search"や日本語の"検索"という単語が含まれているかで判定します。
 * 
 * @param {string} toolName - 判定するツール名
 * @returns {boolean} 検索ツールの場合はtrue、それ以外はfalse
 */
export function isSearchTool(toolName) {
  if (!toolName || typeof toolName !== "string") {
    return false;
  }
  
  const lowerCaseName = toolName.toLowerCase();
  return lowerCaseName.includes("search") || 
         lowerCaseName.includes("検索");
}

/**
 * 特定のタイプのツールかどうかを判断する関数
 * 
 * 与えられたツール名が特定のパターンに一致するかを検証します。
 * 
 * @param {string} toolName - 判定するツール名
 * @param {string[]} typePatterns - チェックするパターンの配列
 * @returns {boolean} パターンに一致する場合はtrue
 */
export function isToolOfType(toolName, typePatterns) {
  if (!toolName || !typePatterns || !Array.isArray(typePatterns)) {
    return false;
  }
  
  const lowerCaseName = toolName.toLowerCase();
  
  return typePatterns.some(pattern => 
    lowerCaseName.includes(pattern.toLowerCase())
  );
}

/**
 * 検索ツール引数を適切に処理する関数
 * 
 * この関数は、検索ツールの引数を処理し、適切なクエリパラメータが
 * 常に存在するようにします。引数がJSONフォーマットでない場合や、
 * クエリが不足している場合は、メッセージ履歴から抽出したコンテキストを
 * 利用してクエリを設定します。
 * 
 * @param {string} toolName - ツール名
 * @param {string} currentArgs - 現在の引数（JSON文字列）
 * @param {string} newArgs - 新しい引数（JSON文字列または通常の文字列）
 * @param {Array} messages - メッセージ履歴
 * @returns {string} 処理後の引数（JSON文字列）
 */
export function processSearchToolArguments(toolName, currentArgs, newArgs, messages) {
  // 検索ツールでない場合は新しい引数をそのまま返す
  if (!isSearchTool(toolName)) {
    return newArgs;
  }

  try {
    // 新しい引数がJSON形式の場合はパース
    const parsedNew = JSON.parse(newArgs);
    
    // すでにqueryプロパティがある場合はそのまま返す
    if (parsedNew.query && typeof parsedNew.query === "string" && 
        parsedNew.query.trim() !== "") {
      return JSON.stringify(parsedNew);
    }

    // 既存の引数があればパース
    let existing = {};
    if (currentArgs && currentArgs !== "{}" && currentArgs !== "") {
      try {
        existing = JSON.parse(currentArgs);
      } catch (e) {
        // パース失敗時はコンテキストから抽出
        existing = { query: extractQueryContext(messages) };
      }
    } else {
      // 既存の引数がない場合はコンテキストから抽出
      existing = { query: extractQueryContext(messages) };
    }

    // 既存と新規をマージ
    const merged = { ...existing, ...parsedNew };
    
    // queryプロパティがない場合は追加
    if (!merged.query || merged.query === "") {
      merged.query = extractQueryContext(messages);
    }

    return JSON.stringify(merged);
  } catch (e) {
    // JSONパースに失敗した場合
    // 文字列をそのままqueryとして使用
    const queryContext = newArgs.trim() || extractQueryContext(messages);
    return JSON.stringify({ query: queryContext });
  }
}

/**
 * ツール結果をフォーマットする関数
 * 
 * ツール実行結果メッセージを受け取り、適切な形式にフォーマットします。
 * 各ツール実行結果は特定のフォーマットでテキストに変換されます。
 * 
 * @param {Array} toolResults - ツール結果メッセージの配列
 * @returns {string} フォーマットされたツール結果テキスト
 */
export function formatToolResultsContent(toolResults) {
  if (!toolResults || !Array.isArray(toolResults) || toolResults.length === 0) {
    return "";
  }
  
  // 各ツール結果をフォーマット
  const formattedResults = toolResults.map(result => {
    if (!result || typeof result !== "object") {
      return "";
    }
    
    const toolCallId = result.tool_call_id || "";
    const content = result.content || "";
    
    return `<tool_results tool_call_id="${toolCallId}">\n${content}\n</tool_results>\n\n`;
  });
  
  // すべての結果を連結
  return formattedResults.join("");
}

/**
 * モデルがツールをサポートしているかを確認する関数
 * 
 * 特定のプロバイダとモデルの組み合わせがツールをサポートしているかどうかを
 * 判断します。Databricksプロバイダの場合は、Claude 3.7 Sonnetモデルが
 * ツールをサポートしていることを確認します。
 * 
 * @param {string} provider - プロバイダ名
 * @param {string} model - モデル名
 * @returns {boolean} ツールをサポートしている場合はtrue
 */
export function doesModelSupportTools(provider, model) {
  if (!provider || !model) {
    return false;
  }
  
  // プロバイダ固有のチェック
  switch (provider.toLowerCase()) {
    case "databricks":
      // Databricksの場合、Claude 3.7 Sonnetがツールをサポート
      return model.toLowerCase().includes("claude-3-7") || 
             model.toLowerCase().includes("claude-3.7") ||
             model.toLowerCase().includes("claude-3-sonnet") ||
             model.toLowerCase().includes("claude-3.5") ||
             model.toLowerCase().includes("claude-3-5");
    
    case "anthropic":
      // Anthropicの場合もClaude 3.x系がツールをサポート
      return model.toLowerCase().includes("claude-3") ||
             model.toLowerCase().includes("claude-3.5") || 
             model.toLowerCase().includes("claude-3.7");
    
    case "openai":
      // OpenAIの場合はGPT-4系がツールをサポート
      return model.toLowerCase().includes("gpt-4") ||
             model.toLowerCase().includes("gpt-4-turbo");
    
    default:
      // 他のプロバイダはケースバイケースで判断
      return false;
  }
}

/**
 * ツール呼び出し引数の修復を試みる関数
 * 特に入れ子構造や重複する引数の問題を修正
 * 
 * @param {string} args 修復する引数文字列
 * @returns {string} 修復された引数文字列
 */
export function repairToolArguments(args) {
  if (!args || args.trim() === '') {
    return '{}';
  }
  
  try {
    // まず直接JSONとしてパースしてみる
    JSON.parse(args);
    return args; // パースに成功したら元の文字列を返す
  } catch (e) {
    // パースに失敗した場合は修復を試みる
    console.log(`JSONパースに失敗しました。修復を試みます: ${args.substring(0, 100)}`);
    
    // 有効なJSONを抽出
    try {
      // ブール値の修復を試みる
      const fixedBooleanArgs = tryFixBrokenBooleanJson(args);
      if (fixedBooleanArgs !== args) {
        try {
          JSON.parse(fixedBooleanArgs);
          console.log(`ブール値の修復に成功しました: ${fixedBooleanArgs.substring(0, 100)}`);
          return fixedBooleanArgs; // ブール値修復後のJSONが有効ならそれを返す
        } catch (e3) {
          // 修復したがまだ無効な場合は次の方法を試す
          console.log(`ブール修復後のJSON解析エラー: ${e3}`);
        }
      }
      
      // 重複パターンの修復を試みる
      const repairedArgs = repairDuplicatedJsonPattern(args);
      if (repairedArgs !== args) {
        try {
          JSON.parse(repairedArgs);
          console.log(`重複パターンの修復に成功しました: ${repairedArgs.substring(0, 100)}`);
          return repairedArgs; // 修復後のJSONが有効ならそれを返す
        } catch (e2) {
          // 修復したがまだ無効な場合は次の方法を試す
          console.log(`重複修復後のJSON解析エラー: ${e2}`);
        }
      }
      
      // 括弧の不一致を修復 - 追加
      const bracketFixedArgs = fixMismatchedBrackets(args);
      if (bracketFixedArgs !== args) {
        try {
          JSON.parse(bracketFixedArgs);
          console.log(`括弧の修復に成功しました: ${bracketFixedArgs.substring(0, 100)}`);
          return bracketFixedArgs;
        } catch (e4) {
          // 修復したがまだ無効な場合は次の方法を試す
          console.log(`括弧修復後のJSON解析エラー: ${e4}`);
        }
      }
      
      // 有効なJSON部分の抽出を試みる - より積極的に抽出
      let validJson = extractValidJson(args);
      if (!validJson) {
        // 部分的なJSON抽出を改善 - 厳格でないJSONの検出
        validJson = extractJsonObject(args);
      }
      
      if (validJson) {
        try {
          JSON.parse(validJson);
          console.log(`有効なJSON部分の抽出に成功しました: ${validJson.substring(0, 100)}`);
          return validJson; // 有効なJSON部分があればそれを返す
        } catch (e4) {
          // 無効な場合は引き続き処理
          console.log(`抽出後のJSON解析エラー: ${e4}`);
        }
      }
      
      // キーと値の区切り問題の修復 - 新機能
      const colonFixedArgs = fixMissingColons(args);
      if (colonFixedArgs !== args) {
        try {
          JSON.parse(colonFixedArgs);
          console.log(`キーと値の区切り修復に成功しました: ${colonFixedArgs.substring(0, 100)}`);
          return colonFixedArgs;
        } catch (e5) {
          console.log(`区切り修復後のJSON解析エラー: ${e5}`);
        }
      }
      
      // カンマの問題修復 - 新機能
      const commaFixedArgs = fixMissingCommas(args);
      if (commaFixedArgs !== args) {
        try {
          JSON.parse(commaFixedArgs);
          console.log(`カンマの修復に成功しました: ${commaFixedArgs.substring(0, 100)}`);
          return commaFixedArgs;
        } catch (e6) {
          console.log(`カンマ修復後のJSON解析エラー: ${e6}`);
        }
      }
      
      // 特定のパターンに対する修正
      // パターン1: {"key": "value"{"key": ...
      const doublePropertyPattern = /\{\s*"(\w+)"\s*:\s*"(.*?)"\s*\{\s*"\1"\s*:/;
      const match = args.match(doublePropertyPattern);
      if (match && match[1] && match[2]) {
        const fixedJson = `{"${match[1]}": "${match[2]}"}`;
        try {
          JSON.parse(fixedJson);
          console.log(`特定パターンの修復に成功しました: ${fixedJson}`);
          return fixedJson;
        } catch (e5) {
          console.log(`パターン修復後のJSON解析エラー: ${e5}`);
        }
      }
      
      // パターン2: 不完全なJSONの閉じ括弧を追加
      if (args.includes('{') && !args.includes('}')) {
        const fixedJson = args + '}';
        try {
          JSON.parse(fixedJson);
          console.log(`括弧追加の修復に成功しました: ${fixedJson.substring(0, 100)}`);
          return fixedJson;
        } catch (e6) {
          console.log(`括弧修復後のJSON解析エラー: ${e6}`);
        }
      }
      
      // パターン3: 特に対象となる "recursive": fffalsee パターンを直接修正
      const falsePattern = /"(recursive|\w+)"\s*:\s*f+alse+([,}])/g;
      if (falsePattern.test(args)) {
        const fixedJson = args.replace(falsePattern, '"$1": false$2');
        try {
          JSON.parse(fixedJson);
          console.log(`ブール直接修復に成功しました: ${fixedJson.substring(0, 100)}`);
          return fixedJson;
        } catch (e7) {
          console.log(`ブール直接修復後のJSON解析エラー: ${e7}`);
        }
      }
      
      // 引用符のエスケープ問題の修復 - 新機能
      const quoteFixedArgs = fixEscapedQuotes(args);
      if (quoteFixedArgs !== args) {
        try {
          JSON.parse(quoteFixedArgs);
          console.log(`引用符の修復に成功しました: ${quoteFixedArgs.substring(0, 100)}`);
          return quoteFixedArgs;
        } catch (e8) {
          console.log(`引用符修復後のJSON解析エラー: ${e8}`);
        }
      }
      
      // 最後の試み: 新しい空のJSONオブジェクトを返す
      console.log(`全ての修復方法が失敗しました。空のオブジェクトを返します。`);
      return '{}';
    } catch (innerError) {
      // エラーが発生した場合は空のJSONオブジェクトを返す
      console.warn(`引数の修復に失敗しました: ${innerError}`);
      return '{}';
    }
  }
}

/**
 * 正しいJSON構造に修復するためのデルタ処理
 * 
 * @param {string} currentArgs 現在の引数文字列
 * @param {string} deltaArgs 追加の引数文字列
 * @returns {{processedArgs: string, isComplete: boolean}} 処理結果と完了状態
 */
export function processToolArgumentsDelta(currentArgs, deltaArgs) {
  // 引数の検証
  if (!deltaArgs) {
    return { 
      processedArgs: currentArgs || "{}",
      isComplete: isValidJson(currentArgs)
    };
  }
  
  // 両方とも空の場合
  if (!currentArgs && !deltaArgs) {
    return { processedArgs: "{}", isComplete: true };
  }
  
  // 最初のデルタの場合
  if (!currentArgs) {
    return { 
      processedArgs: deltaArgs,
      isComplete: isValidJson(deltaArgs)
    };
  }
  
  try {
    // JSONデルタ処理
    const result = processJsonDelta(currentArgs, deltaArgs);
    
    return {
      processedArgs: result.combined,
      isComplete: result.complete && result.valid
    };
  } catch (e) {
    console.warn(`JSONデルタ処理エラー: ${e}`);
    
    // 通常の連結処理
    const combined = currentArgs + deltaArgs;
    
    // 修復を試みる
    const repaired = repairToolArguments(combined);
    
    return {
      processedArgs: repaired,
      isComplete: isValidJson(repaired)
    };
  }
}

/**
 * JSONデルタを処理する関数
 * JSONの部分的なフラグメントを処理し、完全なJSONを構築する
 * 
 * @param {string} currentJson 現在のJSON文字列
 * @param {string} deltaJson 追加のJSON文字列
 * @returns {{combined: string, complete: boolean, valid: boolean}} 処理結果
 */
function processJsonDelta(currentJson, deltaJson) {
  // 引数の検証
  if (!deltaJson) {
    return { 
      combined: currentJson || "{}",
      complete: isValidJson(currentJson),
      valid: isValidJson(currentJson)
    };
  }
  
  // 両方とも空の場合
  if (!currentJson && !deltaJson) {
    return { combined: "{}", complete: true, valid: true };
  }
  
  // 最初のデルタの場合
  if (!currentJson) {
    const isValid = isValidJson(deltaJson);
    return { 
      combined: deltaJson,
      complete: isValid,
      valid: isValid
    };
  }
  
  // 現在のJSONが既に完全な場合
  if (isValidJson(currentJson)) {
    return { combined: currentJson, complete: true, valid: true };
  }
  
  // 連結されたJSONが完全な場合
  const combined = currentJson + deltaJson;
  if (isValidJson(combined)) {
    return { combined, complete: true, valid: true };
  }
  
  // 不完全なJSONの処理
  return {
    combined, 
    complete: false,
    valid: false
  };
}

/**
 * 破損したブール値を含むJSONを修復する試み
 * 特に "fffalsee" のような重複パターンや切断されたブール値を処理する
 * 
 * @param {string} text 修復する文字列
 * @returns {string} 修復された文字列または元の文字列（修復できない場合）
 */
function tryFixBrokenBooleanJson(text) {
  if (!text || typeof text !== 'string') {
    return text;
  }
  
  let result = text;

  // 重複したブール値パターンの修復
  // "fffalsee" -> "false" の修復 (falseが重複した場合)
  result = result.replace(/([{,]\s*"\w+"\s*:)\s*f+alse+([,}])/g, '$1 false$2');
  
  // "ttruee" -> "true" の修復 (trueが重複した場合)
  result = result.replace(/([{,]\s*"\w+"\s*:)\s*t+rue+([,}])/g, '$1 true$2');
  
  // "rue" -> "true" の修復 (trueが切断された場合)
  result = result.replace(/([{,]\s*"\w+"\s*:)\s*rue([,}])/g, '$1 true$2');
  
  // "als" または "alse" -> "false" の修復 (falseが切断された場合)
  result = result.replace(/([{,]\s*"\w+"\s*:)\s*als([,}])/g, '$1 false$2');
  result = result.replace(/([{,]\s*"\w+"\s*:)\s*alse([,}])/g, '$1 false$2');
  
  // オブジェクト終了時の特殊ケース修復
  // "fffalsee}" -> "false}" の修復
  if (result.includes('fffalsee}')) {
    result = result.replace(/fffalsee}/g, 'false}');
  }
  
  // "falsee}" -> "false}" の修復
  if (result.includes('falsee}')) {
    result = result.replace(/falsee}/g, 'false}');
  }
  
  // "ue}" -> "true}" の修復
  if (result.includes('ue}')) {
    result = result.replace(/ue}/g, 'true}');
  }
  
  // "ue," -> "true," の修復
  if (result.includes('ue,')) {
    result = result.replace(/ue,/g, 'true,');
  }
  
  return result;
}

/**
 * 重複するJSONパターンの修復を試みる
 * 特に "{...}{...}" のようなパターンを検出して修復
 * 
 * @param {string} jsonStr 修復する文字列
 * @returns {string} 修復された文字列または元の文字列
 */
function repairDuplicatedJsonPattern(jsonStr) {
  if (!jsonStr || typeof jsonStr !== 'string') {
    return jsonStr;
  }
  
  // ケース1: 完全な重複 - 最初の閉じ括弧の後に開き括弧がある場合
  if (jsonStr.includes('}{')) {
    // 最初の有効なJSONブロックを抽出
    const firstClosingBrace = jsonStr.indexOf('}');
    if (firstClosingBrace > 0) {
      const firstBlock = jsonStr.substring(0, firstClosingBrace + 1);
      
      // 最初のブロックが有効なJSONかチェック
      try {
        JSON.parse(firstBlock);
        return firstBlock; // 有効なら最初のブロックを返す
      } catch (e) {
        // 無効なら次の修復方法を試す
      }
    }
  }
  
  // ケース2: プロパティの重複 - 例: {"query": "test"{"query": "test"}
  const propertyMatch = jsonStr.match(/(\{"[\w\s]+"\s*:\s*"[^"]*")\s*(\{"[\w\s]+"\s*:\s*"[^"]*")/);
  if (propertyMatch && propertyMatch[1]) {
    const fixedJson = propertyMatch[1] + '}';
    
    // 修復されたJSONが有効かチェック
    try {
      JSON.parse(fixedJson);
      return fixedJson;
    } catch (e) {
      // 無効なら次の修復方法を試す
    }
  }
  
  // ケース3: 入れ子になった重複 - 例: {"outer": {"inner": {"prop": "value"}{"prop": "value"}}}
  const nestedMatch = jsonStr.match(/(.*\{)([^{]*\{[^{]*)\{/);
  if (nestedMatch && nestedMatch[1] && nestedMatch[2]) {
    // 入れ子構造の修復を試みる
    const openingPart = nestedMatch[1];
    const middlePart = nestedMatch[2];
    const restPart = jsonStr.substring(openingPart.length + middlePart.length);
    
    // 閉じ括弧のバランスを計算
    const openBraces = (openingPart + middlePart).split('{').length - 1;
    const closeBraces = (openingPart + middlePart).split('}').length - 1;
    const missingBraces = openBraces - closeBraces;
    
    if (missingBraces > 0) {
      // 足りない閉じ括弧を追加
      const fixedJson = openingPart + middlePart + "}" + restPart;
      
      // 修復されたJSONが有効かチェック
      try {
        JSON.parse(fixedJson);
        return fixedJson;
      } catch (e) {
        // 無効なら元の文字列を返す
      }
    }
  }
  
  // 修復できない場合は元の文字列を返す
  return jsonStr;
}

/**
 * 括弧の不一致を修復する関数 - 追加機能
 * 開き括弧と閉じ括弧の数が合わない場合に修復を試みる
 * 
 * @param {string} jsonStr 修復する文字列
 * @returns {string} 修復された文字列または元の文字列
 */
function fixMismatchedBrackets(jsonStr) {
  if (!jsonStr || typeof jsonStr !== 'string') {
    return jsonStr;
  }
  
  // 開き括弧と閉じ括弧の数を数える
  const openBraces = (jsonStr.match(/\{/g) || []).length;
  const closeBraces = (jsonStr.match(/\}/g) || []).length;
  
  // 括弧が一致している場合は修復不要
  if (openBraces === closeBraces) {
    return jsonStr;
  }
  
  // 開き括弧が多い場合は閉じ括弧を追加
  if (openBraces > closeBraces) {
    const missingBraces = openBraces - closeBraces;
    return jsonStr + "}".repeat(missingBraces);
  }
  
  // 閉じ括弧が多い場合は最初の余分な閉じ括弧以降を削除
  if (closeBraces > openBraces) {
    let count = 0;
    for (let i = 0; i < jsonStr.length; i++) {
      if (jsonStr[i] === '{') count++;
      if (jsonStr[i] === '}') count--;
      
      // 閉じ括弧が開き括弧より多くなった位置を検出
      if (count < 0) {
        // その位置までの文字列を抽出
        const truncated = jsonStr.substring(0, i);
        
        // 足りない開き括弧を追加
        return '{' + truncated;
      }
    }
  }
  
  // 修復できなかった場合は元の文字列を返す
  return jsonStr;
}

/**
 * コロン不足を修復する関数 - 新機能
 * キーと値の間のコロンが欠けている場合に修復を試みる
 * 
 * @param {string} jsonStr 修復する文字列
 * @returns {string} 修復された文字列または元の文字列
 */
function fixMissingColons(jsonStr) {
  if (!jsonStr || typeof jsonStr !== 'string') {
    return jsonStr;
  }
  
  // "key" "value" または "key" value のパターンを検出して修復
  return jsonStr.replace(/"(\w+)"\s+(?=["{[]|true|false|null|\d)/g, '"$1": ');
}

/**
 * カンマ不足を修復する関数 - 新機能
 * プロパティ間のカンマが欠けている場合に修復を試みる
 * 
 * @param {string} jsonStr 修復する文字列
 * @returns {string} 修復された文字列または元の文字列
 */
function fixMissingCommas(jsonStr) {
  if (!jsonStr || typeof jsonStr !== 'string') {
    return jsonStr;
  }
  
  // "value" "key" のパターンを検出して修復
  return jsonStr.replace(/("[^"]*"|\btrue\b|\bfalse\b|\bnull\b|\d+(?:\.\d+)?)\s*"(\w+)"/g, '$1, "$2"');
}

/**
 * 厳格でないJSONオブジェクトの抽出 - 新機能
 * JSON構文解析に失敗するが、JSONっぽいオブジェクトを抽出する
 * 
 * @param {string} text 処理する文字列
 * @returns {string} 抽出されたJSONオブジェクトまたは空文字列
 */
function extractJsonObject(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  // 最初の開き括弧を検索
  const startIdx = text.indexOf('{');
  if (startIdx === -1) {
    return '';
  }
  
  // 最後の閉じ括弧を検索
  const endIdx = text.lastIndexOf('}');
  if (endIdx === -1 || endIdx <= startIdx) {
    // 閉じ括弧がない場合は、開き括弧から最後までを抽出して閉じ括弧を追加
    return text.substring(startIdx) + '}';
  }
  
  // 開き括弧から閉じ括弧までを抽出
  return text.substring(startIdx, endIdx + 1);
}

/**
 * 引用符のエスケープ問題を修復する関数 - 新機能
 * JSONで不正にエスケープされた引用符を修復する
 * 
 * @param {string} jsonStr 修復する文字列
 * @returns {string} 修復された文字列または元の文字列
 */
function fixEscapedQuotes(jsonStr) {
  if (!jsonStr || typeof jsonStr !== 'string') {
    return jsonStr;
  }
  
  // 不正にエスケープされた引用符を正しくエスケープ
  let result = jsonStr;
  
  // エスケープされていない引用符をエスケープ
  result = result.replace(/([^\\])"/g, '$1\\"');
  
  // 二重エスケープを修正
  result = result.replace(/\\\\/g, '\\');
  
  // プロパティ名の引用符は元に戻す
  result = result.replace(/\{\\"/g, '{"');
  result = result.replace(/\\"\}/g, '"}');
  result = result.replace(/\\",/g, '",');
  result = result.replace(/,\\"/g, ',"');
  
  return result;
}

// 共通ユーティリティへの参照のためにエクスポート
export { processJsonDelta };