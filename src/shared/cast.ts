import { LIMITS } from "./limits";

// ローカル保存用のキャスト設定。項目名と既定値は Zetter のキャスト作成画面に合わせ、
// 画像だけは Zetter の URL の代わりにキャストのフォルダ内のファイルを指す。
export const CAST_FILE_FORMAT = "zetter-forge/cast";
export const CAST_FILE_VERSION = 1;

export type CastMode = "story" | "chat";
export type CastStatus = "private" | "public";
type IntroKind = "narration" | "speech";
export type AffinityPace = "gentle" | "normal" | "rapid";

/** 好感度の「本体」の個別設定を指すキー（Zetter と同じ）。 */
export const AFFINITY_BASE_SUBJECT = "__cast_base__";

export interface CastImage {
  /** キャストのフォルダからの相対パス。保存前の画像は "pending:<id>"。 */
  file: string;
  width: number;
  height: number;
  bytes: number;
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
  /** セリフの話者。null はキャスト本体、文字列は登場人物の id。 */
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
  /** キーは AFFINITY_BASE_SUBJECT か登場人物の id。 */
  overrides: Record<string, AffinityConfig>;
}

/** 連動する設定集のメモ（設定集そのものは Zetter 側にある）。 */
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
  // キャラクター（本人）
  name: string;
  persona: string;
  avatar: CastImage | null;
  avatarBlurred: boolean;
  partnerSettings: PartnerSettings;
  toneExamples: ToneExample[];
  /** 2 人目以降の登場人物（ストーリーモードのみ Zetter に送られる） */
  members: CastMember[];
  // 体験設定
  tagline: string;
  situation: string;
  introScript: IntroPart[];
  aboutText: string;
  recommendedPersonas: RecommendedPersona[];
  // 好感度・設定集
  affinity: CastAffinity | null;
  lorebooks: LorebookNote[];
  // 見た目・公開
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
  // ローカルだけで使うメモ
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

export const AFFINITY_STAGE_FIELDS = [
  { key: "callText", label: "呼び方", multiline: false },
  { key: "speechText", label: "話し方", multiline: true },
  { key: "distanceText", label: "距離感", multiline: true },
  { key: "agencyText", label: "主体性", multiline: true },
  { key: "avoidText", label: "避けること", multiline: true },
  { key: "freeText", label: "自由記述", multiline: true },
] as const satisfies readonly { key: keyof AffinityStage; label: string; multiline: boolean }[];

export const AFFINITY_PACES: readonly { value: AffinityPace; label: string }[] = [
  { value: "gentle", label: "緩やか" },
  { value: "normal", label: "普通" },
  { value: "rapid", label: "急接近" },
];

