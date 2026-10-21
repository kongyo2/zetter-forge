// 仲介役（Mediator）が受け取るできごと。
// ViewEvent は画面の部品が出し、部品の階層を Root まで上って（Chain of Responsibility）届く。
// 上る途中の部品は、自分の場所（path の前半）を付け足していく。
import type { CroppedImage, CropCanvas } from "@shared/images";
import type { LibraryListing, LoadedCast, MenuCommand, SavedCast } from "@shared/ipc";
import type { EditorTab } from "@shared/validate";

import type { Path, PickedFile, Selection, ViewTab } from "./types";

/** 文書の中の場所についてのできごと（上る途中で path が組み立てられる） */
export type FieldEvent =
  /** 文字・数・選択肢を書き換えた */
  | { type: "input"; path: Path; value: string }
  /** オン・オフを切り替えた */
  | { type: "check"; path: Path; checked: boolean }
  /** 札（【朝】など）や {{user}} をカーソルの位置に入れる */
  | { type: "insert"; path: Path; text: string; selection: Selection }
  /** リストに 1 つ足す・作る */
  | { type: "add"; path: Path }
  /** 1 つ消す・外す */
  | { type: "remove"; path: Path }
  /** 1 つ上（-1）か下（1）へ動かす */
  | { type: "move"; path: Path; offset: -1 | 1 }
  /** 書き終えた（好感度の開始値を確定して並べ直す） */
  | { type: "commit"; path: Path }
  /** 画像ファイルを選んだ */
  | { type: "pick"; path: Path; files: readonly PickedFile[] }
  /** Zetter へ写すためにコピーする（文字は仲介役が文書から取り出す） */
  | { type: "copy"; path: Path }
  /** 写す項目を済みにする・戻す（選ぶだけの項目） */
  | { type: "mark"; path: Path; done: boolean }
  /** 画像ファイルをフォルダの中で見せる */
  | { type: "show-file"; path: Path }
  /** 書いてある URL をブラウザで開く */
  | { type: "open-url"; path: Path };

export type ViewEvent =
  | FieldEvent
  // ライブラリ
  | { type: "library/open"; folder: string }
  | { type: "library/new" }
  | { type: "library/choose-root" }
  | { type: "library/open-root" }
  | { type: "library/retry" }
  | { type: "library/query"; value: string }
  // 編集画面
  | { type: "editor/save" }
  | { type: "editor/open-folder" }
  | { type: "editor/tab"; tab: ViewTab }
  | { type: "editor/checks"; open: boolean }
  /** 確認欄の項目から、直す場所へ移る */
  | { type: "editor/jump"; tab: EditorTab; target: Path | null }
  | { type: "editor/character"; id: string }
  | { type: "editor/subject"; key: string }
  | { type: "editor/stage"; index: number }
  // Zetter へ写す
  | { type: "transfer/next" }
  | { type: "transfer/reset" }
  /** Zetter をブラウザで開く（控えた URL があればそのページ） */
  | { type: "transfer/open-zetter" }
  // ダイアログ
  | { type: "dialog/choose"; choice: string }
  | { type: "dialog/cancel" }
  | { type: "crop/confirm"; canvas: CropCanvas }
  | { type: "crop/failed"; message: string }
  | { type: "crop/cancel" }
  /** タブの並びで 1 つ選んだ（何を選んだかは、上の部品が意味を足す） */
  | { type: "tab/select"; id: string }
  // 知らせ
  | { type: "toast/undo"; id: number }
  // 窓
  | { type: "window/focus" }
  /**
   * 画面の中だけで扱う頼み（閉じている「オプション設定」を開いて入力欄を見せる）。
   * 途中の部品が受け持ち、仲介役には意味を持たない。
   */
  | { type: "reveal" };

/** 仲介役が頼んだ処理の結果など、画面の外から届くできごと */
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
  | { type: "image/read"; token: number; source: string }
  | { type: "image/read-failed"; token: number; message: string }
  | { type: "image/encoded"; token: number; image: CroppedImage }
  | { type: "image/encode-failed"; token: number; message: string }
  | { type: "copy/done"; sessionKey: number; key: string; hash: string; label: string }
  | { type: "copy/failed"; message: string }
  | { type: "task/failed"; message: string }
  | { type: "toast/expire"; id: number };

export type AppEvent = ViewEvent | SystemEvent;
