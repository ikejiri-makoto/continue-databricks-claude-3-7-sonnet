# Databricks LLM Integration for Continue

このディレクトリには、Continue VS Code拡張機能からDatabricksのLLMサービス（特にClaude 3.7 Sonnet）に接続するための実装が含まれています。Databricksホステッドモデルへのアクセスを可能にし、コードの補完、説明、リファクタリングなどの機能をContinue拡張機能内で提供します。

## モジュール間の関係と連携

Databricksインテグレーションは、メインの`Databricks.ts`クラスと、`Databricks/`ディレクトリ内の複数の特化したモジュールから構成されています。また、`core/llm/utils/`ディレクトリの共通ユーティリティも活用しています。以下は各モジュール間の関係と連携の概要です。

### モジュール構造と依存関係

```
core/
├── index.js                   (ChatMessage, CompletionOptions, LLMOptionsなどの基本型定義)
├── util/
│   └── messageContent.js      (チャットメッセージのレンダリング関数)
└── llm/
    ├── index.js               (BaseLLMクラス - すべてのLLM実装の基底クラス)
    ├── llms/
    │   ├── Databricks.ts       (メインクラス - 他のモジュールを統合)
    │   └── Databricks/
    │       ├── config.ts       (設定管理 - API接続情報の管理)
    │       ├── messages.ts     (メッセージ変換 - メッセージフォーマットの調整)
    │       ├── streaming.ts    (ストリーム処理 - レスポンスの逐次処理)
    │       ├── toolcalls.ts    (ツールコール処理 - ツール呼び出しの処理)
    │       └── types.ts        (型定義 - インターフェースと型の定義)
    └── utils/
        ├── errors.js          (エラー処理 - getErrorMessage, isConnectionErrorを提供)
        ├── json.js            (JSON処理 - safeStringify関数などを提供)
        ├── messageUtils.js    (メッセージ処理 - コンテンツ抽出やクエリコンテキスト取得関数)
        ├── sseProcessing.js   (SSE処理 - processSSEStream関数を提供)
        ├── streamProcessing.js (ストリーム処理 - ストリームレスポンスの加工)
        └── toolUtils.js       (ツール処理 - 検索ツールの識別と引数処理を提供)
```

**Databricks.tsのインポート関係図：**

```
Databricks.ts
├── core/index.js から
│   └── ChatMessage, CompletionOptions, LLMOptions (基本インターフェース)
├── core/util/messageContent.js から
│   └── renderChatMessage (チャットメッセージのレンダリング)
├── core/llm/index.js から
│   └── BaseLLM (Databricksクラスの基底クラス)
├── core/llm/utils/ から
│   ├── errors.js: getErrorMessage, isConnectionError (エラー処理)
│   ├── json.js: safeStringify (JSON操作)
│   └── sseProcessing.js: processSSEStream (SSEストリーム処理)
└── Databricks/ モジュールから
    ├── config.js: DatabricksConfig (API設定)
    ├── messages.js: MessageProcessor (メッセージ変換)
    ├── toolcalls.js: ToolCallProcessor (ツール処理)
    ├── streaming.js: StreamingProcessor (ストリーム処理)
    └── types.js: ToolCall (型定義)
```

## Databricks.tsのコアモジュール依存関係

`Databricks.ts`ファイルは、複数のコアモジュールに依存しており、以下のインポート関係があります：

### コアモジュールからのインポート

1. **`../../index.js`**（core/index.js）から：
   - `ChatMessage` - チャットメッセージの基本インターフェース
   - `CompletionOptions` - 補完リクエストのオプション
   - `LLMOptions` - LLMの初期化オプション

2. **`../../util/messageContent.js`**（core/util/messageContent.js）から：
   - `renderChatMessage` - チャットメッセージをテキストとしてレンダリングするユーティリティ関数

3. **`../index.js`**（core/llm/index.js）から：
   - `BaseLLM` - すべてのLLM実装の基底クラス（Databricksクラスはこれを継承）

### ユーティリティモジュールからのインポート

4. **`../utils/errors.js`**（core/llm/utils/errors.js）から：
   - `getErrorMessage` - 様々な形式のエラーから一貫したエラーメッセージを抽出する関数
   - `isConnectionError` - 接続関連のエラーを識別する関数（リトライ判断に使用）

5. **`../utils/json.js`**（core/llm/utils/json.js）から：
   - `safeStringify` - オブジェクトを安全に文字列化する関数（循環参照などのエッジケースに対応）

6. **`../utils/sseProcessing.js`**（core/llm/utils/sseProcessing.js）から：
   - `processSSEStream` - Server-Sent Eventsストリームを処理する関数

7. **`../utils/toolUtils.js`**（core/llm/utils/toolUtils.js）から：
   - `isSearchTool` - ツール名が検索系かどうかを判定する関数
   - `processSearchToolArguments` - 検索ツールの引数を適切に処理する関数
   - `formatToolResultsContent` - ツール実行結果をフォーマットする関数
   - `doesModelSupportTools` - モデルがツールをサポートするか確認する関数

### Databricks固有モジュールからのインポート

