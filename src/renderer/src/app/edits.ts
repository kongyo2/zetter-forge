import {
  AFFINITY_RANGE_FIELDS,
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
  PLAY_GUIDE_FIELDS,
  type ToneExample,
  createDefaultAffinityConfig,
  createEmptyMember,
  createEmptyPersona,
  createEmptyStage,
  isAffinityPace,
  isFieldKey,
  newId,
  normalizeAffinityConfig,
  removeMember,
  sortAffinityStages,
} from "@shared/cast";
import type { ImageKind } from "@shared/images";
import { LIMITS } from "@shared/limits";
import { formatCount, utf16Length } from "@shared/text";
import { limitPartnerSettingsValue } from "@shared/validate";

import { memberLabel } from "./labels";
import {
  AFFINITY_DEFAULT,
  type FocusTarget,
  MAIN_CHARACTER,
  type Path,
  type Selection,
} from "./types";

export const USER_PLACEHOLDER = "{{user}}";

export interface EditOutcome {
  doc: CastDocument;
  focus?: FocusTarget;
  ui?: { character?: string; subject?: string; stage?: number };
  removed?: string;
}

export interface EditRefusal {
  refused: string;
}

export type EditResult = EditOutcome | EditRefusal | null;

export function isRefusal(result: EditResult): result is EditRefusal {
  return !!result && "refused" in result;
}

interface CharacterSlot {
  base: Path;
  target: CastDocument | CastMember;
  rest: Path;
}

export function characterSlot(draft: CastDocument, path: Path): CharacterSlot | null {
  if (path[0] === "cast") return { base: ["cast"], target: draft, rest: path.slice(1) };
  if (path[0] === "members" && typeof path[1] === "string") {
    const member = draft.members.find((candidate) => candidate.id === path[1]);
    return member ? { base: path.slice(0, 2), target: member, rest: path.slice(2) } : null;
  }
  return null;
}

export function affinityConfig(draft: CastDocument, subject: unknown): AffinityConfig | null {
  if (!draft.affinity || typeof subject !== "string") return null;
  if (subject === AFFINITY_DEFAULT) return draft.affinity.default;
  return draft.affinity.overrides[subject] ?? null;
}

function stageAt(
  draft: CastDocument,
  subject: unknown,
  at: unknown,
): { config: AffinityConfig; position: number } | null {
  const config = affinityConfig(draft, subject);
  const position = config ? index(at, config.stages.length) : null;
  return config && position !== null ? { config, position } : null;
}

function index(segment: unknown, length: number): number | null {
  return typeof segment === "number" &&
    Number.isInteger(segment) &&
    segment >= 0 &&
    segment < length
    ? segment
    : null;
}

function isList(path: Path, name: string): boolean {
  return path.length === 1 && path[0] === name;
}

function isItem(path: Path, name: string): boolean {
  return path.length === 2 && path[0] === name;
}

function isCharacterPath(path: Path): boolean {
  return path[0] === "cast" || path[0] === "members";
}

function isToneRow(path: Path): boolean {
  return isCharacterPath(path) && path[path.length - 2] === "toneExamples";
}

function parseNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function replaceSelection(
  value: string,
  selection: Selection,
  insertion: (start: number) => string,
): { value: string; caret: number } {
  const start = Math.min(Math.max(0, selection.start), value.length);
  const end = Math.min(Math.max(start, selection.end), value.length);
  const text = insertion(start);
  return {
    value: `${value.slice(0, start)}${text}${value.slice(end)}`,
    caret: start + text.length,
  };
}

function edit(doc: CastDocument, recipe: (draft: CastDocument) => EditResult | void): EditResult {
  const draft = structuredClone(doc);
  const result = recipe(draft);
  if (result === undefined) return { doc: draft };
  return result;
}

function focusOn(draft: CastDocument, path: Path, selection: Selection | null = null): EditOutcome {
  return { doc: draft, focus: { path, selection } };
}

function updateById<T extends { id: string }>(
  items: T[],
  id: unknown,
  apply: (item: T) => void,
): null | undefined {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) return null;
  apply(item);
  return undefined;
}

function introPart(draft: CastDocument, at: unknown): IntroPart | undefined {
  const position = index(at, draft.introScript.length);
  return position === null ? undefined : draft.introScript[position];
}

