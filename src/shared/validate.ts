import {
  AFFINITY_BASE_SUBJECT,
  AFFINITY_STAGE_FIELDS,
  type AffinityConfig,
  type AffinityStage,
  type CastDocument,
  type CastMember,
  type PartnerSettings,
  type ToneExample,
  sendableMembers,
} from "./cast";
import { LIMITS } from "./limits";
import { codePointLength, formatCount, utf16Length } from "./text";

export type EditorTab = "character" | "experience" | "affinity" | "lorebook" | "publish" | "memo";

/** 文書の中の場所（["cast", "name"]、["members", <id>, "profile"] など） */
type FieldPath = readonly (string | number)[];

export interface CastIssue {
  /**
   * error は Zetter で「完成」できない・保存されない内容、warning は Zetter が黙って落とす内容、
   * info は Zetter の画面に写すときの手順の注意
   */
  level: "error" | "warning" | "info";
  tab: EditorTab;
  message: string;
  /** 直す場所（確認欄から飛ぶ先）。場所が 1 つに決まらないものは持たない */
  path?: FieldPath;
}

// ---------------------------------------------------------------------------
// 文字数の集計（Zetter の画面のカウンタと同じ数え方）

export interface BudgetUsage {
  total: number;
  remaining: number;
  over: number;
}

/** 合計のうち、ひとりぶん（本人か登場人物ひとり）が使っている字数。 */
export interface UsageShare {
  /** 本人は null、登場人物はその id */
  memberId: string | null;
  length: number;
}

function usage(shares: readonly UsageShare[], max: number): BudgetUsage {
  const total = shares.reduce((sum, share) => sum + share.length, 0);
  return { total, remaining: Math.max(0, max - total), over: Math.max(0, total - max) };
}

/** 数える登場人物。雑談モードでは登場人物を数えない。 */
function countedMembers(doc: CastDocument) {
  return doc.mode === "chat" ? [] : doc.members;
}

/** 合計の内訳（本人、登場人物の順）。own は本人の字数、ofMember は登場人物ひとりの字数 */
function sharesOf(
  doc: CastDocument,
  own: number,
  ofMember: (member: CastMember) => number,
): UsageShare[] {
  return [
    { memberId: null, length: own },
    ...countedMembers(doc).map((member) => ({ memberId: member.id, length: ofMember(member) })),
  ];
}

/** 「キャラクター設定の合計」の内訳（本人、登場人物の順）。入力中の値をそのまま数える。 */
export function settingsShares(doc: CastDocument): UsageShare[] {
  return sharesOf(doc, utf16Length(doc.persona), (member) => utf16Length(member.profile));
}

/** 「キャラクター設定の合計」。 */
export function settingsUsage(doc: CastDocument): BudgetUsage {
  return usage(settingsShares(doc), LIMITS.settingsTotal);
}

function toneExamplesLength(list: readonly ToneExample[]): number {
  return list.reduce(
    (sum, item) => sum + utf16Length(item.situation) + utf16Length(item.example),
    0,
  );
}

/** 「口調サンプルの使用量（全員合計）」の内訳（本人、登場人物の順）。 */
export function toneShares(doc: CastDocument): UsageShare[] {
  return sharesOf(doc, toneExamplesLength(doc.toneExamples), (member) =>
    toneExamplesLength(member.toneExamples),
  );
}

/** 「口調サンプルの使用量（全員合計）」。 */
export function toneUsage(doc: CastDocument): BudgetUsage {
  return usage(toneShares(doc), LIMITS.toneTotal);
}

export function partnerSettingsLength(settings: PartnerSettings): number {
  return (
    codePointLength(settings.dailyRoutine) +
    codePointLength(settings.messageHabits) +
    codePointLength(settings.proactiveMessages) +
    codePointLength(settings.distanceWhenApart) +
    codePointLength(settings.freeform)
  );
}

export function affinityStageTextLength(stage: AffinityStage): number {
  return AFFINITY_STAGE_FIELDS.reduce((sum, field) => sum + codePointLength(stage[field.key]), 0);
}

