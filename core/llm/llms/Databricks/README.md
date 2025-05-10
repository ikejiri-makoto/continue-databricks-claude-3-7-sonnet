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
    │           └── extension.d.ts  (型拡張定義 - コア型をDatabricks固有の要件で拡張)
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
- 並列ツール呼び出し制御の設定管理

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
- Anthropic風のJSONデルタベース処理の実装
- 部分的なJSONの効率的な処理

**7. `toolcalls.ts` - ツールコール処理**
- ツール呼び出しの処理と標準化
- ツール呼び出し引数の処理と修復
- ツール結果の統合
- 検索ツールの特別処理
- ツール呼び出し後のメッセージ前処理
- JSONデルタベースによるツール引数の段階的処理
- 二重化されたJSONパターンの検出と修復

**8. `types/` - 型定義**
- 厳密な型インターフェースの定義
- 型安全なコードのサポート
- 共通型定義の拡張
- JSON処理関連の型定義強化

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

// JSONデルタ処理
const jsonDelta = processJsonDelta(currentJson, deltaJson);
if (jsonDelta.complete) {
  // 完全なJSONとして処理
} else {
  // バッファリングを継続
}

// 二重化されたJSONパターンの修復
const repairedJson = repairDuplicatedJsonPattern(malformedJson);
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