function introText(
  draft: CastDocument,
  at: unknown,
): { text: string; write(text: string): void } | null {
  if (at === "first") {
    const first = draft.introScript[0];
    return {
      text: first?.text ?? "",
      write: (text) => {
        if (first) first.text = text;
        else draft.introScript.push({ kind: "speech", text, speakerId: null });
      },
    };
  }
  const part = introPart(draft, at);
  return part ? { text: part.text, write: (text) => void (part.text = text) } : null;
}

function copyOfCommon(affinity: NonNullable<CastDocument["affinity"]>): AffinityConfig {
  return normalizeAffinityConfig(structuredClone(affinity.default)) as AffinityConfig;
}

const COMMON_SUBJECT = { subject: AFFINITY_DEFAULT, stage: 0 };

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
  if (isCharacterPath(path)) return inputCharacter(doc, path, value);
  if (head === "intro") return inputIntro(doc, path, value);
  if (head === "playGuide") {
    const [, key, field] = path;
    if (path.length !== 3 || !isFieldKey(PLAY_GUIDE_FIELDS, key) || field !== "text") return null;
    return edit(doc, (draft) => void (draft.playGuide[key].text = value));
  }
  if (head === "personas") {
    const [, id, field] = path;
    if (field !== "name" && field !== "tagline" && field !== "note") return null;
    return edit(doc, (draft) =>
      updateById(draft.recommendedPersonas, id, (persona) => void (persona[field] = value)),
    );
  }
  if (head === "affinity") return inputAffinity(doc, path, value);
  if (head === "lorebooks") {
    const [, id, field] = path;
    if (field !== "title" && field !== "note") return null;
    return edit(doc, (draft) =>
      updateById(draft.lorebooks, id, (book) => void (book[field] = value)),
    );
  }
  if (isItem(path, "tags")) {
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
    if (
      key === "partnerSettings" &&
      rest.length === 1 &&
      isFieldKey(PARTNER_SETTINGS_FIELDS, rest[0])
    ) {
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

export function introRoleValue(part: Pick<IntroPart, "kind" | "speakerId">): string {
  return part.kind === "narration" ? "narration" : `speech:${part.speakerId ?? ""}`;
}

function inputIntro(doc: CastDocument, path: Path, value: string): EditResult {
  const [, at, field] = path;
  if (field === "text") {
    return edit(doc, (draft) => {
      const slot = introText(draft, at);
      if (!slot) return null;
      slot.write(value);
    });
  }
  if (field !== "role") return null;
  return edit(doc, (draft) => {
    const part = introPart(draft, at);
    if (!part) return null;
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
  });
}

function inputAffinity(doc: CastDocument, path: Path, value: string): EditResult {
  const [, subject, field, at, stageField] = path;
  return edit(doc, (draft) => {
    const config = affinityConfig(draft, subject);
    if (!config) return null;
    if (path.length === 3) {
      if (field === "itemName") config.itemName = value;
      else if (isFieldKey(AFFINITY_RANGE_FIELDS, field)) {
        config[field] = parseNumber(value);
        if (field === "minValue" && config.stages[0]) config.stages[0].startValue = config.minValue;
      } else if (field === "pace") {
        if (!isAffinityPace(value)) return null;
        config.pace = value;
      } else return null;
      return undefined;
    }
    if (field !== "stages" || path.length !== 5) return null;
    const position = index(at, config.stages.length);
    if (position === null) return null;
    const stage = config.stages[position] as AffinityStage;
    if (stageField === "startValue") {
      if (position === 0) return null;
      stage.startValue = parseNumber(value);
      return undefined;
    }
    if (!isFieldKey(AFFINITY_STAGE_FIELDS, stageField)) return null;
    stage[stageField] = value;
    return undefined;
  });
}

const CAST_SWITCHES: Record<string, (draft: CastDocument, checked: boolean) => void> = {
  avatarBlurred: (draft, checked) => void (draft.avatarBlurred = checked),
  coverBlurred: (draft, checked) => void (draft.coverBlurred = checked),
  public: (draft, checked) => void (draft.status = checked ? "public" : "private"),
  personaVisible: (draft, checked) => void (draft.personaHidden = !checked),
  toneExamplesVisible: (draft, checked) => void (draft.toneExamplesHidden = !checked),
  situationVisible: (draft, checked) => void (draft.situationHidden = !checked),
  authorVisible: (draft, checked) => void (draft.authorHidden = !checked),
  showFavoriteCount: (draft, checked) => void (draft.showFavoriteCount = checked),
  showTalkCount: (draft, checked) => void (draft.showTalkCount = checked),
};

export function applyCheck(doc: CastDocument, path: Path, checked: boolean): EditResult {
  const [head, key, field] = path;
  if (isItem(path, "cast") && typeof key === "string") {
    const apply = CAST_SWITCHES[key];
    return apply ? edit(doc, (draft) => apply(draft, checked)) : null;
  }
  if (
    head === "playGuide" &&
    path.length === 3 &&
    field === "hidden" &&
    isFieldKey(PLAY_GUIDE_FIELDS, key)
  )
    return edit(doc, (draft) => void (draft.playGuide[key].hidden = checked));
  if (head === "personas" && field === "useViewerName") {
    return edit(doc, (draft) =>
      updateById(
        draft.recommendedPersonas,
        key,
        (persona) => void (persona.useViewerName = checked),
      ),
    );
  }
  if (head === "gallery" && field === "blurred") {
    return edit(doc, (draft) =>
      updateById(draft.gallery, key, (image) => void (image.blurred = checked)),
    );
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
        const config = draft.affinity.overrides[key] ?? copyOfCommon(draft.affinity);
        config.enabled = !checked;
        draft.affinity.overrides[key] = config;
        return undefined;
      }
      return null;
    });
  }
  return null;
}

