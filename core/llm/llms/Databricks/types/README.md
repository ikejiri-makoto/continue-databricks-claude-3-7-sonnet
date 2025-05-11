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
  StreamingState
} from "./types";
```

### `types.ts`

このファイルには、Databricks統合の主要な型定義が含まれています：

#### Databricks固有のオプション

```typescript
/**
 * Databricks完了オプションの型
 * CompletionOptionsを拡張してDatabricks固有のパラメータを定義
 */
export interface DatabricksCompletionOptions extends CompletionOptions {
  apiKey?: string;              // 認証用APIキー
  apiBase?: string;             // APIベースURL
  requestTimeout?: number;      // リクエストのタイムアウト（秒）
  thinking?: {                  // Claude 3.7の思考モード設定
    type: string;               // 思考モードのタイプ（"enabled"のみサポート）
    budget_tokens?: number;     // 思考プロセスのトークン予算
  };
}
```

#### ストリーミング関連の型

```typescript
/**
 * 永続的なストリーム状態を表す型
 * 再接続を可能にするためのストリーミング中の状態を追跡
 */
export interface StreamingState {
  jsonBuffer: string;                 // JSONフラグメント蓄積用バッファ
  isBufferingJson: boolean;           // JSON収集中フラグ
  toolCallsInProgress: any[];         // 処理中のツール呼び出し
  currentToolCallIndex: number | null; // 現在のツール呼び出しインデックス
  contentBuffer: string;              // これまでに蓄積されたコンテンツ
  lastReconnectTimestamp: number;     // 最後の再接続タイムスタンプ
}

/**
 * ストリーミングレスポンス結果
 * ストリーミングレスポンス処理の戻り値型
 */
export interface StreamingResponseResult {
  success: boolean;             // 成功フラグ
  messages: ChatMessage[];      // 処理されたメッセージ
  error?: Error;                // エラー（存在する場合）
  state?: StreamingState;       // 再接続用の状態
}

/**
 * ツール呼び出し結果
 * ツール呼び出し処理の戻り値型
 */
export interface ToolCallResult {
  updatedToolCalls: any[];                  // 更新されたツール呼び出し
  updatedCurrentToolCall: any | null;       // 現在のツール呼び出し
  updatedCurrentToolCallIndex: number | null; // 現在のツール呼び出しインデックス
  updatedJsonBuffer: string;                // 更新されたJSONバッファ
  updatedIsBufferingJson: boolean;          // 更新されたバッファリングフラグ
  shouldYieldMessage: boolean;              // メッセージを生成すべきかを示すフラグ
}
```

#### ツール関連の型

```typescript
/**
 * ツール呼び出し型
 */
export interface ToolCall {
  id: string;
  type: string;  // 常に"function"に固定すべき
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * ツール呼び出しデルタ型（ストリーミング用）
 */
export interface ToolCallDelta {
  index: number;
  id?: string;
  type?: string;  // 常に"function"に固定すべき
  function?: {
    name?: string;
    arguments?: string;
  };
}

/**
 * ツール呼び出しプロセッサインターフェース
 */
export interface ToolCallProcessorInterface {
  preprocessToolCallsAndResults(messages: ChatMessage[]): ChatMessage[];
}
```

### `extension.d.ts`

このファイルは、コア型定義を拡張してDatabricks固有の要件に対応します：

```typescript
// コアモジュールのChatMessage型を拡張
declare module "../../../../index.js" {
  interface ChatMessage {
    // thinking（思考）ロール用の追加プロパティ
    signature?: string;         // 思考メッセージの署名情報
    redactedThinking?: any;     // 編集済み思考データ
  }
  
