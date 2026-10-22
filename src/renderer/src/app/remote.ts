// MCP サーバーから届いた頼み（読む・開く・書き換える・保存する…）を、仲介役へのできごとにして行い、
// 結果を返事にまとめる。利用者が画面で操作するのと同じ決まりで進むので、画面にもそのまま出る。
// 開く・保存するのように外とのやり取りを待つものは、仲介役の処理が落ち着く（終わるか、確かめの
// ダイアログが出る）まで待つ。
import { type CastDocument, type CastMember, castDisplayTitle } from "@shared/cast";
import type { JsonObject } from "@shared/json";
import {
  type EditorReport,
  type RemoteEdit,
  type RemoteReply,
  type RemoteRequest,
  castReport,
  parsePath,
  pathText,
} from "@shared/remote";

import { introRoleValue } from "./edits";
import type { AppEvent, FieldEvent } from "./events";
import type { Mediator } from "./mediator";
import type { AppState, Session } from "./state";
import { transferGroups, transferStatus } from "./transfer";
import { AFFINITY_DEFAULT, type Path } from "./types";

/** 開く・保存するなどが落ち着くまで待つ長さ（MCP サーバーの側は 30 秒で打ち切る） */
const SETTLE_MS = 20_000;

const DIALOG_NOTE =
  "確かめのダイアログが出ています。answer_dialog で答えてください（利用者が画面で答えることもできます）。";

const IGNORED =
  "この場所では、この操作はできません。場所の書き方（edit_cast の説明）と、上限・モード（雑談モードでは登場人物を足せないなど）を確かめてください。";

export interface RemoteOptions {
  /** ms ミリ秒後に task を行う（待ちの打ち切りに使う） */
  schedule(ms: number, task: () => void): void;
  /** 落ち着くまで待つ長さ */
  settleMs?: number;
}

interface Message {
  tone: "info" | "error";
  text: string;
}

function ok(result: JsonObject): RemoteReply {
  return { ok: true, result };
}

function fail(error: string, detail?: JsonObject): RemoteReply {
  return detail ? { ok: false, error, detail } : { ok: false, error };
}

function saveState(session: Session): EditorReport["state"] {
  return session.folder === null ? "new" : session.dirty ? "unsaved" : "saved";
}

function editorReport(state: AppState): EditorReport | null {
  const session = state.session;
  if (!session) return null;
  return {
    folder: session.folder,
    title: castDisplayTitle(session.doc).title || "名前未設定のキャスト",
    state: saveState(session),
  };
}

function dialogReport(state: AppState): JsonObject | null {
  const dialog = state.dialog;
  if (!dialog) return null;
  if (dialog.kind === "confirm") {
    return {
      kind: "confirm",
      title: dialog.title,
      message: dialog.message,
      choices: dialog.choices.map(({ id, label }) => ({ id, label })),
      cancel: dialog.cancelLabel,
    };
  }
  return { kind: dialog.kind, title: dialog.kind === "crop" ? "画像の切り抜き" : "設定" };
}

/** mark（AppState.seq）のあとに出た知らせ */
function messagesSince(state: AppState, mark: number): Message[] {
  return state.toasts
    .filter((toast) => toast.id > mark)
    .map(({ tone, message }) => ({ tone, text: message }));
}

function statusReport(state: AppState): JsonObject {
  return {
    root: state.library.listing?.root ?? null,
    editor: editorReport(state),
    busy: state.task.kind === "idle" ? null : state.task.kind,
    dialog: dialogReport(state),
    messages: messagesSince(state, 0),
  };
}

/** 頼まれた操作を、いま始められないわけ。始められるなら null */
function blocked(state: AppState, needsCast: boolean): string | null {
  switch (state.dialog?.kind) {
    case "confirm":
      return "確かめのダイアログが出ています。answer_dialog で答えてから続けてください。";
    case "crop":
      return "画像を切り抜く画面が開いています。利用者が閉じるまで待ってください。";
    case "settings":
      return "設定の画面が開いています。利用者が閉じるまで待ってください。";
    default:
      break;
  }
  if (state.task.kind === "choosing-root")
    return "保存先のフォルダを選ぶ画面が開いています。利用者が閉じるまで待ってください。";
  if (needsCast && !state.session)
    return "開いているキャストはありません。open_cast か new_cast で開いてください。";
  return null;
}

