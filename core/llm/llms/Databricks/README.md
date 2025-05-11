# Databricks LLM Integration for Continue

このディレクトリには、Continue VS Code拡張機能からDatabricksのLLMサービス（特にClaude 3.7 Sonnet）に接続するための実装が含まれています。Databricksホステッドモデルへのアクセスを可能にし、コードの補完、説明、リファクタリングなどの機能をContinue拡張機能内で提供します。

## モジュール間の関係と連携

Databricksインテグレーションは、メインの`Databricks.ts`クラスと、`Databricks/`ディレクトリ内の複数の特化したモジュールから構成されています。モジュール化された設計により、責任を明確に分離し、共通ユーティリティを最大限に活用しています。

### オーケストレーターパターンに基づくモジュール構造

```
core/
├── index.js                   (ChatMessage, CompletionOptions, LLMOptionsなどの基本型定義)
├── util/
│   └── messageContent.js      (チャットメッセージのレンダリング関数)
└── llm/
    ├── index.js               (BaseLLMクラス - すべてのLLM実装の基底クラス)
    ├── types/                 (共通型定義の拡張 - 適切な型安全性の確保)
    │   └── databricks-extensions.d.ts (Databricks用の拡張型定義)
    ├── llms/
    │   ├── Databricks.ts       (オーケストレーター - 各モジュールの統合・調整)
    │   └── Databricks/
    │       ├── config.ts       (設定管理 - API接続情報とタイムアウト設定の管理)
    │       ├── errors.ts       (エラー処理 - 専用エラー処理とリトライロジック)
    │       ├── helpers.ts      (ヘルパー関数 - リクエストパラメータ構築と初期化)
    │       ├── messages.ts     (メッセージ変換 - 標準化されたメッセージフォーマット)
    │       ├── streaming.ts    (ストリーム処理 - ストリーミングレスポンスの処理)
    │       ├── toolcalls.ts    (ツールコール処理 - ツール呼び出しの管理)
    │       └── types/          (型定義 - インターフェースと型の定義)
    │           ├── index.ts        (型定義のエントリーポイント - すべての型をエクスポート)
    │           ├── types.ts        (主要な型定義 - 専用インターフェースを定義)
    │           └── extension.d.ts  (型拡張定義 - コア型をDatabricks固有の要件で拡張)
    └── utils/
        ├── errors.ts          (エラー処理 - getErrorMessage, isConnectionErrorを提供)
        ├── json.ts            (JSON処理 - safeStringify, safeJsonParse, extractValidJson, deepMergeJson関数を提供)
        ├── messageUtils.ts    (メッセージ処理 - extractContentAsString, コンテンツ抽出やクエリコンテキスト取得関数)
        ├── sseProcessing.ts   (SSE処理 - processSSEStream関数を提供)
        ├── streamProcessing.ts (ストリーム処理 - processContentDelta, JsonBufferHelpers関数を提供)
        └── toolUtils.ts       (ツール処理 - isSearchTool, processSearchToolArguments, repairToolArgumentsを提供)
```

### 各モジュールの明確な責任

**1. `Databricks.ts` - オーケストレーター**
- BaseLLMを継承、公開APIを実装
- 各専門モジュールの調整と連携
- リクエストのルーティング
- 高レベルのエラー処理
- 責任を適切なモジュールに委譲
- 並列ツール呼び出し制御の設定管理
- 各モジュール間の通信を調整
- 全体的なフローの制御と実行順序の管理
- トップレベルのAPI実装（_streamChat、_streamComplete）
- ストリーミング処理のライフサイクル管理

**2. `config.ts` - 設定管理**
- API設定の読み込みと検証
- URLの正規化
- タイムアウト設定の処理
- 設定の検証ロジック
- 設定ファイルからの値の読み取り
- 環境設定の一元管理
- APIエンドポイントの正規化と検証
- タイムアウトコントローラの設定と管理

**3. `errors.ts` - エラー処理**
- Databricks固有のエラー処理
- エラーレスポンスのパース
- リトライロジックの実装
- 接続エラーとタイムアウトの管理
- 状態保持リトライメカニズムの提供
- 一時的エラーの検出と自動回復
- 型安全なエラー処理インターフェース
- 汎用的なリトライユーティリティの提供
- リトライ戦略の設定と実行
- エラー統計の収集と分析