export function insertTimeChip(value: string, selection: Selection, label: string) {
  return replaceSelection(value, selection, (start) => {
    const atLineStart = start === 0 || value[start - 1] === "\n";
    return `${atLineStart ? "" : "\n"}【${label}】 `;
  });
}

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
    const slot = introText(draft, at);
    if (!slot) return null;
    const { value: next, caret } = replaceSelection(slot.text, selection, () => USER_PLACEHOLDER);
    if (utf16Length(next) > LIMITS.introPart)
      return {
        refused: `イントロのパートは${formatCount(LIMITS.introPart)}字までなので、${USER_PLACEHOLDER} が入りません。`,
      };
    slot.write(next);
    return focusOn(draft, path, { start: caret, end: caret });
  });
}

export function applyAdd(doc: CastDocument, path: Path): EditResult {
  const [head, key, field] = path;
  if (isList(path, "members")) {
    if (doc.mode !== "story" || 1 + doc.members.length >= LIMITS.charactersTotal) return null;
    const member = createEmptyMember();
    return edit(doc, (draft) => {
      draft.members.push(member);
      return { ...focusOn(draft, ["members", member.id, "name"]), ui: { character: member.id } };
    });
  }
  if (isCharacterPath(path) && path[path.length - 1] === "toneExamples") {
    return edit(doc, (draft) => {
      const slot = characterSlot(draft, path);
      if (!slot || slot.rest.length !== 1) return null;
      const list = slot.target.toneExamples;
      if (list.length >= LIMITS.toneItemsPerCharacter) return null;
      list.push({ situation: "", example: "" });
      return focusOn(draft, [...slot.base, "toneExamples", list.length - 1, "situation"]);
    });
  }
  if (isList(path, "intro")) {
    if (doc.introScript.length >= LIMITS.introParts) return null;
    return edit(doc, (draft) => {
      draft.introScript.push({ kind: "narration", text: "", speakerId: null });
      return focusOn(draft, ["intro", draft.introScript.length - 1, "text"]);
    });
  }
  if (isList(path, "personas")) {
    if (doc.recommendedPersonas.length >= LIMITS.personas) return null;
    const persona = createEmptyPersona();
    return edit(doc, (draft) => {
      draft.recommendedPersonas.push(persona);
      return focusOn(draft, ["personas", persona.id, "name"]);
    });
  }
  if (isList(path, "lorebooks")) {
    if (doc.lorebooks.length >= LIMITS.lorebooks) return null;
    const id = newId();
    return edit(doc, (draft) => {
      draft.lorebooks.push({ id, title: "", note: "" });
      return focusOn(draft, ["lorebooks", id, "title"]);
    });
  }
  if (isList(path, "tags")) {
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
        return { doc: draft, ui: COMMON_SUBJECT };
      });
    }
    if (path.length === 2 && typeof key === "string" && key !== AFFINITY_DEFAULT) {
      return edit(doc, (draft) => {
        if (!draft.affinity || draft.affinity.overrides[key]) return null;
        draft.affinity.overrides[key] = copyOfCommon(draft.affinity);
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

function removal(
  doc: CastDocument,
  message: string,
  remove: (draft: CastDocument) => boolean,
): EditResult {
  return edit(doc, (draft) => (remove(draft) ? { doc: draft, removed: message } : null));
}

function removeAt(items: unknown[], at: unknown): boolean {
  const position = index(at, items.length);
  if (position === null) return false;
  items.splice(position, 1);
  return true;
}

function removeById<T extends { id: string }>(items: T[], id: unknown): boolean {
  const kept = items.filter((item) => item.id !== id);
  if (kept.length === items.length) return false;
  items.splice(0, items.length, ...kept);
  return true;
}

export function applyRemove(doc: CastDocument, path: Path, ui: { stage: number }): EditResult {
  const [head, key, field, at] = path;
  if (isItem(path, "gallery"))
    return removal(doc, "ギャラリー画像を外しました。", (draft) => removeById(draft.gallery, key));
  if (isImagePath(path)) {
    return removal(
      doc,
      "画像を外しました。",
      (draft) => !!readImage(draft, path) && writeImage(draft, path, null),
    );
  }
  if (isToneRow(path)) {
    return removal(doc, "口調サンプルを削除しました。", (draft) => {
      const slot = characterSlot(draft, path);
      return !!slot && slot.rest.length === 2 && removeAt(slot.target.toneExamples, slot.rest[1]);
    });
  }
  if (isItem(path, "intro") && typeof key === "number") {
    return removal(doc, "イントロのパートを削除しました。", (draft) =>
      removeAt(draft.introScript, key),
    );
  }
  if (isItem(path, "personas")) {
    return removal(doc, "ペルソナを削除しました。", (draft) =>
      removeById(draft.recommendedPersonas, key),
    );
  }
  if (isItem(path, "lorebooks"))
    return removal(doc, "設定集を外しました。", (draft) => removeById(draft.lorebooks, key));
  if (isItem(path, "tags"))
    return removal(doc, "タグを外しました。", (draft) => removeAt(draft.tags, key));
  if (isItem(path, "affinity") && typeof key === "string" && key !== AFFINITY_DEFAULT) {
    return removal(doc, "個別設定をやめて、共通設定に戻しました。", (draft) => {
      if (!draft.affinity?.overrides[key]) return false;
      delete draft.affinity.overrides[key];
      return true;
    });
  }
  if (head === "affinity" && field === "stages" && path.length === 4) {
    return edit(doc, (draft) => {
      const found = stageAt(draft, key, at);
      if (!found || found.config.stages.length <= 1) return null;
      const { config, position } = found;
      config.stages.splice(position, 1);
      const first = config.stages[0];
      if (position === 0 && first) first.startValue = config.minValue;
      const stage =
        ui.stage > position ? ui.stage - 1 : Math.min(ui.stage, config.stages.length - 1);
      return { doc: draft, ui: { stage }, removed: "段階を削除しました。" };
    });
  }
  return null;
}

export function removalNeedsConfirm(doc: CastDocument, path: Path): string | null {
  const [head, key] = path;
  if (isItem(path, "members")) {
    const position = doc.members.findIndex((member) => member.id === key);
    if (position < 0) return null;
    return memberLabel(doc.members[position], position);
  }
  if (isList(path, "affinity")) return doc.affinity ? "好感度設定" : null;
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
    ui: COMMON_SUBJECT,
  };
}

export function trimIntro(doc: CastDocument): EditOutcome {
  const draft = structuredClone(doc);
  draft.introScript = draft.introScript.slice(0, 1);
  return { doc: draft };
}

function moveItem<T>(items: T[], from: number, to: number): boolean {
  if (to < 0 || to >= items.length || from === to) return false;
  const [item] = items.splice(from, 1);
  if (item === undefined) return false;
  items.splice(to, 0, item);
  return true;
}

export function applyMove(doc: CastDocument, path: Path, offset: -1 | 1): EditResult {
  const [, key] = path;
  return edit(doc, (draft) => {
    if (isToneRow(path)) {
      const slot = characterSlot(draft, path);
      const position = slot ? index(slot.rest[1], slot.target.toneExamples.length) : null;
      if (!slot || position === null) return null;
      if (!moveItem(slot.target.toneExamples, position, position + offset)) return null;
      return focusOn(draft, [...slot.base, "toneExamples", position + offset, "situation"]);
    }
    if (isItem(path, "intro")) {
      const position = index(key, draft.introScript.length);
      if (position === null || !moveItem(draft.introScript, position, position + offset))
        return null;
      return focusOn(draft, ["intro", position + offset, "text"]);
    }
    if (isItem(path, "lorebooks")) {
      const position = draft.lorebooks.findIndex((book) => book.id === key);
      if (position < 0 || !moveItem(draft.lorebooks, position, position + offset)) return null;
      return { doc: draft };
    }
    return null;
  });
}

export function applyCommit(doc: CastDocument, path: Path, ui: { stage: number }): EditResult {
  const [head, subject, field, at, stageField] = path;
  if (head !== "affinity" || field !== "stages" || stageField !== "startValue") return null;
  return edit(doc, (draft) => {
    const config = stageAt(draft, subject, at)?.config;
    if (!config) return null;
    const open = config.stages[ui.stage];
    sortAffinityStages(config);
    const stage = open ? config.stages.indexOf(open) : ui.stage;
    return { doc: draft, ui: { stage } };
  });
}

const CAST_IMAGES = ["avatar", "cover", "background"] as const;

function isCastImageKey(key: unknown): key is (typeof CAST_IMAGES)[number] {
  return CAST_IMAGES.some((name) => name === key);
}

function avatarOwner(
  doc: CastDocument,
  head: "members" | "personas",
  id: unknown,
): { avatar: CastImage | null } | undefined {
  const owners: readonly { id: string; avatar: CastImage | null }[] =
    head === "members" ? doc.members : doc.recommendedPersonas;
  return owners.find((owner) => owner.id === id);
}

export function isImagePath(path: Path): boolean {
  const [head, key, field] = path;
  if (head === "cast") return path.length === 2 && isCastImageKey(key);
  if (head === "members" || head === "personas") return path.length === 3 && field === "avatar";
  return isItem(path, "gallery");
}

export function readImage(doc: CastDocument, path: Path): CastImage | null {
  const [head, key, field] = path;
  if (isItem(path, "cast") && isCastImageKey(key)) return doc[key];
  if ((head === "members" || head === "personas") && field === "avatar")
    return avatarOwner(doc, head, key)?.avatar ?? null;
  if (isItem(path, "gallery")) return doc.gallery.find((image) => image.id === key) ?? null;
  return null;
}

function writeImage(draft: CastDocument, path: Path, image: CastImage | null): boolean {
  const [head, key, field] = path;
  if (isItem(path, "cast")) {
    if (!isCastImageKey(key)) return false;
    draft[key] = image;
    return true;
  }
  if ((head === "members" || head === "personas") && field === "avatar") {
    const owner = avatarOwner(draft, head, key);
    if (!owner) return false;
    owner.avatar = image;
    return true;
  }
  return false;
}

export function placeImage(doc: CastDocument, path: Path, image: CastImage): EditResult {
  return edit(doc, (draft) => {
    if (isList(path, "gallery")) {
      if (draft.gallery.length >= LIMITS.gallery)
        return { refused: `ギャラリー画像は${LIMITS.gallery}枚まで登録できます。` };
      const item: GalleryImage = { ...image, id: newId(), blurred: false };
      draft.gallery.push(item);
      return undefined;
    }
    return writeImage(draft, path, image) ? undefined : null;
  });
}

export function imageKindAt(path: Path): ImageKind | null {
  const [head, key] = path;
  if (head === "cast" && isCastImageKey(key)) return key;
  if (head === "members" && path.length === 3) return "member";
  if (head === "personas" && path.length === 3) return "persona";
  if (isList(path, "gallery")) return "gallery";
  return null;
}
