import { ChatMessage, ThinkingChatMessage } from "../../../index.js";
import { safeJsonParse, safeStringify } from "../../utils/json.js";
import {
  extractContentAsString,
  extractQueryContext,
  hasToolResultBlocksAtBeginning,
  messageHasToolCalls as utilsMessageHasToolCalls
} from "../../utils/messageUtils.js";

/**
 * Databricks Claude用のメッセージ処理ユーティリティークラス
 * Continueのメッセージ形式とDatabricks API形式の間の変換を処理
 */
export class MessageProcessor {
  /**
   * 有効なロール値
   * Databricksエンドポイントが受け付けるロールのみを含む
   */
  private static VALID_ROLES = ["system", "user", "assistant", "tool", "function"];

  /**
   * 追加のサポートロール
   * 型チェックでは明示的に除外されるが、特殊処理が必要なロール
   */
  private static SPECIAL_ROLES = ["thinking"];

  /**
   * ロール値が有効かどうかをチェック
   * @param role ロール値
   * @returns 有効な場合true
   */
  static isValidRole(role: string): boolean {
    return this.VALID_ROLES.includes(role);
  }

  /**
   * ロール値が特殊処理が必要なロールかどうかをチェック
   * @param role ロール値
   * @returns 特殊ロールの場合true
   */
  static isSpecialRole(role: string): boolean {
    return this.SPECIAL_ROLES.includes(role);
  }

  /**
   * メッセージが"thinking"ロールを持つかチェックする型ガード関数
   * @param message チェック対象のメッセージ
   * @returns thinkingロールを持つ場合true
   */
  static isThinkingMessage(message: ChatMessage): boolean {
    return (message.role as string) === "thinking";
  }

