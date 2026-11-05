import type { GalleryItemVM, LorebookTabVM, MemoTabVM, PublishTabVM } from "../../app/viewModels";
import { Link, useEmit } from "../chain";
import {
  AddButton,
  CopyButton,
  Disclosure,
  EmitButton,
  MiniCheck,
  RowList,
  Section,
  SortableRow,
  Subsection,
  Toggle,
} from "../parts/basics";
import { IconFolder, IconPlus, IconRemove } from "../parts/icons";
import { FilePicker, ImageField } from "../parts/ImageField";
import { TextField } from "../parts/TextField";

function Lorebooks({ vm }: { vm: LorebookTabVM }) {
  return (
    <>
      <RowList rows={vm.rows} empty="連動させる設定集はまだありません。" keyOf={(row) => row.id}>
        {(row) => (
          <SortableRow index={row.index} move={row.move}>
            <TextField vm={row.title} />
            <TextField vm={row.note} />
          </SortableRow>
        )}
      </RowList>
      <div>
        <AddButton disabled={!vm.canAdd}>設定集を追加</AddButton>
      </div>
    </>
  );
}

export function LorebookTab({ vm }: { vm: LorebookTabVM }) {
  return (
    <div className="tab-body">
      <Section
        title="設定集を連動"
        meta={vm.meta}
        description="会話でキーワードに反応する設定集を選びます。設定集そのものは Zetter 側で作ってキャストに連動させるので、ここには連動させる設定集の名前とメモを残します（1つのキャストに10冊まで）。"
      >
        <Link scope={vm.scope}>
          <Lorebooks vm={vm} />
        </Link>
      </Section>
    </div>
  );
}

function GalleryItem({ vm }: { vm: GalleryItemVM }) {
  const emit = useEmit();
  return (
    <figure className="gallery-item">
      <div className="gallery-frame">
        {vm.src ? (
          <img src={vm.src} alt="" className={vm.blurred ? "is-blurred" : undefined} />
        ) : null}
      </div>
      <figcaption>
        <span className="gallery-size">{vm.size}</span>
        <MiniCheck
          checked={vm.blur.checked}
          onChange={(checked) => emit({ type: "check", path: vm.blur.name, checked })}
        >
          {vm.blur.label}
        </MiniCheck>
        <EmitButton
          event={{ type: "remove", path: [] }}
          className="icon-button"
          ariaLabel={`ギャラリー画像${vm.index + 1}を外す`}
          title="外す"
        >
          <IconRemove />
        </EmitButton>
      </figcaption>
      {vm.copy || vm.canShowFile ? (
        <div className="gallery-actions">
          {vm.copy ? <CopyButton vm={vm.copy} name={[]} label="場所をコピー" /> : null}
          {vm.canShowFile ? (
            <EmitButton
              event={{ type: "show-file", path: [] }}
              className="icon-button"
              ariaLabel={`ギャラリー画像${vm.index + 1}をフォルダで見る`}
              title="フォルダで見る"
            >
              <IconFolder />
            </EmitButton>
          ) : null}
        </div>
      ) : null}
    </figure>
  );
}

function Tags({ vm }: { vm: PublishTabVM["tags"] }) {
  return (
    <>
      {vm.rows.length > 0 ? (
        <ul className="tags">
          {vm.rows.map((row) => (
            <li key={row.index} className="tag">
              <TextField vm={row.field} />
              <EmitButton
                event={{ type: "remove", path: [row.index] }}
                className="icon-button"
                ariaLabel={`タグ${row.index + 1}を外す`}
                title="外す"
              >
                <IconRemove />
              </EmitButton>
            </li>
          ))}
        </ul>
      ) : null}
      <div>
        <AddButton disabled={!vm.canAdd}>タグを追加</AddButton>
      </div>
    </>
  );
}

