// Presenter で共通に使う、描画用の値の作り方。
import type { CastDocument, CastImage } from "@shared/cast";
import { formatCount } from "@shared/text";

import { isPendingImage } from "../session";
import type { AppState, Session } from "../state";
import { type TransferItem, transferItems, transferStatus } from "../transfer";
import { type Path, pathKey, samePath } from "../types";
import type {
  AvatarVM,
  CopyVM,
  CounterVM,
  FocusVM,
  ImageFieldVM,
  TextFieldVM,
  ToggleVM,
} from "../viewModels";

export interface Context {
  state: AppState;
  session: Session;
  doc: CastDocument;
  /** 写す項目（キー → 項目） */
  items: ReadonlyMap<string, TransferItem>;
}

export function makeContext(state: AppState, session: Session): Context {
  const items = new Map(transferItems(session.doc).map((item) => [item.key, item]));
  return { state, session, doc: session.doc, items };
}

export function counter(length: number, max: number, unit = ""): CounterVM {
  return {
    text: `${formatCount(length)}/${formatCount(max)}${unit}`,
    tone: length > max ? "over" : length >= max * 0.9 ? "near" : "normal",
    aside: null,
  };
}

/** Zetter へ写すためのコピーのボタン。写す項目でないか、空ならボタンを出さない */
export function copyVM(ctx: Context, path: Path): CopyVM | null {
  const item = ctx.items.get(pathKey(path));
  if (!item || item.kind === "setting" || item.skip === "empty") return null;
  if (item.kind === "image" && (!ctx.session.folder || isPendingImage(item.image))) return null;
  // Zetter の既定と同じ値でも、欄からはコピーできるようにする
  const status = transferStatus({ ...item, skip: null }, ctx.session.copyLog);
  const what = item.kind === "image" ? "ファイルの場所" : "内容";
  const flash = ctx.session.ui.flash;
  return {
    state: status === "done" ? "done" : status === "changed" ? "changed" : "todo",
    title:
      status === "done"
        ? `コピー済み（もう一度${what}をコピー）`
        : status === "changed"
          ? `コピーしたあとに書き換えました（${what}をコピーし直す）`
          : `Zetter に貼るために${what}をコピー`,
    flash: flash?.key === item.key ? flash.nonce : null,
  };
}

function focusVM(ctx: Context, path: Path): FocusVM | null {
  const focus = ctx.session.ui.focus;
  return focus && samePath(focus.path, path)
    ? { nonce: focus.nonce, selection: focus.selection }
    : null;
}

type TextOptions = Partial<Omit<TextFieldVM, "name" | "label" | "value">> & {
  label: string;
  value: string;
};

/** 文字の欄。scope はまとまりの場所、name はその中での場所 */
export function textField(
  ctx: Context,
  scope: Path,
  name: Path,
  options: TextOptions,
): TextFieldVM {
  const path = [...scope, ...name];
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
    copy: copyVM(ctx, path),
    chips: null,
    focus: focusVM(ctx, path),
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
  const path = [...scope, ...name];
  return {
    name,
    src: imageSrc(ctx.session, image),
    blurred: false,
    meta: image
      ? { size: `${image.width}×${image.height}`, bytes: `${Math.round(image.bytes / 1024)}KB` }
      : null,
    removeLabel: "画像を外す",
    multiple: false,
    copy: copyVM(ctx, path),
    canShowFile: !!image && !!ctx.session.folder && !isPendingImage(image),
    focus: focusVM(ctx, path),
    ...options,
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
