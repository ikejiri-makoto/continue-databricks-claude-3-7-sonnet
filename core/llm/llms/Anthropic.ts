import { ChatMessage, CompletionOptions, LLMOptions, ModelCapability } from "../../index.js";
import { renderChatMessage, stripImages } from "../../util/messageContent.js";
import { extractContentAsString } from "../utils/messageUtils.js";
import { safeJsonParse, safeStringify, processJsonDelta } from "../utils/json.js";
import { getErrorMessage, isConnectionError } from "../utils/errors.js";
import { BaseLLM } from "../index.js";
import { streamSse } from "../stream.js";
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

/**
 * ChatMessage拡張インターフェース - ThinkingChatMessageと互換性を持つように修正
 * 追加のプロパティを持つチャットメッセージを表現
 */
interface ExtendedChatMessage {
  role: string;
  content: string;
  toolCalls?: Array<{
    id: string;
    type: string;
    function?: {
      name: string;
      arguments: string;
    };
  }>;
  toolCallId?: string;
  redactedThinking?: any;
  signature?: string;
}

/**
 * Anthropic Claude LLMプロバイダーの実装
 * Claude 3.7 Sonnetモデルに対応した思考モードと、Databricksエンドポイントへの接続をサポート
 */
class Anthropic extends BaseLLM {
  static providerName = "anthropic";
  static defaultOptions: Partial<LLMOptions> = {
    model: "claude-3-7-sonnet-20250219",
    contextLength: 200_000,
    completionOptions: {
      model: "claude-3-7-sonnet-20250219",
      maxTokens: 64000,         // 固定値: 64000
      temperature: 1,           // 固定値: 1 (思考モード有効時は必須)
      reasoning: true           // 思考モードを有効化
    },
    apiBase: "",
    capabilities: {
      tools: true,              // ツール機能をサポート
      chat: true,               // チャット機能をサポート
      vision: true,             // ビジョン機能をサポート
      thinking: true            // 思考モードをサポート
    } as ModelCapability
  };

  /**
   * APIエンドポイントURLを正規化する
   * 末尾のスラッシュを削除してURLを一貫した形式に保つ
   * 
   * @param url 正規化するURL
   * @returns 正規化されたURL
   */
  private normalizeApiUrl(url: string): string {
    if (!url) return "";
    return url.endsWith("/") ? url.slice(0, -1) : url;
  }

  /**
   * コンストラクタ
   * 設定を初期化し、config.yamlからapiBaseとapiKeyを読み込む
   * 
   * @param options LLMオプション
   */
  constructor(options: LLMOptions) {
    super(options);
    
    // config.yamlからapiBaseとapiKeyを読み込む
    try {
      // config.yamlへのパスを設定
      const configPath = path.resolve(process.cwd(), 'config.yaml');
      
      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf8');
        const config = yaml.load(configContent) as Record<string, any>;
        
        // Anthropic設定を取得
        const anthropicConfig = config?.llms?.anthropic || {};
        
        // apiBaseの設定
        if (anthropicConfig.apiBase) {
          this.apiBase = this.normalizeApiUrl(anthropicConfig.apiBase);
          console.log("Loaded apiBase from config.yaml:", this.apiBase);
        }
        
        // apiKeyの設定
        if (anthropicConfig.apiKey) {
          this.apiKey = anthropicConfig.apiKey;
          console.log("Loaded apiKey from config.yaml");
        }
      }
    } catch (error) {
      console.error('Error loading config.yaml:', getErrorMessage(error));
    }
    
    // config.yamlに設定がない場合は環境変数を使用
    if (!this.apiBase || this.apiBase === "") {
      this.apiBase = this.normalizeApiUrl(process.env.ANTHROPIC_API_BASE || "https://api.anthropic.com/v1");
    }
    
    if (!this.apiKey || this.apiKey === "") {
      this.apiKey = process.env.ANTHROPIC_API_KEY || "";
    }
    
