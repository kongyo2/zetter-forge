import {
  AFFINITY_BASE_SUBJECT,
  AFFINITY_STAGE_FIELDS,
  type AffinityConfig,
  type AffinityStage,
  type CastDocument,
  type CastMember,
  PLAY_GUIDE_FIELDS,
  type PartnerSettings,
  type ToneExample,
  filledStageFields,
  isAffinityPace,
  isHalfFilledTone,
  isNamelessPersona,
  overrideTitle,
  sendableMembers,
} from "./cast";
import { LIMITS } from "./limits";
import type { Path } from "./path";
import { codePointLength, formatCount, quoted, sumLengths, utf16Length } from "./text";

export type EditorTab = "character" | "experience" | "affinity" | "lorebook" | "publish" | "memo";

export interface CastIssue {
  level: "error" | "warning" | "info";
  tab: EditorTab;
  message: string;
  path?: Path;
}

export interface BudgetUsage {
  total: number;
  remaining: number;
  over: number;
}

export interface UsageShare {
  memberId: string | null;
  length: number;
}

function budget(total: number, max: number): BudgetUsage {
  return { total, remaining: Math.max(0, max - total), over: Math.max(0, total - max) };
}

function usage(shares: readonly UsageShare[], max: number): BudgetUsage {
  return budget(sumLengths(shares), max);
}

function countedMembers(doc: CastDocument) {
  return doc.mode === "chat" ? [] : doc.members;
}

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

export function settingsShares(doc: CastDocument): UsageShare[] {
  return sharesOf(doc, utf16Length(doc.persona), (member) => utf16Length(member.profile));
}

export function settingsUsage(doc: CastDocument): BudgetUsage {
  return usage(settingsShares(doc), LIMITS.settingsTotal);
}

function toneExamplesLength(list: readonly ToneExample[]): number {
  return list.reduce(
    (sum, item) => sum + utf16Length(item.situation) + utf16Length(item.example),
    0,
  );
}

export function toneShares(doc: CastDocument): UsageShare[] {
  return sharesOf(doc, toneExamplesLength(doc.toneExamples), (member) =>
    toneExamplesLength(member.toneExamples),
  );
}

export function toneUsage(doc: CastDocument): BudgetUsage {
  return usage(toneShares(doc), LIMITS.toneTotal);
}

export interface IntroUsage extends BudgetUsage {
  crossing: number | null;
}

export function introUsage(doc: CastDocument): IntroUsage {
  let total = 0;
  let crossing: number | null = null;
  doc.introScript.forEach((part, index) => {
    total += utf16Length(part.text.trim());
    if (crossing === null && total > LIMITS.introTotal) crossing = index;
  });
  return { ...budget(total, LIMITS.introTotal), crossing };
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

export function affinityRange(config: AffinityConfig): { min: number; max: number } | null {
  const { minValue: min, maxValue: max } = config;
  if (min === null || max === null || !Number.isSafeInteger(min) || !Number.isSafeInteger(max))
    return null;
  return min < max ? { min, max } : null;
}

export function isIntegerWithin(value: number | null, min: number, max: number): value is number {
  return value !== null && Number.isSafeInteger(value) && value >= min && value <= max;
}

export function validateAffinityConfig(config: AffinityConfig): string {
  const itemName = config.itemName.trim();
  if (!itemName || codePointLength(itemName) > LIMITS.affinityItemName)
    return "項目名は1～20文字で入力してください。";
  const range = affinityRange(config);
  if (!range) return "好感度の範囲は整数で、最小値より最大値を大きくしてください。";
  const { min, max } = range;
  if (!isIntegerWithin(config.initialValue, min, max))
    return "初期値は範囲内の整数にしてください。";
  if (!isAffinityPace(config.pace)) return "変化の速さを選択してください。";
  if (config.stages.length < 1 || config.stages.length > LIMITS.affinityStages)
    return "段階は1～10段階にしてください。";
  let previous = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < config.stages.length; index += 1) {
    const stage = config.stages[index] as AffinityStage;
    const start = stage.startValue;
    if (!isIntegerWithin(start, min, max)) return "段階の開始値は範囲内の整数にしてください。";
    if (index > 0 && start === previous)
      return "段階の開始値が重複しています。段階ごとに異なる値を入力してください。";
    if (start < previous) return "段階の開始値は小さい順にしてください。";
    if (index === 0 && start !== min) return "最初の段階の開始値は最小値にしてください。";
    if (affinityStageTextLength(stage) > LIMITS.affinityStageText)
      return "各段階の6欄は合計1000文字以内にしてください。";
    if (filledStageFields(stage).length === 0) return "各段階に態度文を1つ以上入力してください。";
    previous = start;
  }
  return "";
}

