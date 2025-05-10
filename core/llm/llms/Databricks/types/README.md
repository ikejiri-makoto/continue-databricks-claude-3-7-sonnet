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
  /** ツール呼び出しの一意の識別子 */
  id: string;
  /** ツールタイプ - 現在は"function"のみサポート */
  type: "function";
  /** 関数情報 */
  function: {
    /** 関数名 */
    name: string;
    /** 関数の引数（JSON文字列） */
    arguments: string;
  };
}

// ツール結果メッセージの型定義
export interface ToolResultMessage {
  /** メッセージの役割 - 'tool'に固定 */
  role: 'tool';
  /** 対応するツール呼び出しのID */
  tool_call_id: string;
  /** ツール実行結果の内容 */
  content: string;
  /** 代替のツール呼び出しID（互換性のために提供） */
  toolCallId?: string;
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
  /** Databricks固有の署名情報 */
  signature?: string;
  /** ツール呼び出しID（互換性のために提供） */
  toolCallId?: string;
};
```

### 4. ストリーミング関連の型定義

```typescript
// Databricksの思考（Thinking）チャンク型定義
export interface ThinkingChunk {
  /** 思考内容 - 文字列またはオブジェクト */
  thinking?: string | object;
  /** 署名情報 */
  signature?: string;
}

// Databricksレスポンスデルタの型定義
export interface ResponseDelta {
  /** コンテンツのデルタ */
  content?: string;
  /** ツール呼び出しのデルタ情報 */
  tool_calls?: {
    /** 配列内のインデックス */
    index: number;
    /** ツール呼び出しID（部分的な場合もある） */
    id?: string;
    /** 関数情報（部分的な場合もある） */
    function?: {
      /** 関数名（部分的な場合もある） */
      name?: string;
      /** 関数引数（部分的な場合もある） */
      arguments?: string;
    }
  }[];
}

// ストリーミングチャンクの型定義
export interface StreamingChunk {
  /** 思考プロセス情報（存在する場合） */
  thinking?: ThinkingChunk;
  /** 選択肢（通常は1つのみ） */
  choices?: {
    /** デルタ情報 */
    delta: ResponseDelta;
  }[];
}
```

### 5. 処理結果とストリーミング状態の型定義

```typescript
// ストリーミング処理の結果型定義
export interface StreamingResult {
  /** 更新されたメッセージ */
  updatedMessage: ChatMessage;
  /** 更新されたツール呼び出し配列 */
  updatedToolCalls: ToolCall[];
  /** 更新された現在のツール呼び出し（または null） */
  updatedCurrentToolCall: ToolCall | null;
  /** 更新された現在のツール呼び出しインデックス（または null） */
  updatedCurrentToolCallIndex: number | null;
  /** 更新されたJSONバッファ */
  updatedJsonBuffer: string;
  /** 更新されたJSONバッファリングフラグ */
  updatedIsBufferingJson: boolean;
  /** 思考メッセージ（存在する場合） */
  thinkingMessage?: ChatMessage;
  /** メッセージを生成すべきかどうかのフラグ */
  shouldYieldMessage: boolean;
}

// 永続的なストリーム状態の型定義
export interface PersistentStreamState {
  /**
   * 未完成のJSONをバッファするための文字列
   */
  jsonBuffer: string;
  
  /**
   * JSONバッファリング中かどうかを示すフラグ
   */
  isBufferingJson: boolean;
  
  /**
   * 処理中のツール呼び出し配列
   */
  toolCallsInProgress: ToolCall[];
  
  /**
   * 現在処理中のツール呼び出しインデックス
   */
  currentToolCallIndex: number | null;
  
  /**
   * 部分的なコンテンツをバッファするための文字列
   */
  contentBuffer: string;
  
  /**
   * 最後の再接続タイムスタンプ
   */
  lastReconnectTimestamp: number;
}
```

### 6. JSONデルタ処理の型定義

```typescript
// JSONデルタ処理の結果型定義
export interface JsonDeltaResult {
  /** 結合されたJSON文字列 */
  combined: string;
  /** JSONが完全かどうかを示すフラグ */
  complete: boolean;
  /** JSONが有効かどうかを示すフラグ */
  valid: boolean;
}

// ツール引数デルタ処理の結果型定義
export interface ToolArgumentsDeltaResult {
  /** 処理された引数文字列 */
  processedArgs: string;
  /** 引数が完全かどうかを示すフラグ */
  isComplete: boolean;
}

