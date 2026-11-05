import {
  type CastDocument,
  castDisplayTitle,
  castImage,
  createEmptyCast,
  isPendingImage,
} from "@shared/cast";
import { type CopyLog, textHash } from "@shared/copyLog";
import type { CroppedImage } from "@shared/images";
import type { LoadedCast, SavedCast } from "@shared/ipc";
import { LIMITS } from "@shared/limits";
import {
  DEFAULT_MCP_SETTINGS,
  MCP_PORT_MAX,
  MCP_PORT_MIN,
  type McpInfo,
  type McpSettings,
  parsePort,
} from "@shared/mcp";
import { pathText } from "@shared/path";
import type { EditorTab } from "@shared/validate";

import {
  type EditResult,
  applyAdd,
  applyCheck,
  applyCommit,
  applyInput,
  applyInsert,
  applyMove,
  applyRemove,
  imageKindAt,
  isImagePath,
  isRefusal,
  placeImage,
  readImage,
  removalNeedsConfirm,
  removeAffinity,
  removeMemberById,
  trimIntro,
} from "./edits";
import type { Effect } from "./effects";
import type { AppEvent, FieldEvent } from "./events";
import {
  canonicalJson,
  dropSavedImages,
  mapImages,
  savedImageFile,
  usedPendingImages,
} from "./session";
import {
  type AppState,
  type ConfirmDialog,
  type CropDialog,
  type Intent,
  type Session,
  type SessionUi,
  type SettingsDialog,
  type Toast,
  type UndoPoint,
  initialUi,
} from "./state";
import { findTransferItem, nextTransferItem, transferItems } from "./transfer";
import { type CopyMark, MAIN_CHARACTER, type Path, type PickedFile, type Selection } from "./types";

export interface Transition {
  state: AppState;
  effects: Effect[];
}

const TOAST_MS = { info: 3200, error: 7000, undo: 8000 } as const;
const LIBRARY_REFRESH_MS = 3000;
const MAX_TOASTS = 4;

type Task = AppState["task"];

class Step {
  readonly effects: Effect[] = [];

  constructor(
    public state: AppState,
    readonly now: number,
  ) {}

  set(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
  }

  next(): number {
    const value = this.state.seq + 1;
    this.set({ seq: value });
    return value;
  }

  effect(effect: Effect): void {
    this.effects.push(effect);
  }

  closeDialog(): void {
    this.set({ dialog: null });
  }

  finish<K extends Exclude<Task["kind"], "idle">>(
    kind: K,
    token: number,
  ): Extract<Task, { kind: K }> | null {
    const task = this.state.task;
    if (task.kind === "idle" || task.kind !== kind || task.token !== token) return null;
    this.set({ task: { kind: "idle" } });
    return task as Extract<Task, { kind: K }>;
  }

  session(update: (session: Session) => Session): void {
    const current = this.state.session;
    if (current) this.set({ session: update(current) });
  }

  ui(patch: Partial<SessionUi>): void {
    this.session((session) => ({ ...session, ui: { ...session.ui, ...patch } }));
  }

  toast(message: string, tone: Toast["tone"] = "info", undoPoint: UndoPoint | null = null): void {
    const id = this.next();
    const others = this.state.toasts.filter((toast) => toast.message !== message);
    this.set({
      toasts: [...others.slice(-(MAX_TOASTS - 1)), { id, message, tone, undo: undoPoint }],
    });
    this.effect({ type: "toast/expire", id, after: undoPoint ? TOAST_MS.undo : TOAST_MS[tone] });
  }

  focus(path: Path, selection: Selection | null = null): void {
    const nonce = this.next();
    this.ui({ focus: { path, nonce, selection } });
  }
}

const NOT_USER_ACTIONS = new Set<AppEvent["type"]>([
  "app/start",
  "clock",
  "reveal",
  "tab/select",
  "window/focus",
  "library/loaded",
  "library/failed",
  "root/chosen",
  "root/failed",
  "cast/loaded",
  "cast/load-failed",
  "cast/saved",
  "cast/save-failed",
  "cast/deleted",
  "cast/delete-failed",
  "image/read",
  "image/read-failed",
  "image/encoded",
  "image/encode-failed",
  "copy/done",
  "copy/failed",
  "task/failed",
  "toast/expire",
  "mcp/loaded",
  "mcp/load-failed",
  "mcp/saved",
  "mcp/save-failed",
  "notice",
]);

export function arbitrate(state: AppState, event: AppEvent, now: number): Transition {
  const step = new Step(state, now);
  const ui = state.session?.ui;
  if (ui && (ui.focus || ui.flash) && !NOT_USER_ACTIONS.has(event.type))
    step.ui({ focus: null, flash: null });
  handle(step, event);
  return { state: step.state, effects: step.effects };
}

