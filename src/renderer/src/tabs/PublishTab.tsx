import { castDisplayTitle, type GalleryImage, newId } from "@shared/cast";
import { LIMITS } from "@shared/limits";

import { ImageField, useImagePicker } from "../components/ImageField";
import { Card, Counter, Disclosure, Field, SectionHead, TextInput, Toggle } from "../components/ui";
import { useEditor } from "../editor";

export function PublishTab() {
  const { doc, update, src } = useEditor();
  const story = doc.mode === "story";
  const { title, sub } = castDisplayTitle(doc);
  const coverSrc = src(doc.cover);
  return (
    <div className="tab-body">
      <Card>
        <Toggle
          checked={doc.status === "public"}
          onChange={(checked) =>
            update((draft) => void (draft.status = checked ? "public" : "private"))
          }
          title={doc.status === "public" ? "公開する" : "非公開（下書き）"}
          description="Zetter で「完成」するときに公開するかどうかのメモです。公開すると「みんなのキャスト」に並び、他のユーザーも話せるようになります。"
        />
      </Card>

      <SectionHead title="カバー画像" description="一覧カードでいちばん大きく出る絵です。" />
      <div className="cover-row">
        <ImageField
          kind="cover"
          shape="portrait"
          emptyLabel="カバーを選ぶ"
          image={doc.cover}
          blurred={doc.coverBlurred}
          onChange={(image) => update((draft) => void (draft.cover = image))}
        />
        <div className="preview-card" aria-label="みんなのキャストでの見え方のプレビュー">
          <div className="preview-cover">
            {coverSrc ? (
              <img src={coverSrc} alt="" className={doc.coverBlurred ? "is-blurred" : undefined} />
            ) : null}
          </div>
          <div className="preview-text">
            <strong>{title || "名前未設定"}</strong>
            {sub ? <span>{sub}</span> : null}
            {story && doc.hook.trim() ? <em>{doc.hook}</em> : null}
          </div>
          <p className="note">みんなのキャストでの見え方のプレビューです</p>
        </div>
      </div>
      <Toggle
        checked={doc.coverBlurred}
        onChange={(checked) => update((draft) => void (draft.coverBlurred = checked))}
        title="このカバー画像をぼかして表示する"
      />

      {!story ? (
        <>
          <SectionHead title="アイコン" description="チャット画面のアイコンに使われます" />
          <ImageField
            kind="avatar"
            shape="circle"
            emptyLabel="アイコン"
            image={doc.avatar}
            blurred={doc.avatarBlurred}
            onChange={(image) => update((draft) => void (draft.avatar = image))}
          />
          <Toggle
            checked={doc.avatarBlurred}
            onChange={(checked) => update((draft) => void (draft.avatarBlurred = checked))}
            title="この画像をぼかして表示する"
          />
        </>
      ) : null}

      <Field label="タグ（最大5個・各20文字まで）">
        <div className="tags">
          {doc.tags.map((tag, index) => (
            <div className="tag-row" key={index}>
              <TextInput
                value={tag}
                maxLength={LIMITS.tag}
                placeholder="タグ"
                ariaLabel={`タグ${index + 1}`}
                onChange={(value) => update((draft) => void (draft.tags[index] = value))}
              />
              <Counter length={tag.length} max={LIMITS.tag} />
              <button
                type="button"
                className="btn btn-plain btn-small"
                onClick={() => update((draft) => void draft.tags.splice(index, 1))}
              >
                外す
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-outline"
            disabled={doc.tags.length >= LIMITS.tags}
            onClick={() => update((draft) => void draft.tags.push(""))}
          >
            タグを追加
          </button>
        </div>
      </Field>

      {story ? (
        <Field
          label="一言セリフ（一覧カードに表示）"
          counter={<Counter length={doc.hook.length} max={LIMITS.hook} />}
        >
          <TextInput
            value={doc.hook}
            maxLength={LIMITS.hook}
            placeholder="例: 「……で、話って何？」"
            ariaLabel="一言セリフ"
            onChange={(value) => update((draft) => void (draft.hook = value))}
          />
        </Field>
      ) : null}

      <Field label="チャット背景画像（任意）" hint="このキャストとのチャットの既定背景になります。">
        <ImageField
          kind="background"
          shape="tall"
          emptyLabel="背景を選ぶ"
          image={doc.background}
          onChange={(image) => update((draft) => void (draft.background = image))}
        />
      </Field>

      <Gallery />

      <Disclosure summary="オプション設定">
        <SectionHead
          title="設定の公開範囲"
          description="既定では、キャストの中身は作者だけが見られます。"
        />
        <Toggle
          checked={!doc.personaHidden}
          onChange={(checked) => update((draft) => void (draft.personaHidden = !checked))}
          title="人格設定"
          description="ONにすると詳細ページの「設定を見る」欄で誰でも読めます。"
        />
        <Toggle
          checked={!doc.toneExamplesHidden}
          onChange={(checked) => update((draft) => void (draft.toneExamplesHidden = !checked))}
          title="口調サンプル"
          description="ONにすると詳細ページの「設定を見る」欄で誰でも読めます。"
        />
        <Toggle
          checked={!doc.situationHidden}
          onChange={(checked) => update((draft) => void (draft.situationHidden = !checked))}
          title="シチュエーション"
          description="ONにすると詳細ページのシチュエーション欄で誰でも読めます。"
        />
        <SectionHead title="ページに出す情報" />
        <Toggle
          checked={!doc.authorHidden}
          onChange={(checked) => update((draft) => void (draft.authorHidden = !checked))}
          title="作者名"
          description="OFFにすると、一覧・詳細ページにあなたの名前を出しません。"
        />
        <Toggle
          checked={doc.showFavoriteCount}
          onChange={(checked) => update((draft) => void (draft.showFavoriteCount = checked))}
          title="お気に入り数"
          description="ONにすると、詳細ページにお気に入り登録数を表示します。"
        />
        <Toggle
          checked={doc.showTalkCount}
          onChange={(checked) => update((draft) => void (draft.showTalkCount = checked))}
          title="トーク数"
          description="ONにすると、詳細ページに送られたメッセージの累計数を表示します。"
        />
      </Disclosure>
    </div>
  );
}

function Gallery() {
  const { doc, update, src, notify } = useEditor();
  const picker = useImagePicker("gallery", (image) => {
    if (doc.gallery.length >= LIMITS.gallery) {
      notify("ギャラリー画像は10枚まで登録できます。", "error");
      return;
    }
    const item: GalleryImage = { ...image, id: newId(), blurred: false };
    update((draft) => {
      if (draft.gallery.length < LIMITS.gallery) draft.gallery.push(item);
    });
  });
  return (
    <Field
      label="ギャラリー画像（任意・最大10枚）"
      hint="キャストページに並べて表示される追加の画像です"
    >
      <div className="gallery">
        {doc.gallery.map((image, index) => {
          const imageSrc = src(image);
          return (
            <figure key={image.id} className="gallery-item">
              {imageSrc ? (
                <img src={imageSrc} alt="" className={image.blurred ? "is-blurred" : undefined} />
              ) : null}
              <figcaption>
                <span className="note">
                  {index + 1}. {image.width}×{image.height}
                </span>
                <label className="mini-check">
                  <input
                    type="checkbox"
                    checked={image.blurred}
                    onChange={(event) =>
                      update((draft) => {
                        const target = draft.gallery[index];
                        if (target) target.blurred = event.target.checked;
                      })
                    }
                  />
                  ぼかす
                </label>
                <button
                  type="button"
                  className="btn btn-plain btn-small"
                  onClick={() => update((draft) => void draft.gallery.splice(index, 1))}
                >
                  外す
                </button>
              </figcaption>
            </figure>
          );
        })}
        <button
          type="button"
          className="gallery-add"
          disabled={doc.gallery.length >= LIMITS.gallery}
          onClick={picker.open}
        >
          画像を追加
          <span className="note">
            {doc.gallery.length}/{LIMITS.gallery}
          </span>
        </button>
      </div>
      {picker.element}
    </Field>
  );
}
