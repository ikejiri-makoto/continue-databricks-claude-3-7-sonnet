import { ChatMessage } from "../../../index.js";
import { safeStringify } from "../../utils/json.js";
import { extractContentAsString, extractQueryContext } from "../../utils/messageUtils.js";

/**
 * Utility functions for message handling (moved from core/llm/messages.ts)
 */

export function messageHasToolCalls(msg: ChatMessage): boolean {
  return msg.role === "assistant" && !!msg.toolCalls;
}

export function messageIsEmpty(message: ChatMessage): boolean {
  if (typeof message.content === "string") {
    return message.content.trim() === "";
  }
  if (Array.isArray(message.content)) {
    return message.content.every(
      (item) => item.type === "text" && item.text?.trim() === "",
    );
  }
  return false;
}

export function chatMessageIsEmpty(message: ChatMessage): boolean {
  switch (message.role) {
    case "system":
    case "user":
      return (
        typeof message.content === "string" && message.content.trim() === ""
      );
    case "assistant":
      return (
        typeof message.content === "string" &&
        message.content.trim() === "" &&
        !message.toolCalls
      );
    case "thinking":
    case "tool":
      return false;
  }
}

export function isUserOrToolMsg(msg: ChatMessage | undefined): boolean {
  if (!msg) {
    return false;
  }
  return msg.role === "user" || msg.role === "tool";
}

export function isToolMessageForId(
  msg: ChatMessage | undefined,
  toolCallId: string,
): boolean {
  return !!msg && msg.role === "tool" && msg.toolCallId === toolCallId;
}

export function messageHasToolCallId(
  msg: ChatMessage | undefined,
  toolCallId: string,
): boolean {
  return (
    !!msg &&
    msg.role === "assistant" &&
    !!msg.toolCalls?.find((call) => call.id === toolCallId)
  );
}

/**
 * メッセージ処理ユーティリティークラス
 * Continueのメッセージ形式とDatabricks API形式の間の変換を処理
 */
