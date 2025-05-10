import { ChatMessage } from "../../../index.js";
import { ToolCall, ToolResultMessage, ToolCallProcessorInterface, ToolCallResult } from "./types/index.js";
import { 
  extractContentAsString,
  hasToolResultBlocksAtBeginning,
  messageHasToolCalls
} from "../../utils/messageUtils.js";
import { 
  isSearchTool, 
  processSearchToolArguments, 
  formatToolResultsContent,
  doesModelSupportTools,
  repairToolArguments
} from "../../utils/toolUtils.js";
import { 
  safeJsonParse, 
  extractValidJson, 
  repairDuplicatedJsonPattern, 
  isValidJson, 
  processToolArgumentsDelta 
} from "../../utils/json.js";
import { getErrorMessage } from "../../utils/errors.js";

/**
 * ツール呼び出し処理クラス
 * Databricks上のClaude 3.7 Sonnetからのツール呼び出しを処理するメソッドを提供
 * ToolCallProcessorInterfaceを実装して責任を明確化
 */
export class ToolCallProcessor implements ToolCallProcessorInterface {
  // インスタンスメソッドとしてインターフェースメソッドを実装
  preprocessToolCallsAndResults(messages: ChatMessage[]): ChatMessage[] {
    return ToolCallProcessor.preprocessToolCallsAndResults(messages);
  }
  
  processToolArguments(args: string, toolName: string, messages: ChatMessage[]): string {
    return ToolCallProcessor.processToolArguments(args, toolName, messages);
  }
  
  processToolCall(
    toolCall: ToolCall | null,
    currentToolCallIndex: number | null,
    jsonBuffer: string,
    isBufferingJson: boolean,
    toolCallDelta: any,
    toolCalls: ToolCall[]
  ): ToolCallResult {
    return ToolCallProcessor.processToolCall(
      toolCall,
      currentToolCallIndex,
      jsonBuffer,
      isBufferingJson,
      toolCallDelta,
      toolCalls
    );
  }

  // 静的メソッドはそのまま残す - 共通の実装として使用
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
          content: `Tool execution pending...`
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
   * toolUtils.jsの共通ユーティリティメソッドを使用
   * 
   * @param args 修復する引数文字列
   * @returns 修復された引数文字列
   */
  static repairToolArguments(args: string): string {
    if (!args || args.trim() === '') {
      return '{}';
    }
    
    try {
      // 共通ユーティリティのrepairToolArgumentsを使用
      // 重複コードを省き、共通ユーティリティの活用を強化
      const repaired = repairToolArguments(args);
      
      // 修復に成功した場合は結果を返す
      if (repaired && repaired !== args) {
        return repaired;
      }
      
      // Databricks固有の追加的な修復処理
      // 共通ユーティリティで処理されなかった場合の特殊処理
      const repairedArgs = repairDuplicatedJsonPattern(args);
      if (repairedArgs !== args) {
        return repairedArgs;
      }
      
      // 最終的に、上記の処理で修復されなかった場合は元の引数を返す
      return args;
    } catch (e) {
      // エラーが発生した場合は元の引数を返す
      console.warn(`引数の修復に失敗しました: ${getErrorMessage(e)}`);
      return args;
    }
  }

