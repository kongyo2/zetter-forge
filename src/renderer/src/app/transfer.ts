import {
  AFFINITY_BASE_SUBJECT,
  AFFINITY_PACES,
  AFFINITY_RANGE_FIELDS,
  AFFINITY_STAGE_FIELDS,
  type AffinityConfig,
  type AffinityStage,
  type CastDocument,
  type CastImage,
  type CastMember,
  PARTNER_SETTINGS_FIELDS,
  PLAY_GUIDE_FIELDS,
  type PartnerSettings,
  type PlayGuide,
  type ToneExample,
  createDefaultAffinityConfig,
  createEmptyCast,
  filledPlayGuideFields,
  isHalfFilledTone,
  isNamelessPersona,
  isPendingImage,
  overrideTitle,
  sendableMembers,
} from "@shared/cast";
import { type CopyLog, textHash } from "@shared/copyLog";
import { LIMITS } from "@shared/limits";
import { pathText } from "@shared/path";
import { codePointLength, formatCount, numberText, quoted, utf16Length } from "@shared/text";
import { type EditorTab, introUsage } from "@shared/validate";

import { memberOrdinal, selfLabel, stageLabel, toneLabel } from "./labels";
import { perDocument } from "./memo";
import { AFFINITY_DEFAULT, type Path } from "./types";

type TransferKind = "text" | "image" | "setting";

export interface TransferItem {
  key: string;
  path: Path;
  tab: EditorTab;
  group: string;
  section: string;
  label: string;
  kind: TransferKind;
  value: string;
  skip: "empty" | "default" | null;
  notes: string[];
  image: CastImage | null;
}

export interface TransferGroup {
  title: string;
  tab: EditorTab;
  items: TransferItem[];
}

export type TransferStatus = "skip" | "todo" | "done" | "changed";

export function transferStatus(item: TransferItem, log: CopyLog): TransferStatus {
  if (item.skip) return "skip";
  const record = log[item.key];
  if (!record) return "todo";
  return record.hash === textHash(item.value) ? "done" : "changed";
}

export function isOutstanding(item: TransferItem, log: CopyLog): boolean {
  const status = transferStatus(item, log);
  return status === "todo" || status === "changed";
}

export function isCopyable(item: TransferItem): boolean {
  if (item.kind === "text") return !item.skip;
  if (item.kind === "image") return !item.skip && !!item.image && !isPendingImage(item.image);
  return false;
}

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
      notes: isPendingImage(image) ? ["保存すると、ファイルの場所をコピーできます。"] : [],
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
      key: pathText(item.path),
      tab: group.tab,
      group: group.title,
      section: this.section,
    });
  }
}

const onOff = (value: boolean) => (value ? "オン" : "オフ");

function avatarItems(builder: Builder, doc: CastDocument): void {
  builder.image(["cast", "avatar"], "アイコン", doc.avatar);
  builder.setting(
    ["cast", "avatarBlurred"],
    "アイコンをぼかして表示する",
    onOff(doc.avatarBlurred),
    doc.avatarBlurred === DEFAULTS.avatarBlurred,
  );
}

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
    const notes = isHalfFilledTone(tone)
      ? ["状況と発話例の片方が空なので、Zetter では保存されません。"]
      : [];
    const row = [...base, "toneExamples", index];
    builder.text([...row, "situation"], toneLabel(index, "状況"), tone.situation, {
      max: LIMITS.toneSituation,
      notes,
    });
    builder.text([...row, "example"], toneLabel(index, "発話例"), tone.example, {
      max: LIMITS.toneExample,
      notes,
    });
  });
}

function playGuideItems(builder: Builder, guide: PlayGuide): void {
  if (filledPlayGuideFields(guide).length === 0) return;
  builder.sectionOf("遊び方シート");
  for (const field of PLAY_GUIDE_FIELDS) {
    const entry = guide[field.key];
    const base = ["playGuide", field.key];
    builder.text([...base, "text"], field.label, entry.text, {
      max: LIMITS.playGuide[field.key],
    });
    if (entry.text.trim()) {
      builder.setting(
        [...base, "hidden"],
        `${field.label}の「隠しておく」`,
        onOff(entry.hidden),
        entry.hidden === field.hiddenByDefault,
      );
    }
  }
}

