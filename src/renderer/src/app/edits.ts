// 文書（CastDocument）の書き換え。画面の部品から届いた場所（path）と値を、どの項目をどう変えるかに読み替える。
// どれも元の doc は変えずに、書き換えた複製を返す。読み替えられない場所なら null。
import {
  AFFINITY_PACES,
  AFFINITY_STAGE_FIELDS,
  type AffinityConfig,
  type AffinityStage,
  type CastDocument,
  type CastImage,
  type CastMember,
  type GalleryImage,
  type IntroPart,
  PARTNER_HABIT_CHIPS,
  PARTNER_SETTINGS_FIELDS,
  PARTNER_TIME_CHIPS,
  type PartnerSettings,
  type ToneExample,
  createDefaultAffinityConfig,
  createEmptyMember,
  createEmptyPersona,
  createEmptyStage,
  newId,
  normalizeAffinityConfig,
  removeMember,
  sortAffinityStages,
} from "@shared/cast";
import type { ImageKind } from "@shared/images";
import { LIMITS } from "@shared/limits";
import { formatCount, utf16Length } from "@shared/text";
import { limitPartnerSettingsValue } from "@shared/validate";

import { AFFINITY_DEFAULT, MAIN_CHARACTER, type Path, type Selection } from "./types";

/** {{user}}（相手の呼び名に置き換わる） */
export const USER_PLACEHOLDER = "{{user}}";

export interface EditOutcome {
  doc: CastDocument;
  /** 書き換えたあとにフォーカスを移す欄 */
  focus?: { path: Path; selection: Selection | null };
  /** 画面の状態の変更（選ぶ人・好感度の対象・開く段階） */
  ui?: { character?: string; subject?: string; stage?: number };
  /** 消したので「元に戻す」を出す（知らせの文言） */
  removed?: string;
}

/** 書き換えなかった理由（知らせに出す） */
export interface EditRefusal {
  refused: string;
}

export type EditResult = EditOutcome | EditRefusal | null;

export function isRefusal(result: EditResult): result is EditRefusal {
  return !!result && "refused" in result;
}

// ---------------------------------------------------------------------------
// 場所の読み取り

/** 本人（["cast"]）か登場人物（["members", id]）のキャラクター設定 */
interface CharacterSlot {
  base: Path;
  target: CastDocument | CastMember;
  rest: Path;
}

function characterSlot(draft: CastDocument, path: Path): CharacterSlot | null {
  if (path[0] === "cast") return { base: ["cast"], target: draft, rest: path.slice(1) };
  if (path[0] === "members" && typeof path[1] === "string") {
    const member = draft.members.find((candidate) => candidate.id === path[1]);
    return member ? { base: path.slice(0, 2), target: member, rest: path.slice(2) } : null;
  }
  return null;
}

function affinityConfig(draft: CastDocument, subject: unknown): AffinityConfig | null {
  if (!draft.affinity || typeof subject !== "string") return null;
  if (subject === AFFINITY_DEFAULT) return draft.affinity.default;
  return draft.affinity.overrides[subject] ?? null;
}

function index(segment: unknown, length: number): number | null {
  return typeof segment === "number" &&
    Number.isInteger(segment) &&
    segment >= 0 &&
    segment < length
    ? segment
    : null;
}

function isPartnerKey(key: unknown): key is keyof PartnerSettings {
  return PARTNER_SETTINGS_FIELDS.some((field) => field.key === key);
}

function isStageField(key: unknown): key is (typeof AFFINITY_STAGE_FIELDS)[number]["key"] {
  return AFFINITY_STAGE_FIELDS.some((field) => field.key === key);
}

/** 空なら null、数でなければ null（Zetter の欄と同じく、整数かどうかは確認で見る） */
function parseNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clampSelection(value: string, selection: Selection): Selection {
  const start = Math.min(Math.max(0, selection.start), value.length);
  const end = Math.min(Math.max(start, selection.end), value.length);
  return { start, end };
}

function edit(doc: CastDocument, recipe: (draft: CastDocument) => EditResult | void): EditResult {
  const draft = structuredClone(doc);
  const result = recipe(draft);
  if (result === undefined) return { doc: draft };
  return result;
}

