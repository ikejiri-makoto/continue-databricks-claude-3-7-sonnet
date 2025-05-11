import { ChatMessage } from "../../../index.js";
import { safeStringify, safeJsonParse } from "../../utils/json.js";
import { 
  extractContentAsString, 
  extractQueryContext, 
  hasToolResultBlocksAtBeginning, 
  messageHasToolCalls as utilsMessageHasToolCalls
} from "../../utils/messageUtils.js";
import { DatabricksChatMessage } from "./types/types.js";

/**
 * Databricks Claude用のメッセージ処理ユーティリティークラス
 * Continueのメッセージ形式とDatabricks API形式の間の変換を処理
 */
export class MessageProcessor {
  /**
   * 会話履歴内の既存メッセージをサニタイズする
   * 特に過去のアシスタントメッセージとthinkingメッセージを適切な形式に変換
   * 
   * @param messages 元のメッセージ配列
   * @returns サニタイズされたメッセージ配列
   */
  static sanitizeMessages(messages: ChatMessage[]): ChatMessage[] {
    return messages.map(message => {
      // アシスタントメッセージの処理
      if (message.role === "assistant") {
        return this.sanitizeAssistantMessage(message);
      }
      
      // thinking メッセージはそのまま保持
      if (message.role === "thinking") {
        // message を DatabricksChatMessage として扱うが、型安全のため変換せずにアクセス
        return {
          role: "thinking",
          content: typeof message.content === "string" 
            ? message.content 
            : safeStringify(message.content, ""),
          signature: (message as any).signature
        };
      }
      
      // ツール結果メッセージ
      if (message.role === "tool") {
        // message を DatabricksChatMessage として扱うが、型安全のため変換せずにアクセス
        return {
          role: "tool",
          content: typeof message.content === "string" 
            ? message.content 
            : extractContentAsString(message.content),
          toolCallId: (message as any).toolCallId || ""
        };
      }
      
      // その他のメッセージ（userなど）
      return {
        role: message.role,
        content: typeof message.content === "string" ? message.content : extractContentAsString(message.content),
      };
    });
  }

  /**
   * アシスタントメッセージをサニタイズする
   * 
   * @param message アシスタントメッセージ
   * @returns サニタイズされたアシスタントメッセージ
   */
  private static sanitizeAssistantMessage(message: ChatMessage): ChatMessage {
    const contentStr = extractContentAsString(message.content);
    
    // ツール呼び出しがある場合は保持
    if (this.messageHasToolCalls(message)) {
      return {
        role: "assistant",
        content: contentStr,
        toolCalls: (message as any).toolCalls
      };
    }
    
    // 通常のアシスタントメッセージ
    return {
      role: "assistant",
      content: contentStr
    };
  }

  /**
   * システムメッセージを抽出して処理する
   * 
   * @param messages 元のメッセージ配列
   * @returns 処理されたシステムメッセージ内容
   */
  static processSystemMessage(messages: ChatMessage[]): string {
    // システムメッセージを抽出
    const systemMessage = messages.find(m => m.role === "system");
    if (!systemMessage) {
      // 日本語環境チェック
      if (this.containsJapaneseContent(messages)) {
        return "水平思考で考えて！\nステップバイステップで考えて！\n日本語で回答してください。";
      }
      return "";
    }
    
    // システムメッセージのコンテンツを抽出
    let systemContent = this.extractSystemMessageContent(systemMessage);
    
    // 水平思考とステップバイステップの指示を追加（Claude 3.7 Sonnetに適した指示）
    if (!systemContent.includes("水平思考") && !systemContent.includes("ステップバイステップ")) {
      systemContent += "\n\n水平思考で考えて！\nステップバイステップで考えて！";
    }
    
    // 日本語処理に関する指示があるかチェック
    if (this.containsJapaneseContent(messages) && !systemContent.includes("日本語")) {
      systemContent += "\n\n日本語で回答してください。";
    }
    
    return systemContent;
  }

  /**
   * ChatMessageをOpenAI形式に変換
   * 
   * @param messages 元のメッセージ配列
   * @param preprocessedMessages 前処理済みのメッセージ配列
   * @returns OpenAI形式に変換されたメッセージ配列
   */
  static convertToOpenAIFormat(messages: ChatMessage[], preprocessedMessages: ChatMessage[]): any[] {
    // メッセージをOpenAI形式に変換（システムメッセージとthinkingメッセージを除く）
    const convertedMessages: any[] = preprocessedMessages
      .filter(m => m.role !== "system" && m.role !== "thinking")
      .map(message => this.convertMessageToOpenAIFormat(message, preprocessedMessages));
    
    return convertedMessages;
  }