/**
 * パートナー設定の 1 欄を書き換えたときに、5 欄の合計が上限を超えないよう挿入分だけを切り詰める
 * （Zetter の入力欄と同じふるまい）。
 */
export function limitPartnerSettingsValue(
  settings: PartnerSettings,
  field: keyof PartnerSettings,
  value: string,
): string {
  const others = { ...settings, [field]: "" };
  const available = Math.max(0, LIMITS.partnerSettingsTotal - partnerSettingsLength(others));
  const previous = Array.from(settings[field]);
  const next = Array.from(value);
  let prefix = 0;
  while (prefix < previous.length && prefix < next.length && previous[prefix] === next[prefix])
    prefix += 1;
  let suffix = 0;
  while (
    suffix < previous.length - prefix &&
    suffix < next.length - prefix &&
    previous[previous.length - suffix - 1] === next[next.length - suffix - 1]
  ) {
    suffix += 1;
  }
  const inserted = next.slice(prefix, next.length - suffix);
  const capacity = Math.max(0, available - (prefix + suffix));
  return [
    ...previous.slice(0, prefix),
    ...inserted.slice(0, capacity),
    ...(suffix ? previous.slice(-suffix) : []),
  ].join("");
}

// ---------------------------------------------------------------------------
// 好感度（Zetter の validateCastAffinityConfigForUi と同じ判定と文言）

export function validateAffinityConfig(config: AffinityConfig): string {
  const itemName = config.itemName.trim();
  if (!itemName || codePointLength(itemName) > LIMITS.affinityItemName)
    return "項目名は1～20文字で入力してください。";
  const { minValue, maxValue, initialValue } = config;
  if (
    minValue === null ||
    maxValue === null ||
    !Number.isSafeInteger(minValue) ||
    !Number.isSafeInteger(maxValue) ||
    minValue >= maxValue
  ) {
    return "好感度の範囲は整数で、最小値より最大値を大きくしてください。";
  }
  if (
    initialValue === null ||
    !Number.isSafeInteger(initialValue) ||
    initialValue < minValue ||
    initialValue > maxValue
  ) {
    return "初期値は範囲内の整数にしてください。";
  }
  if (!["gentle", "normal", "rapid"].includes(config.pace)) return "変化の速さを選択してください。";
  if (config.stages.length < 1 || config.stages.length > LIMITS.affinityStages)
    return "段階は1～10段階にしてください。";
  let previous = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < config.stages.length; index += 1) {
    const stage = config.stages[index] as AffinityStage;
    const start = stage.startValue;
    if (start === null || !Number.isSafeInteger(start) || start < minValue || start > maxValue) {
      return "段階の開始値は範囲内の整数にしてください。";
    }
    if (index > 0 && start === previous)
      return "段階の開始値が重複しています。段階ごとに異なる値を入力してください。";
    if (start < previous) return "段階の開始値は小さい順にしてください。";
    if (index === 0 && start !== minValue) return "最初の段階の開始値は最小値にしてください。";
    if (affinityStageTextLength(stage) > LIMITS.affinityStageText)
      return "各段階の6欄は合計1000文字以内にしてください。";
    if (AFFINITY_STAGE_FIELDS.every((field) => !stage[field.key].trim()))
      return "各段階に態度文を1つ以上入力してください。";
    previous = start;
  }
  return "";
}

/** 開始値がほかの段階と重なっている段階の位置（Zetter の画面の「重複しています」表示用）。 */
export function duplicateStageIndexes(config: AffinityConfig): Set<number> {
  const seen = new Map<number, number[]>();
  config.stages.forEach((stage, index) => {
    if (stage.startValue === null) return;
    seen.set(stage.startValue, [...(seen.get(stage.startValue) ?? []), index]);
  });
  return new Set([...seen.values()].filter((indexes) => indexes.length > 1).flat());
}

// ---------------------------------------------------------------------------
// キャスト全体

function overLimit(value: string, max: number): boolean {
  return utf16Length(value) > max;
}

/** 確認の 1 件。直す場所が 1 つに決まらないものは path を持たせない */
function issue(
  level: CastIssue["level"],
  tab: EditorTab,
  message: string,
  path?: FieldPath,
): CastIssue {
  return path ? { level, tab, message, path } : { level, tab, message };
}

