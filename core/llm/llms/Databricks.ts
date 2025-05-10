import { ChatMessage, CompletionOptions, LLMOptions, ThinkingChatMessage } from "../../index.js";
import { renderChatMessage } from "../../util/messageContent.js";
import { BaseLLM } from "../index.js";

// 共通ユーティリティのインポート
import { getErrorMessage, isConnectionError } from "../utils/errors.js";
import { safeStringify, safeJsonParse } from "../utils/json.js";
import { processSSEStream } from "../utils/sseProcessing.js";
import { processContentDelta } from "../utils/streamProcessing.js";
import { isSearchTool, processSearchToolArguments } from "../utils/toolUtils.js";

// Databricks固有のモジュールインポート
import { DatabricksConfig } from "./Databricks/config.js";
import { MessageProcessor } from "./Databricks/messages.js";
import { ToolCallProcessor } from "./Databricks/toolcalls.js";
import { StreamingProcessor } from "./Databricks/streaming.js";

// 型定義のインポート
// 型拡張を最初に読み込み、その後具体的な型をインポート
import "./Databricks/types/extension.d.ts";
import { ToolCall } from "./Databricks/types/types.js";

// 定数定義
const DEFAULT_MAX_TOKENS = 32000;
const MIN_MAX_TOKENS = 4096;
const DEFAULT_TIMEOUT_MS = 300000; // 5分
const MAX_RETRIES = 3;

/**
 * Databricks Claude LLM クラス
 * OpenAI互換APIを使用してDatabricks上のClaude 3.7 Sonnetにアクセスする
 */
class Databricks extends BaseLLM {
  static providerName = "databricks";
  static defaultOptions: Partial<LLMOptions> = {
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
  };

  // ログを常に表示するかどうかの設定
  private alwaysLogThinking: boolean = false;

