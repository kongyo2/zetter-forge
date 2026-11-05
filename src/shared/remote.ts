import type { CastDocument } from "./cast";
import type { JsonObject } from "./json";
import { LIMITS } from "./limits";
import { pathText } from "./path";
import { type CastIssue, settingsUsage, toneUsage, validateCast } from "./validate";

export interface RemoteEdit {
  action: "set" | "switch" | "add" | "remove" | "move";
  path: string;
  value?: string;
  on?: boolean;
  offset?: -1 | 1;
}

export type RemoteRequest =
  | { kind: "status" }
  | { kind: "read" }
  | { kind: "transfer" }
  | { kind: "open"; folder: string }
  | { kind: "new" }
  | { kind: "edit"; edits: RemoteEdit[] }
  | { kind: "save" }
  | { kind: "answer"; choice: string };

export type RemoteReply =
  | { ok: true; result: JsonObject }
  | { ok: false; error: string; detail?: JsonObject };

export interface EditorReport {
  folder: string | null;
  title: string;
  state: "new" | "unsaved" | "saved";
}

interface IssueReport {
  level: CastIssue["level"];
  tab: CastIssue["tab"];
  message: string;
  path: string | null;
}

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
