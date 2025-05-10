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
- 明示的に`DatabricksCompletionOptions`型など主要な型をエクスポート
- 型拡張定義をインポート
- 型定義の可視性と参照性を向上

**2. `types.ts` - 主要な型定義**
- Databricks固有のインターフェース定義
- `DatabricksCompletionOptions`型の定義 - CompletionOptionsを拡張
- `DatabricksChatMessage`型の定義 - ChatMessageを拡張
- ツール呼び出し型の定義
- ストリーミング関連の型定義
- レスポンス処理の型定義
- 状態管理のインターフェース
- JSONデルタ処理関連の型定義
- エラー処理関連の型定義
- モジュール間で共有される型の標準化
- モジュールインターフェース型の定義

**3. `extension.d.ts` - 型拡張定義**
- コアモジュールの既存型をDatabricks固有の要件で拡張
- 三重スラッシュ参照ディレクティブによる型参照
- フォールバックとしてのインライン型定義
- コアモジュールとの互換性維持

## オーケストレーターパターンをサポートする型定義

各モジュールの明確な責任分担をサポートするために、型定義は以下の役割を果たします:

1. **モジュール間インターフェースの定義**: 
   - 各モジュールが他のモジュールとやり取りするための型を定義
   - 一貫した型構造でモジュール間の通信を標準化
   - 明示的な型定義でモジュールの責任境界を強調

2. **状態管理のサポート**:
   - ストリーミング状態の型定義を提供
   - エラー処理結果の型構造を標準化
   - 状態の永続化と復元の型安全性を確保

3. **共通データ構造の定義**:
   - ツール呼び出しとレスポンスの標準構造を定義
   - 処理結果の一貫した型を提供
   - JSON処理と蓄積の状態追跡を型安全に

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
  toolCallId?: string; // 互換性のために追加
}
```

### 2. Databricks固有の完了オプション型

```typescript
/**
 * Databricks固有の完了オプション
 * 基本のCompletionOptionsを拡張し、Databricks特有のオプションを追加
 */
export interface DatabricksCompletionOptions extends CompletionOptions {
  /**
   * 並列ツール呼び出しを有効にするかどうか
   * @default false
   */
  parallel_tool_calls?: boolean;
  
  /**
   * リクエストのタイムアウト (秒)
   * デフォルトは300秒 (5分)
   */
  requestTimeout?: number;
}
```

### 3. Databricks固有のメッセージ型

```typescript
/**
 * 拡張されたChatMessage型（Databricks特有のプロパティを含む）
 */
export type DatabricksChatMessage = ChatMessage & {
  signature?: string;
  toolCallId?: string;
};
```

### 4. ストリーミング関連の型定義

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

### 5. 処理結果とストリーミング状態の型定義

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

### 6. JSONデルタ処理の型定義

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

### 7. エラー処理関連の型定義

```typescript
// ストリーミング状態インターフェース
export interface StreamingState {
  jsonBuffer: string;
  isBufferingJson: boolean;
  toolCalls: ToolCall[];
  currentToolCallIndex: number | null;
  [key: string]: any; // 追加のプロパティを許可
}

// エラー処理結果インターフェース
export interface ErrorHandlingResult {
  success: boolean;
  messages: ChatMessage[];
  error: Error;
  state: StreamingState;
}

// エラーレスポンスインターフェース
export interface ErrorResponse {
  error?: {
    message?: string;
    type?: string;
    code?: string;
    param?: string;
  };
  message?: string;
  status?: number;
}
```

## オーケストレーターパターン用のモジュールインターフェース型

責任分担を明確にするための各モジュールのインターフェース型を追加しました：

```typescript
/**
 * 設定管理モジュールのインターフェース
 */
export interface ConfigManagerInterface {
  getConfig(options?: DatabricksCompletionOptions): DatabricksConfig;
  normalizeApiUrl(url: string): string;
  validateApiConfig(apiKey: string | undefined, apiBase: string | undefined): void;
  setupTimeoutController(signal: AbortSignal, options: DatabricksCompletionOptions): {
    timeoutController: AbortController;
    timeoutId: NodeJS.Timeout;
    combinedSignal: AbortSignal;
  };
}

/**
 * エラー処理モジュールのインターフェース
 */
export interface ErrorHandlerInterface {
  parseErrorResponse(response: Response): Promise<{ error: Error }>;
  handleRetry(retryCount: number, error: unknown, state?: any): Promise<boolean>;
  withRetry<T>(operation: () => Promise<T>, state?: any): Promise<T>;
  handleStreamingError(error: unknown, state: StreamingState): ErrorHandlingResult;
  isTransientError(error: unknown): boolean;
}

/**
 * ストリーミング処理モジュールのインターフェース
 */
export interface StreamProcessorInterface {
  processStreamingResponse(
    response: Response,
    messages: ChatMessage[],
    retryCount: number,
    alwaysLogThinking: boolean
  ): Promise<{
    success: boolean;
    messages: ChatMessage[];
    error?: Error;
    state?: any;
  }>;
  
