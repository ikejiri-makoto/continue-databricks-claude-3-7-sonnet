# Databricks LLM Integration - Type Definitions

このディレクトリには、Databricks LLMインテグレーションで使用される型定義が含まれています。型定義は、コードの安全性、保守性、および自己文書化を向上させるために非常に重要な役割を果たします。

## 重要な注意事項

**注意**: Databricksのエンドポイントは`parallel_tool_calls`パラメータをサポートしていません。このパラメータはDatabricksの型定義から意図的に除外されており、使用するとエラーの原因となります。

## ディレクトリ構造

```
types/
├── index.ts         # すべての型定義のエントリーポイント
├── types.ts         # 詳細な型定義の実装
└── extension.d.ts   # 型拡張定義
```

## 主要な型定義

### `index.ts`

このファイルは、すべての型定義のエントリーポイントとして機能し、他のモジュールが使用する型をエクスポートします：

```typescript
// 型定義をインポートしてエクスポート
export * from "./types";

// 明示的なエクスポート（IDE補完のため）
export type { 
  DatabricksLLMOptions,
  DatabricksCompletionOptions, 
  ToolCall, 
  ToolResultMessage,
  DatabricksChatMessage,
  StreamingChunk,
  PersistentStreamState,
  StreamingResult,
  ToolCallProcessorInterface,
  ToolCallResult,
  ToolCallDelta,
  ErrorHandlingResult,
  StreamingState,
  ThinkingChunk,
  StreamingResponseResult,
  ReconnectionResult
} from "./types";
```

### `types.ts`

このファイルには、Databricks統合の主要な型定義が含まれています：

#### Databricks固有のオプション

```typescript
/**
 * Databricks LLM特有のオプション型
 * parallel_tool_callsはDatabricksエンドポイントではサポートされないため含まれていない
 */
export interface DatabricksLLMOptions extends LLMOptions {
  apiBase?: string;
  apiKey?: string;
  alwaysLogThinking?: boolean;
}

/**
 * Databricksリクエスト時の補完オプション型
 * parallel_tool_callsはDatabricksエンドポイントではサポートされないため含まれていない
 */
export interface DatabricksCompletionOptions extends CompletionOptions {
  /**
   * リクエストのタイムアウト (秒)
   * デフォルトは300秒 (5分)
   */
  requestTimeout?: number;
  
  /**
   * API Base URL
   */
  apiBase?: string;
  
  /**
   * API Key
   */
  apiKey?: string;
  
  /**
   * Claude 3.7モデル用の思考モード設定
   * 思考プロセスを有効にし、そのための設定を行う
   */
  thinking?: {
    /**
     * 思考モードのタイプ - 現在は"enabled"のみサポート
     */
    type: string;
    
    /**
     * 思考プロセス用のトークン予算
     * デフォルトはmax_tokensの半分（最大64000）
     */
    budget_tokens?: number;
  };
}
```

#### ツール関連の型定義

```typescript
/**
 * ツール呼び出し型
 */
export interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * ツール結果メッセージ型
 */
export interface ToolResultMessage {
  role: string;
  tool_call_id: string;
  content: string;
}

/**
 * ストリーミングチャンク内のツール呼び出しデルタ
 */
export interface ToolCallDelta {
  index: number;
  id?: string;
  type?: string; // typeプロパティを追加して型の互換性を確保
  function?: {
    name?: string;
    arguments?: string;
  };
}
```

#### ストリーミング関連の型定義

```typescript
/**
 * ストリーミングレスポンスデルタ
 */
export interface ResponseDelta {
  tool_calls?: ToolCallDelta[];
  content?: string | {
    summary?: {
      text?: string;
    };
  };
  signature?: string;
}

/**
 * ストリーミングチャンク型
 */
export interface StreamingChunk {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  thinking?: any; // 思考データは様々な形式で来る可能性があるためany型
  choices?: Array<{
    index?: number;
    delta?: ResponseDelta & {
      content?: string | {
        summary?: {
          text?: string;
        };
      }; // content.summary.textなどの入れ子構造に対応
    };
    finish_reason?: string | null;
  }>;
}

/**
 * 思考チャンク型 - 拡張版
 * 様々な思考データ構造に対応する柔軟な型定義
 * Claude 3.7 Sonnetの思考モードで返される複数のデータ形式に対応
 */
export interface ThinkingChunk {
  /** 直接の思考データ（様々な形式で渡される可能性あり） */
  thinking?: any;
  
  /** summary.text形式の思考データ */
  summary?: { 
    text?: string;
  };
  
  /** content.summary.text形式の思考データ */
  content?: { 
    summary?: { 
      text?: string;
    };
  };
  
  /** 思考データの署名情報 */
  signature?: string;
  
  /** デルタ形式の思考データ */
  delta?: any;
  
  /** choices[0].delta.content.summary.text形式の思考データ（最優先）*/
  choices?: Array<{
    delta?: {
      content?: {
        summary?: {
          text?: string;
        };
      };
      signature?: string;
    };
  }>;
}
```