function handle(step: Step, event: AppEvent): void {
  const { state } = step;
  switch (event.type) {
    case "app/start":
      loadLibrary(step);
      loadMcp(step);
      return;
    case "clock":
      step.set({ now: event.now });
      return;
    case "menu":
      if (state.dialog) return;
      if (event.command === "new") request(step, { kind: "new", discard: false });
      else if (event.command === "save") save(step, null);
      else if (event.command === "settings") openSettings(step);
      else copyNext(step);
      return;

    case "library/open":
      request(step, { kind: "open", folder: event.folder, discard: false });
      return;
    case "library/new":
      request(step, { kind: "new", discard: false });
      return;
    case "library/choose-root":
      request(step, { kind: "choose-root", discard: false });
      return;
    case "library/open-root":
      step.effect({ type: "library/open-folder" });
      return;
    case "library/retry":
      loadLibrary(step);
      return;
    case "library/query":
      step.set({ query: event.value });
      return;
    case "library/loaded":
      if (event.token === state.libraryToken)
        step.set({ library: { status: "ready", listing: event.listing } });
      return;
    case "library/failed":
      if (event.token === state.libraryToken) {
        step.set({
          library: { status: "failed", message: event.message, listing: state.library.listing },
        });
      }
      return;
    case "window/focus":
      if (state.library.status !== "loading" && step.now - state.libraryAt >= LIBRARY_REFRESH_MS)
        loadLibrary(step);
      return;
    case "root/chosen":
      if (!step.finish("choosing-root", event.token)) return;
      if (event.listing) {
        step.set({
          library: { status: "ready", listing: event.listing },
          libraryAt: step.now,
          libraryToken: step.next(),
        });
        switchSession(step, null);
      }
      return;
    case "root/failed":
      if (!step.finish("choosing-root", event.token)) return;
      step.toast(`保存先を変えられませんでした: ${event.message}`, "error");
      return;

    case "cast/loaded":
      castLoaded(step, event.token, event.loaded);
      return;
    case "cast/load-failed":
      if (!step.finish("opening", event.token)) return;
      step.toast(`開けませんでした: ${event.message}`, "error");
      loadLibrary(step);
      return;
    case "cast/saved":
      saved(step, event.token, event.saved);
      return;
    case "cast/save-failed":
      saveFailed(step, event.token, event.message, event.missing);
      return;
    case "cast/deleted":
      deleted(step, event.token, event.missing);
      return;
    case "cast/delete-failed":
      if (!step.finish("deleting", event.token)) return;
      step.toast(`削除できませんでした: ${event.message}`, "error");
      return;

    case "editor/save":
      if (!state.dialog) save(step, null);
      return;
    case "editor/delete":
      confirmDelete(step);
      return;
    case "editor/open-folder":
      if (state.session?.folder)
        step.effect({ type: "cast/open-folder", folder: state.session.folder });
      return;
    case "editor/tab":
      step.ui({ tab: event.tab });
      return;
    case "editor/checks":
      step.ui({ checksOpen: event.open });
      return;
    case "editor/jump":
      jump(step, event.tab, event.target);
      return;
    case "editor/character":
      step.ui({ character: event.id });
      return;
    case "editor/subject":
      step.ui({ subject: event.key, stage: 0 });
      return;
    case "editor/stage":
      step.ui({ stage: event.index });
      return;

    case "transfer/next":
      if (!state.dialog) copyNext(step);
      return;
    case "transfer/open-zetter":
      if (state.session) step.effect({ type: "url/open", url: zetterPage(state.session.doc) });
      return;
    case "transfer/reset":
      if (!state.session || state.dialog) return;
      showConfirm(step, {
        title: "コピーの記録を消しますか？",
        message:
          "どの項目をコピーしたかの記録を消して、すべて「まだ」に戻します。キャストの中身は変わりません。",
        choices: [
          { id: "reset", label: "記録を消す", tone: "danger", intent: { kind: "reset-copy-log" } },
        ],
      });
      return;
    case "copy/done":
      copied(step, event);
      return;
    case "copy/failed":
      step.toast(`コピーできませんでした: ${event.message}`, "error");
      return;

    case "dialog/choose": {
      const dialog = state.dialog;
      if (dialog?.kind !== "confirm") return;
      const choice = dialog.choices.find((candidate) => candidate.id === event.choice);
      if (!choice) return;
      step.closeDialog();
      if (choice.intent) perform(step, choice.intent);
      return;
    }
    case "dialog/cancel":
      if (
        state.dialog?.kind === "confirm" ||
        (state.dialog?.kind === "settings" && !state.dialog.busy)
      )
        step.closeDialog();
      return;
    case "image/read":
      withCrop(step, event.token, (dialog) => ({ ...dialog, source: event.source }));
      return;
    case "image/read-failed":
      if (state.dialog?.kind === "crop" && state.dialog.token === event.token)
        skipImage(step, state.dialog, event.message);
      return;
    case "crop/failed":
      if (state.dialog?.kind === "crop") skipImage(step, state.dialog, event.message);
      return;
    case "crop/confirm": {
      const dialog = state.dialog;
      if (dialog?.kind !== "crop" || dialog.busy || !dialog.source) return;
      step.set({ dialog: { ...dialog, busy: true, error: null } });
      step.effect({
        type: "image/encode",
        token: dialog.token,
        canvas: event.canvas,
        image: dialog.image,
      });
      return;
    }
    case "image/encoded":
      encoded(step, event.token, event.image);
      return;
    case "image/encode-failed":
      withCrop(step, event.token, (dialog) => ({ ...dialog, busy: false, error: event.message }));
      return;
    case "crop/cancel":
      if (state.dialog?.kind === "crop") step.closeDialog();
      return;

    case "settings/open":
      openSettings(step);
      return;
    case "settings/change":
      withSettings(step, (dialog) =>
        dialog.busy ? dialog : { ...dialog, ...event.patch, error: null },
      );
      return;
    case "settings/save":
      saveSettings(step);
      return;
    case "settings/copy-url":
      if (state.mcp?.status.state === "running") {
        step.effect({
          type: "clipboard/write",
          text: state.mcp.status.url,
          message: "MCP サーバーの URL をコピーしました。",
        });
      }
      return;
    case "mcp/loaded":
      mcpLoaded(step, event.token, event.info);
      return;
    case "mcp/load-failed":
      if (event.token !== state.mcpToken) return;
      settleSettings(step, event.token, (dialog) => ({
        ...dialog,
        busy: false,
        error: `設定を読めませんでした: ${event.message}`,
      }));
      return;
    case "mcp/saved":
      mcpSaved(step, event.token, event.info);
      return;
    case "mcp/save-failed":
      settleSettings(step, event.token, (dialog) => ({
        ...dialog,
        busy: false,
        error: `保存できませんでした: ${event.message}`,
      }));
      return;
    case "remote/edit":
      fieldEvent(step, event.edit);
      step.ui({ focus: null });
      return;

    case "toast/expire":
      step.set({ toasts: state.toasts.filter((toast) => toast.id !== event.id) });
      return;
    case "toast/undo":
      undo(step, event.id);
      return;
    case "task/failed":
      step.toast(event.message, "error");
      return;
    case "notice":
      step.toast(event.message);
      return;
    case "reveal":
    case "tab/select":
      return;

    default:
      fieldEvent(step, event);
  }
}

