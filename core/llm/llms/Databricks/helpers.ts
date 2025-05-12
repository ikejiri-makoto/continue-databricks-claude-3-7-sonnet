import { CompletionOptions } from "../../../index.js";
import { DatabricksCompletionOptions } from "./types/types.js";
import { safeStringify } from "../../utils/json.js";

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
    'reasoning'             // Databricksではエラーになるパラメータ（追加）
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

    // トークン設定を調整
    if (options.maxTokens && options.maxTokens > 0) {
      args.max_tokens = options.maxTokens;
    }
    
    // 思考モード設定の追加（Claude 3.7モデルの場合のみ）
    if (isClaude37) {
      // 思考モードバジェットを計算
      const thinkingBudgetTokens = Math.min(options.maxTokens ? Math.floor(options.maxTokens / 2) : 32000, 64000);
      
      // 温度を1.0に設定（思考モードが最適に機能する値）
      args.temperature = 1.0;
      
      console.log(`Token settings - max_tokens: ${args.max_tokens}, thinking budget: ${thinkingBudgetTokens}`);
      
      // 重要: Databricksエンドポイントで思考モードを使用するには、extra_bodyに配置する必要がある
      // reasoningパラメータの代わりにthinkingパラメータをextra_body内に配置
      args.extra_body = {
        thinking: {
          type: "enabled",
          budget_tokens: thinkingBudgetTokens
        }
      };
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
    
    // Databricksエンドポイントに送信するパラメータのログ
    console.log(`Databricksに送信するパラメータ: ${Object.keys(args).join(', ')}`);
    
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
    
    // thinking関連パラメータを確認し、適切に処理
    if (obj.thinking && typeof obj.thinking === 'object' && obj.thinking.type === 'enabled') {
      // Databricksエンドポイントでは直接thinkingパラメータを使用せず、
      // thinkingパラメータはextra_body内で設定される必要がある
      // ただし、変換はconvertArgs関数で一括して行うため、ここでは削除のみを行う
      
      // バッファリング中にthinkingパラメータが見つかった場合は削除
      if (!('extra_body' in obj)) {
        delete obj.thinking;
      }
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
      // deep copyを作成して元のオブジェクトを変更しない
      const processedTool = JSON.parse(JSON.stringify(tool));
      
      // parallel_tool_callsパラメータがあれば削除
      if ('parallel_tool_calls' in processedTool) {
        delete processedTool.parallel_tool_calls;
      }
      
      // サポートされていないパラメータをすべて削除
      this.removeUnsupportedParameters(processedTool);
      
      return processedTool;
    });
  }

  /**
   * リクエストボディを安全にログ出力
   * @param requestBody リクエストボディ
   */
  static logRequestBody(requestBody: any): void {
    try {
      // 長いメッセージコンテンツを省略してログ出力
      const loggableBody = { ...requestBody };
      
      if (loggableBody.messages && Array.isArray(loggableBody.messages)) {
        loggableBody.messages = loggableBody.messages.map((msg: any) => {
          if (msg.content && typeof msg.content === 'string' && msg.content.length > 100) {
            return {
              ...msg,
              content: `${msg.content.substring(0, 100)}... (${msg.content.length} characters)`
            };
          }
          return msg;
        });
      }
      
      const bodyString = safeStringify(loggableBody, "{}");
      console.log(`Request body (truncated): ${bodyString.substring(0, 500)}${bodyString.length > 500 ? '...' : ''}`);
      
      // 重要: サポートされていないパラメータがリクエストボディに含まれていないか最終確認
      // 特にparallel_tool_callsとreasoingパラメータは重要なので明示的に確認
      if (bodyString.includes('"parallel_tool_calls"')) {
        console.error(`警告: リクエストボディ内にparallel_tool_callsが検出されました。これは問題を引き起こす可能性があります。`);
      }
      
      if (bodyString.includes('"reasoning"')) {
        console.error(`警告: リクエストボディ内にreasoningが検出されました。これは問題を引き起こす可能性があります。`);
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
  static async processNonStreamingResponse(response: Response): Promise<any> {
    const data = await response.json();
    return { 
      role: "assistant", 
      content: data.choices?.[0]?.message?.content || ""
    };
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
}