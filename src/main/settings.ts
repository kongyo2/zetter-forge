import { promises as fs } from "node:fs";
import path from "node:path";

import { isRecord } from "@shared/json";
import { type McpSettings, normalizeMcpSettings } from "@shared/mcp";

export interface AppSettings {
  libraryRoot: string;
  /** AI のエージェントから操作するための MCP サーバー */
  mcp: McpSettings;
}

export async function readSettings(file: string, defaults: AppSettings): Promise<AppSettings> {
  try {
    const raw: unknown = JSON.parse(await fs.readFile(file, "utf8"));
    if (isRecord(raw)) {
      return {
        libraryRoot:
          typeof raw.libraryRoot === "string" && raw.libraryRoot
            ? raw.libraryRoot
            : defaults.libraryRoot,
        mcp: "mcp" in raw ? normalizeMcpSettings(raw.mcp) : defaults.mcp,
      };
    }
  } catch {
    // 初回起動や壊れた設定ファイルは既定値で始める
  }
  return defaults;
}

export async function writeSettings(file: string, settings: AppSettings): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  // 書いている途中で落ちても設定が壊れないよう、別のファイルに書いてから置き換える
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  await fs.rename(temp, file);
}
