// Zetter へ写す項目の一覧。Zetter の作成画面の欄と同じ順に並べ、コピーする文字を取り出す。
// 項目のキーは文書の中の場所（"cast/name" など）で、コピーした記録（copied.json）のキーにもなる。
import {
  AFFINITY_BASE_SUBJECT,
  AFFINITY_PACES,
  AFFINITY_STAGE_FIELDS,
  type AffinityConfig,
  type CastDocument,
  type CastImage,
  type CastMember,
  PARTNER_SETTINGS_FIELDS,
  type PartnerSettings,
  type ToneExample,
  createDefaultAffinityConfig,
  createEmptyCast,
  sendableMembers,
} from "@shared/cast";
import { type CopyLog, textHash } from "@shared/copyLog";
import { LIMITS } from "@shared/limits";
import { codePointLength, formatCount, utf16Length } from "@shared/text";
import type { EditorTab } from "@shared/validate";

import { isPendingImage } from "./session";
import { AFFINITY_DEFAULT, type Path, pathKey } from "./types";

/** text はコピーして貼る欄、image は画像ファイルを選ぶ欄、setting は画面で選ぶ・切り替える欄 */
type TransferKind = "text" | "image" | "setting";

export interface TransferItem {
  key: string;
  path: Path;
  /** 編集するタブ */
  tab: EditorTab;
  /** Zetter の作成画面のタブ */
  group: string;
  /** まとまり（本人・登場人物・イントロなど） */
  section: string;
  label: string;
  kind: TransferKind;
  /** コピーする文字（text）・選ぶ値（setting）・画像のファイル（image） */
  value: string;
  /** 何もしなくてよい（空のまま・Zetter の既定のまま） */
  skip: "empty" | "default" | null;
  /** 写すときの注意（上限を超えている・保存されないなど） */
  notes: string[];
  image: CastImage | null;
}

export interface TransferGroup {
  title: string;
  tab: EditorTab;
  items: TransferItem[];
}

/** done はコピー（確認）済み、changed はそのあと書き換えた、todo はまだ */
export type TransferStatus = "skip" | "todo" | "done" | "changed";

export function transferStatus(item: TransferItem, log: CopyLog): TransferStatus {
  if (item.skip) return "skip";
  const record = log[item.key];
  if (!record) return "todo";
  return record.hash === textHash(item.value) ? "done" : "changed";
}

/** コピーできる項目か（画像は保存してファイルになってから） */
export function isCopyable(item: TransferItem): boolean {
  if (item.kind === "text") return !item.skip;
  if (item.kind === "image") return !item.skip && !!item.image && !isPendingImage(item.image);
  return false;
}

// ---------------------------------------------------------------------------

const DEFAULTS = createEmptyCast(new Date(0));
const AFFINITY_TEMPLATE = createDefaultAffinityConfig();

function overNote(value: string, max: number, count = utf16Length): string[] {
  const length = count(value);
  return length > max
    ? [
        `上限の${formatCount(max)}字を${formatCount(length - max)}字超えています。このまま貼ると Zetter では入りきりません。`,
      ]
    : [];
}

class Builder {
  readonly groups: TransferGroup[] = [];
  private current: TransferGroup | null = null;
  private section = "";

  group(title: string, tab: EditorTab): void {
    this.current = { title, tab, items: [] };
    this.groups.push(this.current);
    this.section = "";
  }

  sectionOf(title: string): void {
    this.section = title;
  }

  text(
    path: Path,
    label: string,
    value: string,
    options: { max?: number; codePoints?: boolean; notes?: string[]; skipDefault?: boolean } = {},
  ): void {
    const notes = [
      ...(options.max === undefined
        ? []
        : overNote(value, options.max, options.codePoints ? codePointLength : utf16Length)),
      ...(options.notes ?? []),
    ];
    this.push({
      path,
      label,
      kind: "text",
      value,
      skip: !value.trim() ? "empty" : options.skipDefault ? "default" : null,
      notes,
      image: null,
    });
  }

  image(path: Path, label: string, image: CastImage | null): void {
    this.push({
      path,
      label,
      kind: "image",
      value: image?.file ?? "",
      skip: image ? null : "empty",
      notes: image && isPendingImage(image) ? ["保存すると、ファイルの場所をコピーできます。"] : [],
      image,
    });
  }