  // CompletionOptions型を拡張
  interface CompletionOptions {
    // Databricks固有のオプション
    thinking?: {                  // 思考モード設定
      type: string;               // 思考モードのタイプ
      budget_tokens?: number;     // 思考用のトークン予算
    };
  }
}
```

## 2025年5月に追加された型定義

2025年5月の更新で、以下の新しい型定義が追加されました：

### `DatabricksChatMessage`型

```typescript
/**
 * Databricksチャットメッセージ型
 * チャットメッセージのフォーマットを定義
 */
export interface DatabricksChatMessage {
  role: string;
  content: string | any[];
  name?: string;
  toolCalls?: ToolCall[];
}
```

### `StreamingResult`型

```typescript
/**
 * ストリーミング結果型
 * コンテンツデルタ処理の結果を表す
 */
export interface StreamingResult {
  updatedMessage: ChatMessage;
  shouldYield: boolean;
}
```

## 型互換性の問題と解決策

### ToolCall と ToolCallDelta の互換性

ツール呼び出しデータの処理時に、`ToolCall[]`型と`ToolCallDelta[]`型の間の互換性問題が発生することがあります。この問題を解決するには、型変換ヘルパー関数を使用します：

```typescript
/**
 * ツール呼び出しを出力用に処理するヘルパー関数
 * ToolCall型とToolCallDelta型の互換性問題を解決します
 */
function processToolCallsForOutput(toolCalls: ToolCall[] | undefined): ToolCall[] | undefined {
  if (!toolCalls || toolCalls.length === 0) {
    return undefined;
  }

  // すべてのツール呼び出しが適切なtypeプロパティを持っていることを確認
  return toolCalls.map(call => ({
    ...call,
    type: "function" // typeプロパティを明示的に"function"に設定して型互換性を確保
  }));
}

// 使用例
toolCalls: toolCalls.length > 0 ? processToolCallsForOutput(toolCalls) : undefined
```

## 型安全性の強化ポイント

### 1. メッセージコンテンツ型の適切な処理

`MessageContent`型は`string`または`MessagePart[]`のユニオン型であり、これがTypeScriptエラーの原因でした。この問題を解決するために、`extractContentAsString`ユーティリティを使用します：

```typescript
// streaming.tsでの型エラー：
// Type 'MessageContent' is not assignable to type 'string'
// Type 'MessagePart[]' is not assignable to type 'string'
lastYieldedMessageContent = currentMessage.content; // エラー！

// 修正アプローチ：コンテンツを安全に文字列として抽出
import { extractContentAsString } from "../../utils/messageUtils.js";

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
 * 以前は暗黙的な型付けだったものを明示的に型付け
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

### 3. ストリーミング処理の状態管理型

ストリーミング処理の状態を明確に定義することで、接続エラーからの回復をより安全に実装できるようになりました：

```typescript
/**
 * 永続的なストリーム状態を表す型
 * 再接続を可能にするためのストリーミング中の状態を追跡
 */
export interface StreamingState {
  jsonBuffer: string;
  isBufferingJson: boolean;
  toolCallsInProgress: ToolCall[];
  currentToolCallIndex: number | null;
  contentBuffer: string;
  lastReconnectTimestamp: number;
}
```

### 4. リクエストボディ型の改善

`requestBody.model`へのアクセスによる型エラーを解決するため、リクエストボディ構築時の型安全なアプローチを導入しました：

```typescript
// リクエストボディを構築（型安全な方法）
const requestBody = {
  ...args,  // 既に型チェック済みのパラメータ
  messages: formattedMessages,
  system: systemMessage
};

// モデル情報はargsから取得して型安全性を確保
const modelForLogging = args.model || options.model || this.model;
console.log(`Databricksリクエスト: モデル=${modelForLogging}`);
```

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

// 使用例
function processStreamingResponse(
  response: Response
): Promise<StreamingResponseResult> {
  // 実装...
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

### 3. ツール引数処理の型安全性向上

ツール引数処理のフローをより型安全にするための明示的なインターフェース定義を導入し、コンパイルエラーを防止しました。

### 4. ストリーミングレスポンス処理の型安全性向上

ストリーミングレスポンス処理の結果型を明示的に定義し、エラー処理と状態管理を改善しました。

### 5. インデックス処理の型安全性向上

配列インデックスのnull安全性を向上させ、境界外アクセスを防止するための型安全な処理を実装しました。

## 型エラーのトラブルシューティング

### 1. `Property 'model' does not exist on type '{ messages: any[]; system: string; }'`

このエラーは、`requestBody`オブジェクトの型定義が不十分な場合に発生します。解決方法：

```typescript
// 問題のあるコード
console.log(`モデル: ${requestBody.model}`); // エラー

// 修正方法
const modelName = args.model || options.model || this.model;
console.log(`モデル: ${modelName}`); // 安全
```

### 2. `Module has no exported member 'DatabricksChatMessage'`

このエラーは、必要な型が正しくエクスポートされていない場合に発生します。解決方法：

1. `types.ts`ファイルに型を追加
2. `index.ts`ファイルで明示的にエクスポート
3. インポート側で正しいパスからインポート

```typescript
// types.ts
export interface DatabricksChatMessage {
  role: string;
  content: string | any[];
  name?: string;
  toolCalls?: ToolCall[];
}

// index.ts
export type { DatabricksChatMessage } from "./types";

// 使用側
import { DatabricksChatMessage } from "./types/index.js";
```

### 3. `Type 'ToolCall[] | undefined' is not assignable to type 'ToolCallDelta[] | undefined'`

このエラーは、`ToolCall`型と`ToolCallDelta`型の間に互換性がない場合に発生します。解決方法：

```typescript
// 型変換ヘルパー関数を使用
function processToolCallsForOutput(toolCalls: ToolCall[] | undefined): ToolCallDelta[] | undefined {
  if (!toolCalls || toolCalls.length === 0) {
    return undefined;
  }

  // 型変換を明示的に行う
  return toolCalls.map(call => ({
    ...call,
    type: "function" // "function"に固定
  })) as ToolCallDelta[];
}

// 使用例
toolCalls: processToolCallsForOutput(toolCalls)
```

このような型強化により、コードの安全性と保守性が大幅に向上しました。型システムを効果的に活用することで、多くのバグを未然に防ぎ、コードの自己文書化機能を強化しています。