  processChunk(
    chunk: StreamingChunk,
    currentMessage: ChatMessage,
    toolCalls: ToolCall[],
    currentToolCall: ToolCall | null,
    currentToolCallIndex: number | null,
    jsonBuffer: string,
    isBufferingJson: boolean,
    messages: ChatMessage[],
    isReconnect?: boolean
  ): StreamingResult;
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

## 最近の改善点

### 型定義の整理と明確化

1. **重複定義の統合**
   - `Databricks/types.ts`と`Databricks/types/types.ts`に分散していた型定義を統合
   - 後方互換性のため、`types.ts`ファイルを非推奨としてマーク

2. **モジュールインターフェース型の追加**
   - 各モジュールの責任を明確にするインターフェース型を追加
   - オーケストレーターパターンの実装をサポート
   - モジュール間の連携を型安全に

3. **JSDocドキュメントの強化**
   - すべての型定義に詳細なJSDocコメントを追加
   - パラメータと戻り値の詳細な説明
   - 使用例の追加

4. **型階層の明確化**
   - 拡張型と基本型の関係を明確に
   - インポート/エクスポートパスの整理
   - 型参照の最適化

## ベストプラクティス

Databricks型定義を使用する際は、以下のベストプラクティスに従ってください：

### 1. 型のインポート方法

```typescript
// 推奨: types/index.tsからインポート
import { 
  DatabricksCompletionOptions, 
  ToolCall 
} from "./Databricks/types/index.js";

// 非推奨: 直接types.tsをインポート
import { ToolCall } from "./Databricks/types.ts"; // このファイルは非推奨
```

### 2. モジュールインターフェース型の活用

```typescript
// モジュールインターフェース型を実装
import { ConfigManagerInterface } from "./types/index.js";

/**
 * 設定管理モジュール
 * インターフェースを実装することで責任を明確に
 */
export class DatabricksConfig implements ConfigManagerInterface {
  // インターフェースで定義されたメソッドを実装
  static getConfig(options?: DatabricksCompletionOptions): DatabricksConfig {
    // 実装
  }
  
  static normalizeApiUrl(url: string): string {
    // 実装
  }
  
  // 他のメソッド...
}
```

### 3. 型安全なエラー処理

```typescript
import { 
  ErrorHandlingResult, 
  StreamingState 
} from "./types/index.js";

try {
  // 処理
} catch (error: unknown) {
  // 型安全なエラー処理結果の構築
  const result: ErrorHandlingResult = {
    success: false,
    messages: [],
    error: error instanceof Error ? error : new Error(getErrorMessage(error)),
    state: {
      jsonBuffer: "",
      isBufferingJson: false,
      toolCalls: [],
      currentToolCallIndex: null
    }
  };
}
```

### 4. 共通ユーティリティとの連携

```typescript
import { safeJsonParse } from "../../../utils/json.js";
import { StreamingChunk } from "./types/index.js";

// 型安全なJSONパース
const chunk = safeJsonParse<StreamingChunk>(jsonText, {
  choices: [{
    delta: { content: "" }
  }]
});
```

## モジュール間のインターフェースをサポートする型定義

オーケストレーターパターンの中心となる`Databricks.ts`クラスは、各モジュールを調整する役割を果たします。型定義はこの連携を型安全に実現するために重要な役割を果たします：

```typescript
// オーケストレーターのメソッド例
async processStreamingRequest(
  messages: ChatMessage[], 
  signal: AbortSignal, 
  options: DatabricksCompletionOptions,
  retryCount: number
): Promise<{
  success: boolean;
  messages: ChatMessage[];
  error?: Error;
  state?: StreamingState;
}> {
  try {
    // 各モジュールの責任に応じた処理の委譲
    
    // 1. リクエストパラメータの構築をヘルパーモジュールに委譲
    const args = DatabricksHelpers.convertArgs(options);
    
    // 2. メッセージ変換をメッセージ処理モジュールに委譲
    const formattedMessages = MessageProcessor.convertToOpenAIFormat(
      messages, MessageProcessor.sanitizeMessages(messages)
    );
    
    // 3. URL正規化を設定管理モジュールに委譲
    const apiBaseUrl = this.apiBase ? 
      DatabricksConfig.normalizeApiUrl(this.apiBase) : "";
    
    // 4. タイムアウトコントローラ設定を設定管理モジュールに委譲
    const { timeoutController, timeoutId, combinedSignal } = 
      DatabricksConfig.setupTimeoutController(signal, options);
    
    // 5. APIリクエスト
    const response = await this.fetch(apiBaseUrl, {
      // リクエスト設定
    });
    
    // 6. ストリーミングレスポンス処理をストリーミングモジュールに委譲
    const streamResult = await StreamingProcessor.processStreamingResponse(
      response, messages, retryCount, this.alwaysLogThinking
    );
    
    // 処理結果を返却
    return streamResult;
  } catch (error: unknown) {
    // 7. エラー結果の構築
    return { 
      success: false, 
      messages: [], 
      error: error instanceof Error ? error : new Error(getErrorMessage(error)) 
    };
  }
}
```

このように、型定義によってモジュール間のインターフェースが明確に定義され、オーケストレーターパターンの実装がより堅牢になります。
