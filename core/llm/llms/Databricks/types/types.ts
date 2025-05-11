import { ChatMessage, ThinkingChatMessage, CompletionOptions, LLMOptions } from "../../../../index.js";

/**
 * LLMOptions拡張型（コア型にマージするのではなく、独自に拡張）
 */
export interface DatabricksLLMOptions extends LLMOptions {
  /**
   * 思考プロセスを常にログに表示するかどうかの設定
   * trueの場合は常に表示、falseの場合は開発モードのみ表示
   */
  thinkingProcess?: boolean;
  
  // parallel_tool_callsパラメータはDatabricksエンドポイントでサポートされていないため削除
  // このパラメータが存在するとAPIエラーを引き起こす可能性があります
}
import { BaseStreamingError } from "../../../utils/errors.js";

/// <reference path="./extension.d.ts" />

/**
 * Databricks固有の完了オプション
 * 基本のCompletionOptionsを拡張し、Databricks特有のオプションを追加
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
  
  // 注意: parallel_tool_callsパラメータはDatabricksエンドポイントでサポートされていません
  // このパラメータを含めるとエラーが発生する可能性があるため、意図的に型から除外しています
  // OpenAI互換インターフェースとの相違点として留意してください
}

/**
 * ツール呼び出しの型定義
 * ツール呼び出し情報を保持するインターフェース
 */
export interface ToolCall {
  /** ツール呼び出しの一意の識別子 */
  id: string;
  /** ツールタイプ - 現在は"function"のみサポート */
  type: "function";
  /** 関数情報 */
  function: {
    /** 関数名 */
    name: string;
    /** 関数の引数（JSON文字列） */
    arguments: string;
  };
}

/**
 * ツール結果メッセージの型定義
 * ツール実行結果を表すメッセージ形式
 */
export interface ToolResultMessage {
  /** メッセージの役割 - 'tool'に固定 */
  role: 'tool';
  /** 対応するツール呼び出しのID */
  tool_call_id: string;
  /** ツール実行結果の内容 */
  content: string;
  /** 代替のツール呼び出しID（互換性のために提供） */
  toolCallId?: string;
}

/**
 * 拡張されたChatMessage型（Databricks特有のプロパティを含む）
 */
export type DatabricksChatMessage = ChatMessage & {
  /** Databricks固有の署名情報 */
  signature?: string;
  /** ツール呼び出しID（互換性のために提供） */
  toolCallId?: string;
};

/**
 * ストリーミングエラーのインターフェース
 * 基本エラー型を拡張して、Databricks固有のプロパティを追加
 */
export interface StreamingError extends BaseStreamingError {
  /** Databricks固有のエラープロパティ（必要に応じて追加） */
}

/**
 * アシスタントメッセージの型定義
 * ChatMessageを拡張し、アシスタント固有のプロパティを定義
 */
export type AssistantChatMessage = ChatMessage & {
  /** メッセージの役割 - 'assistant'に固定 */
  role: "assistant";
  /** メッセージの内容 */
  content: string;
  /** ツール呼び出し情報（存在する場合） */
  toolCalls?: ToolCall[];
};

/**
 * Databricksの思考（Thinking）チャンク型定義
 * 思考プロセス情報を含むチャンク形式
 */
export interface ThinkingChunk {
  /** 思考内容 - 文字列またはオブジェクト */
  thinking?: string | object;
  /** 署名情報 */
  signature?: string;
}

/**
 * Databricksレスポンスデルタの型定義
 * ストリーミングレスポンスの各チャンクの形式
 */
export interface ResponseDelta {
  /** コンテンツのデルタ */
  content?: string;
  /** ツール呼び出しのデルタ情報 */
  tool_calls?: {
    /** 配列内のインデックス */
    index: number;
    /** ツール呼び出しID（部分的な場合もある） */
    id?: string;
    /** 関数情報（部分的な場合もある） */
    function?: {
      /** 関数名（部分的な場合もある） */
      name?: string;
      /** 関数引数（部分的な場合もある） */
      arguments?: string;
    }
  }[];
}

/**
 * ストリーミングチャンクの型定義
 * Databricksからのレスポンスの形式
 */
export interface StreamingChunk {
  /** 思考プロセス情報（存在する場合） */
  thinking?: ThinkingChunk;
  /** 選択肢（通常は1つのみ） */
  choices?: {
    /** デルタ情報 */
    delta: ResponseDelta;
  }[];
}

/**
 * ストリーミング処理の結果型定義
 * ストリーミング処理の各ステップの結果を表す
 */