export function newId(): string {
  return globalThis.crypto.randomUUID();
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

/** 「好感度を設定する」を押したときのひな形（Zetter と同じ 4 段階）。 */
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

/** 新しいキャストの既定値（Zetter の新規作成と同じ）。 */
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

// ---------------------------------------------------------------------------
// 読み込み時の正規化。欠けた値は既定値で埋め、知らないキーは消さずに残す
// （新しい版のアプリで書いたファイルを古い版で保存しても情報を落とさないため）。

type JsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Zetter の normalizeNumber と同じ規則（空は null、整数でなければ既定値）。 */
function intOrNull(value: unknown, fallback: number | null): number | null {
  if (value === null || value === "") return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : fallback;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** 既知のキーを正規化した値で並べ、そのあとに知らないキーを元の値のまま足す。 */
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
  if (!keepPending && raw.file.startsWith("pending:")) return null;
  return keepExtras(raw, {
    file: raw.file,
    width: Number.isFinite(raw.width) ? Number(raw.width) : 0,
    height: Number.isFinite(raw.height) ? Number(raw.height) : 0,
    bytes: Number.isFinite(raw.bytes) ? Number(raw.bytes) : 0,
  });
}

function normalizeGalleryImage(raw: unknown, keepPending = false): GalleryImage | null {
  const image = normalizeImage(raw, keepPending);
  if (!image || !isRecord(raw)) return null;
  return keepExtras(raw, {
    ...image,
    id: str(raw.id) || newId(),
    blurred: bool(raw.blurred, false),
  });
}

function normalizeToneExample(raw: unknown): ToneExample {
  const source = isRecord(raw) ? raw : {};
  return keepExtras(raw, { situation: str(source.situation), example: str(source.example) });
}

function normalizePartnerSettings(raw: unknown): PartnerSettings {
  const source = isRecord(raw) ? raw : {};
  return keepExtras(raw, {
    dailyRoutine: str(source.dailyRoutine),
    messageHabits: str(source.messageHabits),
    proactiveMessages: str(source.proactiveMessages),
    distanceWhenApart: str(source.distanceWhenApart),
    freeform: str(source.freeform),
  });
}

function normalizeMember(raw: unknown, keepPending = false): CastMember {
  const source = isRecord(raw) ? raw : {};
  return keepExtras(raw, {
    id: str(source.id) || newId(),
    name: str(source.name),
    profile: str(source.profile),
    toneExamples: list(source.toneExamples).map(normalizeToneExample),
    partnerSettings: normalizePartnerSettings(source.partnerSettings),
    avatar: normalizeImage(source.avatar, keepPending),
  });
}

function normalizePersona(raw: unknown, keepPending = false): RecommendedPersona {
  const source = isRecord(raw) ? raw : {};
  return keepExtras(raw, {
    id: str(source.id) || newId(),
    name: str(source.name),
    useViewerName: bool(source.useViewerName, false),
    tagline: str(source.tagline),
    note: str(source.note),
    avatar: normalizeImage(source.avatar, keepPending),
  });
}

function normalizeIntroPart(raw: unknown): IntroPart {
  const source = isRecord(raw) ? raw : {};
  const kind: IntroKind = source.kind === "speech" ? "speech" : "narration";
  return keepExtras(raw, {
    kind,
    text: str(source.text),
    speakerId: typeof source.speakerId === "string" && source.speakerId ? source.speakerId : null,
  });
}

function normalizeStage(raw: unknown): AffinityStage {
  const source = isRecord(raw) ? raw : {};
  return keepExtras(raw, {
    startValue: intOrNull(source.startValue, null),
    callText: str(source.callText),
    speechText: str(source.speechText),
    distanceText: str(source.distanceText),
    agencyText: str(source.agencyText),
    avoidText: str(source.avoidText),
    freeText: str(source.freeText),
  });
}

/** Zetter の normalizeCastAffinityConfig と同じ既定値の補い方。 */
export function normalizeAffinityConfig(raw: unknown): AffinityConfig | null {
  if (!isRecord(raw)) return null;
  const defaults = createDefaultAffinityConfig();
  const pace =
    raw.pace === "gentle" || raw.pace === "normal" || raw.pace === "rapid"
      ? raw.pace
      : defaults.pace;
  return keepExtras(raw, {
    itemName: typeof raw.itemName === "string" ? raw.itemName : defaults.itemName,
    minValue: intOrNull(raw.minValue, defaults.minValue),
    maxValue: intOrNull(raw.maxValue, defaults.maxValue),
    initialValue: intOrNull(raw.initialValue, defaults.initialValue),
    pace,
    showInChat: raw.showInChat !== false,
    enabled: raw.enabled !== false,
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
  const source = isRecord(raw) ? raw : {};
  return keepExtras(raw, {
    id: str(source.id) || newId(),
    title: str(source.title),
    note: str(source.note),
  });
}

export class CastFormatError extends Error {}

export interface NormalizeOptions {
  /** 保存前の画像（"pending:<id>"）を残す。保存処理の途中でだけ使う */
  keepPendingImages?: boolean;
}

/** cast.json の中身を CastDocument にする。キャストのファイルでなければ CastFormatError。 */
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
    id: str(raw.id) || empty.id,
    createdAt: str(raw.createdAt) || empty.createdAt,
    updatedAt: str(raw.updatedAt) || empty.updatedAt,
    mode: raw.mode === "chat" ? "chat" : "story",
    status: raw.status === "public" ? "public" : "private",
    name: str(raw.name),
    persona: str(raw.persona),
    avatar: normalizeImage(raw.avatar, keep),
    avatarBlurred: bool(raw.avatarBlurred, empty.avatarBlurred),
    partnerSettings: normalizePartnerSettings(raw.partnerSettings),
    toneExamples: list(raw.toneExamples).map(normalizeToneExample),
    members,
    tagline: str(raw.tagline),
    situation: str(raw.situation),
    introScript,
    aboutText: str(raw.aboutText),
    recommendedPersonas: list(raw.recommendedPersonas).map((persona) =>
      normalizePersona(persona, keep),
    ),
    affinity: normalizeAffinity(raw.affinity),
    lorebooks: list(raw.lorebooks).map(normalizeLorebook),
    cover: normalizeImage(raw.cover, keep),
    coverBlurred: bool(raw.coverBlurred, empty.coverBlurred),
    tags: list(raw.tags).filter((tag): tag is string => typeof tag === "string"),
    hook: str(raw.hook),
    background: normalizeImage(raw.background, keep),
    gallery: list(raw.gallery)
      .map((image) => normalizeGalleryImage(image, keep))
      .filter((image): image is GalleryImage => image !== null),
    personaHidden: bool(raw.personaHidden, empty.personaHidden),
    toneExamplesHidden: bool(raw.toneExamplesHidden, empty.toneExamplesHidden),
    situationHidden: bool(raw.situationHidden, empty.situationHidden),
    authorHidden: bool(raw.authorHidden, empty.authorHidden),
    showFavoriteCount: bool(raw.showFavoriteCount, empty.showFavoriteCount),
    showTalkCount: bool(raw.showTalkCount, empty.showTalkCount),
    zetterUrl: str(raw.zetterUrl),
    memo: str(raw.memo),
  });
}

