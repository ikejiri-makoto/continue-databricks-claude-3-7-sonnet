import { LLMOptions, CompletionOptions, ChatMessage } from "../../../../index.js";

/**
 * Databricks LLM特有のオプション型
 * parallel_tool_callsはDatabricksエンドポイントではサポートされないため含まれていない
 */
export interface DatabricksLLMOptions extends LLMOptions {
  apiBase?: string;
  apiKey?: string;
  alwaysLogThinking?: boolean;
}

/**
 * Databricksリクエスト時の補完オプション型
 * parallel_tool_callsはDatabricksエンドポイントではサポートされないため含まれていない
 * requestTimeoutもDatabricksエンドポイントではサポートされないため削除
 */
export interface DatabricksCompletionOptions extends CompletionOptions {
  /**
   * API Base URL
   */
  apiBase?: string;
  
  /**
   * API Key
   */
  apiKey?: string;
  
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
 * Claude 3.7 Sonnetの思考モードとreasoning型に対応
 */
export interface ResponseDelta {
  tool_calls?: ToolCallDelta[];
  content?: string | {
    summary?: {
      text?: string;
    };
  };
  signature?: string;
  // reasoning型をサポート（Databricksエンドポイント特有の思考データ形式）
  reasoning?: {
    text?: string;
    summary?: {
      text?: string;
    };
    signature?: string;
    [key: string]: any; // その他のプロパティもサポート
  } | string;
}

/**
 * ストリーミングチャンク型
 * Databricksエンドポイントからの様々な応答形式に対応
 */
export interface StreamingChunk {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  signature?: string; // 署名情報を追加
  thinking?: any; // 思考データは様々な形式で来る可能性があるためany型
  // content型をサポート - どのレベルにもオブジェクト形式のデータが来る可能性がある
  content?: {
    summary?: {
      text?: string;
    };
    [key: string]: any;
  } | string;
  // 思考データを含む可能性のあるchoices配列
  choices?: Array<{
    index?: number;
    delta?: ResponseDelta & {
      content?: string | {
        summary?: {
          text?: string;
        };
      }; // content.summary.textなどの入れ子構造に対応
      reasoning?: {
        text?: string;
        summary?: {
          text?: string;
        };
        signature?: string;
        [key: string]: any;
      } | string;
    };
    // 非ストリーミングレスポンス用のmessageプロパティを追加
    message?: {
      content?: any; // 配列やオブジェクト、文字列など様々な形式をサポート
      role?: string;
      tool_calls?: ToolCall[];
      refusal?: any;
      annotations?: any;
      audio?: any;
      function_call?: any;
      [key: string]: any; // その他のプロパティもサポート
    };
    finish_reason?: string | null;
  }>;
  // summary直接アクセス用
  summary?: {
    text?: string;
    [key: string]: any;
  };
}

/**
 * 思考チャンク型 - 拡張版
 * 様々な思考データ構造に対応する柔軟な型定義
 * Claude 3.7 Sonnetの思考モードで返される複数のデータ形式に対応
 */
export interface ThinkingChunk {
  /** 直接の思考データ（様々な形式で渡される可能性あり） */
  thinking?: any;
  
  /** summary.text形式の思考データ */
  summary?: { 
    text?: string;
    [key: string]: any;
  };
  
  /** content.summary.text形式の思考データ */
  content?: string | { 
    summary?: { 
      text?: string;
      [key: string]: any;
    };
    [key: string]: any;
  };
  
  /** 思考データの署名情報 */
  signature?: string;
  
  /** デルタ形式の思考データ */
  delta?: any;
  
  /** reasoning形式の思考データ (Databricks固有) */
  reasoning?: {
    text?: string;
    summary?: {
      text?: string;
    };
    [key: string]: any;
  } | string;
  
  /** choices[0].delta.content.summary.text形式の思考データ（最優先）*/
  choices?: Array<{
    delta?: {
      content?: {
        summary?: {
          text?: string;
          [key: string]: any;
        };
        [key: string]: any;
      };
      reasoning?: {
        text?: string;
        summary?: {
          text?: string;
        };
        [key: string]: any;
      } | string;
      signature?: string;
      [key: string]: any;
    };
    [key: string]: any;
  }>;
  
  /** その他の未知のプロパティにも対応 */
  [key: string]: any;
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

/**
 * ストリーミングレスポンス処理結果型
 * streaming.tsで使用する型を一元管理
 */
export interface StreamingResponseResult {
  success: boolean;
  messages: ChatMessage[];
  error?: Error;
  state?: any;
}

/**
 * 再接続結果型
 * streaming.tsで使用する型を一元管理
 */
export interface ReconnectionResult {
  restoredMessage: ChatMessage;
  restoredToolCalls: ToolCall[];
  restoredCurrentToolCall: ToolCall | null;
  restoredCurrentToolCallIndex: number | null;
  restoredJsonBuffer: string;
  restoredIsBufferingJson: boolean;
}