# Databricks LLM Integration for Continue

このディレクトリには、Continue VS Code拡張機能からDatabricksのLLMサービス（特にClaude 3.7 Sonnet）に接続するための実装が含まれています。Databricksホステッドモデルへのアクセスを可能にし、コードの補完、説明、リファクタリングなどの機能をContinue拡張機能内で提供します。

## モジュール間の関係と連携

Databricksインテグレーションは、メインの`Databricks.ts`クラスと、`Databricks/`ディレクトリ内の複数の特化したモジュールから構成されています。また、`core/llm/utils/`ディレクトリの共通ユーティリティも積極的に活用しています。以下は各モジュール間の関係と連携の概要です。

### モジュール構造と依存関係

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
    │   ├── Databricks.ts       (メインクラス - 他のモジュールを統合)
    │   └── Databricks/
    │       ├── config.ts       (設定管理 - API接続情報の管理)
    │       ├── messages.ts     (メッセージ変換 - メッセージフォーマットの調整)
    │       ├── streaming.ts    (ストリーム処理 - レスポンスの逐次処理)
    │       ├── toolcalls.ts    (ツールコール処理 - ツール呼び出しの処理)
    │       └── types/          (型定義 - インターフェースと型の定義)
    │           ├── types.ts        (基本型定義)
    │           └── extension.d.ts  (型拡張定義)
    └── utils/
        ├── errors.ts          (エラー処理 - getErrorMessage, isConnectionErrorを提供)
        ├── json.ts            (JSON処理 - safeStringify, safeJsonParse, deepMergeJson関数を提供)
        ├── messageUtils.ts    (メッセージ処理 - コンテンツ抽出やクエリコンテキスト取得関数)
        ├── sseProcessing.ts   (SSE処理 - processSSEStream関数を提供)
        ├── streamProcessing.ts (ストリーム処理 - processContentDelta関数を提供)
        └── toolUtils.ts       (ツール処理 - isSearchTool, processSearchToolArgumentsを提供)
```

**Databricks.tsのインポート関係図：**

```
Databricks.ts
├── core/index.js から
│   └── ChatMessage, CompletionOptions, LLMOptions, ThinkingChatMessage (基本インターフェース)
├── core/util/messageContent.js から
│   └── renderChatMessage (チャットメッセージのレンダリング)
├── core/llm/index.js から
│   └── BaseLLM (Databricksクラスの基底クラス)
├── core/llm/types から
│   └── databricks-extensions (共通型定義拡張)
├── core/llm/utils/ から
│   ├── errors.ts: getErrorMessage, isConnectionError (エラー処理)
│   ├── json.ts: safeStringify, safeJsonParse (JSON操作)
│   ├── streamProcessing.ts: processContentDelta, JsonBufferHelpers (ストリーム処理)
│   ├── sseProcessing.ts: processSSEStream (SSEストリーム処理)
│   └── toolUtils.ts: isSearchTool, processSearchToolArguments (ツール処理)
└── Databricks/ モジュールから
    ├── config.ts: DatabricksConfig (API設定)
    ├── messages.ts: MessageProcessor (メッセージ変換)
    ├── toolcalls.ts: ToolCallProcessor (ツール処理)
    ├── streaming.ts: StreamingProcessor (ストリーム処理)
    └── types/: ToolCall, ThinkingChatMessage, etc. (型定義)
