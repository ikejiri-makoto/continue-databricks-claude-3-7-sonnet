import { ChatMessage, CompletionOptions, LLMOptions } from "../../index.js";
import { renderChatMessage, stripImages } from "../../util/messageContent.js";
import { BaseLLM } from "../index.js";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";

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
      maxTokens: 100000,
      temperature: 1,
    },
  };

  constructor(options: LLMOptions) {
    super(options);
    // 設定ファイルからapiBaseとapiKeyを読み取る
    if (!this.apiBase) {
      this.apiBase = this.getApiBaseFromConfig();
    }
    if (!this.apiKey) {
      this.apiKey = this.getApiKeyFromConfig();
    }
  }

  /**
   * 設定ファイルからapiBaseを読み取る
   */
  private getApiBaseFromConfig(): string {
    const configPaths = [
      path.join(process.env.USERPROFILE || "", ".continue", "config.yaml"),
      path.join(process.cwd(), "extensions", ".continue-debug", "config.yaml")
    ];

    for (const configPath of configPaths) {
      try {
        if (fs.existsSync(configPath)) {
          const configContent = fs.readFileSync(configPath, "utf8");
          const config = yaml.load(configContent) as any;

          // Databricksモデル設定を探す
          if (config && config.models) {
            for (const model of config.models) {
              if (model.provider === "databricks" && model.apiBase) {
                console.log(`Found Databricks apiBase in ${configPath}`);
                return model.apiBase;
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error reading config from ${configPath}:`, error);
      }
    }

    // デフォルト値
    console.warn("No Databricks apiBase found in config files, using default");
    return "dummy-url";
  }

  /**
   * 設定ファイルからapiKeyを読み取る
   */
  private getApiKeyFromConfig(): string {
    const configPaths = [
      path.join(process.env.USERPROFILE || "", ".continue", "config.yaml"),
      path.join(process.cwd(), "extensions", ".continue-debug", "config.yaml")
    ];

    for (const configPath of configPaths) {
      try {
        if (fs.existsSync(configPath)) {
          const configContent = fs.readFileSync(configPath, "utf8");
          const config = yaml.load(configContent) as any;

          // Databricksモデル設定を探す
          if (config && config.models) {
            for (const model of config.models) {
              if (model.provider === "databricks" && model.apiKey) {
                console.log(`Found Databricks apiKey in ${configPath}`);
                return model.apiKey;
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error reading config from ${configPath}:`, error);
      }
    }

    // デフォルト値
    console.warn("No Databricks apiKey found in config files, using default");
    return "dapi-dummy-key";
  }

  /**
   * OpenAI形式のオプションに変換
   */
  public convertArgs(options: CompletionOptions) {
    const modelName = options.model || "databricks-claude-3-7-sonnet";
    
    // max_tokensのデフォルト値または指定値を取得
    // 最小値を設定して小さすぎる値を防止（少なくとも4096）
    const maxTokens = Math.max(options.maxTokens || 32000, 4096);
    
    // 思考予算を計算 - max_tokensの半分または最大16000を上限とする
    // 常にmax_tokensよりも小さくなるようにする
    const thinkingBudget = Math.min(Math.floor(maxTokens * 0.5), 16000);
    
    // OpenAI互換形式のリクエストパラメータ
    const finalOptions: any = {
      model: modelName,
      max_tokens: maxTokens,
      temperature: options.temperature ?? 1,
      top_p: options.topP,
      stop: options.stop?.filter(x => x.trim() !== ""),
      stream: options.stream ?? true,
    };

    // 思考モードを有効にする（max_tokensとの整合性を確保）
    finalOptions.thinking = {
      type: "enabled",
      budget_tokens: thinkingBudget
    };

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
    // システムメッセージを抽出
    const systemMessage = messages.find(m => m.role === "system");
    let systemContent = "";
    
    if (systemMessage) {
      if (typeof systemMessage.content === "string") {
        systemContent = systemMessage.content;
      } else if (Array.isArray(systemMessage.content)) {
        // contentをanyとして扱う
        const content = systemMessage.content as any[];
        // テキスト部分のみを抽出
        const textParts = content
          .filter(part => part && part.type === "text")
          .map(part => part.text || "");
        systemContent = textParts.join("\n");
      }
      
      // 水平思考とステップバイステップの指示を追加
      if (!systemContent.includes("水平思考") && !systemContent.includes("ステップバイステップ")) {
        systemContent += "\n\n水平思考で考えて！\nステップバイステップで考えて！";
      }
    }
    
    // メッセージをOpenAI形式に変換（システムメッセージを除く）
    const convertedMessages: any[] = messages
      .filter(m => m.role !== "system")
      .map(message => {
        // ツール結果メッセージ
        if (message.role === "tool") {
          return {
            role: "tool",
            content: renderChatMessage(message) || "",
            tool_call_id: message.toolCallId || ""
          };
        }
        
        // ツール呼び出しを含むアシスタントメッセージ
        if (message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0) {
          return {
            role: "assistant",
            content: typeof message.content === "string" ? message.content : "",
            tool_calls: message.toolCalls.map(toolCall => ({
              id: toolCall.id || "",
              type: "function",
              function: {
                name: toolCall.function?.name || "",
                arguments: toolCall.function?.arguments || "{}"
              }
            }))
          };
        }
        
        // 通常のテキストメッセージ
        if (typeof message.content === "string") {
          return {
            role: message.role,
            content: message.content
          };
        }
        
        // 複合コンテンツのメッセージ（画像を含む）
        if (Array.isArray(message.content)) {
          // contentをanyとして扱う
          const content = message.content as any[];
          const formattedContent = content.map(part => {
            if (part && part.type === "text") {
              return {
                type: "text",
                text: part.text || ""
              };
            } else if (part && part.type === "image") {
              // 異なる画像形式を処理
              return {
                type: "image_url",
                image_url: {
                  url: part.imageUrl?.url || "",
                  detail: "high"
                }
              };
            }
            return part;
          });
          
          return {
            role: message.role,
            content: formattedContent
          };
        }
        
        // フォールバック
        return {
          role: message.role,
          content: ""
        };
      });
    
    // システムメッセージがあれば先頭に追加
    // OpenAI形式ではシステムメッセージを使用するが、このコンパイルエラーを避けるため
    // システムメッセージはOpenAI APIには送信するが、型チェックをバイパスする
    if (systemContent) {
      // 明示的にanyとして追加（TypeScriptの型チェックを避ける）
      convertedMessages.unshift({
        role: "system",
        content: systemContent
      } as any);
    }
    
    return convertedMessages;
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
      throw new Error("Request not sent. Databricks API key is not set in your config.");
    }

    if (!this.apiBase) {
      throw new Error("Request not sent. Could not find Databricks API endpoint URL in your config.");
    }

    // リクエストボディに必要なパラメータを構築
    const args = this.convertArgs(options);
    
    // OpenAI形式のリクエストボディを構築
    const requestBody = {
      ...args,
      messages: this.convertMessages(messages),
    };

    // URLの末尾のスラッシュを確認・修正
    let apiBaseUrl = this.apiBase;
    
    // URLが/invocations/で終わる場合、末尾のスラッシュを削除
    if (apiBaseUrl.endsWith('/invocations/')) {
      apiBaseUrl = apiBaseUrl.slice(0, -1);
      console.log(`APIベースURL修正: 末尾のスラッシュを削除しました - ${apiBaseUrl}`);
    }
    
    // デバッグログ
    console.log(`Sending request to Databricks API: ${apiBaseUrl}`);
    console.log('Request body:', JSON.stringify(requestBody, null, 2));

    // DatabricksのエンドポイントにOpenAI形式でリクエスト
    // new URL()コンストラクタを使わず、直接URLを使用
    const response = await this.fetch(apiBaseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
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
        content: data.choices[0].message.content 
      };
      return;
    }

    // ストリーミングレスポンスの処理方法
    // response.body?.getReaderの代わりにtext()メソッドを使用する
    const responseText = await response.text();
    
    // 応答が空の場合は早期リターン
    if (!responseText || responseText.trim() === "") {
      console.warn("Empty response from Databricks API");
      return;
    }

    // レスポンステキストを解析して行ごとに処理
    const lines = responseText.split("\n");
    let currentToolCall: any = null;
    
    for (const line of lines) {
      // 空行またはDONEマーカーをスキップ
      if (!line || line === "data: [DONE]") continue;
      
      // 'data: '接頭辞をチェック
      const jsonStr = line.startsWith("data: ") ? line.slice(5) : line;
      
      try {
        const data = JSON.parse(jsonStr);
        
        // チャンクデータを処理
        const delta = data.choices?.[0]?.delta;
        
        if (!delta) {
          // 完全なメッセージの場合
          if (data.choices?.[0]?.message) {
            yield { 
              role: "assistant", 
              content: data.choices[0].message.content 
            };
          }
          continue;
        }
        
        // 通常のテキストデルタ
        if (delta.content) {
          yield { role: "assistant", content: delta.content };
        }
        
        // ツール呼び出しデルタ
        if (delta.tool_calls && delta.tool_calls.length > 0) {
          for (const toolCall of delta.tool_calls) {
            if (toolCall.index === 0 && toolCall.function?.name) {
              currentToolCall = {
                id: toolCall.id || `call_${Date.now()}`,
                type: "function",
                function: {
                  name: toolCall.function.name,
                  arguments: ""
                }
              };
            }
            
            if (currentToolCall && toolCall.function?.arguments) {
              currentToolCall.function.arguments += toolCall.function.arguments;
              
              yield {
                role: "assistant",
                content: "",
                toolCalls: [
                  {
                    id: currentToolCall.id,
                    type: "function",
                    function: {
                      name: currentToolCall.function.name,
                      arguments: currentToolCall.function.arguments
                    }
                  }
                ]
              };
            }
          }
        }
        
        // 思考（thinking）モードのデルタ処理
        if (data.thinking) {
          yield {
            role: "thinking",
            content: data.thinking.thinking || "",
            signature: data.thinking.signature
          };
        }
        
      } catch (e) {
        console.error("Error parsing response data:", e, "Line:", line);
      }
    }
  }
}

export default Databricks;