/** 書き換えの 1 件を、画面の部品が出すのと同じできごとにする。できなければ、そのわけ */
function fieldEventOf(edit: RemoteEdit, path: Path): FieldEvent | string {
  if (path.length === 0) return "path が空です。";
  switch (edit.action) {
    case "set":
      return typeof edit.value === "string"
        ? { type: "input", path, value: edit.value }
        : "set には value が要ります。";
    case "switch":
      return typeof edit.on === "boolean"
        ? { type: "check", path, checked: edit.on }
        : "switch には on（true か false）が要ります。";
    case "add":
      return { type: "add", path };
    case "remove":
      return { type: "remove", path };
    case "move":
      return edit.offset === -1 || edit.offset === 1
        ? { type: "move", path, offset: edit.offset }
        : "move には offset（-1 か 1）が要ります。";
    default:
      return `action「${String(edit.action)}」は使えません。`;
  }
}

function textOf(record: object, key: unknown): string | null {
  const value = (record as Record<string, unknown>)[String(key)];
  return typeof value === "string" ? value : null;
}

/** set で書いた場所に、いま入っている値（edits.ts の applyInput の読み取り版）。読めなければ null */
function storedValue(doc: CastDocument, path: Path): string | null {
  const [head, key, field, at, stageField] = path;
  if (head === "cast" && path.length === 2) return textOf(doc, key);
  if (head === "cast" || head === "members") {
    const owner = head === "cast" ? doc : doc.members.find((member) => member.id === key);
    const [name, sub, part] = path.slice(head === "cast" ? 1 : 2);
    if (!owner || name === undefined) return null;
    if (head === "members" && sub === undefined) return textOf(owner as CastMember, name);
    if (name === "partnerSettings" && part === undefined) return textOf(owner.partnerSettings, sub);
    if (name === "toneExamples" && typeof sub === "number" && part !== undefined) {
      const tone = owner.toneExamples[sub];
      return tone ? textOf(tone, part) : null;
    }
    return null;
  }
  if (head === "intro") {
    const part =
      key === "first"
        ? doc.introScript[0]
        : typeof key === "number"
          ? doc.introScript[key]
          : undefined;
    if (!part) return null;
    return field === "role" ? introRoleValue(part) : field === "text" ? part.text : null;
  }
  if (head === "personas" || head === "lorebooks") {
    const items = head === "personas" ? doc.recommendedPersonas : doc.lorebooks;
    const item = items.find((candidate) => candidate.id === key);
    return item ? textOf(item, field) : null;
  }
  if (head === "tags" && typeof key === "number") return doc.tags[key] ?? null;
  if (head === "affinity" && typeof key === "string") {
    const config = key === AFFINITY_DEFAULT ? doc.affinity?.default : doc.affinity?.overrides[key];
    if (!config) return null;
    if (field === "minValue" || field === "maxValue" || field === "initialValue")
      return config[field] === null ? "" : String(config[field]);
    if (path.length === 3) return textOf(config, field);
    const stage = field === "stages" && typeof at === "number" ? config.stages[at] : undefined;
    return stage ? textOf(stage, stageField) : null;
  }
  return null;
}

/** add で足したものの場所（edits.ts の applyAdd が足す先の読み取り版） */
function addedPath(doc: CastDocument, path: Path): string | null {
  const [head, key, field] = path;
  const last = (items: readonly unknown[]) => `${pathText(path)}/${items.length - 1}`;
  const lastId = (items: readonly { id: string }[]) => {
    const item = items.at(-1);
    return item ? `${pathText(path)}/${item.id}` : null;
  };
  if (path.at(-1) === "toneExamples") {
    const owner = head === "cast" ? doc : doc.members.find((member) => member.id === key);
    return owner ? last(owner.toneExamples) : null;
  }
  switch (head) {
    case "members":
      return lastId(doc.members);
    case "personas":
      return lastId(doc.recommendedPersonas);
    case "lorebooks":
      return lastId(doc.lorebooks);
    case "intro":
      return last(doc.introScript);
    case "tags":
      return last(doc.tags);
    case "affinity": {
      if (path.length === 1) return `affinity/${AFFINITY_DEFAULT}`;
      if (path.length === 2) return pathText(path);
      const config =
        key === AFFINITY_DEFAULT ? doc.affinity?.default : doc.affinity?.overrides[String(key)];
      return field === "stages" && config ? last(config.stages) : null;
    }
    default:
      return null;
  }
}

