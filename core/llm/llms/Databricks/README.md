# Databricks LLM Integration for Continue

このディレクトリには、Continue VS Code拡張機能からDatabricksのLLMサービス（特にClaude 3.7 Sonnet）に接続するための実装が含まれています。Databricksホステッドモデルへのアクセスを可能にし、コードの補完、説明、リファクタリングなどの機能をContinue拡張機能内で提供します。

## モジュール間の関係と連携

Databricksインテグレーションは、メインの`Databricks.ts`クラスと、`Databricks/`ディレクトリ内の複数の特化したモジュールから構成されています。モジュール化された設計により、責任を明確に分離し、共通ユーティリティを最大限に活用しています。

### 強化されたモジュール構造と責任分担

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
    │           ├── extension.d.ts  (型拡張定義 - コア型をDatabricks固有の要件で拡張)
    │           └── README.md       (型定義の使用方法と説明)
    └── utils/
        ├── errors.ts          (エラー処理 - getErrorMessage, isConnectionErrorを提供)
        ├── json.ts            (JSON処理 - safeStringify, safeJsonParse, extractValidJson, deepMergeJson関数を提供)
        ├── messageUtils.ts    (メッセージ処理 - コンテンツ抽出やクエリコンテキスト取得関数)
        ├── sseProcessing.ts   (SSE処理 - processSSEStream関数を提供)
        ├── streamProcessing.ts (ストリーム処理 - processContentDelta, JsonBufferHelpers関数を提供)
        └── toolUtils.ts       (ツール処理 - isSearchTool, processSearchToolArgumentsを提供)
```

### 各モジュールの明確な責任

**1. `Databricks.ts` - オーケストレーター**
- BaseLLMを継承、公開APIを実装
- 各専門モジュールの調整と連携
- リクエストのルーティング
- 高レベルのエラー処理
- 責任を適切なモジュールに委譲

**2. `config.ts` - 設定管理**
- API設定の読み込みと検証
- URLの正規化
- タイムアウト設定の処理
- 設定の検証ロジック

**3. `errors.ts` - エラー処理**
- Databricks固有のエラー処理
- エラーレスポンスのパース
- リトライロジックの実装
- 接続エラーとタイムアウトの管理

**4. `helpers.ts` - ヘルパー関数**
- リクエストパラメータの構築
- ストリーミング状態の初期化
- 共通定数と初期値の管理
- ユーティリティ関数

**5. `messages.ts` - メッセージ変換**
- 標準メッセージフォーマットの変換
- Claude 3.7 Sonnet固有のメッセージ処理
- システムメッセージとユーザーメッセージの処理
- 思考プロセスメッセージの統合

**6. `streaming.ts` - ストリーム処理**
- ストリーミングレスポンスの処理
- 思考プロセスのストリーム処理
- JSONフラグメントの累積処理
- ツール呼び出しのストリーミング処理
- 接続エラーからの回復

**7. `toolcalls.ts` - ツールコール処理**
- ツール呼び出しの処理と標準化
- ツール呼び出し引数の処理
- ツール結果の統合
- 検索ツールの特別処理

**8. `types/` - 型定義**
- 厳密な型インターフェースの定義
- 型安全なコードのサポート
- 共通型定義の拡張

## 共通ユーティリティの活用強化

各モジュールで共通ユーティリティを最大限に活用することで、コードの重複を削減し、品質を向上させています：

### 1. JSON処理ユーティリティ

`json.ts`の強力な関数を活用して、JSON処理の安全性と堅牢性を向上：

```typescript
// 安全なJSONパース
const config = safeJsonParse<ConfigType>(jsonText, defaultConfig);

// 混合コンテンツからの有効なJSON抽出
const validJson = extractValidJson(mixedContent);
if (validJson) {
  const parsedData = safeJsonParse(validJson, defaultValue);
  // 有効なJSONのみを処理
}

// JSONオブジェクトのディープマージ
const mergedConfig = deepMergeJson(defaultConfig, userConfig);
```

### 2. エラー処理ユーティリティ

`errors.ts`の標準化されたエラー処理パターンを活用：

```typescript
try {
  // API呼び出しやその他の操作
} catch (error: unknown) {
  // エラータイプに関係なく一貫したエラーメッセージを取得
  const errorMessage = getErrorMessage(error);
  
  // リトライが適切かどうかを判断
  if (isConnectionError(error)) {
    // 接続エラーの処理 - リトライの実施など
  } else {
    // その他のエラー処理
  }
}
```

### 3. ストリーム処理ユーティリティ

`streamProcessing.ts`のストリーム処理ユーティリティを活用：

```typescript
// ストリーミングJSONフラグメントの処理:
let buffer = JsonBufferHelpers.resetBuffer();

// フラグメントを受信したとき:
buffer = JsonBufferHelpers.addToBuffer(fragment, buffer, maxBufferSize);