function toneIssues(
  owner: string,
  base: FieldPath,
  list: readonly ToneExample[],
  issues: CastIssue[],
): void {
  if (list.length > LIMITS.toneItemsPerCharacter) {
    const overflow = [...base, "toneExamples", LIMITS.toneItemsPerCharacter, "situation"];
    issues.push(issue("error", "character", `${owner}の口調サンプルは10件までです。`, overflow));
  }
  list.forEach((tone, index) => {
    const label = `${owner}の口調サンプル${index + 1}`;
    const row = [...base, "toneExamples", index];
    if (overLimit(tone.situation, LIMITS.toneSituation)) {
      const message = `${label}の状況は250文字までです。`;
      issues.push(issue("error", "character", message, [...row, "situation"]));
    }
    if (overLimit(tone.example, LIMITS.toneExample)) {
      const message = `${label}の発話例は3500文字までです。`;
      issues.push(issue("error", "character", message, [...row, "example"]));
    }
    const hasSituation = !!tone.situation.trim();
    const hasExample = !!tone.example.trim();
    if (hasSituation !== hasExample) {
      const message = `${label}は状況と発話例の片方が空なので、Zetter では保存されません。`;
      const empty = [...row, hasSituation ? "example" : "situation"];
      issues.push(issue("warning", "character", message, empty));
    }
  });
}

function partnerIssues(
  owner: string,
  base: FieldPath,
  settings: PartnerSettings,
  issues: CastIssue[],
): void {
  const total = partnerSettingsLength(settings);
  if (total > LIMITS.partnerSettingsTotal) {
    const message = `${owner}のパートナー設定は合計${formatCount(LIMITS.partnerSettingsTotal)}字までです（いまは${formatCount(total)}字）。`;
    issues.push(issue("error", "character", message, [...base, "partnerSettings", "dailyRoutine"]));
  }
}

