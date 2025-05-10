import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { CompletionOptions } from "../../../index.js";
import { getErrorMessage } from "../../utils/errors.js";
import { DatabricksCompletionOptions } from "./types/types.js";

// 拡張した型定義
interface DatabricksModelConfig {
  provider: string;
  apiBase?: string;
  apiKey?: string;
  model?: string;
  [key: string]: any;
}

interface ConfigFile {
  models?: DatabricksModelConfig[];
  [key: string]: any;
}

// 定数
const DEFAULT_TIMEOUT_MS = 300000; // 5分
const CONFIG_FILE_NAME = "config.yaml";
const DEFAULT_API_BASE = "dummy-url";
const DEFAULT_API_KEY = "dapi-dummy-key";

/**
 * Databricks API設定を管理するクラス
 * 設定ファイルからの読み込み、検証、タイムアウト処理を担当
 */
export class DatabricksConfig {
  /**
   * 設定ファイルからapiBaseを読み取る
   * @returns API基本URLの文字列
   */
  static getApiBaseFromConfig(): string {
    const configPaths = this.getConfigPaths();
    return this.findConfigValue(configPaths, "apiBase", DEFAULT_API_BASE, "Databricks apiBase");
  }

  /**
   * 設定ファイルからapiKeyを読み取る
   * @returns APIキーの文字列
   */
  static getApiKeyFromConfig(): string {
    const configPaths = this.getConfigPaths();
    return this.findConfigValue(configPaths, "apiKey", DEFAULT_API_KEY, "Databricks apiKey");
  }

  /**
   * 設定ファイルの可能なパスを取得する
   * @returns 設定ファイルへのパスの配列
   */
  private static getConfigPaths(): string[] {
    const userProfile = process.env.USERPROFILE || "";
    return [
      path.join(userProfile, ".continue", CONFIG_FILE_NAME),
      path.join(process.cwd(), "extensions", ".continue-debug", CONFIG_FILE_NAME)
    ];
  }

  /**
   * 設定ファイルから特定の値を検索する
   * @param configPaths 設定ファイルパスの配列
   * @param valueName 検索する値の名前
   * @param defaultValue デフォルト値
   * @param logLabel ログに表示するラベル
   * @returns 見つかった値またはデフォルト値
   */
  private static findConfigValue(
    configPaths: string[], 
    valueName: string, 
    defaultValue: string,
    logLabel: string
  ): string {
    for (const configPath of configPaths) {
      try {
        if (fs.existsSync(configPath)) {
          const configContent = fs.readFileSync(configPath, "utf8");
          const config = yaml.load(configContent) as ConfigFile;

          // Databricksモデル設定を探す
          if (config?.models) {
            const databricksModel = config.models.find(
              model => model.provider === "databricks" && model[valueName]
            );
            
            if (databricksModel && databricksModel[valueName]) {
              console.log(`Found ${logLabel} in ${configPath}`);
              return databricksModel[valueName] as string;
            }
          }
        }
      } catch (error) {
        console.error(`Error reading config from ${configPath}: ${getErrorMessage(error)}`);
      }
    }

    // デフォルト値
    console.warn(`No ${logLabel} found in config files, using default`);
    return defaultValue;
  }

  /**
   * API URLを標準化する
   * URLが無効な場合に対するバリデーションを強化
   * 
   * @param apiBaseUrl 元のAPI URL
   * @returns 標準化されたAPI URL
   */
  static normalizeApiUrl(apiBaseUrl: string): string {
    // apiBaseUrlが空または無効な場合のチェック
    if (!apiBaseUrl || typeof apiBaseUrl !== 'string') {
      console.warn('Invalid API base URL provided');
      return '';
    }
    
    // URLをトリミング
    let normalizedUrl = apiBaseUrl.trim();
    
    // URLが/invocations/で終わる場合、末尾のスラッシュを削除
    if (normalizedUrl.endsWith('/invocations/')) {
      normalizedUrl = normalizedUrl.slice(0, -1);
      console.log(`APIベースURL修正: 末尾のスラッシュを削除しました - ${normalizedUrl}`);
    }
    
    // URLが/invocationsで終わっていない場合、必要に応じて追加
    if (!normalizedUrl.endsWith('/invocations')) {
      // URLが既に/で終わっている場合の処理
      if (normalizedUrl.endsWith('/')) {
        normalizedUrl = `${normalizedUrl}invocations`;
      } else {
        normalizedUrl = `${normalizedUrl}/invocations`;
      }
      console.log(`APIベースURL修正: /invocationsを追加しました - ${normalizedUrl}`);
    }
    
    return normalizedUrl;
  }

  /**
   * API設定が有効かどうかを検証
   * より詳細なエラーメッセージを提供
   * 
   * @param apiKey APIキー
   * @param apiBase APIベースURL
   * @throws エラー - API設定が無効な場合
   */
  static validateApiConfig(apiKey: string | undefined, apiBase: string | undefined): void {
    if (!apiKey || apiKey === "") {
      throw new Error(
        "Request not sent. Databricks API key is not set in your config. " +
        "Please add your Databricks API key to your config.yaml file or set it in the UI settings."
      );
    }

    if (!apiBase) {
      throw new Error(
        "Request not sent. Could not find Databricks API endpoint URL in your config. " +
        "Please add your Databricks endpoint URL to your config.yaml file or set it in the UI settings."
      );
    }
    
    // 基本的なURL形式の検証
    if (!apiBase.includes('databricks') || !apiBase.includes('invocations')) {
      console.warn(
        `Databricks API URL may be incorrect: ${apiBase}. ` +
        `Expected format: https://xxx.cloud.databricks.com/serving-endpoints/xxx/invocations`
      );
    }
  }

  /**
   * タイムアウトコントローラを設定
   * @param signal ユーザー提供のAbortSignal
   * @param options 補完オプション
   * @returns タイムアウトコントローラ、タイムアウトID、結合されたシグナル
   */
  static setupTimeoutController(
    signal: AbortSignal, 
    options: DatabricksCompletionOptions
  ): {
    timeoutController: AbortController;
    timeoutId: NodeJS.Timeout;
    combinedSignal: AbortSignal;
  } {
    const timeoutController = new AbortController();
    const timeoutMs = this.getTimeoutMilliseconds(options);
    
    const timeoutId = setTimeout(() => {
      console.log(`リクエストタイムアウト（${timeoutMs}ms）に達したため中断します`);
      timeoutController.abort('Request timeout');
    }, timeoutMs);
    
    // ユーザー提供のシグナルと内部タイムアウトシグナルを結合
    const combinedSignal = AbortSignal.any([signal, timeoutController.signal]);
    
    return { timeoutController, timeoutId, combinedSignal };
  }

  /**
   * タイムアウト時間をミリ秒単位で取得する
   * オプション型のより安全な処理
   * 
   * @param options 補完オプション
   * @returns タイムアウト時間（ミリ秒）
   */
  private static getTimeoutMilliseconds(options: DatabricksCompletionOptions): number {
    // 型安全なアクセス
    const timeoutSec = options.requestTimeout;
    
    // 有効なタイムアウト値の検証
    if (typeof timeoutSec === 'number' && timeoutSec > 0) {
      return timeoutSec * 1000;
    }
    
    return DEFAULT_TIMEOUT_MS;
  }
}