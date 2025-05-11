# Databricks LLM Integration - Type Definitions

このディレクトリには、Databricks LLMインテグレーションで使用される型定義が含まれています。型定義は、コードの安全性、保守性、および自己文書化を向上させるために非常に重要な役割を果たします。

## ディレクトリ構造

```
types/
├── index.ts         # すべての型定義のエントリーポイント
├── types.ts         # メイン型定義ファイル
└── extension.d.ts   # 型拡張定義
```

## 主要な型定義

### `types.ts`

このファイルにはDatabricks統合の主要な型定義が含まれています：

#### ストリーミング関連の型

```typescript
// 永続的なストリーム状態を表す型
export interface PersistentStreamState {
  jsonBuffer: string;             // JSON累積用バッファ
  isBufferingJson: boolean;       // JSONバッファリング中フラグ
  toolCallsInProgress: ToolCall[]; // 進行中のツール呼び出し
  currentToolCallIndex: number | null; // 現在のツール呼び出しインデックス
  contentBuffer: string;          // コンテンツバッファ
  lastReconnectTimestamp: number; // 最後の再接続タイムスタンプ
}

// ストリーミングチャンクの型
export interface StreamingChunk {
  thinking?: ThinkingChunk;      // 思考プロセスデータ（存在する場合）
  choices?: Array<{             // 選択肢（標準的なLLMレスポンス形式）
    delta: ResponseDelta;       // デルタ更新
  }>;
}

// 思考チャンクの型
export interface ThinkingChunk {
  thinking: string | any;       // 思考内容（文字列またはオブジェクト）
  signature?: string;           // 署名（オプション）
}

// レスポンスデルタの型
export interface ResponseDelta {
  content?: string;             // コンテンツデルタ
  tool_calls?: Array<{         // ツール呼び出しデルタ
    index: number;              // ツール呼び出しのインデックス
    function?: {                // 関数情報
      name?: string;            // 関数名
      arguments?: string;       // 関数引数（JSON文字列）
    };
  }>;
}

// ツール呼び出しの型
export interface ToolCall {
  id: string;                   // ツール呼び出しID
  type: "function";             // ツールタイプ（現在は"function"のみ）
  function: {                   // 関数情報
    name: string;               // 関数名
    arguments: string;          // 関数引数（JSON文字列）
  };
}
```

#### API関連の型

```typescript
// Databricks完了オプションの型
export interface DatabricksCompletionOptions extends CompletionOptions {
  apiKey?: string;              // APIキー
  apiBase?: string;             // APIベースURL
  parallelToolCalls?: boolean;  // 並列ツール呼び出しフラグ
  // 他のオプション...
}

// Databricksリクエスト本体の型
export interface DatabricksRequestBody {
  model: string;                // モデル名
  messages: any[];              // メッセージ配列
  max_tokens?: number;          // 最大トークン数
  temperature?: number;         // 温度パラメータ
  top_p?: number;               // Top-Pパラメータ
  frequency_penalty?: number;   // 頻度ペナルティ
  presence_penalty?: number;    // 存在ペナルティ
  tools?: any[];                // ツール定義配列
  stop?: string[];              // 停止シーケンス
  stream?: boolean;             // ストリーミングフラグ
  thinking?: {                  // 思考モード設定
    type: "enabled";            // 思考モードタイプ
    budget_tokens: number;      // 思考トークン予算
  };
  // その他のAPIオプション...
}
```

#### メッセージコンテンツ型

特にストリーミング処理における型安全性を確保するための型定義：

```typescript
// メッセージコンテンツ型（文字列またはメッセージパーツの配列）
export type MessageContent = string | MessagePart[];

// メッセージパーツの型
export interface MessagePart {
  type: "text" | "image";       // パーツタイプ
  text?: string;                // テキスト（textタイプの場合）
  imageUrl?: {                  // 画像URL（imageタイプの場合）
    url: string;
  };
}

// チャットメッセージの型
export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool" | "thinking";
  content: MessageContent;      // 文字列または配列のいずれか
  toolCalls?: ToolCall[];       // ツール呼び出し配列（オプション）
  toolCallId?: string;          // ツール呼び出しID（toolロールの場合）
  signature?: string;           // 署名（thinkingロールの場合）
  redactedThinking?: any;       // 編集済み思考データ（オプション）
}
```

