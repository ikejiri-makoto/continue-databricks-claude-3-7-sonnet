import { ChatMessage, CompletionOptions } from "../../../index.js";
import { safeStringify } from "../../utils/json.js";
import { extractContentAsString } from "../../utils/messageUtils.js";
import { DatabricksMessageAdapter, MessageProcessor } from "./messages.ts";

/**
 * Databricks固有のヘルパー関数を提供するクラス
 * Databricksエンドポイント統合で使用される共通機能をカプセル化
 */
export class DatabricksHelpers {
  /**
   * サポートされていないパラメータのリスト
   * Databricksエンドポイントで使用できないパラメータ
   */
  private static UNSUPPORTED_PARAMETERS = [
    // 最優先でチェックするパラメータ（重要度の高い順）
    'parallel_tool_calls',  // 最重要: Databricksでサポートされていないパラメータ
    'parallelToolCalls',    // キャメルケース形式もチェック
    'function_call',        // 古いOpenAIの要求形式
    'has_parallel_tool_calls', // 内部フラグ
    'tool_choice',          // Databricksがサポートしているか不明
    'functions',            // 古いOpenAIの要求形式
    'reasoning',            // Databricksではエラーになるパラメータ（追加）
    'requestTimeout'        // Databricksでサポートされていないタイムアウトパラメータ
    // 'extra_body' は削除 - extra_bodyは除外せず、その内容を処理する
  ];