  /**
   * システムメッセージのコンテンツを抽出する
   * 
   * @param systemMessage システムメッセージ
   * @returns システムメッセージのコンテンツ文字列
   */
  private static extractSystemMessageContent(systemMessage: ChatMessage): string {
    if (typeof systemMessage.content === "string") {
      return systemMessage.content;
    } 
    
    if (Array.isArray(systemMessage.content)) {
      const content = systemMessage.content as any[];
      const textParts = content
        .filter(part => part && part.type === "text")
        .map(part => part.text || "");
      return textParts.join("\n");
    }
    
    return "";
  }

  /**
   * メッセージに日本語コンテンツが含まれているかチェック
   * 
   * @param messages メッセージ配列
   * @returns 日本語が含まれる場合はtrue
   */
  private static containsJapaneseContent(messages: ChatMessage[]): boolean {
    // 最新のユーザーメッセージを探す
    const latestUserMessage = [...messages]
      .reverse()
      .find(m => m.role === "user");
    
    if (!latestUserMessage) return false;
    
    const content = extractContentAsString(latestUserMessage.content);
    
    // 日本語文字の正規表現パターン
    const japanesePattern = /[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FAF]/;
    return japanesePattern.test(content);
  }

  /**
   * 単一のメッセージをOpenAI形式に変換
   * 
   * @param message 変換するメッセージ
   * @param allMessages すべてのメッセージ配列（コンテキスト用）
   * @returns OpenAI形式に変換されたメッセージ
   */
  private static convertMessageToOpenAIFormat(message: ChatMessage, allMessages: ChatMessage[]): any {
    // メッセージタイプに基づいて適切な変換メソッドを呼び出す
    switch (message.role) {
      case "tool":
        return this.convertToolMessageToOpenAIFormat(message);
      case "assistant":
        return this.convertAssistantMessageToOpenAIFormat(message, allMessages);
      default:
        return this.convertUserMessageToOpenAIFormat(message);
    }
  }

  /**
   * ツールメッセージをOpenAI形式に変換
   * 
   * @param message ツールメッセージ
   * @returns OpenAI形式に変換されたツールメッセージ
   */
  private static convertToolMessageToOpenAIFormat(message: ChatMessage): any {
    // message から toolCallId を安全に取得
    const toolCallId = (message as any).toolCallId || "";
    
    return {
      role: "tool",
      content: typeof message.content === "string" ? message.content : extractContentAsString(message.content),
      tool_call_id: toolCallId
    };
  }

  /**
   * アシスタントメッセージをOpenAI形式に変換
   * 
   * @param message アシスタントメッセージ
   * @param allMessages すべてのメッセージ配列（コンテキスト用）
   * @returns OpenAI形式に変換されたアシスタントメッセージ
   */
  private static convertAssistantMessageToOpenAIFormat(message: ChatMessage, allMessages: ChatMessage[]): any {
    const contentStr = typeof message.content === "string" 
      ? message.content 
      : safeStringify(message.content, "");
      
    // ツール呼び出しを含むアシスタントメッセージの特別処理
    if (this.messageHasToolCalls(message)) {
      const msgAny = message as any;
      
      return {
        role: "assistant",
        content: contentStr, // 単一の文字列として送信
        tool_calls: msgAny.toolCalls.map((toolCall: any) => 
          this.convertToolCallToOpenAIFormat(toolCall, allMessages)
        )
      };
    }
    
    // 通常のアシスタントメッセージ
    return {
      role: "assistant",
      content: contentStr
    };
  }

  /**
   * ユーザーメッセージをOpenAI形式に変換
   * 
   * @param message ユーザーメッセージ
   * @returns OpenAI形式に変換されたユーザーメッセージ
   */
  private static convertUserMessageToOpenAIFormat(message: ChatMessage): any {
    // 複合コンテンツのメッセージ（画像を含む）
    if (Array.isArray(message.content)) {
      return {
        role: message.role,
        content: this.convertComplexContentToOpenAIFormat(message.content)
      };
    }
    
    // 通常のテキストメッセージ
    if (typeof message.content === "string") {
      return {
        role: message.role,
        content: message.content
      };
    }
    
    // フォールバック：コンテンツが解析できない場合は空文字列
    return {
      role: message.role,
      content: ""
    };
  }