**4. `helpers.ts` - ヘルパー関数**
- リクエストパラメータの構築
- ストリーミング状態の初期化
- 共通定数と初期値の管理
- ユーティリティ関数
- OpenAI互換形式への変換
- 非ストリーミングレスポンスの処理
- JSONの有効性検証
- コンテンツデルタの処理
- リクエストボディのログ出力
- テキストブロックの終了判定

**5. `messages.ts` - メッセージ変換**
- 標準メッセージフォーマットの変換
- Claude 3.7 Sonnet固有のメッセージ処理
- システムメッセージとユーザーメッセージの処理
- 思考プロセスメッセージの統合
- Databricks固有のメッセージ前処理
- 複合コンテンツ（テキスト+画像）の処理
- メッセージのフォーマット変換（Continue → OpenAI形式）
- メッセージのサニタイズと標準化
- 日本語コンテンツの検出と特別処理
- 空のメッセージの処理と検証

**6. `streaming.ts` - ストリーム処理**
- ストリーミングレスポンスの処理
- 思考プロセスのストリーム処理
- JSONフラグメントの累積処理
- ツール呼び出しのストリーミング処理
- 接続エラーからの回復
- 共通ユーティリティを使用したJSONデルタベース処理
- 部分的なJSONの効率的な処理
- モジュール化されたメソッドによる責任の明確な分離
- `JsonBufferHelpers`を活用した標準的なバッファ管理
- 明確な状態管理と再接続メカニズム
- 共通の`processContentDelta`や`processJsonDelta`を活用した一貫した処理
- **メッセージコンテンツ型の適切な処理: `extractContentAsString`を使用した型安全な処理**
- 状態の永続化と復元
- 再接続時の処理
- 最終ストリーム処理とクリーンアップ
- **StreamingProcessor.processStreamingResponse メソッドの完全な実装**

**7. `toolcalls.ts` - ツールコール処理**
- ツール呼び出しの処理と標準化
- ツール呼び出し引数の処理と修復
- ツール結果の統合
- 検索ツールの特別処理
- ツール呼び出し後のメッセージ前処理
- 共通ユーティリティを使用したJSONデルタベースツール引数処理
- 二重化されたJSONパターンの検出と修復
- ツール呼び出しと結果の前後処理
- ツール引数のデルタ処理と累積
- ダミーのツール結果生成
- モデルのツールサポート検証
- **共通ユーティリティ `repairToolArguments` を活用したツール引数の修復**
- インターフェースを実装して責任境界を明確化

**8. `types/` - 型定義**
- 厳密な型インターフェースの定義
- 型安全なコードのサポート
- 共通型定義の拡張
- JSON処理関連の型定義強化
- エラー処理関連の型定義
- 型の一貫性と相互運用性の確保
- モジュール間の型インターフェースの標準化
- 型アサーションとガードの提供
- 標準ライブラリ型の拡張
- 型安全なエラー処理のサポート
- 責任分担を明確にするためのモジュールインターフェース型の提供
- メソッド宣言のための明示的な型定義
- 戻り値の型安全性向上

## モジュール間の効果的な連携

オーケストレーター（`Databricks.ts`）は、各専門モジュールを調整し、フローを制御します：

