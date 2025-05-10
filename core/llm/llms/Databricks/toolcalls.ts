import { ChatMessage } from "../../../index.js";
import { ToolCall, ToolResultMessage } from "./types.js";
import { extractContentAsString } from "../../utils/messageUtils.js";
import { hasToolResultBlocksAtBeginning } from "../../utils/messageUtils.js";
import { isSearchTool, processSearchToolArguments, formatToolResultsContent } from "../../utils/toolUtils.js";
import { doesModelSupportTools } from "../../utils/toolUtils.js";
import { safeJsonParse, extractValidJson, repairDuplicatedJsonPattern, isValidJson } from "../../utils/json.js";

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
      
      // ユーザーメッセージの後に空のツール結果配列を追加（必要に応じて）
      // これによりツールの呼び出し後の応答でエラーが発生するのを防ぐ
      if (currentMessage.role === 'user' && i > 0 && messages[i-1].role === 'assistant') {
        const prevMessage = messages[i-1] as any;
        if (prevMessage.toolCalls && prevMessage.toolCalls.length > 0) {
          // 現在のメッセージコンテンツにツール結果ブロックがあるか確認
          const content = typeof currentMessage.content === 'string' ? currentMessage.content : '';
          if (!content.trim().startsWith('<tool_result') && !content.trim().startsWith('{"role":"tool"')) {
            // ツール呼び出しに対応するツール結果を追加
            const dummyResults = this.createDummyToolResults(prevMessage.toolCalls);
            const toolResultsContent = formatToolResultsContent(dummyResults);
            
            // 結果を含む新しいメッセージを作成
            const newMessage = {
              ...currentMessage,
              content: toolResultsContent + content
            };
            
            // 処理済みメッセージに追加
            processedMessages.push(newMessage);
            continue;
          }
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
   * ツール呼び出し引数の修復を試みる
   * 特に入れ子構造や重複する引数の問題を修正
   * 
   * @param args 修復する引数文字列
   * @returns 修復された引数文字列
   */
  static repairToolArguments(args: string): string {
    if (!args || args.trim() === '') {
      return '{}';
    }
    
    // まず、二重化パターンを検出して修復（共通ユーティリティを使用）
    const repairedArgs = repairDuplicatedJsonPattern(args);
    if (repairedArgs !== args) {
      return repairedArgs;
    }
    
    // 明らかな重複パターンをチェック
    const repeatedPattern = /\{\s*"\w+"\s*:\s*[^{]*\{\s*"\w+"\s*:/;
    if (repeatedPattern.test(args)) {
      // JSONの先頭から有効な部分を抽出
      const validJson = extractValidJson(args);
      if (validJson) {
        return validJson;
      }
      
      // 特定のパターンの修復: {"filepath": "app.py"{"filepath": "app.py"
      const doubleFilepathPattern = /\{\s*"filepath"\s*:\s*"(.*?)"\s*\{\s*"filepath"\s*:/;
      const match = args.match(doubleFilepathPattern);
      if (match && match[1]) {
        return `{"filepath": "${match[1]}"}`;  
      }
      
      // 特定のパターンの修復: {"query": "value"{"query": "value"
      const doubleQueryPattern = /\{\s*"query"\s*:\s*"(.*?)"\s*\{\s*"query"\s*:/;
      const queryMatch = args.match(doubleQueryPattern);
      if (queryMatch && queryMatch[1]) {
        return `{"query": "${queryMatch[1]}"}`;  
      }
    }
    
    // ネストされたJSONを検出しようとする
    try {
      return JSON.stringify(safeJsonParse(args, {}));
    } catch (e) {
      console.warn(`引数の修復に失敗しました: ${e}`);
      return args;
    }
  }

  /**
   * 複数のツール引数をデルタベースで処理
   * 部分的なJSONを累積し、完全なJSONになるまで処理
   * 
   * @param toolName ツール名
   * @param jsonBuffer 現在のJSONバッファ
   * @param newJsonFragment 新しいJSONフラグメント
   * @returns 処理されたJSONオブジェクト
   */
  static processToolArgumentsDelta(
    toolName: string | undefined,
    jsonBuffer: string,
    newJsonFragment: string
  ): { 
    processedArgs: string;
    isComplete: boolean;
  } {
    // 空のフラグメントは無視
    if (!newJsonFragment || newJsonFragment.trim() === '') {
      return { 
        processedArgs: jsonBuffer, 
        isComplete: isValidJson(jsonBuffer) 
      };
    }
    
    // バッファと新しいフラグメントを結合
    const combinedBuffer = jsonBuffer + newJsonFragment;
    
    // 有効なJSONを抽出
    const validJson = extractValidJson(combinedBuffer);
    
    // 有効なJSONが抽出できた場合
    if (validJson) {
      try {
        // 解析してみる
        const parsedJson = JSON.parse(validJson);
        
        // 完全なJSONオブジェクトの場合
        return { 
          processedArgs: JSON.stringify(parsedJson),
          isComplete: true
        };
      } catch (e) {
        // JSONとして無効な場合（まだ不完全）
        return { 
          processedArgs: combinedBuffer,
          isComplete: false
        };
      }
    }
    
    // 有効なJSONが抽出できない場合
    return { 
      processedArgs: combinedBuffer,
      isComplete: false
    };
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
