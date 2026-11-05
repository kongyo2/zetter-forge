import type { CastDocument, CastImage } from "@shared/cast";
import { type Path, pathText, samePath } from "@shared/path";
import { formatCount, utf16Length } from "@shared/text";

import { savedImageFile } from "../session";
import type { AppState, Session } from "../state";
import { type TransferItem, transferItems, transferStatus } from "../transfer";
import type {
  AvatarVM,
  CopyVM,
  CounterVM,
  FocusVM,
  ImageFieldVM,
  MoveVM,
  TextFieldVM,
  ToggleVM,
} from "../viewModels";

export interface Context {
  state: AppState;
  session: Session;
  doc: CastDocument;
  items: ReadonlyMap<string, TransferItem>;
}

export function makeContext(state: AppState, session: Session): Context {
  const items = new Map(transferItems(session.doc).map((item) => [item.key, item]));
  return { state, session, doc: session.doc, items };
}

export function meterTone(length: number, max: number): CounterVM["tone"] {
  return length > max ? "over" : length >= max * 0.9 ? "near" : "normal";
}

export function counter(length: number, max: number, unit = ""): CounterVM {
  return {
    text: `${formatCount(length)}/${formatCount(max)}${unit}`,
    tone: meterTone(length, max),
    aside: null,
  };
}

export function limit(value: string, max: number): Pick<TextFieldVM, "maxLength" | "counter"> {
  return { maxLength: max, counter: counter(utf16Length(value), max) };
}

export function required(
  missing: boolean,
  message: string,
): Pick<TextFieldVM, "required" | "invalid" | "error"> {
  return { required: true, invalid: missing, error: missing ? message : null };
}

export function moveVM(index: number, length: number, removeLabel: string | null): MoveVM {
  return { canUp: index > 0, canDown: index < length - 1, removeLabel };
}

export function flashOf(ctx: Context, key: string): number | null {
  const flash = ctx.session.ui.flash;
  return flash?.key === key ? flash.nonce : null;
}

export function copyVM(ctx: Context, path: Path): CopyVM | null {
  const item = ctx.items.get(pathText(path));
  if (!item || item.kind === "setting" || item.skip === "empty") return null;
  if (item.kind === "image" && !savedImageFile(ctx.session.folder, item.image)) return null;
  const status = transferStatus({ ...item, skip: null }, ctx.session.copyLog);
  const what = item.kind === "image" ? "ファイルの場所" : "内容";
  return {
    state: status === "done" ? "done" : status === "changed" ? "changed" : "todo",
    title:
      status === "done"
        ? `コピー済み（もう一度${what}をコピー）`
        : status === "changed"
          ? `コピーしたあとに書き換えました（${what}をコピーし直す）`
          : `Zetter に貼るために${what}をコピー`,
    flash: flashOf(ctx, item.key),
  };
}

function focusVM(ctx: Context, path: Path): FocusVM | null {
  const focus = ctx.session.ui.focus;
  return focus && samePath(focus.path, path)
    ? { nonce: focus.nonce, selection: focus.selection }
    : null;
}

function fieldLinks(ctx: Context, scope: Path, name: Path) {
  const path = [...scope, ...name];
  return { copy: copyVM(ctx, path), focus: focusVM(ctx, path) };
}

type TextOptions = Partial<Omit<TextFieldVM, "name" | "label" | "value">> & {
  label: string;
  value: string;
};

export function textField(
  ctx: Context,
  scope: Path,
  name: Path,
  options: TextOptions,
): TextFieldVM {
  const { copy, focus } = fieldLinks(ctx, scope, name);
  return {
    name,
    ariaLabel: null,
    labelHidden: false,
    placeholder: "",
    multiline: false,
    rows: 3,
    maxLength: null,
    required: false,
    invalid: false,
    disabled: false,
    plain: false,
    hint: null,
    error: null,
    warning: null,
    counter: null,
    copy,
    chips: null,
    focus,
    commitOnBlur: false,
    numeric: null,
    ...options,
  };
}

export function toggle(
  name: Path,
  label: string,
  checked: boolean,
  description: string | null = null,
): ToggleVM {
  return { name, label, description, checked, disabled: false };
}

export function imageSrc(session: Session, image: CastImage | null | undefined): string | null {
  if (!image) return null;
  return session.pendingImages[image.file] ?? session.imageUrls[image.file] ?? null;
}

export function imageField(
  ctx: Context,
  scope: Path,
  name: Path,
  image: CastImage | null,
  options: Pick<ImageFieldVM, "label" | "shape"> &
    Partial<Pick<ImageFieldVM, "blurred" | "removeLabel">>,
): ImageFieldVM {
  const { copy, focus } = fieldLinks(ctx, scope, name);
  return {
    name,
    src: imageSrc(ctx.session, image),
    blurred: false,
    meta: image
      ? { size: `${image.width}×${image.height}`, bytes: `${Math.round(image.bytes / 1024)}KB` }
      : null,
    removeLabel: "画像を外す",
    multiple: false,
    copy,
    canShowFile: savedImageFile(ctx.session.folder, image) !== null,
    focus,
    ...options,
  };
}

export function castAvatar(ctx: Context): { avatar: ImageFieldVM; blurred: ToggleVM } {
  const { doc } = ctx;
  return {
    avatar: imageField(ctx, ["cast"], ["avatar"], doc.avatar, {
      label: "アイコン",
      shape: "circle",
      blurred: doc.avatarBlurred,
    }),
    blurred: toggle(["avatarBlurred"], "この画像をぼかして表示する", doc.avatarBlurred),
  };
}

export function avatar(
  src: string | null,
  name: string,
  ink: string | null,
  blurred = false,
): AvatarVM {
  return { src, initial: Array.from(name.trim())[0] ?? "？", ink, blurred };
}