```typescript
// Databricks.ts（オーケストレーター）
protected async *_streamChat(messages: ChatMessage[], signal: AbortSignal, options: DatabricksCompletionOptions): AsyncGenerator<ChatMessage> {
  // 設定の検証を設定管理モジュールに委譲
  DatabricksConfig.validateApiConfig(this.apiKey, this.apiBase);
  
  // メッセージの前処理をツール処理モジュールに委譲
  const processedMessages = ToolCallProcessor.preprocessToolCallsAndResults(messages);
  
  // リトライループ
  while (retryCount <= MAX_RETRIES) {
    try {
      // リクエスト処理を実行
      const result = await this.processStreamingRequest(processedMessages, signal, options, retryCount);
      
      // 結果を返す（正常終了）
      if (result.success) {
        for (const message of result.messages) {
          yield message;
        }
        break;
      } else {
        // エラー処理とリトライをエラーハンドラモジュールに委譲
        retryCount++;
        const errorToPass = result.error || new Error("Unknown error");
        await DatabricksErrorHandler.handleRetry(retryCount, errorToPass, result.state);
      }
    } catch (error) {
      // 予期しないエラーの処理もエラーハンドラモジュールに委譲
      retryCount++;
      await DatabricksErrorHandler.handleRetry(retryCount, error);
    }
  }
}

// メインの処理メソッドも責任を委譲
private async processStreamingRequest(
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
    // リクエストパラメータの構築をヘルパーモジュールに委譲
    const args = DatabricksHelpers.convertArgs(options);
    
    // メッセージ変換をメッセージ処理モジュールに委譲
    const formattedMessages = MessageProcessor.convertToOpenAIFormat(
      messages, MessageProcessor.sanitizeMessages(messages)
    );
    
    // URL正規化を設定管理モジュールに委譲
    const apiBaseUrl = this.apiBase ? DatabricksConfig.normalizeApiUrl(this.apiBase) : "";
    
    // タイムアウトコントローラ設定を設定管理モジュールに委譲
    const { timeoutController, timeoutId, combinedSignal } = 
      DatabricksConfig.setupTimeoutController(signal, options);
    
    // APIリクエスト実行
    const response = await this.fetch(apiBaseUrl, { /* リクエスト設定 */ });
    
    // ストリーミングレスポンス処理をストリーミングモジュールに委譲
    const streamResult = await StreamingProcessor.processStreamingResponse(
      response, messages, retryCount, this.alwaysLogThinking
    );
    
    // 結果を返却
    return streamResult;
  } catch (error) {
    // エラー結果の構築
    return { 
      success: false, 
      messages: [], 
      error: error instanceof Error ? error : new Error(getErrorMessage(error)) 
    };
  }
}
```

## 最近の改善点

### 1. メッセージコンテンツ型の処理改善 (2025年5月)

- **型互換性エラーの解消**: `streaming.ts`ファイルで発生していた「Type 'MessageContent' is not assignable to type 'string'」エラーを修正
- **共通ユーティリティの活用**: `extractContentAsString`関数を使って型安全にコンテンツを文字列として扱うよう改善
- **コンテンツ比較の安全化**: メッセージコンテンツの比較時に型を考慮した安全な比較を実装
- **型の一貫性確保**: 特にツール呼び出し処理において、型の一貫性を向上

```typescript
// 変更前 - 型エラーが発生
lastYieldedMessageContent = currentMessage.content;

// 変更後 - 共通ユーティリティを使用した型安全な処理
import { extractContentAsString } from "../../utils/messageUtils.js";

// extractContentAsStringを使用して現在のメッセージ内容を文字列として取得
const currentContentAsString = extractContentAsString(currentMessage.content);

// 型安全な比較と代入
if (currentContentAsString !== lastYieldedMessageContent) {
  // ツール呼び出し情報を含む新しいメッセージをyield
  const messageToYield: ChatMessage = {
    role: "assistant",
    content: currentMessage.content,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined
  };
  
  responseMessages.push(messageToYield);
  lastYieldedMessageContent = currentContentAsString;
}
```

### 2. 共通ユーティリティの活用強化 (2025年5月)

- **ツール引数修復ユーティリティの活用**: `repairToolArguments`共通関数を使用して修復ロジックを統一
- **JSONデルタ処理の共通化**: 共通ユーティリティの`processJsonDelta`関数を使用
- **重複実装の解消**: 独自実装していた処理を共通ユーティリティで置き換え、コードの重複を削減
- **バッファ管理の標準化**: `JsonBufferHelpers`の活用によるバッファ処理の標準化
- **一貫したエラー処理**: `getErrorMessage`などの標準関数を使用した一貫したエラー処理

