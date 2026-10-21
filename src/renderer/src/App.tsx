import {
  type CastDocument,
  castDisplayTitle,
  createEmptyCast,
  newId,
  sendableMembers,
} from "@shared/cast";
import type { LibraryListing } from "@shared/ipc";
import { type EditorTab, missingRequired, validateCast } from "@shared/validate";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { IssuesPanel, TAB_LABELS } from "./components/IssuesPanel";
import { Sidebar } from "./components/Sidebar";
import { type EditorApi, EditorContext } from "./editor";
import {
  type EditorSession,
  canonicalJson,
  imageSrc,
  isDirty,
  mapImages,
  newSession,
  sessionFromLoaded,
  usedPendingImages,
} from "./session";
import { AffinityTab } from "./tabs/AffinityTab";
import { CharacterTab } from "./tabs/CharacterTab";
import { ExperienceTab } from "./tabs/ExperienceTab";
import { LorebookTab } from "./tabs/LorebookTab";
import { MemoTab } from "./tabs/MemoTab";
import { PublishTab } from "./tabs/PublishTab";

interface Toast {
  id: string;
  message: string;
  tone: "error" | "info";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const TABS: EditorTab[] = ["character", "experience", "affinity", "lorebook", "publish", "memo"];

export function App() {
  const [library, setLibrary] = useState<LibraryListing | null>(null);
  const [session, setSession] = useState<EditorSession | null>(null);
  const [tab, setTab] = useState<EditorTab>("character");
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const savingRef = useRef(false);

  const notify = useCallback((message: string, tone: "error" | "info" = "info") => {
    const id = newId();
    setToasts((current) => [...current.slice(-3), { id, message, tone }]);
    setTimeout(
      () => setToasts((current) => current.filter((toast) => toast.id !== id)),
      tone === "error" ? 6000 : 3000,
    );
  }, []);

  const refreshLibrary = useCallback(async () => {
    try {
      setLibrary(await window.forge.getLibrary());
    } catch (error) {
      notify(`ライブラリを読めませんでした: ${errorMessage(error)}`, "error");
    }
  }, [notify]);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  // 保存していない変更があるまま閉じようとしたら、メインプロセスが確認を出す
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (sessionRef.current && isDirty(sessionRef.current)) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const confirmDiscard = useCallback(() => {
    const current = sessionRef.current;
    return (
      !current ||
      !isDirty(current) ||
      window.confirm("保存していない変更があります。破棄して続けますか？")
    );
  }, []);

  const openCast = useCallback(
    async (folder: string) => {
      if (sessionRef.current?.folder === folder) return;
      if (!confirmDiscard()) return;
      try {
        const loaded = await window.forge.loadCast(folder);
        setSession(sessionFromLoaded(loaded));
        setTab("character");
      } catch (error) {
        notify(`開けませんでした: ${errorMessage(error)}`, "error");
      }
    },
    [confirmDiscard, notify],
  );

  const newCast = useCallback(() => {
    if (!confirmDiscard()) return;
    setSession(newSession(createEmptyCast()));
    setTab("character");
  }, [confirmDiscard]);

  const save = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || savingRef.current) return;
    if (current.folder && !isDirty(current)) {
      notify("変更はありません。");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const docAtSave = current.doc;
      const result = await window.forge.saveCast({
        folder: current.folder,
        doc: current.doc,
        pendingImages: usedPendingImages(current),
      });
      setSession((previous) => {
        if (!previous) return previous;
        const base = {
          folder: result.folder,
          savedJson: canonicalJson(result.doc),
          imageUrls: result.imageUrls,
          notices: result.notices,
        };
        if (previous.doc === docAtSave) return { ...base, doc: result.doc, pendingImages: {} };
        // 保存中に書き足した分は残し、書き出した画像の参照だけを差し替える
        const doc = structuredClone(previous.doc);
        mapImages(doc, (image) => {
          const saved = result.replacedImages[image.file];
          return saved ? { ...image, ...saved } : image;
        });
        doc.updatedAt = result.doc.updatedAt;
        const pendingImages = Object.fromEntries(
          Object.entries(previous.pendingImages).filter(([key]) => !(key in result.replacedImages)),
        );
        return { ...base, doc, pendingImages };
      });
      notify("保存しました。");
      void refreshLibrary();
    } catch (error) {
      notify(`保存できませんでした: ${errorMessage(error)}`, "error");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [notify, refreshLibrary]);

  // メニュー（Ctrl+S / Ctrl+N）
  const commandsRef = useRef({ save, newCast });
  commandsRef.current = { save, newCast };
  useEffect(
    () =>
      window.forge.onCommand((command) => {
        if (command === "save") void commandsRef.current.save();
        else commandsRef.current.newCast();
      }),
    [],
  );