/** 書き換えた文書と、そのあとにフォーカスを移す欄 */
function focusOn(draft: CastDocument, path: Path, selection: Selection | null = null): EditOutcome {
  return { doc: draft, focus: { path, selection } };
}

// ---------------------------------------------------------------------------
// 文字・数・選択肢

const CAST_TEXT = new Set([
  "name",
  "persona",
  "tagline",
  "situation",
  "aboutText",
  "hook",
  "zetterUrl",
  "memo",
] as const);

type CastTextKey = typeof CAST_TEXT extends Set<infer K> ? K : never;

function isCastText(key: unknown): key is CastTextKey {
  return CAST_TEXT.has(key as CastTextKey);
}

export function applyInput(doc: CastDocument, path: Path, value: string): EditResult {
  const [head] = path;
  if (head === "cast") {
    const key = path[1];
    if (path.length === 2 && isCastText(key))
      return edit(doc, (draft) => void (draft[key] = value));
    if (path.length === 2 && key === "mode" && (value === "story" || value === "chat"))
      return edit(doc, (draft) => void (draft.mode = value));
  }
  if (head === "cast" || head === "members") return inputCharacter(doc, path, value);
  if (head === "intro") return inputIntro(doc, path, value);
  if (head === "personas") {
    const [, id, field] = path;
    if (field !== "name" && field !== "tagline" && field !== "note") return null;
    return edit(doc, (draft) => {
      const persona = draft.recommendedPersonas.find((candidate) => candidate.id === id);
      if (!persona) return null;
      persona[field] = value;
    });
  }
  if (head === "affinity") return inputAffinity(doc, path, value);
  if (head === "lorebooks") {
    const [, id, field] = path;
    if (field !== "title" && field !== "note") return null;
    return edit(doc, (draft) => {
      const book = draft.lorebooks.find((candidate) => candidate.id === id);
      if (!book) return null;
      book[field] = value;
    });
  }
  if (head === "tags" && path.length === 2) {
    return edit(doc, (draft) => {
      const at = index(path[1], draft.tags.length);
      if (at === null) return null;
      draft.tags[at] = value;
    });
  }
  return null;
}

function inputCharacter(doc: CastDocument, path: Path, value: string): EditResult {
  return edit(doc, (draft) => {
    const slot = characterSlot(draft, path);
    if (!slot) return null;
    const [key, ...rest] = slot.rest;
    const target = slot.target;
    if ("profile" in target && rest.length === 0 && (key === "name" || key === "profile")) {
      target[key] = value;
      return undefined;
    }
    if (key === "partnerSettings" && rest.length === 1 && isPartnerKey(rest[0])) {
      const field = rest[0];
      target.partnerSettings = {
        ...target.partnerSettings,
        [field]: limitPartnerSettingsValue(target.partnerSettings, field, value),
      };
      return undefined;
    }
    if (key === "toneExamples" && rest.length === 2) {
      const at = index(rest[0], target.toneExamples.length);
      const field = rest[1];
      if (at === null || (field !== "situation" && field !== "example")) return null;
      (target.toneExamples[at] as ToneExample)[field] = value;
      return undefined;
    }
    return null;
  });
}

/** パートの種類と話者を 1 つの値で表す（"narration" か "speech:<登場人物の id。本体は空>"） */
export function introRoleValue(part: Pick<IntroPart, "kind" | "speakerId">): string {
  return part.kind === "narration" ? "narration" : `speech:${part.speakerId ?? ""}`;
}

function inputIntro(doc: CastDocument, path: Path, value: string): EditResult {
  const [, at, field] = path;
  if (at === "first" && field === "text") {
    // 雑談モードの「最初のひとこと」は 1 つ目のパート。なければ作る
    return edit(doc, (draft) => {
      const part = draft.introScript[0];
      if (part) part.text = value;
      else draft.introScript.push({ kind: "speech", text: value, speakerId: null });
    });
  }
  return edit(doc, (draft) => {
    const position = index(at, draft.introScript.length);
    if (position === null) return null;
    const part = draft.introScript[position] as IntroPart;
    if (field === "text") {
      part.text = value;
      return undefined;
    }
    if (field === "role") {
      if (value === "narration") {
        part.kind = "narration";
        part.speakerId = null;
        return undefined;
      }
      if (!value.startsWith("speech:")) return null;
      const speaker = value.slice("speech:".length);
      if (speaker && !draft.members.some((member) => member.id === speaker)) return null;
      part.kind = "speech";
      part.speakerId = speaker || null;
      return undefined;
    }
    return null;
  });
}