// ---------------------------------------------------------------------------
// Zetter が保存時にどう扱うかに合わせた判定

/**
 * Zetter に送られる登場人物。何も書いていない（追加しただけの）ブロックは Zetter が黙って落とすので数えない。
 * 雑談モードでは登場人物そのものが送られない。
 */
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

/** 一覧などに出す代表の名前（Zetter と同じく、ストーリーでキャッチコピーがあればそれを使う）。 */
export function castDisplayTitle(doc: Pick<CastDocument, "mode" | "tagline" | "name">): {
  title: string;
  sub: string;
} {
  const tagline = doc.tagline.trim();
  const name = doc.name.trim();
  if (doc.mode === "story" && tagline) return { title: tagline, sub: name };
  return { title: name, sub: "" };
}

/** 好感度の段階を開始値の小さい順に並べ直す（1 段階目は動かさない。Zetter と同じ）。 */
export function sortAffinityStages(config: AffinityConfig): void {
  if (config.stages.length < 2) return;
  const [first, ...rest] = config.stages;
  rest.sort((left, right) => {
    const leftValue = Number.isSafeInteger(left.startValue)
      ? (left.startValue as number)
      : Number.POSITIVE_INFINITY;
    const rightValue = Number.isSafeInteger(right.startValue)
      ? (right.startValue as number)
      : Number.POSITIVE_INFINITY;
    return leftValue - rightValue;
  });
  config.stages.splice(0, config.stages.length, first as AffinityStage, ...rest);
}

/** 登場人物を外したときの後始末（その人の話者指定と好感度の個別設定を消す）。 */
export function removeMember(doc: CastDocument, memberId: string): void {
  doc.members = doc.members.filter((member) => member.id !== memberId);
  for (const part of doc.introScript) {
    if (part.speakerId === memberId) part.speakerId = null;
  }
  if (doc.affinity) delete doc.affinity.overrides[memberId];
}
