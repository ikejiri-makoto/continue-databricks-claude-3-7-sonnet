import { ChatMessage } from "../../index.js";
import { extractQueryContext } from "./messageUtils.js";
import { PROVIDER_TOOL_SUPPORT } from "../toolSupport.js";
import { safeJsonParse, extractValidJson, repairDuplicatedJsonPattern, isValidJson, tryFixBrokenBooleanJson } from "./json.js";
import { getErrorMessage } from "./errors.js";

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
  if (!toolResults || toolResults.length === 0) {
    return '';
  }
  
  let result = '';
  
  for (const toolResult of toolResults) {
    // 無効なツール結果をスキップ
    if (!toolResult || !toolResult.role) continue;
    
    // 結果の形式をDatabricks Claude 3.7 Sonnet APIへの対応に合わせて改善
    // 欠落フィールドのチェックと追加
    const formattedResult = {
      role: toolResult.role,
      tool_call_id: toolResult.tool_call_id || toolResult.toolCallId,
      content: toolResult.content || "Tool execution result"
    };
    
    result += `<tool_result>\n${JSON.stringify(formattedResult, null, 2)}\n</tool_result>\n\n`;
  }
  
  return result;
}

/**
 * ツール呼び出し引数の修復を試みる共通ユーティリティ関数
 * 特に入れ子構造や重複する引数の問題を修正
 * 
 * @param args 修復する引数文字列
 * @returns 修復された引数文字列
 */
export function repairToolArguments(args: string): string {
  if (!args || args.trim() === '') {
    return '{}';
  }
  
  try {
    // まず有効なJSONかどうかチェック
    if (isValidJson(args)) {
      return args;
    }
    
    // 特殊修復: 破損したブール値を修復する
    // tryFixBrokenBooleanJsonを使用して"fffalsee"などの破損したブール値を修復
    const fixedBooleanJson = tryFixBrokenBooleanJson(args);
    if (fixedBooleanJson !== args && isValidJson(fixedBooleanJson)) {
      console.log(`ブール値修復が成功しました: ${args} -> ${fixedBooleanJson}`);
      return fixedBooleanJson;
    }
    
    // 特殊パターン: "recursive": fffalsee パターンに直接対応する正規表現ベースの修復
    const falsePattern = /"(recursive|\w+)"\s*:\s*f+alse+([,}])/g;
    if (falsePattern.test(args)) {
      const directlyFixedJson = args.replace(falsePattern, '"$1": false$2');
      if (isValidJson(directlyFixedJson)) {
        console.log(`特殊パターン修復が成功しました: ${args} -> ${directlyFixedJson}`);
        return directlyFixedJson;
      }
    }
    
    // JSON抽出を試みる
    const validJson = extractValidJson(args);
    if (validJson && validJson !== args) {
      return validJson;
    }
    
    // 二重化パターンを修復
    const repairedArgs = repairDuplicatedJsonPattern(args);
    if (repairedArgs !== args) {
      return repairedArgs;
    }
    
    // 括弧の不一致修復を試みる
    const mismatchFix = fixMismatchedBraces(args);
    if (mismatchFix !== args) {
      return mismatchFix;
    }
    
    // その他の修復を試みる
    // 一般的なパターン: 引数が二重になっているケース
    if (args.includes('":\{') && !args.includes('":{')) {
      return args.replace(/":\{/g, '":{')
    }
    
    // 最後の手段として元の引数を返す
    return args;
  } catch (e) {
    // エラーが発生した場合は元の引数を返す
    console.warn(`引数の修復に失敗しました: ${getErrorMessage(e)}`);
    return args;
  }
}

/**
 * 不一致の括弧を修復する内部ヘルパー関数
 * 
 * @param args 修復する引数文字列
 * @returns 修復された引数文字列
 */
function fixMismatchedBraces(args: string): string {
  // 開き括弧と閉じ括弧のカウント
  const openBraces = (args.match(/\{/g) || []).length;
  const closeBraces = (args.match(/\}/g) || []).length;
  
  // 括弧が不一致の場合は修復を試みる
  if (openBraces > closeBraces) {
    // 閉じ括弧が足りない場合は追加
    return args + '}'.repeat(openBraces - closeBraces);
  } else if (closeBraces > openBraces) {
    // 開き括弧が足りない場合は先頭に追加
    return '{'.repeat(closeBraces - openBraces) + args;
  }
  
  return args;
}
