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
        └── streamProcessing.js (ストリーム処理 - ストリームレスポンスの加工)
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

### Databricks固有モジュールからのインポート

7. **`./Databricks/config.js`**から：
   - `DatabricksConfig` - 設定ファイルからのAPI情報の読み込みや正規化を行うクラス

8. **`./Databricks/messages.js`**から：
   - `MessageProcessor` - メッセージ変換を担当するクラス

9. **`./Databricks/toolcalls.js`**から：
   - `ToolCallProcessor` - ツール呼び出しの処理を担当するクラス

10. **`./Databricks/streaming.js`**から：
    - `StreamingProcessor` - ストリーミングレスポンスの処理を担当するクラス

11. **`./Databricks/types.js`**から：
    - `ToolCall` - ツール呼び出しの型定義

## メインクラスとモジュールの詳細説明

### Databricks.ts（メインクラス）

`Databricks.ts`は統合の中心的なクラスで、`BaseLLM`を継承しています。このクラスの主な役割は：

1. **API接続管理**：
   - `config.ts`を使用して設定ファイルからAPIベースURLとAPIキーを読み込みます
   - API接続のエラー処理とリトライロジックを実装しています

2. **リクエスト変換**：
   - `convertArgs()`メソッドで、Continueの`CompletionOptions`をDatabricks API用のパラメータに変換します
   - `convertMessages()`メソッドで、Continueの`ChatMessage`配列をDatabricksのフォーマットに変換します
   - この過程で`MessageProcessor`と`ToolCallProcessor`のメソッドを使用します

3. **ストリーミング処理**：
   - `_streamChat()`メソッドで、Databricks APIとのストリーミング通信を管理します
   - `sseProcessing.js`の`processSSEStream()`を使ってSSEストリームを処理します
   - `StreamingProcessor`を使用して各チャンクを処理します

4. **エラー処理と回復**：
   - 接続エラーの検出と指数バックオフによるリトライを実装しています
   - `errors.ts`からの`getErrorMessage`と`isConnectionError`を使用してエラーを分類します

### Databricks/config.ts（設定管理）

このモジュールは設定関連の機能を提供します：

1. **設定の読み込み**：
   - `getApiBaseFromConfig()`と`getApiKeyFromConfig()`メソッドで設定ファイルからAPI情報を取得します
   - 設定ファイルが見つからない場合や値が設定されていない場合のデフォルト値を提供します

2. **URL正規化**：
   - `normalizeApiUrl()`メソッドでAPI URLの形式を正規化します（末尾のスラッシュの処理など）

### Databricks/messages.ts（メッセージ変換）

このモジュールは`MessageProcessor`クラスを提供し、メッセージ形式の変換を担当します：

1. **メッセージサニタイズ**：
   - `sanitizeMessages()`メソッドで、会話履歴内のメッセージを標準形式に変換します
   - `messageUtils.ts`の`extractContentAsString()`を使用してコンテンツを抽出します

2. **OpenAI形式への変換**：
   - `convertToOpenAIFormat()`メソッドで、メッセージをDatabricks APIの期待する形式に変換します
   - システムメッセージの特別処理（「水平思考」と「ステップバイステップ」の指示の追加など）を行います
   - ツール呼び出しを含むアシスタントメッセージの特別処理を実装しています

3. **メッセージ操作ユーティリティ**：
   - メッセージの空チェック、ツール呼び出しの検出、連続メッセージの結合などの機能を提供します
   - これらの機能は元の`core/llm/messages.ts`から統合されています

### Databricks/streaming.ts（ストリーム処理）

`StreamingProcessor`クラスを提供し、ストリーミングレスポンスの処理を担当します：

1. **チャンク処理**：
   - `processChunk()`メソッドで、Databricksからのストリーミングチャンクを処理します
   - 思考プロセス（thinking）、通常のコンテンツ、ツール呼び出しなど、様々なタイプのデータを処理します

2. **JSON処理**：
   - ツール引数の不完全なJSONフラグメントを処理するためのバッファリングメカニズムを実装しています
   - `json.ts`の`safeStringify()`などを使用して安全なJSON操作を行います

3. **検索ツール引数の処理**：
   - `ensureSearchToolArguments()`メソッドで、検索ツールに適切なクエリパラメータが設定されるようにします

### Databricks/toolcalls.ts（ツールコール処理）

`ToolCallProcessor`クラスを提供し、ツール呼び出しとその結果の処理を担当します：

1. **ツール呼び出しの前処理**：
   - `preprocessToolCallsAndResults()`メソッドで、チャット履歴内のツール呼び出しとその結果を前処理します

2. **検索ツール特別処理**：
   - 検索ツールのための引数処理を強化し、クエリパラメータが常に存在するようにします
   - `messageUtils.ts`の`extractQueryContext()`を使用して、ユーザーメッセージから適切なクエリを抽出します

### Databricks/types.ts（型定義）

インテグレーションで使用される型定義を提供します：

1. **メッセージ型**：
   - `AssistantChatMessage`：アシスタントメッセージの型
   - `ToolResultMessage`：ツール結果メッセージの型

2. **ツール関連の型**：
   - `ToolCall`：ツール呼び出しの型
   - `Function`：関数の型

3. **ストリーミング関連の型**：
   - `ThinkingChunk`：思考プロセス用のチャンク型
   - `StreamingChunk`：ストリーミングチャンクの型
   - `StreamingError`：ストリーミングエラーの型

## 外部ユーティリティとの連携

`Databricks.ts`とそのサブモジュールは、`core/llm/utils/`ディレクトリの共通ユーティリティを広範囲に活用しています：

### errors.ts（エラー処理）

- `getErrorMessage()`：様々なエラー形式から一貫したエラーメッセージを抽出します
- `isConnectionError()`：接続関連のエラーを識別します（リトライ判断に使用）

### json.ts（JSON処理）

- `safeStringify()`：オブジェクトを安全に文字列化します（循環参照などのエッジケースに対応）
- その他のJSON操作ユーティリティを提供し、JSON処理の堅牢性を向上させます

### messageUtils.ts（メッセージ処理）

- `extractContentAsString()`：様々な形式のメッセージコンテンツから文字列を抽出します
- `extractQueryContext()`：ユーザーメッセージから検索クエリのコンテキストを抽出します

### sseProcessing.ts（SSE処理）

- `processSSEStream()`：Server-Sent Eventsストリームを処理し、個別のイベントに分解します
- Databricksからのストリーミングレスポンスの基本的な処理を担当します

### streamProcessing.ts（ストリーム処理）

- ストリームデータの解析と変換のためのユーティリティを提供します
- チャンクの結合や分割、バッファリングなどの機能をサポートします

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

2. **エラー処理**：
   - すべてのAPI呼び出しに適切なエラー処理を実装してください
   - 接続エラーとアプリケーションエラーを区別し、適切に対応します

3. **型安全性**：
   - 可能な限り明示的な型を使用し、`any`型の使用を最小限に抑えてください
   - `types.ts`に新しい型定義を追加し、適切に活用してください

4. **ストリーミング処理**：
   - ストリーミング処理の状態管理に特に注意してください
   - 不完全なJSONフラグメントなどのエッジケースを適切に処理してください

5. **共通ユーティリティの活用**：
   - 可能な限り`core/llm/utils/`の共通ユーティリティを活用し、コードの重複を避けてください
   - 新しいユーティリティ関数が必要な場合は、適切な場所に追加して再利用を促進してください
