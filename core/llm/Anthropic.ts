import { ChatMessage, CompletionOptions, LLMOptions } from "../../index.js";
import { renderChatMessage, stripImages } from "../../util/messageContent.js";
import { BaseLLM } from "../index.js";
import { streamSse } from "../stream.js";
import { getConfigValue } from "../../util/config.js";

class Anthropic extends BaseLLM {
  static providerName = "anthropic";
  static defaultOptions: Partial<LLMOptions> = {
    model: "claude-3-7-sonnet-20250219",
    contextLength: 200_000,
    completionOptions: {
      model: "claude-3-7-sonnet-20250219",
      maxTokens: 64000,        // 固定値: 64000
      temperature: 1,           // 固定値: 1 (思考モード有効時は必須)
      reasoning: true           // 思考モードを有効化
    },
    apiBase: "https://api.anthropic.com/v1", // 末尾のスラッシュを削除
  };

  constructor(options: LLMOptions) {
    super(options);
    // config.yamlからapiKeyとapiBaseを取得
    this.apiKey = getConfigValue("anthropic.apiKey") || process.env.ANTHROPIC_API_KEY;
    this.apiBase = getConfigValue("anthropic.apiBase") || process.env.ANTHROPIC_API_BASE || this.apiBase;
    
    // apiBaseの末尾のスラッシュを削除
    if (this.apiBase && this.apiBase.endsWith("/")) {
      this.apiBase = this.apiBase.slice(0, -1);
    }
  }

  /**
   * エンドポイントがDatabricksかどうかを判定
   */
  private isDatabricksEndpoint(): boolean {
    return this.apiBase && (
      this.apiBase.includes("azuredatabricks.net") || 
      this.apiBase.includes("databricks.com") ||
      this.apiBase.includes("/serving-endpoints/") ||
      this.apiBase.includes("/invocations")
    );
  }
  
  /**
   * エンドポイントに応じた適切なURLを構築
   */
  private buildEndpointUrl(): string {
    // Databricksエンドポイントの場合は末尾に何も追加しない
    if (this.isDatabricksEndpoint()) {
      console.log("Using Databricks endpoint:", this.apiBase);
      return this.apiBase;
    }
    
    // 通常のAnthropicエンドポイントの場合は/messagesを追加
    return `${this.apiBase}/messages`;
  }

  public convertArgs(options: CompletionOptions) {
    // should be public for use within VertexAI
    const modelName = options.model || "claude-3-7-sonnet-20250219";
    
    // Claude 3.7 Sonnetを含むモデル名かどうかを確認
    const isClaude37 = modelName.includes("claude-3-7");
    
    // Databricksエンドポイントかどうかを判定
    const isDatabricks = this.isDatabricksEndpoint();
    
    // Databricksエンドポイントの場合は思考モードを無効化
    const finalOptions = {
      top_k: options.topK,
      top_p: options.topP,
      temperature: 1, // 固定値: 1 (thinking 有効時は必ず 1 にする必要がある)
      max_tokens: 64000, // 固定値: 64000
      model: isDatabricks ? "databricks-claude-3-7-sonnet" : (options.model === "claude-2" ? "claude-2.1" : modelName),
      stop_sequences: options.stop?.filter((x) => x.trim() !== ""),
      stream: options.stream ?? true,
      tools: options.tools?.map((tool) => ({
        name: tool.function.name,
        description: tool.function.description,
        input_schema: tool.function.parameters,
      })),
      // 思考モードをClaude 3.7モデルかつDatabricksエンドポイントでない場合のみ追加
      ...(isClaude37 && !isDatabricks ? {
        thinking: {
          type: "enabled",
          budget_tokens: 60000,
        }
      } : {}),
      tool_choice: options.toolChoice
        ? {
            type: "tool",
            name: options.toolChoice.function.name,
          }
        : undefined,
    };

    return finalOptions;
  }

