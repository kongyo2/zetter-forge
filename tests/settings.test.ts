// アプリの設定（settings.json）と、MCP サーバーの設定の画面。
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { DEFAULT_MCP_SETTINGS, isMcpSettings, normalizeMcpSettings, parsePort } from "@shared/mcp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readSettings, writeSettings } from "../src/main/settings";
import type { SettingsDialogVM } from "../src/renderer/src/app/viewModels";
import { type World, createWorld, listing, mcpInfo, started } from "./helpers/world";

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "zetter-forge-settings-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const defaults = { libraryRoot: "/default", mcp: DEFAULT_MCP_SETTINGS };

describe("settings.json", () => {
  it("MCP サーバーの設定を書いて読み戻せる", async () => {
    const file = path.join(dir, "settings.json");
    await writeSettings(file, { libraryRoot: "/library", mcp: { enabled: true, port: 30001 } });
    expect(await readSettings(file, defaults)).toEqual({
      libraryRoot: "/library",
      mcp: { enabled: true, port: 30001 },
    });
  });

  it("前の版の設定（mcp がない）や、使えない値は既定値で補う", async () => {
    const file = path.join(dir, "settings.json");
    await fs.writeFile(file, JSON.stringify({ libraryRoot: "/library" }));
    expect(await readSettings(file, defaults)).toEqual({
      libraryRoot: "/library",
      mcp: DEFAULT_MCP_SETTINGS,
    });
    await fs.writeFile(file, JSON.stringify({ mcp: { enabled: "yes", port: 80 } }));
    expect(await readSettings(file, defaults)).toEqual({
      libraryRoot: "/default",
      mcp: { enabled: false, port: DEFAULT_MCP_SETTINGS.port },
    });
    expect(await readSettings(path.join(dir, "none.json"), defaults)).toEqual(defaults);
  });

  it("ポートは 1024〜65535 の整数だけを受け付ける", () => {
    expect(parsePort("23110")).toBe(23110);
    expect(parsePort(" 1024 ")).toBe(1024);
    expect(parsePort("65535")).toBe(65535);
    for (const text of ["", "1023", "65536", "8080.5", "0x50", "-3000", "３０００", "abc"])
      expect(parsePort(text)).toBeNull();
    expect(isMcpSettings({ enabled: true, port: 3000 })).toBe(true);
    expect(isMcpSettings({ enabled: 1, port: 3000 })).toBe(false);
    expect(isMcpSettings({ enabled: true, port: 3000.5 })).toBe(false);
    expect(normalizeMcpSettings(null)).toEqual(DEFAULT_MCP_SETTINGS);
  });
});

function settingsVm(world: World): SettingsDialogVM {
  const dialog = world.vm().dialog;
  if (dialog?.kind !== "settings") throw new Error("設定の画面が開いていません");
  return dialog;
}

const RUNNING = mcpInfo(
  { enabled: true, port: 23110 },
  { state: "running", url: "http://127.0.0.1:23110/mcp" },
);

