// 確認（Zetter で完成するときに問題になる点）。同じ文書なら一度だけ数える。
import type { CastDocument } from "@shared/cast";
import { type CastIssue, validateCast } from "@shared/validate";

const cache = new WeakMap<CastDocument, CastIssue[]>();

export function issuesOf(doc: CastDocument): CastIssue[] {
  let issues = cache.get(doc);
  if (!issues) {
    issues = validateCast(doc);
    cache.set(doc, issues);
  }
  return issues;
}
