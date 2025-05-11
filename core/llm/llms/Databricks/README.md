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
    ├── stream.js              (streamSse関数 - ストリーミングレスポンスの処理)
    ├── types/                 (共通型定義の拡張 - 適切な型安全性の確保)
    │   └── databricks-extensions.d.ts (Databricks用の拡張型定義)
    ├── utils/                 (共通ユーティリティ関数)
    │   ├── errors.js          (エラー処理 - getErrorMessage, isConnectionErrorを提供)
    │   ├── json.js            (JSON処理 - processJsonDelta等の関数を提供)
    │   ├── messageUtils.js    (メッセージ処理 - extractContentAsString等の関数)
    │   └── toolUtils.js       (ツール処理 - repairToolArgumentsなどの関数)
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
    │           └── extension.d.ts  (型拡張定義 - コア型をDatabricks固有の要件で拡張)
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
- 明確な状態管理と再接続メカニズム
- 共通の`processContentDelta`や`processJsonDelta`を活用した一貫した処理
- メッセージコンテンツ型の適切な処理: `extractContentAsString`を使用した型安全な処理
- 状態の永続化と復元
- 再接続時の処理
- 最終ストリーム処理とクリーンアップ

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
- 共通ユーティリティ `repairToolArguments` を活用したツール引数の修復
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
    
    // システムメッセージの処理をメッセージ処理モジュールに委譲
    const systemMessage = MessageProcessor.processSystemMessage(messages);
    
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
    const response = await this.fetch(apiBaseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: safeStringify({
        ...args,
        messages: formattedMessages,
        system: systemMessage,
      }),
      signal: combinedSignal,
    });
    
    // 非ストリーミングレスポンス処理をヘルパーモジュールに委譲
    if (options.stream === false) {
      const message = await DatabricksHelpers.processNonStreamingResponse(response);
      return { success: true, messages: [message] };
    }
    
    // ストリーミングレスポンス処理をストリーミングモジュールに委譲
    return await StreamingProcessor.processStreamingResponse(
      response, messages, retryCount, this.alwaysLogThinking
    );
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

## 主要な改善点

### 1. ルーティング問題の解決

最も重要な改善点は、すべてのリクエストを正しくDatabricksエンドポイントに送信するようにしたことです。以前の実装では、ストリーミング編集差分などの特定の操作で、誤ってAnthropicのAPIを直接使用しようとしていました。

```typescript
// 新しい実装では、すべてのリクエストが正しくDatabricksに送信されます
const response = await this.fetch(apiBaseUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${this.apiKey}`,
  },
  body: safeStringify({
    ...args,
    messages: formattedMessages,
    system: systemMessage,
  }),
  signal: combinedSignal,
});
```

### 2. メッセージコンテンツ型の処理改善

`MessageContent`型が`string`または`MessagePart[]`のユニオン型であることによる型エラーを修正し、`extractContentAsString`関数を使って安全に処理するようにしました。

```typescript
// 変更前 - 型エラーが発生
lastYieldedMessageContent = currentMessage.content;

// 変更後 - 共通ユーティリティを使用した型安全な処理
import { extractContentAsString } from "../../utils/messageUtils.js";

// extractContentAsStringを使用して現在のメッセージ内容を文字列として取得
const currentContentAsString = extractContentAsString(currentMessage.content);

// 型安全な比較と代入
if (currentContentAsString !== lastYieldedMessageContent) {
  // メッセージを処理...
  lastYieldedMessageContent = currentContentAsString;
}
```

### 3. JSON処理の強化

ストリーミング応答内のJSONフラグメントを処理する方法を改善し、`processJsonDelta`関数を使用して部分的なJSONの累積と解析を正しく処理するようにしました。

```typescript
// JSONフラグメントの処理に共通ユーティリティを使用
const result = processJsonDelta(jsonBuffer, toolCallDelta.function.arguments);
updatedJsonBuffer = result.combined;

// 完全なJSONが得られたかチェック
if (result.complete && result.valid) {
  // 共通ユーティリティを使用してJSONを修復
  const repairedJson = repairToolArguments(updatedJsonBuffer);
  
  // ツール呼び出し引数を更新
  if (updatedCurrentToolCallIndex !== null) {
    updatedToolCalls[updatedCurrentToolCallIndex].function.arguments = repairedJson;
  }
  
  // バッファリング状態をリセット
  updatedIsBufferingJson = false;
  updatedJsonBuffer = "";
  shouldYieldMessage = true;
}
```

### 4. ツール呼び出し処理の改善

ツール引数の処理を改善し、`repairToolArguments`関数を使用して破損したJSONを修復できるようにしました。

```typescript
// 共通ユーティリティを使用してツール引数を修復
const repairedJson = repairToolArguments(jsonBuffer);

// 検索ツールは特別に処理
if (isSearchTool(currentToolCall.function.name)) {
  currentToolCall.function.arguments = processSearchToolArguments(
    currentToolCall.function.name,
    currentToolCall.function.arguments || "",
    repairedJson,
    messages
  );
} else {
  // 他のツールは修復されたJSONを使用
  if (isValidJson(repairedJson)) {
    // 既存の引数があれば、マージを試みる
    // ...
  }
}
```

### 5. エラー処理と再接続の強化

接続エラーを適切に処理し、指数バックオフとリトライ機能を実装しました。また、再接続時に状態を保持し、ストリーミングセッションを継続できるようにしました。

```typescript
// 型安全なエラー処理
try {
  // 処理...
} catch (error: unknown) {
  // 共通ユーティリティを使用して型安全にエラーメッセージを取得
  const errorMessage = getErrorMessage(error);
  
  // エラーが一時的なものかどうかを確認
  if (isTransientError(error)) {
    // 指数バックオフを使用してリトライ
    const delay = Math.min(
      baseDelay * Math.pow(2, retryCount - 1) * (0.5 + Math.random()), 
      10000
    );
    
    await new Promise(resolve => setTimeout(resolve, delay));
    // リトライ...
  } else {
    // 永続的なエラーを投げる
    throw error;
  }
}
```

### 6. 並列ツール呼び出しの制御

Databricksエンドポイントが並列ツール呼び出しをサポートしていないため、`parallel_tool_calls: false`パラメータを追加して、ツール呼び出しが正しく処理されるようにしました。

```typescript
const args = {
  // その他のパラメータ...
  
  // 並列ツール呼び出しを明示的に無効化
  parallel_tool_calls: false
};
```

### 7. 思考モードのサポート

Claude 3.7 Sonnetの思考モードを適切にサポートするための設定を追加しました。

```typescript
// Claude 3.7モデル用に思考モードを追加
if (isClaude37) {
  return {
    ...args,
    thinking: {
      type: "enabled",
      budget_tokens: options.thinking?.budget_tokens || 60000,
    }
  };
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
    model: "databricks-claude-3-7-sonnet"
```

## 今後の改善計画

1. **パフォーマンス最適化**: リクエスト処理とレスポンスパースのパフォーマンスをさらに最適化
2. **バッファ管理の改善**: より効率的なJSONバッファ管理による大規模ストリーミングの安定性向上
3. **コンテキスト管理の強化**: トークン制限を考慮したコンテキスト管理の改善
4. **型安全性の向上**: より厳密な型定義とチェックによる安全性の向上
5. **並列処理の改善**: 複数のリクエスト間でのリソース共有の最適化

このモジュール化されたアーキテクチャにより、拡張機能の安定性と保守性が大幅に向上し、将来のAPI変更にも容易に対応できるようになりました。
