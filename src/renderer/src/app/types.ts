import type { Path } from "@shared/path";
import type { EditorTab } from "@shared/validate";

export type { Path };

export interface Selection {
  start: number;
  end: number;
}

export interface FocusTarget {
  path: Path;
  selection: Selection | null;
}

export interface CopyMark {
  sessionKey: number;
  key: string;
  hash: string;
  label: string;
}

export interface PickedFile {
  readonly name: string;
  readonly type: string;
  readonly size: number;
}

export type ViewTab = EditorTab | "transfer";

export const MAIN_CHARACTER = "main";

export const AFFINITY_DEFAULT = "default";
