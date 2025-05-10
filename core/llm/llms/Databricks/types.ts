import { ChatMessage } from "../../../index.js";
import { BaseStreamingError } from "../../utils/errors.js";

/**
 * ストリーミングエラーのインターフェース
 * 基本エラー型を拡張して、Databricks固有のプロパティを追加できるようにする
 */
export interface StreamingError extends BaseStreamingError {
  // Databricks固有のエラープロパティがあれば追加
}

/**
 * アシスタントメッセージの型定義
 * ChatMessageを拡張し、アシスタント固有のプロパティを定義
 */
export interface AssistantChatMessage extends ChatMessage {
  role: "assistant";
  content: string;
  toolCalls?: any[];
}

/**
 * ツール結果メッセージの型定義
 */
export interface ToolResultMessage {
  role: 'tool';
  tool_call_id: string;
  content: string;
}

/**
 * ツール呼び出しの型定義
 */
export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Databricksの思考（Thinking）チャンク型定義
 */
export interface ThinkingChunk {
  thinking?: string | object;
  signature?: string;
}

/**
 * Databricksレスポンスデルタの型定義
 */
export interface ResponseDelta {
  content?: string;
  tool_calls?: {
    index: number;
    id?: string;
    function?: {
      name?: string;
      arguments?: string;
    }
  }[];
}

/**
 * ストリーミングチャンクの型定義
 */
export interface StreamingChunk {
  thinking?: ThinkingChunk;
  choices?: {
    delta: ResponseDelta;
  }[];
}
