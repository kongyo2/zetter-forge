import type { CroppedImage, CropCanvas } from "@shared/images";
import type { LibraryListing, LoadedCast, MenuCommand, SavedCast } from "@shared/ipc";
import type { McpInfo } from "@shared/mcp";
import type { EditorTab } from "@shared/validate";

import type { CopyMark, Path, PickedFile, Selection, ViewTab } from "./types";

export type FieldEvent =
  | { type: "input"; path: Path; value: string }
  | { type: "check"; path: Path; checked: boolean }
  | { type: "insert"; path: Path; text: string; selection: Selection }
  | { type: "add"; path: Path }
  | { type: "remove"; path: Path }
  | { type: "move"; path: Path; offset: -1 | 1 }
  | { type: "commit"; path: Path }
  | { type: "pick"; path: Path; files: readonly PickedFile[] }
  | { type: "copy"; path: Path }
  | { type: "mark"; path: Path; done: boolean }
  | { type: "show-file"; path: Path }
  | { type: "open-url"; path: Path };

export type ViewEvent =
  | FieldEvent
  | { type: "library/open"; folder: string }
  | { type: "library/new" }
  | { type: "library/choose-root" }
  | { type: "library/open-root" }
  | { type: "library/retry" }
  | { type: "library/query"; value: string }
  | { type: "editor/save" }
  | { type: "editor/delete" }
  | { type: "editor/open-folder" }
  | { type: "editor/tab"; tab: ViewTab }
  | { type: "editor/checks"; open: boolean }
  | { type: "editor/jump"; tab: EditorTab; target: Path | null }
  | { type: "editor/character"; id: string }
  | { type: "editor/subject"; key: string }
  | { type: "editor/stage"; index: number }
  | { type: "transfer/next" }
  | { type: "transfer/reset" }
  | { type: "transfer/open-zetter" }
  | { type: "dialog/choose"; choice: string }
  | { type: "dialog/cancel" }
  | { type: "crop/confirm"; canvas: CropCanvas }
  | { type: "crop/failed"; message: string }
  | { type: "crop/cancel" }
  | { type: "tab/select"; id: string }
  | { type: "settings/open" }
  | { type: "settings/change"; patch: { enabled?: boolean; port?: string } }
  | { type: "settings/save" }
  | { type: "settings/copy-url" }
  | { type: "toast/undo"; id: number }
  | { type: "window/focus" }
  | { type: "reveal" };

type SystemEvent =
  | { type: "app/start" }
  | { type: "clock"; now: number }
  | { type: "menu"; command: MenuCommand }
  | { type: "library/loaded"; token: number; listing: LibraryListing }
  | { type: "library/failed"; token: number; message: string }
  | { type: "root/chosen"; token: number; listing: LibraryListing | null }
  | { type: "root/failed"; token: number; message: string }
  | { type: "cast/loaded"; token: number; loaded: LoadedCast }
  | { type: "cast/load-failed"; token: number; message: string }
  | { type: "cast/saved"; token: number; saved: SavedCast }
  | { type: "cast/save-failed"; token: number; message: string; missing: boolean }
  | { type: "cast/deleted"; token: number; missing: boolean }
  | { type: "cast/delete-failed"; token: number; message: string }
  | { type: "image/read"; token: number; source: string }
  | { type: "image/read-failed"; token: number; message: string }
  | { type: "image/encoded"; token: number; image: CroppedImage }
  | { type: "image/encode-failed"; token: number; message: string }
  | ({ type: "copy/done" } & CopyMark)
  | { type: "copy/failed"; message: string }
  | { type: "task/failed"; message: string }
  | { type: "toast/expire"; id: number }
  | { type: "mcp/loaded"; token: number; info: McpInfo }
  | { type: "mcp/load-failed"; token: number; message: string }
  | { type: "mcp/saved"; token: number; info: McpInfo }
  | { type: "mcp/save-failed"; token: number; message: string }
  | { type: "notice"; message: string }
  | { type: "remote/edit"; edit: FieldEvent };

export type AppEvent = ViewEvent | SystemEvent;
