import type { ImageKind, ImageMetrics } from "./images";
import { type JsonObject, asRecord, booleanOr, isRecord, stringOr } from "./json";
import { LIMITS } from "./limits";

export const CAST_FILE_FORMAT = "zetter-forge/cast";
export const CAST_FILE_VERSION = 1;

export type CastMode = "story" | "chat";
export type CastStatus = "private" | "public";
type IntroKind = "narration" | "speech";
export type AffinityPace = "gentle" | "normal" | "rapid";

export const AFFINITY_BASE_SUBJECT = "__cast_base__";

export interface CastImage extends ImageMetrics {
  file: string;
}

export interface GalleryImage extends CastImage {
  id: string;
  blurred: boolean;
}

export interface ToneExample {
  situation: string;
  example: string;
}

export interface IntroPart {
  kind: IntroKind;
  text: string;
  speakerId: string | null;
}

export interface PartnerSettings {
  dailyRoutine: string;
  messageHabits: string;
  proactiveMessages: string;
  distanceWhenApart: string;
  freeform: string;
}

export interface CastMember {
  id: string;
  name: string;
  profile: string;
  toneExamples: ToneExample[];
  partnerSettings: PartnerSettings;
  avatar: CastImage | null;
}

export interface RecommendedPersona {
  id: string;
  name: string;
  useViewerName: boolean;
  tagline: string;
  note: string;
  avatar: CastImage | null;
}

export type PlayGuideKey = "summary" | "world" | "role" | "start" | "first" | "hint" | "gimmick";

interface PlayGuideEntry {
  text: string;
  hidden: boolean;
}

export type PlayGuide = Record<PlayGuideKey, PlayGuideEntry>;

export interface AffinityStage {
  startValue: number | null;
  callText: string;
  speechText: string;
  distanceText: string;
  agencyText: string;
  avoidText: string;
  freeText: string;
}

export interface AffinityConfig {
  itemName: string;
  minValue: number | null;
  maxValue: number | null;
  initialValue: number | null;
  pace: AffinityPace;
  showInChat: boolean;
  enabled: boolean;
  stages: AffinityStage[];
}

interface CastAffinity {
  default: AffinityConfig;
  overrides: Record<string, AffinityConfig>;
}

interface LorebookNote {
  id: string;
  title: string;
  note: string;
}

export interface CastDocument {
  format: typeof CAST_FILE_FORMAT;
  formatVersion: number;
  id: string;
  createdAt: string;
  updatedAt: string;
  mode: CastMode;
  status: CastStatus;
  name: string;
  persona: string;
  avatar: CastImage | null;
  avatarBlurred: boolean;
  partnerSettings: PartnerSettings;
  toneExamples: ToneExample[];
  members: CastMember[];
  tagline: string;
  situation: string;
  introScript: IntroPart[];
  aboutText: string;
  playGuide: PlayGuide;
  recommendedPersonas: RecommendedPersona[];
  affinity: CastAffinity | null;
  lorebooks: LorebookNote[];
  cover: CastImage | null;
  coverBlurred: boolean;
  tags: string[];
  hook: string;
  background: CastImage | null;
  gallery: GalleryImage[];
  personaHidden: boolean;
  toneExamplesHidden: boolean;
  situationHidden: boolean;
  authorHidden: boolean;
  showFavoriteCount: boolean;
  showTalkCount: boolean;
  zetterUrl: string;
  memo: string;
}

export const PARTNER_SETTINGS_FIELDS = [
  {
    key: "dailyRoutine",
    label: "ふだんの1日",
    placeholder:
      "朝は7時ごろ起きて、コーヒーを淹れてから仕事へ。昼は外で済ませることが多い。夜は23時ごろまで本を読んでいる…",
  },
  {
    key: "messageHabits",
    label: "メッセージの癖",
    placeholder: "返事はわりと早いけど、一言だけのことが多い。絵文字はほとんど使わない…",
  },
  {
    key: "proactiveMessages",
    label: "自分から送ること",
    placeholder: "朝に天気の話をすることがある。きれいな景色を見つけたら写真の話をしたがる…",
  },
  {
    key: "distanceWhenApart",
    label: "離れているときの距離感",
    placeholder: "会えない日は少しそっけないふりをするけど、本当は返事を待っている…",
  },
  { key: "freeform", label: "自由に", placeholder: "そのほか、DMでのこのキャラについて自由に。" },
] as const satisfies readonly { key: keyof PartnerSettings; label: string; placeholder: string }[];

