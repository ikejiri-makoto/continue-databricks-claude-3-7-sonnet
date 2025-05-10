import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";

/**
 * Databricks API設定を読み込むクラス
 * 設定ファイルからAPIのベースURLとAPIキーを読み込む機能を提供
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
}