  /**
   * オプションをDatabricksエンドポイント用のパラメータに変換
   * @param options 補完オプション
   * @returns Databricksエンドポイント用のパラメータ
   */
  static convertArgs(options: CompletionOptions): any {
    // モデル名（デフォルトはdatabricks-claude-3-7-sonnet）
    const modelName = options.model || "databricks-claude-3-7-sonnet";
    
    // Claude 3.7モデルかどうかを検出
    const isClaude37 = modelName.toLowerCase().includes("claude-3-7");
    
    if (isClaude37) {
      console.log(`Claude 3.7 Sonnet model detected - applying special configuration`);
    }
    
    // 基本パラメータの準備
    const args: any = {
      model: modelName,
      max_tokens: options.maxTokens || 128000,
      temperature: options.temperature ?? 1.0,
      stream: options.stream ?? true
    };

    // requestTimeoutパラメータはサポートされていないため削除
    
    // トークン設定を調整
    if (options.maxTokens && options.maxTokens > 0) {
      args.max_tokens = options.maxTokens;
    }
    
    // 思考モード設定の追加（Claude 3.7モデルの場合のみ）
    if (isClaude37) {
      // 思考モードバジェットを10240に設定（Databricksの推奨値）
      const thinkingBudgetTokens = 10240;
      
      // 温度を1.0に設定（思考モードが最適に機能する値）
      args.temperature = 1.0;
      
      console.log(`Token settings - max_tokens: ${args.max_tokens}, thinking budget: ${thinkingBudgetTokens}`);
      
      // 型安全に処理するために型アサーションを使用
      // options を any型として扱い、extra_bodyプロパティにアクセス
      const optionsAny = options as any;
      
      // 重要: extra_bodyから思考モードパラメータを抽出してトップレベルに配置
      if (optionsAny.extra_body && typeof optionsAny.extra_body === 'object' && optionsAny.extra_body.thinking) {
        // extra_bodyから直接thinking設定を抽出
        console.log('思考モードパラメータをextra_bodyから抽出してルートに配置します');
        // 思考モードパラメータをオーバーライドして10240トークンに設定
        args.thinking = {
          ...optionsAny.extra_body.thinking,
          budget_tokens: thinkingBudgetTokens
        };
      } else if (optionsAny.thinking) {
        // thinking設定が直接存在する場合はそれを使用
        // 型アサーションを使用してthinkingプロパティにアクセス
        // バジェットトークンを10240に設定
        args.thinking = {
          ...optionsAny.thinking,
          budget_tokens: thinkingBudgetTokens
        };
      } else {
        // デフォルトの思考モード設定
        args.thinking = {
          type: "enabled",
          budget_tokens: thinkingBudgetTokens
        };
      }
    }
    
    // ツール設定の処理
    if (options.tools && Array.isArray(options.tools) && options.tools.length > 0) {
      args.tools = this.processTools(options.tools);
      console.log(`Adding tool configuration - tool count: ${args.tools.length}`);
      
      // ツール情報をログ出力
      if (process.env.NODE_ENV === 'development' || true) {
        try {
          args.tools.forEach((tool: any, index: number) => {
            console.log(`ツール情報[${index}]: ${safeStringify({
              name: tool.function?.name,
              type: tool.type,
              params_count: tool.function?.parameters?.properties ? Object.keys(tool.function.parameters.properties).length : 0
            }, "{}")}`);
          });
        } catch (e) {
          console.warn(`ツール情報のログ出力中にエラー発生`);
        }
      }
      
      // TypeScriptエラー修正: optionsAny変数の宣言を確保
      const optionsAny = options as any;
      
      // tool_choiceパラメータをサポートしているか確認
      if (optionsAny?.tool_choice) {
        console.log(`tool_choiceパラメータ検出: ${safeStringify(optionsAny.tool_choice, "auto")}`);
        args.tool_choice = optionsAny.tool_choice;
      } else {
        // デフォルトで"auto"を設定
        args.tool_choice = "auto";
      }
    }
    
    // ***** 重要: サポートされていないパラメータを明示的に削除 *****
    this.removeUnsupportedParameters(args);
    
    // 確認ログ (常に出力)
    console.log(`最終確認: 以下の不要パラメータは削除されました: ${this.UNSUPPORTED_PARAMETERS.join(', ')}`);
    
    // 最終的なparallel_tool_callsフラグのチェック (最重要パラメータなので念のため再確認)
    if ('parallel_tool_calls' in args) {
      console.error(`警告: parallel_tool_callsパラメータが削除されていません。強制的に削除します。`);
      delete args.parallel_tool_calls;
    }
    
    // reasoningパラメータの最終確認
    if ('reasoning' in args) {
      console.error(`警告: reasoningパラメータが削除されていません。強制的に削除します。`);
      delete args.reasoning;
    }
    
    // 型アサーションを使用してextra_bodyにアクセス
    if ('extra_body' in args && typeof args.extra_body === 'object') {
      console.log('extra_bodyが検出されました - 内容を処理します');
      
      // extra_bodyの内容を処理
      if (args.extra_body.thinking) {
        console.log('extra_body内のthinkingパラメータをルートに移動します');
        // 思考モードパラメータをオーバーライドして10240トークンに設定
        args.thinking = {
          ...args.extra_body.thinking,
          budget_tokens: 10240
        };
      }
      
      // 処理後にextra_bodyを削除
      delete args.extra_body;
      console.log('extra_bodyパラメータを処理して削除しました');
    }
    
    // Databricksエンドポイントに送信するパラメータのログ
    console.log(`Databricksに送信するパラメータ: ${Object.keys(args).join(', ')}`);
    
    // 完全なリクエストボディをログ出力（デバッグ用）
    this.logRequestBody(args);
    
    return args;
  }

