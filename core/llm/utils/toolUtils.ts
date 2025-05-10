import { ChatMessage } from "../../index.js";
import { extractQueryContext } from "./messageUtils.js";
import { PROVIDER_TOOL_SUPPORT } from "../toolSupport.js";

/**
 * ツール関連の共通ユーティリティ関数
 */

/**
 * 特定のツールタイプを判定するための定数
 */
export const TOOL_TYPES = {
  SEARCH: ["search", "検索", "web_search"],
  CODE: ["code", "coding", "programming", "developer"],
  MATH: ["math", "calculation", "calculator"]
};

/**
 * 特定のモデルがツール機能をサポートしているかを判定
 * 
 * @param provider プロバイダー名
 * @param model モデル名
 * @returns サポートしている場合はtrue、不明または未サポートの場合はfalse
 */
export function doesModelSupportTools(provider: string, model: string): boolean {
  const supportCheck = PROVIDER_TOOL_SUPPORT[provider];
  if (!supportCheck) return false;
  
  const isSupported = supportCheck(model);
  return isSupported === true;
}

/**
 * ツール名が特定のタイプに該当するかを判定
 * 
 * @param toolName ツール名
 * @param typePatterns ツールタイプのパターン配列
 * @returns パターンにマッチする場合はtrue
 */
export function isToolOfType(toolName: string | undefined, typePatterns: string[]): boolean {
  if (!toolName) return false;
  
  return typePatterns.some(pattern => 
    toolName.toLowerCase().includes(pattern.toLowerCase())
  );
}

/**
 * 指定されたツールが検索ツールかどうかを判定
 * 
 * @param toolName ツール名
 * @returns 検索ツールの場合はtrue
 */
export function isSearchTool(toolName: string | undefined): boolean {
  return isToolOfType(toolName, TOOL_TYPES.SEARCH);
}

/**
 * 検索ツールの引数を処理する共通ヘルパーメソッド
 * 
 * @param toolName ツール名
 * @param currentArgs 現在の引数文字列
 * @param newArgs 新しい引数文字列
 * @param messages チャットメッセージ配列
 * @returns 処理された引数文字列
 */
export function processSearchToolArguments(
  toolName: string | undefined,
  currentArgs: string,
  newArgs: string,
  messages: ChatMessage[]
): string {
  // 検索ツールでない場合は単純に連結
  if (!isSearchTool(toolName)) {
    return currentArgs ? currentArgs + newArgs : newArgs;
  }

  try {
    // 現在の引数をパースして検証
    let argsObj: any = {};
    
    // 既存の引数が有効なJSONの場合はパース
    if (currentArgs && currentArgs !== "{}" && currentArgs !== "") {
      try {
        argsObj = JSON.parse(currentArgs);
        // 既に有効なqueryプロパティがある場合は、既存の引数をそのまま返す
        // これにより複数回の呼び出しでJSONが重複して連結される問題を防ぐ
        if (argsObj.query && typeof argsObj.query === "string" && argsObj.query.trim() !== "") {
          console.log(`既存のクエリ引数が存在するため再利用: ${currentArgs}`);
          return currentArgs;
        }
      } catch (e) {
        // パースエラーの場合は空オブジェクト
        argsObj = {};
        console.warn(`既存の引数のパースエラー: ${e}`);
      }
    }
    
    // 新しい引数を処理
    try {
      // 新しい引数がJSON形式かチェック
      const parsedJson = JSON.parse(newArgs);
      // クエリプロパティがある場合はそれを使用
      if (parsedJson.query) {
        argsObj.query = parsedJson.query;
      } else {
        // その他のプロパティをマージ
        argsObj = { ...argsObj, ...parsedJson };
      }
    } catch (e) {
      // JSON形式でない場合、queryパラメータとして扱う
      if (newArgs.trim()) {
        argsObj.query = newArgs.trim();
      }
    }
    
    // queryパラメータがない場合は、ユーザーメッセージから抽出
    if (!argsObj.query) {
      argsObj.query = extractQueryContext(messages);
    }
    
    return JSON.stringify(argsObj);
  } catch (e) {
    // 例外が発生した場合は、基本的なクエリパラメータを持つオブジェクトを作成
    console.warn(`検索ツール引数の処理でエラー: ${e}`);
    
    // ユーザーメッセージから抽出したクエリか、引数の内容を使用
    const queryValue = newArgs.trim() || extractQueryContext(messages);
    return JSON.stringify({ query: queryValue });
  }
}

/**
 * ツール結果をテキスト形式にフォーマットする共通メソッド
 * 
 * @param toolResults ツール結果配列
 * @returns フォーマットされたツール結果テキスト
 */
export function formatToolResultsContent(toolResults: any[]): string {
  let result = '';
  
  for (const toolResult of toolResults) {
    result += `<tool_result>\n${JSON.stringify(toolResult, null, 2)}\n</tool_result>\n\n`;
  }
  
  return result;
}