  /**
   * 会話履歴内の既存メッセージをサニタイズする
   * 特に過去のアシスタントメッセージとthinkingメッセージを適切な形式に変換
   * また、無効なロール値を「assistant」に変換
   * 
   * @param messages 元のメッセージ配列
   * @returns サニタイズされたメッセージ配列
   */
  static sanitizeMessages(messages: ChatMessage[]): ChatMessage[] {
    // 無効なメッセージを削除
    return messages.filter(message => message !== null).map(message => {
      // ロールが有効かどうかをチェック
      if (!this.isValidRole(message.role)) {
        console.warn(`不正なロール値「${message.role}」を検出しました。「assistant」に変換します。`);
        // ロールを"assistant"に変換
        return {
          role: "assistant",
          content: typeof message.content === "string" ? message.content : extractContentAsString(message.content)
        };
      }

      // アシスタントメッセージの処理
      if (message.role === "assistant") {
        return this.sanitizeAssistantMessage(message);
      }
      
      // ツール結果メッセージ
      if (message.role === "tool") {
        const toolCallId = (message as any).toolCallId || "";
        return {
          role: "tool",
          content: typeof message.content === "string" 
            ? message.content 
            : extractContentAsString(message.content),
          toolCallId: toolCallId
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
   * @param options 変換オプション (thinkingEnabledなど)
   * @returns OpenAI形式に変換されたメッセージ配列
   */
  static convertToOpenAIFormat(messages: ChatMessage[], preprocessedMessages: ChatMessage[], options: { thinkingEnabled?: boolean } = {}): any[] {
    // メッセージをOpenAI形式に変換（システムメッセージを除く）
    const convertedMessages: any[] = [];
    
    // チェック: 無効なロールを事前に修正
    const validMessages = preprocessedMessages.filter(m => {
      if (!this.isValidRole(m.role)) {
        console.warn(`OpenAI形式変換: 不正なロール「${m.role}」を検出しました。このメッセージはスキップします。`);
        return false;
      }
      return true;
    });
    
    // 通常のメッセージを配置
    for (const msg of validMessages) {
      convertedMessages.push(this.convertMessageToOpenAIFormat(msg, validMessages, options.thinkingEnabled));
    }
    
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
   * @param thinkingEnabled 思考モードが有効かどうか
   * @returns OpenAI形式に変換されたメッセージ
   */
  private static convertMessageToOpenAIFormat(message: ChatMessage, allMessages: ChatMessage[], thinkingEnabled: boolean = false): any {
    // 最重要: ロールが有効かどうかを確認
    if (!this.isValidRole(message.role)) {
      console.warn(`無効なロール「${message.role}」を「assistant」に変換します`);
      return {
        role: "assistant",
        content: extractContentAsString(message.content)
      };
    }

    // メッセージタイプに基づいて適切な変換メソッドを呼び出す
    switch (message.role) {
      case "tool":
        return this.convertToolMessageToOpenAIFormat(message);
      case "assistant":
        return this.convertAssistantMessageToOpenAIFormat(message, allMessages, thinkingEnabled);
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
   * Databricksエンドポイントの互換性を確保するために単純な形式にする
   * 思考モードが有効な場合は特別な構造を適用
   * 
   * @param message アシスタントメッセージ
   * @param allMessages すべてのメッセージ配列（コンテキスト用）
   * @param thinkingEnabled 思考モードが有効かどうか
   * @returns OpenAI形式に変換されたアシスタントメッセージ
   */
  static convertAssistantMessageToOpenAIFormat(message: ChatMessage, allMessages: ChatMessage[], thinkingEnabled: boolean = false): any {
    // ツール呼び出しを含むアシスタントメッセージの特別処理
    if (this.messageHasToolCalls(message)) {
      const msgAny = message as any;
      
      // 単純な形式でアシスタントメッセージを作成（Databricksとの互換性のため）
      return {
        role: "assistant",
        content: extractContentAsString(message.content),
        tool_calls: msgAny.toolCalls.map((toolCall: any) => 
          this.convertToolCallToOpenAIFormat(toolCall, allMessages)
        )
      };
    }
    
    // 通常のアシスタントメッセージ - Databricksとの互換性を確保するために単純な形式で返す
    return {
      role: "assistant",
      content: extractContentAsString(message.content)
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

  /**
   * メッセージ配列内の無効なロールを持つメッセージを検出して修正
   * option.preserveThinking = trueの場合、thinkingロールをsystemロールに変換
   * falseまたは未指定の場合は完全に除外
   * その他の無効なロールはassistantに変換する
   * 
   * @param messages 入力メッセージ配列
   * @param options オプション（preserveThinking: thinkingロールをsystemに変換するかどうか）
   * @returns 無効なロールが修正されたメッセージ配列
   */
  static validateAndFixMessageRoles(messages: ChatMessage[], options: { preserveThinking?: boolean } = {}): ChatMessage[] {
    // 処理前のメッセージロールをログ出力
    const rolesBefore = messages.map(m => m.role);
    console.log(`メッセージ処理前のロール: ${safeStringify(rolesBefore, "[]")}`);
    
    const invalidRoles: string[] = [];
    let thinkingMessagesCount = 0;
    
    // 変換または除外したメッセージを追跡するための配列
    const resultMessages: ChatMessage[] = [];
    
    for (const message of messages) {
      // thinkingロールを持つメッセージの処理 - 型安全なチェック
      if (this.isThinkingMessage(message)) {
        thinkingMessagesCount++;
        
        // thinkingロールを保持してsystemロールに変換するかどうか
        if (options.preserveThinking === true) {
          // thinkingロールをsystemロールに変換
          resultMessages.push({
            ...message,
            role: "system" as const,  // 明示的なリテラル型指定
            content: `Thinking process: ${extractContentAsString(message.content)}`
          });
        }
        // preserveThinkingがfalseまたは未指定の場合はスキップ（除外）
        continue;
      }
      
      // 有効なロールかチェック - 型安全な方法でチェック
      if (!this.isValidRole(message.role)) {
        // 無効なロールをリストに追加（thinkingは別途処理済み）
        if (!invalidRoles.includes(message.role) && (message.role as string) !== "thinking") {
          invalidRoles.push(message.role);
        }
        
        // 無効なロールを「assistant」に変換
        resultMessages.push({
          ...message,
          role: "assistant" as const  // 明示的なリテラル型指定
        });
      } else {
        // 有効なロールはそのまま追加
        resultMessages.push(message);
      }
    }
    
    // 処理結果をログ出力
    if (thinkingMessagesCount > 0) {
      if (options.preserveThinking) {
        console.log(`${thinkingMessagesCount}件のthinkingロールメッセージをsystemロールに変換しました`);
      } else {
        console.log(`${thinkingMessagesCount}件のthinkingロールメッセージを除外しました`);
      }
    }
    
    // 無効なロールがあれば警告ログを出力
    if (invalidRoles.length > 0) {
      console.warn(`無効なロールを検出し修正しました: ${invalidRoles.join(', ')} -> "assistant"`);
    }
    
    // 処理後のメッセージロールをログ出力
    const rolesAfter = resultMessages.map(m => m.role);
    console.log(`メッセージ処理後のロール: ${safeStringify(rolesAfter, "[]")}`);
    
    // 型アサーションを追加して返す
    return resultMessages as ChatMessage[];
  }

  /**
   * DatabricksエンドポイントのAPI要件に合わせてメッセージを準備
   * preserveThinking = trueの場合、thinkingロールをsystemロールに変換
   * falseまたは未指定の場合は完全に除外
   * 
   * @param messages 入力メッセージ配列
   * @param options オプション（preserveThinking: thinkingロールをsystemに変換するかどうか）
   * @returns 準備済みメッセージ配列
   */
  static prepareMessagesForDatabricks(messages: ChatMessage[], options: { preserveThinking?: boolean } = {}): any[] {
    // まずthinkingロールを持つメッセージを処理（変換または除外）し、その他の無効なロールを修正
    const validMessages = this.validateAndFixMessageRoles(messages, options);
    
    // ツール呼び出しとツール結果の対応関係を強制する
    const validatedMessages = this.validateToolCallsAndResults(validMessages);
    
    // 標準化されたメッセージ形式に変換
    return validatedMessages.map(message => {
      const content = extractContentAsString(message.content);
      
      // 基本メッセージ構造
      const formattedMessage: any = {
        role: message.role,
        content: content
      };
      
      // toolメッセージの場合、tool_call_idを追加
      if (message.role === "tool" && (message as any).toolCallId) {
        formattedMessage.tool_call_id = (message as any).toolCallId;
      }
      
      return formattedMessage;
    });
  }

  /**
   * メッセージ配列を検証し、ツール呼び出しメッセージの後に対応するツール結果メッセージが存在することを確認する
   * 対応関係が不正な場合は、ツール結果メッセージをスキップする
   * 
   * @param messages 検証対象のメッセージ配列
   * @returns 検証済みのメッセージ配列
   */
  static validateToolCallsAndResults(messages: ChatMessage[]): ChatMessage[] {
    const result: ChatMessage[] = [];
    let toolCallsById: Record<string, boolean> = {};
    
    // まず、すべてのツール呼び出しを収集
    for (const message of messages) {
      // ツール呼び出しを持つメッセージを処理
      if (message.role === "assistant" && this.messageHasToolCalls(message)) {
        const toolCalls = (message as any).toolCalls || [];
        
        // 各ツール呼び出しIDを登録
        for (const toolCall of toolCalls) {
          if (toolCall.id) {
            toolCallsById[toolCall.id] = true;
          }
        }
      }
      
      // メッセージを結果配列に追加
      result.push(message);
    }
    
    // 対応するツール呼び出しのないツール結果メッセージをフィルタリング
    const filteredMessages = result.filter(message => {
      // ツール結果メッセージの場合、対応するツール呼び出しが存在するか確認
      if (message.role === "tool") {
        const toolCallId = (message as any).toolCallId;
        
        // 対応するツール呼び出しがない場合はスキップ
        if (!toolCallId || !toolCallsById[toolCallId]) {
          console.warn(`対応するツール呼び出しが見つからないため、ツール結果メッセージをスキップします: ${toolCallId}`);
          return false;
        }
      }
      
      return true;
    });
    
    return filteredMessages;
  }
}