#### 状態管理関連の型定義

```typescript
/**
 * ストリーミング状態追跡型
 */
export interface StreamingState {
  message: ChatMessage;
  toolCalls: ToolCall[];
  currentToolCall: ToolCall | null;
  currentToolCallIndex: number | null;
  jsonBuffer: string;
  isBufferingJson: boolean;
}

/**
 * 永続的なストリーム状態型
 * 再接続時に状態を復元するために使用
 */
export interface PersistentStreamState {
  jsonBuffer: string;
  isBufferingJson: boolean;
  toolCallsInProgress: ToolCall[];
  currentToolCallIndex: number | null;
  contentBuffer: string;
  lastReconnectTimestamp: number;
}
```

#### 結果型と処理インターフェース

```typescript
/**
 * エラー処理結果型
 */
export interface ErrorHandlingResult {
  success: boolean;
  error: Error;
  state?: StreamingState;
}

/**
 * Databricksチャットメッセージ型
 */
export interface DatabricksChatMessage {
  role: string;
  content: string | any[];
  name?: string;
  toolCalls?: ToolCall[];
}

/**
 * ストリーミング結果型
 */
export interface StreamingResult {
  updatedMessage: ChatMessage;
  shouldYield: boolean;
}

/**
 * ツールコールプロセッサのインターフェース
 */
export interface ToolCallProcessorInterface {
  preprocessToolCallsAndResults(messages: ChatMessage[]): ChatMessage[];
}

/**
 * ツール呼び出し結果型
 */
export interface ToolCallResult {
  updatedToolCalls: ToolCall[];
  updatedCurrentToolCall: ToolCall | null;
  updatedCurrentToolCallIndex: number | null;
  updatedJsonBuffer: string;
  updatedIsBufferingJson: boolean;
  shouldYieldMessage: boolean;
}

/**
 * ストリーミングレスポンス処理結果型
 */
export interface StreamingResponseResult {
  success: boolean;
  messages: ChatMessage[];
  error?: Error;
  state?: any;
}

/**
 * 再接続結果型
 */
export interface ReconnectionResult {
  restoredMessage: ChatMessage;
  restoredToolCalls: ToolCall[];
  restoredCurrentToolCall: ToolCall | null;
  restoredCurrentToolCallIndex: number | null;
  restoredJsonBuffer: string;
  restoredIsBufferingJson: boolean;
}
```

### `extension.d.ts`

このファイルは、コア型定義を拡張してDatabricks固有の要件に対応します：