export function duplicateStageIndexes(config: AffinityConfig): Set<number> {
  const seen = new Map<number, number[]>();
  config.stages.forEach((stage, index) => {
    if (stage.startValue === null) return;
    seen.set(stage.startValue, [...(seen.get(stage.startValue) ?? []), index]);
  });
  return new Set([...seen.values()].filter((indexes) => indexes.length > 1).flat());
}

function overLimit(value: string, max: number): boolean {
  return utf16Length(value) > max;
}

function overTotal(total: number, max: number): string {
  return `${formatCount(max)}字までです。いまは${formatCount(total)}字で、${formatCount(total - max)}字ぶん超えています。`;
}

function blanks<T>(
  items: readonly T[],
  text: (item: T) => string,
): { count: number; first: number } {
  const blank = (item: T) => !text(item).trim();
  return { count: items.filter(blank).length, first: items.findIndex(blank) };
}

function isUnnamed(member: CastMember): boolean {
  return !member.name.trim();
}

function issue(level: CastIssue["level"], tab: EditorTab, message: string, path?: Path): CastIssue {
  return path ? { level, tab, message, path } : { level, tab, message };
}

function toneIssues(
  owner: string,
  base: Path,
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
    if (isHalfFilledTone(tone)) {
      const message = `${label}は状況と発話例の片方が空なので、Zetter では保存されません。`;
      const empty = [...row, tone.situation.trim() ? "example" : "situation"];
      issues.push(issue("warning", "character", message, empty));
    }
  });
}

function partnerIssues(
  owner: string,
  base: Path,
  settings: PartnerSettings,
  issues: CastIssue[],
): void {
  const total = partnerSettingsLength(settings);
  if (total > LIMITS.partnerSettingsTotal) {
    const message = `${owner}のパートナー設定は合計${formatCount(LIMITS.partnerSettingsTotal)}字までです（いまは${formatCount(total)}字）。`;
    issues.push(issue("error", "character", message, [...base, "partnerSettings", "dailyRoutine"]));
  }
}

