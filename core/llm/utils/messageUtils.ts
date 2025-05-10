import { ChatMessage } from "../../index.js";
import { safeStringify } from "./json.js";

/**
 * メッセージコンテンツからテキスト部分を抽出するユーティリティ
 * 画像やその他の非テキストコンテンツを含むメッセージからテキストのみを取得
 * 
 * @param content 処理するコンテンツ配列
 * @returns 抽出したテキスト
 */
export function extractTextContent(content: any[]): string {
  if (!Array.isArray(content)) return "";
  
  return content
    .filter(part => part && part.type === "text")
    .map(part => part.text || "")
    .join("\n");
}

/**
 * メッセージ内容を文字列として抽出するヘルパーメソッド
 * 様々な形式のメッセージコンテンツを一貫した文字列形式に変換
 * 
 * @param content 処理するコンテンツ
 * @returns 抽出した文字列
 */
export function extractContentAsString(content: any): string {
  if (typeof content === "string") {
    return content;
  } else if (Array.isArray(content)) {
    return extractTextContent(content);
  } else if (content && typeof content === "object") {
    return safeStringify(content, "");
  }
  return "";
}

/**
 * ユーザーの入力からクエリコンテキストを抽出するヘルパーメソッド
 * 検索ツールなどのクエリ自動生成に使用
 * 
 * @param messages メッセージ配列
 * @returns 抽出したクエリコンテキスト
 */
export function extractQueryContext(messages: ChatMessage[]): string {
  // 直近のユーザーメッセージをチェック
  const recentUserMessages = [...messages].reverse().filter(m => m.role === "user");
  
  if (recentUserMessages.length > 0) {
    const lastUserMessage = recentUserMessages[0];
    const content = typeof lastUserMessage.content === "string" 
      ? lastUserMessage.content
      : extractContentAsString(lastUserMessage.content);
    
    // 適切なキーワードを抽出（最初の20単語以内）
    const words = content.split(/\s+/).slice(0, 20).join(" ");
    if (words.length > 0) {
      return words;
    }
  }
  
  // デフォルトのクエリを返す
  return "search query";
}

/**
 * メッセージがツール呼び出しを含むかどうかを判定する
 * 
 * @param message 確認するメッセージ
 * @returns ツール呼び出しがある場合はtrue
 */
export function messageHasToolCalls(message: ChatMessage): boolean {
  return message.role === "assistant" && !!(message as any).toolCalls;
}

/**
 * ツール呼び出しを含むメッセージの内容をチェックし、結果ブロックから始まっているかを確認する
 * 
 * @param message 確認するメッセージ
 * @returns ツール結果ブロックから始まっている場合はtrue
 */
export function hasToolResultBlocksAtBeginning(message: ChatMessage): boolean {
  if (!message.content || typeof message.content !== 'string') {
    return false;
  }
  
  const content = message.content.trim();
  // ツール結果ブロックのパターンを確認
  // ツール結果ブロックのパターンを広げる
  return content.startsWith('<tool_result') || 
         content.startsWith('{"role": "tool"') ||
         content.startsWith('{"role":"tool"') ||
         content.startsWith('role: tool') ||
         content.startsWith('tool_result');
}
