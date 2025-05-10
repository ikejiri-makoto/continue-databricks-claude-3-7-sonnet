/**
 * 共通ストリーム処理関連のユーティリティ
 * 
 * このファイルには、LLMプロバイダー間で共有できるストリーム処理のヘルパー関数を含みます。
 */

import { ChatMessage } from "../../index.js";
import { safeStringify, extractValidJson, isValidJson } from "./json.js";

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
   * @param maxBufferSize バッファの最大サイズ (デフォルト: 10000文字)
   * @returns 更新されたバッファ
   */
  addToBuffer(newData: string, currentBuffer: string = "", maxBufferSize: number = 10000): string {
    // 現在のバッファが既に有効なJSONの場合は新しいバッファを開始
    if (currentBuffer && isValidJson(currentBuffer)) {
      console.log(`バッファはすでに完全なJSONです。新しいバッファを開始します。`);
      return newData;
    }
    
    // 新しいデータに完全なJSONが含まれている場合は、それを使用
    const validJson = extractValidJson(newData);
    if (validJson && isValidJson(validJson)) {
      console.log(`新しいデータには完全なJSONが含まれています: ${validJson.substring(0, 30)}...`);
      return validJson;
    }
    
    // バッファと新しいデータを結合
    const combinedBuffer = currentBuffer + newData;
    
    // 結合されたバッファに完全なJSONが含まれている場合は、それを抽出
    const combinedValidJson = extractValidJson(combinedBuffer);
    if (combinedValidJson && isValidJson(combinedValidJson)) {
      console.log(`結合バッファから有効なJSONを抽出: ${combinedValidJson.substring(0, 30)}...`);
      return combinedValidJson;
    }
    
    // バッファサイズをチェックし、最大サイズを超えた場合はリセット
    if (combinedBuffer.length > maxBufferSize) {
      console.warn(`JSONバッファが最大サイズ(${maxBufferSize}文字)を超えました。最後の部分のみ保持します。`);
      return combinedBuffer.substring(combinedBuffer.length - Math.floor(maxBufferSize / 2));
    }
    
    // それ以外の場合は結合したバッファを返す
    return combinedBuffer;
  },

  /**
   * JSONバッファをリセットする
   * @returns 空のバッファ
   */
  resetBuffer(): string {
    return "";
  },
  
  /**
   * バッファが完全なJSONかどうかを確認
   * @param buffer JSONバッファ
   * @returns 完全なJSONの場合はtrue
   */
  isBufferComplete(buffer: string): boolean {
    return isValidJson(buffer);
  },
  
  /**
   * バッファから有効なJSONを抽出
   * @param buffer JSONバッファ
   * @returns 抽出された有効なJSON文字列またはnull
   */
  extractValidJsonFromBuffer(buffer: string): string | null {
    return extractValidJson(buffer);
  },
  
  /**
   * バッファから有効なJSONを抽出し、残りのコンテンツを返す
   * @param buffer JSONバッファ
   * @returns [抽出されたJSON文字列, 残りのバッファのタプル] または null
   */
  extractJsonAndRemainder(buffer: string): [string, string] | null {
    const validJson = extractValidJson(buffer);
    
    if (!validJson) {
      return null;
    }
    
    const jsonStartIndex = buffer.indexOf(validJson);
    if (jsonStartIndex === -1) {
      return null; // これは本来起こりえないはず
    }
    
    const jsonEndIndex = jsonStartIndex + validJson.length;
    const remainder = buffer.substring(jsonEndIndex);
    
    return [validJson, remainder];
  },
  
  /**
   * 複数のJSON文字列を安全に結合する
   * @param firstJson 最初のJSON文字列
   * @param secondJson 2番目のJSON文字列
   * @returns 結合されたJSON文字列または最初のJSON文字列
   */
  safelyMergeJsonStrings(firstJson: string, secondJson: string): string {
    try {
      const firstObj = JSON.parse(firstJson);
      
      try {
        const secondObj = JSON.parse(secondJson);
        // 両方をマージして文字列化
        const merged = { ...firstObj, ...secondObj };
        return JSON.stringify(merged);
      } catch (e) {
        // 2番目のJSONが無効な場合は最初のJSONを返す
        return firstJson;
      }
    } catch (e) {
      // 最初のJSONが無効な場合は、両方を結合して有効なJSONの抽出を試みる
      const combined = firstJson + secondJson;
      const validJson = extractValidJson(combined);
      return validJson || firstJson;
    }
  }
};