describe("設定の画面", () => {
  it("起動したときに MCP サーバーを立てられなかったら知らせ、一覧の下にも出す", async () => {
    const world = createWorld();
    world.dispatch({ type: "app/start" });
    world.take("getLibrary").resolve(listing());
    world
      .take("getMcp")
      .resolve(
        mcpInfo(
          { enabled: true },
          { state: "failed", message: "ポート 23110 はほかのアプリが使っています。" },
        ),
      );
    await world.flush();
    expect(world.vm().toasts.map((toast) => toast.message)).toEqual([
      "MCP サーバーを起動できませんでした: ポート 23110 はほかのアプリが使っています。",
    ]);
    expect(world.vm().sidebar.mcp).toEqual({
      tone: "failed",
      text: "MCP サーバーを起動できませんでした",
    });
  });

  it("使っていなければ一覧の下には出さず、動いていればポートを出す", async () => {
    expect((await started()).vm().sidebar.mcp).toBeNull();
    expect((await started([], RUNNING)).vm().sidebar.mcp).toEqual({
      tone: "running",
      text: "MCP サーバー: ポート 23110 で待ち受け中",
    });
  });

  it("メニューから開き、変えた値は「この設定にする」で保存する。保存したあとも開いたまま様子を見せる", async () => {
    const world = await started();
    world.dispatch({ type: "menu", command: "settings" });
    // 開くたびに、いまの様子を読み直す
    world.take("getMcp").resolve(mcpInfo());
    await world.flush();
    expect(settingsVm(world)).toMatchObject({
      enabled: { checked: false },
      port: { value: "23110", invalid: false },
      status: { tone: "off", text: "止まっています", url: null },
      canApply: false,
      closeLabel: "閉じる",
    });
    world.dispatch({ type: "settings/change", patch: { enabled: true } });
    world.dispatch({ type: "settings/change", patch: { port: "30001" } });
    expect(settingsVm(world)).toMatchObject({ canApply: true, closeLabel: "キャンセル" });
    world.dispatch({ type: "settings/save" });
    expect(settingsVm(world)).toMatchObject({
      enabled: { disabled: true },
      status: { tone: "loading" },
      canApply: false,
    });
    const save = world.take("saveMcp");
    expect(save.args[0]).toEqual({ enabled: true, port: 30001 });
    // 保存中は閉じない
    world.dispatch({ type: "dialog/cancel" });
    save.resolve(
      mcpInfo(
        { enabled: true, port: 30001 },
        { state: "running", url: "http://127.0.0.1:30001/mcp" },
      ),
    );
    await world.flush();
    expect(settingsVm(world)).toMatchObject({
      enabled: { checked: true, disabled: false },
      port: { value: "30001" },
      status: { tone: "running", text: "動いています", url: "http://127.0.0.1:30001/mcp" },
      canApply: false,
    });
    expect(world.vm().toasts.map((toast) => toast.message)).toEqual(["設定を保存しました。"]);
    expect(world.vm().sidebar.mcp?.text).toBe("MCP サーバー: ポート 30001 で待ち受け中");
    world.dispatch({ type: "dialog/cancel" });
    expect(world.vm().dialog).toBeNull();
  });

  it("使えないポートは保存せずに知らせ、立てられなかったら様子にわけを出す", async () => {
    const world = await started();
    world.dispatch({ type: "settings/open" });
    world.take("getMcp").resolve(mcpInfo());
    await world.flush();
    world.dispatch({ type: "settings/change", patch: { enabled: true, port: "80" } });
    expect(settingsVm(world).port.invalid).toBe(true);
    world.dispatch({ type: "settings/save" });
    expect(world.pending()).toEqual([]);
    expect(settingsVm(world).error).toBe("ポートは 1024〜65535 の数にしてください。");
    world.dispatch({ type: "settings/change", patch: { port: "3000" } });
    world.dispatch({ type: "settings/save" });
    world
      .take("saveMcp")
      .resolve(
        mcpInfo(
          { enabled: true, port: 3000 },
          { state: "failed", message: "ポート 3000 はほかのアプリが使っています。" },
        ),
      );
    await world.flush();
    expect(settingsVm(world)).toMatchObject({
      error: null,
      status: {
        tone: "failed",
        text: "起動できませんでした: ポート 3000 はほかのアプリが使っています。",
      },
    });
    expect(world.vm().toasts.at(-1)).toMatchObject({
      tone: "error",
      message: "設定を保存しました。MCP サーバーは起動できませんでした。",
    });
  });

  it("保存できなければ、画面の中でわけを見せる", async () => {
    const world = await started();
    world.dispatch({ type: "settings/open" });
    world.take("getMcp").resolve(mcpInfo());
    await world.flush();
    world.dispatch({ type: "settings/change", patch: { enabled: true } });
    world.dispatch({ type: "settings/save" });
    world.take("saveMcp").reject(new Error("EACCES: permission denied"));
    await world.flush();
    expect(settingsVm(world)).toMatchObject({
      error: "保存できませんでした: EACCES: permission denied",
      canApply: true,
    });
  });

  it("接続先の URL をコピーできる（Zetter へ写す記録には残さない）", async () => {
    const world = await started([], RUNNING);
    world.dispatch({ type: "settings/open" });
    world.take("getMcp").resolve(RUNNING);
    await world.flush();
    world.dispatch({ type: "settings/copy-url" });
    const copy = world.take("copyText");
    expect(copy.args).toEqual(["http://127.0.0.1:23110/mcp"]);
    copy.resolve(undefined);
    await world.flush();
    expect(world.pending()).toEqual([]);
    expect(world.vm().toasts.map((toast) => toast.message)).toEqual([
      "MCP サーバーの URL をコピーしました。",
    ]);
  });

  it("開いているあいだは、キャストを書き換えない・切り替えない", async () => {
    const world = await started([{ name: "灯里" }]);
    world.dispatch({ type: "library/new" });
    world.dispatch({ type: "settings/open" });
    world.dispatch({ type: "input", path: ["cast", "name"], value: "灯里" });
    world.dispatch({ type: "library/open", folder: "cast-0" });
    world.dispatch({ type: "menu", command: "new" });
    expect(world.session().doc.name).toBe("");
    expect(world.pending()).toEqual(["getMcp"]);
  });
});