```typescript
// 変更前 - 独自の実装
// 二重化パターンをチェック
let repairedArguments = toolCallDelta.function.arguments;
const repeatedPattern = /\{\s*\"\w+\"\s*:\s*[^{]*\{\s*\"\w+\"\s*:/;
if (repeatedPattern.test(repairedArguments)) {
  repairedArguments = repairDuplicatedJsonPattern(repairedArguments);
  // ...
}

// 変更後 - 共通ユーティリティを活用
// 共通ユーティリティのrepairToolArgumentsを使用して引数を修復
let repairedArguments = repairToolArguments(toolCallDelta.function.arguments);

// エラーメッセージのデバッグログ
if (repairedArguments !== toolCallDelta.function.arguments) {
  console.log(`ツール引数を修復しました: ${toolCallDelta.function.arguments} -> ${repairedArguments}`);
}
```

### 3. JSONデルタ処理の堅牢性向上 (2025年5月)

- **部分的なブール値の修復**: 「rue}」などの切断されたJSONフラグメントを「true}」に修復する機能を使用
- **複数レベルの修復戦略**: 段階的なJSON修復アプローチにより、様々なエラーケースに対応
- **フラグメント処理の強化**: JSONフラグメントを効率的に処理するデルタベースの処理を活用
- **エラー耐性の向上**: 修復失敗時にも処理を継続できるフォールバック対応を実装

### 4. `finalizeJsonBuffer`メソッドの改善 (2025年5月)

- **共通ユーティリティの活用**: `repairToolArguments`を使用してJSON修復を統一
- **コードの簡略化**: 複雑な条件分岐を整理し、シンプルで読みやすい実装に
- **エラー処理の強化**: クリアなエラーメッセージとエラー後のフォールバック処理を追加
- **型安全性の向上**: 明確な型定義と型チェックによる安全性の確保

```typescript
static finalizeJsonBuffer(
  jsonBuffer: string,
  isBufferingJson: boolean,
  currentToolCall: ToolCall | null,
  messages: ChatMessage[]
): ToolCall | null {
  if (!isBufferingJson || !jsonBuffer || !currentToolCall) {
    return currentToolCall;
  }

  try {
    // ツール引数を共通ユーティリティを使用して修復
    const repairedJson = repairToolArguments(jsonBuffer);
    
    // 検索ツールの場合は専用の処理を使用
    if (isSearchTool(currentToolCall.function.name)) {
      currentToolCall.function.arguments = processSearchToolArguments(
        currentToolCall.function.name,
        currentToolCall.function.arguments || "",
        repairedJson,
        messages
      );
    } else {
      // 修復されたJSONが完全であればそのまま使用
      if (isValidJson(repairedJson)) {
        // 既存の引数があればマージを試みる
        if (currentToolCall.function.arguments && 
            currentToolCall.function.arguments.trim() !== "" && 
            currentToolCall.function.arguments.trim() !== "{}") {
          try {
            // 既存引数と新しい引数を両方パースしてマージ
            const existingArgs = safeJsonParse(currentToolCall.function.arguments, {});
            const newArgs = safeJsonParse(repairedJson, {});
            const mergedArgs = { ...existingArgs, ...newArgs };
            currentToolCall.function.arguments = JSON.stringify(mergedArgs);
          } catch (e) {
            // マージに失敗した場合は修復されたJSONを使用
            currentToolCall.function.arguments = repairedJson;
          }
        } else {
          // 既存の引数がない場合は修復されたJSONを使用
          currentToolCall.function.arguments = repairedJson;
        }
      } else {
        // 修復しても有効なJSONにならない場合
        if (currentToolCall.function.arguments) {
          currentToolCall.function.arguments += jsonBuffer; // 既存の引数に追加
        } else {
          currentToolCall.function.arguments = jsonBuffer; // そのまま使用
        }
      }
    }
  } catch (e) {
    console.warn(`最終バッファ処理エラー: ${getErrorMessage(e)}`);
    
    // エラーが発生した場合は元のバッファをそのまま使用
    if (!currentToolCall.function.arguments) {
      currentToolCall.function.arguments = jsonBuffer;
    }
  }

  // 永続的な状態をリセット
  this.resetPersistentState();

  return currentToolCall;
}
```

### 5. API互換性の改善 (2025年5月)

- **parallel_tool_callsパラメータの対応改善**: Databricksエンドポイントがサポートしていない`parallel_tool_calls`パラメータを自動的に除外
- **リクエストパラメータの最適化**: 互換性のないパラメータを削除し、API呼び出しエラーを防止
- **デフォルト設定の安全化**: `parallelToolCalls: false`をデフォルト値として設定

