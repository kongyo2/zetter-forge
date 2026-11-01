import type { ImageSpec } from "@shared/images";
import type { EditorTab } from "@shared/validate";

import type { Path, Selection, ViewTab } from "./types";

export interface FocusVM {
  nonce: number;
  selection: Selection | null;
}

export interface CounterVM {
  text: string;
  tone: "normal" | "near" | "over";
  aside: string | null;
}

export interface CopyVM {
  state: "todo" | "done" | "changed";
  title: string;
  flash: number | null;
}

export interface ChipsVM {
  label: string;
  placement: "above" | "below";
  style: "chip" | "button";
  items: { label: string; text: string }[];
}

export type HintPart = string | { code: string };

export interface TextFieldVM {
  name: Path;
  label: string;
  ariaLabel: string | null;
  labelHidden: boolean;
  value: string;
  placeholder: string;
  multiline: boolean;
  rows: number;
  maxLength: number | null;
  required: boolean;
  invalid: boolean;
  disabled: boolean;
  plain: boolean;
  hint: HintPart[] | null;
  error: string | null;
  warning: string | null;
  counter: CounterVM | null;
  copy: CopyVM | null;
  chips: ChipsVM | null;
  focus: FocusVM | null;
  commitOnBlur: boolean;
  numeric: { min: number | null; max: number | null; readOnly: boolean } | null;
}

export interface ToggleVM {
  name: Path;
  label: string;
  description: string | null;
  checked: boolean;
  disabled: boolean;
}

export interface SelectVM {
  name: Path;
  label: string;
  value: string;
  options: { value: string; label: string; group: string | null }[];
}

export interface ImageFieldVM {
  name: Path;
  label: string;
  shape: "circle" | "portrait" | "tall";
  src: string | null;
  blurred: boolean;
  meta: { size: string; bytes: string } | null;
  removeLabel: string;
  multiple: boolean;
  copy: CopyVM | null;
  canShowFile: boolean;
  focus: FocusVM | null;
}

export interface AvatarVM {
  src: string | null;
  initial: string;
  ink: string | null;
  blurred: boolean;
}

export interface MoveVM {
  canUp: boolean;
  canDown: boolean;
  removeLabel: string | null;
}

interface ListVM<Row> {
  scope: Path;
  meta: string;
  rows: Row[];
  canAdd: boolean;
}

export interface TabItemVM<T extends string> {
  id: T;
  domId: string;
  label: string;
  sub: string | null;
  avatar: AvatarVM | null;
  selected: boolean;
}

export interface AllowanceVM {
  title: string;
  tone: "normal" | "near" | "over";
  rows: {
    cells: number;
    width: string;
    fills: {
      key: string;
      left: string;
      width: string;
      ink: string;
      title: string;
      last: boolean;
    }[];
    over: string | null;
    limit: string | null;
  }[];
  meterLabel: string;
  total: string;
  max: string;
  legend: { key: string; label: string; value: string; ink: string; empty: boolean }[];
  rest: { text: string; icon: "error" | "warning" | null };
  note: string | null;
}

export interface ToastVM {
  id: number;
  message: string;
  tone: "info" | "error";
  undoable: boolean;
}

export type DialogVM =
  | {
      kind: "confirm";
      id: number;
      title: string;
      message: string;
      choices: { id: string; label: string; tone: "primary" | "danger" | "plain" }[];
      cancelLabel: string;
      initial: string;
    }
  | {
      kind: "crop";
      token: number;
      title: string;
      spec: ImageSpec;
      source: string | null;
      progress: string | null;
      busy: boolean;
      error: string | null;
    }
  | SettingsDialogVM;

export interface SettingsDialogVM {
  kind: "settings";
  enabled: ToggleVM;
  port: { value: string; invalid: boolean; disabled: boolean; hint: string };
  status: { tone: "off" | "running" | "failed" | "loading"; text: string; url: string | null };
  error: string | null;
  canApply: boolean;
  closeLabel: string;
}