/** Zetter で同じ内容を作るときに問題になる点を集める。ローカルの保存はこれと関係なくできる。 */
export function validateCast(doc: CastDocument): CastIssue[] {
  const issues: CastIssue[] = [];
  const story = doc.mode === "story";
  const members = sendableMembers(doc);

  // キャラクター
  if (!doc.name.trim())
    issues.push(issue("error", "character", "名前を入力してください。", ["cast", "name"]));
  if (overLimit(doc.name, LIMITS.name))
    issues.push(issue("error", "character", "名前は10文字までです。", ["cast", "name"]));
  if (!doc.persona.trim())
    issues.push(issue("error", "character", "性格・設定を入力してください。", ["cast", "persona"]));
  if (story && doc.members.length > LIMITS.members)
    issues.push(issue("error", "character", "登場人物は本人を含めて10人までです。"));
  const unnamed = members.find((member) => !member.name.trim());
  if (unnamed) {
    const message = "登場人物の名前を入力してください。";
    issues.push(issue("error", "character", message, ["members", unnamed.id, "name"]));
  }
  for (const member of members) {
    if (overLimit(member.name, LIMITS.memberName)) {
      const message = `登場人物「${member.name}」の名前は10文字までです。`;
      issues.push(issue("error", "character", message, ["members", member.id, "name"]));
    }
  }
  if (story) {
    for (const member of doc.members) {
      if (!members.includes(member) && partnerSettingsLength(member.partnerSettings) > 0) {
        const message =
          "名前も性格・設定もない登場人物は、パートナー設定だけ書いても Zetter では保存されません。";
        issues.push(issue("warning", "character", message, ["members", member.id, "name"]));
      }
    }
  }

  // 保存時に送られる分（前後の空白を除いた値）で数える。Zetter の保存前の確認と同じ。
  const settingsTotal = members.reduce(
    (sum, member) => sum + utf16Length(member.profile.trim()),
    utf16Length(doc.persona.trim()),
  );
  if (settingsTotal > LIMITS.settingsTotal) {
    const over = settingsTotal - LIMITS.settingsTotal;
    const message = `キャラクター設定（本人の性格・設定と登場人物のプロフィール）は合わせて${formatCount(LIMITS.settingsTotal)}字までです。いまは${formatCount(settingsTotal)}字で、${formatCount(over)}字ぶん超えています。誰の設定を削るかはお任せします（「いまの状況」は別枠です）。`;
    issues.push(issue("error", "character", message, ["cast", "persona"]));
  }
  const sentTone = (list: readonly ToneExample[]) =>
    list
      .map((tone) => ({ situation: tone.situation.trim(), example: tone.example.trim() }))
      .filter((tone) => tone.situation && tone.example);
  const toneTotal = members.reduce(
    (sum, member) => sum + toneExamplesLength(sentTone(member.toneExamples)),
    toneExamplesLength(sentTone(doc.toneExamples)),
  );
  if (toneTotal > LIMITS.toneTotal) {
    const over = toneTotal - LIMITS.toneTotal;
    const message = `口調サンプルは全員の合計で${formatCount(LIMITS.toneTotal)}字までです。いまは${formatCount(toneTotal)}字で、${formatCount(over)}字ぶん超えています。誰の口調サンプルを削るかはお任せします。`;
    issues.push(issue("error", "character", message));
  }
  toneIssues("本人", ["cast"], doc.toneExamples, issues);
  partnerIssues("本人", ["cast"], doc.partnerSettings, issues);
  for (const member of members) {
    const owner = member.name.trim() ? `「${member.name.trim()}」` : "名前のない登場人物";
    toneIssues(owner, ["members", member.id], member.toneExamples, issues);
    partnerIssues(owner, ["members", member.id], member.partnerSettings, issues);
  }

  // 体験設定
  if (story) {
    if (!doc.tagline.trim()) {
      const message = "キャッチコピーを入力してください。";
      issues.push(issue("error", "experience", message, ["cast", "tagline"]));
    }
    if (overLimit(doc.tagline, LIMITS.tagline)) {
      const message = "キャッチコピーは40文字までです。";
      issues.push(issue("error", "experience", message, ["cast", "tagline"]));
    }
    if (overLimit(doc.situation, LIMITS.situation)) {
      const message = "いまの状況は20,000文字までです。";
      issues.push(issue("error", "experience", message, ["cast", "situation"]));
    }
  }
  if (doc.introScript.length > LIMITS.introParts)
    issues.push(issue("error", "experience", "イントロは12パートまでです。"));
  // 雑談モードでは 1 つ目のパートが「最初のひとこと」の欄になる
  const introPath = (index: number): FieldPath =>
    !story && index === 0 ? ["intro", "first", "text"] : ["intro", index, "text"];
  doc.introScript.forEach((part, index) => {
    if (overLimit(part.text, LIMITS.introPart)) {
      const message = `イントロのパート${index + 1}は4000文字までです。`;
      issues.push(issue("error", "experience", message, introPath(index)));
    }
  });
  const emptyParts = doc.introScript.filter((part) => !part.text.trim()).length;
  if (emptyParts > 0) {
    const firstEmpty = doc.introScript.findIndex((part) => !part.text.trim());
    const message = `中身が空のイントロのパートが${emptyParts}件あります。Zetter では保存されません。`;
    issues.push(issue("warning", "experience", message, introPath(firstEmpty)));
  }
  // 登場人物がいるときの話者の選び方（2026-10-21 に Zetter の作成画面で確かめた手順）
  const spokenParts = story
    ? doc.introScript.filter((part) => part.kind === "speech" && part.text.trim())
    : [];
  if (members.length > 0 && spokenParts.length > 0) {
    issues.push(
      issue(
        "info",
        "experience",
        "Zetter では、登場人物がいるキャストのセリフのパートは、話者（本体を含む）を1つずつ選ばないと完成できません。",
      ),
    );
    if (spokenParts.some((part) => part.speakerId)) {
      issues.push(
        issue(
          "info",
          "experience",
          "Zetter では、新しく足した登場人物は一度完成するまで話者に選べません。新しく作るときは、いったん話者を本体にして完成し、編集し直して話者を変えてください。",
        ),
      );
    }
  }
  if (overLimit(doc.aboutText, LIMITS.aboutText)) {
    const message = "このキャストについては3000文字までです。";
    issues.push(issue("error", "experience", message, ["cast", "aboutText"]));
  }
  if (doc.recommendedPersonas.length > LIMITS.personas)
    issues.push(issue("error", "experience", "この会話でのあなたは5件までです。"));
  doc.recommendedPersonas.forEach((persona, index) => {
    const label = `この会話でのあなた${index + 1}`;
    const base = ["personas", persona.id];
    // 「遊ぶ人の名前を使う」のときは名前の欄を使わない
    if (!persona.useViewerName && overLimit(persona.name, LIMITS.personaName)) {
      const message = `${label}の名前は20文字までです。`;
      issues.push(issue("error", "experience", message, [...base, "name"]));
    }
    if (overLimit(persona.tagline, LIMITS.personaTagline)) {
      const message = `${label}の紹介文は50文字までです。`;
      issues.push(issue("error", "experience", message, [...base, "tagline"]));
    }
    if (overLimit(persona.note, LIMITS.personaNote)) {
      const message = `${label}のキャストに伝わるものは2000文字までです。`;
      issues.push(issue("error", "experience", message, [...base, "note"]));
    }
    if (!persona.name.trim() && !persona.useViewerName) {
      const message = `${label}は名前が空なので、Zetter では保存されません（「遊ぶ人の名前を使う」をオンにすれば名前なしでも保存されます）。`;
      issues.push(issue("warning", "experience", message, [...base, "name"]));
    }
  });

  // 好感度（共通設定、本体と登場人物の個別設定の順）
  if (doc.affinity) {
    const { overrides } = doc.affinity;
    const suffix = doc.mode === "story" ? "" : "（雑談モードでは効きません）";
    const checkConfig = (key: string, config: AffinityConfig | undefined, prefix: string) => {
      const error = config ? validateAffinityConfig(config) : "";
      if (error)
        issues.push(issue("error", "affinity", `${prefix}${error}${suffix}`, ["affinity", key]));
    };
    checkConfig("default", doc.affinity.default, "");
    checkConfig(AFFINITY_BASE_SUBJECT, overrides[AFFINITY_BASE_SUBJECT], "本体の個別設定: ");
    for (const member of members) {
      const prefix = `${member.name.trim() || "登場人物"}の個別設定: `;
      checkConfig(member.id, overrides[member.id], prefix);
    }
  }

  // 設定集
  if (doc.lorebooks.length > LIMITS.lorebooks)
    issues.push(issue("error", "lorebook", "連動できる設定集は10冊までです。"));

  // 見た目・公開
  if (doc.tags.length > LIMITS.tags) issues.push(issue("error", "publish", "タグは5個までです。"));
  doc.tags.forEach((tag, index) => {
    if (overLimit(tag, LIMITS.tag))
      issues.push(issue("error", "publish", `タグ${index + 1}は20文字までです。`, ["tags", index]));
  });
  const emptyTags = doc.tags.filter((tag) => !tag.trim()).length;
  if (emptyTags > 0) {
    const firstEmpty = doc.tags.findIndex((tag) => !tag.trim());
    const message = `空のタグが${emptyTags}個あります。Zetter では保存されません。`;
    issues.push(issue("warning", "publish", message, ["tags", firstEmpty]));
  }
  if (story && overLimit(doc.hook, LIMITS.hook))
    issues.push(issue("error", "publish", "一言セリフは40文字までです。", ["cast", "hook"]));
  if (doc.gallery.length > LIMITS.gallery)
    issues.push(issue("error", "publish", "ギャラリー画像は10枚まで登録できます。"));
  return issues;
}

/** タブの見出しに出す「未入力」（Zetter の画面と同じ条件）。 */
export function missingRequired(doc: CastDocument): { character: boolean; experience: boolean } {
  const story = doc.mode === "story";
  const members = sendableMembers(doc);
  return {
    character:
      !doc.name.trim() || !doc.persona.trim() || members.some((member) => !member.name.trim()),
    experience: story && !doc.tagline.trim(),
  };
}