### 6. ストリーム処理の完全実装 (2025年5月)

- **StreamingProcessor.processStreamingResponse メソッドの追加**: ストリーミングレスポンスを完全に処理する静的メソッドを実装
- **型安全なインターフェース**: StreamingResponseResult インターフェース型を追加し、戻り値型の安全性を確保
- **完全なステートフル処理**: ストリーミングの状態管理を改善し、エラー発生時も一貫した動作を維持
- **再接続メカニズムの強化**: 接続エラー後の状態復元と再接続処理の改善
- **責任の明確な分離**: 各処理フェーズが明確なメソッドに分割され、責任境界が明確なコード構造を実現

### 7. 型安全なエラー処理の改善 (2025年5月)

- **unknown型のエラー処理**: `unknown`型の変数からプロパティを安全に抽出する処理を改善
- **共通ユーティリティの活用**: `getErrorMessage`関数を使用して型安全にエラーメッセージを取得
- **型チェックの強化**: 適切な型ガードを使用してエラーの種類を判別
- **エラー情報の標準化**: エラーメッセージの形式を標準化し、診断情報を向上

```typescript
// 変更前 - 型安全でないエラー処理（TypeScriptコンパイルエラーの原因）
try {
  // 処理...
} catch (streamError) {
  // エラー: 'streamError' is of type 'unknown'
  console.error(`接続エラーの詳細: ${streamError.name}, ${streamError.message}`);
}

// 変更後 - 型安全なエラー処理（共通ユーティリティを活用）
import { getErrorMessage, isConnectionError } from "../../utils/errors.js";

try {
  // 処理...
} catch (streamError: unknown) {
  // 型安全: getErrorMessageがunknown型を安全に処理
  const errorMessage = getErrorMessage(streamError);
  console.error(`ストリーミング処理エラー: ${errorMessage}`);
  
  // 接続エラーの判別も型安全に実装
  if (isConnectionError(streamError)) {
    console.error(`接続エラーの詳細: ${errorMessage}`);
  }
}
```

## メッセージコンテンツ型の処理改善

メッセージコンテンツ型（`MessageContent`）を適切に処理するための変更点：

```typescript
// 変更前 - 型エラーが発生する問題のあるコード
lastYieldedMessageContent = currentMessage.content;

// 変更後 - メッセージユーティリティを使用した安全な処理
import { extractContentAsString } from "../../utils/messageUtils.js";

// メッセージコンテンツから安全に文字列を抽出
const contentAsString = extractContentAsString(currentMessage.content);
lastYieldedMessageContent = contentAsString;
```

このパターンを他の場所でも適用して、メッセージコンテンツの型安全な処理を実現：

```typescript
// メッセージコンテンツの比較
function compareMessageContent(oldMessage: ChatMessage, newMessage: ChatMessage): boolean {
  const oldContent = extractContentAsString(oldMessage.content);
  const newContent = extractContentAsString(newMessage.content);
  
  return oldContent === newContent;
}

// メッセージコンテンツを文字列として処理
function processMessageContent(message: ChatMessage): void {
  const contentAsString = extractContentAsString(message.content);
  
  // 文字列として扱えるようになった
  if (contentAsString.includes("キーワード")) {
    // 処理...
  }
}
```

## TypeScriptメソッド宣言のベストプラクティス

TypeScriptでのメソッド宣言には、以下のベストプラクティスを採用しています：

### 1. 明示的なインターフェース型の使用

複雑なオブジェクト型パラメータや戻り値には、インライン型定義ではなく明示的なインターフェース型を使用することで、コードの可読性と保守性を向上させています：

```typescript
// 良い例：明示的なインターフェース型を使用
private static updateToolCallArguments(
  result: ToolCallResult,
  args: string,
  messages: ChatMessage[]
): ToolCallResult {
  // 実装...
}

// 避けるべき例：インライン型定義
private static updateToolCallArguments(
  result: {
    updatedToolCalls: ToolCall[];
    updatedCurrentToolCall: ToolCall | null;
    // 他のプロパティ...
  },
  args: string,
  messages: ChatMessage[]
): typeof result {
  // 実装...
}
```

