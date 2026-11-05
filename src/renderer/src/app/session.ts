import { type CastDocument, type CastImage, imageSlots, isPendingImage } from "@shared/cast";

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

export function mapImages(doc: CastDocument, map: (image: CastImage) => CastImage): void {
  for (const slot of imageSlots(doc)) {
    const image = slot.get();
    if (image) slot.set(map(image));
  }
}

function imageFiles(doc: CastDocument): string[] {
  const files: string[] = [];
  mapImages(structuredClone(doc), (image) => {
    files.push(image.file);
    return image;
  });
  return files;
}

export function usedPendingImages(
  doc: CastDocument,
  pendingImages: Readonly<Record<string, string>>,
): Record<string, string> {
  const used: Record<string, string> = {};
  for (const file of imageFiles(doc)) {
    const data = pendingImages[file];
    if (data) used[file] = data;
  }
  return used;
}

export function savedImageFile(
  folder: string | null,
  image: CastImage | null | undefined,
): { folder: string; file: string } | null {
  return folder && image && !isPendingImage(image) ? { folder, file: image.file } : null;
}

export function dropSavedImages(doc: CastDocument): number {
  const saved = imageSlots(doc).filter((slot) => {
    const image = slot.get();
    return !!image && !isPendingImage(image);
  });
  doc.gallery = doc.gallery.filter((image) => isPendingImage(image));
  for (const slot of saved) if (slot.kind !== "gallery") slot.set(null);
  return saved.length;
}