// バッファが完全なJSONかどうかをチェック:
if (JsonBufferHelpers.isBufferComplete(buffer)) {
  const data = safeJsonParse(buffer, defaultValue);
  // データ処理
}
```

### 4. メッセージユーティリティ

`messageUtils.ts`のメッセージ処理ユーティリティを活用：

```typescript
// コンテキストを会話から抽出
const queryContext = extractQueryContext(messages);

// コンテンツを文字列として安全に抽出
const contentString = extractContentAsString(content);

// メッセージをAPI用にクリーニング
const cleanMessages = sanitizeMessages(messages);
```

## 型安全性の強化

TypeScriptの型安全性を最大限に活用するための一貫したパターンを導入しています：

### 1. 明示的な型アノテーション

```typescript
// 関数シグネチャに明示的な型を使用
function processToolCallArguments(
  toolName: string,
  currentArgs: string,
  newArgs: string,
  messages: ChatMessage[]
): string {
  // 実装
}

// 戻り値や変数にも明示的な型を使用
const result: StreamingResult = {
  updatedMessage: { ...currentMessage },
  updatedToolCalls: [...toolCalls],
  // 他のプロパティ
};
```

### 2. nullとundefinedの区別

```typescript
// undefinedとnullの明確な区別
const error: Error | null = result.error !== undefined 
  ? result.error 
  : null;

// オプショナルプロパティへの安全なアクセス
const errorMessage = 
  (errorJson.error && errorJson.error.message) || 
  errorJson.message || 
  defaultMessage;
```

### 3. 配列アクセスの安全性

```typescript
// 配列アクセスの完全な安全性確保
if (index !== null) {
  const numericIndex = Number(index);
  
  if (!Number.isNaN(numericIndex) && numericIndex >= 0 && numericIndex < array.length) {
    // インデックスが有効な場合のみアクセス
    array[numericIndex] = value;
  } else {
    console.warn(`無効なインデックス: ${index}`);
  }
}
```

### 4. イミュータブルなデータパターン

```typescript
// 変数の再代入を避け、新しいオブジェクトを作成
const original = { value: 1, other: 2 };

// 不変パターン - 元のオブジェクトを変更しない
const updated = {
  ...original,
  value: original.value + 1
};