function memberItems(
  builder: Builder,
  doc: CastDocument,
  member: CastMember,
  first: boolean,
): void {
  const base = ["members", member.id];
  builder.sectionOf(`${memberOrdinal(doc.members.indexOf(member))}${quoted(member.name)}`);
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
  common: AffinityConfig | null,
): void {
  const base = ["affinity", subject];
  builder.sectionOf(title);
  if (common && !config.enabled) {
    builder.setting([...base, "disabled"], "このキャラは好感度を使わない", "オン", false);
    return;
  }
  const baselines = common ? [AFFINITY_TEMPLATE, common] : [AFFINITY_TEMPLATE];
  const unchanged = (pick: (target: AffinityConfig) => unknown) =>
    baselines.every((baseline) => pick(baseline) === pick(config));
  builder.text([...base, "itemName"], "項目名", config.itemName, {
    max: LIMITS.affinityItemName,
    codePoints: true,
    skipDefault: unchanged((target) => target.itemName),
  });
  for (const field of AFFINITY_RANGE_FIELDS) {
    builder.text([...base, field.key], field.label, numberText(config[field.key]), {
      skipDefault: unchanged((target) => target[field.key]),
    });
  }
  const pace =
    AFFINITY_PACES.find((candidate) => candidate.value === config.pace)?.label ?? config.pace;
  builder.setting(
    [...base, "pace"],
    "変化の速さ",
    pace,
    unchanged((target) => target.pace),
  );
  builder.setting(
    [...base, "showInChat"],
    "チャットに好感度を表示する",
    onOff(config.showInChat),
    unchanged((target) => target.showInChat),
  );
  config.stages.forEach((stage, index) => {
    const row = [...base, "stages", index];
    const stageNotes =
      index === AFFINITY_TEMPLATE.stages.length
        ? ["Zetter で「段階を追加」してから写します。"]
        : [];
    const stageUnchanged = (key: keyof AffinityStage) =>
      baselines.every((baseline) => {
        const same = baseline.stages[index];
        return !!same && same[key] === stage[key];
      });
    builder.text(
      [...row, "startValue"],
      stageLabel(index, "開始値"),
      numberText(stage.startValue),
      {
        skipDefault: index === 0 || stageUnchanged("startValue"),
        notes: stageNotes,
      },
    );
    for (const field of AFFINITY_STAGE_FIELDS) {
      builder.text([...row, field.key], stageLabel(index, field.label), stage[field.key], {
        skipDefault: stageUnchanged(field.key),
      });
    }
  });
}

function build(doc: CastDocument): TransferGroup[] {
  const builder = new Builder();
  const story = doc.mode === "story";

  builder.group("キャラクター", "character");
  builder.sectionOf("本人");
  builder.text(["cast", "name"], "名前", doc.name, { max: LIMITS.name });
  if (story) avatarItems(builder, doc);
  builder.text(["cast", "persona"], "性格・設定", doc.persona, { max: LIMITS.settingsTotal });
  partnerItems(builder, ["cast"], doc.partnerSettings);
  toneItems(builder, ["cast"], doc.toneExamples);
  sendableMembers(doc).forEach((member, index) => memberItems(builder, doc, member, index === 0));

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
    const intro = introUsage(doc);
    doc.introScript.forEach((part, index) => {
      const speaker =
        part.kind === "narration"
          ? "ナレーション"
          : part.speakerId
            ? `セリフ（${members.find((member) => member.id === part.speakerId)?.name.trim() || "登場人物"}）`
            : `セリフ（${doc.name.trim() || "キャスト本体"}）`;
      builder.text(["intro", index, "text"], `パート${index + 1}（${speaker}）`, part.text, {
        max: LIMITS.introPart,
        notes:
          index === intro.crossing
            ? [
                `イントロは全部のパートを合わせて${formatCount(LIMITS.introTotal)}字までです（いまは${formatCount(intro.total)}字）。このパートで上限を超えます。`,
              ]
            : [],
      });
    });
  } else {
    builder.text(["intro", "first", "text"], "最初のひとこと", doc.introScript[0]?.text ?? "", {
      max: LIMITS.introPart,
    });
  }
  playGuideItems(builder, doc.playGuide);
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
        notes: isNamelessPersona(persona) ? ["名前が空なので、Zetter では保存されません。"] : [],
      });
    }
    builder.text([...base, "tagline"], "紹介文", persona.tagline, { max: LIMITS.personaTagline });
    builder.text([...base, "note"], "キャストに伝わるもの", persona.note, {
      max: LIMITS.personaNote,
    });
  });

  if (story && doc.affinity) {
    builder.group("好感度", "affinity");
    const common = doc.affinity.default;
    affinityItems(builder, AFFINITY_DEFAULT, "共通設定", common, null);
    const base = doc.affinity.overrides[AFFINITY_BASE_SUBJECT];
    if (base)
      affinityItems(builder, AFFINITY_BASE_SUBJECT, `${selfLabel(doc)}の個別設定`, base, common);
    for (const member of sendableMembers(doc)) {
      const config = doc.affinity.overrides[member.id];
      if (config) affinityItems(builder, member.id, overrideTitle(member), config, common);
    }
  }

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
  if (!story) avatarItems(builder, doc);
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

export const transferGroups = perDocument(build);

export function transferItems(doc: CastDocument): TransferItem[] {
  return transferGroups(doc).flatMap((group) => group.items);
}

export function findTransferItem(doc: CastDocument, path: Path): TransferItem | null {
  const key = pathText(path);
  return transferItems(doc).find((item) => item.key === key) ?? null;
}

export function nextTransferItem(doc: CastDocument, log: CopyLog): TransferItem | null {
  return transferItems(doc).find((item) => isCopyable(item) && isOutstanding(item, log)) ?? null;
}
