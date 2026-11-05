import type { SidebarVM } from "../app/viewModels";
import { useEmit } from "./chain";
import { CastLine, EmitButton } from "./parts/basics";
import { IconPlus, IconSettings } from "./parts/icons";

function ChooseRootButton() {
  return (
    <EmitButton event={{ type: "library/choose-root" }} className="btn btn-plain btn-small">
      保存先を変える
    </EmitButton>
  );
}

function Status({ vm }: { vm: NonNullable<SidebarVM["status"]> }) {
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
            <EmitButton event={{ type: "library/retry" }} className="btn btn-outline btn-small">
              読み直す
            </EmitButton>
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
        <EmitButton
          event={{ type: "settings/open" }}
          className="icon-button"
          ariaLabel="設定"
          title="設定（Ctrl+,）"
        >
          <IconSettings />
        </EmitButton>
      </div>
      <EmitButton event={{ type: "library/new" }} className="btn btn-outline btn-block">
        <IconPlus />
        新しいキャスト
      </EmitButton>
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
            <CastLine
              vm={item}
              mark={
                item.dirty ? (
                  <span className="dirty-dot" title="保存していない変更があります" />
                ) : null
              }
              details={<span>{item.time}</span>}
            />
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
          <EmitButton event={{ type: "library/open-root" }} className="btn btn-plain btn-small">
            フォルダを開く
          </EmitButton>
        </div>
      </div>
    </aside>
  );
}
