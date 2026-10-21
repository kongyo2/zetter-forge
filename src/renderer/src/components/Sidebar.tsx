import { castDisplayTitle } from "@shared/cast";
import type { LibraryListing } from "@shared/ipc";
import { useMemo, useState } from "react";

import { IconPlus } from "./icons";
import { Avatar } from "./ui";

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
  onOpenSettings,
}: {
  library: LibraryListing | null;
  currentFolder: string | null;
  newCastOpen: boolean;
  dirty: boolean;
  onOpen: (folder: string) => void;
  onNew: () => void;
  onChooseRoot: () => void;
  onOpenRoot: () => void;
  onOpenSettings: () => void;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const casts = useMemo(() => {
    const items = library?.casts ?? [];
    if (!needle) return items;
    return items.filter((cast) => `${cast.name}\n${cast.tagline}`.toLowerCase().includes(needle));
  }, [library, needle]);

  return (
    <aside className="sidebar">
      <div className="brand">Zetter Forge</div>
      <button type="button" className="btn btn-outline btn-block" onClick={onNew}>
        <IconPlus />
        新しいキャスト
      </button>
      <input
        className="input search"
        type="search"
        value={query}
        placeholder="名前・キャッチコピーで絞り込む"
        aria-label="キャストを絞り込む"
        onChange={(event) => setQuery(event.target.value)}
      />
      <nav className="cast-list" aria-label="保存したキャスト">
        {newCastOpen ? (
          <div className="cast-item is-current is-new">
            <span className="avatar avatar-medium is-blank" aria-hidden="true">
              新
            </span>
            <span className="cast-text">
              <span className="cast-title">新しいキャスト</span>
              <span className="cast-meta">
                <span>{dirty ? "まだ保存していません" : "書きはじめると保存できます"}</span>
              </span>
            </span>
          </div>
        ) : null}
        {library === null ? <p className="note">読み込み中…</p> : null}
        {library && library.casts.length === 0 ? (
          <p className="note">まだキャストがありません。「新しいキャスト」から作れます。</p>
        ) : null}
        {library && library.casts.length > 0 && casts.length === 0 ? (
          <p className="note">「{query.trim()}」に合うキャストはありません。</p>
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
              <Avatar src={cast.avatarUrl} name={cast.name} />
              <span className="cast-text">
                <span className="cast-title">
                  <span className="cast-title-text">{title || "名前未設定"}</span>
                  {current && dirty ? (
                    <span className="dirty-dot" title="保存していない変更があります" />
                  ) : null}
                </span>
                <span className="cast-meta">
                  {sub ? <span>{sub}</span> : null}
                  <span>{cast.mode === "chat" ? "雑談" : "ストーリー"}</span>
                  <span>{relativeTime(cast.updatedAt)}</span>
                </span>
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
        <span className="library-root" title={library?.root}>
          <span className="library-root-label">保存先</span>
          <span className="library-root-path">{library?.root ?? "…"}</span>
        </span>
        <div className="button-row">
          <button type="button" className="btn btn-plain btn-small" onClick={onChooseRoot}>
            保存先を変える
          </button>
          <button type="button" className="btn btn-plain btn-small" onClick={onOpenRoot}>
            フォルダを開く
          </button>
          <button
            type="button"
            className="btn btn-plain btn-small"
            onClick={onOpenSettings}
            title="Ctrl+,"
          >
            入力欄の設定
          </button>
        </div>
      </div>
    </aside>
  );
}