export class MessageProcessor {
  /**
   * 会話履歴内の既存メッセージをサニタイズする
   * 特に過去のアシスタントメッセージとthinkingメッセージを適切な形式に変換
   * @param messages 元のメッセージ配列
   * @returns サニタイズされたメッセージ配列
   */
  static sanitizeMessages(messages: ChatMessage[]): ChatMessage[] {
    return messages.map(message => {
      // アシスタントメッセージの処理
      if (message.role === "assistant") {
        const contentStr = extractContentAsString(message.content);
        
        // ツール呼び出しがある場合は保持
        if (messageHasToolCalls(message)) {
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
      
      // thinking メッセージはそのまま保持
      if (message.role === "thinking") {
        const thinkingContent = typeof message.content === "string" 
          ? message.content 
          : safeStringify(message.content, "");
        
        return {
          role: "thinking",
          content: thinkingContent,
          signature: message.signature
        };
      }
      
      // ツール結果メッセージ
      if (message.role === "tool") {
        return {
          role: "tool",
          content: typeof message.content === "string" ? message.content : extractContentAsString(message.content),
          toolCallId: message.toolCallId
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
   * 空のメッセージにスペースを追加（一部のプロバイダーは空のメッセージをサポートしていないため）
   * @param messages メッセージ配列
   * @returns 処理されたメッセージ配列
   */
  static addSpaceToEmptyMessages(messages: ChatMessage[]): ChatMessage[] {
    return messages.map((message) => {
      if (messageIsEmpty(message)) {
        // 内容を変更する前にメッセージをクローン
        const updatedMessage = { ...message };
        updatedMessage.content = " ";
        return updatedMessage;
      }
      return message;
    });
  }

  /**
   * 連続した同じロールのメッセージを結合する
   * @param messages メッセージ配列
   * @returns 平坦化されたメッセージ配列
   */
  static flattenMessages(msgs: ChatMessage[]): ChatMessage[] {
    const flattened: ChatMessage[] = [];

    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i];

      if (
        flattened.length > 0 &&
        flattened[flattened.length - 1].role === msg.role &&
        !messageHasToolCalls(msg) &&
        !messageHasToolCalls(flattened[flattened.length - 1])
      ) {
        // 同じロールの連続メッセージを結合
        const lastMsg = flattened[flattened.length - 1];
        const content = typeof lastMsg.content === "string" ? 
          lastMsg.content : extractContentAsString(lastMsg.content);
        const newContent = typeof msg.content === "string" ? 
          msg.content : extractContentAsString(msg.content);
          
        flattened[flattened.length - 1].content = `${content}\n\n${newContent || ""}`;
      } else {
        flattened.push({ ...msg });
      }
    }

    return flattened;
  }

  /**
   * ChatMessageをOpenAI形式に変換
   * @param messages 元のメッセージ配列
   * @param preprocessedMessages 前処理済みのメッセージ配列
   * @returns OpenAI形式に変換されたメッセージ配列
   */
  static convertToOpenAIFormat(messages: ChatMessage[], preprocessedMessages: ChatMessage[]): any[] {
    // システムメッセージを抽出
    const systemMessage = preprocessedMessages.find(m => m.role === "system");
    let systemContent = "";
    
    if (systemMessage) {
      if (typeof systemMessage.content === "string") {
        systemContent = systemMessage.content;
      } else if (Array.isArray(systemMessage.content)) {
        const content = systemMessage.content as any[];
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
    
    // thinkingメッセージを抽出（存在する場合）
    const thinkingMessages = preprocessedMessages.filter(m => m.role === "thinking");
    const hasThinkingContent = thinkingMessages.length > 0;
    let latestThinkingContent = "";
    
    if (hasThinkingContent) {
      // 最新のthinkingメッセージを使用
      const lastThinking = thinkingMessages[thinkingMessages.length - 1];
      latestThinkingContent = typeof lastThinking.content === "string" 
        ? lastThinking.content 
        : safeStringify(lastThinking.content, "");
    }
    
    // メッセージをOpenAI形式に変換（システムメッセージを除く）
    const convertedMessages: any[] = preprocessedMessages
      .filter(m => m.role !== "system" && m.role !== "thinking")
      .map(message => {
        // ツール結果メッセージ
        if (message.role === "tool") {
          return {
            role: "tool",
            content: typeof message.content === "string" ? message.content : extractContentAsString(message.content),
            tool_call_id: message.toolCallId || ""
          };
        }
        
        // アシスタントメッセージの処理
        if (message.role === "assistant") {
          const contentStr = typeof message.content === "string" 
            ? message.content 
            : safeStringify(message.content, "");
            
          // ツール呼び出しを含むアシスタントメッセージの特別処理
          if (messageHasToolCalls(message)) {
            const msgAny = message as any;
            
            return {
              role: "assistant",
              content: contentStr, // 単一の文字列として送信
              tool_calls: msgAny.toolCalls.map((toolCall: any) => {
                // 特に検索ツールの場合には、queryパラメータが確実に存在するようにする
                let args = toolCall.function?.arguments || "{}";
                let argsObj = {};
                
                try {
                  if (typeof args === "string") {
                    argsObj = JSON.parse(args);
                  } else {
                    argsObj = args;
                  }
                  
                  // webツール検索の場合、queryパラメータが必要
                  if (toolCall.function?.name?.includes("search") && !argsObj.hasOwnProperty("query")) {
                    // ユーザーメッセージから適切なクエリを抽出
                    const queryContext = extractQueryContext(preprocessedMessages);
                    argsObj = { query: queryContext };
                    args = JSON.stringify(argsObj);
                  }
                } catch (e) {
                  console.warn(`ツール引数の解析エラー: ${e}, 引数: ${args}`);
                  // 整形できない場合は、基本的なクエリパラメータを含むJSONを使用
                  if (toolCall.function?.name?.includes("search")) {
                    // ユーザーメッセージから適切なクエリを抽出
                    const queryContext = extractQueryContext(preprocessedMessages);
                    args = JSON.stringify({ query: queryContext });
                  } else {
                    args = "{}";
                  }
                }
                
                return {
                  id: toolCall.id || "",
                  type: "function",
                  function: {
                    name: toolCall.function?.name || "",
                    arguments: args
                  }
                };
              })
            };
          }
          
          // 通常のアシスタントメッセージ
          return {
            role: "assistant",
            content: contentStr
          };
        }
        
        // ユーザーメッセージなど、その他のメッセージタイプ
        if (typeof message.content === "string") {
          return {
            role: message.role,
            content: message.content
          };
        }
        
        // 複合コンテンツのメッセージ（画像を含む）
        if (Array.isArray(message.content)) {
          const content = message.content as any[];
          const formattedContent = content.map(part => {
            if (part && part.type === "text") {
              return {
                type: "text",
                text: part.text || ""
              };
            } else if (part && part.type === "image") {
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
        
        // フォールバック：コンテンツが解析できない場合は空文字列
        return {
          role: message.role,
          content: ""
        };
      });
    
    // システムメッセージがあれば先頭に追加
    if (systemContent) {
      convertedMessages.unshift({
        role: "system",
        content: systemContent
      } as any);
    }
    
    return convertedMessages;
  }
}