export interface SidebarVM {
  draft: { title: string; note: string } | null;
  query: string;
  status:
    | { kind: "loading" }
    | { kind: "failed"; message: string }
    | { kind: "empty" }
    | { kind: "no-match"; query: string }
    | null;
  items: {
    folder: string;
    title: string;
    sub: string | null;
    mode: string;
    time: string;
    avatar: AvatarVM;
    current: boolean;
    dirty: boolean;
  }[];
  errors: { folder: string; message: string }[];
  root: string;
  refreshing: boolean;
  mcp: { tone: "running" | "failed"; text: string } | null;
}

export interface RootVM {
  title: string;
  sidebar: SidebarVM;
  workspace: { kind: "welcome"; hasCasts: boolean } | { kind: "editor"; editor: EditorVM };
  dialog: DialogVM | null;
  toasts: ToastVM[];
  preventUnload: boolean;
}

export interface IssueVM {
  key: string;
  level: "error" | "warning" | "info";
  tab: EditorTab;
  tabLabel: string;
  message: string;
  path: Path | null;
}

export interface ChecksVM {
  open: boolean;
  blocking: number;
  ok: boolean;
  groups: { level: "error" | "warning" | "info"; title: string; issues: IssueVM[] }[];
}

export interface EditorVM {
  key: number;
  title: string;
  meta: string[];
  saveState: { text: string; tone: "is-busy" | "is-new" | "is-dirty" | "is-saved" };
  saving: boolean;
  canOpenFolder: boolean;
  deletion: { disabled: boolean } | null;
  notices: string[];
  tabs: {
    id: ViewTab;
    label: string;
    selected: boolean;
    flag: string | null;
    count: { value: number; tone: "error" | "warning" | "info"; label: string } | null;
  }[];
  tab: ViewTab;
  panel: PanelVM;
  checks: ChecksVM;
}

export type PanelVM =
  | { tab: "character"; vm: CharacterTabVM }
  | { tab: "experience"; vm: ExperienceTabVM }
  | { tab: "affinity"; vm: AffinityTabVM }
  | { tab: "lorebook"; vm: LorebookTabVM }
  | { tab: "publish"; vm: PublishTabVM }
  | { tab: "memo"; vm: MemoTabVM }
  | { tab: "transfer"; vm: TransferTabVM };

export interface PartnerVM {
  scope: Path;
  counter: CounterVM;
  fields: TextFieldVM[];
}

export type ToneListVM = ListVM<{
  index: number;
  situation: TextFieldVM;
  example: TextFieldVM;
  move: MoveVM;
}>;

export interface CharacterSheetVM {
  scope: Path;
  ink: string;
  removeLabel: string | null;
  avatar: ImageFieldVM;
  name: TextFieldVM;
  avatarBlurred: ToggleVM | null;
  profile: TextFieldVM;
  partner: PartnerVM;
  tones: ToneListVM;
}

export interface CharacterTabVM {
  story: boolean;
  people: string | null;
  allowances: AllowanceVM[];
  scale: string;
  castTabs: { items: TabItemVM<string>[]; canAdd: boolean } | null;
  sheet: CharacterSheetVM;
  labelledBy: string | null;
  leftover: string | null;
}

export interface IntroPartVM {
  index: number;
  speech: boolean;
  ink: string | null;
  role: SelectVM;
  text: TextFieldVM;
  move: MoveVM;
}

export interface PersonaVM {
  id: string;
  index: number;
  avatar: ImageFieldVM;
  name: TextFieldVM;
  tagline: TextFieldVM;
  useViewerName: ToggleVM;
  note: TextFieldVM;
}

interface PlayGuideFieldVM {
  key: string;
  text: TextFieldVM;
  hidden: ToggleVM;
}

export interface PlayGuideVM {
  scope: Path;
  summary: string;
  fields: PlayGuideFieldVM[];
}

