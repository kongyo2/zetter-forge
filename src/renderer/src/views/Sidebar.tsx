import type { SidebarVM } from "../app/viewModels";
import { useEmit } from "./chain";
import { Avatar } from "./parts/basics";
import { IconPlus, IconSettings } from "./parts/icons";

/** 保存先のフォルダを選び直す（読めなかったときと、一覧の下に置く） */
function ChooseRootButton() {
  const emit = useEmit();
  return (
    <button
      type="button"
      className="btn btn-plain btn-small"
      onClick={() => emit({ type: "library/choose-root" })}
    >
      保存先を変える
    </button>
  );
}

function Status({ vm }: { vm: NonNullable<SidebarVM["status"]> }) {
  const emit = useEmit();
  switch (vm.kind) {
    case "loading":
      return <p className="note">読み込み中…</p>;
    case "empty":
      return <p className="note">まだキャストがありません。「新しいキャスト」から作れます。</p>;
    case "no-match":
      return <p className="note">「{vm.query}」に合うキャストはありません。</p>;
    case "failed":
      return (
        <div className="library-error" role="alert">
          <p className="note error-note">保存先のフォルダを読めませんでした。</p>
          <p className="note">{vm.message}</p>
          <div className="button-row">
            <button
              type="button"
              className="btn btn-outline btn-small"
              onClick={() => emit({ type: "library/retry" })}
            >
              読み直す
            </button>
            <ChooseRootButton />
          </div>
        </div>
      );
  }
}

export function Sidebar({ vm }: { vm: SidebarVM }) {
  const emit = useEmit();
  return (
    <aside className="sidebar">
      <div className="brand-row">
        <div className="brand">Zetter Forge</div>
        <button
          type="button"
          className="icon-button"
          aria-label="設定"
          title="設定（Ctrl+,）"
          onClick={() => emit({ type: "settings/open" })}
        >
          <IconSettings />
        </button>
      </div>
      <button
        type="button"
        className="btn btn-outline btn-block"
        onClick={() => emit({ type: "library/new" })}
      >
        <IconPlus />
        新しいキャスト
      </button>
      <input
        className="input search"
        type="search"
        value={vm.query}
        placeholder="名前・キャッチコピーで絞り込む"
        aria-label="キャストを絞り込む"
        onChange={(event) => emit({ type: "library/query", value: event.target.value })}
      />
      <nav
        className="cast-list"
        aria-label="保存したキャスト"
        aria-busy={vm.refreshing || undefined}
      >
        {vm.draft ? (
          <div className="cast-item is-current is-new" aria-current="true">
            <span className="avatar avatar-medium is-blank" aria-hidden="true">
              新
            </span>
            <span className="cast-text">
              <span className="cast-title">{vm.draft.title}</span>
              <span className="cast-meta">
                <span>{vm.draft.note}</span>
              </span>
            </span>
          </div>
        ) : null}
        {vm.status ? <Status vm={vm.status} /> : null}
        {vm.items.map((item) => (
          <button
            key={item.folder}
            type="button"
            className={item.current ? "cast-item is-current" : "cast-item"}
            aria-current={item.current || undefined}
            onClick={() => emit({ type: "library/open", folder: item.folder })}
          >
            <Avatar vm={item.avatar} />
            <span className="cast-text">
              <span className="cast-title">
                <span className="cast-title-text">{item.title}</span>
                {item.dirty ? (
                  <span className="dirty-dot" title="保存していない変更があります" />
                ) : null}
              </span>
              <span className="cast-meta">
                {item.sub ? <span>{item.sub}</span> : null}
                <span>{item.mode}</span>
                <span>{item.time}</span>
              </span>
            </span>
          </button>
        ))}
        {vm.errors.map((error) => (
          <p key={error.folder} className="note error-note" title={error.message}>
            読めないフォルダ: {error.folder}
          </p>
        ))}
      </nav>
      <div className="library-foot">
        <span className="library-root" title={vm.root}>
          <span className="library-root-label">保存先</span>
          <span className="library-root-path">{vm.root}</span>
        </span>
        {vm.mcp ? <p className={`mcp-status is-${vm.mcp.tone}`}>{vm.mcp.text}</p> : null}
        <div className="button-row">
          <ChooseRootButton />
          <button
            type="button"
            className="btn btn-plain btn-small"
            onClick={() => emit({ type: "library/open-root" })}
          >
            フォルダを開く
          </button>
        </div>
      </div>
    </aside>
  );
}