  /**
   * サポートされていないパラメータをオブジェクトから削除
   * @param obj 処理対象オブジェクト
   */
  static removeUnsupportedParameters(obj: any): void {
    if (!obj || typeof obj !== 'object') {
      return;
    }
    
    console.log("Databricksエンドポイントではサポートされていないパラメータを除外しています");
    
    // 最重要なパラメータを明示的にチェック - parallel_tool_calls
    if ('parallel_tool_calls' in obj) {
      delete obj.parallel_tool_calls;
    }
    
    // キャメルケース版もチェック - parallelToolCalls
    if ('parallelToolCalls' in obj) {
      delete obj.parallelToolCalls;
    }
    
    // reasoningパラメータを削除
    if ('reasoning' in obj) {
      delete obj.reasoning;
    }
    
    // extra_bodyは特別に処理 - 直接削除せず、必要な内容を抽出
    if ('extra_body' in obj && typeof obj.extra_body === 'object') {
      // extra_bodyの内容を確認
      if (obj.extra_body.thinking) {
        console.log('extra_body内のthinkingパラメータを処理します');
        // thinkingパラメータをルートレベルに移動し、budget_tokensを10240に設定
        if (!obj.thinking) {
          obj.thinking = {
            ...obj.extra_body.thinking,
            budget_tokens: 10240
          };
        }
      }
      
      // その他のextra_body内のパラメータを処理（思考モード以外にも必要なパラメータがあれば）
      const extraBodyKeys = Object.keys(obj.extra_body);
      for (const key of extraBodyKeys) {
        if (key !== 'thinking' && !(key in obj) && !this.UNSUPPORTED_PARAMETERS.includes(key)) {
          console.log(`extra_body内の${key}パラメータをルートに移動します`);
          obj[key] = obj.extra_body[key];
        }
      }
    }
    
    // thinking関連パラメータを確認し、適切に処理
    if (obj.thinking && typeof obj.thinking === 'object' && obj.thinking.type === 'enabled') {
      // Databricksエンドポイントでは思考モードパラメータをトップレベルに配置する
      // 思考モードのbudget_tokensを10240に設定
      obj.thinking.budget_tokens = 10240;
      console.log(`思考モードが設定されています: ${JSON.stringify(obj.thinking)}`);
    }
    
    // その他のサポートされていないパラメータも削除
    for (const param of this.UNSUPPORTED_PARAMETERS) {
      if (param in obj) {
        delete obj[param];
      }
    }
    
    // tools配列内の各ツールからもサポートされていないパラメータを削除
    if (obj.tools && Array.isArray(obj.tools)) {
      for (const tool of obj.tools) {
        if (tool && typeof tool === 'object') {
          // 再帰的にサポートされていないパラメータを削除
          for (const param of this.UNSUPPORTED_PARAMETERS) {
            if (param in tool) {
              delete tool[param];
            }
          }
          
          // function内のパラメータもチェック
          if (tool.function && typeof tool.function === 'object') {
            for (const param of this.UNSUPPORTED_PARAMETERS) {
              if (param in tool.function) {
                delete tool.function[param];
              }
            }
            
            // parametersオブジェクト内も確認
            if (tool.function.parameters && typeof tool.function.parameters === 'object') {
              for (const param of this.UNSUPPORTED_PARAMETERS) {
                if (param in tool.function.parameters) {
                  delete tool.function.parameters[param];
                }
              }
            }
          }
        }
      }
    }
    
    console.log("確認: parallel_tool_callsパラメータは正常に除外されました");
  }

  /**
   * ツール定義を処理してDatabricksエンドポイント用に変換
   * @param tools ツール定義配列
   * @returns 処理後のツール定義配列
   */
  private static processTools(tools: any[]): any[] {
    if (!tools || !Array.isArray(tools) || tools.length === 0) {
      return [];
    }
    
    // 各ツールを処理
    return tools.map(tool => {
      // 標準的なtool形式を確保するために必要なプロパティのみを抽出
      const processedTool: any = {
        type: tool.type || "function"
      };
      
      // function情報の処理
      if (tool.function) {
        processedTool.function = {
          name: tool.function.name,
          description: tool.function.description
        };
        
        // parametersの処理
        if (tool.function.parameters) {
          processedTool.function.parameters = { ...tool.function.parameters };
        }
      }
      
      return processedTool;
    });
  }

  /**
   * APIエンドポイントURLを正規化する
   * @param url APIエンドポイントのURL
   * @returns 正規化されたURL
   */
  static normalizeApiUrl(url: string): string {
    if (!url) {
      return "";
    }
    
    // 末尾のスラッシュを削除
    let normalizedUrl = url.trim();
    if (normalizedUrl.endsWith("/")) {
      normalizedUrl = normalizedUrl.slice(0, -1);
      console.log(`APIベースURL修正: 末尾のスラッシュを削除しました - ${normalizedUrl}`);
    }
    
    // serving-endpoints/{endpoint-name}/invocations 形式かチェック
    if (normalizedUrl.includes('/serving-endpoints/') && normalizedUrl.endsWith('/invocations')) {
      // 正しい形式の場合はそのまま返す
      return normalizedUrl;
    }
    
    // モデル名を含むURLを構築
    const endpointName = "databricks-claude-3-7-sonnet"; // デフォルト値
    return `${normalizedUrl}/serving-endpoints/${endpointName}/invocations`;
  }