### `extension.d.ts`

このファイルは、コア型定義を拡張してDatabricks固有の要件に対応します：

```typescript
// コアモジュールのChatMessage型を拡張
declare module "../../../index.js" {
  interface ChatMessage {
    // thinkingロール用の追加プロパティ
    signature?: string;         // 署名情報
    redactedThinking?: any;     // 編集済み思考データ
  }
  
  // CompletionOptions型を拡張
  interface CompletionOptions {
    // Databricks固有のオプション
    parallelToolCalls?: boolean; // 並列ツール呼び出しフラグ
    thinking?: {                 // 思考モード設定
      type: "enabled";
      budget_tokens: number;
    };
  }
}
```

### `index.ts`

すべての型定義のエントリーポイントとして機能し、必要な型を外部に公開します：

```typescript
// 型定義をインポートして再エクスポート
export * from "./types.js";

// 必要に応じて追加の型定義や整理された型をエクスポート
export type { DatabricksRequestBody, ToolCall, StreamingChunk } from "./types.js";
```

## 型安全性の強化ポイント

### 1. MessageContent型の適切な処理 (2025年5月更新)

`MessageContent`型は`string`または`MessagePart[]`のユニオン型であり、これが`streaming.ts`でのTypeScriptエラーの原因でした。この問題を解決するために、型安全な処理方法を追加しました：

```typescript
// streaming.tsでの型エラー：
// Type 'MessageContent' is not assignable to type 'string'
// Type 'MessagePart[]' is not assignable to type 'string'
lastYieldedMessageContent = currentMessage.content; // エラー！

// 修正アプローチ：コンテンツを安全に文字列として抽出
import { extractContentAsString } from "../../utils/messageUtils.js";
lastYieldedMessageContent = extractContentAsString(currentMessage.content);
```

この修正により、`MessageContent`が文字列か配列かにかかわらず、常に文字列として安全に扱えるようになりました。

### 2. ツール呼び出し関連の型強化

ツール呼び出し処理の型安全性を向上させるための型定義の強化：

```typescript
// ツール呼び出し処理の結果を表す明示的なインターフェース
export interface ToolCallResult {
  updatedToolCalls: ToolCall[];
  updatedCurrentToolCall: ToolCall | null;
  updatedCurrentToolCallIndex: number | null;
  updatedJsonBuffer: string;
  updatedIsBufferingJson: boolean;
  shouldYieldMessage: boolean;
}

// 再接続結果を表す明示的なインターフェース
export interface ReconnectionResult {
  restoredMessage: ChatMessage;
  restoredToolCalls: ToolCall[];
  restoredCurrentToolCall: ToolCall | null;
  restoredCurrentToolCallIndex: number | null;
  restoredJsonBuffer: string;
  restoredIsBufferingJson: boolean;
}
```

これらの明示的なインターフェースにより、メソッド間でデータを渡す際の型安全性が向上し、`typeof result`のような曖昧な型参照を避けることができます。

### 3. ストリーミング処理の状態管理型

ストリーミング処理の状態と結果を管理するための明確な型定義：

```typescript
// ストリーミングレスポンス処理の結果型
export interface StreamingResponseResult {
  success: boolean;
  messages: ChatMessage[];
  error?: Error;
  state?: any;
}

// ストリーム処理チャンクの結果型
export interface ProcessedChunkResult {
  updatedMessage: ChatMessage;
  updatedToolCalls: ToolCall[];
  updatedCurrentToolCall: ToolCall | null;
  updatedCurrentToolCallIndex: number | null;
  updatedJsonBuffer: string;
  updatedIsBufferingJson: boolean;
  thinkingMessage?: ChatMessage;
  shouldYieldMessage: boolean;
}
```

## 型安全性のベストプラクティス

