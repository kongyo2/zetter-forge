import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  CAST_FILE_VERSION,
  type CastDocument,
  type CastImage,
  CastFormatError,
  normalizeCastDocument,
} from "@shared/cast";
import { type CopyLog, copyLogFile, normalizeCopyLog } from "@shared/copyLog";
import { type ImageKind, imageSlotName } from "@shared/images";
import { CAST_MISSING } from "@shared/ipc";

// ライブラリの中身:
//   <root>/<キャストのフォルダ>/cast.json        設定
//   <root>/<キャストのフォルダ>/images/*.jpg     画像（中身のハッシュ入りの名前で、一度書いたら変えない）
//   <root>/<キャストのフォルダ>/history/*.json   保存のたびに残す前の版
//   <root>/<キャストのフォルダ>/copied.json      Zetter へ写すためにコピーした記録
const CAST_FILE = "cast.json";
const IMAGES_DIR = "images";
const HISTORY_DIR = "history";
const HISTORY_LIMIT = 30;
const COPY_LOG_FILE = "copied.json";

interface StoredCast {
  folder: string;
  doc: CastDocument;
  notices: string[];
}

export interface LoadedCast extends StoredCast {
  copyLog: CopyLog;
}

export interface SavedCast extends StoredCast {
  /** 保存前の画像（"pending:<id>"）→ 書き出したファイルを指す参照 */
  replacedImages: Record<string, CastImage>;
}

/** キャストのフォルダがなくなっている（移動・削除された）ときのエラー */
function castMissing(): Error {
  return Object.assign(
    new Error(
      "キャストのフォルダが見つかりません。フォルダが移動または削除された可能性があります。",
    ),
    { code: CAST_MISSING },
  );
}

export interface CastListing {
  casts: StoredCast[];
  errors: { folder: string; message: string }[];
}

/** フォルダ名が 1 階層の名前であることを確かめて、キャストのフォルダの絶対パスを返す。 */
export function castDir(root: string, folder: string): string {
  if (!folder || folder !== path.basename(folder) || folder === "." || folder === "..") {
    throw new Error(`キャストのフォルダ名が正しくありません: ${folder}`);
  }
  return path.join(root, folder);
}

/** キャストのフォルダの中のファイルの絶対パス。フォルダの外を指していればエラー。 */
export function castFilePath(root: string, folder: string, relative: string): string {
  const dir = castDir(root, folder);
  const full = path.resolve(dir, relative);
  if (!full.startsWith(dir + path.sep))
    throw new Error(`キャストのフォルダの外は読めません: ${relative}`);
  return full;
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function readCastFile(dir: string): Promise<CastDocument> {
  const text = await fs.readFile(path.join(dir, CAST_FILE), "utf8");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new CastFormatError(`${CAST_FILE} が JSON として読めません。`);
  }
  return normalizeCastDocument(raw);
}

function noticesFor(doc: CastDocument): string[] {
  return doc.formatVersion > CAST_FILE_VERSION
    ? [
        "このキャストは新しい版の Zetter Forge で保存されています。この版にない項目は、保存してもそのまま残ります。",
      ]
    : [];
}

export async function listCasts(root: string): Promise<CastListing> {
  await fs.mkdir(root, { recursive: true });
  const entries = await fs.readdir(root, { withFileTypes: true });
  const results = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const dir = path.join(root, entry.name);
        if (!(await exists(path.join(dir, CAST_FILE)))) return null;
        try {
          const doc = await readCastFile(dir);
          return { cast: { folder: entry.name, doc, notices: noticesFor(doc) } };
        } catch (error) {
          return {
            error: {
              folder: entry.name,
              message: error instanceof Error ? error.message : String(error),
            },
          };
        }
      }),
  );
  const casts: StoredCast[] = [];
  const errors: CastListing["errors"] = [];
  for (const result of results) {
    if (result?.cast) casts.push(result.cast);
    if (result?.error) errors.push(result.error);
  }
  casts.sort((left, right) => right.doc.updatedAt.localeCompare(left.doc.updatedAt));
  return { casts, errors };
}

export async function loadCast(root: string, folder: string): Promise<LoadedCast> {
  const dir = castDir(root, folder);
  if (!(await exists(path.join(dir, CAST_FILE)))) throw castMissing();
  const doc = await readCastFile(dir);
  return { folder, doc, notices: noticesFor(doc), copyLog: await readCopyLog(dir) };
}

async function readCopyLog(dir: string): Promise<CopyLog> {
  try {
    return normalizeCopyLog(JSON.parse(await fs.readFile(path.join(dir, COPY_LOG_FILE), "utf8")));
  } catch {
    // まだコピーしていない（ファイルがない）か、壊れた記録は空から始める
    return {};
  }
}

