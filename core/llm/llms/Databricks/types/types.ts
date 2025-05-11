import { LLMOptions, CompletionOptions, ChatMessage } from "../../../../index.js";

/**
 * Databricks LLM特有のオプション型
 * parallel_tool_callsはDatabricksエンドポイントではサポートされないため含まれていない
 */
export interface DatabricksLLMOptions extends LLMOptions {
  apiBase?: string;
  apiKey?: string;
}

/**
 * Databricksリクエスト時の補完オプション型
 * parallel_tool_callsはDatabricksエンドポイントではサポートされないため含まれていない
 */
export interface DatabricksCompletionOptions extends CompletionOptions {
  /**
   * リクエストのタイムアウト (秒)
   * デフォルトは300秒 (5分)
   */
  requestTimeout?: number;
  
  /**
   * Claude 3.7モデル用の思考モード設定
   * 思考プロセスを有効にし、そのための設定を行う
   */
  thinking?: {
    /**
     * 思考モードのタイプ - 現在は"enabled"のみサポート
     */
    type: string;
    
    /**
     * 思考プロセス用のトークン予算
     * デフォルトはmax_tokensの半分（最大64000）
     */
    budget_tokens?: number;
  };
}

/**
 * ツール呼び出し型
 */
export interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * ツール結果メッセージ型
 */
export interface ToolResultMessage {
  role: string;
  tool_call_id: string;
  content: string;
}

/**
 * ストリーミングチャンク内のツール呼び出しデルタ
 */
export interface ToolCallDelta {
  index: number;
  id?: string;
  type?: string; // typeプロパティを追加して型の互換性を確保
  function?: {
    name?: string;
    arguments?: string;
  };
}

/**
 * ストリーミングレスポンスデルタ
 */
export interface ResponseDelta {
  tool_calls?: ToolCallDelta[];
  content?: string;
}

/**
 * ストリーミングチャンク型
 */
export interface StreamingChunk {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  thinking?: ThinkingChunk;
  choices?: Array<{
    index?: number;
    delta?: ResponseDelta;
  }>;
}

/**
 * 思考チャンク型
 */
export interface ThinkingChunk {
  thinking: string | any;
  signature?: string;
}

/**
 * ストリーミング状態追跡型
 */
export interface StreamingState {
  message: ChatMessage;
  toolCalls: ToolCall[];
  currentToolCall: ToolCall | null;
  currentToolCallIndex: number | null;
  jsonBuffer: string;
  isBufferingJson: boolean;
}

/**
 * 永続的なストリーム状態型
 * 再接続時に状態を復元するために使用
 */
export interface PersistentStreamState {
  jsonBuffer: string;
  isBufferingJson: boolean;
  toolCallsInProgress: ToolCall[];
  currentToolCallIndex: number | null;
  contentBuffer: string;
  lastReconnectTimestamp: number;
}

/**
 * エラー処理結果型
 */
export interface ErrorHandlingResult {
  success: boolean;
  error: Error;
  state?: StreamingState;
}

/**
 * Databricksチャットメッセージ型
 * エクスポートエラーを解決するために追加
 */
export interface DatabricksChatMessage {
  role: string;
  content: string | any[];
  name?: string;
  toolCalls?: ToolCall[];
}

/**
 * ストリーミング結果型
 * エクスポートエラーを解決するために追加
 */
export interface StreamingResult {
  updatedMessage: ChatMessage;
  shouldYield: boolean;
}

/**
 * ツールコールプロセッサのインターフェース
 * エクスポートエラーを解決するために追加
 */
export interface ToolCallProcessorInterface {
  preprocessToolCallsAndResults(messages: ChatMessage[]): ChatMessage[];
}

/**
 * ツール呼び出し結果型
 * streaming.tsから移動して一元管理
 */
export interface ToolCallResult {
  updatedToolCalls: ToolCall[];
  updatedCurrentToolCall: ToolCall | null;
  updatedCurrentToolCallIndex: number | null;
  updatedJsonBuffer: string;
  updatedIsBufferingJson: boolean;
  shouldYieldMessage: boolean;
}