export interface ExperienceTabVM {
  scope: Path;
  mode: {
    name: Path;
    options: { value: string; title: string; text: string; selected: boolean }[];
  };
  story: {
    tagline: TextFieldVM;
    situation: TextFieldVM;
    intro: {
      scope: Path;
      meta: string;
      total: CounterVM;
      parts: IntroPartVM[];
      canAdd: boolean;
    };
  } | null;
  chat: { scope: Path; first: TextFieldVM; hidden: string | null } | null;
  playGuide: PlayGuideVM;
  about: TextFieldVM;
  personas: ListVM<PersonaVM>;
}

export interface StageVM {
  index: number;
  open: boolean;
  name: string;
  range: string;
  summary: string;
  filled: string;
  start: TextFieldVM;
  startNote: string | null;
  duplicate: boolean;
  fields: TextFieldVM[];
  canRemove: boolean;
  counter: CounterVM;
}

export interface RulerVM {
  bands: {
    index: number;
    left: string;
    width: string;
    open: boolean;
    label: string;
    from: number;
  }[];
  max: number;
  initial: { left: string; value: number } | null;
  caption: string;
}

export interface AffinityConfigVM {
  itemName: TextFieldVM;
  ranges: TextFieldVM[];
  pace: SelectVM;
  showInChat: ToggleVM;
  disabled: ToggleVM | null;
  error: string | null;
  ruler: RulerVM | null;
  stages: StageVM[];
  canAddStage: boolean;
  stageCount: string;
  canReset: boolean;
}

export interface AffinityTabVM {
  scope: Path;
  notice: string | null;
  setup: null | {
    subjects: TabItemVM<string>[];
    subject: Path;
    sheet:
      | { kind: "inherit" }
      | { kind: "disabled"; disabled: ToggleVM; error: string | null }
      | { kind: "config"; config: AffinityConfigVM };
  };
}

export type LorebookTabVM = ListVM<{
  id: string;
  index: number;
  title: TextFieldVM;
  note: TextFieldVM;
  move: MoveVM;
}>;

export interface GalleryItemVM {
  id: string;
  index: number;
  src: string | null;
  blurred: boolean;
  size: string;
  blur: ToggleVM;
  copy: CopyVM | null;
  canShowFile: boolean;
}

export interface PublishTabVM {
  scope: Path;
  status: ToggleVM;
  cover: ImageFieldVM;
  coverBlurred: ToggleVM;
  preview: {
    src: string | null;
    blurred: boolean;
    title: string;
    sub: string | null;
    hook: string | null;
  };
  chatAvatar: { avatar: ImageFieldVM; blurred: ToggleVM } | null;
  tags: { scope: Path; rows: { index: number; field: TextFieldVM }[]; canAdd: boolean };
  hook: TextFieldVM | null;
  background: ImageFieldVM;
  gallery: { scope: Path; meta: string; items: GalleryItemVM[]; canAdd: boolean };
  visibility: ToggleVM[];
  pageInfo: ToggleVM[];
}

export interface MemoTabVM {
  scope: Path;
  url: TextFieldVM;
  canOpenUrl: boolean;
  memo: TextFieldVM;
  facts: { label: string; value: string }[];
  canOpenFolder: boolean;
}

export interface TransferItemVM {
  key: string;
  path: Path;
  label: string;
  kind: "text" | "image" | "setting";
  preview: string;
  length: string | null;
  status: "skip" | "todo" | "done" | "changed";
  statusLabel: string;
  skipLabel: string | null;
  notes: string[];
  copy: CopyVM | null;
  canShowFile: boolean;
  thumbnail: string | null;
  flash: number | null;
}

export interface TransferTabVM {
  progress: { done: number; total: number; changed: number; text: string };
  openLabel: string;
  next: { label: string } | null;
  groups: {
    title: string;
    tab: EditorTab;
    sections: { title: string; items: TransferItemVM[] }[];
  }[];
  shortcut: string;
}
