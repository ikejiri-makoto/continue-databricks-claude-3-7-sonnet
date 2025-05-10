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
- JSONデルタ処理関連の型定義

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

// ツール結果メッセージの型定義
export interface ToolResultMessage {
  role: 'tool';
  tool_call_id: string;
  content: string;
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

### 3. JSONデルタ処理の型定義

```typescript
// JSONデルタ処理の結果型定義
export interface JsonDeltaResult {
  combined: string;
  complete: boolean;
  valid: boolean;
}

// ツール引数デルタ処理の結果型定義
export interface ToolArgumentsDeltaResult {
  processedArgs: string;
  isComplete: boolean;
}

// JSONパターン検出と修復の結果型定義
export interface JsonRepairResult {
  repaired: string;
  wasModified: boolean;
  detectedPattern?: string;
}
```

### 4. 処理結果の型定義

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

### 5. 状態管理の型定義

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
  
  /**
   * 並列ツール呼び出しを許可するかどうか
   * falseの場合、一度に1つのツール呼び出しのみを処理する
   * OpenAIスタイルの並列制御に基づく
   */
  parallelToolCalls?: boolean;
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
  
  /**
   * 並列ツール呼び出しの設定
   * デフォルトはfalse (並列ツール呼び出しを無効化)
   */
  parallel_tool_calls?: boolean;
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

## JSONデルタ処理のための型安全なアプローチ

JSONデルタ処理のための型定義を強化し、より堅牢なコードを実現しています：

```typescript
/**
 * JSON断片を処理するための関数シグネチャ
 * 
 * @param currentJson 現在のJSON文字列
 * @param deltaJson 新しいJSONフラグメント
 * @returns 処理結果（結合されたJSON、完全性フラグ、有効性フラグ）
 */
function processJsonDelta(
  currentJson: string,
  deltaJson: string
): JsonDeltaResult;

/**
 * ツール呼び出し引数をデルタベースで処理するための関数シグネチャ
 * 
 * @param toolName ツール名（検索ツールの特別処理に使用）
 * @param currentArgs 現在の引数
 * @param deltaArgs 新しい引数フラグメント
 * @returns 処理結果（処理済み引数、完全性フラグ）
 */
function processToolArgumentsDelta(
  toolName: string | undefined,
  currentArgs: string,
  deltaArgs: string
): ToolArgumentsDeltaResult;

/**
 * JSONの二重化パターンを検出して修復するための関数シグネチャ
 * 
 * @param jsonStr 修復する可能性のあるJSON文字列
 * @returns 修復結果（修復されたJSON、修正されたかどうかのフラグ、検出されたパターン）
 */
function repairDuplicatedJsonPattern(
  jsonStr: string
): JsonRepairResult;
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

// 状態を含むエラー処理の一貫性
// すべてのエラーパターンでstateプロパティを含む一貫した値を返す
function handleError(error: unknown, state: StreamState): ErrorResult {
  // 共通のベース結果
  const baseResult = {
    success: false,
    error: error instanceof Error ? error : new Error(String(error))
  };
  
  if (isConnectionError(error)) {
    // 接続エラーの場合は現在の状態を保持
    return {
      ...baseResult,
      state: { ...state }  // 現在の状態をコピー
    };
  } else {
    // その他のエラーの場合も状態プロパティを含めるが初期化された値を使用
    return {
      ...baseResult,
      state: {            // 初期化された状態
        buffer: "",
        isProcessing: false
      }
    };
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

### 4. JSONデルタ処理の型安全な実装

```typescript
// JSONデルタ処理の型安全な実装
function processStreamingDelta(
  chunk: StreamingChunk, 
  state: PersistentStreamState
): StreamingResult {
  // デフォルト結果値の初期化
  const result: StreamingResult = {
    updatedMessage: { ...currentMessage },
    updatedToolCalls: [...state.toolCallsInProgress],
    updatedCurrentToolCall: null,
    updatedCurrentToolCallIndex: state.currentToolCallIndex,
    updatedJsonBuffer: state.jsonBuffer,
    updatedIsBufferingJson: state.isBufferingJson,
    shouldYieldMessage: false
  };

  // デルタにツール呼び出しが含まれている場合
  if (chunk.choices?.[0]?.delta?.tool_calls) {
    const toolCallDelta = chunk.choices[0].delta.tool_calls[0];
    
    // ツール呼び出しデルタの処理
    if (toolCallDelta.function?.arguments) {
      // JSONデルタの処理
      const argsResult = processToolArgumentsDelta(
        result.updatedCurrentToolCall?.function.name,
        result.updatedJsonBuffer,
        toolCallDelta.function.arguments
      );
      
      // 結果の更新
      result.updatedJsonBuffer = argsResult.processedArgs;
      result.updatedIsBufferingJson = !argsResult.isComplete;
      
      // JSONが完成した場合
      if (argsResult.isComplete && result.updatedCurrentToolCall) {
        result.updatedCurrentToolCall.function.arguments = argsResult.processedArgs;
        // ツール呼び出し配列を更新
        if (result.updatedCurrentToolCallIndex !== null) {
          result.updatedToolCalls[result.updatedCurrentToolCallIndex] = 
            result.updatedCurrentToolCall;
        }
        result.shouldYieldMessage = true;
      }
    }
  }
  
  return result;
}
```

## 最近の修正と改善点

### 型定義の整理と重複解決

最近の修正では、以下の型関連の問題を解決しました：

1. **ToolCall識別子の重複**: 
   - Databricks.tsファイルで `ToolCall` 型が2回インポートされていた問題を解決
   - 型インポートを一元化し、コードの読みやすさと保守性を向上

2. **ToolResultMessage型の追加**:
   - 不足していた `ToolResultMessage` インターフェースを追加
   - ツール呼び出し結果を明確に型付けすることで型安全性を強化
   - ツール結果の形式とプロパティを明示的に定義

3. **isValidJson関数の活用**:
   - 共通ユーティリティの `isValidJson` 関数を適切にインポートして使用
   - 標準的なJSON検証ロジックを活用し、コードの一貫性を確保

これらの修正により、以下の利点が得られました：
- 型安全性の向上と型エラーの削減
- 明確なモジュール境界の維持
- 共通ユーティリティの効果的な活用
- コードの可読性と保守性の改善

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

### 5. JSONデルタ処理の型安全な実装

- JSONデルタ処理の結果には明示的な型インターフェースを使用する
- 処理関数は返り値の型を明確に定義する
- 二重化パターン検出には専用の型を使用する

```typescript
// JSONデルタ処理の結果型
interface JsonDeltaResult {
  combined: string;   // 結合されたJSON
  complete: boolean;  // 完全なJSONか
  valid: boolean;     // 有効なJSONか
}

// 明示的な型を持つ関数実装
function processJsonDelta(
  currentJson: string,
  deltaJson: string
): JsonDeltaResult {
  // 実装
  return {
    combined: combinedJson,
    complete: isComplete,
    valid: isValid
  };
}
```

これらのガイドラインを遵守することで、型安全性が向上し、バグの発生を未然に防止できます。

## 共通ユーティリティの活用強化

型定義の使用時には、以下の共通ユーティリティを活用してください：

### 1. 型安全なJSON処理

```typescript
// jsonユーティリティと型定義の連携
import { safeJsonParse, processJsonDelta } from "../../../utils/json.js";
import type { 
  StreamingChunk, 
  JsonDeltaResult, 
  ToolArgumentsDeltaResult 
} from "../types/index.js";

// 型安全なJSONパース
const chunk = safeJsonParse<StreamingChunk>(jsonText, defaultChunk);

// 型安全なJSONデルタ処理
const result: JsonDeltaResult = processJsonDelta(currentJson, deltaJson);
if (result.complete && result.valid) {
  // 完全で有効なJSONの処理
}
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

### 4. JSONデルタ処理と型の連携

```typescript
// JSONデルタ処理ユーティリティと型定義の連携
import { 
  processJsonDelta, 
  repairDuplicatedJsonPattern 
} from "../../../utils/json.js";
import type { 
  JsonDeltaResult, 
  JsonRepairResult 
} from "../types/index.js";

// 型安全なJSONデルタ処理
const deltaResult: JsonDeltaResult = processJsonDelta(currentJson, deltaJson);

// 型安全なJSON修復
const repairResult: JsonRepairResult = repairDuplicatedJsonPattern(malformedJson);
if (repairResult.wasModified) {
  console.log(`検出されたパターン: ${repairResult.detectedPattern}`);
}
```

これらの共通ユーティリティを活用することで、型安全性を保ちながらコードの重複を削減できます。