  constructor(options: LLMOptions) {
    super(options);
    // 設定ファイルからapiBaseとapiKeyを読み取る
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
   * OpenAI形式のオプションに変換
   */
  public convertArgs(options: CompletionOptions) {
    const modelName = options.model || "databricks-claude-3-7-sonnet";
    
    // max_tokensのデフォルト値または指定値を取得
    // 最小値を設定して小さすぎる値を防止（少なくとも4096）
    const maxTokens = Math.max(options.maxTokens || DEFAULT_MAX_TOKENS, MIN_MAX_TOKENS);
    
    // 思考予算を計算 - max_tokensの半分または最大64000を上限とする
    // 常にmax_tokensよりも小さくなるようにする
    const thinkingBudget = Math.min(Math.floor(maxTokens * 0.5), 64000);
    
    // OpenAI互換形式のリクエストパラメータ
    const finalOptions: Record<string, any> = {
      model: modelName,
      max_tokens: maxTokens,
      temperature: options.temperature ?? 1,
      top_p: options.topP,
      stream: options.stream ?? true,
    };

    // 空でないstop配列のみを含める
    if (options.stop && Array.isArray(options.stop) && options.stop.length > 0) {
      finalOptions.stop = options.stop.filter(x => typeof x === 'string' && x.trim() !== "");
    }

    // タイムアウト設定はDatabricksエンドポイントでサポートされていないためリクエストボディに含めない
    // Fetch APIのtimeoutオプションとAbortControllerで処理する

    // 重要: Databricksエンドポイントでは思考モードオプションをリクエストに設定しません
    // エラーメッセージで「messages.1.content.0.type: Expected `thinking`...」というエラーが発生するため
    // 思考モードはメッセージの形式で実現する必要があり、APIオプションとしては送信しない

    // デバッグログ
    console.log(`Token settings - max_tokens: ${maxTokens}, thinking budget: ${thinkingBudget}`);

    // ツール関連のパラメータがある場合のみ追加
    if (options.tools && Array.isArray(options.tools) && options.tools.length > 0) {
      finalOptions.tools = options.tools.map(tool => ({
        type: "function",
        function: {
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters,
        }
      }));

      // ツールがあるにもかかわらずQueryパラメータが不足する可能性のある特定のツールを検出
      const searchTools = options.tools.filter(tool => 
        isSearchTool(tool.function.name)
      );

      if (searchTools.length > 0) {
        console.log(`検索ツールが検出されました: ${searchTools.map(t => t.function.name).join(', ')}`);
      }
    }

    if (options.toolChoice) {
      finalOptions.tool_choice = {
        type: "function",
        function: {
          name: options.toolChoice.function.name
        }
      };
    }

    return finalOptions;
  }

  /**
   * ChatMessageをOpenAI形式に変換
   */
  private convertMessages(messages: ChatMessage[]): any[] {
    // まず、会話履歴をサニタイズして標準形式に変換
    const sanitizedMessages = MessageProcessor.sanitizeMessages(messages);
    
    // ツール呼び出しと結果の前処理を行う
    const processedMessages = ToolCallProcessor.preprocessToolCallsAndResults(sanitizedMessages);
    
    // OpenAI形式に変換
    return MessageProcessor.convertToOpenAIFormat(messages, processedMessages);
  }

  /**
   * ストリーミング用の補完メソッド
   */
  protected async *_streamComplete(
    prompt: string,
    signal: AbortSignal,
    options: CompletionOptions,
  ): AsyncGenerator<string> {
    const messages = [{ role: "user" as const, content: prompt }];
    for await (const update of this._streamChat(messages, signal, options)) {
      yield renderChatMessage(update);
    }
  }

  /**
   * ストリーミングチャットメソッド - Databricks上のClaude 3.7 Sonnetと対話する
   */
  protected async *_streamChat(
    messages: ChatMessage[],
    signal: AbortSignal,
    options: CompletionOptions,
  ): AsyncGenerator<ChatMessage> {
    this.validateApiConfig();
    
    let retryCount = 0;
    let lastError: Error | null = null;

    while (retryCount <= MAX_RETRIES) {
      try {
        // リクエストとレスポンスの処理
        const result = await this.processStreamingRequest(messages, signal, options, retryCount);
        
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
            // リトライのためのバックオフと状態管理
            // エラーがundefinedの場合は新しいErrorオブジェクトを作成
            const errorToPass = result.error !== undefined ? result.error : new Error("Unknown error occurred");
            await this.handleRetry(retryCount, errorToPass, result.state);
            continue;
          }
        }
      } catch (error: unknown) {
        // 予期しないエラーの処理
        retryCount++;
        const errorMessage = getErrorMessage(error);
        lastError = error instanceof Error ? error : new Error(errorMessage);
        
        if (retryCount <= MAX_RETRIES) {
          await this.handleRetry(retryCount, lastError);
        } else {
          console.error(`最大リトライ回数 (${MAX_RETRIES}) を超えました。最後のエラー: ${errorMessage}`);
          throw lastError;
        }
      }
    }
  }

  /**
   * API設定が有効かどうかを検証
   * @throws エラー - API設定が無効な場合
   */
  private validateApiConfig(): void {
    if (!this.apiKey || this.apiKey === "") {
      throw new Error("Request not sent. Databricks API key is not set in your config.");
    }

    if (!this.apiBase) {
      throw new Error("Request not sent. Could not find Databricks API endpoint URL in your config.");
    }
  }

  /**
   * ストリーミングリクエストを処理し、レスポンスを生成
   * @param messages メッセージ配列
   * @param signal AbortSignal
   * @param options 補完オプション
   * @param retryCount 現在のリトライ回数
   * @returns 処理結果オブジェクト
   */
  private async processStreamingRequest(
    messages: ChatMessage[], 
    signal: AbortSignal, 
    options: CompletionOptions,
    retryCount: number
  ): Promise<{
    success: boolean;
    messages: ChatMessage[];
    error?: Error;
    state?: any;
  }> {
    const responseMessages: ChatMessage[] = [];
    
    try {
      // リクエストボディに必要なパラメータを構築
      const args = this.convertArgs(options);
      
      // OpenAI形式のリクエストボディを構築
      const requestBody = {
        ...args,
        messages: this.convertMessages(messages),
      };

      // URLの末尾のスラッシュを確認・修正
      // apiBaseがnullでないことを確認（validateApiConfigでチェック済み）
      if (!this.apiBase) {
        throw new Error("API base URL is not defined");
      }
      
      // apiBaseが確実に存在することを明示（validateApiConfigでチェック済み）
      const apiBaseUrl = this.apiBase ? DatabricksConfig.normalizeApiUrl(this.apiBase) : "";
      if (apiBaseUrl === "") {
        throw new Error("Normalized API base URL is empty");
      }
      
      // デバッグログ
      console.log(`Sending request to Databricks API: ${apiBaseUrl}`);
      console.log('Request body:', JSON.stringify(requestBody, null, 2));

      // タイムアウトコントローラの設定
      const { timeoutController, timeoutId, combinedSignal } = this.setupTimeoutController(signal, options);

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
        const errorResponse = await this.parseErrorResponse(response);
        return { 
          success: false, 
          messages: [], 
          error: errorResponse.error
        };
      }

      // ストリーミングなしの場合は単一のレスポンスを返す
      if (options.stream === false) {
        const message = await this.processNonStreamingResponse(response);
        responseMessages.push(message);
        return { success: true, messages: responseMessages };
      }

      // ストリーミングレスポンスの処理
      const streamResult = await this.processStreamingResponse(response, messages, retryCount);
      
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
      return { 
        success: false, 
        messages: [], 
        error: error instanceof Error ? error : new Error(getErrorMessage(error)) 
      };
    }
  }

  /**
   * タイムアウトコントローラを設定
   * @param signal ユーザー提供のAbortSignal
   * @param options 補完オプション
   * @returns タイムアウトコントローラ、タイムアウトID、結合されたシグナル
   */
  private setupTimeoutController(
    signal: AbortSignal, 
    options: CompletionOptions
  ): {
    timeoutController: AbortController;
    timeoutId: NodeJS.Timeout;
    combinedSignal: AbortSignal;
  } {
    const timeoutController = new AbortController();
    const timeoutMs = (options as any).requestTimeout 
      ? (options as any).requestTimeout * 1000 
      : DEFAULT_TIMEOUT_MS;
    
    const timeoutId = setTimeout(() => {
      console.log(`リクエストタイムアウト（${timeoutMs}ms）に達したため中断します`);
      timeoutController.abort('Request timeout');
    }, timeoutMs);
    
    // ユーザー提供のシグナルと内部タイムアウトシグナルを結合
    const combinedSignal = AbortSignal.any([signal, timeoutController.signal]);
    
    return { timeoutController, timeoutId, combinedSignal };
  }

  /**
   * エラーレスポンスをパース
   * @param response HTTPレスポンス
   * @returns パース済みエラーレスポンス
   */
  private async parseErrorResponse(
    response: Response
  ): Promise<{
    error: Error;
  }> {
    const errorText = await response.text();
    try {
      // 型を明示的に指定
      interface ErrorResponse {
        error?: {
          message?: string;
        };
        message?: string;
      }
      
      const errorJson = safeJsonParse<ErrorResponse>(errorText, { error: { message: errorText } });
      console.log(`Request ID: ${response.headers.get("request-id")}, Status: ${response.status}`);
      
      // エラーメッセージを安全に取得（複数の場所を確認）
      const errorMessage = 
        (errorJson.error && errorJson.error.message) || // error.message が存在する場合
        errorJson.message || // トップレベルの message が存在する場合
        errorText; // どちらも存在しない場合は元のテキスト
      
      return {
        error: new Error(`Databricks API error: ${response.status} - ${errorMessage}`)
      };
    } catch (e) {
      return {
        error: new Error(`Databricks API error: ${response.status} - ${errorText}`)
      };
    }
  }

  /**
   * 非ストリーミングレスポンスを処理
   * @param response HTTPレスポンス
   * @returns 処理されたメッセージ
   */
  private async processNonStreamingResponse(
    response: Response
  ): Promise<ChatMessage> {
    const data = await response.json();
    return { 
      role: "assistant", 
      content: safeStringify(data.choices[0].message.content, "")
    };
  }

  /**
   * ストリーミングレスポンスを処理
   * @param response HTTPレスポンス
   * @param messages 元のメッセージ配列
   * @param retryCount 現在のリトライ回数
   * @returns 処理結果オブジェクト
   */
  private async processStreamingResponse(
    response: Response,
    messages: ChatMessage[],
    retryCount: number
  ): Promise<{
    success: boolean;
    messages: ChatMessage[];
    error?: Error;
    state?: any;
  }> {
    // ストリーミングレスポンスの処理
    let currentMessage: ChatMessage = { role: "assistant", content: "" };
    let toolCalls: ToolCall[] = [];
    let currentToolCall: ToolCall | null = null;
    let currentToolCallIndex: number | null = null;
    let thinkingChunkCount = 0;

    // JSONフラグメントのバッファリングのための変数
    let jsonBuffer: string = "";
    let isBufferingJson: boolean = false;
    
    // 返却するメッセージのコレクション
    const responseMessages: ChatMessage[] = [];

    console.log("------------- 応答処理開始 -------------");

    try {
      // 再接続フラグ - リトライ時にtrueに設定
      const isReconnect = retryCount > 0;

      // 再接続時に状態を復元
      if (isReconnect) {
        const recoveredState = StreamingProcessor.handleReconnection(
          currentMessage,
          toolCalls,
          currentToolCall,
          currentToolCallIndex
        );
        
        // 復元された状態を適用
        currentMessage = recoveredState.restoredMessage;
        toolCalls = recoveredState.restoredToolCalls;
        currentToolCall = recoveredState.restoredCurrentToolCall;
        currentToolCallIndex = recoveredState.restoredCurrentToolCallIndex;
        jsonBuffer = recoveredState.restoredJsonBuffer;
        isBufferingJson = recoveredState.restoredIsBufferingJson;
      }

      // 共通のSSEストリーム処理ユーティリティを使用
      for await (const chunk of processSSEStream(response)) {
        // 受信したチャンクのデバッグ
        console.log(`Received chunk type: ${Object.keys(chunk).join(", ")}`);
        
        // ストリーミングチャンクを処理
        const processResult = StreamingProcessor.processChunk(
          chunk,
          currentMessage,
          toolCalls,
          currentToolCall,
          currentToolCallIndex,
          jsonBuffer,
          isBufferingJson,
          messages,
          isReconnect // 再接続フラグを追加
        );
        
        // 処理結果を適用
        currentMessage = processResult.updatedMessage;
        toolCalls = processResult.updatedToolCalls;
        currentToolCall = processResult.updatedCurrentToolCall;
        currentToolCallIndex = processResult.updatedCurrentToolCallIndex;
        jsonBuffer = processResult.updatedJsonBuffer;
        isBufferingJson = processResult.updatedIsBufferingJson;
        
        // 思考メッセージがある場合
        if (processResult.thinkingMessage) {
          thinkingChunkCount++;
          
          //思考プロセスのログ出力 - alwaysLogThinkingフラグに基づいて制御
          if (this.alwaysLogThinking || process.env.NODE_ENV === 'development') {
            if (thinkingChunkCount % 10 === 0) {
              console.log(`\n===== 思考チャンク #${thinkingChunkCount} =====`);
              console.log(processResult.thinkingMessage.content.toString().substring(0, 100) + "...");
            }
          }
          
          responseMessages.push(processResult.thinkingMessage);
          continue;
        }
        
        // 通常のメッセージまたはツール呼び出しメッセージの場合
        if (processResult.shouldYieldMessage) {
          // ツール呼び出しがある場合、ツール呼び出しを含むメッセージをyield
          if (toolCalls.filter(Boolean).length > 0) {
            const msgWithTools: ChatMessage & {toolCalls?: ToolCall[]} = {
              role: "assistant",
              content: currentMessage.content,
              toolCalls: toolCalls.filter(Boolean)
            };
            
            responseMessages.push(msgWithTools);
          } else {
            // 通常のメッセージをyield
            responseMessages.push({ ...currentMessage });
          }
        }
      }

      // 正常に処理が完了したらループを終了
      console.log("ストリーミング処理が正常に完了しました。");
      
      // 処理完了時に永続的なストリーム状態をリセット
      StreamingProcessor.resetPersistentState();

      // 未処理のJSONバッファとツール呼び出しの最終処理
      this.finalizeStreamingProcessing(
        jsonBuffer, 
        isBufferingJson, 
        currentToolCall, 
        currentToolCallIndex, 
        toolCalls, 
        messages
      );

      // 処理統計を出力
      if (thinkingChunkCount > 0 && (this.alwaysLogThinking || process.env.NODE_ENV === 'development')) {
        console.log(`\n===== 思考モード処理完了 =====`);
        console.log(`合計思考チャンク数: ${thinkingChunkCount}`);
      }

      console.log(`\n===== 応答処理完了 =====`);

      // 最終的なメッセージを返す
      const finalToolCalls = toolCalls.filter(Boolean);
      if (currentMessage.content || finalToolCalls.length > 0) {
        // 標準的なChatMessageを使いながら、toolCallsプロパティを追加
        const chatMsg: ChatMessage & {toolCalls?: ToolCall[]} = {
          role: "assistant",
          content: currentMessage.content
        };
        
        // ツール呼び出しがある場合は追加プロパティとして設定
        if (finalToolCalls.length > 0) {
          chatMsg.toolCalls = finalToolCalls;
        }
        
        responseMessages.push(chatMsg);
      }
      
      return { success: true, messages: responseMessages };
      
    } catch (streamError: unknown) {
      // エラーの詳細をログに記録
      const errorMessage = getErrorMessage(streamError);
      console.error(`Error processing streaming response: ${errorMessage}`);
      
      // 接続エラーやタイムアウトエラーの場合
      if (isConnectionError(streamError) || 
          (streamError instanceof DOMException && streamError.name === 'AbortError')) {
        
        // 状態を永続化して次回のリトライに備える
        StreamingProcessor.updatePersistentState({
          jsonBuffer,
          isBufferingJson,
          toolCallsInProgress: toolCalls,
          currentToolCallIndex,
          lastReconnectTimestamp: Date.now()
        });
        
        return { 
          success: false, 
          messages: [], 
          error: streamError instanceof Error ? streamError : new Error(errorMessage),
          state: {
            jsonBuffer,
            isBufferingJson,
            toolCalls,
            currentToolCallIndex
          }
        };
      }
      
      // その他のエラーはそのまま投げる
      return { 
        success: false, 
        messages: [], 
        error: streamError instanceof Error ? streamError : new Error(errorMessage)
      };
    }
  }

  /**
   * ストリーミング処理の最終処理
   * @param jsonBuffer JSONバッファ
   * @param isBufferingJson JSONバッファリング中フラグ
   * @param currentToolCall 現在のツール呼び出し
   * @param currentToolCallIndex 現在のツール呼び出しインデックス
   * @param toolCalls ツール呼び出し配列
   * @param messages メッセージ配列
   */
  private finalizeStreamingProcessing(
    jsonBuffer: string,
    isBufferingJson: boolean,
    currentToolCall: ToolCall | null,
    currentToolCallIndex: number | null,
    toolCalls: ToolCall[],
    messages: ChatMessage[]
  ): void {
    // 未処理のJSONバッファがあれば最終処理
    if (isBufferingJson && jsonBuffer) {
      currentToolCall = StreamingProcessor.finalizeJsonBuffer(jsonBuffer, isBufferingJson, currentToolCall, messages);
      
      // currentToolCallが更新された場合、対応するtoolCallsも更新
      if (currentToolCall !== null && currentToolCallIndex !== null) {
        // 明示的な型アノテーションとキャストで型を確定させる
        const index: number = Number(currentToolCallIndex);
        
        // nullでないこと、有効な整数なこと、配列の範囲内であることを確認
        if (!Number.isNaN(index) && index >= 0 && index < toolCalls.length) {
          toolCalls[index] = currentToolCall;
        } else {
          console.warn(`無効なツール呼び出しインデックス: ${currentToolCallIndex}`);
        }
      }
    }

    // 検索ツールで引数がない場合、デフォルトのクエリを設定
    StreamingProcessor.ensureSearchToolArguments(toolCalls, messages);
  }

  /**
   * リトライ処理
   * @param retryCount リトライ回数
   * @param error エラー
   * @param state 状態オブジェクト
   */
  private async handleRetry(
    retryCount: number, 
    error: Error,
    state?: any
  ): Promise<void> {
    // バックオフ時間（指数バックオフ）- 初回は短めに、その後長めに
    const backoffTime = Math.min(2000 * Math.pow(2, retryCount - 1), 30000);
    console.log(`リトライ準備中 (${retryCount}/${MAX_RETRIES}): ${error.message || 'Unknown error'}`);
    
    // タイムアウトエラーの特別処理
    if (error instanceof DOMException && error.name === 'AbortError') {
      console.log(`タイムアウトによりリクエストが中止されました。リトライします。`);
    }
    
    // 状態が提供されていればその情報をログ出力
    if (state) {
      console.log(`状態情報: JSONバッファ(${state.jsonBuffer?.length || 0}文字), ツール呼び出し(${state.toolCalls?.length || 0}件)`);
    }
    
    console.log(`${backoffTime}ms後に再試行します...`);
    await new Promise(resolve => setTimeout(resolve, backoffTime));
  }
}

export default Databricks;