import type { CastDocument, CastImage } from "@shared/cast";
import type { LoadedCast } from "@shared/ipc";

/** 編集中のキャスト */
export interface EditorSession {
  /** ライブラリ内のフォルダ名。まだ一度も保存していなければ null */
  folder: string | null;
  doc: CastDocument;
  /** 最後に保存（または読み込み）した時点の doc の正規化 JSON */
  savedJson: string;
  /** 保存済みの画像ファイル（相対パス）→ 表示用 URL */
  imageUrls: Record<string, string>;
  /** 保存前の画像（"pending:<id>"）→ dataURL */
  pendingImages: Record<string, string>;
  notices: string[];
}

/** キーの順番に左右されない JSON（変更があるかの判定に使う）。 */
export function canonicalJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === "object") {
      return Object.fromEntries(
        Object.keys(item)
          .sort()
          .map((key) => [key, normalize((item as Record<string, unknown>)[key])]),
      );
    }
    return item;
  };
  return JSON.stringify(normalize(value));
}

export function sessionFromLoaded(loaded: LoadedCast): EditorSession {
  return {
    folder: loaded.folder,
    doc: loaded.doc,
    savedJson: canonicalJson(loaded.doc),
    imageUrls: loaded.imageUrls,
    pendingImages: {},
    notices: loaded.notices,
  };
}

export function newSession(doc: CastDocument): EditorSession {
  return {
    folder: null,
    doc,
    savedJson: canonicalJson(doc),
    imageUrls: {},
    pendingImages: {},
    notices: [],
  };
}

/** 最後に保存した時点から変わっているか（新しいキャストは作った時点から）。 */
export function isDirty(session: EditorSession): boolean {
  return canonicalJson(session.doc) !== session.savedJson;
}

/** 画像の表示用 URL（保存前なら dataURL）。 */
export function imageSrc(
  session: EditorSession,
  image: CastImage | null | undefined,
): string | null {
  if (!image) return null;
  return session.pendingImages[image.file] ?? session.imageUrls[image.file] ?? null;
}

/** doc の中の画像参照をすべて書き換える（保存で "pending:" がファイル名に変わったときに使う）。 */
export function mapImages(doc: CastDocument, map: (image: CastImage) => CastImage): void {
  if (doc.avatar) doc.avatar = map(doc.avatar);
  if (doc.cover) doc.cover = map(doc.cover);
  if (doc.background) doc.background = map(doc.background);
  doc.gallery = doc.gallery.map((image) => ({ ...image, ...map(image) }));
  for (const member of doc.members) if (member.avatar) member.avatar = map(member.avatar);
  for (const persona of doc.recommendedPersonas)
    if (persona.avatar) persona.avatar = map(persona.avatar);
}

/** doc が参照している保存前の画像だけを残す（外した画像の dataURL を送らないため）。 */
export function usedPendingImages(session: EditorSession): Record<string, string> {
  const used: Record<string, string> = {};
  mapImages(structuredClone(session.doc), (image) => {
    const data = session.pendingImages[image.file];
    if (data) used[image.file] = data;
    return image;
  });
  return used;
}
