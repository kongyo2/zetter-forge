import type { CastDocument, CastImage } from "@shared/cast";

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
  if (doc.avatar) doc.avatar = map(doc.avatar);
  if (doc.cover) doc.cover = map(doc.cover);
  if (doc.background) doc.background = map(doc.background);
  doc.gallery = doc.gallery.map((image) => ({ ...image, ...map(image) }));
  for (const member of doc.members) if (member.avatar) member.avatar = map(member.avatar);
  for (const persona of doc.recommendedPersonas)
    if (persona.avatar) persona.avatar = map(persona.avatar);
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

export function isPendingImage(image: CastImage | null | undefined): boolean {
  return !!image?.file.startsWith("pending:");
}

export function dropSavedImages(doc: CastDocument): number {
  let dropped = 0;
  const keep = <T extends CastImage>(image: T | null): T | null => {
    if (!image || isPendingImage(image)) return image;
    dropped += 1;
    return null;
  };
  doc.avatar = keep(doc.avatar);
  doc.cover = keep(doc.cover);
  doc.background = keep(doc.background);
  doc.gallery = doc.gallery.filter((image) => keep(image) !== null);
  for (const member of doc.members) member.avatar = keep(member.avatar);
  for (const persona of doc.recommendedPersonas) persona.avatar = keep(persona.avatar);
  return dropped;
}