  /**
   * リクエストメッセージの前処理
   * 思考モード対応のメッセージ構造を確保する
   * @param messages メッセージ配列
   * @returns 処理済みのメッセージ配列
   */
  static preprocessMessages(messages: ChatMessage[]): ChatMessage[] {
    if (!messages || !Array.isArray(messages)) {
      return messages;
    }
    
    // まずthinkingロールを持つメッセージを除外し、無効なロールを修正
    const validRolesMessages = MessageProcessor.validateAndFixMessageRoles(messages);
    
    // メッセージ配列をコピーして修正
    const processedMessages = [...validRolesMessages];
    
    // アシスタントメッセージを検索して思考モード対応の構造に変換
    for (let i = 0; i < processedMessages.length; i++) {
      const message = processedMessages[i];
      
      if (message.role === 'assistant') {
        // content が配列でない場合のみ変換（既に変換済みの場合はスキップ）
        if (!Array.isArray(message.content)) {
          const textContent = extractContentAsString(message.content);
          
          // 思考モード対応の構造に変換
          const thinkingContent = "以前の思考プロセスの要約";
          
          // TypeScriptエラー修正: "text"タイプを使用
          processedMessages[i] = {
            role: 'assistant',
            content: [
              {
                type: "text" as const, // "reasoning"の代わりに"text"を使用
                text: thinkingContent // reasoning構造のテキストとして提供
              },
              {
                type: "text" as const,
                text: textContent
              }
            ]
          };
          
          // toolCallsがある場合は保持（型アサーションを使用）
          if ((message as any).toolCalls) {
            (processedMessages[i] as any).toolCalls = (message as any).toolCalls;
          }
        }
      }
    }
    
    return processedMessages;
  }

  /**
   * リクエストボディを安全にログ出力
   * @param requestBody リクエストボディ
   */
  static logRequestBody(requestBody: any): void {
    try {
      // まず完全なリクエストボディを詳細ログに出力（デバッグ用）
      console.log(`Databricks Claudeに発行している詳細なリクエストのJSON: ${safeStringify(requestBody, "{}")}`);
      
      // 長いメッセージコンテンツを省略してログ出力
      const loggableBody = { ...requestBody };
      
      if (loggableBody.messages && Array.isArray(loggableBody.messages)) {
        loggableBody.messages = loggableBody.messages.map((msg: any) => {
          if (msg.content) {
            if (Array.isArray(msg.content)) {
              // 配列形式のcontent（思考モード対応のメッセージ構造）
              return {
                ...msg,
                content: `[配列構造のcontent (${msg.content.length} 要素)]`
              };
            } else {
              // 文字列形式のcontent
              const contentStr = typeof msg.content === 'string' 
                ? msg.content 
                : extractContentAsString(msg.content);
              
              if (contentStr.length > 100) {
                return {
                  ...msg,
                  content: `${contentStr.substring(0, 100)}... (${contentStr.length} characters)`
                };
              }
            }
          }
          return msg;
        });
      }
      
      const bodyString = safeStringify(loggableBody, "{}");
      console.log(`完全なリクエストボディJSON: ${bodyString}`);
      
      // リクエストBodyの重要な部分を個別にログ出力
      console.log(`Databricks request model: ${requestBody.model || '未指定'}`);
      console.log(`Databricks request max_tokens: ${requestBody.max_tokens || '未指定'}`);
      console.log(`Databricks request thinking設定: ${safeStringify(requestBody.thinking || {}, "{}")}`);
      
      // 重要: サポートされていないパラメータがリクエストボディに含まれていないか最終確認
      // 特にparallel_tool_callsとreasoingパラメータは重要なので明示的に確認
      if (bodyString.includes('"parallel_tool_calls"')) {
        console.error(`警告: リクエストボディ内にparallel_tool_callsが検出されました。これは問題を引き起こす可能性があります。`);
      }
      
      if (bodyString.includes('"reasoning"')) {
        console.error(`警告: リクエストボディ内にreasoningが検出されました。これは問題を引き起こす可能性があります。`);
      }
      
      if (bodyString.includes('"extra_body"')) {
        console.error(`警告: リクエストボディ内にextra_bodyが検出されました。これは問題を引き起こす可能性があります。`);
      }
    } catch (e) {
      console.log("リクエストボディのログ出力に失敗しました");
    }
  }