### 2. 一貫した戻り値型定義

曖昧な`typeof result`のような型参照を避け、明示的なインターフェース型を使用することで、型安全性を向上させています：

```typescript
// 良い例：明示的なインターフェース型を戻り値型として使用
private static processToolCallDelta(
  delta: ResponseDelta,
  toolCalls: ToolCall[],
  currentToolCall: ToolCall | null,
  currentToolCallIndex: number | null,
  jsonBuffer: string,
  isBufferingJson: boolean,
  messages: ChatMessage[]
): ToolCallResult {
  // 実装...
}

// 避けるべき例：typeof resultを使用
private static processToolCallDelta(
  // パラメータ...
): typeof result {
  // 実装...
}
```

### 3. 型安全なエラー処理

エラー処理においても型安全性を確保するベストプラクティス：

```typescript
// 型安全なエラー処理：明示的な型アノテーションとユーティリティの使用
try {
  // 処理...
} catch (error: unknown) {
  // 共通ユーティリティを使用した型安全な処理
  const errorMessage = getErrorMessage(error);
  console.error(`エラー発生: ${errorMessage}`);
  
  // 型ガードを使用したエラー分類
  if (error instanceof Error) {
    // Error型としてのプロパティにアクセス可能
    console.error(`スタックトレース: ${error.stack}`);
  } else if (isConnectionError(error)) {
    // 接続エラー固有の処理
    console.error(`接続エラー: ${errorMessage}`);
  }
}
```

## 設定方法

Databricksインテグレーションを使用するには、以下の設定が必要です：

1. **APIベースURL**: Databricksのエンドポイントへの接続先URL
2. **APIキー**: 認証に使用するDatabricks APIキー

これらは`config.yaml`ファイルで設定できます：

```yaml
models:
  - name: "databricks-claude"
    provider: "databricks"
    apiBase: "https://your-databricks-endpoint.cloud.databricks.com/serving-endpoints/claude-3-7-sonnet/invocations"
    apiKey: "dapi_your_api_key_here"
```

## TypeScriptコンパイルエラー回避のためのガイドライン

Databricksインテグレーションでのコンパイルエラーを防ぐために、以下のガイドラインを採用しています：

1. **明示的なインターフェース型の使用**: 複雑なオブジェクト型にはインターフェース型を使用し、`types.ts`で一元的に定義します
2. **一貫した型宣言パターン**: メソッドのパラメータと戻り値には一貫した型宣言パターンを使用します
3. **インライン型定義の排除**: メソッド宣言内でのインライン型定義を避け、名前付きインターフェース型を使用します
4. **適切な配列型表記**: 配列型は`Type[]`形式で正しく宣言します
5. **文字列リテラルの一貫した使用**: 一貫した引用符スタイル（単一引用符または二重引用符）を採用し、適切なエスケープシーケンスを使用します
6. **適切な正規表現パターン**: 正規表現パターンでは、メタ文字を適切にエスケープします
7. **型安全なキャスト**: `as any`などの安全でないキャストを避け、適切な型アサーションを使用します
8. **インターフェース実装パターン**: 明確な責任境界を持つインターフェースを定義し、それに準拠するクラスを実装します
9. **戻り値型の明示化**: `typeof result`のような曖昧な型参照を避け、明示的に型を定義します
10. **文字列リテラルのエスケープ**: 文字列内の引用符はTypeScriptの構文に従って正しくエスケープします
11. **メッセージコンテンツ型の適切な処理**: `extractContentAsString`を使用して`MessageContent`型を安全に処理します
12. **必要な共通ユーティリティのインポート**: 特に`extractContentAsString`や`repairToolArguments`など重要な関数を確実にインポートします
13. **unknown型の適切な処理**: catchブロック内で`unknown`型として捕捉したエラーは、型安全にアクセスするためのユーティリティ関数を使用します
14. **型ガードの活用**: `instanceof`や`typeof`などの型ガードを使用して、より具体的な型に絞り込みます

これらのガイドラインを遵守することで、TypeScriptコンパイルエラーを防ぎ、よりメンテナンス性の高いコードベースを維持できます。
