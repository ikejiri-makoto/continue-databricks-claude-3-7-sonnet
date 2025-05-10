import { ChatMessage } from "../../../index.js";
import { ToolCall, ToolResultMessage } from "./types.js";
import { extractContentAsString } from "../../utils/messageUtils.js";
import { hasToolResultBlocksAtBeginning } from "../../utils/messageUtils.js";
import { isSearchTool, processSearchToolArguments, formatToolResultsContent } from "../../utils/toolUtils.js";
import { doesModelSupportTools } from "../../utils/toolUtils.js";

/**
 * ツール呼び出し処理クラス
 * Databricks上のClaude 3.7 Sonnetからのツール呼び出しを処理するメソッドを提供
 */
export class ToolCallProcessor {
  /**
   * ツール呼び出しがあるメッセージの後に、対応するツール結果を含むメッセージが
   * 必ず存在するようにする前処理を行う
   * @param messages メッセージ配列
   * @returns 前処理済みのメッセージ配列
   */
  static preprocessToolCallsAndResults(messages: ChatMessage[]): ChatMessage[] {
    const processedMessages: ChatMessage[] = [];
    let previousHadToolCalls = false;
    let previousToolCalls: any[] = [];

    for (let i = 0; i < messages.length; i++) {
      const currentMessage = messages[i];
      
      // 前のメッセージがツール呼び出しを含み、現在のメッセージがアシスタントからのものである場合
      if (previousHadToolCalls && currentMessage.role === 'assistant') {
        // 現在のメッセージがツール結果から始まっているか確認
        const hasToolResultsAtBeginning = hasToolResultBlocksAtBeginning(currentMessage);
        
        if (!hasToolResultsAtBeginning) {
          // ツール結果を探す
          const toolResults = this.findToolResultsForCalls(previousToolCalls, messages.slice(i));
          
          if (toolResults.length > 0) {
            // ツール結果をメッセージの先頭に挿入（共通ユーティリティを使用）
            const toolResultsContent = formatToolResultsContent(toolResults);
            
            // 結果を含む新しいメッセージを作成
            const newMessage = {
              ...currentMessage,
              content: toolResultsContent + (currentMessage.content || '')
            };
            
            processedMessages.push(newMessage);
            previousHadToolCalls = false;
            previousToolCalls = [];
            continue;
          }
          
          // ツール結果が見つからない場合、ダミーのツール結果を作成
          const dummyToolResults = this.createDummyToolResults(previousToolCalls);
          const toolResultsContent = formatToolResultsContent(dummyToolResults);
          
          // 結果を含む新しいメッセージを作成
          const newMessage = {
            ...currentMessage,
            content: toolResultsContent + (currentMessage.content || '')
          };
          
          processedMessages.push(newMessage);
          previousHadToolCalls = false;
          previousToolCalls = [];
          continue;
        }
      }
      
      // 現在のメッセージがツール呼び出しを含むか確認
      // any型を使用してTypeScriptの型チェックをバイパス
      const msgAny = currentMessage as any;
      previousHadToolCalls = !!(currentMessage.role === 'assistant' && 
                            msgAny.toolCalls && 
                            msgAny.toolCalls.length > 0);
      
      // ツール呼び出しがある場合は保存
      if (previousHadToolCalls && msgAny.toolCalls) {
        previousToolCalls = [...msgAny.toolCalls];
      } else {
        previousToolCalls = [];
      }
      
      // 通常のメッセージ処理
      processedMessages.push(currentMessage);
    }
    
    return processedMessages;
  }

  /**
   * ツール呼び出しに対応するツール結果をメッセージ群から探す
   * @param toolCalls ツール呼び出し配列
   * @param messages 検索対象のメッセージ配列
   * @returns 見つかったツール結果の配列
   */
  static findToolResultsForCalls(toolCalls: any[], messages: ChatMessage[]): ToolResultMessage[] {
    const results: ToolResultMessage[] = [];
    
    // 各ツール呼び出しに対して
    for (const toolCall of toolCalls) {
      let found = false;
      
      // メッセージを検索してツール結果を見つける
      for (const message of messages) {
        if (message.role === 'tool' && message.toolCallId === toolCall.id) {
          results.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: typeof message.content === 'string' ? message.content : extractContentAsString(message.content)
          });
          found = true;
          break;
        }
      }
      
      // 結果が見つからなかった場合はダミーの結果を作成
      if (!found) {
        results.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: `Tool execution result not found`
        });
      }
    }
    
    return results;
  }

  /**
   * ダミーのツール結果を作成
   * @param toolCalls ツール呼び出し配列
   * @returns ダミーのツール結果配列
   */
  static createDummyToolResults(toolCalls: any[]): ToolResultMessage[] {
    return toolCalls.map(toolCall => ({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: `Tool execution pending...`
    }));
  }

  /**
   * 指定されたモデルがツールをサポートしているか確認
   * @param model モデル名
   * @returns サポートしている場合はtrue
   */
  static isToolSupportedByModel(model: string): boolean {
    return doesModelSupportTools('databricks', model);
  }

  /**
   * 検索ツールの引数を処理する専用のヘルパーメソッド
   * 共通ツールユーティリティを使用
   * 
   * @param toolName ツール名
   * @param currentArgs 現在の引数文字列
   * @param newArgs 新しい引数文字列
   * @param messages チャットメッセージ配列
   * @returns 処理された引数文字列
   */
  static processSearchToolArguments(
    toolName: string | undefined,
    currentArgs: string,
    newArgs: string,
    messages: ChatMessage[]
  ): string {
    return processSearchToolArguments(toolName, currentArgs, newArgs, messages);
  }

  /**
   * 指定されたツールが検索ツールかどうかをチェック
   * @param toolName ツール名
   * @returns 検索ツールの場合はtrue
   */
  static isSearchTool(toolName: string | undefined): boolean {
    return isSearchTool(toolName);
  }
}
