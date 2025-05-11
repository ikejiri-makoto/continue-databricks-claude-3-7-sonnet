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
        ├── messageUtils.ts    (メッセージ処理 - コンテンツ抽出やクエリコンテキスト取得関数)
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
- ダミーのツール結果生成
- モデルのツールサポート検証
- ツール呼び出し引数の修復と正規化
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

### 1. API互換性の改善 (2025年5月)

- **parallel_tool_callsパラメータの対応改善**: Databricksエンドポイントがサポートしていない`parallel_tool_calls`パラメータを自動的に除外するよう改善
- **APIエラー「Extra inputs are not permitted」の解消**: リクエストからDatabricksが対応していないパラメータを完全に除外し、400エラーを防止
- **デフォルト設定の最適化**: `parallelToolCalls: false`をデフォルト設定に追加し、オプションが指定されない場合でも安全に動作するよう対応
- **型定義の整合性維持**: サポートされていないパラメータを型定義と実装の両方で一貫して扱うよう改善

### 2. 型安全性の向上 (2025年5月)

- **DatabricksLLMOptions型の導入**: LLMOptions型を拡張した専用型を導入し、型安全性を向上
- **型キャストの排除**: `as any`などの型キャストを使わずに、適切な型を使用
- **コンパイルエラーの解消**: TypeScriptコンパイル時のプロパティに関するエラーを解消
- **JSDocドキュメントの充実**: 型定義に詳細な説明と使用例を追加
- **インターフェース実装パターンの採用**: 明示的なインターフェース定義とその実装による責任境界の明確化

### 3. 共通ユーティリティの活用強化 (2025年5月)

- **JSON処理機能の統合**: 重複していたJSON処理ロジックを共通ユーティリティに統合
- **JSONデルタ処理の一元化**: `processJsonDelta`関数と`processToolArgumentsDelta`関数を共通ユーティリティに移動し、全モジュールで活用
- **重複実装の解消**: 特にJSONフラグメント処理の重複実装を解消し、バグ発生リスクを低減
- **標準化されたエラー処理**: 共通のエラー処理パターンを活用
- **型不一致の修正**: ツール呼び出し処理における`tool_call_id`と`toolCallId`の不一致を修正し、型安全性を向上
- **共通ツール修復ユーティリティの活用**: `repairToolArguments`共通関数を積極的に使用し、コードの重複を削減

### 4. ストリーム処理の改善

- **責任の明確な分離**: 大きなメソッドを目的が明確な小さなメソッドに分割し、コードの可読性と保守性を向上
- **メソッドの抽象化レベル統一**: 各メソッドが単一の責任を持つように再構成し、一貫性のあるコード構造を実現
- **バッファ管理の標準化**: `JsonBufferHelpers.resetBuffer()`や`JsonBufferHelpers.addToBuffer()`など共通ユーティリティを活用し、バッファ管理ロジックを標準化
- **コンテンツ処理の改善**: `processContentDelta`共通ユーティリティを活用して、メッセージコンテンツの処理を標準化
- **状態管理の明確化**: 状態変更のパターンを統一し、一貫した方法で状態を更新するよう改善
- **エラー処理のインライン化**: エラー処理を適切な場所に配置し、エラーメッセージを明確化
- **ツール引数処理の簡素化**: 複雑な条件分岐を専用メソッドに抽出し、コードの流れを明確化
- **JSONデルタ処理の標準化**: ツール引数のJSONデルタ処理を一貫した方法で行うよう改善

### 5. オーケストレーターパターンの強化

- **Databricks.tsの責任の明確化**: メインクラスを純粋なオーケストレーターとして機能させ、実装の詳細を適切なモジュールに委譲
- **モジュール間の依存関係の最小化**: 各モジュールが特定の責任を持ち、他のモジュールへの依存を最小限に抑制
- **インターフェースの標準化**: 各モジュール間の通信に一貫したインターフェースを使用
- **処理フローの簡素化**: 複雑な条件分岐やネストされたコールバックを排除し、直線的な処理フローを実現
- **状態の共有と更新の明確化**: モジュール間での状態の共有と更新の方法を標準化
- **エラー処理の一元化**: エラー処理の責任を`DatabricksErrorHandler`クラスに集中
- **設定管理の一元化**: 設定管理の責任を`DatabricksConfig`クラスに集中
- **インターフェース実装による責任明確化**: `ToolCallProcessorInterface`など各モジュールにインターフェースを実装し、責任境界を明示

### 6. `ToolCallProcessor`クラスの改善 (2025年5月)

- **インターフェース実装の強化**: `ToolCallProcessorInterface`インターフェースを完全に実装
- **インスタンスメソッドの追加**: 静的メソッドを保持しつつ、インスタンスメソッドもサポート
- **責任の明確化**: インターフェースの定義に従った明確なメソッド構造
- **共通ユーティリティの活用**: `toolUtils.js`の`repairToolArguments`関数を活用したコード重複の削減
- **デリゲーションパターンの適用**: インスタンスメソッドから静的メソッドへの委譲でコード再利用を最大化
- **型安全性の向上**: インターフェース実装による型安全なコード構造の実現

## 共通ユーティリティの活用

各モジュールで共通ユーティリティを最大限に活用することで、コードの重複を削減し、品質を向上させています：

### 1. JSON処理ユーティリティ

`json.ts`の機能を活用してJSON処理の安全性と堅牢性を向上：

```typescript
// 安全なJSONパース
const config = safeJsonParse<ConfigType>(jsonText, defaultConfig);

// 混合コンテンツからの有効なJSON抽出
const validJson = extractValidJson(mixedContent);
if (validJson) {
  const parsedData = safeJsonParse(validJson, defaultValue);
  // 有効なJSONのみを処理
}

// JSONデルタ処理
const jsonDelta = processJsonDelta(currentJson, deltaJson);
if (jsonDelta.complete) {
  // 完全なJSONとして処理
} else {
  // バッファリングを継続
}

// ツール引数のデルタ処理
const toolArgsDelta = processToolArgumentsDelta(currentArgs, deltaArgs);
if (toolArgsDelta.isComplete) {
  // 完全な引数として処理
  updatedArgs = toolArgsDelta.processedArgs;
} else {
  // バッファリングを継続
  jsonBuffer = toolArgsDelta.processedArgs;
}
```

### 2. ツール引数修復ユーティリティ

`toolUtils.ts`の`repairToolArguments`関数を活用してツール引数の修復を標準化：

```typescript
// 共通ユーティリティのrepairToolArgumentsを使用
import { repairToolArguments } from "../../utils/toolUtils.js";

// ツール引数の修復
const repairedArgs = repairToolArguments(args);

// モジュール内のrepairToolArguments実装
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
