import type { ForgeApi, MenuCommand } from "@shared/ipc";
import { contextBridge, ipcRenderer } from "electron";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

// contextBridge を越えると、エラーは文言しか残らない（印を付けても画面には届かない）
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
  showImage: (folder, file) => invoke("cast:show-image", folder, file),
  imagePath: (folder, file) => invoke("cast:image-path", folder, file),
  writeCopyLog: (folder, log) => invoke("cast:write-copy-log", folder, log),
  copyText: (text) => invoke("clipboard:write", text),
  openExternal: (url) => invoke("shell:open-external", url),
  onCommand: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, command: MenuCommand) => listener(command);
    ipcRenderer.on("menu:command", handler);
    return () => {
      ipcRenderer.removeListener("menu:command", handler);
    };
  },
};

contextBridge.exposeInMainWorld("forge", api);
