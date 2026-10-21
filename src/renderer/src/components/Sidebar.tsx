import { castDisplayTitle } from "@shared/cast";
import type { LibraryListing } from "@shared/ipc";
import { useMemo, useState } from "react";

function relativeTime(iso: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "";
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}日前`;
  return new Date(time).toLocaleDateString("ja-JP");
}

export function Sidebar({
  library,
  currentFolder,
  newCastOpen,
  dirty,
  onOpen,
  onNew,
  onChooseRoot,
  onOpenRoot,
}: {
  library: LibraryListing | null;
  currentFolder: string | null;
  newCastOpen: boolean;
  dirty: boolean;
  onOpen: (folder: string) => void;
  onNew: () => void;
  onChooseRoot: () => void;
  onOpenRoot: () => void;
}) {
  const [query, setQuery] = useState("");
  const casts = useMemo(() => {
    const items = library?.casts ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((cast) => `${cast.name}\n${cast.tagline}`.toLowerCase().includes(needle));
  }, [library, query]);

  return (
    <aside className="sidebar">
      <div className="brand">
        <strong>Zetter Forge</strong>
        <span>キャスト設定の保管庫</span>
      </div>
      <button type="button" className="btn btn-primary btn-block" onClick={onNew}>
        新しいキャスト
      </button>
      {newCastOpen ? (
        <div className="cast-item is-current is-new">
          <span className="cast-avatar">新</span>
          <span className="cast-text">
            <strong>新しいキャスト</strong>
            <small>{dirty ? "まだ保存していません" : "書きはじめると保存できます"}</small>
          </span>
        </div>
      ) : null}
      <input
        className="input search"
        type="search"
        value={query}
        placeholder="名前・キャッチコピーで絞り込む"
        aria-label="キャストを絞り込む"
        onChange={(event) => setQuery(event.target.value)}
      />
      <nav className="cast-list" aria-label="保存したキャスト">
        {library === null ? <p className="note">読み込み中…</p> : null}
        {library && library.casts.length === 0 ? (
          <p className="note">まだキャストがありません。「新しいキャスト」から作れます。</p>
        ) : null}
        {casts.map((cast) => {
          const { title, sub } = castDisplayTitle(cast);
          const current = cast.folder === currentFolder;
          return (
            <button
              key={cast.folder}
              type="button"
              className={current ? "cast-item is-current" : "cast-item"}
              aria-current={current || undefined}
              onClick={() => onOpen(cast.folder)}
            >
              <span className="cast-avatar">
                {cast.avatarUrl ? (
                  <img src={cast.avatarUrl} alt="" />
                ) : (
                  cast.name.trim().slice(0, 1) || "？"
                )}
              </span>
              <span className="cast-text">
                <strong>
                  {title || "名前未設定"}
                  {current && dirty ? (
                    <span className="dot" title="保存していない変更があります" />
                  ) : null}
                </strong>
                <small>
                  {sub ? `${sub} ・ ` : ""}
                  {cast.mode === "chat" ? "雑談" : "ストーリー"} ・ {relativeTime(cast.updatedAt)}
                </small>
              </span>
            </button>
          );
        })}
        {library?.errors.map((error) => (
          <p key={error.folder} className="note error-note" title={error.message}>
            読めないフォルダ: {error.folder}
          </p>
        ))}
      </nav>
      <div className="library-foot">
        <span className="note" title={library?.root}>
          保存先: {library?.root ?? "…"}
        </span>
        <div className="button-row">
          <button type="button" className="btn btn-plain btn-small" onClick={onChooseRoot}>
            保存先を変える
          </button>
          <button type="button" className="btn btn-plain btn-small" onClick={onOpenRoot}>
            フォルダを開く
          </button>
        </div>
      </div>
    </aside>
  );
}
