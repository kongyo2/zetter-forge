import path from "node:path";
import { pathToFileURL } from "node:url";

import type { CastDocument } from "@shared/cast";
import { DEFAULT_EDITOR_SETTINGS, normalizeEditorSettings } from "@shared/editorSettings";
import type {
  CastSummary,
  LibraryListing,
  LoadedCast,
  MenuCommand,
  SaveCastRequest,
  SavedCast,
} from "@shared/ipc";
import {
  BrowserWindow,
  Menu,
  app,
  dialog,
  ipcMain,
  nativeTheme,
  net,
  protocol,
  shell,
} from "electron";

import {
  castDir,
  castFilePath,
  listCasts,
  loadCast,
  referencedImages,
  saveCast,
  type StoredCast,
} from "./library";
import { analyzePoml, completePoml, hoverPoml } from "./poml";
import { type AppSettings, readSettings, writeSettings } from "./settings";

const IMAGE_SCHEME = "forge-image";

protocol.registerSchemesAsPrivileged([
  { scheme: IMAGE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let mainWindow: BrowserWindow | null = null;
let settings: AppSettings;

function settingsFile(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

/** 画像を表示するための URL。forge-image://cast/<フォルダ>/<相対パス> */
function imageUrl(folder: string, relative: string): string {
  const parts = relative.split("/").map(encodeURIComponent).join("/");
  return `${IMAGE_SCHEME}://cast/${encodeURIComponent(folder)}/${parts}`;
}

function imageUrlsFor(folder: string, doc: CastDocument): Record<string, string> {
  return Object.fromEntries(referencedImages(doc).map((file) => [file, imageUrl(folder, file)]));
}

function toLoaded(stored: StoredCast): LoadedCast {
  return {
    folder: stored.folder,
    doc: stored.doc,
    imageUrls: imageUrlsFor(stored.folder, stored.doc),
    notices: stored.notices,
  };
}

async function listing(): Promise<LibraryListing> {
  const { casts, errors } = await listCasts(settings.libraryRoot);
  const summaries: CastSummary[] = casts.map(({ folder, doc }) => ({
    folder,
    id: doc.id,
    name: doc.name,
    tagline: doc.tagline,
    mode: doc.mode,
    status: doc.status,
    updatedAt: doc.updatedAt,
    avatarUrl: doc.avatar ? imageUrl(folder, doc.avatar.file) : null,
  }));
  return { root: settings.libraryRoot, casts: summaries, errors };
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** 例外の文言を Electron の前置き（Error invoking remote method…）なしで画面に届ける。 */
function handle<A extends unknown[], T>(channel: string, task: (...args: A) => Promise<T>): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]): Promise<Result<T>> => {
    try {
      return { ok: true, value: await task(...(args as A)) };
    } catch (error) {
      console.error(`[${channel}]`, error);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}

function registerIpc(): void {
  handle("library:get", () => listing());
  handle("library:choose", async () => {
    const options = {
      title: "キャストを保存するフォルダを選ぶ",
      defaultPath: settings.libraryRoot,
      properties: ["openDirectory", "createDirectory"] as ("openDirectory" | "createDirectory")[],
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);
    const chosen = result.filePaths[0];
    if (result.canceled || !chosen) return null;
    settings = { ...settings, libraryRoot: chosen };
    await writeSettings(settingsFile(), settings);
    return listing();
  });
  handle("cast:load", async (folder: string) =>
    toLoaded(await loadCast(settings.libraryRoot, folder)),
  );
  handle("cast:save", async (request: SaveCastRequest): Promise<SavedCast> => {
    const saved = await saveCast(settings.libraryRoot, {
      folder: request.folder,
      doc: request.doc,
      pendingImages: request.pendingImages,
    });
    return { ...toLoaded(saved), replacedImages: saved.replacedImages };
  });
  handle("cast:open-folder", async (folder: string) => {
    const error = await shell.openPath(castDir(settings.libraryRoot, folder));
    if (error) throw new Error(error);
  });
  handle("library:open-folder", async () => {
    const error = await shell.openPath(settings.libraryRoot);
    if (error) throw new Error(error);
  });
  handle("settings:get-editor", async () => settings.editor);
  handle("settings:set-editor", async (editor: unknown) => {
    settings = { ...settings, editor: normalizeEditorSettings(editor) };
    await writeSettings(settingsFile(), settings);
    return settings.editor;
  });
  handle("poml:analyze", async (text: unknown) => analyzePoml(String(text)));
  handle("poml:complete", async (text: unknown, offset: unknown) =>
    completePoml(String(text), Number(offset)),
  );
  handle("poml:hover", async (text: unknown, offset: unknown) =>
    hoverPoml(String(text), Number(offset)),
  );
}

function registerImageProtocol(): void {
  protocol.handle(IMAGE_SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      const [folder, ...rest] = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
      if (url.hostname !== "cast" || !folder || rest.length === 0)
        return new Response(null, { status: 404 });
      const file = castFilePath(settings.libraryRoot, folder, rest.join("/"));
      return await net.fetch(pathToFileURL(file).toString());
    } catch {
      return new Response(null, { status: 404 });
    }
  });
}

function sendCommand(command: MenuCommand): void {
  mainWindow?.webContents.send("menu:command", command);
}

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "ファイル",
      submenu: [
        { label: "新しいキャスト", accelerator: "CmdOrCtrl+N", click: () => sendCommand("new") },
        { label: "保存", accelerator: "CmdOrCtrl+S", click: () => sendCommand("save") },
        { type: "separator" },
        { label: "設定…", accelerator: "CmdOrCtrl+,", click: () => sendCommand("settings") },
        { type: "separator" },
        {
          label: "ライブラリのフォルダを開く",
          click: () => void shell.openPath(settings.libraryRoot),
        },
        { type: "separator" },
        { label: "終了", role: "quit" },
      ],
    },
    {
      label: "編集",
      submenu: [
        { label: "元に戻す", role: "undo" },
        { label: "やり直す", role: "redo" },
        { type: "separator" },
        { label: "切り取り", role: "cut" },
        { label: "コピー", role: "copy" },
        { label: "貼り付け", role: "paste" },
        { label: "すべて選択", role: "selectAll" },
      ],
    },
    {
      label: "表示",
      submenu: [
        { label: "拡大", role: "zoomIn" },
        { label: "縮小", role: "zoomOut" },
        { label: "実際のサイズ", role: "resetZoom" },
        ...(app.isPackaged
          ? []
          : [
              { type: "separator" as const },
              { label: "開発者ツール", role: "toggleDevTools" as const },
            ]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    title: "Zetter Forge",
    show: false,
    // 画面が描かれるまでの下地。styles.css の --desk に合わせる
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#13171e" : "#e9ece6",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = window;
  window.on("ready-to-show", () => window.show());
  window.on("closed", () => {
    mainWindow = null;
  });
  // 保存していない変更があるときは、閉じる前に確かめる（画面側の beforeunload が合図）。
  window.webContents.on("will-prevent-unload", (event) => {
    const choice = dialog.showMessageBoxSync(window, {
      type: "warning",
      buttons: ["保存しないで閉じる", "キャンセル"],
      defaultId: 1,
      cancelId: 1,
      title: "Zetter Forge",
      message: "保存していない変更があります。",
      detail: "閉じると、最後に保存したあとの変更は失われます。",
    });
    if (choice === 0) event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//u.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault();
  });
  if (!app.isPackaged) {
    window.webContents.on("console-message", (event) => {
      console.log(`[renderer:${event.level}] ${event.message}`);
    });
  }
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (!app.isPackaged && devUrl) void window.loadURL(devUrl);
  else void window.loadFile(path.join(__dirname, "../renderer/index.html"));
  // 動作確認用（開発中だけ）: FORGE_SMOKE_SCREENSHOT に PNG のパスを渡すと、表示後に
  // FORGE_SMOKE_SCRIPT の JavaScript を画面で実行してから画面を保存し、終了する。
  const smokeShot = process.env.FORGE_SMOKE_SCREENSHOT;
  if (!app.isPackaged && smokeShot) {
    window.webContents.once("did-finish-load", () => {
      runSmoke(window, smokeShot).then(
        () => app.exit(0),
        (error: unknown) => {
          console.error(error);
          app.exit(1);
        },
      );
    });
  }
}

async function runSmoke(window: BrowserWindow, shot: string): Promise<void> {
  const { readFile, writeFile } = await import("node:fs/promises");
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  await wait(Number(process.env.FORGE_SMOKE_DELAY_MS ?? 2000));
  const script = process.env.FORGE_SMOKE_SCRIPT;
  if (script) {
    const result: unknown = await window.webContents.executeJavaScript(
      await readFile(script, "utf8"),
      true,
    );
    console.log(`[smoke] ${JSON.stringify(result)}`);
    await wait(500);
  }
  const image = await window.webContents.capturePage();
  await writeFile(shot, image.toPNG());
}

async function start(): Promise<void> {
  settings = await readSettings(settingsFile(), {
    libraryRoot: path.join(app.getPath("documents"), "ZetterForge"),
    editor: DEFAULT_EDITOR_SETTINGS,
  });
  // 開発中の確認用に、ライブラリの場所を環境変数で差し替えられる（設定ファイルには書かない）。
  if (!app.isPackaged && process.env.FORGE_LIBRARY_ROOT)
    settings = { ...settings, libraryRoot: process.env.FORGE_LIBRARY_ROOT };
  registerImageProtocol();
  registerIpc();
  buildMenu();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

app
  .whenReady()
  .then(start)
  .catch((error: unknown) => {
    console.error(error);
    app.quit();
  });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
