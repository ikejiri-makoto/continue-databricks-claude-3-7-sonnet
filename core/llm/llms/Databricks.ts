import { ChatMessage, LLMOptions, ThinkingChatMessage } from "../../index.js";
import { renderChatMessage } from "../../util/messageContent.js";
import { BaseLLM } from "../index.js";
import { DatabricksLLMOptions } from "./Databricks/types/types.js";

// 共通ユーティリティのインポート
import { getErrorMessage } from "../utils/errors.js";

// Databricks固有のモジュールインポート
import { DatabricksConfig } from "./Databricks/config.js";
import { MessageProcessor } from "./Databricks/messages.js";
import { ToolCallProcessor } from "./Databricks/toolcalls.js";
import { StreamingProcessor } from "./Databricks/streaming.js";
import { DatabricksErrorHandler } from "./Databricks/errors.js";
import { DatabricksHelpers } from "./Databricks/helpers.js";

// 型定義のインポート
// 型拡張を最初に読み込み
import "./Databricks/types/extension.d.ts";
// 次に具体的な型をインポート
import {
  DatabricksCompletionOptions,
  ToolCall,
  ToolResultMessage,
  StreamingState,
  ErrorHandlingResult
} from "./Databricks/types/index.js";

/**
 * Databricks Claude LLM クラス
 * OpenAI互換APIを使用してDatabricks上のClaude 3.7 Sonnetにアクセスする
 * オーケストレーターとして各モジュールを調整する責任を持つ
 */
class Databricks extends BaseLLM {
  static providerName = "databricks";
  static defaultOptions: Partial<DatabricksLLMOptions> = {
    model: "databricks-claude-3-7-sonnet",
    contextLength: 200_000,
    completionOptions: {
      model: "databricks-claude-3-7-sonnet",
      maxTokens: 128000,
      temperature: 1,
    },
    capabilities: {
      tools: true
    },
    // parallel_tool_callsパラメータはDatabricksではサポートされていないので無効化
    parallelToolCalls: false
  };

  // ログを常に表示するかどうかの設定
  private alwaysLogThinking: boolean = false;

  constructor(options: LLMOptions) {
    super(options);
    
    // 設定の初期化を設定管理モジュールに委譲
    if (!this.apiBase) {
      this.apiBase = DatabricksConfig.getApiBaseFromConfig();
    }
    if (!this.apiKey) {
      this.apiKey = DatabricksConfig.getApiKeyFromConfig();
    }
    
    // 思考プロセスを常にログに表示するかどうかの設定を読み込む
    // 設定が明示的にfalseでなければtrueに設定（デフォルトで有効）
    this.alwaysLogThinking = (options as any).thinkingProcess !== false;
  }

  /**
   * ストリーミング用の補完メソッド
   * BaseLLMのインターフェースに準拠
   */
  protected async *_streamComplete(
    prompt: string,
    signal: AbortSignal,
    options: DatabricksCompletionOptions,
  ): AsyncGenerator<string> {
    const messages = [{ role: "user" as const, content: prompt }];
    for await (const update of this._streamChat(messages, signal, options)) {
      yield renderChatMessage(update);
    }
  }

  /**
   * ストリーミングチャットメソッド - Databricks上のClaude 3.7 Sonnetと対話する
   * BaseLLMのインターフェースに準拠
   */
  protected async *_streamChat(
    messages: ChatMessage[],
    signal: AbortSignal,
    options: DatabricksCompletionOptions,
  ): AsyncGenerator<ChatMessage> {
    // 設定の検証を設定管理モジュールに委譲
    DatabricksConfig.validateApiConfig(this.apiKey, this.apiBase);
    
    // ToolCallProcessorからツール呼び出しメッセージの前処理を取得
    const processedMessages = ToolCallProcessor.preprocessToolCallsAndResults(messages);
    
    let retryCount = 0;
    const MAX_RETRIES = 3;
    let lastError: Error | null = null;

    while (retryCount <= MAX_RETRIES) {
      try {
        // リクエストとレスポンスの処理
        // 前処理されたメッセージを使用
        const result = await this.processStreamingRequest(processedMessages, signal, options, retryCount);
        
        // 正常に処理が完了したらループを終了
        if (result.success) {
          for (const message of result.messages) {
            yield message;
          }
          break;
        } else {
          // エラーが発生した場合
          retryCount++;
          // エラーがundefinedの場合はnullに変換して型エラーを回避
          lastError = result.error !== undefined ? result.error : null;
          
          if (retryCount <= MAX_RETRIES) {
            // リトライ処理をエラーハンドラモジュールに委譲
            const errorToPass = result.error !== undefined ? result.error : new Error("Unknown error occurred");
            await DatabricksErrorHandler.handleRetry(retryCount, errorToPass, result.state);
            continue;
          }
        }
      } catch (error: unknown) {
        // 予期しないエラーの処理
        retryCount++;
        const errorMessage = getErrorMessage(error);
        lastError = error instanceof Error ? error : new Error(errorMessage);
        
        if (retryCount <= MAX_RETRIES) {
          // リトライ処理をエラーハンドラモジュールに委譲
          await DatabricksErrorHandler.handleRetry(retryCount, lastError);
        } else {
          console.error(`最大リトライ回数 (${MAX_RETRIES}) を超えました。最後のエラー: ${errorMessage}`);
          throw lastError;
        }
      }
    }
  }

