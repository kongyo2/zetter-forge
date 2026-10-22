// MCP サーバー（メインプロセス）から画面の仲介役に頼む操作と、その返事の形。
// 頼みは IPC で画面に届き、画面は利用者の操作と同じできごとを仲介役に渡して、結果を JSON で返す。
// 編集中のキャストは画面が持っているので、書き換えは必ずここを通す。
import type { CastDocument } from "./cast";
import type { JsonObject } from "./json";
import { LIMITS } from "./limits";
import { type CastIssue, settingsUsage, toneUsage, validateCast } from "./validate";

/** 文書の中の場所の 1 区切り。並びの要素は id（文字列）か位置（数） */
type Segment = string | number;

/** 位置（0 から数える）で要素を指す並び。この次の区切りが数字なら、位置として読む */
const INDEXED_LISTS = new Set(["toneExamples", "intro", "tags", "stages"]);

/** "members/<id>/profile" のような書き方を、仲介役の場所（["members", id, "profile"]）にする */
export function parsePath(text: string): Segment[] {
  const parts = text.split("/").filter(Boolean);
  return parts.map((part, index) =>
    index > 0 && INDEXED_LISTS.has(parts[index - 1] as string) && /^\d+$/u.test(part)
      ? Number(part)
      : part,
  );
}

/** 場所を / でつないだ書き方にする（parsePath の逆） */
export function pathText(path: readonly Segment[]): string {
  return path.join("/");
}

/** 書き換えの 1 件。set は文字・数・選択肢、switch はオン・オフ、add・remove・move はリストの操作 */
export interface RemoteEdit {
  action: "set" | "switch" | "add" | "remove" | "move";
  /** 場所（parsePath の書き方） */
  path: string;
  /** set で書く値 */
  value?: string;
  /** switch でオンにするか */
  on?: boolean;
  /** move で動かす向き（-1 は上、1 は下） */
  offset?: -1 | 1;
}

export type RemoteRequest =
  /** 開いているキャスト・進めている処理・出ているダイアログ */
  | { kind: "status" }
  /** 開いているキャストの中身（保存していない変更も含む） */
  | { kind: "read" }
  /** 開いているキャストの「Zetter へ写す」の項目 */
  | { kind: "transfer" }
  | { kind: "open"; folder: string }
  | { kind: "new" }
  | { kind: "edit"; edits: RemoteEdit[] }
  | { kind: "save" }
  /** 確かめのダイアログに答える（choice は選択肢の id か "cancel"） */
  | { kind: "answer"; choice: string };

/** 画面の返事。result・detail は JSON にできる値だけ */
export type RemoteReply =
  | { ok: true; result: JsonObject }
  | { ok: false; error: string; detail?: JsonObject };

/** 編集画面で開いているキャスト */
export interface EditorReport {
  /** ライブラリの中のフォルダ名。まだ一度も保存していなければ null */
  folder: string | null;
  title: string;
  /** new はまだ保存していない、unsaved は保存していない変更がある、saved は保存済み */
  state: "new" | "unsaved" | "saved";
}

/** 確認（Zetter で完成するときに問題になる点）の 1 件。path は parsePath の書き方 */
interface IssueReport {
  level: CastIssue["level"];
  tab: CastIssue["tab"];
  message: string;
  path: string | null;
}

/** キャストの確認と、字数の合計の使い方 */
export function castReport(doc: CastDocument): {
  issues: IssueReport[];
  usage: Record<"settings" | "toneExamples", { used: number; limit: number }>;
} {
  return {
    issues: validateCast(doc).map((issue) => ({
      level: issue.level,
      tab: issue.tab,
      message: issue.message,
      path: issue.path ? pathText(issue.path) : null,
    })),
    usage: {
      settings: { used: settingsUsage(doc).total, limit: LIMITS.settingsTotal },
      toneExamples: { used: toneUsage(doc).total, limit: LIMITS.toneTotal },
    },
  };
}