export const PARTNER_TIME_CHIPS = ["朝", "昼", "夕方", "夜", "深夜"] as const;
export const PARTNER_HABIT_CHIPS = [
  "返事が早い",
  "気まぐれに返す",
  "一言で返す",
  "絵文字を使う",
  "絵文字は使わない",
] as const;

export const PLAY_GUIDE_FIELDS = [
  { key: "summary", label: "あらすじ", hiddenByDefault: false },
  { key: "world", label: "世界観", hiddenByDefault: false },
  { key: "role", label: "あなたの役割", hiddenByDefault: false },
  { key: "start", label: "始まりの状況", hiddenByDefault: false },
  { key: "first", label: "最初にできること（1行に1つ）", hiddenByDefault: false },
  { key: "hint", label: "迷ったときのヒント", hiddenByDefault: false },
  { key: "gimmick", label: "隠しギミック", hiddenByDefault: true },
] as const satisfies readonly { key: PlayGuideKey; label: string; hiddenByDefault: boolean }[];

export const AFFINITY_STAGE_FIELDS = [
  { key: "callText", label: "呼び方", multiline: false },
  { key: "speechText", label: "話し方", multiline: true },
  { key: "distanceText", label: "距離感", multiline: true },
  { key: "agencyText", label: "主体性", multiline: true },
  { key: "avoidText", label: "避けること", multiline: true },
  { key: "freeText", label: "自由記述", multiline: true },
] as const satisfies readonly { key: keyof AffinityStage; label: string; multiline: boolean }[];

export const AFFINITY_RANGE_FIELDS = [
  { key: "minValue", label: "最小値" },
  { key: "maxValue", label: "最大値" },
  { key: "initialValue", label: "初期値" },
] as const satisfies readonly { key: keyof AffinityConfig; label: string }[];

export function isFieldKey<K extends string>(
  fields: readonly { key: K }[],
  key: unknown,
): key is K {
  return fields.some((field) => field.key === key);
}

export const AFFINITY_PACES: readonly { value: AffinityPace; label: string }[] = [
  { value: "gentle", label: "緩やか" },
  { value: "normal", label: "普通" },
  { value: "rapid", label: "急接近" },
];

export function isAffinityPace(value: unknown): value is AffinityPace {
  return AFFINITY_PACES.some((pace) => pace.value === value);
}

export function newId(): string {
  return globalThis.crypto.randomUUID();
}

export function castImage(file: string, image: ImageMetrics): CastImage {
  return { file, width: image.width, height: image.height, bytes: image.bytes };
}

export function isPendingFile(file: string): boolean {
  return file.startsWith("pending:");
}

export function isPendingImage(image: CastImage | null | undefined): boolean {
  return !!image && isPendingFile(image.file);
}

export function createEmptyPartnerSettings(): PartnerSettings {
  return {
    dailyRoutine: "",
    messageHabits: "",
    proactiveMessages: "",
    distanceWhenApart: "",
    freeform: "",
  };
}

export function createEmptyMember(): CastMember {
  return {
    id: newId(),
    name: "",
    profile: "",
    toneExamples: [],
    partnerSettings: createEmptyPartnerSettings(),
    avatar: null,
  };
}

export function createEmptyPersona(): RecommendedPersona {
  return { id: newId(), name: "", useViewerName: false, tagline: "", note: "", avatar: null };
}

export function createEmptyPlayGuide(): PlayGuide {
  return Object.fromEntries(
    PLAY_GUIDE_FIELDS.map((field) => [field.key, { text: "", hidden: field.hiddenByDefault }]),
  ) as PlayGuide;
}

export function createEmptyStage(startValue: number | null): AffinityStage {
  return {
    startValue,
    callText: "",
    speechText: "",
    distanceText: "",
    agencyText: "",
    avoidText: "",
    freeText: "",
  };
}

export function createDefaultAffinityConfig(): AffinityConfig {
  const stage = (startValue: number, freeText: string): AffinityStage => ({
    ...createEmptyStage(startValue),
    freeText,
  });
  return {
    itemName: "好感度",
    minValue: 0,
    maxValue: 100,
    initialValue: 0,
    pace: "normal",
    showInChat: true,
    enabled: true,
    stages: [
      stage(0, "まだ距離を測っている。丁寧だが慎重に接する。"),
      stage(25, "少し打ち解け、相手に興味を示す。"),
      stage(50, "信頼を見せ、気持ちを少し言葉にする。"),
      stage(75, "親しく接するが、相手の意思と距離感を尊重する。"),
    ],
  };
}