export function PublishTab({ vm }: { vm: PublishTabVM }) {
  return (
    <div className="tab-body">
      <Link scope={vm.scope}>
        <Section>
          <Toggle vm={vm.status} />
        </Section>

        <Section title="カバー画像" description="一覧カードでいちばん大きく出る絵です。">
          <div className="cover-row">
            <div className="cover-pick">
              <ImageField vm={vm.cover} />
              <Toggle vm={vm.coverBlurred} />
            </div>
            <figure className="preview-card">
              <div className="preview-cover">
                {vm.preview.src ? (
                  <img
                    src={vm.preview.src}
                    alt=""
                    className={vm.preview.blurred ? "is-blurred" : undefined}
                  />
                ) : null}
              </div>
              <div className="preview-text">
                <strong>{vm.preview.title}</strong>
                {vm.preview.sub ? <span>{vm.preview.sub}</span> : null}
                {vm.preview.hook ? <em>{vm.preview.hook}</em> : null}
              </div>
              <figcaption className="note">みんなのキャストでの見え方</figcaption>
            </figure>
          </div>
        </Section>

        {vm.chatAvatar ? (
          <Section title="アイコン" description="チャット画面のアイコンに使われます。">
            <ImageField vm={vm.chatAvatar.avatar} />
            <Toggle vm={vm.chatAvatar.blurred} />
          </Section>
        ) : null}
      </Link>

      <Section title="一覧での紹介">
        <div className="field">
          <div className="field-label">
            <span>タグ</span>
          </div>
          <p className="note">5個まで、ひとつ20文字まで。</p>
          <Link scope={vm.tags.scope}>
            <Tags vm={vm.tags} />
          </Link>
        </div>
        {vm.hook ? (
          <Link scope={vm.scope}>
            <TextField vm={vm.hook} />
          </Link>
        ) : null}
      </Section>

      <Section
        title="チャット背景画像"
        description="任意です。このキャストとのチャットの既定背景になります。"
      >
        <Link scope={vm.scope}>
          <ImageField vm={vm.background} />
        </Link>
      </Section>

      <Section
        title="ギャラリー画像"
        meta={vm.gallery.meta}
        description="任意です。キャストページに並べて表示される追加の画像です。"
      >
        <Link scope={vm.gallery.scope}>
          <div className="gallery">
            {vm.gallery.items.map((item) => (
              <Link key={item.id} scope={[item.id]}>
                <GalleryItem vm={item} />
              </Link>
            ))}
            {vm.gallery.canAdd ? (
              <FilePicker name={[]} multiple>
                {(open) => (
                  <button type="button" className="gallery-add" onClick={open}>
                    <IconPlus />
                    画像を追加
                  </button>
                )}
              </FilePicker>
            ) : null}
          </div>
        </Link>
      </Section>

      <Disclosure summary="オプション設定" hint="設定の公開範囲・ページに出す情報">
        <Link scope={vm.scope}>
          <Subsection title="設定の公開範囲">
            <p className="note">既定では、キャストの中身は作者だけが見られます。</p>
            {vm.visibility.map((item) => (
              <Toggle key={item.name.join("/")} vm={item} />
            ))}
          </Subsection>
          <Subsection title="ページに出す情報">
            {vm.pageInfo.map((item) => (
              <Toggle key={item.name.join("/")} vm={item} />
            ))}
          </Subsection>
        </Link>
      </Disclosure>
    </div>
  );
}

function Memo({ vm }: { vm: MemoTabVM }) {
  return (
    <>
      <div className="inline-row url-row">
        <TextField vm={vm.url} />
        <EmitButton
          event={{ type: "open-url", path: vm.url.name }}
          className="btn btn-outline"
          disabled={!vm.canOpenUrl}
        >
          ブラウザで開く
        </EmitButton>
      </div>
      <TextField vm={vm.memo} />
    </>
  );
}

export function MemoTab({ vm }: { vm: MemoTabVM }) {
  return (
    <div className="tab-body">
      <Section title="メモ" description="このアプリの中だけで使う欄です。Zetter には送られません。">
        <Link scope={vm.scope}>
          <Memo vm={vm} />
        </Link>
      </Section>
      <Section title="このキャストのファイル">
        <dl className="facts">
          {vm.facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
        <p className="note">
          保存するたびに、前の版をフォルダ内の history に残します（新しいものから30件）。画像は
          images にあり、Zetter の画面でそのまま選べます。
        </p>
        {vm.canOpenFolder ? (
          <div>
            <EmitButton event={{ type: "editor/open-folder" }} className="btn btn-outline">
              フォルダを開く
            </EmitButton>
          </div>
        ) : null}
      </Section>
    </div>
  );
}