  /**
   * 複数のツール引数をデルタベースで処理
   * 部分的なJSONを累積し、完全なJSONになるまで処理
   * 共通ユーティリティを最大限活用
   * 
   * @param toolName ツール名
   * @param jsonBuffer 現在のJSONバッファ
   * @param newJsonFragment 新しいJSONフラグメント
   * @returns 処理されたJSONオブジェクトと完了フラグ
   */
  static processToolArgumentsDelta(
    toolName: string | undefined,
    jsonBuffer: string,
    newJsonFragment: string
  ): { 
    processedArgs: string;
    isComplete: boolean;
  } {
    // 入力チェック - 空の場合は現在のバッファをそのまま返す
    if (!newJsonFragment || newJsonFragment.trim() === '') {
      return { 
        processedArgs: jsonBuffer, 
        isComplete: isValidJson(jsonBuffer) 
      };
    }
    
    try {
      // ツール引数の修復メソッドを活用して新しいフラグメントを修復
      const repairedNewFragment = this.repairToolArguments(newJsonFragment);
      
      // 共通ユーティリティのprocessToolArgumentsDeltaを使用してデルタベースの処理を行う
      const result = processToolArgumentsDelta(jsonBuffer, repairedNewFragment);
      
      // 完全なJSONになり、検索ツールの場合は特別処理を行う
      if (result.isComplete && result.processedArgs && toolName && isSearchTool(toolName)) {
        // 検索ツールのクエリが空の場合はデフォルト値を設定
        if (result.processedArgs === "{}" || !result.processedArgs) {
          return {
            processedArgs: JSON.stringify({ query: "" }),
            isComplete: true
          };
        }
        
        try {
          // 型安全なパースで引数を処理し、queryプロパティが存在することを確認
          const args = safeJsonParse<{ query?: string }>(result.processedArgs, { query: "" });
          if (!args.query) {
            args.query = "";
          }
          
          return {
            processedArgs: JSON.stringify(args),
            isComplete: true
          };
        } catch (e) {
          // パースエラーの場合は元の結果を返す
          console.warn(`検索ツール引数処理エラー: ${getErrorMessage(e)}`);
        }
      }
      
      return result;
    } catch (e) {
      // 例外が発生した場合は安全なフォールバック値を返す
      console.error(`ツール引数デルタ処理中のエラー: ${getErrorMessage(e)}`);
      return {
        processedArgs: jsonBuffer,
        isComplete: false
      };
    }
  }

  /**
   * 指定されたツールが検索ツールかどうかをチェック
   * 共通ユーティリティを活用
   * 
   * @param toolName ツール名
   * @returns 検索ツールの場合はtrue
   */
  static isSearchTool(toolName: string | undefined): boolean {
    return isSearchTool(toolName);
  }
  
  /**
   * ツール引数を処理するメソッド
   * 引数の修復や特殊ツールの処理を実行
   * ToolCallProcessorInterfaceが要求するメソッド
   * 
   * @param args 処理する引数文字列
   * @param toolName ツール名
   * @param messages メッセージ配列
   * @returns 処理済みの引数文字列
   */
  static processToolArguments(
    args: string,
    toolName: string,
    messages: ChatMessage[]
  ): string {
    // 空の引数は空のオブジェクトとして処理
    if (!args || args.trim() === '') {
      return '{}';
    }
    
    try {
      // まず引数の修復を試みる
      const repairedArgs = this.repairToolArguments(args);
      
      // 検索ツールの場合は特別処理
      if (this.isSearchTool(toolName)) {
        return this.processSearchToolArguments(toolName, "", repairedArgs, messages);
      }
      
      // 他のツールの場合は修復された引数を返す
      return repairedArgs;
    } catch (e) {
      // 例外が発生した場合は元の引数を返す
      console.warn(`ツール引数処理エラー: ${getErrorMessage(e)}`);
      return args;
    }
  }
  
