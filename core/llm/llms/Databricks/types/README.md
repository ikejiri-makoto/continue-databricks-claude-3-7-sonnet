# Databricks LLM Types

このディレクトリには、Databricks Claude 3.7 Sonnetインテグレーションで使用される型定義が含まれています。型定義は、コード全体の型安全性を確保し、開発時のエラー検出を強化するために重要な役割を果たします。

## モジュール構造と責任分担

```
types/
├── index.ts         (型定義のエントリーポイント - すべての型をエクスポート)
├── types.ts         (主要な型定義 - 専用インターフェースを定義)
└── extension.d.ts   (型拡張定義 - コア型をDatabricks固有の要件で拡張)
```

### 各ファイルの明確な責任

**1. `index.ts` - エントリーポイント**
- 型定義のエントリーポイントとして機能
- `types.ts`からすべての型定義をエクスポート
- 型拡張定義をインポート

**2. `types.ts` - 主要な型定義**
- Databricks固有のインターフェース定義
- ツール呼び出し型の定義
- ストリーミング関連の型定義
- レスポンス処理の型定義
- 状態管理のインターフェース

**3. `extension.d.ts` - 型拡張定義**
- コアモジュールの既存型をDatabricks固有の要件で拡張
- 三重スラッシュ参照ディレクティブによる型参照
- フォールバックとしてのインライン型定義

## 主要な型定義

### 1. ベース型定義

```typescript
// ツール呼び出しの型定義
export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}
```

### 2. ストリーミング関連の型定義

```typescript
// Databricksの思考（Thinking）チャンク型定義
export interface ThinkingChunk {
  thinking?: string | object;
  signature?: string;
}

// Databricksレスポンスデルタの型定義
export interface ResponseDelta {
  content?: string;
  tool_calls?: {
    index: number;
    id?: string;
    function?: {
      name?: string;
      arguments?: string;
    }
  }[];
}

// ストリーミングチャンクの型定義
export interface StreamingChunk {
  thinking?: ThinkingChunk;
  choices?: {
    delta: ResponseDelta;
  }[];
}
```

### 3. 処理結果の型定義

```typescript
// ストリーミング処理の結果型定義
export interface StreamingResult {
  updatedMessage: ChatMessage;
  updatedToolCalls: ToolCall[];
  updatedCurrentToolCall: ToolCall | null;
  updatedCurrentToolCallIndex: number | null;
  updatedJsonBuffer: string;
  updatedIsBufferingJson: boolean;
  thinkingMessage?: ChatMessage;
  shouldYieldMessage: boolean;
}

// ツール呼び出し処理の結果型定義
export interface ToolCallResult {
  updatedToolCalls: ToolCall[];
  updatedCurrentToolCall: ToolCall | null;
  updatedCurrentToolCallIndex: number | null;
  updatedJsonBuffer: string;
  updatedIsBufferingJson: boolean;
  shouldYieldMessage: boolean;
}
```

### 4. 状態管理の型定義

```typescript
// 永続的なストリーム状態の型定義
export interface PersistentStreamState {
  jsonBuffer: string;
  isBufferingJson: boolean;
  toolCallsInProgress: ToolCall[];
  currentToolCallIndex: number | null;
  contentBuffer: string;
  lastReconnectTimestamp: number;
}
```

## 型拡張

既存のコア型定義を拡張してDatabricks固有の機能をサポートしています：

### 1. LLMOptionsの拡張

```typescript
interface LLMOptions {
  /**
   * 思考プロセスを常にログに表示するかどうかの設定
   * trueの場合は常に表示、falseの場合は開発モードのみ表示
   */
  thinkingProcess?: boolean;
}
```

### 2. CompletionOptionsの拡張

```typescript
interface CompletionOptions {
  /**
   * リクエストのタイムアウト (秒)
   * デフォルトは300秒 (5分)
   */
  requestTimeout?: number;
}
```

### 3. ThinkingChatMessageの拡張

```typescript
interface ThinkingChatMessage extends ChatMessage {
  role: "thinking";
  content: string | object;
  signature?: string;
  redactedThinking?: string;
  toolCalls?: any[];
}
```

## 共通ユーティリティとの連携

型定義は共通ユーティリティと密接に連携し、以下の原則に従っています：

### 1. 厳格な型チェック