function loadLibrary(step: Step): void {
  const token = step.next();
  step.set({
    libraryToken: token,
    libraryAt: step.now,
    library: { status: "loading", listing: step.state.library.listing },
  });
  step.effect({ type: "library/load", token });
}

function newSession(key: number, doc: CastDocument): Session {
  return {
    key,
    folder: null,
    doc,
    savedJson: canonicalJson(doc),
    dirty: false,
    revision: 0,
    imageUrls: {},
    pendingImages: {},
    notices: [],
    copyLog: {},
    ui: initialUi(),
  };
}

function sessionFromLoaded(key: number, loaded: LoadedCast): Session {
  return {
    ...newSession(key, loaded.doc),
    folder: loaded.folder,
    imageUrls: loaded.imageUrls,
    notices: loaded.notices,
    copyLog: loaded.copyLog,
  };
}

function switchSession(step: Step, session: Session | null): void {
  const dialog = step.state.dialog?.kind === "settings" ? step.state.dialog : null;
  step.set({ session, dialog });
}

type LeavingIntent = Extract<Intent, { discard: boolean }>;

function isLeaving(intent: Intent): intent is LeavingIntent {
  return intent.kind === "open" || intent.kind === "new" || intent.kind === "choose-root";
}

function stopOpening(step: Step): void {
  if (step.state.task.kind === "opening") step.set({ task: { kind: "idle" } });
}

function saveOrDiscard(verb: string, then: Intent, discard: Intent): ConfirmDialog["choices"] {
  return [
    { id: "save", label: `保存して${verb}`, tone: "primary", intent: { kind: "save-then", then } },
    { id: "discard", label: `保存しないで${verb}`, tone: "danger", intent: discard },
  ];
}

function mayLeave(state: AppState, intent: LeavingIntent): boolean {
  const session = state.session;
  if (!session || !session.dirty || intent.discard) return true;
  const task = state.task;
  return (
    task.kind === "opening" && task.sessionKey === session.key && task.revision === session.revision
  );
}