  setting(
    path: Path,
    label: string,
    value: string,
    isDefault: boolean,
    notes: string[] = [],
  ): void {
    this.push({
      path,
      label,
      kind: "setting",
      value,
      skip: isDefault ? "default" : null,
      notes,
      image: null,
    });
  }

  private push(item: Omit<TransferItem, "key" | "tab" | "group" | "section">): void {
    const group = this.current;
    if (!group) return;
    group.items.push({
      ...item,
      key: pathKey(item.path),
      tab: group.tab,
      group: group.title,
      section: this.section,
    });
  }
}

const onOff = (value: boolean) => (value ? "オン" : "オフ");

function partnerItems(builder: Builder, base: Path, settings: PartnerSettings): void {
  for (const field of PARTNER_SETTINGS_FIELDS) {
    builder.text(
      [...base, "partnerSettings", field.key],
      `パートナー設定「${field.label}」`,
      settings[field.key],
    );
  }
}

function toneItems(builder: Builder, base: Path, list: readonly ToneExample[]): void {
  list.forEach((tone, index) => {
    const half = !!tone.situation.trim() !== !!tone.example.trim();
    const notes = half ? ["状況と発話例の片方が空なので、Zetter では保存されません。"] : [];
    const row = [...base, "toneExamples", index];
    builder.text([...row, "situation"], `口調サンプル${index + 1}の状況`, tone.situation, {
      max: LIMITS.toneSituation,
      notes,
    });
    builder.text([...row, "example"], `口調サンプル${index + 1}の発話例`, tone.example, {
      max: LIMITS.toneExample,
      notes,
    });
  });
}

function memberItems(
  builder: Builder,
  doc: CastDocument,
  member: CastMember,
  first: boolean,
): void {
  const position = doc.members.indexOf(member) + 2;
  const base = ["members", member.id];
  builder.sectionOf(`${position}人目${member.name.trim() ? `「${member.name.trim()}」` : ""}`);
  builder.text([...base, "name"], "名前", member.name, {
    max: LIMITS.memberName,
    notes: first ? ["Zetter の「登場人物を追加」で人数分の枠を足してから写します。"] : [],
  });
  builder.image([...base, "avatar"], "アイコン", member.avatar);
  builder.text([...base, "profile"], "性格・設定", member.profile, { max: LIMITS.settingsTotal });
  partnerItems(builder, base, member.partnerSettings);
  toneItems(builder, base, member.toneExamples);
}

function affinityItems(
  builder: Builder,
  subject: string,
  title: string,
  config: AffinityConfig,
  override: boolean,
): void {
  const base = ["affinity", subject];
  builder.sectionOf(title);
  if (override && !config.enabled) {
    builder.setting([...base, "disabled"], "このキャラは好感度を使わない", "オン", false);
    return;
  }
  const template = AFFINITY_TEMPLATE;
  builder.text([...base, "itemName"], "項目名", config.itemName, {
    max: LIMITS.affinityItemName,
    codePoints: true,
    skipDefault: config.itemName === template.itemName,
  });
  const number = (value: number | null) => (value === null ? "" : String(value));
  builder.text([...base, "minValue"], "最小値", number(config.minValue), {
    skipDefault: config.minValue === template.minValue,
  });
  builder.text([...base, "maxValue"], "最大値", number(config.maxValue), {
    skipDefault: config.maxValue === template.maxValue,
  });
  builder.text([...base, "initialValue"], "初期値", number(config.initialValue), {
    skipDefault: config.initialValue === template.initialValue,
  });
  const pace =
    AFFINITY_PACES.find((candidate) => candidate.value === config.pace)?.label ?? config.pace;
  builder.setting([...base, "pace"], "変化の速さ", pace, config.pace === template.pace);
  builder.setting(
    [...base, "showInChat"],
    "チャットに好感度を表示する",
    onOff(config.showInChat),
    config.showInChat === template.showInChat,
  );
  config.stages.forEach((stage, index) => {
    const same = template.stages[index];
    const row = [...base, "stages", index];
    // ひな形より段階が多いときは、Zetter で段階を足してから写す
    const stageNotes =
      index === template.stages.length ? ["Zetter で「段階を追加」してから写します。"] : [];
    builder.text([...row, "startValue"], `段階${index + 1}の開始値`, number(stage.startValue), {
      skipDefault: index === 0 || stage.startValue === same?.startValue,
      notes: stageNotes,
    });
    for (const field of AFFINITY_STAGE_FIELDS) {
      builder.text([...row, field.key], `段階${index + 1}の${field.label}`, stage[field.key], {
        skipDefault: !!same && stage[field.key] === same[field.key],
      });
    }
  });
}