  private convertMessage(message: ChatMessage, addCaching: boolean): any {
    if (message.role === "tool") {
      return {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: message.toolCallId,
            content: renderChatMessage(message) || undefined,
          },
        ],
      };
    } else if (message.role === "assistant" && message.toolCalls) {
      return {
        role: "assistant",
        content: message.toolCalls.map((toolCall) => ({
          type: "tool_use",
          id: toolCall.id,
          name: toolCall.function?.name,
          input: JSON.parse(toolCall.function?.arguments || "{}"),
        })),
      };
    } else if (message.role === "thinking" && !message.redactedThinking) {
      return {
        role: "assistant",
        content: [
          {
            type: "thinking",
            thinking: message.content,
            signature: message.signature,
          },
        ],
      };
    } else if (message.role === "thinking" && message.redactedThinking) {
      return {
        role: "assistant",
        content: [
          {
            type: "redacted_thinking",
            data: message.redactedThinking,
          },
        ],
      };
    }

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

    return {
      role: message.role,
      content: message.content.map((part, contentIdx) => {
        if (part.type === "text") {
          const newpart = {
            ...part,
            // If multiple text parts, only add cache_control to the last one
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

  public convertMessages(msgs: ChatMessage[]): any[] {
    // should be public for use within VertexAI
    const filteredmessages = msgs.filter(
      (m) => m.role !== "system" && !!m.content,
    );
    const lastTwoUserMsgIndices = filteredmessages
      .map((msg, index) => (msg.role === "user" ? index : -1))
      .filter((index) => index !== -1)
      .slice(-2);

    const messages = filteredmessages.map((message, filteredMsgIdx) => {
      // Add cache_control parameter to the last two user messages
      // The second-to-last because it retrieves potentially already cached contents,
      // The last one because we want it cached for later retrieval.
      // See: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
      const addCaching =
        this.cacheBehavior?.cacheConversation &&
        lastTwoUserMsgIndices.includes(filteredMsgIdx);

      const chatMessage = this.convertMessage(message, !!addCaching);
      return chatMessage;
    });
    return messages;
  }

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

  protected async *_streamChat(
    messages: ChatMessage[],
    signal: AbortSignal,
    options: CompletionOptions,
  ): AsyncGenerator<ChatMessage> {
    if (!this.apiKey || this.apiKey === "") {
      throw new Error(
        "Request not sent. You have an Anthropic model configured in your config.json, but the API key is not set.",
      );
    }

    // ステップバイステップの思考を促す指示をシステムメッセージに追加する
    let systemMessage = stripImages(
      messages.filter((m) => m.role === "system")[0]?.content ?? "",
    );
    
    // システムメッセージがない場合は新しく作成し、ある場合は既存のものに追加
    const stepByStepInstruction = "\n\n水平思考で考えて！\nステップバイステップで考えて！";
    if (systemMessage) {
      systemMessage += stepByStepInstruction;
    } else {
      systemMessage = stepByStepInstruction.trim();
    }
    
    const shouldCacheSystemMessage = !!(
      this.cacheBehavior?.cacheSystemMessage && systemMessage
    );

    const msgs = this.convertMessages(messages);
    
    // エンドポイントの種類に応じてURLを構築
    const url = this.buildEndpointUrl();
    console.log("Using API endpoint:", url);
    
    const response = await this.fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": this.apiKey as string,
        ...(shouldCacheSystemMessage || this.cacheBehavior?.cacheConversation
          ? { "anthropic-beta": "prompt-caching-2024-07-31" }
          : {}),
      },
      body: JSON.stringify({
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
      }),
      signal,
    });

    if (!response.ok) {
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
        `Anthropic API sent back ${response.status}: ${JSON.stringify(json)}`,
      );
    }

    if (options.stream === false) {
      const data = await response.json();
      yield { role: "assistant", content: data.content[0].text };
      return;
    }

    let lastToolUseId: string | undefined;
    let lastToolUseName: string | undefined;
    for await (const value of streamSse(response)) {
      // https://docs.anthropic.com/en/api/messages-streaming#event-types
      switch (value.type) {
        case "content_block_start":
          if (value.content_block.type === "tool_use") {
            lastToolUseId = value.content_block.id;
            lastToolUseName = value.content_block.name;
          }
          // handle redacted thinking
          if (value.content_block.type === "redacted_thinking") {
            console.log("redacted thinking", value.content_block.data);
            yield {
              role: "thinking",
              content: "",
              redactedThinking: value.content_block.data,
            };
          }
          break;
        case "content_block_delta":
          // https://docs.anthropic.com/en/api/messages-streaming#delta-types
          switch (value.delta.type) {
            case "text_delta":
              yield { role: "assistant", content: value.delta.text };
              break;
            case "thinking_delta":
              yield { role: "thinking", content: value.delta.thinking };
              break;
            case "signature_delta":
              yield {
                role: "thinking",
                content: "",
                signature: value.delta.signature,
              };
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
              };
              break;
          }
          break;
        case "content_block_stop":
          lastToolUseId = undefined;
          lastToolUseName = undefined;
          break;
        default:
          break;
      }
    }
  }
}

export default Anthropic;
