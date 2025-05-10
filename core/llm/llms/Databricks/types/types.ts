import { ChatMessage, ThinkingChatMessage } from "../../../../index.js";

// 共通型定義への参照を明示的に追加
import "../../../types/databricks-extensions";
import "./extension.d.ts";

/**
 * ツール呼び出しの型定義
 */
export interface ToolCall {
  id: string;
  type: "function";  // 文字列リテラル型として明示的に定義
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

/**
 * 永続的なストリーム状態の型定義
 * ストリーミング中断時にも状態を維持するために使用
 */
export interface PersistentStreamState {
  /**
   * 未完成のJSONをバッファするための文字列
   */
  jsonBuffer: string;
  
  /**
   * JSONバッファリング中かどうかを示すフラグ
   */
  isBufferingJson: boolean;
  
  /**
   * 処理中のツール呼び出し配列
   */
  toolCallsInProgress: ToolCall[];
  
  /**
   * 現在処理中のツール呼び出しインデックス
   */
  currentToolCallIndex: number | null;
  
  /**
   * 部分的なコンテンツをバッファするための文字列
   */
  contentBuffer: string;
  
  /**
   * 最後の再接続タイムスタンプ
   */
  lastReconnectTimestamp: number;
}