function castTitle(state: AppState, folder: string): string {
  const cast = state.library.listing?.casts.find((candidate) => candidate.folder === folder);
  return (cast && castDisplayTitle(cast).title) || folder;
}

function request(step: Step, intent: Intent): void {
  const { state } = step;
  if (state.dialog) return;
  if (state.task.kind === "saving") {
    step.set({ task: { ...state.task, then: intent } });
    return;
  }
  if (!isLeaving(intent)) {
    perform(step, intent);
    return;
  }
  if (state.task.kind === "choosing-root") return;
  if (state.task.kind === "deleting") return;
  if (intent.kind === "open") {
    if (state.session?.folder === intent.folder) {
      stopOpening(step);
      return;
    }
    if (state.task.kind === "opening" && state.task.folder === intent.folder) return;
  }
  if (!mayLeave(state, intent)) {
    stopOpening(step);
    const what =
      intent.kind === "open"
        ? `「${castTitle(state, intent.folder)}」を開く`
        : intent.kind === "new"
          ? "新しいキャストを作る"
          : "保存先を変える";
    const leave = { ...intent, discard: true };
    showConfirm(step, {
      title: "保存していない変更があります",
      message: `${what}前に、いまのキャストを保存しますか？保存しないで続けると、最後に保存したあとの変更は失われます。`,
      choices: saveOrDiscard("続ける", leave, leave),
    });
    return;
  }
  perform(step, intent);
}

function perform(step: Step, intent: Intent): void {
  const { state } = step;
  if (isLeaving(intent) && !mayLeave(state, intent)) return request(step, intent);
  switch (intent.kind) {
    case "open": {
      const token = step.next();
      step.set({
        task: {
          kind: "opening",
          token,
          folder: intent.folder,
          sessionKey: state.session?.key ?? null,
          revision: state.session?.revision ?? null,
        },
      });
      step.effect({ type: "cast/load", token, folder: intent.folder });
      return;
    }
    case "new": {
      const key = step.next();
      stopOpening(step);
      switchSession(step, newSession(key, createEmptyCast(new Date(step.now))));
      return;
    }
    case "choose-root": {
      const token = step.next();
      step.set({ task: { kind: "choosing-root", token } });
      step.effect({ type: "library/choose", token });
      return;
    }
    case "save-then":
      save(step, intent.then);
      return;
    case "save-as-new": {
      const session = state.session;
      if (!session) return;
      const doc = structuredClone(session.doc);
      const dropped = dropSavedImages(doc);
      step.set({
        session: {
          ...session,
          folder: null,
          doc,
          revision: session.revision + 1,
          dirty: true,
          imageUrls: {},
        },
      });
      if (dropped > 0)
        step.toast(
          `元のフォルダにあった画像${dropped}枚は見つからないので外しました。選び直してください。`,
          "error",
        );
      save(step, null);
      return;
    }
    case "adopt":
      switchSession(step, sessionFromLoaded(step.next(), intent.loaded));
      return;
    case "remove-member":
      if (state.session) commit(step, removeMemberById(state.session.doc, intent.id));
      return;
    case "remove-affinity":
      if (state.session) commit(step, removeAffinity(state.session.doc));
      return;
    case "trim-intro":
      if (state.session) commit(step, trimIntro(state.session.doc));
      return;
    case "reset-copy-log":
      updateCopyLog(step, () => ({}));
      return;
    case "delete": {
      if (state.task.kind !== "idle") return;
      const token = step.next();
      step.set({ task: { kind: "deleting", token, folder: intent.folder, title: intent.title } });
      step.effect({ type: "cast/delete", token, folder: intent.folder });
      return;
    }
  }
}

function castLoaded(step: Step, token: number, cast: LoadedCast): void {
  const { state } = step;
  const task = step.finish("opening", token);
  if (!task) return;
  const session = state.session;
  if (
    session &&
    session.key === task.sessionKey &&
    session.revision !== task.revision &&
    session.dirty
  ) {
    showConfirm(step, {
      title: "読み込みのあいだに書き換えた内容があります",
      message: `「${castTitle(state, cast.folder)}」を開く前に、いまのキャストを保存しますか？保存しないで開くと、書き換えた内容は失われます。`,
      choices: saveOrDiscard(
        "開く",
        { kind: "open", folder: cast.folder, discard: true },
        { kind: "adopt", loaded: cast },
      ),
    });
    return;
  }
  switchSession(step, sessionFromLoaded(step.next(), cast));
}