export function createEmptyCast(now = new Date()): CastDocument {
  const timestamp = now.toISOString();
  return {
    format: CAST_FILE_FORMAT,
    formatVersion: CAST_FILE_VERSION,
    id: newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    mode: "story",
    status: "private",
    name: "",
    persona: "",
    avatar: null,
    avatarBlurred: false,
    partnerSettings: createEmptyPartnerSettings(),
    toneExamples: [],
    members: [],
    tagline: "",
    situation: "",
    introScript: [],
    aboutText: "",
    playGuide: createEmptyPlayGuide(),
    recommendedPersonas: [],
    affinity: null,
    lorebooks: [],
    cover: null,
    coverBlurred: false,
    tags: [],
    hook: "",
    background: null,
    gallery: [],
    personaHidden: true,
    toneExamplesHidden: true,
    situationHidden: true,
    authorHidden: false,
    showFavoriteCount: true,
    showTalkCount: true,
    zetterUrl: "",
    memo: "",
  };
}

function intOrNull(value: unknown, fallback: number | null): number | null {
  if (value === null || value === "") return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : fallback;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function idOf(source: JsonObject): string {
  return stringOr(source.id) || newId();
}

function keepExtras<T extends object>(raw: unknown, known: T): T {
  if (!isRecord(raw)) return known;
  const extras: JsonObject = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!(key in known)) extras[key] = value;
  }
  return { ...known, ...extras };
}

function normalizeImage(raw: unknown, keepPending = false): CastImage | null {
  if (!isRecord(raw) || typeof raw.file !== "string" || !raw.file) return null;
  if (!keepPending && isPendingFile(raw.file)) return null;
  const size = (value: unknown) => (Number.isFinite(value) ? Number(value) : 0);
  return keepExtras(raw, {
    file: raw.file,
    width: size(raw.width),
    height: size(raw.height),
    bytes: size(raw.bytes),
  });
}

function normalizeGalleryImage(raw: unknown, keepPending = false): GalleryImage | null {
  const image = normalizeImage(raw, keepPending);
  if (!image || !isRecord(raw)) return null;
  return keepExtras(raw, {
    ...image,
    id: idOf(raw),
    blurred: booleanOr(raw.blurred, false),
  });
}

function normalizeToneExample(raw: unknown): ToneExample {
  const source = asRecord(raw);
  return keepExtras(raw, {
    situation: stringOr(source.situation),
    example: stringOr(source.example),
  });
}

function normalizePartnerSettings(raw: unknown): PartnerSettings {
  const source = asRecord(raw);
  return keepExtras(raw, {
    dailyRoutine: stringOr(source.dailyRoutine),
    messageHabits: stringOr(source.messageHabits),
    proactiveMessages: stringOr(source.proactiveMessages),
    distanceWhenApart: stringOr(source.distanceWhenApart),
    freeform: stringOr(source.freeform),
  });
}

function normalizeMember(raw: unknown, keepPending = false): CastMember {
  const source = asRecord(raw);
  return keepExtras(raw, {
    id: idOf(source),
    name: stringOr(source.name),
    profile: stringOr(source.profile),
    toneExamples: list(source.toneExamples).map(normalizeToneExample),
    partnerSettings: normalizePartnerSettings(source.partnerSettings),
    avatar: normalizeImage(source.avatar, keepPending),
  });
}

function normalizePersona(raw: unknown, keepPending = false): RecommendedPersona {
  const source = asRecord(raw);
  return keepExtras(raw, {
    id: idOf(source),
    name: stringOr(source.name),
    useViewerName: booleanOr(source.useViewerName, false),
    tagline: stringOr(source.tagline),
    note: stringOr(source.note),
    avatar: normalizeImage(source.avatar, keepPending),
  });
}

function normalizeIntroPart(raw: unknown): IntroPart {
  const source = asRecord(raw);
  const kind: IntroKind = source.kind === "speech" ? "speech" : "narration";
  return keepExtras(raw, {
    kind,
    text: stringOr(source.text),
    speakerId: stringOr(source.speakerId) || null,
  });
}

function normalizePlayGuide(raw: unknown): PlayGuide {
  const source = asRecord(raw);
  const guide = createEmptyPlayGuide();
  for (const field of PLAY_GUIDE_FIELDS) {
    const entry = source[field.key];
    if (!isRecord(entry)) continue;
    guide[field.key] = keepExtras(entry, {
      text: stringOr(entry.text),
      hidden: booleanOr(entry.hidden, field.hiddenByDefault),
    });
  }
  return keepExtras(raw, guide);
}