const copyLogWrites = new Map<string, Promise<void>>();

/**
 * コピーした記録を書く。キャストのフォルダがなければ（新しく作らずに）エラー。
 * 続けてコピーしたときに古い記録で上書きしないよう、同じキャストへの書き込みは順に行う。
 */
export function writeCopyLog(root: string, folder: string, log: CopyLog): Promise<void> {
  const dir = castDir(root, folder);
  const write = async () => {
    if (!(await exists(path.join(dir, CAST_FILE)))) throw castMissing();
    await writeFileAtomic(
      path.join(dir, COPY_LOG_FILE),
      `${JSON.stringify(copyLogFile(log), null, 2)}\n`,
    );
  };
  const previous = copyLogWrites.get(dir) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(write);
  copyLogWrites.set(dir, next);
  void next
    .finally(() => {
      if (copyLogWrites.get(dir) === next) copyLogWrites.delete(dir);
    })
    .catch(() => undefined);
  return next;
}

/** キャストの画像ファイルの絶対パス。images の外やない画像はエラー。 */
export async function castImagePath(root: string, folder: string, file: string): Promise<string> {
  const full = castFilePath(root, folder, file);
  if (!full.startsWith(path.join(castDir(root, folder), IMAGES_DIR) + path.sep))
    throw new Error(`キャストの画像ではありません: ${file}`);
  if (!(await exists(full))) throw new Error("画像のファイルが見つかりません。");
  return full;
}

/** Windows でも使えるフォルダ名にする。 */
export function sanitizeFolderName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*]/gu, "")
    .split("")
    .filter((char) => char.charCodeAt(0) >= 0x20)
    .join("")
    .replace(/[. ]+$/u, "")
    .trim();
  const short = Array.from(cleaned)
    .slice(0, 40)
    .join("")
    .replace(/[. ]+$/u, "");
  return /^(con|prn|aux|nul|com\d|lpt\d)$/iu.test(short) ? `${short}_` : short;
}

async function newFolderName(root: string, doc: CastDocument): Promise<string> {
  const base = `${sanitizeFolderName(doc.name) || "新しいキャスト"}-${doc.id.slice(0, 8)}`;
  const taken = new Set((await fs.readdir(root)).map((name) => name.toLowerCase()));
  let candidate = base;
  for (let suffix = 2; taken.has(candidate.toLowerCase()); suffix += 1)
    candidate = `${base}-${suffix}`;
  return candidate;
}

const DATA_URL_PATTERN = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/u;

function decodeDataUrl(dataUrl: string): { bytes: Buffer; extension: string } {
  const match = DATA_URL_PATTERN.exec(dataUrl);
  if (!match) throw new Error("画像のデータが読めません。");
  const extension = match[1] === "jpeg" ? "jpg" : (match[1] as string);
  return { bytes: Buffer.from(match[2] as string, "base64"), extension };
}

interface ImageSlot {
  kind: ImageKind;
  index?: number;
  get(): CastImage | null;
  set(image: CastImage | null): void;
}

/** キャストが持つ画像をすべて、ファイル名に使う枠の情報とともに並べる。 */
function imageSlots(doc: CastDocument): ImageSlot[] {
  const slots: ImageSlot[] = [
    { kind: "avatar", get: () => doc.avatar, set: (image) => (doc.avatar = image) },
    { kind: "cover", get: () => doc.cover, set: (image) => (doc.cover = image) },
    { kind: "background", get: () => doc.background, set: (image) => (doc.background = image) },
  ];
  doc.gallery.forEach((image, index) => {
    slots.push({
      kind: "gallery",
      index,
      get: () => image,
      set: (next) => {
        if (next) Object.assign(image, next);
      },
    });
  });
  doc.members.forEach((member, index) => {
    slots.push({
      kind: "member",
      index,
      get: () => member.avatar,
      set: (image) => (member.avatar = image),
    });
  });
  doc.recommendedPersonas.forEach((persona, index) => {
    slots.push({
      kind: "persona",
      index,
      get: () => persona.avatar,
      set: (image) => (persona.avatar = image),
    });
  });
  return slots;
}

/** cast.json が参照している画像ファイル（相対パス） */
export function referencedImages(doc: CastDocument): string[] {
  return imageSlots(doc)
    .map((slot) => slot.get()?.file)
    .filter((file): file is string => !!file && !file.startsWith("pending:"));
}

export interface SaveCastInput {
  folder: string | null;
  doc: CastDocument;
  pendingImages: Record<string, string>;
  now?: Date;
}