  /**
   * ツール呼び出しをOpenAI形式に変換
   * 検索ツールの場合は特別処理を行う
   * 
   * @param toolCall ツール呼び出し
   * @param allMessages すべてのメッセージ配列（コンテキスト用）
   * @returns OpenAI形式に変換されたツール呼び出し
   */
  private static convertToolCallToOpenAIFormat(toolCall: any, allMessages: ChatMessage[]): any {
    // 特に検索ツールの場合には、queryパラメータが確実に存在するようにする
    let args = toolCall.function?.arguments || "{}";
    let argsObj = {};
    
    try {
      if (typeof args === "string") {
        argsObj = safeJsonParse(args, {});
      } else {
        argsObj = args;
      }
      
      // webツール検索の場合、queryパラメータが必要
      if (this.isSearchTool(toolCall.function?.name) && !argsObj.hasOwnProperty("query")) {
        // ユーザーメッセージから適切なクエリを抽出
        const queryContext = extractQueryContext(allMessages);
        argsObj = { query: queryContext };
        args = JSON.stringify(argsObj);
      }
    } catch (e) {
      console.warn(`ツール引数の解析エラー: ${e}, 引数: ${args}`);
      // 整形できない場合は、基本的なクエリパラメータを含むJSONを使用
      if (this.isSearchTool(toolCall.function?.name)) {
        // ユーザーメッセージから適切なクエリを抽出
        const queryContext = extractQueryContext(allMessages);
        args = JSON.stringify({ query: queryContext });
      } else {
        args = "{}";
      }
    }
    
    return {
      id: toolCall.id || `call_${Date.now()}`,
      type: "function",
      function: {
        name: toolCall.function?.name || "",
        arguments: args
      }
    };
  }

  /**
   * 検索関連のツールかどうかを判定
   * 
   * @param toolName ツール名
   * @returns 検索ツールの場合はtrue
   */
  private static isSearchTool(toolName?: string): boolean {
    if (!toolName) return false;
    
    const searchTools = [
      'search',
      'web_search',
      'browse',
      'google',
      'bing',
      'search_docs',
      'search_web'
    ];
    
    return searchTools.some(term => toolName.toLowerCase().includes(term));
  }

  /**
   * 複合コンテンツをOpenAI形式に変換
   * 
   * @param content 複合コンテンツ配列
   * @returns OpenAI形式に変換された複合コンテンツ
   */
  private static convertComplexContentToOpenAIFormat(content: any[]): any[] {
    return content.map(part => {
      // テキスト部分の処理
      if (part && part.type === "text") {
        return {
          type: "text",
          text: part.text || ""
        };
      } 
      // 画像部分の処理
      else if (part && part.type === "image") {
        // 画像URLの存在確認
        const imageUrl = part.imageUrl?.url || part.image_url?.url || "";
        
        if (!imageUrl) {
          console.warn("画像URLが見つかりません", part);
          return null; // 無効な画像部分は除外
        }
        
        return {
          type: "image_url",
          image_url: {
            url: imageUrl,
            detail: part.detail || "high"
          }
        };
      }
      return part;
    }).filter(Boolean); // nullの部分を除外
  }

  /**
   * メッセージがツール呼び出しを持っているかチェック
   * 共通ユーティリティを使用
   * 
   * @param message チェックするメッセージ
   * @returns ツール呼び出しを持っている場合はtrue
   */
  static messageHasToolCalls(message: ChatMessage): boolean {
    return utilsMessageHasToolCalls(message);
  }

  /**
   * メッセージが空かどうかをチェック
   * 
   * @param message チェックするメッセージ
   * @returns 空の場合はtrue
   */
  static messageIsEmpty(message: ChatMessage): boolean {
    if (typeof message.content === "string") {
      return message.content.trim() === "";
    }
    
    if (Array.isArray(message.content)) {
      return message.content.every(
        (item) => item.type === "text" && (!item.text || item.text.trim() === "")
      );
    }
    
    return !message.content;
  }

  /**
   * 空のメッセージにスペースを追加（一部のプロバイダーは空のメッセージをサポートしていないため）
   * 
   * @param messages メッセージ配列
   * @returns 処理されたメッセージ配列
   */
  static addSpaceToEmptyMessages(messages: ChatMessage[]): ChatMessage[] {
    return messages.map((message) => {
      if (this.messageIsEmpty(message)) {
        // 内容を変更する前にメッセージをクローン
        const updatedMessage = { ...message };
        updatedMessage.content = " ";
        return updatedMessage;
      }
      return message;
    });
  }
  
  /**
   * ツール呼び出し結果のメッセージを判定
   * 
   * @param message チェックするメッセージ
   * @returns ツール結果メッセージの場合はtrue
   */
  static isToolResultMessage(message: ChatMessage): boolean {
    return hasToolResultBlocksAtBeginning(message);
  }
}