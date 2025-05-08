/**
 * OpenAIのAPIと連携するためのモジュール
 * このファイルはContinue拡張機能においてOpenAIのLLM（大規模言語モデル）との
 * 通信を処理するためのコードを含みます
 */

// OpenAIのAPIタイプ定義をインポート
import {
  ChatCompletionCreateParams,
  ChatCompletionMessageParam,
} from "openai/resources/index";

// アプリケーション内部の型定義やユーティリティをインポート
import {
  ChatMessage,
  CompletionOptions,
  LLMOptions,
  Tool,
} from "../../index.js";
import { renderChatMessage } from "../../util/messageContent.js";
import { BaseLLM } from "../index.js";
import {
  fromChatCompletionChunk,
  LlmApiRequestType,
  toChatBody,
} from "../openaiTypeConverters.js";
import { streamSse } from "../stream.js";

/**
 * チャットAPI非対応の古いモデルリスト
 * これらのモデルは従来のCompletions APIを使用する必要がある
 */
const NON_CHAT_MODELS = [
  "text-davinci-002",
  "text-davinci-003",
  "code-davinci-002",
  "text-ada-001",
  "text-babbage-001",
  "text-curie-001",
  "davinci",
  "curie",
  "babbage",
  "ada",
];

/**
 * 与えられたモデル名がチャット専用モデルかどうかを判定する関数
 * GPTモデルとOシリーズモデルはチャット専用と判定
 * @param model モデル名
 * @returns チャット専用モデルの場合はtrue
 */
function isChatOnlyModel(model: string): boolean {
  // gptとo-seriesモデル
  return model.startsWith("gpt") || model.startsWith("o");
}

/**
 * O1モデル用にメッセージを変換する関数
 * O1モデルはシステムメッセージをサポートしないため、システムメッセージをユーザーメッセージに変換する
 * @param messages 変換前のメッセージ配列
 * @returns 変換後のメッセージ配列
 */
const formatMessageForO1 = (messages: ChatCompletionMessageParam[]) => {
  return messages?.map((message: any) => {
    if (message?.role === "system") {
      return {
        ...message,
        role: "user",
      };
    }

    return message;
  });
};

/**
 * OpenAI APIとの通信を処理するクラス
 * BaseLLMを継承し、OpenAI固有の機能を実装している
 */
class OpenAI extends BaseLLM {
  public useLegacyCompletionsEndpoint: boolean | undefined = undefined;

  /**
   * コンストラクタ - OpenAIクラスの初期化
   * @param options LLMの設定オプション
   */
  constructor(options: LLMOptions) {
    super(options);
    this.useLegacyCompletionsEndpoint = options.useLegacyCompletionsEndpoint;
    this.apiVersion = options.apiVersion ?? "2023-07-01-preview";
  }

  /**
   * プロバイダー名（固定値）
   */
  static providerName = "openai";
  
  /**
   * デフォルトのオプション設定
   */
  static defaultOptions: Partial<LLMOptions> | undefined = {
    apiBase: "https://api.openai.com/v1/",
    maxEmbeddingBatchSize: 128,
  };

  /**
   * OpenAIアダプターを使用するAPI要求タイプのリスト
   */
  protected useOpenAIAdapterFor: (LlmApiRequestType | "*")[] = [
    "chat",
    "embed",
    "list",
    "rerank",
    "streamChat",
    "streamFim",
  ];

  /**
   * モデル名を変換するメソッド
   * 継承先でカスタマイズ可能
   * @param model 元のモデル名
   * @returns 変換後のモデル名
   */
  protected _convertModelName(model: string): string {
    return model;
  }

  /**
   * 指定されたモデルがO3またはO1モデルかどうかを判定するメソッド
   * @param model モデル名
   * @returns O3またはO1モデルの場合はtrue
   */
  private isO3orO1Model(model?: string): boolean {
    return !!model && (model.startsWith("o1") || model.startsWith("o3"));
  }

  /**
   * 指定されたモデルがFireworks AIモデルかどうかを判定するメソッド
   * @param model モデル名
   * @returns Fireworks AIモデルの場合はtrue
   */
  private isFireworksAiModel(model?: string): boolean {
    return !!model && model.startsWith("accounts/fireworks/models");
  }

