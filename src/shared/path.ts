export type Path = readonly (string | number)[];

const INDEXED_LISTS = new Set(["toneExamples", "intro", "tags", "stages"]);

export function pathText(path: Path): string {
  return path.join("/");
}

export function parsePath(text: string): (string | number)[] {
  const parts = text.split("/").filter(Boolean);
  return parts.map((part, index) =>
    index > 0 && INDEXED_LISTS.has(parts[index - 1] as string) && /^\d+$/u.test(part)
      ? Number(part)
      : part,
  );
}

export function samePath(left: Path, right: Path): boolean {
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
}
