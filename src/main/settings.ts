import { promises as fs } from "node:fs";
import path from "node:path";

import { type EditorSettings, normalizeEditorSettings } from "@shared/editorSettings";

export interface AppSettings {
  libraryRoot: string;
  editor: EditorSettings;
}

export async function readSettings(file: string, defaults: AppSettings): Promise<AppSettings> {
  try {
    const raw: unknown = JSON.parse(await fs.readFile(file, "utf8"));
    if (typeof raw === "object" && raw !== null) {
      const libraryRoot =
        "libraryRoot" in raw && typeof raw.libraryRoot === "string" && raw.libraryRoot
          ? raw.libraryRoot
          : defaults.libraryRoot;
      const editor = "editor" in raw ? normalizeEditorSettings(raw.editor) : defaults.editor;
      return { libraryRoot, editor };
    }
  } catch {
    // 初回起動や壊れた設定ファイルは既定値で始める
  }
  return defaults;
}

export async function writeSettings(file: string, settings: AppSettings): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}