```typescript
// nullかundefinedかを明確に区別する型
function processToolCall(
  toolCall: ToolCall | null,
  index: number | null
): ToolCallResult {
  // 実装
}
```

### 2. 型安全なエラー処理

```typescript
// エラー処理における型安全性の確保
try {
  // API呼び出しやその他の操作
} catch (error: unknown) {
  // 型を明示的に絞り込む
  if (error instanceof Error) {
    // Errorオブジェクトとして処理
  } else if (typeof error === 'string') {
    // 文字列エラーメッセージとして処理
  } else {
    // その他の型のエラーを処理
  }
}
```

### 3. 状態管理の型サポート

```typescript
// ストリーミング状態を型安全に管理
const initialState: PersistentStreamState = {
  jsonBuffer: "",
  isBufferingJson: false,
  toolCallsInProgress: [],
  currentToolCallIndex: null,
  contentBuffer: "",
  lastReconnectTimestamp: Date.now()
};
```

## ベストプラクティス

Databricks型定義を拡張または使用する際は、以下のベストプラクティスに従ってください：

### 1. 明示的な型アノテーション

- 関数シグネチャに明示的な型を使用する
- 戻り値の型を明示的に指定する
- 複雑なオブジェクトに型アノテーションを追加する

```typescript
function processStream(
  chunk: StreamingChunk, 
  state: PersistentStreamState
): StreamingResult {
  // 実装
}
```

### 2. NULL安全性の確保

- null可能な値には必ず条件チェックを行う
- オプショナルプロパティには安全にアクセスする
- nullとundefinedを明確に区別する

```typescript
// null安全なアクセス
const toolName = toolCall?.function?.name || "unknown";

// nullとundefinedの区別
const index: number | null = value !== undefined 
  ? Number(value) 
  : null;
```

### 3. 型の絞り込み

- 型ガードを使用して複雑な型を絞り込む
- instanceofやtypeof演算子を活用する
- カスタム型ガード関数を作成する

```typescript
// カスタム型ガード関数
function isThinkingChunk(chunk: unknown): chunk is ThinkingChunk {
  if (typeof chunk !== 'object' || chunk === null) return false;
  return 'thinking' in chunk || 'signature' in chunk;
}

// 型ガードの使用
if (isThinkingChunk(response)) {
  // responseはThinkingChunk型として処理可能
}
```

### 4. 型拡張の明確な文書化

- 型拡張には常にJSDocコメントを添付する
- なぜ拡張が必要なのかを説明する
- デフォルト値や使用例を提供する

```typescript
/**
 * リクエストのタイムアウト設定オプション
 * 
 * @param seconds タイムアウト時間（秒）
 * @default 300 (5分)
 * @example
 * const options = { requestTimeout: 600 }; // 10分のタイムアウト
 */
```

これらのガイドラインを遵守することで、型安全性が向上し、バグの発生を未然に防止できます。

## 共通ユーティリティの活用強化

型定義の使用時には、以下の共通ユーティリティを活用してください：

### 1. 型安全なJSON処理

```typescript
// jsonユーティリティと型定義の連携
import { safeJsonParse } from "../../../utils/json.js";
import type { StreamingChunk } from "../types/index.js";

// 型安全なJSONパース
const chunk = safeJsonParse<StreamingChunk>(jsonText, defaultChunk);
```

### 2. エラー処理と型の連携

```typescript
// エラーユーティリティと型定義の連携
import { getErrorMessage } from "../../../utils/errors.js";
import type { PersistentStreamState } from "../types/index.js";

// 型安全なエラー処理
try {
  // 処理
} catch (error: unknown) {
  const state: PersistentStreamState = {
    // エラー発生時の状態復元
  };
  console.error(`エラーが発生しました: ${getErrorMessage(error)}`);
}
```

### 3. ストリーム処理と型の連携

```typescript
// ストリーム処理ユーティリティと型定義の連携
import { processContentDelta } from "../../../utils/streamProcessing.js";
import type { ResponseDelta } from "../types/index.js";

// 型安全なストリーム処理
const delta: ResponseDelta = {
  content: "新しいコンテンツ"
};
const updatedContent = processContentDelta(currentContent, delta.content);
```

これらの共通ユーティリティを活用することで、型安全性を保ちながらコードの重複を削減できます。