Databricks統合で採用している型安全性向上のためのベストプラクティス：

### 1. 明示的なインターフェース定義

複雑なオブジェクト構造には必ず明示的なインターフェースを定義します：

```typescript
// 明示的なインターフェース定義の例
export interface QueryArgs {
  query?: string;
  [key: string]: any;
}

// 使用例
function processQuery(args: QueryArgs): void {
  const query = args.query || "";
  // 型安全に処理...
}
```

### 2. ユニオン型の適切な処理

ユニオン型（複数の型の組み合わせ）を処理する際は、型ガードを使用して型を絞り込みます：

```typescript
// MessageContent型（string | MessagePart[]）の処理
function processContent(content: MessageContent): string {
  // 型ガードを使用した型の絞り込み
  if (typeof content === "string") {
    return content;
  } else {
    // 配列の場合は適切に変換
    return content.map(part => part.type === "text" ? part.text || "" : "[画像]").join("");
  }
}
```

### 3. Null/Undefinedの安全な処理

Nullやundefinedの可能性がある値を安全に処理します：

```typescript
// null/undefinedの可能性がある値の安全な処理
function processIndex(index: number | null): number {
  // null型ガード
  if (index === null) {
    return -1; // デフォルト値
  }
  return index;
}

// オプショナルプロパティの安全な処理
function extractArguments(toolCall?: ToolCall): string {
  return toolCall?.function?.arguments || "{}"; // nullish coalescing
}
```

### 4. 戻り値型の明示的な宣言

関数やメソッドには必ず明示的な戻り値型を宣言します：

```typescript
// 戻り値型の明示的な宣言
function processJsonBuffer(buffer: string): { valid: boolean; json: any } {
  // 実装...
  return { valid: true, json: {} };
}
```

### 5. ジェネリック型の活用

再利用可能な型パターンにはジェネリック型を使用します：

```typescript
// ジェネリック型の使用例
export interface Result<T> {
  success: boolean;
  value?: T;
  error?: Error;
}

// 使用例
function processApiResponse<T>(response: Response): Promise<Result<T>> {
  // 実装...
}
```

### 6. 型アサーションの最小化

型アサーション（`as`キーワード）の使用は最小限に抑え、必要な場合のみ使用します：

```typescript
// 避けるべき例：過剰な型アサーション
const data = JSON.parse(json) as { name: string; age: number }; // 本当に正しい型か不明

// 良い例：型ガードを使用
const parsedData = JSON.parse(json);
if (
  typeof parsedData === "object" && 
  parsedData !== null && 
  "name" in parsedData && 
  typeof parsedData.name === "string" &&
  "age" in parsedData && 
  typeof parsedData.age === "number"
) {
  // ここでparsedDataはname:stringとage:numberを持つことが確認された
  const data = parsedData as { name: string; age: number };
  // 処理...
}
```

## 型定義の使用ガイドライン

Databricksインテグレーションで型定義を使用する際の一般的なガイドライン：

1. **型のインポート**: 必要な型は`types/index.ts`からインポートします：
   ```typescript
   import { ToolCall, StreamingChunk, ChatMessage } from "./types/index.js";
   ```

2. **新しい型の追加**: 新しい型を追加する場合は、適切なファイルに追加し、必要に応じて`index.ts`でエクスポートします。

3. **型拡張**: コア型を拡張する場合は、`extension.d.ts`に追加します。

4. **バージョン互換性**: 型変更を行う際は、既存のコードとの互換性に注意します。

5. **型ドキュメント**: 複雑な型定義にはJSDocコメントを追加して説明します：
   ```typescript
   /**
    * Databricksサーバーからのストリーミングチャンク。
    * 思考プロセスかコンテンツデルタのいずれかを含む可能性がある。
    */
   export interface StreamingChunk {
     // プロパティ定義...
   }
   ```

## 最近の型定義の改善点

### 1. メッセージコンテンツ型の処理強化 (2025年5月)

`MessageContent`型の処理を改善し、文字列と配列の両方のケースで安全に動作するように型定義を強化：