  /**
   * 非ストリーミングレスポンスの処理
   * @param response Fetch API レスポンス
   * @returns 処理されたメッセージ
   */
  static async processNonStreamingResponse(response: Response): Promise<ChatMessage> {
    try {
      const data = await response.json();
      
      // 適切なレスポンス構造の確認と処理
      if (data.choices && data.choices.length > 0 && data.choices[0].message) {
        const message = data.choices[0].message;
        
        // content配列や思考データの処理
        if (message.content && Array.isArray(message.content)) {
          // contentが配列の場合の特別処理（thinking contentなど）
          const processedContent = this.processNestedContent(message.content);
          return { 
            role: "assistant", 
            content: processedContent
          };
        }
        
        return { 
          role: "assistant", 
          content: message.content || ""
        };
      }
      
      // 標準的な構造でない場合のフォールバック
      return { 
        role: "assistant", 
        content: typeof data === 'string' ? data : JSON.stringify(data)
      };
    } catch (error) {
      console.error("非ストリーミングレスポンスの処理中にエラー:", error);
      return {
        role: "assistant",
        content: "レスポンスの処理中にエラーが発生しました。"
      };
    }
  }

  /**
   * 入れ子になったコンテンツ構造を処理
   * @param contentArray コンテンツ配列
   * @returns 処理されたコンテンツ文字列
   */
  private static processNestedContent(contentArray: any[]): string {
    if (!Array.isArray(contentArray)) {
      return String(contentArray || "");
    }
    
    // コンテンツ配列から適切なテキストを抽出
    let processedContent = "";
    
    for (const item of contentArray) {
      if (typeof item === 'string') {
        processedContent += item;
      } else if (item && typeof item === 'object') {
        // テキスト要素の処理
        if (item.type === 'text' && item.text) {
          processedContent += item.text;
        }
        // 思考要素の処理
        else if (item.type === 'reasoning' && item.summary) {
          // 思考サマリーを処理
          const summaryText = this.processThinkingSummary(item);
          if (summaryText) {
            processedContent += `\n ${summaryText}\n`;
          }
        }
      }
    }
    
    return processedContent;
  }

  /**
   * 思考サマリーの処理
   * さまざまな形式の思考データからテキストを抽出
   * @param thinkingData 思考データオブジェクト
   * @returns 抽出されたテキスト
   */
  static processThinkingSummary(thinkingData: any): string {
    if (!thinkingData) {
      return "";
    }
    
    // 文字列の場合はそのまま返す
    if (typeof thinkingData === 'string') {
      return thinkingData;
    }
    
    // オブジェクトの場合は適切なプロパティを探す
    if (typeof thinkingData === 'object') {
      // summary配列の処理
      if (Array.isArray(thinkingData.summary) && thinkingData.summary.length > 0) {
        const summaryItem = thinkingData.summary[0];
        if (summaryItem && typeof summaryItem === 'object' && summaryItem.type === 'summary_text') {
          return summaryItem.text || "";
        }
      }
      
      // 最優先形式: choices[0].delta.content.summary.text形式 - Databricksで最も一般的
      if (thinkingData.choices?.[0]?.delta?.content?.summary?.text) {
        return thinkingData.choices[0].delta.content.summary.text;
      }
      
      // choices[0].delta.content.summaryがオブジェクトの場合
      if (thinkingData.choices?.[0]?.delta?.content?.summary && 
          typeof thinkingData.choices[0].delta.content.summary === 'object') {
        const summaryObj = thinkingData.choices[0].delta.content.summary;
        if (summaryObj.text) {
          return summaryObj.text;
        }
      }
      
      // content.summary.text形式
      if (thinkingData.content?.summary?.text) {
        return thinkingData.content.summary.text;
      }
      
      // summary.text形式
      if (thinkingData.summary?.text) {
        return thinkingData.summary.text;
      }
      
      // text形式
      if (thinkingData.text) {
        return thinkingData.text;
      }
      
      // thinking形式 - Databricksでは通常使用されない
      if (thinkingData.thinking && typeof thinkingData.thinking === 'string') {
        return thinkingData.thinking;
      }
      
      // thinkingがオブジェクトの場合は再帰的に処理
      if (thinkingData.thinking && typeof thinkingData.thinking === 'object') {
        return this.processThinkingSummary(thinkingData.thinking);
      }
    }
    
    // どのプロパティも見つからない場合は[object Object]を避け、簡単なメッセージを返す
    return "[思考中...]";
  }
  
