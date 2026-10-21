import type { CastDocument, CastImage } from "@shared/cast";
import { createContext, useContext } from "react";

import type { CroppedImage } from "./crop";
import type { EditorSession } from "./session";

export interface EditorApi {
  session: EditorSession;
  doc: CastDocument;
  /** doc を書き換える（recipe には複製が渡る） */
  update(recipe: (doc: CastDocument) => void): void;
  /** 切り抜いた画像を保存前の画像として登録し、doc に入れる参照を返す */
  addImage(image: CroppedImage): CastImage;
  /** 画像の表示用 URL */
  src(image: CastImage | null | undefined): string | null;
  notify(message: string, tone?: "error" | "info"): void;
}

export const EditorContext = createContext<EditorApi | null>(null);

export function useEditor(): EditorApi {
  const editor = useContext(EditorContext);
  if (!editor) throw new Error("EditorContext がありません。");
  return editor;
}
