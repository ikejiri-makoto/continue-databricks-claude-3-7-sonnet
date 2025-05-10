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