import { ChatMessage, CompletionOptions, LLMOptions } from "../../index.js";
import { renderChatMessage } from "../../util/messageContent.js";
import { BaseLLM } from "../index.js";

// 共通ユーティリティのインポート
import { getErrorMessage, isConnectionError } from "../utils/errors.js";
import { safeStringify } from "../utils/json.js";
import { processSSEStream } from "../utils/sseProcessing.js";

// Databricks固有のモジュールインポート
import { DatabricksConfig } from "./Databricks/config.js";
import { MessageProcessor } from "./Databricks/messages.js";
import { ToolCallProcessor } from "./Databricks/toolcalls.js";
import { StreamingProcessor } from "./Databricks/streaming.js";
import { ToolCall } from "./Databricks/types.js";

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
      maxTokens: 128000,  // 修正: la128000 → 128000
      temperature: 1,
    },
    capabilities: {
      tools: true
    }
  };

  constructor(options: LLMOptions) {
    super(options);
    // 設定ファイルからapiBaseとapiKeyを読み取る
    if (!this.apiBase) {
      this.apiBase = DatabricksConfig.getApiBaseFromConfig();
    }
    if (!this.apiKey) {
      this.apiKey = DatabricksConfig.getApiKeyFromConfig();
    }
  }

  /**
   * OpenAI形式のオプションに変換
   */
  public convertArgs(options: CompletionOptions) {
    const modelName = options.model || "databricks-claude-3-7-sonnet";
    
    // max_tokensのデフォルト値または指定値を取得
    // 最小値を設定して小さすぎる値を防止（少なくとも4096）
    const maxTokens = Math.max(options.maxTokens || 32000, 4096);
    
    // 思考予算を計算 - max_tokensの半分または最大64000を上限とする
    // 常にmax_tokensよりも小さくなるようにする
    const thinkingBudget = Math.min(Math.floor(maxTokens * 0.5), 64000);
    
    // OpenAI互換形式のリクエストパラメータ
    const finalOptions: any = {
      model: modelName,
      max_tokens: maxTokens,
      temperature: options.temperature ?? 1,
      top_p: options.topP,
      stop: options.stop?.filter(x => x.trim() !== ""),
      stream: options.stream ?? true,
    };

    // 重要: Databricksエンドポイントでは思考モードオプションをリクエストに設定しません
    // エラーメッセージで「messages.1.content.0.type: Expected `thinking`...」というエラーが発生するため
    // 思考モードはメッセージの形式で実現する必要があり、APIオプションとしては送信しない
    // finalOptions.thinking = {
    //   type: "enabled",
    //   budget_tokens: thinkingBudget
    // };

    // デバッグログ
    console.log(`Token settings - max_tokens: ${maxTokens}, thinking budget: ${thinkingBudget}`);

    // ツール関連のパラメータがある場合のみ追加
    if (options.tools) {
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
        tool.function.name.includes("search") || 
        tool.function.name.includes("検索")
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
    if (!this.apiKey || this.apiKey === "") {
      throw new Error("Request not sent. Databricks API key is not set in your config.");
    }

    if (!this.apiBase) {
      throw new Error("Request not sent. Could not find Databricks API endpoint URL in your config.");
    }

    // リトライ設定
    const MAX_RETRIES = 3;
    let retryCount = 0;
    let lastError: Error | null = null;

    while (retryCount <= MAX_RETRIES) {
      try {
        // リクエストボディに必要なパラメータを構築
        const args = this.convertArgs(options);
        
        // OpenAI形式のリクエストボディを構築
        const requestBody = {
          ...args,
          messages: this.convertMessages(messages),
        };

        // URLの末尾のスラッシュを確認・修正
        let apiBaseUrl = DatabricksConfig.normalizeApiUrl(this.apiBase);
        
        // デバッグログ
        console.log(`Sending request to Databricks API: ${apiBaseUrl}`);
        console.log('Request body:', JSON.stringify(requestBody, null, 2));

        // リクエストタイムアウトを設定
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000); // 120秒のタイムアウト
        
        // シグナルを結合（ユーザー提供のものと内部タイムアウト）
        const combinedSignal = AbortSignal.any([signal, controller.signal]);

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

        // タイムアウトタイマーをクリア
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          try {
            const errorJson = JSON.parse(errorText);
            console.log(`Request ID: ${response.headers.get("request-id")}, Status: ${response.status}`);
            throw new Error(`Databricks API error: ${response.status} - ${errorJson.error?.message || errorJson.message || errorText}`);
          } catch (e) {
            throw new Error(`Databricks API error: ${response.status} - ${errorText}`);
          }
        }

        // ストリーミングなしの場合は単一のレスポンスを返す
        if (options.stream === false) {
          const data = await response.json();
          yield { 
            role: "assistant", 
            content: safeStringify(data.choices[0].message.content, "")
          };
          return;
        }

        // ストリーミングレスポンスの処理
        let currentMessage: ChatMessage = { role: "assistant", content: "" };
        let toolCalls: ToolCall[] = [];
        let currentToolCall: ToolCall | null = null;
        let currentToolCallIndex: number | null = null;
        let thinkingChunkCount = 0;

        // JSONフラグメントのバッファリングのための変数
        let jsonBuffer: string = "";
        let isBufferingJson: boolean = false;

        console.log("------------- 応答処理開始 -------------");

        try {
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
              messages
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
              
              // デバッグログ
              if (thinkingChunkCount % 10 === 0) {
                console.log(`\n===== 思考チャンク #${thinkingChunkCount} =====`);
                console.log(processResult.thinkingMessage.content.toString().substring(0, 100) + "...");
              }
              
              yield processResult.thinkingMessage;
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
                
                yield msgWithTools;
              } else {
                // 通常のメッセージをyield
                yield { ...currentMessage };
              }
            }
          }

          // 正常に処理が完了したらループを終了
          console.log("ストリーミング処理が正常に完了しました。");
          break;

        } catch (streamError: unknown) {
          // エラーの詳細をログに記録
          const errorMessage = getErrorMessage(streamError);
          console.error(`Error processing streaming response: ${errorMessage}`);
          
          // 「Premature close」エラーなどの特定の接続エラーでリトライ
          if (isConnectionError(streamError)) {
            retryCount++;
            
            if (retryCount <= MAX_RETRIES) {
              // バックオフ時間（指数バックオフ）
              const backoffTime = Math.min(1000 * Math.pow(2, retryCount), 10000);
              console.log(`ストリーミングエラー発生、${backoffTime}ms後に再試行します (${retryCount}/${MAX_RETRIES})`);
              await new Promise(resolve => setTimeout(resolve, backoffTime));
              lastError = streamError instanceof Error ? streamError : new Error(errorMessage);
              continue; // ループの先頭に戻ってリトライ
            }
          }
          
          // その他のエラーはそのまま投げる
          throw streamError;
        }

        // 未処理のJSONバッファがあれば最終処理
        StreamingProcessor.finalizeJsonBuffer(jsonBuffer, isBufferingJson, currentToolCall, messages);

        // 検索ツールで引数がない場合、デフォルトのクエリを設定
        toolCalls = StreamingProcessor.ensureSearchToolArguments(toolCalls, messages);

        // 処理統計を出力
        if (thinkingChunkCount > 0) {
          console.log(`\n===== 思考モード処理完了 =====`);
          console.log(`合計思考チャンク数: ${thinkingChunkCount}`);
        }

        console.log(`\n===== 応答処理完了 =====`);

        // 最終的なメッセージを返す
        const finalToolCalls = toolCalls.filter(Boolean);
        if (currentMessage.content || finalToolCalls.length > 0) {
          // 標準的なChatMessageを使いながら、toolCallsプロパティを追加
          const chatMsg: ChatMessage = {
            role: "assistant",
            content: currentMessage.content
          };
          
          // ツール呼び出しがある場合は追加プロパティとして設定
          if (finalToolCalls.length > 0) {
            (chatMsg as any).toolCalls = finalToolCalls;
          }
          
          yield chatMsg;
        }
        
        // 正常に完了したらループを抜ける
        break;
        
      } catch (error: unknown) {
        retryCount++;
        const errorMessage = getErrorMessage(error);
        lastError = error instanceof Error ? error : new Error(errorMessage);
        
        if (retryCount <= MAX_RETRIES) {
          // バックオフ時間（指数バックオフ）
          const backoffTime = Math.min(1000 * Math.pow(2, retryCount), 10000);
          console.error(`エラーが発生、${backoffTime}ms後に再試行します (${retryCount}/${MAX_RETRIES}): ${errorMessage}`);
          await new Promise(resolve => setTimeout(resolve, backoffTime));
        } else {
          // 最大リトライ回数を超えた場合はエラーを投げる
          console.error(`最大リトライ回数 (${MAX_RETRIES}) を超えました。最後のエラー: ${errorMessage}`);
          throw lastError;
        }
      }
    }
  }
}

export default Databricks;
