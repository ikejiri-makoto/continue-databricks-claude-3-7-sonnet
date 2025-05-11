# Databricks LLM Integration for Continue

このディレクトリには、Continue VS Code拡張機能からDatabricksのLLMサービス（特にClaude 3.7 Sonnet）に接続するための実装が含まれています。Databricksホステッドモデルへのアクセスを可能にし、コードの補完、説明、リファクタリングなどの機能をContinue拡張機能内で提供します。

## Databricks固有の制限事項

### parallel_tool_callsパラメータについて

**重要**: Databricksのエンドポイントは`parallel_tool_calls`パラメータをサポートしていません。このパラメータは、他のプロバイダー（OpenAI等）ではツール呼び出しを並列に処理するために使用されますが、Databricksエンドポイントではこのパラメータを認識せず、エラーの原因となる可能性があります。

この問題に対して、以下の対策を実装しています：

1. **型定義レベルでの除外**: `DatabricksCompletionOptions`インターフェースと`DatabricksLLMOptions`インターフェースからこのパラメータを意図的に除外し、型安全性を確保
2. **パラメータ設定の回避**: `DatabricksHelpers.convertArgs()`メソッドでこのパラメータを設定しないよう修正
3. **安全なアクセス**: `requestBody`オブジェクトの代わりに、正しく型定義された`args`オブジェクトからツール情報を取得するように修正
4. **詳細なログ出力**: ツール関連の処理について詳細なログを出力し、デバッグを容易に
5. **エラー検知と処理**: 特殊なエラーパターンを検出し、適切に対処するためのエラーハンドリングを強化
6. **安全値の確認と削除**: リクエスト送信前に最終確認を行い、`parallel_tool_calls`パラメータが設定されている場合は自動的に削除
7. **多重防御**: `convertArgs()`内のチェックとリクエストボディ構築時の再チェックによる多重防御

これらの対策により、Databricksエンドポイントとのツール呼び出し機能の互換性が向上し、エラーを防止しています。

### デバッグとロギングのベストプラクティス

**重要**: Databricksモジュールのデバッグ時に`[object Object]`が表示される問題を防止するため、以下のベストプラクティスに従ってください：

1. **オブジェクトのログ出力時は必ず文字列化する**:
   ```typescript
   // 悪い例 - [object Object]と表示される
   console.log(`ツール情報:`, tool);
   
   // 良い例 - プロパティが適切に表示される
   import { safeStringify } from "../../utils/json.js";
   console.log(`ツール情報:`, safeStringify(tool, "<invalid>"));
   ```

2. **オブジェクトプロパティへの安全なアクセス**:
   ```typescript
   // 悪い例 - プロパティが存在しない場合にエラー
   const toolName = tool.function.name;
   
   // 良い例 - オプショナルチェイニングでnullセーフに
   const toolName = tool?.function?.name || "<unnamed>";
   ```

3. **デバッグログの例外処理**:
   ```typescript
   // デバッグ時の例外処理
   try {
     // ツール名などのログ出力処理
     const toolNames = args.tools
       .map((t: any) => t?.function?.name || 'unnamed')
       .join(', ');
     console.log(`ツール名: ${toolNames}`);
   } catch (e) {
     console.log(`ログ出力中にエラー: ${getErrorMessage(e)}`);
   }
   ```

4. **リクエストボディのログ出力改善**:
   ```typescript
   // リクエストボディの安全なログ出力
   const truncatedBody = {
     model: requestBody.model,
     tools_count: requestBody.tools?.length || 0,
     messages_count: requestBody.messages?.length || 0
   };
   console.log('リクエスト概要:', safeStringify(truncatedBody, "{}"));
   ```

5. **開発モードの詳細ログ**:
   ```typescript
   // 開発モードでのみ詳細ログを出力
   if (process.env.NODE_ENV === 'development') {
     // 詳細情報のログ出力
   }
   ```

これらのベストプラクティスにより、デバッグ中に`[object Object]`が表示される問題を防止し、より有用な情報がログに出力されるようになります。

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
- ツール呼び出し制御の設定管理
- 各モジュール間の通信を調整
- 全体的なフローの制御と実行順序の管理
- トップレベルのAPI実装（_streamChat、_streamComplete）
- ストリーミング処理のライフサイクル管理
- **新機能**: API要求の統一管理のための`getApiEndpoint()`メソッド