export interface StreamingResult {
  /** 更新されたメッセージ */
  updatedMessage: ChatMessage;
  /** 更新されたツール呼び出し配列 */
  updatedToolCalls: ToolCall[];
  /** 更新された現在のツール呼び出し（または null） */
  updatedCurrentToolCall: ToolCall | null;
  /** 更新された現在のツール呼び出しインデックス（または null） */
  updatedCurrentToolCallIndex: number | null;
  /** 更新されたJSONバッファ */
  updatedJsonBuffer: string;
  /** 更新されたJSONバッファリングフラグ */
  updatedIsBufferingJson: boolean;
  /** 思考メッセージ（存在する場合） */
  thinkingMessage?: ChatMessage;
  /** メッセージを生成すべきかどうかのフラグ */
  shouldYieldMessage: boolean;
}

/**
 * ツール呼び出し処理の結果型定義
 * ツール呼び出し処理の結果を表す
 */
export interface ToolCallResult {
  /** 更新されたツール呼び出し配列 */
  updatedToolCalls: ToolCall[];
  /** 更新された現在のツール呼び出し（または null） */
  updatedCurrentToolCall: ToolCall | null;
  /** 更新された現在のツール呼び出しインデックス（または null） */
  updatedCurrentToolCallIndex: number | null;
  /** 更新されたJSONバッファ */
  updatedJsonBuffer: string;
  /** 更新されたJSONバッファリングフラグ */
  updatedIsBufferingJson: boolean;
  /** メッセージを生成すべきかどうかのフラグ */
  shouldYieldMessage: boolean;
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

/**
 * JSONデルタ処理の結果型定義
 * JSON断片を処理した結果を表す
 */
export interface JsonDeltaResult {
  /** 結合されたJSON文字列 */
  combined: string;
  /** JSONが完全かどうかを示すフラグ */
  complete: boolean;
  /** JSONが有効かどうかを示すフラグ */
  valid: boolean;
}

/**
 * ツール引数デルタ処理の結果型定義
 * ツール引数の断片を処理した結果を表す
 */
export interface ToolArgumentsDeltaResult {
  /** 処理された引数文字列 */
  processedArgs: string;
  /** 引数が完全かどうかを示すフラグ */
  isComplete: boolean;
}

/**
 * JSONパターン検出と修復の結果型定義
 * JSON文字列の重複パターンを検出して修復した結果
 */
export interface JsonRepairResult {
  /** 修復されたJSON文字列 */
  repaired: string;
  /** 修正が行われたかどうかを示すフラグ */
  wasModified: boolean;
  /** 検出されたパターン（存在する場合） */
  detectedPattern?: string;
}

/**
 * ストリーミング状態インターフェース
 * エラー処理時に保持する状態情報
 */
export interface StreamingState {
  /** JSONバッファ */
  jsonBuffer: string;
  /** JSONバッファリングフラグ */
  isBufferingJson: boolean;
  /** ツール呼び出し配列 */
  toolCalls: ToolCall[];
  /** 現在のツール呼び出しインデックス */
  currentToolCallIndex: number | null;
  /** その他の状態プロパティを許可 */
  [key: string]: any;
}

/**
 * エラー処理結果インターフェース
 * エラー処理の結果を表す
 */
export interface ErrorHandlingResult {
  /** 成功したかどうかのフラグ */
  success: boolean;
  /** メッセージ配列 */
  messages: ChatMessage[];
  /** エラーオブジェクト */
  error: Error;
  /** 状態情報 */
  state: StreamingState;
}

/**
 * エラーレスポンスインターフェース
 * APIからのエラーレスポンスの構造
 */
export interface ErrorResponse {
  /** エラー情報 */
  error?: {
    /** エラーメッセージ */
    message?: string;
    /** エラータイプ */
    type?: string;
    /** エラーコード */
    code?: string;
    /** エラーパラメータ */
    param?: string;
  };
  /** 直接のメッセージ（error.messageがない場合に使用） */
  message?: string;
  /** HTTPステータスコード */
  status?: number;
}

/**
 * リトライ結果インターフェース
 * リトライ処理の結果を表す
 */
export interface RetryResult {
  /** 成功したかどうかのフラグ */
  success: boolean;
  /** リトライすべきかどうかのフラグ */
  shouldRetry: boolean;
  /** エラーオブジェクト（存在する場合） */
  error?: Error;
  /** 状態情報（存在する場合） */
  state?: StreamingState;
}

/**
 * モジュール間のインターフェースをサポートする型定義
 * オーケストレーターパターンの実装を支援する
 */

/**
 * 設定管理モジュールのインターフェース
 * 設定関連の操作を提供
 */
export interface ConfigManagerInterface {
  /** 設定を取得 */
  getConfig(options?: DatabricksCompletionOptions): DatabricksConfig;
  
