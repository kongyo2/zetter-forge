// 画面全体に描くもの。仲介役の状態から、部品に渡す値（View Model）を作る。
import { castDisplayTitle, sendableMembers } from "@shared/cast";
import { IMAGE_SPECS } from "@shared/images";
import { MCP_PORT_MAX, MCP_PORT_MIN, type McpInfo, parsePort } from "@shared/mcp";
import { type CastIssue, type EditorTab, missingRequired } from "@shared/validate";

import { issuesOf } from "../checks";
import type { AppState, Session, SettingsDialog } from "../state";
import { transferItems, transferStatus } from "../transfer";
import type { ViewTab } from "../types";
import type {
  ChecksVM,
  DialogVM,
  EditorVM,
  IssueVM,
  PanelVM,
  RootVM,
  SettingsDialogVM,
  SidebarVM,
  ToastVM,
} from "../viewModels";
import { presentAffinity } from "./affinity";
import { presentCharacter } from "./character";
import { type Context, avatar, makeContext, toggle } from "./common";
import { presentExperience } from "./experience";
import { presentLorebook, presentMemo, presentPublish } from "./others";
import { presentTransfer } from "./transfer";

const TAB_LABELS: Record<ViewTab, string> = {
  character: "キャラクター",
  experience: "体験設定",
  affinity: "好感度",
  lorebook: "設定集",
  publish: "見た目・公開",
  memo: "メモ",
  transfer: "Zetter へ写す",
};

const TABS: ViewTab[] = [
  "character",
  "experience",
  "affinity",
  "lorebook",
  "publish",
  "memo",
  "transfer",
];

