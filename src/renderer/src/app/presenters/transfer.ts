// 「Zetter へ写す」のタブに描くもの。Zetter の作成画面の順に、コピーする文字・画像・選ぶ値を並べる。
import { formatCount, utf16Length } from "@shared/text";

import { isZetterUrl } from "../machine";
import {
  type TransferItem,
  isCopyable,
  nextTransferItem,
  transferGroups,
  transferStatus,
} from "../transfer";
import type { TransferItemVM, TransferTabVM } from "../viewModels";
import { type Context, copyVM, imageSrc } from "./common";

const STATUS_LABELS = {
  skip: "",
  todo: "まだ",
  done: "済み",
  changed: "書き換えあり",
} as const;

const PREVIEW_LENGTH = 140;

function preview(item: TransferItem): string {
  if (item.kind === "image") return item.image ? item.image.file.replace(/^images\//u, "") : "";
  const flat = item.value.replace(/\s+/gu, " ").trim();
  return flat.length > PREVIEW_LENGTH ? `${flat.slice(0, PREVIEW_LENGTH)}…` : flat;
}

function itemVM(ctx: Context, item: TransferItem): TransferItemVM {
  const status = transferStatus(item, ctx.session.copyLog);
  const flash = ctx.session.ui.flash;
  return {
    key: item.key,
    path: item.path,
    label: item.label,
    kind: item.kind,
    preview: preview(item),
    length: item.kind === "text" && !item.skip ? `${formatCount(utf16Length(item.value))}字` : null,
    status,
    statusLabel: STATUS_LABELS[status],
    skipLabel:
      item.skip === "empty" ? "空（何もしない）" : item.skip === "default" ? "既定のまま" : null,
    notes: item.notes,
    copy: isCopyable(item) ? copyVM(ctx, item.path) : null,
    canShowFile: item.kind === "image" && isCopyable(item),
    thumbnail: item.kind === "image" ? imageSrc(ctx.session, item.image) : null,
    flash: flash?.key === item.key ? flash.nonce : null,
  };
}

export function presentTransfer(ctx: Context): TransferTabVM {
  const groups = transferGroups(ctx.doc);
  const items = groups.flatMap((group) => group.items);
  const statuses = items.map((item) => transferStatus(item, ctx.session.copyLog));
  const total = statuses.filter((status) => status !== "skip").length;
  const done = statuses.filter((status) => status === "done").length;
  const changed = statuses.filter((status) => status === "changed").length;
  const next = nextTransferItem(ctx.doc, ctx.session.copyLog);
  return {
    progress: {
      done,
      total,
      changed,
      text:
        changed > 0
          ? `${total}項目のうち${done}項目が済み、${changed}項目はコピーしたあとに書き換えています。`
          : `${total}項目のうち${done}項目が済んでいます。`,
    },
    next: next ? { label: next.label } : null,
    openLabel: isZetterUrl(ctx.doc.zetterUrl.trim())
      ? "Zetter のこのキャストのページを開く"
      : "Zetter を開く",
    groups: groups.map((group) => {
      const sections: TransferTabVM["groups"][number]["sections"] = [];
      for (const item of group.items) {
        let section = sections.at(-1);
        if (!section || section.title !== item.section) {
          section = { title: item.section, items: [] };
          sections.push(section);
        }
        section.items.push(itemVM(ctx, item));
      }
      return { title: group.title, tab: group.tab, sections };
    }),
    shortcut: "Ctrl+Shift+C",
  };
}
