import type { CastDocument, CastImage, CastMode, CastStatus } from "./cast";
import type { CopyLog } from "./copyLog";

/** ライブラリの一覧に出す 1 件 */
export interface CastSummary {
  folder: string;
  id: string;
  name: string;
  tagline: string;
  mode: CastMode;
  status: CastStatus;
  updatedAt: string;
  /** アイコンの表示用 URL（forge-image://） */
  avatarUrl: string | null;
  avatarBlurred: boolean;
}

export interface LibraryListing {
  root: string;
  casts: CastSummary[];
  /** 読めなかったフォルダ（壊れた cast.json など） */
  errors: { folder: string; message: string }[];
}

export interface LoadedCast {
  folder: string;
  doc: CastDocument;
  /** doc の中の画像ファイル（相対パス）→ 表示用 URL */
  imageUrls: Record<string, string>;
  /** 新しい版のアプリで書かれたファイルなど、保存前に知らせること */
  notices: string[];
  /** Zetter へ写すためにコピーした記録 */
  copyLog: CopyLog;
}

export interface SavedCast {
  folder: string;
  doc: CastDocument;
  imageUrls: Record<string, string>;
  notices: string[];
  /** 保存前の画像（"pending:<id>"）→ 書き出したファイルを指す参照 */
  replacedImages: Record<string, CastImage>;
}

export interface SaveCastRequest {
  /** 既存のキャストのフォルダ名。新規なら null */
  folder: string | null;
  doc: CastDocument;
  /** "pending:<id>" → 画像の dataURL（まだファイルになっていない画像） */
  pendingImages: Record<string, string>;
}

/**
 * 保存の結果。保存先のキャストのフォルダがなくなっていたときは missing（画面で新しいキャストとして
 * 保存し直せるようにする）。エラーに付けた印は contextBridge を越えると文言しか残らないので、結果で返す。
 */
export type SaveCastResult =
  | { kind: "saved"; cast: SavedCast }
  | { kind: "missing"; message: string };

/**
 * メインプロセスの返事。例外のままでは、文言に Electron の前置き（Error invoking remote method…）が
 * 付いて画面に届くので、成否を値で返して preload で投げ直す。
 */
export type InvokeResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface ForgeApi {
  getLibrary(): Promise<LibraryListing>;
  chooseLibraryRoot(): Promise<LibraryListing | null>;
  loadCast(folder: string): Promise<LoadedCast>;
  saveCast(request: SaveCastRequest): Promise<SaveCastResult>;
  openCastFolder(folder: string): Promise<void>;
  openLibraryFolder(): Promise<void>;
  /** 画像ファイルを、フォルダの中で選んだ状態で開く */
  showImage(folder: string, file: string): Promise<void>;
  /** 画像ファイルの絶対パス（Zetter のファイル選択の画面に貼り付けて選ぶ） */
  imagePath(folder: string, file: string): Promise<string>;
  writeCopyLog(folder: string, log: CopyLog): Promise<void>;
  copyText(text: string): Promise<void>;
  /** https のページを既定のブラウザで開く */
  openExternal(url: string): Promise<void>;
  /** メニューのコマンド。戻り値で登録を外す */
  onCommand(listener: (command: MenuCommand) => void): () => void;
}

/** 「新しいキャスト」「保存」「次の項目をコピー」 */
export type MenuCommand = "new" | "save" | "copy-next";

declare global {
  interface Window {
    forge: ForgeApi;
  }
}
