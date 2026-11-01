import type { ForgeApi, InvokeResult, MenuCommand } from "@shared/ipc";
import type { RemoteReply, RemoteRequest } from "@shared/remote";
import { contextBridge, ipcRenderer } from "electron";

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as InvokeResult<T>;
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

const api: ForgeApi = {
  getLibrary: () => invoke("library:get"),
  chooseLibraryRoot: () => invoke("library:choose"),
  loadCast: (folder) => invoke("cast:load", folder),
  saveCast: (request) => invoke("cast:save", request),
  deleteCast: (folder) => invoke("cast:delete", folder),
  openCastFolder: (folder) => invoke("cast:open-folder", folder),
  openLibraryFolder: () => invoke("library:open-folder"),
  showImage: (folder, file) => invoke("cast:show-image", folder, file),
  imagePath: (folder, file) => invoke("cast:image-path", folder, file),
  writeCopyLog: (folder, log) => invoke("cast:write-copy-log", folder, log),
  copyText: (text) => invoke("clipboard:write", text),
  openExternal: (url) => invoke("shell:open-external", url),
  getMcp: () => invoke("mcp:get"),
  saveMcp: (settings) => invoke("mcp:save", settings),
  onCommand: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, command: MenuCommand) => listener(command);
    ipcRenderer.on("menu:command", handler);
    return () => {
      ipcRenderer.removeListener("menu:command", handler);
    };
  },
  onRemote: (handle) => {
    const handler = (_event: Electron.IpcRendererEvent, id: number, request: RemoteRequest) => {
      void handle(request)
        .catch((error: unknown): RemoteReply => ({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }))
        .then((reply) => ipcRenderer.send("remote:reply", id, reply));
    };
    ipcRenderer.on("remote:request", handler);
    ipcRenderer.send("remote:ready");
    return () => {
      ipcRenderer.removeListener("remote:request", handler);
    };
  },
};

contextBridge.exposeInMainWorld("forge", api);