export function validateCast(doc: CastDocument): CastIssue[] {
  const issues: CastIssue[] = [];
  const story = doc.mode === "story";
  const members = sendableMembers(doc);

  if (!doc.name.trim())
    issues.push(issue("error", "character", "名前を入力してください。", ["cast", "name"]));
  if (overLimit(doc.name, LIMITS.name))
    issues.push(issue("error", "character", "名前は10文字までです。", ["cast", "name"]));
  if (!doc.persona.trim())
    issues.push(issue("error", "character", "性格・設定を入力してください。", ["cast", "persona"]));
  if (story && doc.members.length > LIMITS.members)
    issues.push(issue("error", "character", "登場人物は本人を含めて10人までです。"));
  const unnamed = members.find(isUnnamed);
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

  const settingsTotal = members.reduce(
    (sum, member) => sum + utf16Length(member.profile.trim()),
    utf16Length(doc.persona.trim()),
  );
  if (settingsTotal > LIMITS.settingsTotal) {
    const message = `キャラクター設定（本人の性格・設定と登場人物のプロフィール）は合わせて${overTotal(settingsTotal, LIMITS.settingsTotal)}誰の設定を削るかはお任せします（「いまの状況」は別枠です）。`;
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
    const message = `口調サンプルは全員の合計で${overTotal(toneTotal, LIMITS.toneTotal)}誰の口調サンプルを削るかはお任せします。`;
    issues.push(issue("error", "character", message));
  }
  toneIssues("本人", ["cast"], doc.toneExamples, issues);
  partnerIssues("本人", ["cast"], doc.partnerSettings, issues);
  for (const member of members) {
    const owner = quoted(member.name) || "名前のない登場人物";
    toneIssues(owner, ["members", member.id], member.toneExamples, issues);
    partnerIssues(owner, ["members", member.id], member.partnerSettings, issues);
  }

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
  const introPath = (index: number): Path =>
    !story && index === 0 ? ["intro", "first", "text"] : ["intro", index, "text"];
  doc.introScript.forEach((part, index) => {
    if (overLimit(part.text, LIMITS.introPart)) {
      const message = `イントロのパート${index + 1}は4000文字までです。`;
      issues.push(issue("error", "experience", message, introPath(index)));
    }
  });
  const intro = introUsage(doc);
  if (story && intro.crossing !== null) {
    const message = `イントロは全部のパートを合わせて${overTotal(intro.total, LIMITS.introTotal)}どのパートを削るかはお任せします。`;
    issues.push(issue("error", "experience", message, ["intro", intro.crossing, "text"]));
  }
  const emptyParts = blanks(doc.introScript, (part) => part.text);
  if (emptyParts.count > 0) {
    const message = `中身が空のイントロのパートが${emptyParts.count}件あります。Zetter では保存されません。`;
    issues.push(issue("warning", "experience", message, introPath(emptyParts.first)));
  }
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
  for (const field of PLAY_GUIDE_FIELDS) {
    const max = LIMITS.playGuide[field.key];
    if (overLimit(doc.playGuide[field.key].text, max)) {
      const message = `遊び方シートの「${field.label}」は${max}文字までです。`;
      issues.push(issue("error", "experience", message, ["playGuide", field.key, "text"]));
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
    if (isNamelessPersona(persona)) {
      const message = `${label}は名前が空なので、Zetter では保存されません（「遊ぶ人の名前を使う」をオンにすれば名前なしでも保存されます）。`;
      issues.push(issue("warning", "experience", message, [...base, "name"]));
    }
  });

  if (doc.affinity) {
    const { overrides } = doc.affinity;
    const suffix = story ? "" : "（雑談モードでは効きません）";
    const checkConfig = (key: string, config: AffinityConfig | undefined, prefix: string) => {
      const error = config ? validateAffinityConfig(config) : "";
      if (error)
        issues.push(issue("error", "affinity", `${prefix}${error}${suffix}`, ["affinity", key]));
    };
    checkConfig("default", doc.affinity.default, "");
    checkConfig(AFFINITY_BASE_SUBJECT, overrides[AFFINITY_BASE_SUBJECT], "本体の個別設定: ");
    for (const member of members) {
      checkConfig(member.id, overrides[member.id], `${overrideTitle(member)}: `);
    }
  }

  if (doc.lorebooks.length > LIMITS.lorebooks)
    issues.push(issue("error", "lorebook", "連動できる設定集は10冊までです。"));

  if (doc.tags.length > LIMITS.tags) issues.push(issue("error", "publish", "タグは5個までです。"));
  doc.tags.forEach((tag, index) => {
    if (overLimit(tag, LIMITS.tag))
      issues.push(issue("error", "publish", `タグ${index + 1}は20文字までです。`, ["tags", index]));
  });
  const emptyTags = blanks(doc.tags, (tag) => tag);
  if (emptyTags.count > 0) {
    const message = `空のタグが${emptyTags.count}個あります。Zetter では保存されません。`;
    issues.push(issue("warning", "publish", message, ["tags", emptyTags.first]));
  }
  if (story && overLimit(doc.hook, LIMITS.hook))
    issues.push(issue("error", "publish", "一言セリフは40文字までです。", ["cast", "hook"]));
  if (doc.gallery.length > LIMITS.gallery)
    issues.push(issue("error", "publish", "ギャラリー画像は10枚まで登録できます。"));
  return issues;
}

export function missingRequired(doc: CastDocument): { character: boolean; experience: boolean } {
  const story = doc.mode === "story";
  const members = sendableMembers(doc);
  return {
    character: !doc.name.trim() || !doc.persona.trim() || members.some(isUnnamed),
    experience: story && !doc.tagline.trim(),
  };
}
