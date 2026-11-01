import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { CastDocument } from "@shared/cast";
import type { CopyLog } from "@shared/copyLog";
import type {
  CastSummary,
  DeleteCastResult,
  InvokeResult,
  LibraryListing,
  LoadedCast,
  MenuCommand,
  SaveCastRequest,
  SaveCastResult,
} from "@shared/ipc";
import {
  DEFAULT_MCP_SETTINGS,
  MCP_PORT_MAX,
  MCP_PORT_MIN,
  type McpInfo,
  isMcpSettings,
} from "@shared/mcp";
import type { RemoteReply, RemoteRequest } from "@shared/remote";
import {
  BrowserWindow,
  Menu,
  type WebContents,
  app,
  clipboard,
  dialog,
  ipcMain,
  nativeTheme,
  net,
  protocol,
  shell,
} from "electron";

import icon from "../../build/icons/512x512.png?asset";
import {
  castDir,
  castFilePath,
  castImagePath,
  deleteCast,
  isCastMissing,
  listCasts,
  loadCast,
  referencedImages,
  saveCast,
  writeCopyLog,
} from "./library";
import { McpHost, createZetterServer } from "./mcp";
import { type AppSettings, readSettings, writeSettings } from "./settings";

const APP_NAME = "Zetter Forge";
const IMAGE_SCHEME = "forge-image";
const REMOTE_TIMEOUT_MS = 30_000;

