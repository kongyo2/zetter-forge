import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { DEFAULT_EDITOR_SETTINGS, normalizeEditorSettings } from "@shared/editorSettings";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type AppSettings, readSettings, writeSettings } from "../src/main/settings";

let dir: string;
let file: string;
const defaults: AppSettings = { libraryRoot: "/default", editor: DEFAULT_EDITOR_SETTINGS };

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "zetter-forge-settings-"));
  file = path.join(dir, "settings.json");
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("入力欄の設定", () => {
  it("足りない・おかしい項目は既定値にする", () => {
    expect(normalizeEditorSettings(undefined)).toEqual(DEFAULT_EDITOR_SETTINGS);
    expect(normalizeEditorSettings({ syntax: "auto", pomlAssist: "yes" })).toEqual(
      DEFAULT_EDITOR_SETTINGS,
    );
    expect(normalizeEditorSettings({ syntax: "poml", mermaidPreview: false })).toEqual({
      ...DEFAULT_EDITOR_SETTINGS,
      syntax: "poml",
      mermaidPreview: false,
    });
  });

  it("前の版の設定ファイル（保存先だけ）は、入力欄の設定を既定値で補う", async () => {
    await fs.writeFile(file, JSON.stringify({ libraryRoot: "/casts" }));
    expect(await readSettings(file, defaults)).toEqual({
      libraryRoot: "/casts",
      editor: DEFAULT_EDITOR_SETTINGS,
    });
  });

  it("書いた設定を読み戻せる", async () => {
    const settings: AppSettings = {
      libraryRoot: "/casts",
      editor: { syntax: "markdown", pomlAssist: false, mermaidAssist: true, mermaidPreview: false },
    };
    await writeSettings(file, settings);
    expect(await readSettings(file, defaults)).toEqual(settings);
  });

  it("壊れた設定ファイルは既定値で始める", async () => {
    await fs.writeFile(file, "{");
    expect(await readSettings(file, defaults)).toEqual(defaults);
  });
});