function save(step: Step, then: Intent | null): void {
  const { state } = step;
  const session = state.session;
  if (!session) return;
  const task = state.task;
  if (task.kind === "saving") {
    step.set({ task: { ...task, again: true, then: then ?? task.then } });
    return;
  }
  if (task.kind === "choosing-root" || task.kind === "deleting") return;
  if (session.folder && !session.dirty) {
    if (then) perform(step, then);
    else step.toast("変更はありません。");
    return;
  }
  const next: Intent | null =
    then ??
    (task.kind === "opening" ? { kind: "open", folder: task.folder, discard: false } : null);
  const token = step.next();
  step.set({
    task: {
      kind: "saving",
      token,
      sessionKey: session.key,
      revision: session.revision,
      again: false,
      then: next,
    },
  });
  step.effect({
    type: "cast/save",
    token,
    request: {
      folder: session.folder,
      doc: session.doc,
      pendingImages: usedPendingImages(session.doc, session.pendingImages),
    },
  });
}

function saved(step: Step, token: number, result: SavedCast): void {
  const { state } = step;
  const task = step.finish("saving", token);
  if (!task) {
    loadLibrary(step);
    return;
  }
  const session = state.session;
  if (!session || session.key !== task.sessionKey) {
    loadLibrary(step);
    return;
  }
  const editedWhileSaving = session.revision !== task.revision;
  let doc: CastDocument;
  let pendingImages = session.pendingImages;
  if (!editedWhileSaving) {
    doc = result.doc;
    pendingImages = {};
  } else {
    doc = structuredClone(session.doc);
    mapImages(doc, (image) => {
      const savedImage = result.replacedImages[image.file];
      return savedImage ? { ...image, ...savedImage } : image;
    });
    doc.updatedAt = result.doc.updatedAt;
    pendingImages = Object.fromEntries(
      Object.entries(session.pendingImages).filter(([key]) => !(key in result.replacedImages)),
    );
  }
  const savedJson = canonicalJson(result.doc);
  const firstSave = session.folder !== result.folder;
  step.set({
    session: {
      ...session,
      folder: result.folder,
      doc,
      savedJson,
      dirty: canonicalJson(doc) !== savedJson,
      revision: session.revision + 1,
      imageUrls: result.imageUrls,
      pendingImages,
      notices: result.notices,
    },
  });
  if (firstSave && Object.keys(session.copyLog).length > 0)
    step.effect({ type: "cast/write-copy-log", folder: result.folder, log: session.copyLog });
  step.toast("保存しました。");
  loadLibrary(step);
  const then = task.then && editedWhileSaving ? keepChanges(task.then) : task.then;
  if (task.again && step.state.session?.dirty) save(step, then);
  else if (then) {
    step.closeDialog();
    request(step, then);
  }
}

function keepChanges(intent: Intent): Intent {
  if (isLeaving(intent)) return { ...intent, discard: false };
  if (intent.kind === "save-then") return { ...intent, then: keepChanges(intent.then) };
  return intent;
}

function saveFailed(step: Step, token: number, message: string, missing: boolean): void {
  const { state } = step;
  if (!step.finish("saving", token)) return;
  loadLibrary(step);
  if (missing && state.session?.folder && !state.dialog) {
    showConfirm(step, {
      title: "保存先のフォルダが見つかりません",
      message:
        "このキャストのフォルダが移動または削除されたようです。新しいキャストとして保存すると、書いた内容は残せます（元のフォルダにあった画像は選び直しになります）。",
      choices: [
        {
          id: "save-as-new",
          label: "新しいキャストとして保存",
          tone: "primary",
          intent: { kind: "save-as-new" },
        },
      ],
    });
    return;
  }
  step.toast(`保存できませんでした: ${message}`, "error");
}

function confirmDelete(step: Step): void {
  const { state } = step;
  const session = state.session;
  if (!session?.folder || state.dialog || state.task.kind !== "idle") return;
  const folder = session.folder;
  const title = castTitle(state, folder);
  showConfirm(step, {
    title: `「${title}」を削除しますか？`,
    message: `設定・画像・前の版を、フォルダごとゴミ箱に移します。${session.dirty ? "保存していない変更は失われます。" : ""}`,
    choices: [
      {
        id: "delete",
        label: "ゴミ箱に移す",
        tone: "danger",
        intent: { kind: "delete", folder, title },
      },
    ],
  });
}

function deleted(step: Step, token: number, missing: boolean): void {
  const task = step.finish("deleting", token);
  if (!task) return;
  if (step.state.session?.folder === task.folder) switchSession(step, null);
  const { library } = step.state;
  if (library.listing) {
    const casts = library.listing.casts.filter((cast) => cast.folder !== task.folder);
    step.set({ library: { ...library, listing: { ...library.listing, casts } } });
  }
  step.toast(
    missing
      ? `「${task.title}」のフォルダはもうなかったので、一覧から外しました。`
      : `「${task.title}」をゴミ箱に移しました。`,
  );
  loadLibrary(step);
}

