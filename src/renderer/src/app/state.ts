import type { CastDocument } from "@shared/cast";
import type { CopyLog } from "@shared/copyLog";
import type { ImageKind } from "@shared/images";
import type { LibraryListing, LoadedCast } from "@shared/ipc";
import type { McpInfo } from "@shared/mcp";

import {
  AFFINITY_DEFAULT,
  MAIN_CHARACTER,
  type Path,
  type PickedFile,
  type Selection,
  type ViewTab,
} from "./types";

interface FocusRequest {
  path: Path;
  nonce: number;
  selection: Selection | null;
}

export interface SessionUi {
  tab: ViewTab;
  character: string;
  subject: string;
  stage: number;
  checksOpen: boolean;
  focus: FocusRequest | null;
  flash: { key: string; nonce: number } | null;
}

export interface Session {
  key: number;
  folder: string | null;
  doc: CastDocument;
  savedJson: string;
  dirty: boolean;
  revision: number;
  imageUrls: Record<string, string>;
  pendingImages: Record<string, string>;
  notices: string[];
  copyLog: CopyLog;
  ui: SessionUi;
}

type LibraryState =
  | { status: "loading"; listing: LibraryListing | null }
  | { status: "ready"; listing: LibraryListing }
  | { status: "failed"; message: string; listing: LibraryListing | null };

export type Intent =
  | { kind: "open"; folder: string; discard: boolean }
  | { kind: "new"; discard: boolean }
  | { kind: "choose-root"; discard: boolean }
  | { kind: "save-then"; then: Intent }
  | { kind: "save-as-new" }
  | { kind: "adopt"; loaded: LoadedCast }
  | { kind: "remove-member"; id: string }
  | { kind: "remove-affinity" }
  | { kind: "trim-intro" }
  | { kind: "reset-copy-log" }
  | { kind: "delete"; folder: string; title: string };

type Task =
  | { kind: "idle" }
  | {
      kind: "opening";
      token: number;
      folder: string;
      sessionKey: number | null;
      revision: number | null;
    }
  | {
      kind: "saving";
      token: number;
      sessionKey: number;
      revision: number;
      again: boolean;
      then: Intent | null;
    }
  | { kind: "choosing-root"; token: number }
  | { kind: "deleting"; token: number; folder: string; title: string };

interface DialogChoice {
  id: string;
  label: string;
  tone: "primary" | "danger" | "plain";
  intent: Intent | null;
}

export interface ConfirmDialog {
  kind: "confirm";
  id: number;
  title: string;
  message: string;
  choices: DialogChoice[];
  cancelLabel: string;
}

export interface CropDialog {
  kind: "crop";
  token: number;
  sessionKey: number;
  path: Path;
  image: ImageKind;
  source: string | null;
  queue: readonly PickedFile[];
  index: number;
  total: number;
  busy: boolean;
  error: string | null;
}

export interface SettingsDialog {
  kind: "settings";
  token: number;
  enabled: boolean;
  port: string;
  busy: boolean;
  error: string | null;
}

type Dialog = ConfirmDialog | CropDialog | SettingsDialog;

export interface Toast {
  id: number;
  message: string;
  tone: "info" | "error";
  undo: UndoPoint | null;
}

export interface UndoPoint {
  sessionKey: number;
  revision: number;
  doc: CastDocument;
  ui: SessionUi;
}

export interface AppState {
  seq: number;
  now: number;
  library: LibraryState;
  libraryToken: number;
  libraryAt: number;
  query: string;
  session: Session | null;
  task: Task;
  dialog: Dialog | null;
  toasts: Toast[];
  mcp: McpInfo | null;
  mcpToken: number;
}

export function initialState(now: number): AppState {
  return {
    seq: 0,
    now,
    library: { status: "loading", listing: null },
    libraryToken: 0,
    libraryAt: 0,
    query: "",
    session: null,
    task: { kind: "idle" },
    dialog: null,
    toasts: [],
    mcp: null,
    mcpToken: 0,
  };
}

export function initialUi(): SessionUi {
  return {
    tab: "character",
    character: MAIN_CHARACTER,
    subject: AFFINITY_DEFAULT,
    stage: 0,
    checksOpen: false,
    focus: null,
    flash: null,
  };
}