```typescript
// This file defines extensions to core types
// Required to support Databricks-specific features

// Add Databricks-specific options
declare module "../index" {
  // ChatMessage型の拡張でツール呼び出し関連プロパティを追加
  interface ChatMessage {
    /**
     * ツール呼び出しの結果に関連付けられたツール呼び出しID
     * ツール結果メッセージ（role: "tool"）で使用される
     */
    toolCallId?: string;
    
    /**
     * 思考メッセージの署名情報
     * 思考プロセス（role: "thinking"）で使用される
     */
    signature?: string;
    
    /**
     * 編集済み思考データ
     * 思考プロセスの非公開部分
     */
    redactedThinking?: any;
  }

  interface LLMOptions {
    /**
     * Whether to always log thinking process
     * If true, always log; if false, only log in development mode
     */
    thinkingProcess?: boolean;
    
    /**
     * APIベースURL
     * DatabricksエンドポイントのベースURL
     */
    apiBase?: string;
    
    /**
     * APIキー
     * Databricksエンドポイントの認証に使用するAPIキー
     */
    apiKey?: string;
    
    /**
     * 思考プロセスを常にログに出力するかどうか
     */
    alwaysLogThinking?: boolean;
    
    // 注意: Databricksエンドポイントはparallel_tool_callsパラメータをサポートしていません
    // このパラメータを含めるとエラーが発生します
    // parallel_tool_callsパラメータを意図的にコメントアウト
    // parallelToolCalls?: boolean;
  }

  // Add extension for CompletionOptions
  interface CompletionOptions {
    /**
     * Thinking mode configuration for Claude 3.7 models
     * Enables and configures thinking process
     */
    thinking?: {
      /**
       * Thinking mode type - currently only "enabled" is supported
       */
      type: string;
      
      /**
       * Token budget for thinking process
       * Default is half of max_tokens (up to 64000)
       */
      budget_tokens?: number;
    };
  }

  // ThinkingChatMessageを拡張して必要なプロパティを追加
  interface ThinkingChatMessage extends ChatMessage {
    /**
     * 思考プロセスの署名情報
     */
    signature?: string;
    
    /**
     * 思考プロセスの結果要約
     */
    summary?: {
      text?: string;
    };
    
    /**
     * 思考プロセスのデルタ更新
     */
    delta?: any;
    
    /**
     * 思考プロセスの選択肢情報
     */
    choices?: Array<{
      delta?: {
        content?: {
          summary?: {
            text?: string;
          };
        };
        signature?: string;
      };
    }>;
  }
}
```

## 2025年5月に追加・更新された型定義

2025年5月の更新で、以下の重要な型定義が追加または更新されました：

### 1. `ThinkingChunk`インターフェースの拡張

Claude 3.7 Sonnetの思考モードをサポートするために、`ThinkingChunk`インターフェースが大幅に拡張されました。以前は基本的な思考データのみをサポートしていましたが、現在は様々な形式の思考データに対応できるように柔軟な構造になっています：

```typescript
export interface ThinkingChunk {
  thinking?: any;
  summary?: { text?: string; };
  content?: { summary?: { text?: string; }; };
  signature?: string;
  delta?: any;
  choices?: Array<{
    delta?: {
      content?: { summary?: { text?: string; }; };
      signature?: string;
    };
  }>;
}
```

これにより、以下の思考データ形式すべてに対応できるようになりました：
- `thinking`プロパティとして直接送信される形式
- `summary.text`形式
- `content.summary.text`形式
- `choices[0].delta.content.summary.text`形式（Databricksエンドポイントで最も一般的に使用される形式）

### 2. 再接続とストリーミング状態管理の型定義

ストリーミング処理中の接続エラーに対応するため、状態管理と再接続に関連する型定義が追加されました：

```typescript
export interface ReconnectionResult {
  restoredMessage: ChatMessage;
  restoredToolCalls: ToolCall[];
  restoredCurrentToolCall: ToolCall | null;
  restoredCurrentToolCallIndex: number | null;
  restoredJsonBuffer: string;
  restoredIsBufferingJson: boolean;
}

export interface PersistentStreamState {
  jsonBuffer: string;
  isBufferingJson: boolean;
  toolCallsInProgress: ToolCall[];
  currentToolCallIndex: number | null;
  contentBuffer: string;
  lastReconnectTimestamp: number;
}
```

### 3. ツール呼び出し関連の型定義の改善

ツール呼び出し処理の安定性を向上させるため、関連する型定義が更新されました：

```typescript
export interface ToolCallDelta {
  index: number;
  id?: string;
  type?: string; // typeプロパティを追加して型の互換性を確保
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface ToolCallResult {
  updatedToolCalls: ToolCall[];
  updatedCurrentToolCall: ToolCall | null;
  updatedCurrentToolCallIndex: number | null;
  updatedJsonBuffer: string;
  updatedIsBufferingJson: boolean;
  shouldYieldMessage: boolean;
}
```

特に`type`プロパティが追加されたことで、コアの`ToolCallDelta`型との互換性が向上しました。

### 4. ストリーミングレスポンスの型定義強化

ストリーミングレスポンス処理の型安全性を向上させるため、専用の型定義が追加されました：

```typescript
export interface StreamingResponseResult {
  success: boolean;
  messages: ChatMessage[];
  error?: Error;
  state?: any;
}
```

### 5. `ResponseDelta`の改善

思考モードのデータ構造をサポートするために、`ResponseDelta`インターフェースが拡張されました：

