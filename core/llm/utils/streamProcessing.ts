/**
 * 共通ストリーム処理関連のユーティリティ
 * 
 * このファイルには、LLMプロバイダー間で共有できるストリーム処理のヘルパー関数を含みます。
 */

import { ChatMessage } from "../../index.js";
import { safeStringify } from "./json.js";

/**
 * ストリーミングコンテンツデルタからメッセージを更新する汎用メソッド
 * 様々なプロバイダーで使用可能
 * 
 * @param content 新しいコンテンツデルタ
 * @param currentMessage 現在のチャットメッセージ
 * @returns 更新されたメッセージと処理フラグのオブジェクト
 */
export function processContentDelta(
  content: string | unknown,
  currentMessage: ChatMessage
): { updatedMessage: ChatMessage, shouldYield: boolean } {
  const newContent = typeof content === "string" 
    ? content 
    : safeStringify(content, "");
    
  let updatedContent: string;
  if (typeof currentMessage.content === "string") {
    updatedContent = currentMessage.content + newContent;
  } else {
    updatedContent = newContent;
  }
  
  return {
    updatedMessage: {
      ...currentMessage,
      content: updatedContent
    },
    shouldYield: true
  };
}

/**
 * ストリーミングレスポンスを処理するための抽象的な基底クラス
 * 専用の処理器を実装する際の基本機能を提供
 */
export abstract class BaseStreamProcessor<TChunk, TDelta> {
  /**
   * 思考メッセージを処理する
   * @param thinkingData 思考データ
   * @returns 処理された思考メッセージ
   */
  protected processThinking(thinkingData: unknown): ChatMessage {
    // 思考内容を適切にシリアライズ
    let newThinking = "";
    if (typeof thinkingData === "string") {
      newThinking = thinkingData || "";
    } else if (thinkingData && typeof thinkingData === "object") {
      newThinking = safeStringify(thinkingData, "[思考データ]");
    }
    
    // 思考メッセージを返す
    return {
      role: "thinking",
      content: newThinking
    };
  }

  /**
   * 通常のコンテンツデルタを処理する共通メソッド
   * @param contentDelta コンテンツデルタ
   * @param currentMessage 現在のメッセージ
   * @returns 更新されたメッセージと出力フラグ
   */
  protected processContent(
    contentDelta: string | unknown,
    currentMessage: ChatMessage
  ): { updatedMessage: ChatMessage, shouldYield: boolean } {
    return processContentDelta(contentDelta, currentMessage);
  }

  /**
   * チャンクを処理する抽象メソッド - 各プロバイダーで実装する必要がある
   * @param chunk 処理するチャンク
   * @param currentMessage 現在のメッセージ
   * @param additionalState 追加の状態情報
   */
  abstract processChunk(
    chunk: TChunk,
    currentMessage: ChatMessage,
    additionalState: any
  ): any;
}

/**
 * JSONバッファリングに関するヘルパー関数
 * 不完全なJSONをバッファリングする際に使用
 */
export const JsonBufferHelpers = {
  /**
   * JSONバッファを開始または追加する
   * @param newData 新しいデータ
   * @param currentBuffer 現在のバッファ (空の場合は新規作成)
   * @returns 更新されたバッファ
   */
  addToBuffer(newData: string, currentBuffer: string = ""): string {
    return currentBuffer + newData;
  },

  /**
   * JSONバッファをリセットする
   * @returns 空のバッファ
   */
  resetBuffer(): string {
    return "";
  }
};