function showConfirm(
  step: Step,
  dialog: Pick<ConfirmDialog, "title" | "message" | "choices"> & { cancelLabel?: string },
): void {
  step.set({
    dialog: { kind: "confirm", id: step.next(), cancelLabel: "キャンセル", ...dialog },
  });
}

function withDoc(session: Session, doc: CastDocument, ui: SessionUi): Session {
  return {
    ...session,
    doc,
    revision: session.revision + 1,
    dirty: canonicalJson(doc) !== session.savedJson,
    ui,
  };
}

function commit(step: Step, result: EditResult): void {
  const session = step.state.session;
  if (!session || !result) return;
  if (isRefusal(result)) {
    step.toast(result.refused, "error");
    return;
  }
  const next = withDoc(session, result.doc, { ...session.ui, ...result.ui });
  const undoPoint: UndoPoint | null = result.removed
    ? {
        sessionKey: session.key,
        revision: next.revision,
        doc: session.doc,
        ui: { ...session.ui, focus: null },
      }
    : null;
  step.set({ session: next });
  if (result.focus) step.focus(result.focus.path, result.focus.selection);
  if (result.removed && undoPoint) step.toast(result.removed, "info", undoPoint);
}

function undo(step: Step, id: number): void {
  const { state } = step;
  const toast = state.toasts.find((candidate) => candidate.id === id);
  step.set({ toasts: state.toasts.filter((candidate) => candidate.id !== id) });
  const point = toast?.undo;
  const session = state.session;
  if (!point || !session) return;
  if (session.key !== point.sessionKey || session.revision !== point.revision) {
    step.toast("そのあとに書き換えたので、元に戻せません。", "error");
    return;
  }
  step.set({ session: withDoc(session, point.doc, { ...point.ui, tab: session.ui.tab }) });
  step.toast("元に戻しました。");
}

function fieldEvent(step: Step, event: FieldEvent): void {
  const { state } = step;
  const session = state.session;
  if (!session || state.dialog) return;
  const doc = session.doc;
  switch (event.type) {
    case "input":
      commit(step, applyInput(doc, event.path, event.value));
      return;
    case "check":
      commit(step, applyCheck(doc, event.path, event.checked));
      return;
    case "insert":
      commit(step, applyInsert(doc, event.path, event.text, event.selection));
      return;
    case "add":
      commit(step, applyAdd(doc, event.path));
      return;
    case "remove": {
      const subject = removalNeedsConfirm(doc, event.path);
      if (subject) confirmRemoval(step, event.path, subject);
      else commit(step, applyRemove(doc, event.path, session.ui));
      return;
    }
    case "move":
      commit(step, applyMove(doc, event.path, event.offset));
      return;
    case "commit":
      commit(step, applyCommit(doc, event.path, session.ui));
      return;
    case "pick":
      startCrop(step, event.path, event.files);
      return;
    case "copy":
      copyField(step, event.path);
      return;
    case "mark":
      mark(step, event.path, event.done);
      return;
    case "show-file":
      showFile(step, event.path);
      return;
    case "open-url":
      openUrl(step, event.path);
      return;
  }
}

function confirmRemoval(step: Step, path: Path, subject: string): void {
  const [head, key] = path;
  if (head === "members" && typeof key === "string") {
    showConfirm(step, {
      title: `${subject}を削除しますか？`,
      message: "この登場人物の設定と、イントロの話者・好感度の個別設定での指定も消えます。",
      choices: [
        {
          id: "remove",
          label: "削除する",
          tone: "danger",
          intent: { kind: "remove-member", id: key },
        },
      ],
    });
  } else if (head === "affinity") {
    showConfirm(step, {
      title: "好感度設定を削除しますか？",
      message: "共通設定と個別設定がすべて消えます。",
      choices: [
        { id: "remove", label: "削除する", tone: "danger", intent: { kind: "remove-affinity" } },
      ],
    });
  } else if (head === "intro") {
    showConfirm(step, {
      title: "2つ目以降のパートを削除しますか？",
      message: "雑談モードでは見えていない、イントロの2つ目以降のパートをまとめて消します。",
      choices: [
        { id: "remove", label: "まとめて削除", tone: "danger", intent: { kind: "trim-intro" } },
      ],
    });
  }
}

function jump(step: Step, tab: EditorTab, path: Path | null): void {
  const patch: Partial<SessionUi> = { tab, checksOpen: false };
  if (path) {
    const [head, key, field, stage] = path;
    if (head === "cast" && tab === "character") patch.character = MAIN_CHARACTER;
    if (head === "members" && typeof key === "string") patch.character = key;
    if (head === "affinity" && typeof key === "string") {
      patch.subject = key;
      patch.stage = field === "stages" && typeof stage === "number" ? stage : 0;
    }
  }
  step.ui(patch);
  if (!path) return;
  const target = path[0] === "affinity" && path.length === 2 ? [...path, "itemName"] : path;
  step.focus(target);
}