function build(doc: CastDocument): TransferGroup[] {
  const builder = new Builder();
  const story = doc.mode === "story";

  // キャラクター
  builder.group("キャラクター", "character");
  builder.sectionOf("本人");
  builder.text(["cast", "name"], "名前", doc.name, { max: LIMITS.name });
  if (story) {
    builder.image(["cast", "avatar"], "アイコン", doc.avatar);
    builder.setting(
      ["cast", "avatarBlurred"],
      "アイコンをぼかして表示する",
      onOff(doc.avatarBlurred),
      doc.avatarBlurred === DEFAULTS.avatarBlurred,
    );
  }
  builder.text(["cast", "persona"], "性格・設定", doc.persona, { max: LIMITS.settingsTotal });
  partnerItems(builder, ["cast"], doc.partnerSettings);
  toneItems(builder, ["cast"], doc.toneExamples);
  sendableMembers(doc).forEach((member, index) => memberItems(builder, doc, member, index === 0));

  // 体験設定
  builder.group("体験設定", "experience");
  builder.sectionOf("");
  builder.setting(
    ["cast", "mode"],
    "モード",
    story ? "ストーリー" : "雑談",
    doc.mode === DEFAULTS.mode,
  );
  if (story) {
    builder.text(["cast", "tagline"], "キャッチコピー", doc.tagline, { max: LIMITS.tagline });
    builder.text(["cast", "situation"], "いまの状況", doc.situation, { max: LIMITS.situation });
    builder.sectionOf("イントロ");
    const members = sendableMembers(doc);
    doc.introScript.forEach((part, index) => {
      const speaker =
        part.kind === "narration"
          ? "ナレーション"
          : part.speakerId
            ? `セリフ（${members.find((member) => member.id === part.speakerId)?.name.trim() || "登場人物"}）`
            : `セリフ（${doc.name.trim() || "キャスト本体"}）`;
      builder.text(["intro", index, "text"], `パート${index + 1}（${speaker}）`, part.text, {
        max: LIMITS.introPart,
      });
    });
  } else {
    builder.text(["intro", "first", "text"], "最初のひとこと", doc.introScript[0]?.text ?? "", {
      max: LIMITS.introPart,
    });
  }
  builder.sectionOf("オプション設定");
  builder.text(["cast", "aboutText"], "このキャストについて", doc.aboutText, {
    max: LIMITS.aboutText,
  });
  doc.recommendedPersonas.forEach((persona, index) => {
    const base = ["personas", persona.id];
    builder.sectionOf(`この会話でのあなた${index + 1}`);
    builder.image([...base, "avatar"], "画像", persona.avatar);
    builder.setting(
      [...base, "useViewerName"],
      "遊ぶ人の名前を使う",
      onOff(persona.useViewerName),
      !persona.useViewerName,
    );
    if (!persona.useViewerName) {
      builder.text([...base, "name"], "名前", persona.name, {
        max: LIMITS.personaName,
        notes: persona.name.trim() ? [] : ["名前が空なので、Zetter では保存されません。"],
      });
    }
    builder.text([...base, "tagline"], "紹介文", persona.tagline, { max: LIMITS.personaTagline });
    builder.text([...base, "note"], "キャストに伝わるもの", persona.note, {
      max: LIMITS.personaNote,
    });
  });

  // 好感度（雑談モードでは効かないので写さない）
  if (story && doc.affinity) {
    builder.group("好感度", "affinity");
    affinityItems(builder, AFFINITY_DEFAULT, "共通設定", doc.affinity.default, false);
    const base = doc.affinity.overrides[AFFINITY_BASE_SUBJECT];
    if (base)
      affinityItems(
        builder,
        AFFINITY_BASE_SUBJECT,
        `${doc.name.trim() || "本体"}の個別設定`,
        base,
        true,
      );
    for (const member of sendableMembers(doc)) {
      const config = doc.affinity.overrides[member.id];
      if (config)
        affinityItems(
          builder,
          member.id,
          `${member.name.trim() || "登場人物"}の個別設定`,
          config,
          true,
        );
    }
  }

  // 設定集（Zetter 側にある設定集を選ぶ）
  if (doc.lorebooks.length > 0) {
    builder.group("設定集", "lorebook");
    doc.lorebooks.forEach((book, index) => {
      builder.setting(
        ["lorebooks", book.id, "title"],
        `連動する設定集${index + 1}`,
        book.title.trim() || "（書名なし）",
        false,
        ["Zetter の設定集の一覧から選びます。"],
      );
    });
  }

  // 見た目・公開
  builder.group("見た目・公開", "publish");
  builder.sectionOf("");
  builder.setting(
    ["cast", "public"],
    "公開する",
    onOff(doc.status === "public"),
    doc.status === DEFAULTS.status,
  );
  builder.image(["cast", "cover"], "カバー画像", doc.cover);
  builder.setting(
    ["cast", "coverBlurred"],
    "カバーをぼかして表示する",
    onOff(doc.coverBlurred),
    doc.coverBlurred === DEFAULTS.coverBlurred,
  );
  if (!story) {
    builder.image(["cast", "avatar"], "アイコン", doc.avatar);
    builder.setting(
      ["cast", "avatarBlurred"],
      "アイコンをぼかして表示する",
      onOff(doc.avatarBlurred),
      doc.avatarBlurred === DEFAULTS.avatarBlurred,
    );
  }
  doc.tags.forEach((tag, index) =>
    builder.text(["tags", index], `タグ${index + 1}`, tag, { max: LIMITS.tag }),
  );
  if (story) builder.text(["cast", "hook"], "一言セリフ", doc.hook, { max: LIMITS.hook });
  builder.image(["cast", "background"], "チャット背景画像", doc.background);
  doc.gallery.forEach((image, index) => {
    builder.image(["gallery", image.id], `ギャラリー画像${index + 1}`, image);
    builder.setting(
      ["gallery", image.id, "blurred"],
      `ギャラリー画像${index + 1}をぼかす`,
      onOff(image.blurred),
      !image.blurred,
    );
  });
  builder.sectionOf("オプション設定");
  builder.setting(
    ["cast", "personaVisible"],
    "設定の公開範囲「人格設定」",
    onOff(!doc.personaHidden),
    doc.personaHidden === DEFAULTS.personaHidden,
  );
  builder.setting(
    ["cast", "toneExamplesVisible"],
    "設定の公開範囲「口調サンプル」",
    onOff(!doc.toneExamplesHidden),
    doc.toneExamplesHidden === DEFAULTS.toneExamplesHidden,
  );
  builder.setting(
    ["cast", "situationVisible"],
    "設定の公開範囲「シチュエーション」",
    onOff(!doc.situationHidden),
    doc.situationHidden === DEFAULTS.situationHidden,
  );
  builder.setting(
    ["cast", "authorVisible"],
    "ページに出す「作者名」",
    onOff(!doc.authorHidden),
    doc.authorHidden === DEFAULTS.authorHidden,
  );
  builder.setting(
    ["cast", "showFavoriteCount"],
    "ページに出す「お気に入り数」",
    onOff(doc.showFavoriteCount),
    doc.showFavoriteCount === DEFAULTS.showFavoriteCount,
  );
  builder.setting(
    ["cast", "showTalkCount"],
    "ページに出す「トーク数」",
    onOff(doc.showTalkCount),
    doc.showTalkCount === DEFAULTS.showTalkCount,
  );

  return builder.groups.filter((group) => group.items.length > 0);
}

const cache = new WeakMap<CastDocument, TransferGroup[]>();

/** Zetter の作成画面の順に並べた、写す項目 */
export function transferGroups(doc: CastDocument): TransferGroup[] {
  let groups = cache.get(doc);
  if (!groups) {
    groups = build(doc);
    cache.set(doc, groups);
  }
  return groups;
}

export function transferItems(doc: CastDocument): TransferItem[] {
  return transferGroups(doc).flatMap((group) => group.items);
}

export function findTransferItem(doc: CastDocument, path: Path): TransferItem | null {
  const key = pathKey(path);
  return transferItems(doc).find((item) => item.key === key) ?? null;
}

/** 次にコピーする項目（まだコピーしていないか、コピーしたあとに書き換えたもの） */
export function nextTransferItem(doc: CastDocument, log: CopyLog): TransferItem | null {
  return (
    transferItems(doc).find((item) => {
      if (!isCopyable(item)) return false;
      const status = transferStatus(item, log);
      return status === "todo" || status === "changed";
    }) ?? null
  );
}