```typescript
export interface ResponseDelta {
  tool_calls?: ToolCallDelta[];
  content?: string | {
    summary?: {
      text?: string;
    };
  };
  signature?: string;
}
```

これにより、通常のテキストコンテンツだけでなく、`content.summary.text`形式の思考データもサポートできるようになりました。

## 型互換性の問題と解決策

### ToolCall と ToolCallDelta の互換性

ツール呼び出しデータの処理時に、`ToolCall[]`型と`ToolCallDelta[]`型の間の互換性問題が発生することがあります。この問題を解決するには、型変換ヘルパー関数を使用します：

```typescript
/**
 * ツール呼び出しを出力用に処理するヘルパー関数
 * ToolCall型とToolCallDelta型の互換性問題を解決します
 */
private static processToolCallsForOutput(toolCalls: ToolCall[] | undefined): CoreToolCallDelta[] | undefined {
  if (!toolCalls || toolCalls.length === 0) {
    return undefined;
  }

  // すべてのツール呼び出しが適切なtypeプロパティを持っていることを確認
  // 明示的に"function"を指定し、コアの型と互換性を持たせる
  const processedToolCalls = toolCalls.map(call => ({
    ...call,
    type: "function" as const  // "function"リテラル型として明示
  }));
  
  // CoreToolCallDelta[]型として返す
  return processedToolCalls as unknown as CoreToolCallDelta[];
}
```

## 型安全性の強化ポイント

### 1. メッセージコンテンツ型の適切な処理

`MessageContent`型は`string`または`MessagePart[]`のユニオン型であり、これがTypeScriptエラーの原因でした。この問題を解決するために、`extractContentAsString`ユーティリティを使用します：

```typescript
// 型安全な比較
const currentContentAsString = extractContentAsString(currentMessage.content);
if (currentContentAsString !== lastYieldedMessageContent) {
  // メッセージを処理...
  lastYieldedMessageContent = currentContentAsString;
}
```

この修正により、`MessageContent`が文字列か配列かにかかわらず、常に文字列として安全に扱えるようになりました。

### 2. ツール呼び出し関連の型強化

ツール呼び出し処理の型安全性を向上させるための明示的なインターフェースを定義しました：

```typescript
/**
 * ツール呼び出し処理の結果を表す明示的なインターフェース
 */
export interface ToolCallResult {
  updatedToolCalls: ToolCall[];
  updatedCurrentToolCall: ToolCall | null;
  updatedCurrentToolCallIndex: number | null;
  updatedJsonBuffer: string;
  updatedIsBufferingJson: boolean;
  shouldYieldMessage: boolean;
}
```

これにより、モジュール間でデータを渡す際の型安全性が向上し、`typeof result`のような曖昧な型参照を避けることができます。

### 3. 思考モード関連の型強化

Claude 3.7 Sonnetの思考モードをサポートするため、関連する型定義が大幅に強化されました：

```typescript
// 思考メッセージの拡張定義
interface ThinkingChatMessage extends ChatMessage {
  signature?: string;
  summary?: { text?: string; };
  delta?: any;
  choices?: Array<{ delta?: { content?: { summary?: { text?: string; }; }; signature?: string; }; }>;
}

// 思考チャンクの柔軟な定義
export interface ThinkingChunk {
  thinking?: any;
  summary?: { text?: string; };
  content?: { summary?: { text?: string; }; };
  signature?: string;
  delta?: any;
  choices?: Array<{ delta?: { content?: { summary?: { text?: string; }; }; signature?: string; }; }>;
}
```

この柔軟な型定義により、様々な形式の思考データを適切に処理できるようになりました。

## 型安全性のベストプラクティス

Databricks統合で採用している型安全性向上のためのベストプラクティス：

### 1. 明示的なインターフェース定義

複雑なオブジェクト構造には、インライン型定義ではなく明示的なインターフェースを定義します：

```typescript
// 明示的なインターフェース定義
export interface StreamingResponseResult {
  success: boolean;
  messages: ChatMessage[];
  error?: Error;
  state?: StreamingState;
}
```

### 2. Null/Undefinedの安全な処理

Nullやundefinedの可能性がある値を安全に処理します：

```typescript
// null安全な配列アクセス
if (currentToolCallIndex !== null && 
    currentToolCallIndex >= 0 && 
    currentToolCallIndex < toolCalls.length) {
  // 安全に配列アクセス可能
  const currentToolCall = toolCalls[currentToolCallIndex];
  // 処理...
}
```