// 配列の不変更新
const newArray = [...oldArray.slice(0, index), newItem, ...oldArray.slice(index + 1)];
```

## 機能と特徴

### 1. Claude 3.7 Sonnetとの完全統合

Databricksホステッドの最新のClaude 3.7 Sonnetモデルと完全に統合しています：

- **思考プロセスの表示**: モデルの思考過程をリアルタイムで表示
- **ストリーミングレスポンス**: 回答が生成されるにつれてリアルタイムで表示
- **長いコンテキスト**: 最大200,000トークンの長いコンテキストウィンドウをサポート
- **日本語サポート**: 「水平思考」と「ステップバイステップ」などの日本語指示に対応

### 2. 堅牢なツール呼び出し機能

Continue拡張機能のツール呼び出し機能を強化しています：

- **検索ツールの強化**: 検索クエリが常に適切に設定されるよう特別処理を実装
- **引数処理の改善**: JSONフラグメントを適切に処理し、完全なJSONになるまでバッファリング
- **ツール結果の統合**: ツール呼び出しの結果を会話の流れに自然に統合

### 3. 信頼性の高いエラー処理と回復メカニズム

- **自動リトライ**: 接続エラーやタイムアウト発生時に指数バックオフ方式でリトライ
- **状態の復元**: 接続エラー発生時に処理状態を保持し、再接続時に復元
- **タイムアウト管理**: HTTPレベルでのタイムアウト制御とAbortController/AbortSignalの活用
- **型安全な設計**: 厳密な型チェックとnull/undefined処理による実行時エラーの防止
- **イミュータブルなデータフロー**: 変数の再代入を最小限に抑え、予測可能な動作を実現

### 4. 堅牢なJSONストリーミング処理

ストリーミングJSONの処理において高い信頼性を提供します：

- **JSONの境界認識**: 完全なJSONオブジェクトの開始と終了を正確に識別
- **余分なデータの処理**: JSONの後に余分なデータがある場合でも適切に処理
- **部分的なJSONの累積**: ストリーミングで受信する断片的なJSONを適切に累積
- **エラー回復メカニズム**: JSONパースエラーが発生した場合のフォールバック処理

## 開発ガイドライン

Databricksインテグレーションを拡張または修正する際は、以下のガイドラインに従ってください：

### 1. モジュール分離の原則

- **単一責任の原則**: 各モジュールは明確に定義された単一の責任を持つべき
- **関心の分離**: 異なる機能領域を別々のモジュールに分離する
- **オーケストレーションパターン**: `Databricks.ts`はオーケストレーターとして機能し、詳細は専門モジュールに委譲する
- **小さなメソッド**: 大きな関数を小さな専門化された関数に分割する

### 2. 共通ユーティリティの活用

- **車輪の再発明を避ける**: 新しいコードを書く前に、既存の共通ユーティリティを確認する
- **標準パターンの活用**: 特にJSON処理、エラー処理、型安全性のための共通パターンを使用する
- **提供者固有のロジックの分離**: 共通ユーティリティは提供者に依存しないようにし、提供者固有のロジックは専用モジュールに配置する

### 3. 型安全性の確保

- **null可能な値の処理**: null可能な値には必ず条件チェックを行う
- **配列インデックスの検証**: 配列へのアクセス前に境界チェックを行う
- **型アサーションの最小化**: 型アサーションは最小限に抑え、必要な場合はコメントで理由を説明する
- **型の絞り込み**: 複雑な条件分岐では適切な型絞り込みパターンを使用する
- **イミュータブルな設計**: 変数の再代入を避け、イミュータブルな更新パターンを使用する

### 4. エラー処理とリカバリー

- **一貫したエラー処理**: 共通のエラー処理パターンを使用する
- **詳細なエラーメッセージ**: エラーメッセージには具体的な情報を含める
- **段階的なリカバリー**: リカバリー可能なエラーには段階的なリカバリー戦略を実装する
- **状態の保持と復元**: ストリーミング中断時には状態を保持し、再接続時に復元する

### 5. JSON処理のベストプラクティス

- **安全なJSONパース**: 直接的な`JSON.parse`の代わりに`safeJsonParse`を使用する
- **有効なJSON抽出**: 混合コンテンツからJSONを抽出する場合は`extractValidJson`を使用する
- **JSONバッファリング**: ストリーミングJSONフラグメントは`JsonBufferHelpers`で処理する
- **サイズ制限**: JSONバッファには最大サイズ制限を設ける

これらのガイドラインを遵守することで、コードの品質、可読性、保守性が向上し、バグの発生リスクを低減できます。

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

## Databricks LLM Types

`types/` ディレクトリには、Databricks Claude 3.7 Sonnetインテグレーションで使用される型定義が含まれています。型定義は、コード全体の型安全性を確保し、開発時のエラー検出を強化するために重要な役割を果たします。

### モジュール構造と責任分担

```
types/
├── index.ts         (型定義のエントリーポイント - すべての型をエクスポート)
├── types.ts         (主要な型定義 - 専用インターフェースを定義)
└── extension.d.ts   (型拡張定義 - コア型をDatabricks固有の要件で拡張)
```

#### 各ファイルの明確な責任

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

### 主要な型定義

#### 1. ベース型定義

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

#### 2. ストリーミング関連の型定義

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

#### 3. 処理結果の型定義

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

#### 4. 状態管理の型定義

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

### 型拡張

既存のコア型定義を拡張してDatabricks固有の機能をサポートしています：

#### 1. LLMOptionsの拡張

```typescript
interface LLMOptions {
  /**
   * 思考プロセスを常にログに表示するかどうかの設定
   * trueの場合は常に表示、falseの場合は開発モードのみ表示
   */
  thinkingProcess?: boolean;
}
```

#### 2. CompletionOptionsの拡張

```typescript
interface CompletionOptions {
  /**
   * リクエストのタイムアウト (秒)
   * デフォルトは300秒 (5分)
   */
  requestTimeout?: number;
}
```

#### 3. ThinkingChatMessageの拡張

```typescript
interface ThinkingChatMessage extends ChatMessage {
  role: "thinking";
  content: string | object;
  signature?: string;
  redactedThinking?: string;
  toolCalls?: any[];
}
```

### 共通ユーティリティとの連携

型定義は共通ユーティリティと密接に連携し、以下の原則に従っています：

#### 1. 厳格な型チェック

```typescript
// nullかundefinedかを明確に区別する型
function processToolCall(
  toolCall: ToolCall | null,
  index: number | null
): ToolCallResult {
  // 実装
}
```

#### 2. 型安全なエラー処理

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

#### 3. 状態管理の型サポート

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

### ベストプラクティス

Databricks型定義を拡張または使用する際は、以下のベストプラクティスに従ってください：

#### 1. 明示的な型アノテーション

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

#### 2. NULL安全性の確保

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

#### 3. 型の絞り込み

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

#### 4. 型拡張の明確な文書化

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

### 共通ユーティリティの活用強化

型定義の使用時には、以下の共通ユーティリティを活用してください：

#### 1. 型安全なJSON処理

```typescript
// jsonユーティリティと型定義の連携
import { safeJsonParse } from "../../../utils/json.js";
import type { StreamingChunk } from "../types/index.js";

// 型安全なJSONパース
const chunk = safeJsonParse<StreamingChunk>(jsonText, defaultChunk);
```

#### 2. エラー処理と型の連携

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

#### 3. ストリーム処理と型の連携

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