// JSONデルタベース処理:
const result = processJsonDelta(currentJson, deltaJson);
if (result.complete && result.valid) {
  // 完全なJSONとして処理
  const data = safeJsonParse(result.combined, defaultValue);
  // 処理完了
} else {
  // さらにフラグメントを累積
  currentJson = result.combined;
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
- **ツール引数の修復**: 壊れたJSON引数を自動的に検出して修復
- **メッセージ前処理の強化**: ツール呼び出しと結果の整合性を保つための前処理機能
- **JSONデルタベース処理**: Anthropicスタイルのデルタベースでの部分的なJSONの処理
- **並列ツール呼び出し制御**: OpenAIスタイルの並列ツール呼び出し制御で重複問題を防止

### 3. 信頼性の高いエラー処理と回復メカニズム

- **自動リトライ**: 接続エラーやタイムアウト発生時に指数バックオフ方式でリトライ
- **状態の復元**: 接続エラー発生時に処理状態を保持し、再接続時に復元
- **状態の一貫性**: すべてのエラーパターンで一貫した状態プロパティを返し、型安全性を確保
- **タイムアウト管理**: HTTPレベルでのタイムアウト制御とAbortController/AbortSignalの活用
- **型安全な設計**: 厳密な型チェックとnull/undefined処理による実行時エラーの防止
- **イミュータブルなデータフロー**: 変数の再代入を最小限に抑え、予測可能な動作を実現

### 4. 堅牢なJSONストリーミング処理

ストリーミングJSONの処理において高い信頼性を提供します：

- **JSONの境界認識**: 完全なJSONオブジェクトの開始と終了を正確に識別
- **余分なデータの処理**: JSONの後に余分なデータがある場合でも適切に処理
- **部分的なJSONの累積**: ストリーミングで受信する断片的なJSONを適切に累積
- **エラー回復メカニズム**: JSONパースエラーが発生した場合のフォールバック処理
- **JSONデータの修復**: 壊れたJSON形式を自動的に検出して修復するメカニズム
- **JSON二重化パターンの検出と修復**: {"filepath": "app.py"}{"filepath": "app.py"} のような重複パターンを検出して修復
- **デルタベースのJSON処理**: Anthropicスタイルの部分的なJSON処理による堅牢な実装

### 5. Agentプログラミング機能のサポート

Continue拡張機能のAgentプログラミング機能を強化しています：

- **ツール結果の自動補完**: ツール呼び出し後のメッセージに必要なツール結果ブロックを自動的に挿入
- **ツール引数の修復**: 特に `builtin_create_new_file` などのファイル操作に関する引数の修復を強化
- **入れ子構造の検出**: 複雑な入れ子構造のJSONを検出して修復するメカニズム
- **メッセージ前処理パイプライン**: API呼び出し前にメッセージの整合性を確保するための前処理

## 改修内容

最新の改修では、以下の機能と改善が実装されました：

### 1. OpenAIスタイルの並列ツール呼び出し制御

ツール呼び出し処理で二重化されたJSONを防止するために、OpenAIの実装からインスピレーションを得た`parallel_tool_calls = false`設定を追加しました。これにより、ツール引数が重複する問題（例: `{"filepath": "app.py"}{"filepath": "app.py"}`）を防ぎます。

```typescript
// Databricks.ts の convertArgs メソッドに追加
if (options.tools && Array.isArray(options.tools) && options.tools.length > 0) {
  // ツール定義を設定
  finalOptions.tools = options.tools.map(tool => ({
    type: "function",
    function: {
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
    }
  }));

  // OpenAIのアプローチを取り入れた並列ツール呼び出し制御
  finalOptions.parallel_tool_calls = false;
  
  // その他の処理...
}
```

### 2. AnthropicスタイルのデルタベースのJSON処理

Anthropicの実装から着想を得た、部分的なJSONフラグメントを扱うための強力な機能を実装しました。これにより、ストリーミング中のJSONが断片的に届いても適切に処理できます。

```typescript
// json.ts に追加した新しい関数
export function processJsonDelta(
  currentJson: string,
  deltaJson: string
): { combined: string; complete: boolean; valid: boolean } {
  // 現在のJSONとデルタを結合
  const combined = currentJson + deltaJson;
  
  // 有効なJSONかチェック
  const validJson = extractValidJson(combined);
  const isValid = !!validJson;
  
  // 完全なJSONかチェック
  const isComplete = isValid && 
    ((validJson.trim().startsWith("{") && validJson.trim().endsWith("}")) ||
     (validJson.trim().startsWith("[") && validJson.trim().endsWith("]")));
  
  return {
    combined,
    complete: isComplete,
    valid: isValid
  };
}
```

### 3. JSONのパターン検出と修復機能

JSONの二重化パターンを検出して修復するための新しいユーティリティ関数を実装しました：

```typescript
export function repairDuplicatedJsonPattern(jsonStr: string): string {
  if (!jsonStr || typeof jsonStr !== 'string') {
    return jsonStr;
  }
  
  // 二重化パターンを検出する正規表現
  const duplicatePattern = /\{\s*"(\w+)"\s*:\s*"([^"]+)"\s*\}\s*\{\s*"\1"\s*:/g;
  
  if (duplicatePattern.test(jsonStr)) {
    // 有効なJSONを抽出
    const validJson = extractValidJson(jsonStr);
    if (validJson) {
      return validJson;
    }
    
    // 特定のパターンに対する修復
    return jsonStr.replace(duplicatePattern, '{$1": "$2"}');
  }
  
  return jsonStr;
}
```

### 4. ツール呼び出し引数のデルタベース処理

ToolCallProcessorに、部分的なツール引数を処理する新しいメソッドを追加しました：

```typescript
static processToolArgumentsDelta(
  toolName: string | undefined,
  jsonBuffer: string,
  newJsonFragment: string
): { 
  processedArgs: string;
  isComplete: boolean;
} {
  // JSONデルタの処理
  const result = processJsonDelta(jsonBuffer, newJsonFragment);
  
  // JSONの完全性をチェック
  if (result.complete && result.valid) {
    // 完全なJSONの処理と修復
    const validJson = extractValidJson(result.combined);
    if (validJson) {
      // 必要に応じて修復
      const repairedJson = repairDuplicatedJsonPattern(validJson);
      
      // ツール名に基づいた特殊処理
      if (toolName && isSearchTool(toolName)) {
        // 検索ツールの特別処理
        return {
          processedArgs: processSearchToolArguments(toolName, "", repairedJson),
          isComplete: true
        };
      }
      
      return {
        processedArgs: repairedJson,
        isComplete: true
      };
    }
  }
  
  // まだ完全なJSONではない場合
  return {
    processedArgs: result.combined,
    isComplete: false
  };
}
```

### 5. ストリーミング処理の改善

StreamingProcessorの`processToolCallDelta`メソッドを改良し、Anthropicスタイルのデルタベース処理を実装しました：

```typescript
// JSON引数を処理する部分
if (toolCallDelta.function?.arguments && result.updatedCurrentToolCall) {
  // デルタベースでJSONを処理
  const argsResult = ToolCallProcessor.processToolArgumentsDelta(
    result.updatedCurrentToolCall.function.name,
    result.updatedJsonBuffer,
    toolCallDelta.function.arguments
  );
  
  // 処理結果の更新
  result.updatedJsonBuffer = argsResult.processedArgs;
  
  // JSONが完成したかチェック
  if (argsResult.isComplete) {
    // 完全なJSON引数を現在のツール呼び出しに設定
    result.updatedCurrentToolCall.function.arguments = argsResult.processedArgs;
    result.updatedIsBufferingJson = false;
    result.updatedJsonBuffer = "";
    
    // ツール呼び出し配列を更新
    if (result.updatedCurrentToolCallIndex !== null) {
      result.updatedToolCalls[result.updatedCurrentToolCallIndex] = result.updatedCurrentToolCall;
    }
    
    // メッセージを提供する必要があることを示す
    result.shouldYieldMessage = true;
  }
}
```

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
- **JSON修復**: `repairToolArguments`などの修復機能を活用して壊れたJSONを修復する
- **デルタベース処理**: JSONフラグメントの処理には`processJsonDelta`を使用する
- **パターン検出**: JSONの二重化パターンは`repairDuplicatedJsonPattern`で修復する

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

`types/` ディレクトリには、Databricks Claude 3.7 Sonnetインテグレーションで使用される型定義が含まれています。型定義は、コード全体の型安全性を確保し、開発時のエラー検出を強化するために重要な役割を果たします。詳細は、`types/README.md`を参照してください。