function startCrop(step: Step, path: Path, files: readonly PickedFile[]): void {
  const session = step.state.session;
  const image = imageKindAt(path);
  if (!session || !image) return;
  let chosen = [...files];
  if (image === "gallery") {
    const free = LIMITS.gallery - session.doc.gallery.length;
    if (free <= 0) {
      step.toast(`ギャラリー画像は${LIMITS.gallery}枚まで登録できます。`, "error");
      return;
    }
    if (chosen.length > free) {
      step.toast(`ギャラリーはあと${free}枚なので、選んだうち先頭の${free}枚だけを切り抜きます。`);
      chosen = chosen.slice(0, free);
    }
  } else chosen = chosen.slice(0, 1);
  const [first, ...queue] = chosen;
  if (!first) return;
  const token = step.next();
  const dialog: CropDialog = {
    kind: "crop",
    token,
    sessionKey: session.key,
    path,
    image,
    source: null,
    queue,
    index: 1,
    total: chosen.length,
    busy: false,
    error: null,
  };
  step.set({ dialog });
  step.effect({ type: "image/read", token, file: first });
}

function withCrop(step: Step, token: number, update: (dialog: CropDialog) => CropDialog): void {
  const dialog = step.state.dialog;
  if (dialog?.kind === "crop" && dialog.token === token) step.set({ dialog: update(dialog) });
}

function nextImage(step: Step, dialog: CropDialog, error: string | null): void {
  const [file, ...queue] = dialog.queue;
  if (!file) {
    step.closeDialog();
    if (error) step.toast(error, "error");
    return;
  }
  const token = step.next();
  step.set({
    dialog: { ...dialog, token, source: null, queue, index: dialog.index + 1, busy: false, error },
  });
  step.effect({ type: "image/read", token, file });
}

function skipImage(step: Step, dialog: CropDialog, message: string): void {
  const label =
    dialog.total > 1 ? `${dialog.index}枚目の画像を開けませんでした: ` : "画像を開けませんでした: ";
  nextImage(step, dialog, `${label}${message}`);
}

function encoded(step: Step, token: number, image: CroppedImage): void {
  const dialog = step.state.dialog;
  const session = step.state.session;
  if (dialog?.kind !== "crop" || dialog.token !== token) return;
  if (!session || session.key !== dialog.sessionKey) {
    step.closeDialog();
    return;
  }
  const file = `pending:img-${step.next()}`;
  step.set({
    session: { ...session, pendingImages: { ...session.pendingImages, [file]: image.dataUrl } },
  });
  const result = placeImage(session.doc, dialog.path, castImage(file, image));
  commit(step, result);
  if (!result || isRefusal(result)) {
    step.closeDialog();
    return;
  }
  nextImage(step, dialog, null);
}

function loadMcp(step: Step): void {
  const token = step.next();
  step.set({ mcpToken: token });
  step.effect({ type: "mcp/load", token });
}

function settingsForm(settings: McpSettings): Pick<SettingsDialog, "enabled" | "port"> {
  return { enabled: settings.enabled, port: String(settings.port) };
}

function openSettings(step: Step): void {
  const { state } = step;
  if (state.dialog || state.task.kind !== "idle") return;
  loadMcp(step);
  step.set({
    dialog: {
      kind: "settings",
      token: step.state.mcpToken,
      ...settingsForm(state.mcp?.settings ?? DEFAULT_MCP_SETTINGS),
      busy: state.mcp === null,
      error: null,
    },
  });
}

function withSettings(step: Step, update: (dialog: SettingsDialog) => SettingsDialog): void {
  const dialog = step.state.dialog;
  if (dialog?.kind === "settings") step.set({ dialog: update(dialog) });
}

function settleSettings(
  step: Step,
  token: number,
  update: (dialog: SettingsDialog) => SettingsDialog,
): void {
  withSettings(step, (dialog) => (dialog.token === token ? update(dialog) : dialog));
}

function saveSettings(step: Step): void {
  const dialog = step.state.dialog;
  if (dialog?.kind !== "settings" || dialog.busy) return;
  const port = parsePort(dialog.port);
  if (port === null) {
    step.set({
      dialog: {
        ...dialog,
        error: `ポートは ${MCP_PORT_MIN}〜${MCP_PORT_MAX} の数にしてください。`,
      },
    });
    return;
  }
  const token = step.next();
  step.set({ mcpToken: token, dialog: { ...dialog, token, busy: true, error: null } });
  step.effect({ type: "mcp/save", token, settings: { enabled: dialog.enabled, port } });
}