export async function saveCast(root: string, input: SaveCastInput): Promise<SavedCast> {
  await fs.mkdir(root, { recursive: true });
  const working = normalizeCastDocument(JSON.parse(JSON.stringify(input.doc)), {
    keepPendingImages: true,
  });
  let folder = input.folder;
  if (folder) {
    if (!(await exists(path.join(castDir(root, folder), CAST_FILE)))) throw castMissing();
  } else {
    folder = await newFolderName(root, working);
  }
  const dir = castDir(root, folder);
  const imagesDir = path.join(dir, IMAGES_DIR);
  const historyDir = path.join(dir, HISTORY_DIR);
  await fs.mkdir(imagesDir, { recursive: true });

  // 保存前の画像（dataURL）をファイルにする。名前に中身のハッシュを入れるので、同じ画像は書き直さない。
  // dataURL が届かなかった画像は、最後の正規化で参照ごと外れる。
  const replacedImages: Record<string, CastImage> = {};
  const writes = imageSlots(working).map(async (slot) => {
    const image = slot.get();
    if (!image?.file.startsWith("pending:")) return;
    const dataUrl = input.pendingImages[image.file];
    if (!dataUrl) return;
    const { bytes, extension } = decodeDataUrl(dataUrl);
    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
    const relative = `${IMAGES_DIR}/${imageSlotName(slot.kind, slot.index)}-${hash}.${extension}`;
    const full = path.join(dir, relative);
    if (!(await exists(full))) await writeFileAtomic(full, bytes);
    const saved = { ...image, file: relative, bytes: bytes.length };
    replacedImages[image.file] = {
      file: saved.file,
      width: saved.width,
      height: saved.height,
      bytes: saved.bytes,
    };
    slot.set(saved);
  });
  await Promise.all(writes);
  const doc = normalizeCastDocument(working);

  doc.updatedAt = (input.now ?? new Date()).toISOString();
  const castFile = path.join(dir, CAST_FILE);
  if (await exists(castFile)) {
    const previous = await fs.readFile(castFile, "utf8");
    await fs.mkdir(historyDir, { recursive: true });
    await fs.writeFile(
      path.join(historyDir, `${historyStamp(input.now ?? new Date())}.json`),
      previous,
      "utf8",
    );
  }
  await writeFileAtomic(castFile, `${JSON.stringify(doc, null, 2)}\n`);
  await pruneHistory(historyDir);
  await collectUnusedImages(dir);
  return { folder, doc, notices: noticesFor(doc), replacedImages };
}

function historyStamp(date: Date): string {
  return date.toISOString().replace(/[:.]/gu, "-");
}

let tempCounter = 0;

async function writeFileAtomic(file: string, data: string | Buffer): Promise<void> {
  // 同じファイルを続けて書いても一時ファイルが重ならないよう、通し番号を付ける
  tempCounter += 1;
  const temp = `${file}.${process.pid}.${Date.now()}.${tempCounter}.tmp`;
  await fs.writeFile(temp, data);
  try {
    await fs.rename(temp, file);
  } catch (error) {
    await fs.rm(temp, { force: true });
    throw error;
  }
}

async function pruneHistory(historyDir: string): Promise<void> {
  if (!(await exists(historyDir))) return;
  const files = (await fs.readdir(historyDir)).filter((name) => name.endsWith(".json")).sort();
  const stale = files.slice(0, Math.max(0, files.length - HISTORY_LIMIT));
  await Promise.all(stale.map((name) => fs.rm(path.join(historyDir, name), { force: true })));
}

/** cast.json と残している版のどれからも参照されていない画像を消す。 */
async function collectUnusedImages(dir: string): Promise<void> {
  const used = new Set(referencedImages(await readCastFile(dir)));
  const historyDir = path.join(dir, HISTORY_DIR);
  if (await exists(historyDir)) {
    const names = (await fs.readdir(historyDir)).filter((name) => name.endsWith(".json"));
    const snapshots = await Promise.all(
      names.map(async (name) => {
        try {
          const text = await fs.readFile(path.join(historyDir, name), "utf8");
          return referencedImages(normalizeCastDocument(JSON.parse(text)));
        } catch {
          // 読めない版は画像の参照元として数えない
          return [];
        }
      }),
    );
    for (const file of snapshots.flat()) used.add(file);
  }
  const imagesDir = path.join(dir, IMAGES_DIR);
  const unused = (await fs.readdir(imagesDir)).filter(
    (name) => !name.endsWith(".tmp") && !used.has(`${IMAGES_DIR}/${name}`),
  );
  await Promise.all(unused.map((name) => fs.rm(path.join(imagesDir, name), { force: true })));
}