/** 絞り込みでは、全角・半角、大文字・小文字、カタカナ・ひらがなを区別しない */
function fold(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/gu, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

function relativeTime(iso: string, now: number): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "";
  const minutes = Math.round((now - time) / 60000);
  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}日前`;
  return new Date(time).toLocaleDateString("ja-JP");
}

function presentSidebar(state: AppState): SidebarVM {
  const { library, session } = state;
  const listing = library.listing;
  const casts = listing?.casts ?? [];
  const needle = fold(state.query.trim());
  const shown = needle
    ? casts.filter((cast) => fold(`${cast.name}\n${cast.tagline}`).includes(needle))
    : casts;
  const status: SidebarVM["status"] =
    library.status === "failed"
      ? { kind: "failed", message: library.message }
      : !listing
        ? { kind: "loading" }
        : casts.length === 0
          ? { kind: "empty" }
          : shown.length === 0
            ? { kind: "no-match", query: state.query.trim() }
            : null;
  return {
    draft:
      session && session.folder === null
        ? {
            title: "新しいキャスト",
            note: session.dirty ? "まだ保存していません" : "保存すると一覧に並びます",
          }
        : null,
    query: state.query,
    status,
    items: shown.map((cast) => {
      const { title, sub } = castDisplayTitle(cast);
      const current = cast.folder === session?.folder;
      return {
        folder: cast.folder,
        title: title || "名前未設定",
        sub: sub || null,
        mode: cast.mode === "chat" ? "雑談" : "ストーリー",
        time: relativeTime(cast.updatedAt, state.now),
        avatar: avatar(cast.avatarUrl, cast.name, null, cast.avatarBlurred),
        current,
        dirty: current && !!session?.dirty,
      };
    }),
    errors: listing?.errors ?? [],
    root: listing?.root ?? "…",
    refreshing: library.status === "loading" && !!listing,
    mcp: presentMcpLine(state.mcp),
  };
}

/** 一覧の下に出す MCP サーバーの様子。使っていなければ出さない */
function presentMcpLine(info: McpInfo | null): SidebarVM["mcp"] {
  if (!info || info.status.state === "off") return null;
  return info.status.state === "running"
    ? { tone: "running", text: `MCP サーバー: ポート ${info.settings.port} で待ち受け中` }
    : { tone: "failed", text: "MCP サーバーを起動できませんでした" };
}

function presentChecks(issues: CastIssue[], open: boolean): ChecksVM {
  const vms: IssueVM[] = issues.map((issue, index) => ({
    key: `${issue.tab}-${index}`,
    level: issue.level,
    tab: issue.tab,
    tabLabel: TAB_LABELS[issue.tab],
    message: issue.message,
    path: issue.path ?? null,
  }));
  const byLevel = (level: IssueVM["level"]) => vms.filter((issue) => issue.level === level);
  const errors = byLevel("error");
  const warnings = byLevel("warning");
  return {
    open,
    blocking: errors.length + warnings.length,
    ok: errors.length + warnings.length === 0,
    groups: [
      { level: "error" as const, title: "完成する前に直すもの", issues: errors },
      { level: "warning" as const, title: "Zetter で保存されないもの", issues: warnings },
      { level: "info" as const, title: "Zetter に写すときの注意", issues: byLevel("info") },
    ].filter((group) => group.issues.length > 0),
  };
}

function presentPanel(ctx: Context, tab: ViewTab): PanelVM {
  switch (tab) {
    case "character":
      return { tab, vm: presentCharacter(ctx) };
    case "experience":
      return { tab, vm: presentExperience(ctx) };
    case "affinity":
      return { tab, vm: presentAffinity(ctx) };
    case "lorebook":
      return { tab, vm: presentLorebook(ctx) };
    case "publish":
      return { tab, vm: presentPublish(ctx) };
    case "memo":
      return { tab, vm: presentMemo(ctx) };
    case "transfer":
      return { tab, vm: presentTransfer(ctx) };
  }
}

function presentEditor(state: AppState, session: Session): EditorVM {
  const ctx = makeContext(state, session);
  const { doc } = session;
  const issues = issuesOf(doc);
  const missing = missingRequired(doc);
  const { title, sub } = castDisplayTitle(doc);
  const people = 1 + sendableMembers(doc).length;
  const saving = state.task.kind === "saving" && state.task.sessionKey === session.key;
  const deleting = state.task.kind === "deleting" && state.task.folder === session.folder;
  const count = (tab: EditorTab, level: "error" | "warning") =>
    issues.filter((issue) => issue.tab === tab && issue.level === level).length;
  // 一度でも写したキャストでは、まだ写していない・写し直す項目の数を出す
  const logged = Object.keys(session.copyLog).length > 0;
  const remaining = logged
    ? transferItems(doc).filter((item) => {
        const status = transferStatus(item, session.copyLog);
        return status === "todo" || status === "changed";
      }).length
    : 0;
  return {
    key: session.key,
    title: title || "名前未設定のキャスト",
    meta: [
      sub,
      doc.mode === "chat" ? "雑談" : "ストーリー",
      people > 1 ? `登場人物${people}人` : "",
      doc.status === "public" ? "公開する" : "非公開",
    ].filter(Boolean),
    saveState: deleting
      ? { text: "削除中…", tone: "is-busy" }
      : saving
        ? { text: "保存中…", tone: "is-busy" }
        : session.folder === null
          ? { text: "まだ保存していません", tone: "is-new" }
          : session.dirty
            ? { text: "保存していない変更があります", tone: "is-dirty" }
            : { text: "保存済み", tone: "is-saved" },
    saving,
    canOpenFolder: !!session.folder,
    // 保存・読み込みなどのあいだは押せない（押しても始めない）
    deletion: session.folder ? { disabled: state.task.kind !== "idle" } : null,
    notices: session.notices,
    tabs: TABS.map((tab) => {
      const unfilled =
        (tab === "character" && missing.character) || (tab === "experience" && missing.experience);
      const errors = tab === "transfer" ? 0 : count(tab, "error");
      const warnings = tab === "transfer" ? 0 : count(tab, "warning");
      return {
        id: tab,
        label: TAB_LABELS[tab],
        selected: session.ui.tab === tab,
        flag: unfilled ? "未入力" : null,
        count: unfilled
          ? null
          : errors > 0
            ? { value: errors, tone: "error" as const, label: `直すもの${errors}件` }
            : warnings > 0
              ? {
                  value: warnings,
                  tone: "warning" as const,
                  label: `保存されないもの${warnings}件`,
                }
              : tab === "transfer" && remaining > 0
                ? {
                    value: remaining,
                    tone: "info" as const,
                    label: `まだ写していない項目${remaining}件`,
                  }
                : null,
      };
    }),
    tab: session.ui.tab,
    panel: presentPanel(ctx, session.ui.tab),
    checks: presentChecks(issues, session.ui.checksOpen),
  };
}

function presentSettings(state: AppState, dialog: SettingsDialog): SettingsDialogVM {
  const saved = state.mcp;
  const port = parsePort(dialog.port);
  const changed =
    !saved || dialog.enabled !== saved.settings.enabled || port !== saved.settings.port;
  const status: SettingsDialogVM["status"] = !saved
    ? { tone: "loading", text: "読み込み中…", url: null }
    : dialog.busy
      ? { tone: "loading", text: "設定を保存しています…", url: null }
      : saved.status.state === "running"
        ? { tone: "running", text: "動いています", url: saved.status.url }
        : saved.status.state === "failed"
          ? { tone: "failed", text: `起動できませんでした: ${saved.status.message}`, url: null }
          : { tone: "off", text: "止まっています", url: null };
  return {
    kind: "settings",
    enabled: {
      ...toggle(
        ["enabled"],
        "MCP サーバーを使う",
        dialog.enabled,
        "Claude Code や Pi などの AI エージェントから、キャストを読んだり書き換えたり保存したりできるようにします。",
      ),
      disabled: dialog.busy,
    },
    port: {
      value: dialog.port,
      invalid: port === null,
      disabled: dialog.busy,
      hint: `${MCP_PORT_MIN}〜${MCP_PORT_MAX}`,
    },
    status,
    error: dialog.error,
    canApply: !dialog.busy && changed,
    closeLabel: changed ? "キャンセル" : "閉じる",
  };
}

function presentDialog(state: AppState): DialogVM | null {
  const dialog = state.dialog;
  if (!dialog) return null;
  if (dialog.kind === "settings") return presentSettings(state, dialog);
  if (dialog.kind === "confirm") {
    const danger = dialog.choices.every((choice) => choice.tone === "danger");
    return {
      kind: "confirm",
      id: dialog.id,
      title: dialog.title,
      message: dialog.message,
      choices: dialog.choices.map(({ id, label, tone }) => ({ id, label, tone })),
      cancelLabel: dialog.cancelLabel,
      // 消すだけの確かめは「キャンセル」に、保存を勧めるものは「保存して続ける」に置く
      initial: danger ? "cancel" : (dialog.choices[0]?.id ?? "cancel"),
    };
  }
  const spec = IMAGE_SPECS[dialog.image];
  return {
    kind: "crop",
    token: dialog.token,
    title: spec.title,
    spec,
    source: dialog.source,
    progress: dialog.total > 1 ? `${dialog.index} / ${dialog.total}枚目` : null,
    busy: dialog.busy,
    error: dialog.error,
  };
}

function presentToasts(state: AppState): ToastVM[] {
  const session = state.session;
  return state.toasts.map((toast) => ({
    id: toast.id,
    message: toast.message,
    tone: toast.tone,
    undoable:
      !!toast.undo &&
      session?.key === toast.undo.sessionKey &&
      session.revision === toast.undo.revision,
  }));
}

function windowTitle(session: Session | null): string {
  if (!session) return "Zetter Forge";
  const title = castDisplayTitle(session.doc).title || "名前未設定のキャスト";
  // 保存していない変更があれば、名前の前に印を付ける
  return `${session.dirty ? "● " : ""}${title} — Zetter Forge`;
}

export function presentRoot(state: AppState): RootVM {
  const session = state.session;
  return {
    title: windowTitle(session),
    sidebar: presentSidebar(state),
    workspace: session
      ? { kind: "editor", editor: presentEditor(state, session) }
      : { kind: "welcome", hasCasts: (state.library.listing?.casts.length ?? 0) > 0 },
    dialog: presentDialog(state),
    toasts: presentToasts(state),
    preventUnload: !!session?.dirty,
  };
}