protocol.registerSchemesAsPrivileged([
  { scheme: IMAGE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let mainWindow: BrowserWindow | null = null;
let settings: AppSettings;

function settingsFile(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

let remoteScreen: WebContents | null = null;
const remoteWaiting = new Map<number, (reply: RemoteReply) => void>();
let remoteSeq = 0;
let remoteQueue: Promise<unknown> = Promise.resolve();

function forgetRemoteScreen(): void {
  remoteScreen = null;
  for (const resolve of remoteWaiting.values())
    resolve({ ok: false, error: "Zetter Forge の窓が閉じられました。" });
  remoteWaiting.clear();
}

function askScreen(request: RemoteRequest): Promise<RemoteReply> {
  const ask = () =>
    new Promise<RemoteReply>((resolve) => {
      const screen = remoteScreen;
      if (!screen || screen.isDestroyed()) {
        resolve({
          ok: false,
          error:
            "Zetter Forge の窓が開いていません。アプリの窓を開いてから、もう一度試してください。",
        });
        return;
      }
      const id = (remoteSeq += 1);
      const timer = setTimeout(() => {
        if (remoteWaiting.delete(id))
          resolve({ ok: false, error: "画面から返事がありませんでした。" });
      }, REMOTE_TIMEOUT_MS);
      remoteWaiting.set(id, (reply) => {
        clearTimeout(timer);
        resolve(reply);
      });
      screen.send("remote:request", id, request);
    });
  const next = remoteQueue.then(ask, ask);
  remoteQueue = next;
  return next;
}

const mcpHost = new McpHost(() =>
  createZetterServer({
    version: app.getVersion(),
    libraryRoot: () => settings.libraryRoot,
    remote: askScreen,
  }),
);

async function mcpInfo(): Promise<McpInfo> {
  return { settings: settings.mcp, status: await mcpHost.status() };
}

function imageUrl(folder: string, relative: string): string {
  const parts = relative.split("/").map(encodeURIComponent).join("/");
  return `${IMAGE_SCHEME}://cast/${encodeURIComponent(folder)}/${parts}`;
}

function imageUrlsFor(folder: string, doc: CastDocument): Record<string, string> {
  return Object.fromEntries(referencedImages(doc).map((file) => [file, imageUrl(folder, file)]));
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
    avatarBlurred: doc.avatarBlurred,
  }));
  return { root: settings.libraryRoot, casts: summaries, errors };
}

function handle<A extends unknown[], T>(channel: string, task: (...args: A) => Promise<T>): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]): Promise<InvokeResult<T>> => {
    try {
      return { ok: true, value: await task(...(args as A)) };
    } catch (error) {
      console.error(`[${channel}]`, error);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}

async function openFolder(folder: string): Promise<void> {
  const error = await shell.openPath(folder);
  if (error) throw new Error(error);
}

async function openLibraryFolder(): Promise<void> {
  await fs.mkdir(settings.libraryRoot, { recursive: true });
  await openFolder(settings.libraryRoot);
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
    const previous = settings;
    settings = { ...settings, libraryRoot: chosen };
    try {
      const next = await listing();
      await writeSettings(settingsFile(), settings);
      return next;
    } catch (error) {
      settings = previous;
      throw error;
    }
  });
  handle("cast:load", async (folder: string): Promise<LoadedCast> => {
    const loaded = await loadCast(settings.libraryRoot, folder);
    return { ...loaded, imageUrls: imageUrlsFor(loaded.folder, loaded.doc) };
  });
  handle("cast:save", async (request: SaveCastRequest): Promise<SaveCastResult> => {
    try {
      const saved = await saveCast(settings.libraryRoot, {
        folder: request.folder,
        doc: request.doc,
        pendingImages: request.pendingImages,
      });
      return {
        kind: "saved",
        cast: {
          folder: saved.folder,
          doc: saved.doc,
          notices: saved.notices,
          imageUrls: imageUrlsFor(saved.folder, saved.doc),
          replacedImages: saved.replacedImages,
        },
      };
    } catch (error) {
      if (isCastMissing(error)) return { kind: "missing", message: error.message };
      throw error;
    }
  });
  handle("cast:delete", async (folder: string): Promise<DeleteCastResult> => {
    try {
      await deleteCast(settings.libraryRoot, folder, (dir) => shell.trashItem(dir));
      return { kind: "trashed" };
    } catch (error) {
      if (isCastMissing(error)) return { kind: "missing" };
      throw error;
    }
  });
  handle("cast:open-folder", async (folder: string) =>
    openFolder(castDir(settings.libraryRoot, folder)),
  );
  handle("cast:show-image", async (folder: string, file: string) => {
    shell.showItemInFolder(await castImagePath(settings.libraryRoot, folder, file));
  });
  handle("cast:image-path", async (folder: string, file: string) =>
    castImagePath(settings.libraryRoot, folder, file),
  );
  handle("cast:write-copy-log", async (folder: string, log: CopyLog) =>
    writeCopyLog(settings.libraryRoot, folder, log),
  );
  handle("library:open-folder", () => openLibraryFolder());
  handle("clipboard:write", async (text: unknown) => {
    if (typeof text !== "string") throw new Error("コピーする文字がありません。");
    clipboard.writeText(text);
  });
  handle("shell:open-external", async (url: unknown) => {
    if (typeof url !== "string" || new URL(url).protocol !== "https:")
      throw new Error("https で始まる URL だけ開けます。");
    await shell.openExternal(url);
  });
  handle("mcp:get", () => mcpInfo());
  handle("mcp:save", async (next: unknown) => {
    if (!isMcpSettings(next))
      throw new Error(`ポートは ${MCP_PORT_MIN}〜${MCP_PORT_MAX} の数にしてください。`);
    const updated: AppSettings = { ...settings, mcp: { enabled: next.enabled, port: next.port } };
    await writeSettings(settingsFile(), updated);
    settings = updated;
    await mcpHost.apply(settings.mcp);
    return mcpInfo();
  });
  ipcMain.on("remote:ready", (event) => {
    if (event.sender === mainWindow?.webContents) remoteScreen = event.sender;
  });
  ipcMain.on("remote:reply", (event, id: unknown, reply: RemoteReply) => {
    if (event.sender !== remoteScreen || typeof id !== "number") return;
    const resolve = remoteWaiting.get(id);
    remoteWaiting.delete(id);
    resolve?.(reply);
  });
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