  /** APIベースURLを正規化 */
  normalizeApiUrl(url: string): string;
  
  /** API設定を検証 */
  validateApiConfig(apiKey: string | undefined, apiBase: string | undefined): void;
  
  /** タイムアウトコントローラを設定 */
  setupTimeoutController(
    signal: AbortSignal, 
    options: DatabricksCompletionOptions
  ): {
    timeoutController: AbortController;
    timeoutId: NodeJS.Timeout;
    combinedSignal: AbortSignal;
  };
}

/**
 * 設定オブジェクトの型
 * Databricksの設定情報
 */
export interface DatabricksConfig {
  /** APIのベースURL */
  apiBase: string;
  /** APIキー */
  apiKey: string;
  /** タイムアウト（秒） */
  timeout: number;
  // 注：parallel_tool_callsプロパティも削除 - サポートされていないパラメータ
  /** その他の設定プロパティを許可 */
  [key: string]: any;
}

/**
 * エラー処理モジュールのインターフェース
 * エラー処理関連の操作を提供
 */
export interface ErrorHandlerInterface {
  /** エラーレスポンスをパース */
  parseErrorResponse(response: Response): Promise<{ error: Error }>;
  
  /** リトライ処理 */
  handleRetry(retryCount: number, error: unknown, state?: any): Promise<boolean>;
  
  /** 汎用的なリトライラッパー */
  withRetry<T>(operation: () => Promise<T>, state?: any): Promise<T>;
  
  /** ストリーミングエラーの処理 */
  handleStreamingError(error: unknown, state: StreamingState): ErrorHandlingResult;
  
  /** 一時的なエラーかどうかを判定 */
  isTransientError(error: unknown): boolean;
}

/**
 * ストリーミング処理モジュールのインターフェース
 * ストリーミング処理関連の操作を提供
 */
export interface StreamProcessorInterface {
  /** ストリーミングレスポンスを処理 */
  processStreamingResponse(
    response: Response,
    messages: ChatMessage[],
    retryCount: number,
    alwaysLogThinking: boolean
  ): Promise<{
    success: boolean;
    messages: ChatMessage[];
    error?: Error;
    state?: any;
  }>;
  
  /** ストリーミングチャンクを処理 */
  processChunk(
    chunk: StreamingChunk,
    currentMessage: ChatMessage,
    toolCalls: ToolCall[],
    currentToolCall: ToolCall | null,
    currentToolCallIndex: number | null,
    jsonBuffer: string,
    isBufferingJson: boolean,
    messages: ChatMessage[],
    isReconnect?: boolean
  ): StreamingResult;
  
  /** 永続的なストリーム状態を取得 */
  getPersistentState(): PersistentStreamState;
  
  /** 永続的なストリーム状態を更新 */
  updatePersistentState(newState: Partial<PersistentStreamState>): void;
  
  /** 永続的なストリーム状態をリセット */
  resetPersistentState(): void;
}

/**
 * メッセージ処理モジュールのインターフェース
 * メッセージ処理関連の操作を提供
 */
export interface MessageProcessorInterface {
  /** メッセージをOpenAI形式に変換 */
  convertToOpenAIFormat(messages: ChatMessage[], sanitizedMessages: any[]): any[];
  
  /** メッセージを標準化 */
  sanitizeMessages(messages: ChatMessage[]): any[];
  
  /** 思考プロセスメッセージを作成 */
  createThinkingMessage(content: string | object, signature?: string): ThinkingChatMessage;
}

/**
 * ツール呼び出し処理モジュールのインターフェース
 * ツール呼び出し処理関連の操作を提供
 */
export interface ToolCallProcessorInterface {
  /** ツール呼び出しとツール結果を前処理 */
  preprocessToolCallsAndResults(messages: ChatMessage[]): ChatMessage[];
  
  /** ツール引数を処理 */
  processToolArguments(
    args: string,
    toolName: string,
    messages: ChatMessage[]
  ): string;
  
  /** ツール呼び出しを処理 */
  processToolCall(
    toolCall: ToolCall | null,
    currentToolCallIndex: number | null,
    jsonBuffer: string,
    isBufferingJson: boolean,
    toolCallDelta: any,
    toolCalls: ToolCall[]
  ): ToolCallResult;
}