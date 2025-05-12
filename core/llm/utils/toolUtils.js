import { extractQueryContext } from "./messageUtils.js";

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
    
    // 有効なJSONを抽出
    try {
      // ブール値の修復を試みる - 重複パターンに対応
      const fixedBooleanArgs = tryFixBrokenBooleanJson(args);
      if (fixedBooleanArgs !== args) {
        try {
          JSON.parse(fixedBooleanArgs);
          return fixedBooleanArgs; // ブール値修復後のJSONが有効ならそれを返す
        } catch (e3) {
          // 修復したがまだ無効な場合は次の方法を試す
          console.log(`ブール修復後のJSON解析エラー: ${e3}`);
        }
      }
      
      const { extractValidJson, repairDuplicatedJsonPattern } = require('./json.js');
      
      // 重複パターンの修復を試みる
      const repairedArgs = repairDuplicatedJsonPattern(args);
      if (repairedArgs !== args) {
        try {
          JSON.parse(repairedArgs);
          return repairedArgs; // 修復後のJSONが有効ならそれを返す
        } catch (e2) {
          // 修復したがまだ無効な場合は次の方法を試す
          console.log(`重複修復後のJSON解析エラー: ${e2}`);
        }
      }
      
      // 有効なJSON部分の抽出を試みる
      const validJson = extractValidJson(args);
      if (validJson) {
        try {
          JSON.parse(validJson);
          return validJson; // 有効なJSON部分があればそれを返す
        } catch (e4) {
          // 無効な場合は引き続き処理
          console.log(`抽出後のJSON解析エラー: ${e4}`);
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
          return fixedJson;
        } catch (e7) {
          console.log(`ブール直接修復後のJSON解析エラー: ${e7}`);
        }
      }
      
      // 他の修復方法が失敗した場合は元の文字列を返す
      return args;
    } catch (innerError) {
      // エラーが発生した場合は元の文字列を返す
      console.warn(`引数の修復に失敗しました: ${innerError}`);
      return args;
    }
  }
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
  
  return result;
}