  const chooseRoot = async () => {
    if (!confirmDiscard()) return;
    try {
      const listing = await window.forge.chooseLibraryRoot();
      if (listing) {
        setLibrary(listing);
        setSession(null);
      }
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  };

  const dirty = session ? isDirty(session) : false;

  return (
    <div className="app">
      <Sidebar
        library={library}
        currentFolder={session?.folder ?? null}
        newCastOpen={!!session && session.folder === null}
        dirty={dirty}
        onOpen={(folder) => void openCast(folder)}
        onNew={newCast}
        onChooseRoot={() => void chooseRoot()}
        onOpenRoot={() =>
          void window.forge
            .openLibraryFolder()
            .catch((error: unknown) => notify(errorMessage(error), "error"))
        }
      />
      <main className="workspace">
        {session ? (
          <Editor
            session={session}
            setSession={setSession}
            tab={tab}
            setTab={setTab}
            saving={saving}
            dirty={dirty}
            onSave={() => void save()}
            notify={notify}
          />
        ) : (
          <Welcome onNew={newCast} hasCasts={(library?.casts.length ?? 0) > 0} />
        )}
      </main>
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.tone}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}

function Welcome({ onNew, hasCasts }: { onNew: () => void; hasCasts: boolean }) {
  return (
    <div className="welcome">
      <h1>Zetter のキャストを、手元で育てる</h1>
      <p>
        Zetter
        のキャスト作成画面と同じ項目・同じ上限で、キャストの設定をパソコンに保存します。Zetter
        に載せる前の下書き、載せたあとの控え、手元での改良に使えます。
      </p>
      <ul>
        <li>
          画像は Zetter と同じ比率・大きさで切り抜いて、そのまま Zetter で選べるファイルにします。
        </li>
        <li>
          右側の「Zetter で完成するときの確認」に、Zetter で止められる点や保存されない点が出ます。
        </li>
        <li>保存するたびに前の版を残します。</li>
      </ul>
      <button type="button" className="btn btn-primary" onClick={onNew}>
        新しいキャストを作る
      </button>
      {hasCasts ? <p className="note">左の一覧から保存したキャストを開けます。</p> : null}
    </div>
  );
}

function Editor({
  session,
  setSession,
  tab,
  setTab,
  saving,
  dirty,
  onSave,
  notify,
}: {
  session: EditorSession;
  setSession: Dispatch<SetStateAction<EditorSession | null>>;
  tab: EditorTab;
  setTab: (tab: EditorTab) => void;
  saving: boolean;
  dirty: boolean;
  onSave: () => void;
  notify: (message: string, tone?: "error" | "info") => void;
}) {
  const api = useMemo<EditorApi>(
    () => ({
      session,
      doc: session.doc,
      update: (recipe: (doc: CastDocument) => void) =>
        setSession((previous) => {
          if (!previous) return previous;
          const doc = structuredClone(previous.doc);
          recipe(doc);
          return { ...previous, doc };
        }),
      addImage: (image) => {
        const file = `pending:${newId()}`;
        setSession((previous) =>
          previous
            ? { ...previous, pendingImages: { ...previous.pendingImages, [file]: image.dataUrl } }
            : previous,
        );
        return { file, width: image.width, height: image.height, bytes: image.bytes };
      },
      src: (image) => imageSrc(session, image),
      notify,
    }),
    [session, setSession, notify],
  );
  const doc = session.doc;
  const issues = useMemo(() => validateCast(doc), [doc]);
  const missing = missingRequired(doc);
  const { title, sub } = castDisplayTitle(doc);
  const multi = sendableMembers(doc).length > 0;
  const issueCount = (target: EditorTab) =>
    issues.filter((issue) => issue.tab === target && issue.level !== "info").length;
  const folder = session.folder;

  return (
    <EditorContext.Provider value={api}>
      <div className="editor">
        <header className="editor-head">
          <div className="editor-title">
            <h1>{title || "名前未設定のキャスト"}</h1>
            <div className="chips-inline">
              {sub ? <span className="note">{sub}</span> : null}
              <span className="chip-static">{doc.mode === "chat" ? "雑談" : "ストーリー"}</span>
              {multi ? <span className="chip-static">複数</span> : null}
              <span className="chip-static">{doc.status === "public" ? "公開する" : "非公開"}</span>
            </div>
          </div>
          <div className="editor-actions">
            <span className={dirty ? "save-state is-dirty" : "save-state"}>
              {saving
                ? "保存中…"
                : folder === null
                  ? "まだ保存していません"
                  : dirty
                    ? "保存していない変更があります"
                    : "保存済み"}
            </span>
            {folder ? (
              <button
                type="button"
                className="btn btn-plain"
                onClick={() =>
                  void window.forge
                    .openCastFolder(folder)
                    .catch((error: unknown) => notify(errorMessage(error), "error"))
                }
              >
                フォルダを開く
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving}
              onClick={onSave}
              title="Ctrl+S"
            >
              保存
            </button>
          </div>
        </header>
        {session.notices.map((notice) => (
          <p key={notice} className="banner">
            {notice}
          </p>
        ))}
        <nav className="tabs" role="tablist" aria-label="設定の種類">
          {TABS.map((item) => {
            const count = issueCount(item);
            const unfilled =
              (item === "character" && missing.character) ||
              (item === "experience" && missing.experience);
            return (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={tab === item}
                className={tab === item ? "tab is-selected" : "tab"}
                onClick={() => setTab(item)}
              >
                {TAB_LABELS[item]}
                {unfilled ? <span className="badge badge-required">未入力</span> : null}
                {!unfilled && count > 0 ? <span className="badge">{count}</span> : null}
              </button>
            );
          })}
        </nav>
        <div className="editor-body">
          <div className="editor-main" key={`${session.folder ?? "new"}:${doc.id}`}>
            {tab === "character" ? <CharacterTab /> : null}
            {tab === "experience" ? <ExperienceTab /> : null}
            {tab === "affinity" ? <AffinityTab /> : null}
            {tab === "lorebook" ? <LorebookTab /> : null}
            {tab === "publish" ? <PublishTab /> : null}
            {tab === "memo" ? (
              <MemoTab
                onOpenFolder={
                  folder
                    ? () =>
                        void window.forge
                          .openCastFolder(folder)
                          .catch((error: unknown) => notify(errorMessage(error), "error"))
                    : null
                }
              />
            ) : null}
          </div>
          <IssuesPanel issues={issues} onJump={setTab} />
        </div>
      </div>
    </EditorContext.Provider>
  );
}