**2. `config.ts` - 設定管理**
- API設定の読み込みと検証
- URLの正規化
- タイムアウト設定の処理
- 設定の検証ロジック
- 設定ファイルからの値の読み取り
- 環境設定の一元管理
- APIエンドポイントの正規化と検証
- タイムアウトコントローラの設定と管理
- **新機能**: 完全なAPIエンドポイントURLを提供する`getFullApiEndpoint()`メソッド

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
- **新機能**: Claude 3.7モデル自動検出と専用設定
- **改善**: 拡張されたエラーロギングとデバッグ機能
- **更新**: 共通ユーティリティを活用した型安全なコンテンツ処理
- **追加**: `thinking`プロパティの適切な型定義と処理

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
- **新機能**: `processSystemMessage()`メソッドによるシステムメッセージの専用処理

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
- **追加**: `DatabricksCompletionOptions`インターフェースにおける`thinking`プロパティの明示的な型定義

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
    
    // 統一された方法でAPIエンドポイントを取得
    const apiEndpoint = this.getApiEndpoint();
    
    // デバッグログ - 常にリクエスト詳細を記録
    console.log(`Databricksリクエスト: エンドポイント=${apiEndpoint}`);
    
    // ツール関連のログを追加（argsから直接取得して型安全に）
    if (args.tools && Array.isArray(args.tools)) {
      console.log(`Databricksリクエスト: ツール数=${args.tools.length}`);
      try {
        // ツール名を安全に取得して結合
        const toolNames = args.tools
          .map((t: any) => t?.function?.name || 'unnamed')
          .join(', ');
        console.log(`Databricksリクエスト: ツール名=${toolNames}`);
        
        // 開発モードでより詳細なツール情報をログ出力
        if (process.env.NODE_ENV === 'development') {
          args.tools.forEach((tool: any, index: number) => {
            const toolInfo = {
              name: tool?.function?.name || 'unnamed',
              description: tool?.function?.description ? 
                `${tool.function.description.substring(0, 30)}...` : 'no description'
            };
            console.log(`ツール[${index}]: ${JSON.stringify(toolInfo)}`);
          });
        }
      } catch (e) {
        console.log(`ツール情報のログ出力中にエラー: ${getErrorMessage(e)}`);
      }
    }
    
    // タイムアウトコントローラ設定を設定管理モジュールに委譲
    const { timeoutController, timeoutId, combinedSignal } = 
      DatabricksConfig.setupTimeoutController(signal, options);
    
    // APIリクエスト実行
    const response = await this.fetch(apiEndpoint, {
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

## 2025年5月の主要な改善点

### 1. parallel_tool_callsパラメータの完全除去と型安全性の向上

Databricksエンドポイントが`parallel_tool_calls`パラメータをサポートしていないため、このパラメータを型レベルから完全に除外し、コードの安全性を向上させました：

1. **型定義からの除外**: `DatabricksLLMOptions`および`DatabricksCompletionOptions`インターフェースからパラメータを削除し、明示的なコメントを追加
2. **パラメータ設定停止**: `DatabricksHelpers.convertArgs()`メソッドでこのパラメータを設定しないよう修正
3. **安全なアクセス**: `requestBody`オブジェクトの代わりに`args`オブジェクトから直接ツール情報を取得するよう修正し、型エラーを回避
4. **デフォルトオプションの更新**: `Databricks.ts`のデフォルトオプションからも関連プロパティを削除
5. **詳細なログ出力の追加**: ツール関連のログ出力を強化し、問題の早期発見を可能に
6. **リクエスト前の検証強化**: マップの型階層全体で整合性を確保

これらの改修により、Databricksのエンドポイントに対するツール呼び出し機能が安定して動作するようになりました。

### 2. API URL問題の根本的解決

Databricks統合の最も重要な改善点は、APIリクエストが常に正しいDatabricksエンドポイントに送信されるよう保証する仕組みを実装したことです。以前は一部のコードパスでAnthropicのAPIエンドポイント（`https://api.anthropic.com/v1/messages`）に誤ってリクエストが送信されていました。

この問題を根本的に解決するため、以下の改善を行いました：

1. **統一されたエンドポイント管理**: `Databricks.ts`クラスに`getApiEndpoint()`メソッドを追加して、すべてのAPIリクエストが同一の仕組みを通してエンドポイントを取得するようにしました。

```typescript
// 統一されたAPIエンドポイント取得メソッド
private getApiEndpoint(): string {
  if (!this.apiBase) {
    throw new Error("API base URL is not defined");
  }
  
  // 設定管理モジュールを使用して常に正規化されたURLを取得
  const endpoint = DatabricksConfig.getFullApiEndpoint(this.apiBase);
  
  if (!endpoint) {
    throw new Error("Failed to get valid Databricks API endpoint");
  }
  
  return endpoint;
}
```

2. **拡張ログ出力**: すべてのAPIリクエスト前に詳細なログを出力することで、URLの取得と正規化のプロセスを追跡できるようにしました。

```typescript
// APIエンドポイントへのリクエスト前のログ出力
console.log(`Databricksリクエスト: エンドポイント=${apiEndpoint}`);
console.log(`Databricksリクエスト: モデル=${options.model || this.model}`);
console.log(`Databricksリクエスト: メッセージ数=${formattedMessages.length}`);
```

3. **URL正規化機能の拡張**: `config.ts`に`getFullApiEndpoint()`メソッドを追加し、URL正規化を担当するロジックを集中化しました。

```typescript
// 完全なAPIエンドポイントURLを取得する（正規化済み）
static getFullApiEndpoint(apiBase: string | undefined): string {
  if (!apiBase) {
    console.warn('APIベースURLが提供されていません');
    return '';
  }
  
  // 常に正規化処理を行い、一貫性を確保
  const normalizedUrl = this.normalizeApiUrl(apiBase);
  
  // デバッグのために完全なURLをログ出力
  console.log(`Databricksエンドポイント: ${normalizedUrl}`);
  
  return normalizedUrl;
}
```

### 3. メッセージコンテンツ型の厳密な型安全性

`MessageContent`型が`string`または`MessagePart[]`のユニオン型であることに起因する型エラーを解消するため、`extractContentAsString`共通ユーティリティ関数を徹底的に活用するようにしました。これにより型安全性が向上し、コードの堅牢性が高まりました。

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

### 4. `thinking`プロパティの型定義と処理の改善

Claude 3.7 Sonnetで重要な`thinking`プロパティの型定義が欠けていたことによるコンパイルエラーを解決しました。以下の改善を行いました：

1. **型定義の追加**: `DatabricksCompletionOptions`インターフェースに`thinking`プロパティの明示的な型定義を追加しました：

```typescript
export interface DatabricksCompletionOptions extends CompletionOptions {
  /**
   * リクエストのタイムアウト (秒)
   * デフォルトは300秒 (5分)
   */
  requestTimeout?: number;
  
  /**
   * Claude 3.7モデル用の思考モード設定
   * 思考プロセスを有効にし、そのための設定を行う
   */
  thinking?: {
    /**
     * 思考モードのタイプ - 現在は"enabled"のみサポート
     */
    type: string;
    
    /**
     * 思考プロセス用のトークン予算
     * デフォルトはmax_tokensの半分（最大64000）
     */
    budget_tokens?: number;
  };
}
```

2. **コア型拡張の追加**: 全体の型一貫性を保つため、`databricks-extensions.d.ts`ファイルも更新しました：

```typescript
// Add extension for CompletionOptions
interface CompletionOptions {
  /**
   * Thinking mode configuration for Claude 3.7 models
   * Enables and configures thinking process
   */
  thinking?: {
    /**
     * Thinking mode type - currently only "enabled" is supported
     */
    type: string;
    
    /**
     * Token budget for thinking process
     * Default is half of max_tokens (up to 64000)
     */
    budget_tokens?: number;
  };
}
```

3. **ヘルパー関数の改善**: `convertArgs`メソッドでの`thinking`プロパティの処理を型安全に改善しました：

```typescript
// Add thinking mode for Claude 3.7 models
if (isClaude37) {
  // Safely extract thinking properties with proper fallback values
  const thinkingType = options.thinking?.type || DEFAULT_THINKING_TYPE;
  const thinkingBudgetTokens = options.thinking?.budget_tokens || thinkingBudget;
  
  finalOptions.thinking = {
    type: thinkingType,
    budget_tokens: thinkingBudgetTokens,
  };
  
  // Log thinking configuration
  console.log(`Setting up Claude 3.7 thinking mode: type=${thinkingType}, budget=${thinkingBudgetTokens}`);
}
```

これらの変更により、TypeScriptコンパイルエラーが解消され、`thinking`プロパティの処理が型安全になりました。

### 5. システムメッセージ処理の専用機能

システムメッセージを適切にDatabricksエンドポイントに渡せるよう、専用の処理メソッドを実装しました。これによりClaude 3.7 Sonnetのシステムプロンプト機能を最大限に活用できるようになりました。

```typescript
// MessageProcessor.tsにシステムメッセージ専用処理を追加
static processSystemMessage(messages: ChatMessage[]): string {
  // システムメッセージを抽出
  const systemMessage = messages.find(m => m.role === "system");
  if (!systemMessage) {
    // 日本語環境チェック
    if (this.containsJapaneseContent(messages)) {
      return "水平思考で考えて！\nステップバイステップで考えて！\n日本語で回答してください。";
    }
    return "";
  }
  
  // システムメッセージのコンテンツを抽出
  let systemContent = this.extractSystemMessageContent(systemMessage);
  
  // 水平思考とステップバイステップの指示を追加（Claude 3.7 Sonnetに適した指示）
  if (!systemContent.includes("水平思考") && !systemContent.includes("ステップバイステップ")) {
    systemContent += "\n\n水平思考で考えて！\nステップバイステップで考えて！";
  }
  
  // 日本語処理に関する指示があるかチェック
  if (this.containsJapaneseContent(messages) && !systemContent.includes("日本語")) {
    systemContent += "\n\n日本語で回答してください。";
  }
  
  return systemContent;
}
```

### 6. JSON処理の強化とツール呼び出し機能の改善

ストリーミング応答内のJSONフラグメントを処理する方法を改善し、`processJsonDelta`共通ユーティリティ関数を使用して部分的なJSONの累積と解析を正しく処理できるようにしました。また、ツール呼び出し引数の修復にも`repairToolArguments`共通ユーティリティを活用しています。

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

### 7. Claude 3.7モデル自動検出と専用設定

モデル名からClaude 3.7を自動検出し、適切な設定を適用する機能を追加しました。特に思考モード（thinking）の設定が確実に行われるようになりました。

```typescript
// Claude 3.7モデルを識別
const isClaude37 = modelName.includes("claude-3-7");

// Claude 3.7モデル用に思考モードを追加
if (isClaude37) {
  finalOptions.thinking = {
    type: "enabled",
    budget_tokens: options.thinking?.budget_tokens || thinkingBudget,
  };
}

// Databricksモデルタイプに応じた特別な処理
if (isClaude37) {
  console.log("Claude 3.7 Sonnetモデルを検出しました - 特殊設定を適用します");
  // Claude 3.7モデルは思考処理で特に温度設定1.0を要求する
  finalOptions.temperature = 1;
}
```

### 8. 共通ユーティリティの活用強化

コード全体で共通ユーティリティの使用を拡充し、`getErrorMessage`、`extractContentAsString`、`safeStringify`などの関数を適切に活用することで、コードの品質と保守性を向上させました。

```typescript
// エラーメッセージの取得
import { getErrorMessage } from "../../utils/errors.js";
console.error("Error processing non-streaming response:", getErrorMessage(error));

// メッセージコンテンツの安全な抽出
import { extractContentAsString } from "../../utils/messageUtils.js";
const currentContent = extractContentAsString(currentMessage.content);

// JSONの安全な文字列化
import { safeStringify } from "../../utils/json.js";
console.log('Request body (truncated):', safeStringify(truncatedBody, "{}"));
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

重要: APIベースURLは常に`/invocations`で終わる必要があります。URLが正しく設定されているかどうかは、コンソールログを確認して`DatabricksConfig.normalizeApiUrl`と`DatabricksConfig.getFullApiEndpoint`によるURL変換過程を追跡できます。

## Claude 3.7 Sonnetの思考モード設定

Claude 3.7 Sonnetモデルは思考モード（thinking mode）をサポートしており、より詳細で段階的な推論を行うことができます。このモードを有効にするには、以下のように設定します：

```yaml
models:
  - name: "databricks-claude"
    provider: "databricks"
    apiBase: "https://your-databricks-endpoint.cloud.databricks.com/serving-endpoints/claude-3-7-sonnet/invocations"
    apiKey: "dapi_your_api_key_here"
    model: "databricks-claude-3-7-sonnet"
    completionOptions:
      thinking:
        type: "enabled"
        budget_tokens: 50000  # オプション: トークン予算を指定（デフォルトはmax_tokensの半分）
```

思考モードは自動的に検出され、Claude 3.7モデルに対しては常に有効化されます。モデル名に「claude-3-7」が含まれている場合、以下の特別な処理が行われます：

1. **思考モードの有効化**: `thinking: { type: "enabled", budget_tokens: <budget> }`がリクエストに追加されます
2. **温度の固定**: 思考モードの最適な動作のため、温度パラメータが1.0に固定されます
3. **トークン予算の自動計算**: 明示的に指定されない場合、`max_tokens`の半分（最大64000）が思考プロセスのトークン予算として割り当てられます

この設定により、Claude 3.7 Sonnetがより詳細な思考過程を表示し、より質の高い応答を生成できるようになります。

## トラブルシューティング

### parallel_tool_callsエラーが発生した場合

エラーログに以下のようなエラーメッセージが表示される場合：

```
Property 'tools' does not exist on type '{ messages: any[]; system: string; }'
```

以下のことを確認してください：

1. 最新バージョンのコードを使用しているか（2025年5月以降の更新が反映されているか）
2. `Databricks.ts`ファイルで`requestBody.tools`の代わりに`args.tools`を使用しているか
3. `DatabricksHelpers.convertArgs()`メソッドで`parallel_tool_calls`パラメータが設定されていないか

これらの問題が解決しない場合は、詳細なデバッグログを有効にして問題を特定してください：

```typescript
// デバッグログを有効にする（config.yamlに追加）
debug: true
```

### `[object Object]`が表示される場合

コンソールログに`[object Object]`が表示される場合は、オブジェクトを適切に文字列化する処理が必要です：

1. `safeStringify`関数を使用してオブジェクトをログ出力
2. オブジェクトのプロパティに安全にアクセスするためのチェックを追加
3. ログ出力周りにtry-catch処理を追加

詳細は「デバッグとロギングのベストプラクティス」セクションを参照してください。

### `combinedSignal`の順序エラーが発生した場合

以下のようなエラーメッセージが表示される場合：

```
Block-scoped variable 'combinedSignal' used before its declaration
```

`processStreamingRequest()`メソッド内で、`combinedSignal`変数の宣言と使用の順序が正しいことを確認してください。常に`DatabricksConfig.setupTimeoutController()`を呼び出した後に変数を使用してください。

## オーケストレーターパターンの利点

Databricksの実装では、オーケストレーターパターンを採用することで以下の利点を実現しています：

1. **責任の明確な分離**: 各モジュールが特定の責任領域に集中し、コードの理解と保守が容易になる
2. **再利用性の向上**: 共通の機能を共有し、モジュール間で重複コードを減らす
3. **テスト容易性**: 各モジュールを独立してテスト可能
4. **拡張性の向上**: 新機能や変更が必要な場合、影響するモジュールのみを修正すれば良い
5. **エラー処理の一元化**: 標準化されたエラー処理アプローチを適用
6. **型安全性の強化**: 明確なインターフェース定義による型チェックの強化
7. **依存関係の明示**: モジュール間の関係が明示的になり、変更の影響範囲が把握しやすい
8. **機能の組み合わせ容易性**: 異なるモジュールの機能を組み合わせて新機能を容易に構築可能
9. **ドキュメント性の向上**: コード構造自体がドキュメントとして機能し、システムの理解を助ける
10. **並行開発の促進**: 複数の開発者が異なるモジュールを同時に開発可能

このアプローチはDatabricksの実装だけでなく、他の複雑なLLMプロバイダー統合にも適用でき、コアLLMフレームワーク全体の設計原則として採用されています。

## 今後の改善計画

1. **パフォーマンス最適化**: リクエスト処理とレスポンスパースのパフォーマンスをさらに最適化
2. **バッファ管理の改善**: より効率的なJSONバッファ管理による大規模ストリーミングの安定性向上
3. **コンテキスト管理の強化**: トークン制限を考慮したコンテキスト管理の改善
4. **型安全性の向上**: より厳密な型定義とチェックによる安全性の向上
5. **並列処理の改善**: 複数のリクエスト間でのリソース共有の最適化
6. **エラーハンドリングの拡充**: より詳細なエラー分析と自動回復機能の強化
7. **ドキュメント整備**: ユーザー向けドキュメントとコード内コメントの充実
8. **新機能のサポート**: 将来のClaude 3.7/3.8拡張機能への対応
9. **パフォーマンスメトリクスの収集**: 詳細なパフォーマンス測定と最適化のためのメトリクス収集
10. **自動テスト拡充**: より包括的な自動テストによる品質保証

このモジュール化されたアーキテクチャにより、拡張機能の安定性と保守性が大幅に向上し、将来のAPI変更にも容易に対応できるようになりました。2025年5月の改善で、特にURLルーティングの問題が解消され、型安全性と共通ユーティリティの活用が大きく進みました。