  /**
   * 部分的なテキストから思考データを抽出
   * ストリーミングチャンクから送られてくる思考データのさまざまな形式に対応
   * @param chunk ストリーミングチャンク
   * @returns 抽出された思考テキストとシグネチャ（存在する場合）
   */
  static extractThinkingData(chunk: any): { text: string; signature?: string } | null {
    if (!chunk) {
      return null;
    }
    
    // ストリーミングチャンクの構造をログ出力（デバッグ用）
    // console.log(`思考データ抽出: チャンク構造: ${safeStringify(chunk, "{}")}`);
    
    try {
      // choices[0].delta.content[0].summary[0].text 形式 (Databricksの配列ベース形式)
      if (chunk.choices?.[0]?.delta?.content && Array.isArray(chunk.choices[0].delta.content) && chunk.choices[0].delta.content.length > 0) {
        const content = chunk.choices[0].delta.content[0];
        
        // 型安全なアクセス - reasoningタイプとsummary配列の確認
        if (content && typeof content === 'object' && content.type === 'reasoning' && 
            Array.isArray(content.summary) && content.summary.length > 0) {
            
          const summaryItem = content.summary[0];
          // summary_textタイプの確認
          if (summaryItem && typeof summaryItem === 'object' && 
              summaryItem.type === 'summary_text' && typeof summaryItem.text === 'string') {
            
            // console.log(`思考データを抽出しました: パス = choices[0].delta.content[0].summary[0].text`);
            return {
              text: summaryItem.text,
              signature: summaryItem.signature || undefined
            };
          }
        }
      }
      
      // choices[0].delta.content.summary.text 形式 (オブジェクトベース形式)
      if (chunk.choices?.[0]?.delta?.content?.summary?.text) {
        // console.log(`思考データを抽出しました: パス = choices[0].delta.content.summary.text`);
        return {
          text: chunk.choices[0].delta.content.summary.text,
          signature: chunk.choices[0].delta.content.summary.signature
        };
      }
      
      // thinking.text 形式（直接のthinking形式）
      if (chunk.thinking?.text) {
        // console.log(`思考データを抽出しました: パス = thinking.text`);
        return {
          text: chunk.thinking.text,
          signature: chunk.thinking.signature
        };
      }
      
      // content.summary.text 形式
      if (chunk.content?.summary?.text) {
        // console.log(`思考データを抽出しました: パス = content.summary.text`);
        return {
          text: chunk.content.summary.text,
          signature: chunk.content.summary.signature
        };
      }
      
      // summary.text 形式
      if (chunk.summary?.text) {
        // console.log(`思考データを抽出しました: パス = summary.text`);
        return {
          text: chunk.summary.text,
          signature: chunk.summary.signature
        };
      }
      
      // choices[0].delta.reasoning 形式 (Databricksの一部のモデル用)
      if (chunk.choices?.[0]?.delta?.reasoning) {
        const reasoning = chunk.choices[0].delta.reasoning;
        
        // reasoningが文字列の場合
        if (typeof reasoning === 'string') {
          // console.log(`思考データを抽出しました: パス = choices[0].delta.reasoning (string)`);
          return {
            text: reasoning
          };
        }
        
        // reasoningがオブジェクトの場合
        if (typeof reasoning === 'object' && reasoning !== null) {
          // 直接のtext形式
          if (reasoning.text) {
            // console.log(`思考データを抽出しました: パス = choices[0].delta.reasoning.text`);
            return {
              text: reasoning.text,
              signature: reasoning.signature
            };
          }
          
          // summary.text形式
          if (reasoning.summary?.text) {
            // console.log(`思考データを抽出しました: パス = choices[0].delta.reasoning.summary.text`);
            return {
              text: reasoning.summary.text,
              signature: reasoning.signature
            };
          }
        }
      }
      
      // いずれのパターンにも一致しない場合
      return null;
    } catch (error) {
      console.error(`思考データの抽出中にエラー: ${error}`);
      return null;
    }
  }
  