8. **`./Databricks/config.js`**から：
   - `DatabricksConfig` - 設定ファイルからのAPI情報の読み込みや正規化を行うクラス

9. **`./Databricks/messages.js`**から：
   - `MessageProcessor` - メッセージ変換を担当するクラス

10. **`./Databricks/toolcalls.js`**から：
   - `ToolCallProcessor` - ツール呼び出しの処理を担当するクラス

11. **`./Databricks/streaming.js`**から：
    - `StreamingProcessor` - ストリーミングレスポンスの処理を担当するクラス

12. **`./Databricks/types.js`**から：
    - `ToolCall` - ツール呼び出しの型定義

## モジュール構造の分析と設計判断

現在のモジュール構造は、共通ユーティリティと特化したモジュールの適切なバランスを目指して設計されています。以下に各モジュールの役割と、なぜ別々のモジュールとして維持されるべきかについての分析を示します。

### 1. `config.ts`（設定管理）

このモジュールはDatabricks固有の設定ロードを処理しています。

**独自モジュールとしての理由**:
- Databricksの特定の設定パラメータ（apiBase、apiKeyなど）を処理する専用ロジックが必要です
- 設定ファイルからの読み込みとURL正規化（invocationsエンドポイントなど）の処理がDatabricks特有です
- 他のプロバイダとは異なる設定フォーマットやデフォルト値を持っています

**共通ユーティリティの活用状況**:
- 標準のfs、pathモジュールを使用して設定ファイルを読み込んでいます
- 将来的には、共通の設定読み込みユーティリティが作成された場合に連携できる構造になっています

### 2. `messages.ts`（メッセージ変換）

このモジュールはDatabricksのAPI形式に合わせたメッセージ変換を担当しています。

**独自モジュールとしての理由**:
- Claude 3.7 Sonnetの特殊な要件（「水平思考」と「ステップバイステップ」の指示など）に対応しています
- ツール呼び出しを含むメッセージの特別処理が必要です
- システムメッセージやthinkingメッセージの特殊な取り扱いを実装しています

**共通ユーティリティの活用状況**:
- `extractContentAsString`や`extractQueryContext`などの共通ユーティリティを活用しています
- `safeStringify`でJSONの安全な処理を行っています
- 将来的に共通のメッセージ処理が拡張された場合、このモジュールの一部は置き換えられる可能性があります

### 3. `streaming.ts`（ストリーム処理）

このモジュールはDatabricksのストリーミングレスポンスの処理を担当しています。

**独自モジュールとしての理由**:
- Claude 3.7 Sonnetの思考プロセス（thinking）のストリーミング処理が特殊です
- ツール呼び出しのストリーミングにDatabricks固有の処理が必要です
- JSONフラグメントの高度なバッファリングメカニズムを実装しています

**共通ユーティリティの活用状況**:
- `processContentDelta`などの共通ストリーム処理ユーティリティを使用しています
- `JsonBufferHelpers`を活用してJSON処理を行っています
- 型安全性のために明示的な型アサーションを使用しています

### 4. `toolcalls.ts`（ツールコール処理）

このモジュールはツール呼び出しとその結果の処理を担当しています。

**独自モジュールとしての理由**:
- Databricks APIのツール呼び出し形式に特化した処理が必要です
- ツール結果メッセージの挿入や検索ツールの特別処理を実装しています
- チャット履歴内でのツール呼び出しと結果の前処理に特化しています

**共通ユーティリティの活用状況**:
- `isSearchTool`、`processSearchToolArguments`などの共通ツールユーティリティを使用しています
- `formatToolResultsContent`を活用してツール結果をフォーマットします
- `doesModelSupportTools`でモデルのツール対応を確認しています

### 5. `types.ts`（型定義）

このモジュールはDatabricks統合のためのTypeScript型定義を提供します。

**独自モジュールとしての理由**:
- Databricks固有のメッセージ形式や構造を型として定義しています
- ツール呼び出し、ストリーミングチャンク、思考メッセージなどの型を提供しています
- 型安全性を確保し、開発時のエラー検出を向上させます

**共通ユーティリティの活用状況**:
- `ChatMessage`などの基本型を拡張しています
- 型の一貫性を保ちつつDatabricks固有の拡張を行っています

## モジュール構造の最適化方針

現在のモジュール構造はDatabricksの特殊要件に対応するために合理的な設計になっています。しかし、以下の方針でさらなる最適化が可能です。

1. **共通ユーティリティの活用強化**:
   - 各モジュールが可能な限り共通ユーティリティを活用するようリファクタリングする
   - 重複するロジックを特定し、適切な共通ユーティリティに移動する

2. **モジュールの責任分担の明確化**:
   - 各モジュールの役割と責任を明確に保ち、コードの可読性と保守性を向上させる
   - モジュール間の依存関係を最小限に抑える

3. **段階的な最適化**:
   - 大幅な変更よりも段階的な最適化を行う
   - 新しい共通ユーティリティが追加されたら、Databricks固有モジュールを見直す

この方針により、Databricks Claude 3.7 Sonnet統合の特殊機能を維持しつつ、コードの冗長性を減らし、保守性を向上させることができます。

## 主要な機能と特徴