function showAbout(): void {
  const options = {
    type: "info" as const,
    title: APP_NAME,
    message: `${APP_NAME} ${app.getVersion()}`,
    detail: `Electron ${process.versions.electron} / Chromium ${process.versions.chrome}`,
    buttons: ["OK"],
  };
  if (mainWindow) void dialog.showMessageBox(mainWindow, options);
  else void dialog.showMessageBox(options);
}

function buildMenu(): void {
  const mac = process.platform === "darwin";
  const openLibrary = () =>
    void openLibraryFolder().catch((error: unknown) =>
      dialog.showErrorBox(
        APP_NAME,
        `ライブラリのフォルダを開けませんでした。\n${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(mac
      ? [
          {
            label: APP_NAME,
            submenu: [
              { label: `${APP_NAME} について`, role: "about" as const },
              { type: "separator" as const },
              { label: "設定…", accelerator: "CmdOrCtrl+,", click: () => sendCommand("settings") },
              { type: "separator" as const },
              { label: "サービス", role: "services" as const },
              { type: "separator" as const },
              { label: `${APP_NAME} を隠す`, role: "hide" as const },
              { label: "ほかを隠す", role: "hideOthers" as const },
              { label: "すべてを表示", role: "unhide" as const },
              { type: "separator" as const },
              { label: `${APP_NAME} を終了`, role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "ファイル",
      submenu: [
        { label: "新しいキャスト", accelerator: "CmdOrCtrl+N", click: () => sendCommand("new") },
        { label: "保存", accelerator: "CmdOrCtrl+S", click: () => sendCommand("save") },
        { type: "separator" },
        { label: "ライブラリのフォルダを開く", click: openLibrary },
        ...(mac
          ? []
          : [
              { type: "separator" as const },
              { label: "設定…", accelerator: "CmdOrCtrl+,", click: () => sendCommand("settings") },
            ]),
        { type: "separator" },
        mac ? { label: "ウィンドウを閉じる", role: "close" } : { label: "終了", role: "quit" },
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
        { type: "separator" },
        {
          label: "Zetter へ写す: 次の項目をコピー",
          accelerator: "CmdOrCtrl+Shift+C",
          click: () => sendCommand("copy-next"),
        },
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
    ...(mac ? [{ label: "ウィンドウ", role: "windowMenu" as const }] : []),
    ...(mac ? [] : [{ label: "ヘルプ", submenu: [{ label: "バージョン情報", click: showAbout }] }]),
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    title: APP_NAME,
    ...(process.platform === "linux" ? { icon } : {}),
    show: false,
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
    if (mainWindow === window) mainWindow = null;
    forgetRemoteScreen();
  });
  window.webContents.on("did-start-loading", () => {
    if (remoteScreen === window.webContents) forgetRemoteScreen();
  });
  window.webContents.on("will-prevent-unload", (event) => {
    const choice = dialog.showMessageBoxSync(window, {
      type: "warning",
      buttons: ["保存しないで閉じる", "キャンセル"],
      defaultId: 1,
      cancelId: 1,
      title: APP_NAME,
      message: "保存していない変更があります。",
      detail: "閉じると、最後に保存したあとの変更は失われます。",
    });
    if (choice === 0) event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//u.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault();
  });
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (!app.isPackaged && devUrl) void window.loadURL(devUrl);
  else void window.loadFile(path.join(__dirname, "../renderer/index.html"));
}

async function start(): Promise<void> {
  settings = await readSettings(settingsFile(), {
    libraryRoot: path.join(app.getPath("documents"), "ZetterForge"),
    mcp: DEFAULT_MCP_SETTINGS,
  });
  app.setAboutPanelOptions({ applicationName: APP_NAME, applicationVersion: app.getVersion() });
  registerImageProtocol();
  registerIpc();
  buildMenu();
  mcpHost.apply(settings.mcp).catch((error: unknown) => console.error("[mcp]", error));
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

if (app.requestSingleInstanceLock()) {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
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
  app.on("will-quit", () => void mcpHost.close());
} else {
  app.quit();
}
