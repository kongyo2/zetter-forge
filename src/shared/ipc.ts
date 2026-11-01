import type { CastDocument, CastImage, CastMode, CastStatus } from "./cast";
import type { CopyLog } from "./copyLog";
import type { McpInfo, McpSettings } from "./mcp";
import type { RemoteReply, RemoteRequest } from "./remote";

export interface CastSummary {
  folder: string;
  id: string;
  name: string;
  tagline: string;
  mode: CastMode;
  status: CastStatus;
  updatedAt: string;
  avatarUrl: string | null;
  avatarBlurred: boolean;
}

export interface LibraryListing {
  root: string;
  casts: CastSummary[];
  errors: { folder: string; message: string }[];
}

export interface LoadedCast {
  folder: string;
  doc: CastDocument;
  imageUrls: Record<string, string>;
  notices: string[];
  copyLog: CopyLog;
}

export interface SavedCast {
  folder: string;
  doc: CastDocument;
  imageUrls: Record<string, string>;
  notices: string[];
  replacedImages: Record<string, CastImage>;
}

export interface SaveCastRequest {
  folder: string | null;
  doc: CastDocument;
  pendingImages: Record<string, string>;
}

export type SaveCastResult =
  | { kind: "saved"; cast: SavedCast }
  | { kind: "missing"; message: string };

export type DeleteCastResult = { kind: "trashed" } | { kind: "missing" };

export type InvokeResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface ForgeApi {
  getLibrary(): Promise<LibraryListing>;
  chooseLibraryRoot(): Promise<LibraryListing | null>;
  loadCast(folder: string): Promise<LoadedCast>;
  saveCast(request: SaveCastRequest): Promise<SaveCastResult>;
  deleteCast(folder: string): Promise<DeleteCastResult>;
  openCastFolder(folder: string): Promise<void>;
  openLibraryFolder(): Promise<void>;
  showImage(folder: string, file: string): Promise<void>;
  imagePath(folder: string, file: string): Promise<string>;
  writeCopyLog(folder: string, log: CopyLog): Promise<void>;
  copyText(text: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  getMcp(): Promise<McpInfo>;
  saveMcp(settings: McpSettings): Promise<McpInfo>;
  onCommand(listener: (command: MenuCommand) => void): () => void;
  onRemote(handler: (request: RemoteRequest) => Promise<RemoteReply>): () => void;
}

export type MenuCommand = "new" | "save" | "copy-next" | "settings";

declare global {
  interface Window {
    forge: ForgeApi;
  }
}