### 1. Claude 3.7 Sonnetとの統合

Databricksホステッドの最新のClaude 3.7 Sonnetモデルと完全に統合し、高度な対話機能を提供します：

- **思考プロセスの表示**：モデルの思考過程をリアルタイムで表示する機能をサポートします
- **ストリーミングレスポンス**：回答が生成されるにつれてリアルタイムで表示します
- **長いコンテキスト**：最大200,000トークンの長いコンテキストウィンドウをサポートします

### 2. ツール呼び出し機能

Continue拡張機能のツール呼び出し機能をフルサポートし、特に以下の機能を強化しています：

- **検索ツールの強化**：検索クエリが常に適切に設定されるように特別な処理を実装しています
- **引数処理の改善**：JSONフラグメントを適切に処理し、完全なJSONになるまでバッファリングします
- **ツール結果の統合**：ツール呼び出しの結果を会話の流れに自然に統合します

### 3. エラー処理と回復メカニズム

堅牢なエラー処理と回復メカニズムを実装しています：

- **自動リトライ**：接続エラーが発生した場合、指数バックオフ方式で最大3回リトライします
- **エラー分類**：様々なエラータイプを分類し、適切に対応します
- **タイムアウト管理**：リクエストタイムアウトを管理し、長時間応答がない場合に適切に処理します
- **型エラーの修正**：特にTypeScriptの型定義に関する問題を解決し、ストリーミング処理中の`thinkingMessage`の適切な型定義を保証します

### 4. 日本語サポートの強化

日本語でのインタラクションを特に強化しています：

- **「水平思考」と「ステップバイステップ」の指示**：日本語での思考プロセス指示をシステムメッセージに自動追加します
- **日本語検索ツールの認識**：「検索」という単語を含むツール名も適切に処理します
- **日本語エラーメッセージ**：エラーとリトライのログを日本語で出力します

## 設定方法

Databricksインテグレーションを使用するには、以下の設定が必要です：

1. **APIベースURL**: Databricksのエンドポイントへの接続先URL
2. **APIキー**: 認証に使用するDatabricks APIキー

これらは以下のいずれかの場所にある`config.yaml`ファイルで設定できます：
- `%USERPROFILE%\.continue\config.yaml`
- `extensions\.continue-debug\config.yaml` (デバッグ時)

設定例：
```yaml
models:
  - name: "databricks-claude"
    provider: "databricks"
    apiBase: "https://your-databricks-endpoint.cloud.databricks.com/serving-endpoints/claude-3-7-sonnet/invocations"
    apiKey: "dapi_your_api_key_here"
```

## 使用方法

Databricksインテグレーションは、Continue拡張機能の他のLLMプロバイダと同様に、`llmFromDescription`関数を使用してインスタンス化できます：

```typescript
import { llmFromDescription } from 'core/llm/llms';

// 設定に基づいてLLMインスタンスを作成
const llm = await llmFromDescription(
  {
    provider: 'databricks',
    model: 'claude-3-7-sonnet',
    apiBase: 'https://your-databricks-endpoint.cloud.databricks.com/serving-endpoints/claude-3-7-sonnet/invocations',
    apiKey: 'dapi_your_api_key_here'
  },
  readFile,
  uniqueId,
  ideSettings,
  logger
);

// ストリーミングチャットの使用例
for await (const message of llm.streamChat(messages, signal, options)) {
  // message.role === "thinking" -> 思考プロセス
  // message.toolCalls -> ツール呼び出し
  // message.content -> 通常のテキスト応答
  console.log(message);
}
```

## 開発ガイドライン

Databricksインテグレーションを拡張または修正する際は、以下のガイドラインに従ってください：

1. **モジュール分離の原則**：
   - 機能ごとに適切なモジュールに実装を追加してください
   - `Databricks.ts`はコーディネーターとして機能し、詳細な実装は各サブモジュールに委譲します
   - できる限り、`core/llm/`配下の共通ユーティリティを活用してください

2. **エラー処理**：
   - すべてのAPI呼び出しに適切なエラー処理を実装してください
   - 接続エラーとアプリケーションエラーを区別し、適切に対応します

3. **型安全性**：
   - 可能な限り明示的な型を使用し、`any`型の使用を最小限に抑えてください
   - `types.ts`に新しい型定義を追加し、適切に活用してください
   - 型アサーション（`as Type`）を使用して、オブジェクト初期化時のプロパティの型を明確にしてください
   - 特に後から別の型の値が割り当てられる可能性のあるプロパティには、適切なユニオン型（`Type1 | Type2`）を使用してください

4. **ストリーミング処理**：
   - ストリーミング処理の状態管理に特に注意してください
   - 不完全なJSONフラグメントなどのエッジケースを適切に処理してください

5. **共通ユーティリティの活用**：
   - 可能な限り`core/llm/utils/`の共通ユーティリティを活用し、コードの重複を避けてください
   - 新しいユーティリティ関数が必要な場合は、独自モジュールに実装する前に共通ユーティリティとしての実装可能性を検討してください
   - 十分な共通ユーティリティがあれば、Databricks固有のモジュールを削減することも検討してください