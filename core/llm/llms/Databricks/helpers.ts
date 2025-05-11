import { ChatMessage, CompletionOptions } from "../../../index.js";
import { DatabricksCompletionOptions, ToolCall } from "./types/types.js";
import { safeStringify, safeJsonParse, isValidJson, extractValidJson } from "../../utils/json.js";
import { repairToolArguments } from "../../utils/toolUtils.js";
import { isSearchTool, processSearchToolArguments } from "../../utils/toolUtils.js";
import { extractContentAsString } from "../../utils/messageUtils.js";
import { getErrorMessage } from "../../utils/errors.js";

// Constants
const DEFAULT_MAX_TOKENS = 32000;
const MIN_MAX_TOKENS = 4096;
const DEFAULT_THINKING_TYPE = "enabled";
const DEFAULT_TEMPERATURE = 1.0;

/**
 * Helper functions for DatabricksLLM
 * Responsible for building request parameters, initializing state, and processing non-streaming responses
 */
export class DatabricksHelpers {
  /**
   * Convert to OpenAI-compatible options
   * Converts CompletionOptions to Databricks request parameters
   * 
   * @param options Completion options
   * @returns Converted request parameters
   */
  static convertArgs(options: DatabricksCompletionOptions): Record<string, any> {
    // Set model name (default or user-specified)
    const modelName = options.model || "databricks-claude-3-7-sonnet";
    
    // Identify Claude 3.7 models
    const isClaude37 = modelName.includes("claude-3-7");
    
    // Get default or specified max_tokens value
    // Ensure it's not too small (at least 4096)
    const maxTokens = Math.max(options.maxTokens || DEFAULT_MAX_TOKENS, MIN_MAX_TOKENS);
    
    // Calculate thinking budget - half of max_tokens or up to 64000 max
    // Always ensure it's smaller than max_tokens
    const thinkingBudget = Math.min(Math.floor(maxTokens * 0.5), 64000);
    
    // Build OpenAI-compatible request parameters
    const finalOptions: Record<string, any> = {
      model: modelName,
      max_tokens: maxTokens,
      temperature: options.temperature ?? DEFAULT_TEMPERATURE,
      top_p: options.topP,
      stream: options.stream ?? true,
    };

    // Only include non-empty stop arrays
    if (options.stop && Array.isArray(options.stop) && options.stop.length > 0) {
      finalOptions.stop = options.stop.filter((x: string) => typeof x === 'string' && x.trim() !== "");
    }

    // Add thinking mode for Claude 3.7 models
    if (isClaude37) {
      // Safely extract thinking properties with proper fallback values
      const thinkingType = options.thinking?.type || DEFAULT_THINKING_TYPE;
      const thinkingBudgetTokens = options.thinking?.budget_tokens || thinkingBudget;
      
      finalOptions.thinking = {
        type: thinkingType,
        budget_tokens: thinkingBudgetTokens,
      };
      
      // Log thinking configuration
      console.log(`Setting up Claude 3.7 thinking mode: type=${thinkingType}, budget=${thinkingBudgetTokens}`);
    }

    // Debug log
    console.log(`Token settings - max_tokens: ${maxTokens}, thinking budget: ${thinkingBudget}`);

    // Add tool parameters only if present
    if (options.tools && Array.isArray(options.tools) && options.tools.length > 0) {
      console.log("Adding tool configuration - tool count:", options.tools.length);
      
      try {
        // 安全にツールをマッピングし、不正なデータ構造に対応
        finalOptions.tools = options.tools.map((tool: any) => {
          // 入力チェック
          if (!tool || typeof tool !== 'object') {
            console.warn("無効なツールオブジェクトが検出されました:", safeStringify(tool, "<invalid>"));
            return null;
          }
          
          // 安全にプロパティにアクセス
          const functionObj = tool.function || {};
          const name = functionObj.name || "unnamed_tool";
          const description = functionObj.description || "";
          const parameters = functionObj.parameters || {};
          
          return {
            type: "function",
            function: {
              name,
              description,
              parameters,
            }
          };
        }).filter(Boolean); // null/undefinedを除外
        
        // 開発モードで詳細情報をログ出力
        if (process.env.NODE_ENV === 'development') {
          finalOptions.tools.forEach((tool: any, index: number) => {
            console.log(`ツール情報[${index}]: ${safeStringify({
              name: tool.function.name,
              type: tool.type,
              params_count: Object.keys(tool.function.parameters.properties || {}).length
            }, "{}")}`);
          });
        }
      } catch (error) {
        console.error(`ツール設定の処理中にエラー: ${getErrorMessage(error)}`);
        console.log("ツール設定をスキップします");
        finalOptions.tools = [];
      }

      // 重要: parallel_tool_calls パラメータはDatabricksエンドポイントでサポートされていないため、
      // このパラメータを明示的に設定しないことが重要です。このパラメータを設定するとAPIエラーが発生します。
      // これはOpenAIやAnthropicとの重要な違いであり、APIの互換性を確保するために注意が必要です。
      console.log("注意: Databricksエンドポイントはparallel_tool_callsパラメータをサポートしていません");
      
      // parallel_tool_callsパラメータが設定されていないことを確認
      if ('parallel_tool_calls' in finalOptions) {
        console.warn('警告: parallel_tool_callsパラメータが検出されました。削除します。');
        delete finalOptions.parallel_tool_calls;
      }
      
      // OpenAIから継承された可能性があるパラメータが含まれていないか確認
      if ('function_call' in finalOptions) {
        console.warn('警告: function_callパラメータが検出されました。tool_choiceを使用してください。');
        delete finalOptions.function_call;
      }
      
      // Detect specific tools that might be missing Query parameters
      const searchTools = options.tools.filter((tool: any) => 
        isSearchTool(tool.function.name)
      );

      if (searchTools.length > 0) {
        console.log(`Search tools detected: ${searchTools.map((t: any) => t.function.name).join(', ')}`);
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

    // Special handling based on Databricks model type
    if (isClaude37) {
      console.log("Claude 3.7 Sonnet model detected - applying special configuration");
      // Claude 3.7 models specifically require temperature 1.0 for thinking processing
      finalOptions.temperature = DEFAULT_TEMPERATURE;
    }

    // 最終確認: parallel_tool_callsがオブジェクトに含まれていないことを確認
    if ('parallel_tool_calls' in finalOptions) {
      console.warn("警告: parallel_tool_callsパラメータが検出されました。Databricksではサポートされていないため削除します。");
      delete finalOptions.parallel_tool_calls;
    }
    
    // 冗長プロパティのチェック - undefinedの値を持つプロパティを削除
    Object.keys(finalOptions).forEach(key => {
      if (finalOptions[key] === undefined) {
        delete finalOptions[key];
      }
    });

    return finalOptions;
  }

  /**
   * Initialize streaming state for processing streamed responses
   * @returns Initial state object with default values
   */
  static initializeStreamingState(): {
    currentMessage: {
      role: string;
      content: string;
    };
    toolCalls: ToolCall[];
    currentToolCall: ToolCall | null;
    currentToolCallIndex: number | null;
    jsonBuffer: string;
    isBufferingJson: boolean;
    thinkingChunkCount: number;
  } {
    return {
      currentMessage: { role: "assistant", content: "" },
      toolCalls: [],
      currentToolCall: null,
      currentToolCallIndex: null,
      jsonBuffer: "",
      isBufferingJson: false,
      thinkingChunkCount: 0
    };
  }
  
  /**
   * Determine if text represents the end of a text block
   * Used to decide when to yield messages during streaming
   * @param text Text to check
   * @returns Whether the text is at a natural breaking point
   */
  static isTextBlockEnd(text: string): boolean {
    if (!text) return false;
    
    return (
      text.endsWith(".") || 
      text.endsWith("。") || 
      text.endsWith("!") || 
      text.endsWith("！") || 
      text.endsWith("?") || 
      text.endsWith("？") || 
      text.endsWith("\n") ||
      // Consider paragraphs breaks (2+ newlines) as block endings
      text.includes("\n\n")
    );
  }
  
  /**
   * Process non-streaming response from Databricks API
   * @param response HTTP response object
   * @returns Processed ChatMessage
   */
  static async processNonStreamingResponse(
    response: Response
  ): Promise<ChatMessage> {
    try {
      const data = await response.json();
      
      // Log response details for debugging
      console.log("Non-streaming response status:", response.status);
      console.log("Non-streaming response headers:", 
        Object.fromEntries([...response.headers.entries()]));
      
      // Check for expected OpenAI-style response structure
      if (data && data.choices && data.choices.length > 0) {
        const messageContent = data.choices[0].message?.content || "";
        return { role: "assistant", content: messageContent };
      }
      
      // Try to extract content from alternative response structure
      if (data && typeof data.content === 'string') {
        return { role: "assistant", content: data.content };
      }
      
      // If structure doesn't match expected patterns, safely stringify the entire data
      return { 
        role: "assistant", 
        content: safeStringify(data, "Failed to parse response")
      };
    } catch (error) {
      console.error("Error processing non-streaming response:", getErrorMessage(error));
      
      try {
        // Try to get text response in case it's not JSON
        const textResponse = await response.text();
        return {
          role: "assistant",
          content: textResponse || `Error processing response: ${getErrorMessage(error)}`
        };
      } catch (textError) {
        // Return error message in response if even text reading fails
        return {
          role: "assistant",
          content: `Error processing response: ${getErrorMessage(error)}`
        };
      }
    }
  }

  /**
   * Process content delta from streaming response
   * Uses common utility pattern for all content handling
   * @param newContent New content to append
   * @param currentMessage Current message to update
   * @returns Updated message content as string
   */
  static processContentDelta(newContent: string, currentMessage: ChatMessage): string {
    // Safely extract current content as string, handling both string and array types
    const currentContent = extractContentAsString(currentMessage.content);
    // Append new content to current content
    return currentContent + (newContent || "");
  }
  
  /**
   * Validate if a message contains valid JSON
   * @param message Message to check
   * @returns Whether the message contains valid JSON
   */
  static isValidJsonMessage(message: string): boolean {
    // Null/empty check
    if (!message || typeof message !== 'string') {
      return false;
    }
    
    // First check for JSON start indicators to avoid unnecessary processing
    const trimmedMessage = message.trim();
    if (!trimmedMessage.startsWith('{') && !trimmedMessage.startsWith('[')) {
      return false;
    }
    
    // Use common utility for JSON validation
    return isValidJson(message);
  }
  
  /**
   * Process tool arguments to ensure they are valid JSON
   * Uses common utility for repairing tool arguments
   * @param args Raw tool argument string
   * @returns Repaired tool argument string
   */
  static processToolArguments(args: string): string {
    if (!args || typeof args !== 'string') {
      return "{}";
    }
    
    try {
      // Use common utility for repairing tool arguments
      return repairToolArguments(args);
    } catch (error) {
      console.warn(`Tool arguments repair failed: ${getErrorMessage(error)}`);
      // Return original args if repair fails
      return args;
    }
  }
  
  /**
   * Preprocess tool choice to ensure compatibility with Databricks
   * @param toolChoice Tool choice from options
   * @returns Databricks-compatible tool choice object
   */
  static preprocessToolChoice(toolChoice: any): any {
    if (!toolChoice) {
      return undefined;
    }
    
    // Ensure it has the expected structure
    if (toolChoice.function && toolChoice.function.name) {
      return {
        type: "function",
        function: {
          name: toolChoice.function.name
        }
      };
    }
    
    // Return undefined if it doesn't have required properties
    return undefined;
  }
  
  /**
   * Log request body for debugging (truncated for readability)
   * @param requestBody Request body to log
   */
  static logRequestBody(requestBody: any): void {
    try {
      // リクエストボディが存在しない場合の対策
      if (!requestBody) {
        console.log('Request body: Empty or undefined');
        return;
      }
    
      // メッセージ配列の安全な取得
      const messages = Array.isArray(requestBody.messages) ? requestBody.messages : [];
    
      // 各メッセージを安全に処理
      const truncatedMessages = messages.map((msg: any) => {
        // msgがオブジェクトでない場合の対策
        if (!msg || typeof msg !== 'object') {
          return { role: 'unknown', content: safeStringify(msg, '<invalid message>') };
        }
        
        // contentの安全な取得と処理
        let content = msg.content;
        try {
          // extractContentAsStringを使用して型安全に処理
          if (content !== undefined && typeof content !== 'string') {
            content = extractContentAsString(content);
          } else if (content === undefined) {
            content = '<no content>';
          }
          
          // 長すぎるコンテンツの切り詰め
          if (typeof content === 'string' && content.length > 100) {
            return {
              ...msg,
              content: content.substring(0, 100) + '...'
            };
          }
        } catch (e) {
          // contentの処理中にエラーが発生した場合
          content = `<content processing error: ${getErrorMessage(e)}>`;
        }
        
        return {
          ...msg,
          content
        };
      });
      
      // ツール情報の安全な取得と処理
      let toolsInfo = [];
      if (requestBody.tools && Array.isArray(requestBody.tools)) {
        toolsInfo = requestBody.tools.map((tool: any, index: number) => {
          if (!tool || typeof tool !== 'object') {
            return { index, name: '<invalid tool>' };
          }
          
          const functionObj = tool.function || {};
          return {
            index,
            type: tool.type || 'unknown',
            name: functionObj.name || '<unnamed>',
            hasParameters: !!functionObj.parameters
          };
        });
      }
      
      // parallel_tool_callsがあるかチェック
      const hasParallelToolCalls = 'parallel_tool_calls' in requestBody;
      if (hasParallelToolCalls) {
        console.warn('警告: リクエストボディにparallel_tool_callsパラメータが含まれています。これは問題の原因になる可能性があります。');
      }
      
      // 切り詰めたリクエストボディの作成
      const truncatedBody = {
        model: requestBody.model || '<no model>',
        max_tokens: requestBody.max_tokens,
        temperature: requestBody.temperature,
        messages_count: messages.length,
        messages: truncatedMessages,
        tools_count: toolsInfo.length,
        tools_summary: toolsInfo,
        has_parallel_tool_calls: hasParallelToolCalls // 問題の検出に役立つフラグ
      };
      
      // 切り詰めたボディをJSONとして出力（[object Object]の表示を防止）
      console.log('Request body (truncated):', safeStringify(truncatedBody, "{}")); 
    } catch (error) {
      // 処理中にエラーが発生した場合のフォールバック
      console.error(`リクエストボディのログ出力中にエラー: ${getErrorMessage(error)}`);
      console.log('Original request body:', safeStringify(requestBody, '<invalid>'));
    }
  }
}