### 3. 戻り値型の明示的な宣言

関数やメソッドには明示的な戻り値型を宣言します：

```typescript
// 戻り値型の明示的な宣言
static processToolCallDelta(
  toolCallDelta: any,
  toolCalls: ToolCall[],
  currentToolCallIndex: number | null,
  jsonBuffer: string,
  isBufferingJson: boolean,
  messages: ChatMessage[]
): ToolCallResult {
  // 実装...
}
```

## 2025年5月の改善点

### 1. parallel_tool_callsパラメータの完全な削除

Databricksエンドポイントが`parallel_tool_calls`パラメータをサポートしていないため、このパラメータを型定義から完全に削除しました。これにより、コンパイルエラーを早期に検出し、実行時エラーを防止できるようになりました。

### 2. 思考モード（thinking）の型定義強化

Claude 3.7 Sonnetの思考モード機能をサポートするため、型定義を拡張しました：

```typescript
// CompletionOptions型における思考モードの明示的な型定義
thinking?: {
  type: string;               // 思考モードのタイプ（"enabled"のみサポート）
  budget_tokens?: number;     // 思考用のトークン予算
};
```

これにより、思考モードのパラメータを型安全に処理できるようになりました。

### 3. ThinkingChunkインターフェースの拡張と柔軟化

思考データの様々な形式に対応するため、`ThinkingChunk`インターフェースを柔軟な構造に変更しました。これにより、様々な階層のデータから思考情報を適切に抽出できるようになり、より堅牢な処理が可能になりました。

### 4. ストリーミングレスポンス処理の型安全性向上

ストリーミングレスポンス処理の結果型を明示的に定義し、エラー処理と状態管理を改善しました。

### 5. 再接続機能のサポート

接続エラーからの回復を容易にするため、再接続関連の型定義を追加しました。これにより、ストリーミング処理中に接続が切断された場合でも、状態を保持して処理を再開できるようになりました。

## 型エラーのトラブルシューティング

### 1. `Property 'delta' does not exist on type 'ThinkingChunk'`

このエラーは、`ThinkingChunk`インターフェースに`delta`プロパティが定義されていない場合に発生します。解決方法は以下の通りです：

1. `types.ts`ファイルで`ThinkingChunk`インターフェースを拡張して`delta`プロパティを追加
2. オプショナルチェイニング（`?.`）を使用してプロパティの存在を確認
3. 様々なデータ形式に対応できるようにany型を使用

```typescript
export interface ThinkingChunk {
  thinking?: any;
  delta?: any; // deltaプロパティを追加
  // 他のプロパティ...
}

// 使用時にオプショナルチェイニングを使用
if (thinkingChunk.delta?.content?.summary?.text) {
  // 安全なアクセス
}
```

### 2. `Type 'MessageContent' is not assignable to type 'string'`

このエラーは、`MessageContent`型が`string | MessagePart[]`のユニオン型であるのに対して、代入先の変数が`string`型である場合に発生します。解決方法は以下の通りです：

```typescript
// 共通ユーティリティを使用して型安全に変換
import { extractContentAsString } from "../../utils/messageUtils.js";

// 型安全な変換と代入
const contentAsString = extractContentAsString(message.content);
```

### 3. `[object Object]と表示される問題`

これは、オブジェクトを直接文字列として使用した場合に発生します。以下の方法で解決できます：

1. `safeStringify`ユーティリティを使用してオブジェクトを適切に文字列化
2. `extractContentAsString`を使用してメッセージコンテンツを文字列として抽出
3. オブジェクト内のテキストプロパティを明示的に抽出

```typescript
// 悪い例
console.log("思考データ:", thinkingData);  // [object Object]と表示される

// 良い例
console.log("思考データ:", safeStringify(thinkingData, "<データなし>"));

// 思考データからテキストを明示的に抽出
const thinkingText = thinkingData.choices?.[0]?.delta?.content?.summary?.text ||
                     thinkingData.content?.summary?.text ||
                     thinkingData.summary?.text ||
                     safeStringify(thinkingData, "<データなし>");
console.log("思考テキスト:", thinkingText);
```

これらの型定義と型安全なプログラミング手法により、コードの品質と保守性が大幅に向上しました。型システムを活用することで、多くのバグを未然に防ぎ、コードの自己文書化を促進しています。