function normalizeStage(raw: unknown): AffinityStage {
  const source = asRecord(raw);
  return keepExtras(raw, {
    startValue: intOrNull(source.startValue, null),
    callText: stringOr(source.callText),
    speechText: stringOr(source.speechText),
    distanceText: stringOr(source.distanceText),
    agencyText: stringOr(source.agencyText),
    avoidText: stringOr(source.avoidText),
    freeText: stringOr(source.freeText),
  });
}

export function normalizeAffinityConfig(raw: unknown): AffinityConfig | null {
  if (!isRecord(raw)) return null;
  const defaults = createDefaultAffinityConfig();
  return keepExtras(raw, {
    itemName: stringOr(raw.itemName, defaults.itemName),
    minValue: intOrNull(raw.minValue, defaults.minValue),
    maxValue: intOrNull(raw.maxValue, defaults.maxValue),
    initialValue: intOrNull(raw.initialValue, defaults.initialValue),
    pace: isAffinityPace(raw.pace) ? raw.pace : defaults.pace,
    showInChat: booleanOr(raw.showInChat, defaults.showInChat),
    enabled: booleanOr(raw.enabled, defaults.enabled),
    stages: list(raw.stages).map(normalizeStage),
  });
}

function normalizeAffinity(raw: unknown): CastAffinity | null {
  if (!isRecord(raw)) return null;
  const defaultConfig = normalizeAffinityConfig(raw.default);
  if (!defaultConfig) return null;
  const overrides: Record<string, AffinityConfig> = {};
  if (isRecord(raw.overrides)) {
    for (const [subject, config] of Object.entries(raw.overrides)) {
      const normalized = normalizeAffinityConfig(config);
      if (normalized) overrides[subject] = normalized;
    }
  }
  return keepExtras(raw, { default: defaultConfig, overrides });
}

function normalizeLorebook(raw: unknown): LorebookNote {
  const source = asRecord(raw);
  return keepExtras(raw, {
    id: idOf(source),
    title: stringOr(source.title),
    note: stringOr(source.note),
  });
}

export class CastFormatError extends Error {}

export interface NormalizeOptions {
  keepPendingImages?: boolean;
}

export function normalizeCastDocument(raw: unknown, options: NormalizeOptions = {}): CastDocument {
  const keep = options.keepPendingImages === true;
  if (!isRecord(raw) || raw.format !== CAST_FILE_FORMAT) {
    throw new CastFormatError("Zetter Forge のキャストのファイルではありません。");
  }
  const empty = createEmptyCast();
  const members = list(raw.members).map((member) => normalizeMember(member, keep));
  const memberIds = new Set(members.map((member) => member.id));
  const introScript = list(raw.introScript)
    .map(normalizeIntroPart)
    .map((part) =>
      part.kind === "speech" && part.speakerId && memberIds.has(part.speakerId)
        ? part
        : { ...part, speakerId: null },
    );
  return keepExtras(raw, {
    format: CAST_FILE_FORMAT,
    formatVersion: Number.isSafeInteger(raw.formatVersion)
      ? Number(raw.formatVersion)
      : CAST_FILE_VERSION,
    id: stringOr(raw.id) || empty.id,
    createdAt: stringOr(raw.createdAt) || empty.createdAt,
    updatedAt: stringOr(raw.updatedAt) || empty.updatedAt,
    mode: raw.mode === "chat" ? "chat" : "story",
    status: raw.status === "public" ? "public" : "private",
    name: stringOr(raw.name),
    persona: stringOr(raw.persona),
    avatar: normalizeImage(raw.avatar, keep),
    avatarBlurred: booleanOr(raw.avatarBlurred, empty.avatarBlurred),
    partnerSettings: normalizePartnerSettings(raw.partnerSettings),
    toneExamples: list(raw.toneExamples).map(normalizeToneExample),
    members,
    tagline: stringOr(raw.tagline),
    situation: stringOr(raw.situation),
    introScript,
    aboutText: stringOr(raw.aboutText),
    playGuide: normalizePlayGuide(raw.playGuide),
    recommendedPersonas: list(raw.recommendedPersonas).map((persona) =>
      normalizePersona(persona, keep),
    ),
    affinity: normalizeAffinity(raw.affinity),
    lorebooks: list(raw.lorebooks).map(normalizeLorebook),
    cover: normalizeImage(raw.cover, keep),
    coverBlurred: booleanOr(raw.coverBlurred, empty.coverBlurred),
    tags: list(raw.tags).filter((tag): tag is string => typeof tag === "string"),
    hook: stringOr(raw.hook),
    background: normalizeImage(raw.background, keep),
    gallery: list(raw.gallery)
      .map((image) => normalizeGalleryImage(image, keep))
      .filter((image): image is GalleryImage => image !== null),
    personaHidden: booleanOr(raw.personaHidden, empty.personaHidden),
    toneExamplesHidden: booleanOr(raw.toneExamplesHidden, empty.toneExamplesHidden),
    situationHidden: booleanOr(raw.situationHidden, empty.situationHidden),
    authorHidden: booleanOr(raw.authorHidden, empty.authorHidden),
    showFavoriteCount: booleanOr(raw.showFavoriteCount, empty.showFavoriteCount),
    showTalkCount: booleanOr(raw.showTalkCount, empty.showTalkCount),
    zetterUrl: stringOr(raw.zetterUrl),
    memo: stringOr(raw.memo),
  });
}