  /**
   * ツール呼び出しを処理するメソッド
   * ToolCallProcessorInterfaceが要求するメソッド
   * 
   * @param toolCall 現在のツール呼び出し
   * @param currentToolCallIndex 現在のツール呼び出しインデックス
   * @param jsonBuffer JSONバッファ
   * @param isBufferingJson JSONバッファリング中かどうか
   * @param toolCallDelta ツール呼び出しデルタ
   * @param toolCalls ツール呼び出し配列
   * @returns 処理結果
   */
  static processToolCall(
    toolCall: ToolCall | null,
    currentToolCallIndex: number | null,
    jsonBuffer: string,
    isBufferingJson: boolean,
    toolCallDelta: any,
    toolCalls: ToolCall[]
  ): ToolCallResult {
    // 初期値を設定
    let updatedToolCalls = [...toolCalls];
    let updatedCurrentToolCall = toolCall;
    let updatedCurrentToolCallIndex = currentToolCallIndex;
    let updatedJsonBuffer = jsonBuffer;
    let updatedIsBufferingJson = isBufferingJson;
    let shouldYieldMessage = false;
    
    try {
      // デルタが空の場合は現在の状態を返す
      if (!toolCallDelta || !toolCallDelta.index) {
        return {
          updatedToolCalls,
          updatedCurrentToolCall,
          updatedCurrentToolCallIndex,
          updatedJsonBuffer,
          updatedIsBufferingJson,
          shouldYieldMessage
        };
      }
      
      // デルタインデックスを取得
      const deltaIndex = Number(toolCallDelta.index);
      
      // ツール呼び出しIDの処理
      if (toolCallDelta.id) {
        // 指定インデックスのツール呼び出しが存在するか確認
        if (deltaIndex >= 0 && deltaIndex < updatedToolCalls.length) {
          // IDを更新
          updatedToolCalls[deltaIndex] = {
            ...updatedToolCalls[deltaIndex],
            id: toolCallDelta.id
          };
          
          // 現在のツール呼び出しも更新
          if (currentToolCallIndex === deltaIndex) {
            updatedCurrentToolCall = {
              ...updatedCurrentToolCall,
              id: toolCallDelta.id
            } as ToolCall;
          }
        } else {
          // 新しいツール呼び出しを作成
          const newToolCall: ToolCall = {
            id: toolCallDelta.id,
            type: "function",
            function: {
              name: "",
              arguments: ""
            }
          };
          
          updatedToolCalls.push(newToolCall);
          updatedCurrentToolCall = newToolCall;
          updatedCurrentToolCallIndex = updatedToolCalls.length - 1;
        }
      }
      
      // 関数情報の処理
      if (toolCallDelta.function) {
        // 指定インデックスのツール呼び出しが存在するか確認
        if (deltaIndex >= 0 && deltaIndex < updatedToolCalls.length) {
          // 関数名の処理
          if (toolCallDelta.function.name) {
            updatedToolCalls[deltaIndex].function.name = toolCallDelta.function.name;
            
            if (currentToolCallIndex === deltaIndex && updatedCurrentToolCall) {
              updatedCurrentToolCall.function.name = toolCallDelta.function.name;
            }
          }
          
          // 関数引数の処理
          if (toolCallDelta.function.arguments !== undefined) {
            // 現在バッファリング中の場合
            if (updatedIsBufferingJson && currentToolCallIndex === deltaIndex) {
              // デルタベースで引数を処理
              const toolName = updatedToolCalls[deltaIndex].function.name;
              const result = this.processToolArgumentsDelta(
                toolName,
                updatedJsonBuffer,
                toolCallDelta.function.arguments
              );
              
              updatedJsonBuffer = result.processedArgs;
              
              // 引数が完成した場合
              if (result.isComplete) {
                updatedIsBufferingJson = false;
                
                // 完成した引数をツール呼び出しに設定
                updatedToolCalls[deltaIndex].function.arguments = updatedJsonBuffer;
                
                if (updatedCurrentToolCall) {
                  updatedCurrentToolCall.function.arguments = updatedJsonBuffer;
                }
                
                // バッファをリセット
                updatedJsonBuffer = "";
                
                // メッセージ生成フラグをセット
                shouldYieldMessage = true;
              }
            } else {
              // バッファリング開始または別のツール呼び出しの場合
              updatedIsBufferingJson = true;
              updatedCurrentToolCallIndex = deltaIndex;
              updatedCurrentToolCall = updatedToolCalls[deltaIndex];
              
              // 初期化
              updatedJsonBuffer = toolCallDelta.function.arguments || "";
            }
          }
        }
      }
      
      // 処理結果を返す
      return {
        updatedToolCalls,
        updatedCurrentToolCall,
        updatedCurrentToolCallIndex,
        updatedJsonBuffer,
        updatedIsBufferingJson,
        shouldYieldMessage
      };
    } catch (e) {
      // エラーが発生した場合は現在の状態を維持
      console.error(`ツール呼び出し処理エラー: ${getErrorMessage(e)}`);
      
      return {
        updatedToolCalls,
        updatedCurrentToolCall,
        updatedCurrentToolCallIndex,
        updatedJsonBuffer,
        updatedIsBufferingJson,
        shouldYieldMessage: false
      };
    }
  }
}