    console.log("Initialized Anthropic with API endpoint:", this.apiBase);
  }

  /**
   * CompletionOptionsをAnthropicAPIに適した形式に変換する
   * 
   * @param options CompletionOptions
   * @returns Anthropic APIに適した引数オブジェクト
   */
  public convertArgs(options: CompletionOptions) {
    // should be public for use within VertexAI
    const modelName = options.model || "claude-3-7-sonnet-20250219";
    
    // Databricksモデルかどうかを確認
    const isDatabricksModel = this.isDatabricksEndpoint();
    
    // 基本オプションを設定
    const finalOptions = {
      top_k: options.topK,
      top_p: options.topP,
      temperature: 1, // 固定値: 1 (thinking 有効時は必ず 1 にする必要がある)
      max_tokens: 64000, // 固定値: 64000
      model: this.getModelNameForEndpoint(modelName, isDatabricksModel),
      stop_sequences: options.stop?.filter((x) => x.trim() !== ""),
      stream: options.stream ?? true,
      tools: this.convertTools(options.tools),
      // 思考モードを常に有効化（条件なし）
      thinking: {
        type: "enabled",
        budget_tokens: 60000,
      },
      tool_choice: this.convertToolChoice(options.toolChoice),
    };

    return finalOptions;
  }

  /**
   * APIエンドポイントがDatabricksかどうかを判定
   * 
   * @returns Databricksエンドポイントの場合はtrue
   */
  private isDatabricksEndpoint(): boolean {
    return this.apiBase?.includes("azuredatabricks.net") || 
           this.apiBase?.includes("databricks.com") || 
           this.apiBase?.includes("/serving-endpoints/") || 
           false;
  }

  /**
   * モデル名をエンドポイントに適した形式に変換
   * 
   * @param modelName モデル名
   * @param isDatabricksModel Databricksモデルかどうか
   * @returns 適切に変換されたモデル名
   */
  private getModelNameForEndpoint(modelName: string, isDatabricksModel: boolean): string {
    if (isDatabricksModel) {
      return "databricks-claude-3-7-sonnet";
    } else if (modelName === "claude-2") {
      return "claude-2.1";
    } else {
      return modelName;
    }
  }

  /**
   * ツール定義を変換
   * 
   * @param tools ツール定義配列
   * @returns Anthropic APIフォーマットのツール定義
   */
  private convertTools(tools?: Array<{type: string; function: any}>): Array<any> | undefined {
    if (!tools || tools.length === 0) {
      return undefined;
    }

    return tools.map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters,
    }));
  }

  /**
   * ツール選択オプションを変換
   * 
   * @param toolChoice ツール選択
   * @returns Anthropic API形式のツール選択
   */
  private convertToolChoice(toolChoice?: {type: string; function: any}): any | undefined {
    if (!toolChoice) {
      return undefined;
    }

    return {
      type: "tool",
      name: toolChoice.function.name,
    };
  }

  /**
   * メッセージを変換
   * 
   * @param message チャットメッセージ
   * @param addCaching キャッシュの追加フラグ
   * @returns 変換されたメッセージ
   */
  private convertMessage(message: ChatMessage, addCaching: boolean): any {
    // ExtendedChatMessageとして扱う
    const extMessage = message as unknown as ExtendedChatMessage;
    
    // ツールメッセージの場合
    if (message.role === "tool") {
      return {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: extMessage.toolCallId,
            content: renderChatMessage(message) || undefined,
          },
        ],
      };
    } 
    // ツール呼び出しを含むアシスタントメッセージの場合
    else if (message.role === "assistant" && extMessage.toolCalls) {
      return {
        role: "assistant",
        content: extMessage.toolCalls.map((toolCall: any) => ({
          type: "tool_use",
          id: toolCall.id,
          name: toolCall.function?.name,
          input: JSON.parse(toolCall.function?.arguments || "{}"),
        })),
      };
    } 
    // 思考メッセージの場合（リダクトされていない）
    else if (message.role === "thinking" && !extMessage.redactedThinking) {
      return {
        role: "assistant",
        content: [
          {
            type: "thinking",
            thinking: message.content,
            signature: extMessage.signature,
          },
        ],
      };
    } 
    // リダクトされた思考メッセージの場合
    else if (message.role === "thinking" && extMessage.redactedThinking) {
      return {
        role: "assistant",
        content: [
          {
            type: "redacted_thinking",
            data: extMessage.redactedThinking,
          },
        ],
      };
    }

    // 文字列コンテンツの場合
    if (typeof message.content === "string") {
      var chatMessage = {
        role: message.role,
        content: [
          {
            type: "text",
            text: message.content,
            ...(addCaching ? { cache_control: { type: "ephemeral" } } : {}),
          },
        ],
      };
      return chatMessage;
    }

    // メッセージパーツの配列の場合（画像など）
    // Arrayかどうかをチェックしてからmapを使用
    if (Array.isArray(message.content)) {
      return {
        role: message.role,
        content: message.content.map((part: any, contentIdx: number) => {
          if (part.type === "text") {
            const newpart = {
              ...part,
              // 複数のテキストパーツがある場合、最後のパーツのみにキャッシュ制御を追加
              ...(addCaching && contentIdx === message.content.length - 1
                ? { cache_control: { type: "ephemeral" } }
                : {}),
            };
            return newpart;
          }
          return {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg",
              data: part.imageUrl?.url.split(",")[1],
            },
          };
        }),
      };
    }
    
    // 上記のケースに当てはまらない場合はそのまま返す
    return {
      role: message.role,
      content: message.content,
    };
  }

  /**
   * メッセージ配列を変換
   * 
   * @param msgs 変換するメッセージ配列
   * @returns Anthropic API形式のメッセージ配列
   */
  public convertMessages(msgs: ChatMessage[]): any[] {
    // should be public for use within VertexAI
    
    // システムメッセージ以外で、コンテンツがあるメッセージのみをフィルタリング
    const filteredmessages = msgs.filter(
      (m) => m.role !== "system" && !!m.content,
    );
    
    // 最後の2つのユーザーメッセージのインデックスを特定（キャッシュ利用のため）
    const lastTwoUserMsgIndices = filteredmessages
      .map((msg, index) => (msg.role === "user" ? index : -1))
      .filter((index) => index !== -1)
      .slice(-2);

    // すべてのメッセージを適切に変換
    const messages = filteredmessages.map((message, filteredMsgIdx) => {
      // 最後の2つのユーザーメッセージにキャッシュ制御パラメータを追加
      // 前から2番目は既にキャッシュされているコンテンツを取得するため、
      // 最後のメッセージは後で取得できるようにキャッシュするため
      // 参照: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
      const addCaching =
        this.cacheBehavior?.cacheConversation &&
        lastTwoUserMsgIndices.includes(filteredMsgIdx);

      const chatMessage = this.convertMessage(message, !!addCaching);
      return chatMessage;
    });
    
    return messages;
  }

  /**
   * テキスト完了ストリームを処理する
   * 
   * @param prompt プロンプト文字列
   * @param signal AbortSignal
   * @param options 完了オプション
   * @returns AsyncGeneratorインスタンス
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
   * チャットストリームを処理する
   * 
   * @param messages メッセージ配列
   * @param signal AbortSignal
   * @param options 完了オプション
   * @returns AsyncGeneratorインスタンス
   */
  protected async *_streamChat(
    messages: ChatMessage[],
    signal: AbortSignal,
    options: CompletionOptions,
  ): AsyncGenerator<ChatMessage> {
    // APIキーのチェック
    if (!this.apiKey || this.apiKey === "") {
      throw new Error(
        "Request not sent. You have an Anthropic model configured, but the API key is not set in config.yaml or environment variables.",
      );
    }

    // ステップバイステップの思考を促す指示をシステムメッセージに追加する
    let systemMessage = stripImages(
      messages.filter((m) => m.role === "system")[0]?.content ?? "",
    );
    
    // システムメッセージの内容に「水平思考」と「ステップバイステップ」の指示を追加
    systemMessage = this.addThinkingInstructions(systemMessage);
    
    // システムメッセージのキャッシュフラグ
    const shouldCacheSystemMessage = !!(
      this.cacheBehavior?.cacheSystemMessage && systemMessage
    );

    // メッセージを変換
    const msgs = this.convertMessages(messages);
    
    try {
      // APIエンドポイントの正規化（末尾のスラッシュを削除）
      const apiBaseUrl = this.normalizeApiUrl(this.apiBase || "");
      
      // エンドポイントURLをそのまま使用（/messagesを追加しない）
      const url = apiBaseUrl;
      console.log("Sending request to API endpoint:", url);
      
      // Databricksエンドポイントかどうかを確認
      const isDatabricksEndpoint = this.isDatabricksEndpoint();
      
      // ヘッダーを取得（Databricksエンドポイントかどうかに応じて適切なヘッダーを設定）
      const headers = this.getRequestHeaders(shouldCacheSystemMessage, isDatabricksEndpoint);
      
      const response = await this.fetch(url, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(this.getRequestBody(options, msgs, systemMessage, shouldCacheSystemMessage)),
        signal,
      });

      // レスポンスエラーのチェック
      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      // ストリーミングなしの場合
      if (options.stream === false) {
        const data = await response.json();
        yield { role: "assistant", content: data.content[0].text };
        return;
      }

      // ストリーミングレスポンスの処理
      yield* this.processStreamResponse(response);
      
    } catch (error: unknown) {
      // エラーハンドリング
      this.handleStreamError(error);
    }
  }

  /**
   * システムメッセージに思考指示を追加
   * 
   * @param systemMessage 元のシステムメッセージ
   * @returns 更新されたシステムメッセージ
   */
  private addThinkingInstructions(systemMessage: string): string {
    const stepByStepInstruction = "\n\n水平思考で考えて！\nステップバイステップで考えて！";
    
    if (systemMessage) {
      return systemMessage + stepByStepInstruction;
    } else {
      return stepByStepInstruction.trim();
    }
  }

  /**
   * リクエストヘッダーを取得
   * 
   * @param shouldCacheSystemMessage システムメッセージをキャッシュするかどうか
   * @param isDatabricksEndpoint Databricksエンドポイントかどうか
   * @returns リクエストヘッダーオブジェクト
   */
  private getRequestHeaders(shouldCacheSystemMessage: boolean, isDatabricksEndpoint: boolean): Record<string, string> {
    // 基本ヘッダー
    const baseHeaders = {
      "Content-Type": "application/json",
      "Accept": "application/json",
    };
    
    // Databricksエンドポイントの場合は、ベアラートークン認証を使用
    if (isDatabricksEndpoint) {
      return {
        ...baseHeaders,
        "Authorization": `Bearer ${this.apiKey}`,
      };
    }
    
    // 通常のAnthropicエンドポイントの場合
    return {
      ...baseHeaders,
      "anthropic-version": "2023-06-01",
      "x-api-key": this.apiKey as string,
      ...(shouldCacheSystemMessage || this.cacheBehavior?.cacheConversation
        ? { "anthropic-beta": "prompt-caching-2024-07-31" }
        : {}),
    };
  }

  /**
   * リクエストボディを取得
   * 
   * @param options 完了オプション
   * @param msgs 変換されたメッセージ
   * @param systemMessage システムメッセージ
   * @param shouldCacheSystemMessage システムメッセージをキャッシュするかどうか
   * @returns リクエストボディオブジェクト
   */
  private getRequestBody(
    options: CompletionOptions, 
    msgs: any[], 
    systemMessage: string,
    shouldCacheSystemMessage: boolean
  ): any {
    return {
      ...this.convertArgs(options),
      messages: msgs,
      system: shouldCacheSystemMessage
        ? [
            {
              type: "text",
              text: systemMessage,
              cache_control: { type: "ephemeral" },
            },
          ]
        : systemMessage,
    };
  }

  /**
   * エラーレスポンスを処理
   * 
   * @param response APIレスポンス
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    const json = await response.json();
    
    if (json.type === "error") {
      if (json.error?.type === "overloaded_error") {
        throw new Error(
          "The Anthropic API is currently overloaded. Please check their status page: https://status.anthropic.com/#past-incidents",
        );
      }
      throw new Error(json.message);
    }
    
    throw new Error(
      `Anthropic API sent back ${response.status}: ${safeStringify(json)}`,
    );
  }

  /**
   * ストリームエラーを処理
   * 
   * @param error エラーオブジェクト
   */
  private handleStreamError(error: unknown): never {
    const errorMessage = getErrorMessage(error);
    
    if (isConnectionError(error)) {
      throw new Error(`Connection error with Anthropic API: ${errorMessage}`);
    } else {
      throw new Error(`Error with Anthropic API: ${errorMessage}`);
    }
  }

  /**
   * ストリームレスポンスを処理
   * 
   * @param response APIレスポンス
   * @returns AsyncGeneratorインスタンス
   */
  private async *processStreamResponse(response: Response): AsyncGenerator<ChatMessage> {
    let lastToolUseId: string | undefined;
    let lastToolUseName: string | undefined;
    
    for await (const value of streamSse(response)) {
      // イベントタイプに基づいて処理
      // https://docs.anthropic.com/en/api/messages-streaming#event-types
      switch (value.type) {
        case "content_block_start":
          // リダクトされた思考の処理
          if (value.content_block.type === "redacted_thinking") {
            console.log("redacted thinking", value.content_block.data);
            yield {
              role: "thinking",
              content: "",
              redactedThinking: value.content_block.data,
            } as ChatMessage;
          }
          
          // ツール使用IDとツール名を更新
          if (value.content_block.type === "tool_use") {
            lastToolUseId = value.content_block.id;
            lastToolUseName = value.content_block.name;
          }
          break;
          
        case "content_block_delta":
          // https://docs.anthropic.com/en/api/messages-streaming#delta-types
          switch (value.delta.type) {
            case "text_delta":
              yield { role: "assistant", content: value.delta.text } as ChatMessage;
              break;
              
            case "thinking_delta":
              yield { 
                role: "thinking", 
                content: value.delta.thinking 
              } as ChatMessage;
              break;
              
            case "signature_delta":
              yield {
                role: "thinking",
                content: "",
                signature: value.delta.signature,
              } as ChatMessage;
              break;
              
            case "input_json_delta":
              if (!lastToolUseId || !lastToolUseName) {
                throw new Error("No tool use found");
              }
              
              yield {
                role: "assistant",
                content: "",
                toolCalls: [
                  {
                    id: lastToolUseId,
                    type: "function",
                    function: {
                      name: lastToolUseName,
                      arguments: value.delta.partial_json,
                    },
                  },
                ],
              } as ChatMessage;
              break;
          }
          break;
          
        case "content_block_stop":
          // ツール使用のブロックが終了したらIDとツール名をリセット
          lastToolUseId = undefined;
          lastToolUseName = undefined;
          break;
          
        default:
          // 未知のイベントタイプは無視
          break;
      }
    }
  }
}

export default Anthropic;