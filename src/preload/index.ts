import type { ForgeApi, MenuCommand } from "@shared/ipc";
import { contextBridge, ipcRenderer } from "electron";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as Result<T>;
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

const api: ForgeApi = {
  getLibrary: () => invoke("library:get"),
  chooseLibraryRoot: () => invoke("library:choose"),
  loadCast: (folder) => invoke("cast:load", folder),
  saveCast: (request) => invoke("cast:save", request),
  openCastFolder: (folder) => invoke("cast:open-folder", folder),
  openLibraryFolder: () => invoke("library:open-folder"),
  getEditorSettings: () => invoke("settings:get-editor"),
  setEditorSettings: (settings) => invoke("settings:set-editor", settings),
  analyzePoml: (text) => invoke("poml:analyze", text),
  completePoml: (text, offset) => invoke("poml:complete", text, offset),
  hoverPoml: (text, offset) => invoke("poml:hover", text, offset),
  onCommand: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, command: MenuCommand) => listener(command);
    ipcRenderer.on("menu:command", handler);
    return () => {
      ipcRenderer.removeListener("menu:command", handler);
    };
  },
};

contextBridge.exposeInMainWorld("forge", api);
