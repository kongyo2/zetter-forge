import type { CastIssue, EditorTab } from "@shared/validate";
import type { ReactNode } from "react";

import { IconCheck, IconError, IconInfo, IconRemove, IconWarning } from "./icons";

export const TAB_LABELS: Record<EditorTab, string> = {
  character: "キャラクター",
  experience: "体験設定",
  affinity: "好感度",
  lorebook: "設定集",
  publish: "見た目・公開",
  memo: "メモ",
};

const LEVEL_ICONS: Record<CastIssue["level"], ReactNode> = {
  error: <IconError />,
  warning: <IconWarning />,
  info: <IconInfo />,
};

function IssueGroup({
  title,
  level,
  issues,
  onJump,
}: {
  title: string;
  level: CastIssue["level"];
  issues: CastIssue[];
  onJump: (tab: EditorTab) => void;
}) {
  if (issues.length === 0) return null;
  return (
    <section className={`issue-group is-${level}`}>
      <h3>
        {title}
        <span className="issue-count">{issues.length}</span>
      </h3>
      <ul>
        {issues.map((issue, index) => (
          <li key={`${issue.tab}-${index}`}>
            <button type="button" className="issue" onClick={() => onJump(issue.tab)}>
              <span className="issue-icon">{LEVEL_ICONS[level]}</span>
              <span className="issue-text">
                <span className="issue-tab">{TAB_LABELS[issue.tab]}</span>
                <span>{issue.message}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function IssuesPanel({
  id,
  issues,
  onJump,
  onClose,
}: {
  id: string;
  issues: CastIssue[];
  onJump: (tab: EditorTab) => void;
  /** 画面が狭くて重ねて出しているときに閉じる */
  onClose: () => void;
}) {
  const errors = issues.filter((issue) => issue.level === "error");
  const warnings = issues.filter((issue) => issue.level === "warning");
  const infos = issues.filter((issue) => issue.level === "info");
  return (
    <aside className="issues" id={id} aria-label="Zetter で完成するときの確認">
      <div className="issues-head">
        <h2>Zetter で完成するときの確認</h2>
        <button
          type="button"
          className="icon-button issues-close"
          aria-label="確認を閉じる"
          title="閉じる"
          onClick={onClose}
        >
          <IconRemove />
        </button>
      </div>
      {errors.length + warnings.length === 0 ? (
        <p className="issues-ok">
          <IconCheck />
          <span>
            見つかった問題はありません。この内容は Zetter の作成画面でそのまま完成できます。
          </span>
        </p>
      ) : (
        <p className="note">ローカルの保存は、このままでもできます。</p>
      )}
      <IssueGroup title="完成する前に直すもの" level="error" issues={errors} onJump={onJump} />
      <IssueGroup
        title="Zetter で保存されないもの"
        level="warning"
        issues={warnings}
        onJump={onJump}
      />
      <IssueGroup title="Zetter に写すときの注意" level="info" issues={infos} onJump={onJump} />
    </aside>
  );
}