function mcpLoaded(step: Step, token: number, info: McpInfo): void {
  const { state } = step;
  if (token !== state.mcpToken) return;
  step.set({ mcp: info });
  settleSettings(step, token, (dialog) =>
    dialog.busy ? { ...dialog, ...settingsForm(info.settings), busy: false } : dialog,
  );
  if (state.mcp === null && info.status.state === "failed")
    step.toast(`MCP サーバーを起動できませんでした: ${info.status.message}`, "error");
}

function mcpSaved(step: Step, token: number, info: McpInfo): void {
  step.set({ mcp: info });
  settleSettings(step, token, (dialog) => ({
    ...dialog,
    ...settingsForm(info.settings),
    busy: false,
    error: null,
  }));
  step.toast(
    info.status.state === "failed"
      ? "設定を保存しました。MCP サーバーは起動できませんでした。"
      : "設定を保存しました。",
    info.status.state === "failed" ? "error" : "info",
  );
}

function copyRecord(step: Step, hash: string): CopyLog[string] {
  return { hash, at: new Date(step.now).toISOString() };
}

function updateCopyLog(step: Step, update: (log: CopyLog) => CopyLog): void {
  const session = step.state.session;
  if (!session) return;
  const copyLog = update(session.copyLog);
  step.set({ session: { ...session, copyLog } });
  if (session.folder)
    step.effect({ type: "cast/write-copy-log", folder: session.folder, log: copyLog });
}

function copyField(step: Step, path: Path): void {
  const session = step.state.session;
  if (!session) return;
  const item = findTransferItem(session.doc, path);
  if (!item || item.kind === "setting") return;
  if (item.skip === "empty") {
    step.toast(`「${item.label}」は空なので、コピーするものがありません。`);
    return;
  }
  const base: CopyMark = {
    sessionKey: session.key,
    key: item.key,
    hash: textHash(item.value),
    label: item.label,
  };
  if (item.kind === "text") {
    step.effect({ type: "copy/text", ...base, text: item.value });
    return;
  }
  const location = savedImageFile(session.folder, item.image);
  if (!location) {
    step.toast("画像は保存すると、ファイルの場所をコピーできます。", "error");
    return;
  }
  step.effect({ type: "copy/image-path", ...base, ...location });
}

function copied(step: Step, { sessionKey, key, hash, label }: CopyMark): void {
  if (step.state.session?.key !== sessionKey) return;
  updateCopyLog(step, (log) => ({ ...log, [key]: copyRecord(step, hash) }));
  step.ui({ flash: { key, nonce: step.next() } });
  const session = step.state.session;
  const next = session ? nextTransferItem(session.doc, session.copyLog) : null;
  step.toast(
    next
      ? `「${label}」をコピーしました。次は「${next.label}」です。`
      : `「${label}」をコピーしました。`,
  );
}

function copyNext(step: Step): void {
  const session = step.state.session;
  if (!session) return;
  const next = nextTransferItem(session.doc, session.copyLog);
  if (next) {
    copyField(step, next.path);
    return;
  }
  const waiting = transferItems(session.doc).some(
    (item) => item.kind === "image" && !item.skip && isPendingImage(item.image),
  );
  step.toast(
    waiting
      ? "文章はすべてコピーしました。画像は保存すると、ファイルの場所をコピーできます。"
      : "写す項目はすべてコピーしました。",
  );
}

function mark(step: Step, path: Path, done: boolean): void {
  const session = step.state.session;
  if (!session) return;
  const item = findTransferItem(session.doc, path);
  if (!item || item.kind !== "setting") return;
  updateCopyLog(step, (log) => {
    const next = { ...log };
    if (done) next[item.key] = copyRecord(step, textHash(item.value));
    else delete next[item.key];
    return next;
  });
}

function showFile(step: Step, path: Path): void {
  const session = step.state.session;
  if (!session || !isImagePath(path)) return;
  const image = readImage(session.doc, path);
  if (!image) return;
  const location = savedImageFile(session.folder, image);
  if (!location) {
    step.toast("画像は保存すると、フォルダで見られます。", "error");
    return;
  }
  step.effect({ type: "image/show", ...location });
}

function openUrl(step: Step, path: Path): void {
  const session = step.state.session;
  if (!session || pathText(path) !== "cast/zetterUrl") return;
  const url = session.doc.zetterUrl.trim();
  if (!isZetterUrl(url)) {
    step.toast(
      "Zetter のキャストのページの URL（https://z-etter.com/…）を入れてください。",
      "error",
    );
    return;
  }
  step.effect({ type: "url/open", url });
}

export function isZetterUrl(url: string): boolean {
  return /^https:\/\/(z-etter\.com|zetter\.si)\//u.test(url);
}

const ZETTER_TOP = "https://z-etter.com/";

function zetterPage(doc: CastDocument): string {
  const url = doc.zetterUrl.trim();
  return isZetterUrl(url) ? url : ZETTER_TOP;
}
