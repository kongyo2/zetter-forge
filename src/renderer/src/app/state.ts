// 仲介役（Mediator）が持つ状態。画面に出すものはすべてここから作る（Presenter）。
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

/** 入力欄へフォーカスを移す頼み（nonce が変わるたびに 1 回だけ効く） */
interface FocusRequest {
  path: Path;
  nonce: number;
  /** 移したあとに選ぶ範囲。null なら選び直さない */
  selection: Selection | null;
}

/** 開いているキャストごとの画面の状態（保存しても変わらない） */
export interface SessionUi {
  tab: ViewTab;
  /** キャラクターのタブで選んでいる人（MAIN_CHARACTER か登場人物の id） */
  character: string;
  /** 好感度のタブで選んでいる対象（AFFINITY_DEFAULT・本体・登場人物の id） */
  subject: string;
  /** 開いている好感度の段階（-1 はすべて閉じている） */
  stage: number;
  /** 狭い画面で確認欄を重ねて出しているか */
  checksOpen: boolean;
  focus: FocusRequest | null;
  /** いまコピーした項目（「コピーしました」を出す） */
  flash: { key: string; nonce: number } | null;
}

/** 編集中のキャスト */
export interface Session {
  /** 開いた・作ったときに決まる番号。保存しても変わらない（画面の状態を保つため） */
  key: number;
  /** ライブラリ内のフォルダ名。まだ一度も保存していなければ null */
  folder: string | null;
  doc: CastDocument;
  /** 最後に保存（または読み込み）した時点の doc の正規化 JSON */
  savedJson: string;
  dirty: boolean;
  /** 書き換えるたびに増える番号（保存中の書き足しを見分ける） */
  revision: number;
  /** 保存済みの画像ファイル（相対パス）→ 表示用 URL */
  imageUrls: Record<string, string>;
  /** 保存前の画像（"pending:<id>"）→ dataURL */
  pendingImages: Record<string, string>;
  notices: string[];
  copyLog: CopyLog;
  ui: SessionUi;
}

type LibraryState =
  | { status: "loading"; listing: LibraryListing | null }
  | { status: "ready"; listing: LibraryListing }
  | { status: "failed"; message: string; listing: LibraryListing | null };

/** 確かめてから行う操作、保存のあとに続ける操作 */
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
  /** キャストをフォルダごとゴミ箱へ移す（title は終わったときの知らせに使う） */
  | { kind: "delete"; folder: string; title: string };

/** いま進めている、ファイルを読み書きする処理（同時には 1 つだけ） */
type Task =
  | { kind: "idle" }
  | {
      kind: "opening";
      token: number;
      folder: string;
      /** 開くと決めたときの編集中のキャスト（読み込み中に書き換えたかを見るため） */
      sessionKey: number | null;
      revision: number | null;
    }
  | {
      kind: "saving";
      token: number;
      sessionKey: number;
      /** 保存を始めたときの revision */
      revision: number;
      /** 保存中にもう一度保存を頼まれた */
      again: boolean;
      /** 保存が終わったら続ける操作 */
      then: Intent | null;
    }
  | { kind: "choosing-root"; token: number }
  /** キャストをフォルダごとゴミ箱へ移している */
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
  /** Esc や「キャンセル」のときの文言 */
  cancelLabel: string;
}

/** 画像を選んで切り抜くまで（ギャラリーは何枚か続けて） */
export interface CropDialog {
  kind: "crop";
  token: number;
  /** 画像を入れるキャスト（Session.key） */
  sessionKey: number;
  /** 画像を入れる場所 */
  path: Path;
  image: ImageKind;
  /** いま切り抜いている画像（読み込み中は null） */
  source: string | null;
  /** まだ切り抜いていない画像 */
  queue: readonly PickedFile[];
  /** いま何枚目か（1 から）と全部の枚数 */
  index: number;
  total: number;
  busy: boolean;
  error: string | null;
}

/** 設定（MCP サーバー）。入力中の値は、「この設定にする」を押すまで保存しない */
export interface SettingsDialog {
  kind: "settings";
  /** 読み込み・保存の頼みの番号 */
  token: number;
  enabled: boolean;
  /** ポートの欄の文字 */
  port: string;
  /** 読み込み・保存の途中 */
  busy: boolean;
  error: string | null;
}

type Dialog = ConfirmDialog | CropDialog | SettingsDialog;

export interface Toast {
  id: number;
  message: string;
  tone: "info" | "error";
  /** 「元に戻す」 */
  undo: UndoPoint | null;
}

/** 消したものを元に戻すための控え（そのあと書き換えていなければ戻せる） */
export interface UndoPoint {
  sessionKey: number;
  revision: number;
  doc: CastDocument;
  ui: SessionUi;
}

export interface AppState {
  /** 番号の払い出し（token・key・nonce など） */
  seq: number;
  now: number;
  library: LibraryState;
  libraryToken: number;
  /** 最後に一覧を読みに行った時刻 */
  libraryAt: number;
  query: string;
  session: Session | null;
  task: Task;
  /** ダイアログ。開いているキャストについてのもの（設定のほか）は、キャストを替えたら閉じる */
  dialog: Dialog | null;
  toasts: Toast[];
  /** MCP サーバーの設定といまの様子。起動して読むまでは null */
  mcp: McpInfo | null;
  /** 最後に頼んだ、MCP サーバーの設定の読み込み・保存の番号 */
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
