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
- 明示的に`DatabricksLLMOptions`や`DatabricksCompletionOptions`型など主要な型をエクスポート
- 型拡張定義をインポート
- 型定義の可視性と参照性を向上

**2. `types.ts` - 主要な型定義**
- Databricks固有のインターフェース定義
- `DatabricksLLMOptions`型の定義 - LLMOptionsを拡張し並列ツール呼び出し制御を追加
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

### 1. Databricks固有のLLMOptions拡張型

```typescript
/**
 * Databricks固有のLLMOptions拡張型
 * コアのLLMOptions型を拡張し、Databricks特有の機能をサポート
 */
export interface DatabricksLLMOptions extends LLMOptions {
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

### 2. ベース型定義

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

### 3. Databricks固有の完了オプション型

```typescript
/**
 * Databricks固有の完了オプション
 * 基本のCompletionOptionsを拡張し、Databricks特有のオプションを追加
 */
export interface DatabricksCompletionOptions extends CompletionOptions {
  /**
   * リクエストのタイムアウト (秒)
   * デフォルトは300秒 (5分)
   */
  requestTimeout?: number;
  
  // 注意: parallel_tool_callsパラメータはDatabricksエンドポイントでサポートされていないため、
  // 型定義からも除外し、エラーを防止
}
```

### 4. Databricks固有のメッセージ型

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

### 5. ストリーミング関連の型定義

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

## 並列ツール呼び出し処理に関する注意点

Databricks実装では、`parallelToolCalls`（LLMOptions）と`parallel_tool_calls`（APIリクエストパラメータ）の区別が重要です：

1. **LLMOptions.parallelToolCalls**: この設定は内部フラグとして機能し、ツール呼び出しの処理方法を制御します。Databricksクラスでは、これがデフォルトで`false`に設定されています。

2. **API request parallel_tool_calls**: これはDatabricksエンドポイントがサポートしていないパラメータです。このため、リクエスト送信前に削除する必要があります。

この設計によって、クライアントコードは標準の`parallelToolCalls`設定を使用できますが、APIリクエスト時には互換性を確保できます。

## 最近の改善点

### 1. DatabricksLLMOptions型の導入（2025年5月）

- **専用LLMOptions拡張型の導入**: 標準的な`LLMOptions`を拡張し、Databricks固有の機能を型安全に実装
- **明示的なインターフェース定義**: `parallelToolCalls`などのプロパティに対して明示的な型と説明を提供
- **型キャストの排除**: `as any`などの型キャストを使わずに適切な型を使用できるよう改善
- **コンパイルエラーの解消**: TypeScriptコンパイル時の「Object literal may only specify known properties」エラーを解消

### 2. 型定義の整理と明確化

- **重複定義の統合**: 分散していた型定義を統合
- **モジュールインターフェース型の追加**: 各モジュールの責任を明確にするインターフェース型を追加
- **JSDocドキュメントの強化**: すべての型定義に詳細なJSDocコメントを追加
- **並列ツール呼び出し処理の明確化**: `parallelToolCalls`パラメータの扱いを明確化
- **型安全性の向上**: 状態管理やエラー処理の型安全性を向上
- **ストリーミング処理の型強化**: 処理結果や状態管理の型定義を強化

## ベストプラクティス

Databricks型定義を使用する際は、以下のベストプラクティスに従ってください：

### 1. 型のインポート方法

```typescript
// 推奨: types/index.tsからインポート
import { 
  DatabricksLLMOptions,
  DatabricksCompletionOptions, 
  ToolCall 
} from "./Databricks/types/index.js";
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
}
```

### 3. 並列ツール呼び出しの設定

```typescript
// DatabricksLLMOptions型を使用した明示的な型指定
static defaultOptions: Partial<DatabricksLLMOptions> = {
  model: "databricks-claude-3-7-sonnet",
  contextLength: 200_000,
  completionOptions: {
    model: "databricks-claude-3-7-sonnet",
    maxTokens: 128000,
    temperature: 1,
  },
  capabilities: {
    tools: true
  },
  // Databricksエンドポイントは並列ツール呼び出しをサポートしていないため無効化
  parallelToolCalls: false
};

// APIリクエスト送信前に並列ツール呼び出しパラメータを削除
if ((requestBody as any).parallel_tool_calls !== undefined) {
  console.warn('parallel_tool_callsパラメータがリクエストに含まれています。Databricksはこのパラメータをサポートしていません。');
  // parallel_tool_callsパラメータを安全に除外
  delete (requestBody as any).parallel_tool_calls;
}
```

これらの型定義は、オーケストレーターパターンに基づく責任分離を型システムレベルでサポートし、Databricksインテグレーションの堅牢性と保守性を向上させます。