```typescript
// 修正前の問題のあるコード
lastYieldedMessageContent = currentMessage.content;

// 修正後の安全なコード
const contentAsString = extractContentAsString(currentMessage.content);
lastYieldedMessageContent = contentAsString;
```

関連する`extractContentAsString`関数の型定義も強化：

```typescript
/**
 * メッセージコンテンツを安全に文字列として抽出する関数
 * @param content メッセージコンテンツ（文字列またはMessagePart[]）
 * @returns 常に文字列を返す
 */
export function extractContentAsString(content: unknown): string {
  if (typeof content === "string") {
    return content;
  } else if (Array.isArray(content)) {
    return content
      .map(part => {
        if (part.type === "text" && typeof part.text === "string") {
          return part.text;
        }
        return part.type === "image" ? "[画像]" : "";
      })
      .join("");
  }
  return String(content || "");
}
```

### 2. ツール呼び出し処理の型安全性向上 (2025年5月)

ツール呼び出し処理のフローをより型安全にするための明示的なインターフェース導入：

```typescript
// ツール呼び出し処理の結果を表す明示的なインターフェース
export interface ToolCallResult {
  updatedToolCalls: ToolCall[];
  updatedCurrentToolCall: ToolCall | null;
  updatedCurrentToolCallIndex: number | null;
  updatedJsonBuffer: string;
  updatedIsBufferingJson: boolean;
  shouldYieldMessage: boolean;
}
```

このインターフェースにより、以前は暗黙的に型付けされていたオブジェクトが明示的に型付けされるようになり、型安全性が向上しました。

### 3. インデックス型の安全性向上 (2025年5月)

配列インデックスの安全性を向上させるための変更：

```typescript
// インデックスの型安全な処理のためのユーティリティ関数
export function ensureValidIndex(index: number | null, arrayLength: number): number | null {
  if (index === null) {
    return null;
  }
  
  const numericIndex = Number(index);
  return !Number.isNaN(numericIndex) && numericIndex >= 0 && numericIndex < arrayLength
    ? numericIndex
    : null;
}

// 使用例
const safeIndex = ensureValidIndex(currentToolCallIndex, toolCalls.length);
if (safeIndex !== null) {
  // 安全にアクセス可能
  const currentToolCall = toolCalls[safeIndex];
}
```

これにより、配列境界外アクセスなどの一般的な問題を防止できます。

## 今後の改善計画

### 1. より厳格なツール引数の型定義

ツール引数のJSONスキーマに基づいた厳格な型定義の導入：

```typescript
// 将来の改善例：ツール固有の引数型の定義
export interface SearchToolArguments {
  query: string;
  limit?: number;
  [key: string]: any;
}

export interface FileToolArguments {
  path: string;
  content?: string;
  [key: string]: any;
}

// ツール名に基づいた型マッピング
export type ToolArgumentsMap = {
  "search_docs": SearchToolArguments;
  "create_file": FileToolArguments;
  // 他のツール...
};

// ジェネリックツール処理関数
function processToolArguments<T extends keyof ToolArgumentsMap>(
  toolName: T,
  args: string
): ToolArgumentsMap[T] {
  // 実装...
}
```

### 2. エラー処理の型安全性向上

より型安全なエラー処理のための型定義強化：

```typescript
// エラー結果を表す型
export interface ErrorResult<T> {
  success: false;
  error: Error;
  state: T;
}

// 成功結果を表す型
export interface SuccessResult<T, R> {
  success: true;
  result: R;
  state: T;
}

// 結合型
export type Result<T, R> = ErrorResult<T> | SuccessResult<T, R>;

// 使用例
function processRequest<T, R>(
  params: T
): Result<T, R> {
  try {
    // 処理...
    return { success: true, result: resultValue, state: params };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error : new Error(String(error)),
      state: params
    };
  }
}
```

これらの型定義により、コードの安全性と保守性が大幅に向上します。型システムを効果的に活用することで、多くのバグを未然に防ぎ、コードの自己文書化機能を強化できます。