  /**
   * リクエストを前処理して送信準備を行う
   * @param messages メッセージ配列
   * @param options 補完オプション
   * @param llmOptions LLMオプション
   * @returns 処理済みのリクエストボディ
   */
  static async prepareRequest(
    messages: ChatMessage[],
    options: CompletionOptions,
    llmOptions: any
  ): Promise<any> {
    // 送信前にthinkingロールを含むメッセージの処理状況をログ出力
    const hasThinkingMessages = messages.some(m => m.role === "thinking");
    if (hasThinkingMessages) {
      console.log(`警告: リクエスト内にthinkingロールのメッセージが含まれています。これらは除外されます。`);
      console.log(`思考モードはリクエストパラメータとして設定され、メッセージとしては送信されません。`);
    }
    
    // まず無効なロールのメッセージを修正（thinking除外）
    const validRoleMessages = MessageProcessor.validateAndFixMessageRoles(messages);
    
    // パラメータを変換
    const args = this.convertArgs(options);
    
    // 思考モードが有効な場合はメッセージを前処理
    if (args.thinking && args.thinking.type === "enabled") {
      // 思考モードの設定をログ出力
      console.log(`思考モードがパラメータとして有効化されています: ${safeStringify(args.thinking, "{}")}`);
      
      // 念のためvalidRoleMessagesからthinkingを持つメッセージが完全に除外されたことを確認
      const stillHasThinking = validRoleMessages.some(m => m.role === "thinking");
      if (stillHasThinking) {
        console.error(`エラー: 処理後もまだthinkingロールのメッセージが残っています。これらは手動で除外されます。`);
        // 強制的にthinkingロールを除外
        const forcedFilteredMessages = validRoleMessages.filter(m => m.role !== "thinking");
        // DatabricksMessageAdapterを使用してメッセージを変換
        args.messages = DatabricksMessageAdapter.formatMessages(forcedFilteredMessages);
      } else {
        // DatabricksMessageAdapterを使用してメッセージを変換
        args.messages = DatabricksMessageAdapter.formatMessages(validRoleMessages);
      }
    } else {
      // DatabricksMessageAdapterを使用してメッセージを変換
      args.messages = DatabricksMessageAdapter.formatMessages(validRoleMessages);
    }
    
    // 送信メッセージのロールを最終確認
    console.log(`送信前の最終確認 - メッセージロール: ${safeStringify(args.messages.map((m: any) => m.role), "[]")}`);
    
    // 送信メッセージに無効なロールがないか最終チェック
    const invalidRoleFound = args.messages.some((m: any) => !["system", "user", "assistant", "tool", "function"].includes(m.role));
    if (invalidRoleFound) {
      console.error(`エラー: 送信メッセージに無効なロールが含まれています。最終フィルタリングを行います。`);
      // 無効なロールを持つメッセージを最終的に除外
      args.messages = args.messages.filter((m: any) => ["system", "user", "assistant", "tool", "function"].includes(m.role));
    }
    
    // 重要: サポートされていないパラメータを再度チェック
    this.removeUnsupportedParameters(args);
    
    return args;
  }
}