import { Field, Section, TextArea, TextInput } from "../components/ui";
import { useEditor } from "../editor";

export function MemoTab({ onOpenFolder }: { onOpenFolder: (() => void) | null }) {
  const { doc, update, session } = useEditor();
  const url = doc.zetterUrl.trim();
  const openable = /^https:\/\/(z-etter\.com|zetter\.si)\//u.test(url);
  return (
    <div className="tab-body">
      <Section title="メモ" description="このアプリの中だけで使う欄です。Zetter には送られません。">
        <Field
          label="Zetter のキャストの URL"
          hint="アップロードしたあとのキャストのページ（例: https://z-etter.com/cast/…）を控えておけます。"
        >
          <div className="inline-row">
            <TextInput
              value={doc.zetterUrl}
              placeholder="https://z-etter.com/cast/…"
              ariaLabel="Zetter のキャストの URL"
              className="input-url"
              onChange={(value) => update((draft) => void (draft.zetterUrl = value))}
            />
            <button
              type="button"
              className="btn btn-outline"
              disabled={!openable}
              onClick={() => window.open(url, "_blank")}
            >
              ブラウザで開く
            </button>
          </div>
        </Field>
        <Field label="改良メモ">
          <TextArea
            value={doc.memo}
            rows={8}
            placeholder="直したいところ、試した結果、Zetter に反映した日付など"
            ariaLabel="改良メモ"
            onChange={(value) => update((draft) => void (draft.memo = value))}
          />
        </Field>
      </Section>
      <Section title="このキャストのファイル">
        <dl className="facts">
          <div>
            <dt>保存先</dt>
            <dd>{session.folder ?? "まだ保存していません"}</dd>
          </div>
          <div>
            <dt>作成</dt>
            <dd>{new Date(doc.createdAt).toLocaleString("ja-JP")}</dd>
          </div>
          <div>
            <dt>最終保存</dt>
            <dd>{session.folder ? new Date(doc.updatedAt).toLocaleString("ja-JP") : "—"}</dd>
          </div>
        </dl>
        <p className="note">
          保存するたびに、前の版をフォルダ内の history に残します（新しいものから30件）。画像は
          images にあり、Zetter の画面でそのまま選べます。
        </p>
        {onOpenFolder ? (
          <div>
            <button type="button" className="btn btn-outline" onClick={onOpenFolder}>
              フォルダを開く
            </button>
          </div>
        ) : null}
      </Section>
    </div>
  );
}
