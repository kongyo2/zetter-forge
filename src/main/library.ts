import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  CAST_FILE_VERSION,
  type CastDocument,
  type CastImage,
  CastFormatError,
  castImage,
  imageSlots,
  isPendingFile,
  isPendingImage,
  normalizeCastDocument,
} from "@shared/cast";
import { type CopyLog, copyLogFile, normalizeCopyLog } from "@shared/copyLog";
import { errorMessage } from "@shared/errors";
import { imageSlotName } from "@shared/images";
import type {
  CastHeader,
  FolderError,
  LoadedCast,
  SaveCastRequest,
  SavedCast,
  StoredCast,
} from "@shared/ipc";

import { exists, readJson, removeAll, writeFileAtomic, writeJson } from "./files";

const CAST_FILE = "cast.json";
const IMAGES_DIR = "images";
const HISTORY_DIR = "history";
const HISTORY_LIMIT = 30;
const COPY_LOG_FILE = "copied.json";

type FromDisk<T> = Omit<T, "imageUrls">;

export const CAST_MISSING = "CAST_MISSING";

export function isCastMissing(error: unknown): error is Error {
  return error instanceof Error && "code" in error && error.code === CAST_MISSING;
}

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
  errors: FolderError[];
}

export function castDir(root: string, folder: string): string {
  if (!folder || folder !== path.basename(folder) || folder === "." || folder === "..") {
    throw new Error(`キャストのフォルダ名が正しくありません: ${folder}`);
  }
  return path.join(root, folder);
}

export function castFilePath(root: string, folder: string, relative: string): string {
  const dir = castDir(root, folder);
  const full = path.resolve(dir, relative);
  if (!full.startsWith(dir + path.sep))
    throw new Error(`キャストのフォルダの外は読めません: ${relative}`);
  return full;
}

function hasCastFile(dir: string): Promise<boolean> {
  return exists(path.join(dir, CAST_FILE));
}

async function requireCastFile(dir: string): Promise<void> {
  if (!(await hasCastFile(dir))) throw castMissing();
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

function stored(folder: string, doc: CastDocument): StoredCast {
  return { folder, doc, notices: noticesFor(doc) };
}

export function summarize({ folder, doc }: StoredCast): CastHeader {
  return {
    folder,
    name: doc.name,
    tagline: doc.tagline,
    mode: doc.mode,
    status: doc.status,
    updatedAt: doc.updatedAt,
  };
}

export async function listCasts(root: string): Promise<CastListing> {
  await fs.mkdir(root, { recursive: true });
  const entries = await fs.readdir(root, { withFileTypes: true });
  const results = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const dir = path.join(root, entry.name);
        if (!(await hasCastFile(dir))) return null;
        try {
          return { cast: stored(entry.name, await readCastFile(dir)) };
        } catch (error) {
          return { error: { folder: entry.name, message: errorMessage(error) } };
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

export async function loadCast(root: string, folder: string): Promise<FromDisk<LoadedCast>> {
  const dir = castDir(root, folder);
  await requireCastFile(dir);
  const doc = await readCastFile(dir);
  return { ...stored(folder, doc), copyLog: await readCopyLog(dir) };
}

async function readCopyLog(dir: string): Promise<CopyLog> {
  try {
    return normalizeCopyLog(await readJson(path.join(dir, COPY_LOG_FILE)));
  } catch {
    return {};
  }
}

const copyLogWrites = new Map<string, Promise<void>>();

export function writeCopyLog(root: string, folder: string, log: CopyLog): Promise<void> {
  const dir = castDir(root, folder);
  const write = async () => {
    await requireCastFile(dir);
    await writeJson(path.join(dir, COPY_LOG_FILE), copyLogFile(log));
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

export async function deleteCast(
  root: string,
  folder: string,
  trash: (dir: string) => Promise<void>,
): Promise<void> {
  const dir = castDir(root, folder);
  await requireCastFile(dir);
  await trash(dir);
}

export async function castImagePath(root: string, folder: string, file: string): Promise<string> {
  const full = castFilePath(root, folder, file);
  if (!full.startsWith(path.join(castDir(root, folder), IMAGES_DIR) + path.sep))
    throw new Error(`キャストの画像ではありません: ${file}`);
  if (!(await exists(full))) throw new Error("画像のファイルが見つかりません。");
  return full;
}

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

export function referencedImages(doc: CastDocument): string[] {
  return imageSlots(doc)
    .map((slot) => slot.get()?.file)
    .filter((file): file is string => !!file && !isPendingFile(file));
}

export interface SaveCastInput extends SaveCastRequest {
  now?: Date;
}

export async function saveCast(root: string, input: SaveCastInput): Promise<FromDisk<SavedCast>> {
  await fs.mkdir(root, { recursive: true });
  const working = normalizeCastDocument(JSON.parse(JSON.stringify(input.doc)), {
    keepPendingImages: true,
  });
  let folder = input.folder;
  if (folder) await requireCastFile(castDir(root, folder));
  else folder = await newFolderName(root, working);
  const dir = castDir(root, folder);
  const imagesDir = path.join(dir, IMAGES_DIR);
  const historyDir = path.join(dir, HISTORY_DIR);
  await fs.mkdir(imagesDir, { recursive: true });

  const replacedImages: Record<string, CastImage> = {};
  const writes = imageSlots(working).map(async (slot) => {
    const image = slot.get();
    if (!image || !isPendingImage(image)) return;
    const dataUrl = input.pendingImages[image.file];
    if (!dataUrl) return;
    const { bytes, extension } = decodeDataUrl(dataUrl);
    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
    const relative = `${IMAGES_DIR}/${imageSlotName(slot.kind, slot.index)}-${hash}.${extension}`;
    const full = path.join(dir, relative);
    if (!(await exists(full))) await writeFileAtomic(full, bytes);
    const saved = { ...image, file: relative, bytes: bytes.length };
    replacedImages[image.file] = castImage(relative, saved);
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
  await writeJson(castFile, doc);
  await pruneHistory(historyDir);
  await collectUnusedImages(dir, imagesDir, historyDir);
  return { ...stored(folder, doc), replacedImages };
}

function historyStamp(date: Date): string {
  return date.toISOString().replace(/[:.]/gu, "-");
}

async function historyFiles(historyDir: string): Promise<string[]> {
  if (!(await exists(historyDir))) return [];
  return (await fs.readdir(historyDir)).filter((name) => name.endsWith(".json"));
}

async function pruneHistory(historyDir: string): Promise<void> {
  const files = (await historyFiles(historyDir)).sort();
  await removeAll(historyDir, files.slice(0, Math.max(0, files.length - HISTORY_LIMIT)));
}

async function collectUnusedImages(
  dir: string,
  imagesDir: string,
  historyDir: string,
): Promise<void> {
  const used = new Set(referencedImages(await readCastFile(dir)));
  const snapshots = await Promise.all(
    (await historyFiles(historyDir)).map(async (name) => {
      try {
        return referencedImages(normalizeCastDocument(await readJson(path.join(historyDir, name))));
      } catch {
        return [];
      }
    }),
  );
  for (const file of snapshots.flat()) used.add(file);
  const unused = (await fs.readdir(imagesDir)).filter(
    (name) => !name.endsWith(".tmp") && !used.has(`${IMAGES_DIR}/${name}`),
  );
  await removeAll(imagesDir, unused);
}