// JSONパターン検出と修復の結果型定義
export interface JsonRepairResult {
  /** 修復されたJSON文字列 */
  repaired: string;
  /** 修正が行われたかどうかを示すフラグ */
  wasModified: boolean;
  /** 検出されたパターン（存在する場合） */
  detectedPattern?: string;
}
```

### 7. エラー処理関連の型定義

```typescript
// ストリーミング状態インターフェース
export interface StreamingState {
  /** JSONバッファ */
  jsonBuffer: string;
  /** JSONバッファリングフラグ */
  isBufferingJson: boolean;
  /** ツール呼び出し配列 */
  toolCalls: ToolCall[];
  /** 現在のツール呼び出しインデックス */
  currentToolCallIndex: number | null;
  /** その他の状態プロパティを許可 */
  [key: string]: any;
}

// エラー処理結果インターフェース
export interface ErrorHandlingResult {
  /** 成功したかどうかのフラグ */
  success: boolean;
  /** メッセージ配列 */
  messages: ChatMessage[];
  /** エラーオブジェクト */
  error: Error;
  /** 状態情報 */
  state: StreamingState;
}

// エラーレスポンスインターフェース
export interface ErrorResponse {
  /** エラー情報 */
  error?: {
    /** エラーメッセージ */
    message?: string;
    /** エラータイプ */
    type?: string;
    /** エラーコード */
    code?: string;
    /** エラーパラメータ */
    param?: string;
  };
  /** 直接のメッセージ（error.messageがない場合に使用） */
  message?: string;
  /** HTTPステータスコード */
  status?: number;
}

// リトライ結果インターフェース
export interface RetryResult {
  /** 成功したかどうかのフラグ */
  success: boolean;
  /** リトライすべきかどうかのフラグ */
  shouldRetry: boolean;
  /** エラーオブジェクト（存在する場合） */
  error?: Error;
  /** 状態情報（存在する場合） */
  state?: StreamingState;
}
```

## オーケストレーターパターンのためのモジュールインターフェース型

責任分担を明確にするための各モジュールのインターフェース型を追加しました：

```typescript
/**
 * 設定管理モジュールのインターフェース
 * 設定関連の操作を提供
 */
export interface ConfigManagerInterface {
  /** 設定を取得 */
  getConfig(options?: DatabricksCompletionOptions): DatabricksConfig;
  
  /** APIベースURLを正規化 */
  normalizeApiUrl(url: string): string;
  
  /** API設定を検証 */
  validateApiConfig(apiKey: string | undefined, apiBase: string | undefined): void;
  
  /** タイムアウトコントローラを設定 */
  setupTimeoutController(
    signal: AbortSignal, 
    options: DatabricksCompletionOptions
  ): {
    timeoutController: AbortController;
    timeoutId: NodeJS.Timeout;
    combinedSignal: AbortSignal;
  };
}

/**
 * エラー処理モジュールのインターフェース
 * エラー処理関連の操作を提供
 */
export interface ErrorHandlerInterface {
  /** エラーレスポンスをパース */
  parseErrorResponse(response: Response): Promise<{ error: Error }>;
  
  /** リトライ処理 */
  handleRetry(retryCount: number, error: unknown, state?: any): Promise<boolean>;
  
  /** 汎用的なリトライラッパー */
  withRetry<T>(operation: () => Promise<T>, state?: any): Promise<T>;
  
  /** ストリーミングエラーの処理 */
  handleStreamingError(error: unknown, state: StreamingState): ErrorHandlingResult;
  
  /** 一時的なエラーかどうかを判定 */
  isTransientError(error: unknown): boolean;
}

/**
 * ストリーミング処理モジュールのインターフェース
 * ストリーミング処理関連の操作を提供
 */
export interface StreamProcessorInterface {
  /** ストリーミングレスポンスを処理 */
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
  
  /** ストリーミングチャンクを処理 */
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
  
  /** 永続的なストリーム状態を取得 */
  getPersistentState(): PersistentStreamState;
  
  /** 永続的なストリーム状態を更新 */
  updatePersistentState(newState: Partial<PersistentStreamState>): void;
  
  /** 永続的なストリーム状態をリセット */
  resetPersistentState(): void;
}

/**
 * メッセージ処理モジュールのインターフェース
 * メッセージ処理関連の操作を提供
 */
export interface MessageProcessorInterface {
  /** メッセージをOpenAI形式に変換 */
  convertToOpenAIFormat(messages: ChatMessage[], sanitizedMessages: any[]): any[];
  
  /** メッセージを標準化 */
  sanitizeMessages(messages: ChatMessage[]): any[];
  
  /** 思考プロセスメッセージを作成 */
  createThinkingMessage(content: string | object, signature?: string): ThinkingChatMessage;
}

