import type { EditorTab } from "@shared/validate";

type Segment = string | number;
export type Path = readonly Segment[];

export interface Selection {
  start: number;
  end: number;
}

export interface PickedFile {
  readonly name: string;
  readonly type: string;
  readonly size: number;
}

export type ViewTab = EditorTab | "transfer";

export const MAIN_CHARACTER = "main";

export const AFFINITY_DEFAULT = "default";

export function samePath(left: Path, right: Path): boolean {
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
}

export function pathKey(path: Path): string {
  return path.join("/");
}