/** 書き換えたあとに、返事に添えること（足した場所、書いた値と違う値になったこと） */
function appliedDetail(edit: RemoteEdit, path: Path, doc: CastDocument): JsonObject {
  if (edit.action === "add") {
    const added = addedPath(doc, path);
    return added ? { added } : {};
  }
  // 好感度の段階の開始値は、書いたあとで並べ直すので、同じ場所を読んでも比べられない
  if (edit.action !== "set" || path.at(-1) === "startValue") return {};
  const stored = storedValue(doc, path);
  return stored !== null && stored !== edit.value
    ? {
        stored,
        note: "書いた値と違う値になりました（上限に合わせて切り詰めた、数として読めなかった など）。",
      }
    : {};
}

export class Remote {
  constructor(
    private readonly mediator: Mediator,
    private readonly options: RemoteOptions,
  ) {}

  /** MCP サーバーからの頼みを 1 つ受け持つ */
  readonly handle = async (request: RemoteRequest): Promise<RemoteReply> => {
    try {
      return await this.run(request);
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  };

  private state(): AppState {
    return this.mediator.getState();
  }

  private run(request: RemoteRequest): Promise<RemoteReply> | RemoteReply {
    switch (request.kind) {
      case "status":
        return ok(statusReport(this.state()));
      case "read":
        return this.read();
      case "transfer":
        return this.transfer();
      case "open":
        return this.open(request.folder);
      case "new":
        return this.create();
      case "edit":
        return this.edit(request.edits);
      case "save":
        return this.save();
      case "answer":
        return this.answer(request.choice);
      default:
        return fail("知らない頼みです。");
    }
  }

  private read(): RemoteReply {
    const session = this.state().session;
    if (!session) return fail("開いているキャストはありません。");
    return ok({
      source: "editor",
      folder: session.folder,
      state: saveState(session),
      cast: session.doc,
      notices: session.notices,
      ...castReport(session.doc),
    });
  }

  private transfer(): RemoteReply {
    const session = this.state().session;
    if (!session) return fail("開いているキャストはありません。");
    return ok({
      folder: session.folder,
      state: saveState(session),
      groups: transferGroups(session.doc).map((group) => ({
        title: group.title,
        items: group.items.map((item) => ({
          path: item.key,
          section: item.section,
          label: item.label,
          kind: item.kind,
          value: item.value,
          status: transferStatus(item, session.copyLog),
          notes: item.notes,
        })),
      })),
    });
  }

  private refuse(state: AppState, reason: string): RemoteReply {
    return fail(reason, statusReport(state));
  }

  private open(folder: string): Promise<RemoteReply> | RemoteReply {
    const state = this.state();
    const reason = blocked(state, false);
    if (reason) return this.refuse(state, reason);
    if (state.session?.folder === folder) return ok({ done: true, ...statusReport(state) });
    return this.perform(
      { type: "library/open", folder },
      (next) => next.session?.folder === folder,
      `「${folder}」を開けませんでした。`,
    );
  }

  private create(): Promise<RemoteReply> | RemoteReply {
    const state = this.state();
    const reason = blocked(state, false);
    if (reason) return this.refuse(state, reason);
    const before = state.session?.key ?? null;
    return this.perform(
      { type: "library/new" },
      (next) => !!next.session && next.session.key !== before && next.session.folder === null,
      "新しいキャストを作れませんでした。",
    );
  }

  private save(): Promise<RemoteReply> | RemoteReply {
    const state = this.state();
    const reason = blocked(state, true);
    if (reason) return this.refuse(state, reason);
    return this.perform(
      { type: "editor/save" },
      (next) => !!next.session?.folder && !next.session.dirty,
      "保存できませんでした。",
    );
  }

  private answer(choice: string): Promise<RemoteReply> | RemoteReply {
    const state = this.state();
    const dialog = state.dialog;
    if (dialog?.kind !== "confirm") {
      return this.refuse(
        state,
        dialog
          ? "出ているのは利用者が操作する画面なので、答えられません。"
          : "答える確かめのダイアログは出ていません。",
      );
    }
    if (choice !== "cancel" && !dialog.choices.some((candidate) => candidate.id === choice)) {
      const ids = [...dialog.choices.map((candidate) => candidate.id), "cancel"];
      return fail(`choice は ${ids.join("・")} のどれかにしてください。`, {
        dialog: dialogReport(state),
      });
    }
    return this.perform(
      choice === "cancel" ? { type: "dialog/cancel" } : { type: "dialog/choose", choice },
      (next) => next.dialog === null,
      "答えたあとの操作ができませんでした。",
    );
  }

  /** できごとを渡して、落ち着いたら結果をまとめる。succeeded はうまくいったかの見分け方 */
  private async perform(
    event: AppEvent,
    succeeded: (state: AppState) => boolean,
    failure: string,
  ): Promise<RemoteReply> {
    const mark = this.state().seq;
    this.mediator.dispatch(event);
    const settled = await this.settle();
    const state = this.state();
    const report = { ...statusReport(state), messages: messagesSince(state, mark) };
    if (settled && state.task.kind === "idle" && succeeded(state))
      return ok({ done: true, ...report });
    if (state.dialog?.kind === "confirm") return ok({ done: false, note: DIALOG_NOTE, ...report });
    if (!settled) return fail("まだ終わっていません。get_status で様子を見てください。", report);
    const errors = report.messages.filter((message) => message.tone === "error");
    return fail(errors.map((message) => message.text).join("\n") || failure, report);
  }

  /** 処理が終わるか、ダイアログが出るまで待つ。待ちきれなければ false */
  private settle(): Promise<boolean> {
    return new Promise((resolve) => {
      let waiting = true;
      const finish = (settled: boolean) => {
        if (!waiting) return;
        waiting = false;
        unsubscribe();
        resolve(settled);
      };
      const check = () => {
        const state = this.state();
        if (state.task.kind === "idle" || state.dialog !== null) finish(true);
      };
      const unsubscribe = this.mediator.subscribe(check);
      this.options.schedule(this.options.settleMs ?? SETTLE_MS, () => finish(false));
      check();
    });
  }

  private edit(edits: readonly RemoteEdit[]): RemoteReply {
    const start = this.state();
    const reason = blocked(start, true);
    if (reason) return this.refuse(start, reason);
    const results: JsonObject[] = [];
    let stopped = false;
    for (const edit of edits) {
      const base = { action: edit.action, path: edit.path };
      if (stopped) {
        results.push({ ...base, result: "skipped" });
        continue;
      }
      const path = parsePath(edit.path);
      const event = fieldEventOf(edit, path);
      if (typeof event === "string") {
        results.push({ ...base, result: "ignored", reason: event });
        continue;
      }
      const before = this.state();
      const revision = before.session?.revision;
      this.mediator.dispatch({ type: "remote/edit", edit: event });
      // 好感度の段階の開始値は、欄を離れたときと同じく、書いたあとで小さい順に並べ直す
      if (
        event.type === "input" &&
        path.at(-1) === "startValue" &&
        this.state().session?.revision !== revision
      )
        this.mediator.dispatch({ type: "remote/edit", edit: { type: "commit", path } });
      const after = this.state();
      if (after.dialog?.kind === "confirm") {
        results.push({ ...base, result: "confirm", dialog: dialogReport(after) });
        stopped = true;
        continue;
      }
      if (after.session && after.session.revision !== revision) {
        results.push({
          ...base,
          result: "applied",
          ...appliedDetail(edit, path, after.session.doc),
        });
        continue;
      }
      const refusals = messagesSince(after, before.seq).filter(
        (message) => message.tone === "error",
      );
      results.push(
        refusals.length > 0
          ? {
              ...base,
              result: "refused",
              reason: refusals.map((message) => message.text).join("\n"),
            }
          : { ...base, result: "ignored", reason: IGNORED },
      );
    }
    const state = this.state();
    return ok({
      results,
      editor: editorReport(state),
      ...(stopped ? { dialog: dialogReport(state), note: DIALOG_NOTE } : {}),
      issues: state.session ? castReport(state.session.doc).issues : [],
    });
  }
}