/**
 * ツール呼び出し処理モジュールのインターフェース
 * ツール呼び出し処理関連の操作を提供
 */
export interface ToolCallProcessorInterface {
  /** ツール呼び出しとツール結果を前処理 */
  preprocessToolCallsAndResults(messages: ChatMessage[]): ChatMessage[];
  
  /** ツール引数を処理 */
  processToolArguments(
    args: string,
    toolName: string,
    messages: ChatMessage[]
  ): string;
  
  /** ツール呼び出しを処理 */
  processToolCall(
    toolCall: ToolCall | null,
    currentToolCallIndex: number | null,
    jsonBuffer: string,
    isBufferingJson: boolean,
    toolCallDelta: any,
    toolCalls: ToolCall[]
  ): ToolCallResult;
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
  /**
   * メッセージの役割 - "thinking"に固定
   */
  role: "thinking";
  
  /**
   * 思考プロセスの内容 - 文字列またはオブジェクト
   */
  content: string | object;
  
  /**
   * 思考プロセスの署名情報
   * Databricks特有の署名を保持します
   */
  signature?: string;
  
  /**
   * 編集済み思考内容
   * 元の思考内容から編集された結果を保持します
   */
  redactedThinking?: string;
  
  /**
   * ツール呼び出し情報
   * 思考プロセス内のツール呼び出しを保持します
   */
  toolCalls?: any[];
}
```

## 最近の改善点

### 型定義の整理と明確化

1. **重複定義の統合**
   - `Databricks/types.ts`と`Databricks/types/types.ts`に分散していた型定義を統合
   - 後方互換性のため、`types.ts`ファイルを非推奨としてマーク
   - すべての型定義を`types/types.ts`に集約し、明確な階層構造を作成

2. **モジュールインターフェース型の追加**
   - 各モジュールの責任を明確にするインターフェース型を追加
   - オーケストレーターパターンの実装をサポート
   - モジュール間の連携を型安全にする基盤を整備
   - 責任の境界を型システムで明示的に表現

3. **JSDocドキュメントの強化**
   - すべての型定義に詳細なJSDocコメントを追加
   - パラメータと戻り値の詳細な説明を提供
   - 使用例を追加して実際の使用方法を明確化
   - 型の目的と使用コンテキストを明文化

4. **型階層の明確化**
   - 拡張型と基本型の関係を明確に定義
   - インポートとエクスポートのパスを整理
   - 型参照の最適化により可視性と参照性を向上
   - 型拡張の仕組みを明確に文書化

5. **エラー処理関連の型強化**
   - `StreamingState`インターフェースの追加による状態管理の型安全化
   - `ErrorHandlingResult`インターフェースの追加でエラー処理結果を標準化
   - `ErrorResponse`インターフェースによるAPI応答の型安全な処理
   - `RetryResult`インターフェースの追加でリトライプロセスを型安全に

6. **ストリーミング処理の型強化**
   - `StreamingResult`インターフェースの拡張で処理結果をより明確に
   - `PersistentStreamState`の詳細化で状態管理を改善
   - `StreamingChunk`と`ResponseDelta`の関係を明確に定義
   - 状態遷移と更新の型安全性を向上

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

### 4. NULL安全性の確保

```typescript
// NULL安全なアクセス
function processToolCall(toolCall: ToolCall | null): void {
  // nullチェックを必ず行う
  if (toolCall === null) {
    return;
  }
  
  // ここではtoolCallがnullでないことが保証されている
  const toolName = toolCall.function.name;
  // 処理...
}

// インデックスの安全な処理
function getToolCallByIndex(toolCalls: ToolCall[], index: number | null): ToolCall | null {
  if (index === null) {
    return null;
  }
  
  if (index < 0 || index >= toolCalls.length) {
    return null;
  }
  
  return toolCalls[index];
}
```

### 5. 共通ユーティリティとの連携

```typescript
import { safeJsonParse } from "../../../utils/json.js";
import { StreamingChunk } from "./types/index.js";

// 型安全なJSONパース
const chunk = safeJsonParse<StreamingChunk>(jsonText, {
  choices: [{
    delta: { content: "" }
  }]
});

// 安全なJSONデルタ処理
import { processJsonDelta } from "../../../utils/json.js";
import { JsonDeltaResult } from "./types/index.js";

const result: JsonDeltaResult = processJsonDelta(currentJson, deltaJson);
if (result.complete && result.valid) {
  // 完全で有効なJSONとして処理
}
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

このように、型定義によってモジュール間のインターフェースが明確に定義され、オーケストレーターパターンの実装がより堅牢になります。各モジュールが型安全に連携することで、コード全体の保守性と拡張性が向上します。
