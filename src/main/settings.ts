import { promises as fs } from "node:fs";
import path from "node:path";

import { isRecord, stringOr } from "@shared/json";
import { type McpSettings, normalizeMcpSettings } from "@shared/mcp";

import { readJson, writeJson } from "./files";

export interface AppSettings {
  libraryRoot: string;
  mcp: McpSettings;
}

export async function readSettings(file: string, defaults: AppSettings): Promise<AppSettings> {
  try {
    const raw = await readJson(file);
    if (isRecord(raw)) {
      return {
        libraryRoot: stringOr(raw.libraryRoot) || defaults.libraryRoot,
        mcp: "mcp" in raw ? normalizeMcpSettings(raw.mcp) : defaults.mcp,
      };
    }
  } catch {}
  return defaults;
}

export async function writeSettings(file: string, settings: AppSettings): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await writeJson(file, settings);
}