interface ImageSlot {
  kind: ImageKind;
  index?: number;
  get(): CastImage | null;
  set(image: CastImage | null): void;
}

export function imageSlots(doc: CastDocument): ImageSlot[] {
  const slots: ImageSlot[] = [
    { kind: "avatar", get: () => doc.avatar, set: (image) => (doc.avatar = image) },
    { kind: "cover", get: () => doc.cover, set: (image) => (doc.cover = image) },
    { kind: "background", get: () => doc.background, set: (image) => (doc.background = image) },
  ];
  doc.gallery.forEach((image, index) => {
    slots.push({
      kind: "gallery",
      index,
      get: () => image,
      set: (next) => {
        if (next) Object.assign(image, next);
      },
    });
  });
  const avatars = (kind: ImageKind, owners: readonly { avatar: CastImage | null }[]) => {
    owners.forEach((owner, index) => {
      slots.push({ kind, index, get: () => owner.avatar, set: (image) => (owner.avatar = image) });
    });
  };
  avatars("member", doc.members);
  avatars("persona", doc.recommendedPersonas);
  return slots;
}

export function sendableMembers(doc: CastDocument): CastMember[] {
  if (doc.mode === "chat") return [];
  return doc.members
    .slice(0, LIMITS.members)
    .filter(
      (member) =>
        member.name.trim() ||
        member.profile.trim() ||
        member.avatar ||
        member.toneExamples.some((tone) => tone.situation.trim() || tone.example.trim()),
    );
}

export function castDisplayTitle(doc: Pick<CastDocument, "mode" | "tagline" | "name">): {
  title: string;
  sub: string;
} {
  const tagline = doc.tagline.trim();
  const name = doc.name.trim();
  if (doc.mode === "story" && tagline) return { title: tagline, sub: name };
  return { title: name, sub: "" };
}

export function filledPlayGuideFields(guide: PlayGuide): (typeof PLAY_GUIDE_FIELDS)[number][] {
  return PLAY_GUIDE_FIELDS.filter((field) => guide[field.key].text.trim());
}

export function filledStageFields(stage: AffinityStage): (typeof AFFINITY_STAGE_FIELDS)[number][] {
  return AFFINITY_STAGE_FIELDS.filter((field) => stage[field.key].trim());
}

export function isHalfFilledTone(tone: ToneExample): boolean {
  return !tone.situation.trim() !== !tone.example.trim();
}

export function overrideTitle(member: Pick<CastMember, "name">): string {
  return `${member.name.trim() || "登場人物"}の個別設定`;
}

export function isNamelessPersona(persona: RecommendedPersona): boolean {
  return !persona.useViewerName && !persona.name.trim();
}

export function sortAffinityStages(config: AffinityConfig): void {
  if (config.stages.length < 2) return;
  const [first, ...rest] = config.stages;
  const order = (stage: AffinityStage) =>
    Number.isSafeInteger(stage.startValue)
      ? (stage.startValue as number)
      : Number.POSITIVE_INFINITY;
  rest.sort((left, right) => order(left) - order(right));
  config.stages.splice(0, config.stages.length, first as AffinityStage, ...rest);
}

export function removeMember(doc: CastDocument, memberId: string): void {
  doc.members = doc.members.filter((member) => member.id !== memberId);
  for (const part of doc.introScript) {
    if (part.speakerId === memberId) part.speakerId = null;
  }
  if (doc.affinity) delete doc.affinity.overrides[memberId];
}