  /**
   * 指定されたモデルが予測機能をサポートしているかどうかを判定するメソッド
   * @param model モデル名
   * @returns 予測機能をサポートしている場合はtrue
   */
  protected supportsPrediction(model: string): boolean {
    const SUPPORTED_MODELS = [
      "gpt-4o-mini",
      "gpt-4o",
      "mistral-large",
      "Fast-Apply",
    ];
    return SUPPORTED_MODELS.some((m) => model.includes(m));
  }

  /**
   * Toolオブジェクトを変換するメソッド
   * ContinueのTool型からOpenAI APIが期待する形式に変換する
   * @param tool 変換するToolオブジェクト
   * @returns 変換後のツールオブジェクト
   */
  private convertTool(tool: Tool): any {
    return {
      type: tool.type,
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
        strict: tool.function.strict,
      },
    };
  }

  /**
   * リクエストボディに追加するプロパティを返すメソッド
   * カスタムプロバイダーで拡張可能
   * @returns 追加プロパティのオブジェクト
   */
  protected extraBodyProperties(): Record<string, any> {
    return {};
  }

  /**
   * 最大停止ワード数を取得するメソッド
   * APIプロバイダーによって制限が異なる
   * @returns 許容される最大停止ワード数
   */
  protected getMaxStopWords(): number {
    const url = new URL(this.apiBase!);

    if (this.maxStopWords !== undefined) {
      return this.maxStopWords;
    } else if (url.host === "api.deepseek.com") {
      return 16;
    } else if (
      url.port === "1337" ||
      url.host === "api.openai.com" ||
      url.host === "api.groq.com" ||
      this.apiType === "azure"
    ) {
      return 4;
    } else {
      return Infinity;
    }
  }

  /**
   * オプションとメッセージをOpenAI APIの形式に変換するメソッド
   * @param options 完了オプション
   * @param messages チャットメッセージ配列
   * @returns OpenAI API用のパラメータ
   */
  protected _convertArgs(
    options: CompletionOptions,
    messages: ChatMessage[],
  ): ChatCompletionCreateParams {
    const finalOptions = toChatBody(messages, options);

    finalOptions.stop = options.stop?.slice(0, this.getMaxStopWords());

    // OpenAI o1-previewとo1-miniまたはo3-mini向けの特別な処理:
    if (this.isO3orO1Model(options.model)) {
      // a) max_tokensの代わりにmax_completion_tokensを使用
      finalOptions.max_completion_tokens = options.maxTokens;
      finalOptions.max_tokens = undefined;

      // b) システムメッセージをサポートしない
      finalOptions.messages = formatMessageForO1(finalOptions.messages);
    }

    if (options.model === "o1") {
      finalOptions.stream = false;
    }

    if (options.prediction && this.supportsPrediction(options.model)) {
      if (finalOptions.presence_penalty) {
        // predictionは0より大きい値をサポートしない
        finalOptions.presence_penalty = undefined;
      }
      if (finalOptions.frequency_penalty) {
        // predictionは0より大きい値をサポートしない
        finalOptions.frequency_penalty = undefined;
      }
      finalOptions.max_completion_tokens = undefined;

      finalOptions.prediction = options.prediction;
    } else {
      finalOptions.prediction = undefined;
    }

    return finalOptions;
  }

  /**
   * リクエストヘッダーを取得するメソッド
   * @returns リクエストヘッダーオブジェクト
   */
  protected _getHeaders() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      "api-key": this.apiKey ?? "", // Azureの場合
    };
  }

  /**
   * テキスト補完を実行するメソッド
   * @param prompt プロンプト（入力テキスト）
   * @param signal 中断シグナル
   * @param options 補完オプション
   * @returns 補完されたテキスト
   */
  protected async _complete(
    prompt: string,
    signal: AbortSignal,
    options: CompletionOptions,
  ): Promise<string> {
    let completion = "";
    for await (const chunk of this._streamChat(
      [{ role: "user", content: prompt }],
      signal,
      options,
    )) {
      completion += chunk.content;
    }

    return completion;
  }

  /**
   * APIエンドポイントのURLを取得するメソッド
   * @param endpoint エンドポイント種別
   * @returns 完全なエンドポイントURL
   */
  protected _getEndpoint(
    endpoint: "chat/completions" | "completions" | "models",
  ) {
    if (!this.apiBase) {
      throw new Error(
        "No API base URL provided. Please set the 'apiBase' option in config.json",
      );
    }

    if (this.apiType?.includes("azure")) {
      // デフォルトは`azure-openai`だが、以前は`azure`だった
      const isAzureOpenAI =
        this.apiType === "azure-openai" || this.apiType === "azure";

      const path = isAzureOpenAI
        ? `openai/deployments/${this.deployment}/${endpoint}`
        : endpoint;

      const version = this.apiVersion ? `?api-version=${this.apiVersion}` : "";
      return new URL(`${path}${version}`, this.apiBase);
    }

    return new URL(endpoint, this.apiBase);
  }

  /**
   * テキスト補完をストリーミングで行うメソッド
   * @param prompt プロンプト（入力テキスト）
   * @param signal 中断シグナル
   * @param options 補完オプション
   * @returns テキストチャンクを生成する非同期ジェネレータ
   */
  protected async *_streamComplete(
    prompt: string,
    signal: AbortSignal,
    options: CompletionOptions,
  ): AsyncGenerator<string> {
    for await (const chunk of this._streamChat(
      [{ role: "user", content: prompt }],
      signal,
      options,
    )) {
      yield renderChatMessage(chunk);
    }
  }

  /**
   * チャットリクエストボディを修正するメソッド
   * モデル固有の特別な処理を適用する
   * @param body 元のリクエストボディ
   * @returns 修正後のリクエストボディ
   */
  protected modifyChatBody(
    body: ChatCompletionCreateParams,
  ): ChatCompletionCreateParams {
    body.stop = body.stop?.slice(0, this.getMaxStopWords());

    // OpenAI o1-previewとo1-miniまたはo3-mini向けの特別な処理:
    if (this.isO3orO1Model(body.model)) {
      // a) max_tokensの代わりにmax_completion_tokensを使用
      body.max_completion_tokens = body.max_tokens;
      body.max_tokens = undefined;

      // b) システムメッセージをサポートしない
      body.messages = formatMessageForO1(body.messages);
    }

    if (body.model === "o1") {
      // o1はストリーミングをサポートしない
      body.stream = false;
    }

    if (body.prediction && this.supportsPrediction(body.model)) {
      if (body.presence_penalty) {
        // predictionは0より大きい値をサポートしない
        body.presence_penalty = undefined;
      }
      if (body.frequency_penalty) {
        // predictionは0より大きい値をサポートしない
        body.frequency_penalty = undefined;
      }
      body.max_completion_tokens = undefined;
    }

    if (body.tools?.length) {
      if (this.isFireworksAiModel(body.model)) {
        // fireworks.aiは並列ツールコールをサポートしていないが、
        // APIはこれをtrueに設定しないとエラーを返す
        // このパラメータをtrueに設定すれば推論プロバイダとして機能する
        // https://docs.fireworks.ai/guides/function-calling#openai-compatibility
        body.parallel_tool_calls = true;
      }
      // スキーマ準拠のため: https://platform.openai.com/docs/guides/function-calling#parallel-function-calling-and-structured-outputs
      // 実際にはこれをtrueに設定し、複数のツールコールを要求すると
      // "arguments"が'{"file": "test.ts"}{"file": "test.js"}'のようになる
      // o3はこれをサポートしない
      if (!body.model.startsWith("o3")) {
        body.parallel_tool_calls = false;
      }
    }

    return body;
  }

  /**
   * 従来のCompletions APIを使用したストリーミング補完メソッド
   * @param prompt プロンプト（入力テキスト）
   * @param signal 中断シグナル
   * @param options 補完オプション
   * @returns テキストチャンクを生成する非同期ジェネレータ
   */
  protected async *_legacystreamComplete(
    prompt: string,
    signal: AbortSignal,
    options: CompletionOptions,
  ): AsyncGenerator<string> {
    const args: any = this._convertArgs(options, []);
    args.prompt = prompt;
    args.messages = undefined;

    const response = await this.fetch(this._getEndpoint("completions"), {
      method: "POST",
      headers: this._getHeaders(),
      body: JSON.stringify({
        ...args,
        stream: true,
        ...this.extraBodyProperties(),
      }),
      signal,
    });

    for await (const value of streamSse(response)) {
      if (value.choices?.[0]?.text && value.finish_reason !== "eos") {
        yield value.choices[0].text;
      }
    }
  }

  /**
   * チャット応答をストリーミングで取得するメソッド
   * @param messages 入力メッセージ配列
   * @param signal 中断シグナル
   * @param options 補完オプション
   * @returns チャットメッセージを生成する非同期ジェネレータ
   */
  protected async *_streamChat(
    messages: ChatMessage[],
    signal: AbortSignal,
    options: CompletionOptions,
  ): AsyncGenerator<ChatMessage> {
    if (
      !isChatOnlyModel(options.model) &&
      this.supportsCompletions() &&
      (NON_CHAT_MODELS.includes(options.model) ||
        this.useLegacyCompletionsEndpoint ||
        options.raw)
    ) {
      for await (const content of this._legacystreamComplete(
        renderChatMessage(messages[messages.length - 1]),
        signal,
        options,
      )) {
        yield {
          role: "assistant",
          content,
        };
      }
      return;
    }

    const body = this._convertArgs(options, messages);

    const response = await this.fetch(this._getEndpoint("chat/completions"), {
      method: "POST",
      headers: this._getHeaders(),
      body: JSON.stringify({
        ...body,
        ...this.extraBodyProperties(),
      }),
      signal,
    });

    // ストリーミングなしのレスポンスを処理
    if (body.stream === false) {
      const data = await response.json();
      yield data.choices[0].message;
      return;
    }

    for await (const value of streamSse(response)) {
      const chunk = fromChatCompletionChunk(value);
      if (chunk) {
        yield chunk;
      }
    }
  }

  /**
   * Fill-in-the-middle (FIM) 補完をストリーミングで行うメソッド
   * テキストの中間部分を補完する機能
   * @param prefix 前部テキスト
   * @param suffix 後部テキスト
   * @param signal 中断シグナル
   * @param options 補完オプション
   * @returns テキストチャンクを生成する非同期ジェネレータ
   */
  protected async *_streamFim(
    prefix: string,
    suffix: string,
    signal: AbortSignal,
    options: CompletionOptions,
  ): AsyncGenerator<string> {
    const endpoint = new URL("fim/completions", this.apiBase);
    const resp = await this.fetch(endpoint, {
      method: "POST",
      body: JSON.stringify({
        model: options.model,
        prompt: prefix,
        suffix,
        max_tokens: options.maxTokens,
        temperature: options.temperature,
        top_p: options.topP,
        frequency_penalty: options.frequencyPenalty,
        presence_penalty: options.presencePenalty,
        stop: options.stop,
        stream: true,
        ...this.extraBodyProperties(),
      }),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-api-key": this.apiKey ?? "",
        Authorization: `Bearer ${this.apiKey}`,
      },
      signal,
    });
    for await (const chunk of streamSse(resp)) {
      yield chunk.choices[0].delta.content;
    }
  }

  /**
   * 利用可能なモデルのリストを取得するメソッド
   * @returns モデル名の配列
   */
  async listModels(): Promise<string[]> {
    const response = await this.fetch(this._getEndpoint("models"), {
      method: "GET",
      headers: this._getHeaders(),
    });

    const data = await response.json();
    return data.data.map((m: any) => m.id);
  }

  /**
   * エンベディングエンドポイントのURLを取得するプライベートメソッド
   * @returns エンベディングエンドポイントURL
   */
  private _getEmbedEndpoint() {
    if (!this.apiBase) {
      throw new Error(
        "No API base URL provided. Please set the 'apiBase' option in config.json",
      );
    }

    if (this.apiType === "azure") {
      return new URL(
        `openai/deployments/${this.deployment}/embeddings?api-version=${this.apiVersion}`,
        this.apiBase,
      );
    }
    return new URL("embeddings", this.apiBase);
  }

  /**
   * テキストをエンベディング（ベクトル表現）に変換するメソッド
   * @param chunks エンベディングするテキストチャンクの配列
   * @returns エンベディング配列の配列
   */
  protected async _embed(chunks: string[]): Promise<number[][]> {
    const resp = await this.fetch(this._getEmbedEndpoint(), {
      method: "POST",
      body: JSON.stringify({
        input: chunks,
        model: this.model,
        ...this.extraBodyProperties(),
      }),
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "api-key": this.apiKey ?? "", // Azureの場合
      },
    });

    if (!resp.ok) {
      throw new Error(await resp.text());
    }

    const data = (await resp.json()) as any;
    return data.data.map((result: { embedding: number[] }) => result.embedding);
  }
}

export default OpenAI;