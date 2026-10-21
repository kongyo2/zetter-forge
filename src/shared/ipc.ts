import type { CastDocument, CastImage, CastMode, CastStatus } from "./cast";
import type { EditorSettings } from "./editorSettings";
import type { PomlAnalysis, PomlCompletions, PomlHover } from "./poml";

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
}

export interface SavedCast extends LoadedCast {
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

export interface ForgeApi {
  getLibrary(): Promise<LibraryListing>;
  chooseLibraryRoot(): Promise<LibraryListing | null>;
  loadCast(folder: string): Promise<LoadedCast>;
  saveCast(request: SaveCastRequest): Promise<SavedCast>;
  openCastFolder(folder: string): Promise<void>;
  openLibraryFolder(): Promise<void>;
  getEditorSettings(): Promise<EditorSettings>;
  /** 書き込んだあとの（整えた）設定を返す */
  setEditorSettings(settings: EditorSettings): Promise<EditorSettings>;
  /** POML として読んだときの書き間違いと、式として読むところ */
  analyzePoml(text: string): Promise<PomlAnalysis>;
  completePoml(text: string, offset: number): Promise<PomlCompletions | null>;
  hoverPoml(text: string, offset: number): Promise<PomlHover | null>;
  /** メニューの「新しいキャスト」「保存」「設定」。戻り値で登録を外す */
  onCommand(listener: (command: MenuCommand) => void): () => void;
}

export type MenuCommand = "new" | "save" | "settings";

declare global {
  interface Window {
    forge: ForgeApi;
  }
}
