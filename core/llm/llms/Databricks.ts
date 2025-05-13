import { ChatMessage, LLMOptions, ThinkingChatMessage } from "../../index.js";
import { renderChatMessage } from "../../util/messageContent.js";
import { BaseLLM } from "../index.js";
import { DatabricksLLMOptions } from "./Databricks/types/types.js";

// 共通ユーティリティをインポート - コード全体で使用する
import { getErrorMessage, isConnectionError } from "../utils/errors.js";
import { streamSse } from "../stream.js";
import { safeStringify } from "../utils/json.js";
import { extractContentAsString } from "../utils/messageUtils.js";

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
    }
    // DatabricksエンドポイントがOpenAIと互換性があるが、
    // parallel_tool_callsパラメータはDatabricksエンドポイントでサポートされていないため、
    // このパラメータを設定すると「不明なフィールド」エラーが発生する
    // そのため、capabilities.parallel_tool_callsは明示的に含めない
  };

  // ログを常に表示するかどうかの設定
  private alwaysLogThinking: boolean = false;
  
  // TypeScriptエラー修正: optionsプロパティを追加
  protected options: DatabricksLLMOptions;

  constructor(options: LLMOptions) {
    super(options);
    
    // 型変換してoptionsプロパティに保存
    this.options = options as DatabricksLLMOptions;
    
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
    
    // インスタンス生成時に注意喚起のログを表示
    console.log("Databricksプロバイダーを初期化しました: parallel_tool_callsパラメータはサポートされていません");
  }

  /**
   * APIエンドポイントURLの取得
   * すべてのリクエストで一貫して同じ方法でURLを構築するための共通メソッド
   * @returns 正規化されたDatabricksエンドポイントURL
   */
  private getApiEndpoint(): string {
    // このメソッドを使用して、すべてのリクエストが統一された方法でURLを取得することを保証
    if (!this.apiBase) {
      throw new Error("API base URL is not defined");
    }
    
    // 設定管理モジュールを使用して常に正規化されたURLを取得
    const normalizedUrl = DatabricksConfig.normalizeApiUrl(this.apiBase);
    return normalizedUrl;
  }

  /**
   * メッセージシーケンスを検証し、tool_resultブロックが常に対応するtool_useブロックの
   * 後に来るようにする
   * @param messages 検証するメッセージ配列
   * @returns 検証済みのメッセージ配列
   */
  private validateToolCallSequence(messages: ChatMessage[]): ChatMessage[] {
    // 検証済みメッセージ配列を作成
    const validatedMessages: ChatMessage[] = [];
    
    // 前回のメッセージがtool_useを含んでいたか追跡
    let previousHadToolUse = false;
    let toolUseIds: string[] = [];
    
    for (const message of messages) {
      // 現在のメッセージがtool_resultを含むか確認
      const hasToolResult = message.role === "tool" || 
        (typeof message.content === "string" && 
         message.content.includes("tool_call_id"));
      
      // tool_resultメッセージがあるが前のメッセージにtool_useがない場合
      if (hasToolResult && !previousHadToolUse) {
        console.warn("Message sequence violation: tool_result without preceding tool_use");
        // このツール結果メッセージをスキップする
        continue;
      }
      
      // 現在のメッセージがtool_useを含むか確認
      const hasToolUse = message.role === "assistant" && 
        typeof message.toolCalls !== "undefined" && 
        message.toolCalls.length > 0;
      
      // ツールIDを追跡（後の検証用）
      if (hasToolUse && message.toolCalls) {
        toolUseIds = message.toolCalls?.map(tc => tc?.id).filter(Boolean) as string[] || [];
      }
      
      // 検証済みメッセージに追加
      validatedMessages.push(message);
      
      // 次のイテレーション用に状態を更新
      previousHadToolUse = hasToolUse;
    }
    
    return validatedMessages;
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
    
    // まず無効なロールを持つメッセージを修正
    let processedMessages = MessageProcessor.validateAndFixMessageRoles(messages);
    
    // 次にツール呼び出しの前処理
    processedMessages = ToolCallProcessor.preprocessToolCallsAndResults(processedMessages);
    
    // メッセージシーケンスの検証を実行
    processedMessages = this.validateToolCallSequence(processedMessages);

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
          console.error(`最大リトライ回数(${MAX_RETRIES})に達しました: ${errorMessage}`);
          throw lastError;
        }
      }
    }
  }

  /**
   * 通常のチャット完了メソッド
   * ストリーミングではなく一度にレスポンスを取得する
   * @param messages メッセージ配列
   * @param signal AbortSignal
   * @param options 補完オプション
   * @returns アシスタントメッセージ
   */
  private async chatCompletion(
    messages: ChatMessage[],
    signal: AbortSignal,
    options: DatabricksCompletionOptions
  ): Promise<ChatMessage> {
    const args = DatabricksHelpers.convertArgs(messages, options);
    const endpoint = this.getApiEndpoint();
    
    const response = await this.fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(args),
      signal
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Databricks API error: ${response.status} ${errorText}`);
    }
    
    const responseData = await response.json();
    
    // レスポンスからアシスタントメッセージを抽出
    let assistantMessage: ChatMessage = { role: "assistant", content: "" };
    
    if (responseData.choices && responseData.choices.length > 0) {
      const choice = responseData.choices[0];
      
      if (choice.message) {
        // コンテンツの抽出
        const content = choice.message.content;
        
        // ツール呼び出しの抽出
        const toolCalls = choice.message.tool_calls || [];
        
        // アシスタントメッセージの作成
        assistantMessage = {
          role: "assistant",
          content: content,
          toolCalls: toolCalls.map((tc: any) => ({
            id: tc.id,
            type: tc.type,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments
            }
          }))
        };
      }
    }
    
    return assistantMessage;
  }

  /**
   * ストリーミングリクエストを処理し、レスポンスを生成
   * 各モジュールを調整する中心的な役割を果たす
   * 
   * @param messages メッセージ配列
   * @param signal AbortSignal
   * @param options 補完オプション
   * @param retryCount 現在のリトライカウント
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
      // リクエストを前処理してリクエストボディを取得
      // このメソッドはメッセージの前処理とparameter変換を行います
      const requestBody = await DatabricksHelpers.prepareRequest(
        messages,
        options,
        this.options
      );
      
      // 統一された方法でAPIエンドポイントを取得
      const apiEndpoint = this.getApiEndpoint();
      
      // デバッグログ - リクエスト詳細を常に記録
      console.log(`Databricksエンドポイント: ${apiEndpoint}`);
      
      // モデル情報をrequestBodyから取得して型安全性を確保
      const modelForLogging = requestBody.model || options.model || this.model;
      console.log(`Databricksリクエスト: モデル=${modelForLogging}`);
      console.log(`Databricksリクエスト: メッセージ数=${requestBody.messages?.length || 0}`);

      // ツール関連のログを追加（requestBodyから直接取得して型安全性を確保）
      if (requestBody.tools && Array.isArray(requestBody.tools)) {
        console.log(`Databricksリクエスト: ツール数=${requestBody.tools.length}`);
        try {
          // ツール名を安全に取得して結合
          const toolNames = requestBody.tools
            .map((t: any) => t?.function?.name || 'unnamed')
            .join(', ');
          console.log(`Databricksリクエスト: ツール名=${toolNames}`);
          
          // 開発モードでより詳細なツール情報をログ出力
          requestBody.tools.forEach((tool: any, index: number) => {
            const toolInfo = {
              name: tool?.function?.name || 'unnamed',
              type: tool?.type || 'unknown',
              params_count: tool?.function?.parameters?.properties ? 
                Object.keys(tool.function.parameters.properties).length : 0
            };
            console.log(`ツール[${index}]: ${safeStringify(toolInfo, "{}")}`);
          });
        } catch (e) {
          console.log(`ツール情報のログ出力中にエラー: ${getErrorMessage(e)}`);
        }
      }

      // タイムアウトコントローラの設定を設定管理モジュールに委譲
      const { timeoutController, timeoutId, combinedSignal } = 
        DatabricksConfig.setupTimeoutController(signal, options);
      
      // リクエストのJSON化と最終チェック
      const requestBodyString = safeStringify(requestBody, "{}");
      
      // 完全なリクエストボディを詳細にログ出力（デバッグ用）
      console.log(`完全なリクエストボディJSON: ${requestBodyString}`);
      
      // DatabricksのエンドポイントにOpenAI形式でリクエスト
      const response = await this.fetch(apiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: requestBodyString,
        signal: combinedSignal,
      });
      
      // レスポンスヘッダー情報をログ出力
      console.log(`Request ID: ${response.headers.get('x-request-id') || response.headers.get('x-ms-request-id') || 'unknown'}, Status: ${response.status}`);
      
      // タイムアウトタイマーをクリア
      clearTimeout(timeoutId);
      
      // エラーレスポンスのチェック
      if (!response.ok) {
        // エラーレスポンスの解析をエラーハンドラモジュールに委譲
        const errorResponse = await DatabricksErrorHandler.parseErrorResponse(response);
        return { 
          success: false, 
          messages: [], 
          error: errorResponse.error
        };
      }
      
      // 非ストリーミングレスポンスの処理
      if (options.stream === false) {
        // ヘルパーモジュールに処理を委譲
        const message = await DatabricksHelpers.processNonStreamingResponse(response);
        responseMessages.push(message);
        return { success: true, messages: responseMessages };
      }
      
      // ストリーミングレスポンスの処理
      try {
        // ストリーミング処理モジュールに処理を委譲
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
      } catch (streamError: unknown) {
        const errorMessage = getErrorMessage(streamError);
        console.error(`ストリーミング処理エラー: ${errorMessage}`);
        
        if (isConnectionError(streamError)) {
          console.error(`接続エラーの詳細: ${errorMessage}`);
        }
        
        throw streamError;
      }
    } catch (error: unknown) {
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