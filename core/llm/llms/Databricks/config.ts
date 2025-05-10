import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { CompletionOptions } from "../../../index.js";

// 定数
const DEFAULT_TIMEOUT_MS = 300000; // 5分

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
    const configPaths = [
      path.join(process.env.USERPROFILE || "", ".continue", "config.yaml"),
      path.join(process.cwd(), "extensions", ".continue-debug", "config.yaml")
    ];

    for (const configPath of configPaths) {
      try {
        if (fs.existsSync(configPath)) {
          const configContent = fs.readFileSync(configPath, "utf8");
          const config = yaml.load(configContent) as any;

          // Databricksモデル設定を探す
          if (config && config.models) {
            for (const model of config.models) {
              if (model.provider === "databricks" && model.apiBase) {
                console.log(`Found Databricks apiBase in ${configPath}`);
                return model.apiBase;
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error reading config from ${configPath}:`, error);
      }
    }

    // デフォルト値
    console.warn("No Databricks apiBase found in config files, using default");
    return "dummy-url";
  }

  /**
   * 設定ファイルからapiKeyを読み取る
   * @returns APIキーの文字列
   */
  static getApiKeyFromConfig(): string {
    const configPaths = [
      path.join(process.env.USERPROFILE || "", ".continue", "config.yaml"),
      path.join(process.cwd(), "extensions", ".continue-debug", "config.yaml")
    ];

    for (const configPath of configPaths) {
      try {
        if (fs.existsSync(configPath)) {
          const configContent = fs.readFileSync(configPath, "utf8");
          const config = yaml.load(configContent) as any;

          // Databricksモデル設定を探す
          if (config && config.models) {
            for (const model of config.models) {
              if (model.provider === "databricks" && model.apiKey) {
                console.log(`Found Databricks apiKey in ${configPath}`);
                return model.apiKey;
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error reading config from ${configPath}:`, error);
      }
    }

    // デフォルト値
    console.warn("No Databricks apiKey found in config files, using default");
    return "dapi-dummy-key";
  }

  /**
   * API URLを標準化する
   * @param apiBaseUrl 元のAPI URL
   * @returns 標準化されたAPI URL
   */
  static normalizeApiUrl(apiBaseUrl: string): string {
    // URLが/invocations/で終わる場合、末尾のスラッシュを削除
    if (apiBaseUrl.endsWith('/invocations/')) {
      apiBaseUrl = apiBaseUrl.slice(0, -1);
      console.log(`APIベースURL修正: 末尾のスラッシュを削除しました - ${apiBaseUrl}`);
    }
    
    return apiBaseUrl;
  }

  /**
   * API設定が有効かどうかを検証
   * @param apiKey APIキー
   * @param apiBase APIベースURL
   * @throws エラー - API設定が無効な場合
   */
  static validateApiConfig(apiKey: string | undefined, apiBase: string | undefined): void {
    if (!apiKey || apiKey === "") {
      throw new Error("Request not sent. Databricks API key is not set in your config.");
    }

    if (!apiBase) {
      throw new Error("Request not sent. Could not find Databricks API endpoint URL in your config.");
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
    options: CompletionOptions
  ): {
    timeoutController: AbortController;
    timeoutId: NodeJS.Timeout;
    combinedSignal: AbortSignal;
  } {
    const timeoutController = new AbortController();
    const timeoutMs = (options as any).requestTimeout 
      ? (options as any).requestTimeout * 1000 
      : DEFAULT_TIMEOUT_MS;
    
    const timeoutId = setTimeout(() => {
      console.log(`リクエストタイムアウト（${timeoutMs}ms）に達したため中断します`);
      timeoutController.abort('Request timeout');
    }, timeoutMs);
    
    // ユーザー提供のシグナルと内部タイムアウトシグナルを結合
    const combinedSignal = AbortSignal.any([signal, timeoutController.signal]);
    
    return { timeoutController, timeoutId, combinedSignal };
  }
}
