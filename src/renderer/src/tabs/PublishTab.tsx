import { castDisplayTitle, type GalleryImage, newId } from "@shared/cast";
import { LIMITS } from "@shared/limits";

import { IconPlus, IconRemove } from "../components/icons";
import { ImageField, useImagePicker } from "../components/ImageField";
import { Counter, Disclosure, Field, Section, TextInput, Toggle } from "../components/ui";
import { useEditor } from "../editor";

export function PublishTab() {
  const { doc, update, src } = useEditor();
  const story = doc.mode === "story";
  const { title, sub } = castDisplayTitle(doc);
  const coverSrc = src(doc.cover);
  return (
    <div className="tab-body">
      <Section>
        <Toggle
          checked={doc.status === "public"}
          onChange={(checked) =>
            update((draft) => void (draft.status = checked ? "public" : "private"))
          }
          title={doc.status === "public" ? "公開する" : "非公開（下書き）"}
          description="Zetter で「完成」するときに公開するかどうかのメモです。公開すると「みんなのキャスト」に並び、他のユーザーも話せるようになります。"
        />
      </Section>

      <Section title="カバー画像" description="一覧カードでいちばん大きく出る絵です。">
        <div className="cover-row">
          <div className="cover-pick">
            <ImageField
              kind="cover"
              shape="portrait"
              emptyLabel="カバーを選ぶ"
              image={doc.cover}
              blurred={doc.coverBlurred}
              onChange={(image) => update((draft) => void (draft.cover = image))}
            />
            <Toggle
              checked={doc.coverBlurred}
              onChange={(checked) => update((draft) => void (draft.coverBlurred = checked))}
              title="ぼかして表示する"
            />
          </div>
          <figure className="preview-card">
            <div className="preview-cover">
              {coverSrc ? (
                <img
                  src={coverSrc}
                  alt=""
                  className={doc.coverBlurred ? "is-blurred" : undefined}
                />
              ) : null}
            </div>
            <div className="preview-text">
              <strong>{title || "名前未設定"}</strong>
              {sub ? <span>{sub}</span> : null}
              {story && doc.hook.trim() ? <em>{doc.hook}</em> : null}
            </div>
            <figcaption className="note">みんなのキャストでの見え方</figcaption>
          </figure>
        </div>
      </Section>

      {!story ? (
        <Section title="アイコン" description="チャット画面のアイコンに使われます。">
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
        </Section>
      ) : null}

      <Section title="一覧での紹介">
        <Field label="タグ" hint="5個まで、ひとつ20文字まで。">
          {doc.tags.length > 0 ? (
            <ul className="tags">
              {doc.tags.map((tag, index) => (
                <li className="tag" key={index}>
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
                    className="icon-button"
                    aria-label={`タグ${index + 1}を外す`}
                    title="外す"
                    onClick={() => update((draft) => void draft.tags.splice(index, 1))}
                  >
                    <IconRemove />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div>
            <button
              type="button"
              className="btn btn-outline"
              disabled={doc.tags.length >= LIMITS.tags}
              onClick={() => update((draft) => void draft.tags.push(""))}
            >
              <IconPlus />
              タグを追加
            </button>
          </div>
        </Field>

        {story ? (
          <Field
            label="一言セリフ"
            hint="一覧カードに表示されます。"
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
      </Section>

      <Section
        title="チャット背景画像"
        description="任意です。このキャストとのチャットの既定背景になります。"
      >
        <ImageField
          kind="background"
          shape="tall"
          emptyLabel="背景を選ぶ"
          image={doc.background}
          onChange={(image) => update((draft) => void (draft.background = image))}
        />
      </Section>

      <Gallery />

      <Disclosure
        summary={
          <>
            オプション設定
            <span className="summary-hint">設定の公開範囲・ページに出す情報</span>
          </>
        }
      >
        <div className="subsection">
          <div className="subhead">
            <h3>設定の公開範囲</h3>
          </div>
          <p className="note">既定では、キャストの中身は作者だけが見られます。</p>
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
        </div>
        <div className="subsection">
          <div className="subhead">
            <h3>ページに出す情報</h3>
          </div>
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
        </div>
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
    <Section
      title="ギャラリー画像"
      meta={`${doc.gallery.length} / ${LIMITS.gallery}枚`}
      description="任意です。キャストページに並べて表示される追加の画像です。"
    >
      <div className="gallery">
        {doc.gallery.map((image, index) => {
          const imageSrc = src(image);
          return (
            <figure key={image.id} className="gallery-item">
              <div className="gallery-frame">
                {imageSrc ? (
                  <img src={imageSrc} alt="" className={image.blurred ? "is-blurred" : undefined} />
                ) : null}
              </div>
              <figcaption>
                <span className="gallery-size">
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
                  className="icon-button"
                  aria-label={`ギャラリー画像${index + 1}を外す`}
                  title="外す"
                  onClick={() => update((draft) => void draft.gallery.splice(index, 1))}
                >
                  <IconRemove />
                </button>
              </figcaption>
            </figure>
          );
        })}
        {doc.gallery.length < LIMITS.gallery ? (
          <button type="button" className="gallery-add" onClick={picker.open}>
            <IconPlus />
            画像を追加
          </button>
        ) : null}
      </div>
      {picker.element}
    </Section>
  );
}
