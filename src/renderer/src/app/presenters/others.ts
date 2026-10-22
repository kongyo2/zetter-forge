// 設定集・見た目と公開・メモのタブに描くもの。
import { castDisplayTitle } from "@shared/cast";
import { LIMITS } from "@shared/limits";

import { isZetterUrl } from "../machine";
import { isPendingImage } from "../session";
import type { LorebookTabVM, MemoTabVM, PublishTabVM } from "../viewModels";
import {
  type Context,
  copyVM,
  imageField,
  imageSrc,
  limit,
  moveVM,
  textField,
  toggle,
} from "./common";

export function presentLorebook(ctx: Context): LorebookTabVM {
  const books = ctx.doc.lorebooks;
  return {
    scope: ["lorebooks"],
    meta: `${books.length} / ${LIMITS.lorebooks}冊`,
    rows: books.map((book, index) => {
      const scope = ["lorebooks", book.id];
      return {
        id: book.id,
        index,
        title: textField(ctx, scope, ["title"], {
          label: "書名",
          ariaLabel: `設定集${index + 1}の書名`,
          value: book.title,
          placeholder: "Zetter での設定集の書名",
          ...limit(book.title, LIMITS.lorebookTitle),
        }),
        note: textField(ctx, scope, ["note"], {
          label: "メモ",
          ariaLabel: `設定集${index + 1}のメモ`,
          value: book.note,
          placeholder: "作者、URL、使う理由など（Zetter には送られません）",
          multiline: true,
          rows: 2,
        }),
        move: moveVM(index, books.length, "この設定集を外す"),
      };
    }),
    canAdd: books.length < LIMITS.lorebooks,
  };
}

export function presentPublish(ctx: Context): PublishTabVM {
  const { doc, session } = ctx;
  const story = doc.mode === "story";
  const scope = ["cast"];
  const { title, sub } = castDisplayTitle(doc);
  return {
    scope,
    status: toggle(
      ["public"],
      doc.status === "public" ? "公開する" : "非公開（下書き）",
      doc.status === "public",
      "Zetter で「完成」するときに公開するかどうかのメモです。公開すると「みんなのキャスト」に並び、他のユーザーも話せるようになります。",
    ),
    cover: imageField(ctx, scope, ["cover"], doc.cover, {
      label: "カバーを選ぶ",
      shape: "portrait",
      blurred: doc.coverBlurred,
    }),
    coverBlurred: toggle(["coverBlurred"], "ぼかして表示する", doc.coverBlurred),
    preview: {
      src: imageSrc(session, doc.cover),
      blurred: doc.coverBlurred,
      title: title || "名前未設定",
      sub: sub || null,
      hook: story && doc.hook.trim() ? doc.hook : null,
    },
    chatAvatar: story
      ? null
      : {
          avatar: imageField(ctx, scope, ["avatar"], doc.avatar, {
            label: "アイコン",
            shape: "circle",
            blurred: doc.avatarBlurred,
          }),
          blurred: toggle(["avatarBlurred"], "この画像をぼかして表示する", doc.avatarBlurred),
        },
    tags: {
      scope: ["tags"],
      rows: doc.tags.map((tag, index) => ({
        index,
        field: textField(ctx, ["tags"], [index], {
          label: `タグ${index + 1}`,
          labelHidden: true,
          value: tag,
          placeholder: "タグ",
          ...limit(tag, LIMITS.tag),
        }),
      })),
      canAdd: doc.tags.length < LIMITS.tags,
    },
    hook: story
      ? textField(ctx, scope, ["hook"], {
          label: "一言セリフ",
          value: doc.hook,
          placeholder: "例: 「……で、話って何？」",
          hint: ["一覧カードに表示されます。"],
          ...limit(doc.hook, LIMITS.hook),
        })
      : null,
    background: imageField(ctx, scope, ["background"], doc.background, {
      label: "背景を選ぶ",
      shape: "tall",
    }),
    gallery: {
      scope: ["gallery"],
      meta: `${doc.gallery.length} / ${LIMITS.gallery}枚`,
      items: doc.gallery.map((image, index) => ({
        id: image.id,
        index,
        src: imageSrc(session, image),
        blurred: image.blurred,
        size: `${index + 1}. ${image.width}×${image.height}`,
        blur: toggle(["blurred"], "ぼかす", image.blurred),
        copy: copyVM(ctx, ["gallery", image.id]),
        canShowFile: !!session.folder && !isPendingImage(image),
      })),
      canAdd: doc.gallery.length < LIMITS.gallery,
    },
    visibility: [
      toggle(
        ["personaVisible"],
        "人格設定",
        !doc.personaHidden,
        "ONにすると詳細ページの「設定を見る」欄で誰でも読めます。",
      ),
      toggle(
        ["toneExamplesVisible"],
        "口調サンプル",
        !doc.toneExamplesHidden,
        "ONにすると詳細ページの「設定を見る」欄で誰でも読めます。",
      ),
      toggle(
        ["situationVisible"],
        "シチュエーション",
        !doc.situationHidden,
        "ONにすると詳細ページのシチュエーション欄で誰でも読めます。",
      ),
    ],
    pageInfo: [
      toggle(
        ["authorVisible"],
        "作者名",
        !doc.authorHidden,
        "OFFにすると、一覧・詳細ページにあなたの名前を出しません。",
      ),
      toggle(
        ["showFavoriteCount"],
        "お気に入り数",
        doc.showFavoriteCount,
        "ONにすると、詳細ページにお気に入り登録数を表示します。",
      ),
      toggle(
        ["showTalkCount"],
        "トーク数",
        doc.showTalkCount,
        "ONにすると、詳細ページに送られたメッセージの累計数を表示します。",
      ),
    ],
  };
}

function dateText(iso: string): string {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? new Date(time).toLocaleString("ja-JP") : "—";
}

export function presentMemo(ctx: Context): MemoTabVM {
  const { doc, session } = ctx;
  const scope = ["cast"];
  return {
    scope,
    url: textField(ctx, scope, ["zetterUrl"], {
      label: "Zetter のキャストの URL",
      value: doc.zetterUrl,
      placeholder: "https://z-etter.com/cast/…",
      hint: [
        "Zetter に載せたあとのキャストのページ（例: https://z-etter.com/cast/…）を控えておけます。",
      ],
      plain: true,
    }),
    canOpenUrl: isZetterUrl(doc.zetterUrl.trim()),
    memo: textField(ctx, scope, ["memo"], {
      label: "改良メモ",
      value: doc.memo,
      placeholder: "直したいところ、試した結果、Zetter に反映した日付など",
      multiline: true,
      rows: 8,
    }),
    facts: [
      { label: "保存先", value: session.folder ?? "まだ保存していません" },
      { label: "作成", value: dateText(doc.createdAt) },
      { label: "最終保存", value: session.folder ? dateText(doc.updatedAt) : "—" },
    ],
    canOpenFolder: !!session.folder,
  };
}