function inputAffinity(doc: CastDocument, path: Path, value: string): EditResult {
  const [, subject, field, at, stageField] = path;
  return edit(doc, (draft) => {
    const config = affinityConfig(draft, subject);
    if (!config) return null;
    if (path.length === 3) {
      if (field === "itemName") config.itemName = value;
      else if (field === "minValue" || field === "maxValue" || field === "initialValue") {
        config[field] = parseNumber(value);
        // 最小値を変えると 1 段階目の開始値も一緒に変わる
        if (field === "minValue" && config.stages[0]) config.stages[0].startValue = config.minValue;
      } else if (field === "pace") {
        const pace = AFFINITY_PACES.find((candidate) => candidate.value === value);
        if (!pace) return null;
        config.pace = pace.value;
      } else return null;
      return undefined;
    }
    if (field !== "stages" || path.length !== 5) return null;
    const position = index(at, config.stages.length);
    if (position === null) return null;
    const stage = config.stages[position] as AffinityStage;
    if (stageField === "startValue") {
      // 1 段階目は最小値から始まる（変えられない）
      if (position === 0) return null;
      stage.startValue = parseNumber(value);
      return undefined;
    }
    if (!isStageField(stageField)) return null;
    stage[stageField] = value;
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// オン・オフ

const CAST_SWITCHES: Record<string, (draft: CastDocument, checked: boolean) => void> = {
  avatarBlurred: (draft, checked) => void (draft.avatarBlurred = checked),
  coverBlurred: (draft, checked) => void (draft.coverBlurred = checked),
  public: (draft, checked) => void (draft.status = checked ? "public" : "private"),
  // 画面では「公開する・出す」をオンにする。保存する値は「隠す」なので逆にする
  personaVisible: (draft, checked) => void (draft.personaHidden = !checked),
  toneExamplesVisible: (draft, checked) => void (draft.toneExamplesHidden = !checked),
  situationVisible: (draft, checked) => void (draft.situationHidden = !checked),
  authorVisible: (draft, checked) => void (draft.authorHidden = !checked),
  showFavoriteCount: (draft, checked) => void (draft.showFavoriteCount = checked),
  showTalkCount: (draft, checked) => void (draft.showTalkCount = checked),
};

export function applyCheck(doc: CastDocument, path: Path, checked: boolean): EditResult {
  const [head, key, field] = path;
  if (head === "cast" && path.length === 2 && typeof key === "string") {
    const apply = CAST_SWITCHES[key];
    return apply ? edit(doc, (draft) => apply(draft, checked)) : null;
  }
  if (head === "personas" && field === "useViewerName") {
    return edit(doc, (draft) => {
      const persona = draft.recommendedPersonas.find((candidate) => candidate.id === key);
      if (!persona) return null;
      persona.useViewerName = checked;
    });
  }
  if (head === "gallery" && field === "blurred") {
    return edit(doc, (draft) => {
      const image = draft.gallery.find((candidate) => candidate.id === key);
      if (!image) return null;
      image.blurred = checked;
    });
  }
  if (head === "affinity" && path.length === 3) {
    return edit(doc, (draft) => {
      if (!draft.affinity || typeof key !== "string") return null;
      if (field === "showInChat") {
        const config = affinityConfig(draft, key);
        if (!config) return null;
        config.showInChat = checked;
        return undefined;
      }
      if (field === "disabled" && key !== AFFINITY_DEFAULT) {
        // 「このキャラは好感度を使わない」。個別設定がなければ共通設定を写して作る
        const config =
          draft.affinity.overrides[key] ??
          (normalizeAffinityConfig(structuredClone(draft.affinity.default)) as AffinityConfig);
        config.enabled = !checked;
        draft.affinity.overrides[key] = config;
        return undefined;
      }
      return null;
    });
  }
  return null;
}

// ---------------------------------------------------------------------------
// 札・{{user}} の差し込み

/** 「ふだんの1日」の札: カーソル位置に【朝】を入れる（行の途中なら改行してから）。 */
export function insertTimeChip(value: string, selection: Selection, label: string) {
  const { start, end } = clampSelection(value, selection);
  const atLineStart = start === 0 || value[start - 1] === "\n";
  const insertion = `${atLineStart ? "" : "\n"}【${label}】 `;
  return {
    value: `${value.slice(0, start)}${insertion}${value.slice(end)}`,
    caret: start + insertion.length,
  };
}

/** 「メッセージの癖」の札: 末尾に一文を足す（同じ文が既にあれば何もしない）。 */
export function appendHabitChip(value: string, phrase: string): string {
  const trimmed = value.trimEnd();
  const sentence = `${phrase.replace(/[。.!！?？]*$/u, "")}。`;
  if (trimmed.includes(sentence.replace(/。$/u, ""))) return value;
  const separator = trimmed ? (/[。.!！?？]$/u.test(trimmed) ? "\n" : "。\n") : "";
  return `${trimmed}${separator}${sentence}`;
}

export function applyInsert(
  doc: CastDocument,
  path: Path,
  text: string,
  selection: Selection,
): EditResult {
  const [head] = path;
  if (head === "intro" && text === USER_PLACEHOLDER)
    return insertIntroPlaceholder(doc, path, selection);
  return edit(doc, (draft) => {
    const slot = characterSlot(draft, path);
    if (!slot || slot.rest[0] !== "partnerSettings") return null;
    const field = slot.rest[1];
    const settings = slot.target.partnerSettings;
    let next: string;
    let caret: number;
    if (field === "dailyRoutine" && (PARTNER_TIME_CHIPS as readonly string[]).includes(text)) {
      ({ value: next, caret } = insertTimeChip(settings.dailyRoutine, selection, text));
    } else if (
      field === "messageHabits" &&
      (PARTNER_HABIT_CHIPS as readonly string[]).includes(text)
    ) {
      next = appendHabitChip(settings.messageHabits, text);
      caret = next.length;
    } else return null;
    // 札の途中で切れないよう、5 欄の合計に収まらないときは入れない
    if (limitPartnerSettingsValue(settings, field, next) !== next)
      return {
        refused: `パートナー設定は5つの欄の合計で${formatCount(LIMITS.partnerSettingsTotal)}字までなので、これ以上入りません。`,
      };
    slot.target.partnerSettings = { ...settings, [field]: next };
    return focusOn(draft, [...slot.base, "partnerSettings", field], { start: caret, end: caret });
  });
}

function insertIntroPlaceholder(doc: CastDocument, path: Path, selection: Selection): EditResult {
  const [, at, field] = path;
  if (field !== "text") return null;
  return edit(doc, (draft) => {
    let part = at === "first" ? draft.introScript[0] : undefined;
    if (at !== "first") {
      const position = index(at, draft.introScript.length);
      if (position === null) return null;
      part = draft.introScript[position];
    }
    const value = part?.text ?? "";
    const { start, end } = clampSelection(value, selection);
    const next = `${value.slice(0, start)}${USER_PLACEHOLDER}${value.slice(end)}`;
    // 入りきらないときに後ろを切り捨てると、書いた文が消えてしまうので入れない
    if (utf16Length(next) > LIMITS.introPart)
      return {
        refused: `イントロのパートは${formatCount(LIMITS.introPart)}字までなので、${USER_PLACEHOLDER} が入りません。`,
      };
    if (part) part.text = next;
    else draft.introScript.push({ kind: "speech", text: next, speakerId: null });
    const caret = start + USER_PLACEHOLDER.length;
    return focusOn(draft, path, { start: caret, end: caret });
  });
}

// ---------------------------------------------------------------------------
// 足す

export function applyAdd(doc: CastDocument, path: Path): EditResult {
  const [head, key, field] = path;
  if (head === "members" && path.length === 1) {
    if (doc.mode !== "story" || 1 + doc.members.length >= LIMITS.charactersTotal) return null;
    const member = createEmptyMember();
    return edit(doc, (draft) => {
      draft.members.push(member);
      return { ...focusOn(draft, ["members", member.id, "name"]), ui: { character: member.id } };
    });
  }
  if ((head === "cast" || head === "members") && path[path.length - 1] === "toneExamples") {
    return edit(doc, (draft) => {
      const slot = characterSlot(draft, path);
      if (!slot || slot.rest.length !== 1) return null;
      const list = slot.target.toneExamples;
      if (list.length >= LIMITS.toneItemsPerCharacter) return null;
      list.push({ situation: "", example: "" });
      return focusOn(draft, [...slot.base, "toneExamples", list.length - 1, "situation"]);
    });
  }
  if (head === "intro" && path.length === 1) {
    if (doc.introScript.length >= LIMITS.introParts) return null;
    return edit(doc, (draft) => {
      draft.introScript.push({ kind: "narration", text: "", speakerId: null });
      return focusOn(draft, ["intro", draft.introScript.length - 1, "text"]);
    });
  }
  if (head === "personas" && path.length === 1) {
    if (doc.recommendedPersonas.length >= LIMITS.personas) return null;
    const persona = createEmptyPersona();
    return edit(doc, (draft) => {
      draft.recommendedPersonas.push(persona);
      return focusOn(draft, ["personas", persona.id, "name"]);
    });
  }
  if (head === "lorebooks" && path.length === 1) {
    if (doc.lorebooks.length >= LIMITS.lorebooks) return null;
    const id = newId();
    return edit(doc, (draft) => {
      draft.lorebooks.push({ id, title: "", note: "" });
      return focusOn(draft, ["lorebooks", id, "title"]);
    });
  }
  if (head === "tags" && path.length === 1) {
    if (doc.tags.length >= LIMITS.tags) return null;
    return edit(doc, (draft) => {
      draft.tags.push("");
      return focusOn(draft, ["tags", draft.tags.length - 1]);
    });
  }
  if (head === "affinity") {
    if (path.length === 1) {
      if (doc.affinity) return null;
      return edit(doc, (draft) => {
        draft.affinity = { default: createDefaultAffinityConfig(), overrides: {} };
        return { doc: draft, ui: { subject: AFFINITY_DEFAULT, stage: 0 } };
      });
    }
    if (path.length === 2 && typeof key === "string" && key !== AFFINITY_DEFAULT) {
      // 個別設定を作る（共通設定を写して始める）
      return edit(doc, (draft) => {
        if (!draft.affinity || draft.affinity.overrides[key]) return null;
        draft.affinity.overrides[key] = normalizeAffinityConfig(
          structuredClone(draft.affinity.default),
        ) as AffinityConfig;
        return { doc: draft, ui: { stage: 0 } };
      });
    }
    if (path.length === 3 && field === "stages") {
      return edit(doc, (draft) => {
        const config = affinityConfig(draft, key);
        if (!config || config.stages.length >= LIMITS.affinityStages) return null;
        const last = config.stages.at(-1)?.startValue;
        const start = Number.isSafeInteger(last)
          ? (last as number) + 1
          : (config.minValue ?? 0) + config.stages.length;
        config.stages.push(createEmptyStage(start));
        const opened = config.stages.length - 1;
        return {
          ...focusOn(draft, ["affinity", key as string, "stages", opened, "startValue"]),
          ui: { stage: opened },
        };
      });
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 消す・外す（確かめてから消すもの以外。消したものは「元に戻す」で戻せる）

/** remove で draft から消せたら、「元に戻す」の知らせの文言を付けて返す。消せなければ null */
function removal(
  doc: CastDocument,
  message: string,
  remove: (draft: CastDocument) => boolean,
): EditResult {
  return edit(doc, (draft) => (remove(draft) ? { doc: draft, removed: message } : null));
}

/** 位置 at の要素を外す（items を書き換える）。範囲の外なら false */
function removeAt(items: unknown[], at: unknown): boolean {
  const position = index(at, items.length);
  if (position === null) return false;
  items.splice(position, 1);
  return true;
}

/** id の要素を外す（items を書き換える）。1 つもなければ false */
function removeById<T extends { id: string }>(items: T[], id: unknown): boolean {
  const kept = items.filter((item) => item.id !== id);
  if (kept.length === items.length) return false;
  items.splice(0, items.length, ...kept);
  return true;
}

export function applyRemove(doc: CastDocument, path: Path, ui: { stage: number }): EditResult {
  const [head, key, field, at] = path;
  if (head === "gallery" && path.length === 2)
    return removal(doc, "ギャラリー画像を外しました。", (draft) => removeById(draft.gallery, key));
  if (isImagePath(path)) {
    return removal(
      doc,
      "画像を外しました。",
      (draft) => !!readImage(draft, path) && writeImage(draft, path, null),
    );
  }
  if ((head === "cast" || head === "members") && path[path.length - 2] === "toneExamples") {
    return removal(doc, "口調サンプルを削除しました。", (draft) => {
      const slot = characterSlot(draft, path);
      return !!slot && slot.rest.length === 2 && removeAt(slot.target.toneExamples, slot.rest[1]);
    });
  }
  if (head === "intro" && path.length === 2 && typeof key === "number") {
    return removal(doc, "イントロのパートを削除しました。", (draft) =>
      removeAt(draft.introScript, key),
    );
  }
  if (head === "personas" && path.length === 2) {
    return removal(doc, "ペルソナを削除しました。", (draft) =>
      removeById(draft.recommendedPersonas, key),
    );
  }
  if (head === "lorebooks" && path.length === 2)
    return removal(doc, "設定集を外しました。", (draft) => removeById(draft.lorebooks, key));
  if (head === "tags" && path.length === 2)
    return removal(doc, "タグを外しました。", (draft) => removeAt(draft.tags, key));
  if (
    head === "affinity" &&
    path.length === 2 &&
    typeof key === "string" &&
    key !== AFFINITY_DEFAULT
  ) {
    // 個別設定をやめて共通設定に戻す
    return removal(doc, "個別設定をやめて、共通設定に戻しました。", (draft) => {
      if (!draft.affinity?.overrides[key]) return false;
      delete draft.affinity.overrides[key];
      return true;
    });
  }
  if (head === "affinity" && field === "stages" && path.length === 4) {
    return edit(doc, (draft) => {
      const config = affinityConfig(draft, key);
      if (!config || config.stages.length <= 1) return null;
      const position = index(at, config.stages.length);
      if (position === null) return null;
      config.stages.splice(position, 1);
      // 1 段階目を消したら、次の段階が最小値から始まる
      const first = config.stages[0];
      if (position === 0 && first) first.startValue = config.minValue;
      const stage =
        ui.stage > position ? ui.stage - 1 : Math.min(ui.stage, config.stages.length - 1);
      return { doc: draft, ui: { stage }, removed: "段階を削除しました。" };
    });
  }
  return null;
}

/** 確かめてから消すもの */
export function removalNeedsConfirm(doc: CastDocument, path: Path): string | null {
  const [head, key] = path;
  if (head === "members" && path.length === 2) {
    const position = doc.members.findIndex((member) => member.id === key);
    if (position < 0) return null;
    return doc.members[position]?.name.trim() || `${position + 2}人目`;
  }
  if (head === "affinity" && path.length === 1) return doc.affinity ? "好感度設定" : null;
  if (head === "intro" && key === "rest") return doc.introScript.length > 1 ? "イントロ" : null;
  return null;
}

export function removeMemberById(doc: CastDocument, id: string): EditOutcome {
  const draft = structuredClone(doc);
  removeMember(draft, id);
  return { doc: draft, ui: { character: MAIN_CHARACTER } };
}

export function removeAffinity(doc: CastDocument): EditOutcome {
  return {
    doc: { ...structuredClone(doc), affinity: null },
    ui: { subject: AFFINITY_DEFAULT, stage: 0 },
  };
}

/** 雑談モードで見えていない 2 つ目以降のパートを消す */
export function trimIntro(doc: CastDocument): EditOutcome {
  const draft = structuredClone(doc);
  draft.introScript = draft.introScript.slice(0, 1);
  return { doc: draft };
}

// ---------------------------------------------------------------------------
// 並べ替え・確定

function moveItem<T>(items: T[], from: number, to: number): boolean {
  if (to < 0 || to >= items.length || from === to) return false;
  const [item] = items.splice(from, 1);
  if (item === undefined) return false;
  items.splice(to, 0, item);
  return true;
}

export function applyMove(doc: CastDocument, path: Path, offset: -1 | 1): EditResult {
  const [head, key] = path;
  return edit(doc, (draft) => {
    if ((head === "cast" || head === "members") && path[path.length - 2] === "toneExamples") {
      const slot = characterSlot(draft, path);
      const position = slot ? index(slot.rest[1], slot.target.toneExamples.length) : null;
      if (!slot || position === null) return null;
      if (!moveItem(slot.target.toneExamples, position, position + offset)) return null;
      return focusOn(draft, [...slot.base, "toneExamples", position + offset, "situation"]);
    }
    if (head === "intro" && path.length === 2) {
      const position = index(key, draft.introScript.length);
      if (position === null || !moveItem(draft.introScript, position, position + offset))
        return null;
      return focusOn(draft, ["intro", position + offset, "text"]);
    }
    if (head === "lorebooks" && path.length === 2) {
      const position = draft.lorebooks.findIndex((book) => book.id === key);
      if (position < 0 || !moveItem(draft.lorebooks, position, position + offset)) return null;
      return { doc: draft };
    }
    return null;
  });
}

/** 好感度の開始値を確定したら小さい順に並べ直す（1 段階目は動かさない）。開いている段階はついていく。 */
export function applyCommit(doc: CastDocument, path: Path, ui: { stage: number }): EditResult {
  const [head, subject, field, at, stageField] = path;
  if (head !== "affinity" || field !== "stages" || stageField !== "startValue") return null;
  return edit(doc, (draft) => {
    const config = affinityConfig(draft, subject);
    const position = config ? index(at, config.stages.length) : null;
    if (!config || position === null) return null;
    const open = config.stages[ui.stage];
    sortAffinityStages(config);
    const stage = open ? config.stages.indexOf(open) : ui.stage;
    return { doc: draft, ui: { stage } };
  });
}

// ---------------------------------------------------------------------------
// 画像

/** 画像を入れる場所か */
export function isImagePath(path: Path): boolean {
  const [head, key, field] = path;
  if (head === "cast")
    return path.length === 2 && (key === "avatar" || key === "cover" || key === "background");
  if (head === "members" || head === "personas") return path.length === 3 && field === "avatar";
  if (head === "gallery") return path.length === 2;
  return false;
}

export function readImage(doc: CastDocument, path: Path): CastImage | null {
  const [head, key, field] = path;
  if (head === "cast" && path.length === 2) {
    if (key === "avatar") return doc.avatar;
    if (key === "cover") return doc.cover;
    if (key === "background") return doc.background;
  }
  if (head === "members" && field === "avatar")
    return doc.members.find((member) => member.id === key)?.avatar ?? null;
  if (head === "personas" && field === "avatar")
    return doc.recommendedPersonas.find((persona) => persona.id === key)?.avatar ?? null;
  if (head === "gallery" && path.length === 2)
    return doc.gallery.find((image) => image.id === key) ?? null;
  return null;
}

/** 画像を差し替える（draft を書き換える）。場所がなければ false */
function writeImage(draft: CastDocument, path: Path, image: CastImage | null): boolean {
  const [head, key, field] = path;
  if (head === "cast" && path.length === 2) {
    if (key === "avatar") draft.avatar = image;
    else if (key === "cover") draft.cover = image;
    else if (key === "background") draft.background = image;
    else return false;
    return true;
  }
  if ((head === "members" || head === "personas") && field === "avatar") {
    const owner =
      head === "members"
        ? draft.members.find((member) => member.id === key)
        : draft.recommendedPersonas.find((persona) => persona.id === key);
    if (!owner) return false;
    owner.avatar = image;
    return true;
  }
  return false;
}

/** 切り抜いた画像を入れる。ギャラリー（["gallery"]）なら末尾に足す */
export function placeImage(doc: CastDocument, path: Path, image: CastImage): EditResult {
  return edit(doc, (draft) => {
    if (path.length === 1 && path[0] === "gallery") {
      if (draft.gallery.length >= LIMITS.gallery)
        return { refused: `ギャラリー画像は${LIMITS.gallery}枚まで登録できます。` };
      const item: GalleryImage = { ...image, id: newId(), blurred: false };
      draft.gallery.push(item);
      return undefined;
    }
    return writeImage(draft, path, image) ? undefined : null;
  });
}

/** 画像の枠の種類（切り抜きの比率・大きさ） */
export function imageKindAt(path: Path): ImageKind | null {
  const [head, key] = path;
  if (head === "cast" && (key === "avatar" || key === "cover" || key === "background")) return key;
  if (head === "members" && path.length === 3) return "member";
  if (head === "personas" && path.length === 3) return "persona";
  if (head === "gallery" && path.length === 1) return "gallery";
  return null;
}