```

## 最新の改善点：コードの再構成とユーティリティ活用強化

最近の改修では以下の重要な改善を実施しました：

### 1. 責任分割の明確化

大きな`_streamChat`メソッドを複数の小さなメソッドに分割し、各メソッドの責任を明確化しました：

- `validateApiConfig()` - API設定の検証のみを担当
- `processStreamingRequest()` - ストリーミングリクエストの処理を担当
- `setupTimeoutController()` - タイムアウト制御の設定のみを担当
- `parseErrorResponse()` - エラーレスポンスの解析を担当
- `processNonStreamingResponse()` - 非ストリーミングレスポンスの処理を担当
- `processStreamingResponse()` - ストリーミングレスポンスの処理を担当
- `finalizeStreamingProcessing()` - ストリーミング処理の最終化を担当
- `handleRetry()` - リトライ処理のみを担当

この改修により、各メソッドがより小さく、テストしやすく、理解しやすくなりました。

### 2. 共通ユーティリティの活用強化

共通ユーティリティの活用を大幅に強化し、コードの重複を削減しました：

- `json.ts`に新たに追加された`safeJsonParse`と`deepMergeJson`関数を活用
- `toolUtils.ts`からの`isSearchTool`と`processSearchToolArguments`をより広範囲に活用
- `streamProcessing.ts`の`processContentDelta`と`JsonBufferHelpers`を適切に活用
- 型安全性を高めるための共通パターンを導入

### 3. ストリーミング処理の改善

`StreamingProcessor`クラスでも同様に機能を分割し、責任を明確化しました：

- `processChunk`メソッドをより小さな専門化された関数に分割
- `updateToolCallFunctionName`と`updateToolCallArguments`など、特定の処理に特化した関数を導入
- メッセージ処理、JSON処理、ツール処理のそれぞれを明確に分離
- 戻り値の適切な型定義と、型安全な返却値パターンの導入
- **定数変数の誤用修正**：`const`で宣言された変数への再代入エラーを修正し、イミュータブルな設計パターンを採用

### 4. 型安全性の向上

型安全性を確保するための一貫したパターンを実装しました：

- 明示的な型アノテーションの使用
- `null`チェックと境界チェックの統合
- TypeScriptの型絞り込みを有効に活用する適切なパターンの導入
- `undefined`と`null`の区別を明確にし、適切な型変換を導入
- オプショナルプロパティへのアクセス前の存在チェックの徹底

### 5. 定数の抽出とコード品質の向上

可読性と保守性の向上のために以下の改善を実施しました：

- マジックナンバーを定数として抽出（`DEFAULT_MAX_TOKENS`、`DEFAULT_TIMEOUT_MS`など）
- 複雑な条件を明確に分離し、それぞれを専用関数に移動
- ロギングを強化し、トラブルシューティングを容易に
- 重要な設定値に適切な最小値や最大値を設定

## TypeScriptの型安全性とnullチェックのベストプラクティス

Databricksインテグレーションのコードでは、TypeScriptの型安全性を確保するために以下のパターンを採用しています：

1. **型の絞り込みのためのローカル変数の活用**：
   ```typescript
   // 良い例: 型の絞り込みを確実にする
   if (currentValue !== null) {
     const safeValue = currentValue; // ローカル変数に代入して型を確定
     // safeValueはnullでないことが保証される
   }
   ```

2. **配列アクセス前の完全な境界チェック**：
   ```typescript
   if (currentToolCall !== null && currentToolCallIndex !== null) {
     const index: number = Number(currentToolCallIndex);
     
     if (!Number.isNaN(index) && index >= 0 && index < toolCalls.length) {
       toolCalls[index] = currentToolCall;
     } else {
       console.warn(`無効なツール呼び出しインデックス: ${currentToolCallIndex}`);
     }
   }
   ```

3. **JSONの安全な処理**：
   ```typescript
   // 改修前:
   try {
     const parsedJson = JSON.parse(jsonBuffer);
     // 処理
   } catch (e) {
     console.warn(`JSONバッファ処理エラー: ${e}`);
   }
   
   // 改修後:
   const parsedJson = safeJsonParse(jsonBuffer, null);
   if (parsedJson !== null) {
     // 処理
   }
   ```

4. **イミュータブルな設計とオブジェクト更新パターン**：
   ```typescript
   // 定数オブジェクトを宣言
   const result = {
     updatedMessage: { ...currentMessage },
     // その他のプロパティ
   };
   
   // 改修前 - エラーの原因:
   // result = this.updateToolCallFunctionName(...); // 定数への再代入はエラー
   
   // 改修後:
   const updatedResult = this.updateToolCallFunctionName(...);
   // 個別のプロパティを更新
   result.updatedMessage = updatedResult.updatedMessage;
   result.updatedToolCalls = updatedResult.updatedToolCalls;
   // 他のプロパティも同様に更新
   ```

5. **undefined/nullの明確な区別と適切な処理**：
   ```typescript
   // 改修前 - 型の不一致:
   lastError = result.error; // Error | undefined を Error | null に代入できない
   
   // 改修後:
   lastError = result.error !== undefined ? result.error : null;
   ```

これらのパターンを一貫して適用することで、コンパイルエラーを防ぎ、実行時エラーのリスクを軽減しています。特に複雑な非同期処理を含むストリーミングコードでは、これらのパターンが非常に重要です。

## 各モジュールの役割と責任

### 1. `Databricks.ts`（メインクラス）

このモジュールはDatabricksインテグレーションのエントリーポイントとして機能し、以下の責任を持ちます：

- BaseLLMを継承し、必要なメソッドを実装
- リクエストの基本的な検証とエラー処理
- リトライと回復ロジックの調整
- 他のモジュールの調整と連携

**共通ユーティリティの活用**:
- `getErrorMessage`, `isConnectionError` - エラー処理の統一化
- `safeStringify`, `safeJsonParse` - JSON処理の安全性確保
- `processSSEStream` - SSEストリームの標準化された処理

### 2. `config.ts`（設定管理）

このモジュールはDatabricks固有の設定ロードを処理しています：

- 設定ファイルからAPI情報の読み込み
- URLの正規化と検証
- デフォルト値の提供

### 3. `messages.ts`（メッセージ変換）

このモジュールはDatabricksのAPI形式に合わせたメッセージ変換を担当しています：

- Claude 3.7 Sonnetの特殊な要件（「水平思考」と「ステップバイステップ」の指示など）の処理
- ツール呼び出しを含むメッセージの変換
- システムメッセージやthinkingメッセージの特殊な取り扱い

**共通ユーティリティの活用**:
- `extractContentAsString`, `extractQueryContext` - メッセージ内容の抽出
- `safeStringify` - メッセージのJSON変換

### 4. `streaming.ts`（ストリーム処理）

このモジュールはDatabricksのストリーミングレスポンスの処理を担当しています：

- 思考プロセス（thinking）のストリーミング処理
- ツール呼び出しのストリーミング処理
- JSONフラグメントのバッファリングと処理
- 接続エラーからの回復処理

**共通ユーティリティの活用**:
- `processContentDelta` - 増分コンテンツの処理
- `JsonBufferHelpers` - JSON断片のバッファリング
- `isSearchTool`, `processSearchToolArguments` - 検索ツールの特殊処理
- `safeJsonParse` - 安全なJSON解析

### 5. `toolcalls.ts`（ツールコール処理）

このモジュールはツール呼び出しとその結果の処理を担当しています：

- ツール呼び出しの前処理と標準化
- ツール結果メッセージの挿入
- 検索ツールの特別処理

**共通ユーティリティの活用**:
- `formatToolResultsContent` - ツール結果の標準フォーマット
- `isSearchTool` - ツールタイプの判定
- `processSearchToolArguments` - 検索ツール引数の処理

### 6. `types/`（型定義ディレクトリ）

このディレクトリはDatabricks統合のためのTypeScript型定義を提供します：

- Databricks固有のメッセージ形式や構造の型定義
- ツール呼び出し、ストリーミングチャンク、思考メッセージなどの型定義
- 共通型定義の拡張とバックアップメカニズム

## API互換性の考慮事項と対応策

DatabricksのAPIはOpenAI互換形式を提供していますが、完全な互換性はありません。特に以下の点に対応しています：

1. **タイムアウト処理の改善**:
   ```typescript
   const DEFAULT_TIMEOUT_MS = 300000; // 5分
   const timeoutController = new AbortController();
   const timeoutMs = (options as any).requestTimeout ? (options as any).requestTimeout * 1000 : DEFAULT_TIMEOUT_MS;
   
   const timeoutId = setTimeout(() => {
     console.log(`リクエストタイムアウト（${timeoutMs}ms）に達したため中断します`);
     timeoutController.abort('Request timeout');
   }, timeoutMs);
   
   // ユーザー提供のシグナルと内部タイムアウトシグナルを結合
   const combinedSignal = AbortSignal.any([signal, timeoutController.signal]);
   ```

2. **リトライ処理の一元化と型安全性向上**:
   ```typescript
   private async handleRetry(
     retryCount: number, 
     error: Error, // 明示的にError型を要求
     state?: any
   ): Promise<void> {
     // バックオフ時間（指数バックオフ）- 初回は短めに、その後長めに
     const backoffTime = Math.min(2000 * Math.pow(2, retryCount - 1), 30000);
     console.log(`リトライ準備中 (${retryCount}/${MAX_RETRIES}): ${error.message}`);
     
     // タイムアウトエラーの特別処理
     if (error instanceof DOMException && error.name === 'AbortError') {
       console.log(`タイムアウトによりリクエストが中止されました。リトライします。`);
     }
     
     await new Promise(resolve => setTimeout(resolve, backoffTime));
   }
   ```

3. **エラーレスポンスの安全なパース**:
   ```typescript
   private async parseErrorResponse(response: Response): Promise<{ error: Error }> {
     const errorText = await response.text();
     
     // 明示的な型定義でプロパティアクセスを安全に
     interface ErrorResponse {
       error?: { message?: string; };
       message?: string;
     }
     
     const errorJson = safeJsonParse<ErrorResponse>(errorText, { error: { message: errorText } });
     
     // 各種プロパティの存在チェックを行い、安全にアクセス
     const errorMessage = 
       (errorJson.error && errorJson.error.message) || 
       errorJson.message || 
       errorText;
     
     return {
       error: new Error(`Databricks API error: ${response.status} - ${errorMessage}`)
     };
   }
   ```

## 型安全性に関する主な改善点

最近の改修では、TypeScriptの型システムの利点を最大限に活かすための重要な改善を行いました：

1. **`undefined`と`null`の明確な区別**：
   TypeScriptでは`undefined`と`null`は異なる型として扱われます。今回の修正では、これらを正しく処理するコードパターンを導入しました。

2. **オプショナルプロパティへの安全なアクセス**：
   `errorJson.error?.message`のようなオプショナルチェーニングだけでなく、親オブジェクトの存在確認も含めた完全なチェックを行うようにしました。

3. **イミュータブルな設計パターンの採用**：
   `const`で宣言された変数に対する再代入を避け、代わりに戻り値の一部を使って更新する方法を採用しました。これにより、予期しない変数の変更を防ぎます。

4. **戻り値の型定義の明確化**：
   非同期関数やジェネレータ関数の戻り値の型をより明確に定義し、互換性のある型変換を行うようにしました。

5. **配列インデックスの境界チェック強化**：
   配列へのアクセス前に、インデックスがnullでないことの確認だけでなく、範囲内であることも検証するようになりました。

これらの改善により、TypeScriptコンパイラによる型チェックが適切に機能し、潜在的なランタイムエラーを事前に検出できるようになりました。

## 開発ガイドライン

Databricksインテグレーションを拡張または修正する際は、以下のガイドラインに従ってください：

1. **モジュール分離の原則**:
   - 機能ごとに適切なモジュールに実装を追加する
   - 大きな関数を小さな責任単位に分割する
   - `Databricks.ts`はコーディネーターとして機能させ、詳細な実装は各サブモジュールに委譲する

2. **共通ユーティリティの活用**:
   - 新しいコードを書く前に、既存の共通ユーティリティが利用できないか確認する
   - `safeJsonParse`, `deepMergeJson`などの新しく追加された関数を活用する
   - プロバイダ特有のロジックとプロバイダに依存しない一般的なロジックを分離する

3. **型安全性の確保**:
   - null可能な値には必ず条件チェックを行う
   - 配列アクセス前に境界チェックを実施する
   - 型アサーションを最小限に抑え、必要な場合はコメントで理由を説明する
   - 複雑な条件分岐では型の絞り込みに注意し、適切なパターンを使用する
   - `const`宣言された変数への再代入は避け、プロパティ更新または新しい変数を使用する

4. **エラー処理の一貫性**:
   - `getErrorMessage`, `isConnectionError`などの共通関数を使用する
   - 接続エラー、タイムアウトエラー、APIエラーなどを適切に区別する
   - リトライ可能なエラーとリトライ不可能なエラーを明確に区別する

5. **ステップバイステップのリファクタリング**:
   - 大きな変更よりも段階的な改善を優先する
   - 変更ごとにテストを行い、問題が発生した場合は迅速に対応する
   - バグ修正と機能追加を分離し、一度に一つの改善に集中する

これらのガイドラインに従うことで、コードの品質、可読性、保守性が向上し、バグの発生リスクを低減できます。

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

### 3. 信頼性の高いエラー処理と型安全性

堅牢なエラー処理と回復メカニズム、および強化された型安全性を実装しています：

- **自動リトライ**: 接続エラーやタイムアウト発生時に指数バックオフ方式でリトライ
- **状態の復元**: 接続エラー発生時に処理状態を保持し、再接続時に復元
- **タイムアウト管理**: HTTPレベルでのタイムアウト制御とAbortController/AbortSignalの活用
- **型安全な設計**: 厳密な型チェックとnull/undefined処理による実行時エラーの防止
- **イミュータブルなデータフロー**: 変数の再代入を最小限に抑え、予測可能な動作を実現

この改善により、ネットワーク不安定時や長時間実行時の信頼性、およびコードの保守性が大幅に向上しています。

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