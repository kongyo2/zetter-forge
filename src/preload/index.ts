import type { ForgeApi } from "@shared/ipc";
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
  onCommand: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, command: "new" | "save") =>
      listener(command);
    ipcRenderer.on("menu:command", handler);
    return () => {
      ipcRenderer.removeListener("menu:command", handler);
    };
  },
};

contextBridge.exposeInMainWorld("forge", api);