  /**
   * ストリーミングリクエストを処理し、レスポンスを生成
   * 各モジュールを調整する中心的な役割を果たす
   * 
   * @param messages メッセージ配列
   * @param signal AbortSignal
   * @param options 補完オプション
   * @param retryCount 現在のリトライ回数
   * @returns 処理結果オブジェクト
   */
  private async processStreamingRequest(
    messages: ChatMessage[], 
    signal: AbortSignal, 
    options: DatabricksCompletionOptions,
    retryCount: number
  ): Promise<{
    success: boolean;
    messages: ChatMessage[];
    error?: Error;
    state?: StreamingState;
  }> {
    const responseMessages: ChatMessage[] = [];
    
    try {
      // リクエストパラメータの構築をヘルパーモジュールに委譲
      const args = DatabricksHelpers.convertArgs(options);
      
      // メッセージ変換をメッセージ処理モジュールに委譲
      const formattedMessages = MessageProcessor.convertToOpenAIFormat(
        messages, 
        MessageProcessor.sanitizeMessages(messages)
      );
      
      // リクエストボディを構築
      const requestBody = {
        ...args,
        messages: formattedMessages,
      };

      // URLの正規化を設定管理モジュールに委譲
      if (!this.apiBase) {
        throw new Error("API base URL is not defined");
      }
      
      const apiBaseUrl = this.apiBase ? DatabricksConfig.normalizeApiUrl(this.apiBase) : "";
      if (apiBaseUrl === "") {
        throw new Error("Normalized API base URL is empty");
      }
      
      // デバッグログ
      console.log(`Sending request to Databricks API: ${apiBaseUrl}`);
      console.log('Request body:', JSON.stringify(requestBody, null, 2));

      // タイムアウトコントローラの設定を設定管理モジュールに委譲
      const { timeoutController, timeoutId, combinedSignal } = DatabricksConfig.setupTimeoutController(signal, options);

      // リクエストパラメータが正しいか確認
      // 特にDatabricksエンドポイントがサポートしないパラメータの有無を確認
      if ((requestBody as any).parallel_tool_calls !== undefined) {
        console.warn('parallel_tool_callsパラメータがリクエストに含まれています。Databricksはこのパラメータをサポートしていません。');
        // parallel_tool_callsパラメータを安全に除外
        delete (requestBody as any).parallel_tool_calls;
      }

      // DatabricksのエンドポイントにOpenAI形式でリクエスト
      const response = await this.fetch(apiBaseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: combinedSignal,
      });

      // タイムアウトタイマーをクリア（レスポンスが正常に返ってきた場合）
      clearTimeout(timeoutId);

      // レスポンスのステータスコードチェック
      if (!response.ok) {
        // エラーレスポンスの解析をエラーハンドラモジュールに委譲
        const errorResponse = await DatabricksErrorHandler.parseErrorResponse(response);
        return { 
          success: false, 
          messages: [], 
          error: errorResponse.error
        };
      }

      // ストリーミングなしの場合は単一のレスポンスを返す
      if (options.stream === false) {
        // 非ストリーミングレスポンスの処理をヘルパーモジュールに委譲
        const message = await DatabricksHelpers.processNonStreamingResponse(response);
        responseMessages.push(message);
        return { success: true, messages: responseMessages };
      }

      // ストリーミングレスポンスの処理をストリーミング処理モジュールに委譲
      const streamResult = await StreamingProcessor.processStreamingResponse(
        response, 
        messages, 
        retryCount, 
        this.alwaysLogThinking
      );
      
      if (streamResult.success) {
        responseMessages.push(...streamResult.messages);
        return { success: true, messages: responseMessages };
      } else {
        return { 
          success: false, 
          messages: [], 
          error: streamResult.error,
          state: streamResult.state
        };
      }
    } catch (error) {
      // エラー情報の構築をエラーハンドラモジュールのパターンに準拠
      return { 
        success: false, 
        messages: [], 
        error: error instanceof Error ? error : new Error(getErrorMessage(error)) 
      };
    }
  }
}

export default Databricks;