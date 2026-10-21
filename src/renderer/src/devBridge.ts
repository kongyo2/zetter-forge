// ブラウザだけで画面を確かめるための代用ブリッジ（開発用。Electron では使われない）。
// 保存先はメモリの中だけで、再読み込みすると消える。
import { type CastDocument, type CastImage, normalizeCastDocument } from "@shared/cast";
import type {
  CastSummary,
  ForgeApi,
  LibraryListing,
  LoadedCast,
  MenuCommand,
  SavedCast,
} from "@shared/ipc";

interface MemoryCast {
  doc: CastDocument;
  files: Record<string, string>;
}

const casts = new Map<string, MemoryCast>();
const listeners = new Set<(command: MenuCommand) => void>();
const ROOT = "（ブラウザのメモリ）";

function imageFiles(doc: CastDocument): string[] {
  return [
    doc.avatar?.file,
    doc.cover?.file,
    doc.background?.file,
    ...doc.gallery.map((image) => image.file),
    ...doc.members.map((member) => member.avatar?.file),
    ...doc.recommendedPersonas.map((persona) => persona.avatar?.file),
  ].filter((file): file is string => !!file);
}

function loaded(folder: string, entry: MemoryCast): LoadedCast {
  const imageUrls = Object.fromEntries(
    imageFiles(entry.doc).map((file) => [file, entry.files[file] ?? ""]),
  );
  return { folder, doc: structuredClone(entry.doc), imageUrls, notices: [] };
}

function listing(): LibraryListing {
  const summaries: CastSummary[] = [...casts.entries()].map(([folder, { doc, files }]) => ({
    folder,
    id: doc.id,
    name: doc.name,
    tagline: doc.tagline,
    mode: doc.mode,
    status: doc.status,
    updatedAt: doc.updatedAt,
    avatarUrl: doc.avatar ? (files[doc.avatar.file] ?? null) : null,
  }));
  summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return { root: ROOT, casts: summaries, errors: [] };
}

const api: ForgeApi = {
  getLibrary: async () => listing(),
  chooseLibraryRoot: async () => null,
  loadCast: async (folder) => {
    const entry = casts.get(folder);
    if (!entry) throw new Error("キャストが見つかりません。");
    return loaded(folder, entry);
  },
  saveCast: async (request): Promise<SavedCast> => {
    const folder =
      request.folder ?? `${request.doc.name || "新しいキャスト"}-${request.doc.id.slice(0, 8)}`;
    const previous = casts.get(folder);
    const files = { ...(previous?.files ?? {}) };
    const replacedImages: SavedCast["replacedImages"] = {};
    const working = structuredClone(request.doc);
    const swap = <T extends CastImage>(image: T | null): T | null => {
      if (!image?.file.startsWith("pending:")) return image;
      const data = request.pendingImages[image.file];
      if (!data) return null;
      const file = `images/${image.file.slice("pending:".length)}.jpg`;
      files[file] = data;
      replacedImages[image.file] = {
        file,
        width: image.width,
        height: image.height,
        bytes: image.bytes,
      };
      return { ...image, file };
    };
    working.avatar = swap(working.avatar);
    working.cover = swap(working.cover);
    working.background = swap(working.background);
    working.gallery = working.gallery.map((image) => swap(image)).filter((image) => image !== null);
    for (const member of working.members) member.avatar = swap(member.avatar);
    for (const persona of working.recommendedPersonas) persona.avatar = swap(persona.avatar);
    const doc = normalizeCastDocument(working);
    doc.updatedAt = new Date().toISOString();
    casts.set(folder, { doc, files });
    return { ...loaded(folder, { doc, files }), replacedImages };
  },
  openCastFolder: async () => undefined,
  openLibraryFolder: async () => undefined,
  onCommand: (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

window.addEventListener("keydown", (event) => {
  if (!(event.ctrlKey || event.metaKey)) return;
  const command: MenuCommand | null = event.key === "s" ? "save" : event.key === "n" ? "new" : null;
  if (!command) return;
  event.preventDefault();
  for (const listener of listeners) listener(command);
});

window.forge = api;
