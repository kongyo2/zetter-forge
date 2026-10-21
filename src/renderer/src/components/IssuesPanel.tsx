import type { CastIssue, EditorTab } from "@shared/validate";

export const TAB_LABELS: Record<EditorTab, string> = {
  character: "キャラクター",
  experience: "体験設定",
  affinity: "好感度",
  lorebook: "設定集",
  publish: "見た目・公開",
  memo: "メモ",
};

function IssueList({ issues, onJump }: { issues: CastIssue[]; onJump: (tab: EditorTab) => void }) {
  return (
    <ul>
      {issues.map((issue, index) => (
        <li key={`${issue.tab}-${index}`} className={`issue issue-${issue.level}`}>
          <button type="button" onClick={() => onJump(issue.tab)}>
            <span className="issue-tab">{TAB_LABELS[issue.tab]}</span>
            <span>{issue.message}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function IssuesPanel({
  issues,
  onJump,
}: {
  issues: CastIssue[];
  onJump: (tab: EditorTab) => void;
}) {
  const errors = issues.filter((issue) => issue.level === "error");
  const warnings = issues.filter((issue) => issue.level === "warning");
  const infos = issues.filter((issue) => issue.level === "info");
  return (
    <aside className="issues" aria-label="Zetter で完成するときの確認">
      <h2>Zetter で完成するときの確認</h2>
      {errors.length + warnings.length === 0 ? (
        <p className="note ok-note">
          見つかった問題はありません。この内容は Zetter の作成画面でそのまま完成できます。
        </p>
      ) : (
        <p className="note">
          ローカルの保存はこのままできます。Zetter で「完成」する前に直すもの{errors.length}
          件、Zetter で保存されないもの{warnings.length}件。
        </p>
      )}
      <IssueList issues={[...errors, ...warnings]} onJump={onJump} />
      {infos.length > 0 ? (
        <>
          <h3>Zetter に写すときの注意</h3>
          <IssueList issues={infos} onJump={onJump} />
        </>
      ) : null}
    </aside>
  );
}
