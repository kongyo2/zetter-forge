// キャラクターのタブに描くもの。
import {
  type CastMember,
  PARTNER_HABIT_CHIPS,
  PARTNER_SETTINGS_FIELDS,
  PARTNER_TIME_CHIPS,
  type PartnerSettings,
  type ToneExample,
  sendableMembers,
} from "@shared/cast";
import { LIMITS } from "@shared/limits";
import { formatCount, utf16Length } from "@shared/text";
import {
  partnerSettingsLength,
  settingsShares,
  settingsUsage,
  toneShares,
  type UsageShare,
} from "@shared/validate";

import { castInk, INKED_CHARACTERS } from "../ink";
import { MAIN_CHARACTER, type Path } from "../types";
import type {
  CharacterSheetVM,
  CharacterTabVM,
  CounterVM,
  PartnerVM,
  TabItemVM,
  ToneListVM,
} from "../viewModels";
import { type AllowancePart, CHARS_PER_CELL, allowance } from "./allowance";
import { type Context, avatar, counter, imageField, imageSrc, textField, toggle } from "./common";

function partner(ctx: Context, base: Path, settings: PartnerSettings): PartnerVM {
  const scope = [...base, "partnerSettings"];
  const total = partnerSettingsLength(settings);
  const near = total >= LIMITS.partnerSettingsTotal * 0.9;
  return {
    scope: ["partnerSettings"],
    counter: {
      text: near
        ? `残り${formatCount(Math.max(0, LIMITS.partnerSettingsTotal - total))}字`
        : `${formatCount(total)}/${formatCount(LIMITS.partnerSettingsTotal)}字`,
      tone: total > LIMITS.partnerSettingsTotal ? "over" : near ? "near" : "normal",
      aside: null,
    },
    fields: PARTNER_SETTINGS_FIELDS.map((field) =>
      textField(ctx, scope, [field.key], {
        label: field.label,
        value: settings[field.key],
        placeholder: field.placeholder,
        multiline: true,
        rows: 2,
        chips:
          field.key === "dailyRoutine"
            ? {
                label: "時間帯の見出しを入れる",
                placement: "above",
                style: "chip",
                items: PARTNER_TIME_CHIPS.map((chip) => ({ label: `【${chip}】`, text: chip })),
              }
            : field.key === "messageHabits"
              ? {
                  label: "よくある癖を書き足す",
                  placement: "above",
                  style: "chip",
                  items: PARTNER_HABIT_CHIPS.map((chip) => ({ label: chip, text: chip })),
                }
              : null,
      }),
    ),
  };
}

function tones(ctx: Context, base: Path, list: readonly ToneExample[]): ToneListVM {
  const scope = [...base, "toneExamples"];
  return {
    scope: ["toneExamples"],
    meta: `${list.length} / ${LIMITS.toneItemsPerCharacter}件`,
    rows: list.map((item, index) => {
      const row = [...scope, index];
      const half = !!item.situation.trim() !== !!item.example.trim();
      return {
        index,
        situation: textField(ctx, row, ["situation"], {
          label: "状況",
          ariaLabel: `口調サンプル${index + 1}の状況`,
          value: item.situation,
          placeholder: "例: 元気がないと相談された",
          maxLength: LIMITS.toneSituation,
          counter: counter(utf16Length(item.situation), LIMITS.toneSituation),
        }),
        example: textField(ctx, row, ["example"], {
          label: "発話例",
          ariaLabel: `口調サンプル${index + 1}の発話例`,
          value: item.example,
          placeholder: "そのときどう返すか",
          multiline: true,
          rows: 2,
          maxLength: LIMITS.toneExample,
          counter: counter(utf16Length(item.example), LIMITS.toneExample),
          warning: half ? "状況と発話例の両方を書くと保存されます" : null,
        }),
        move: {
          canUp: index > 0,
          canDown: index < list.length - 1,
          removeLabel: "この話し方の例を削除",
        },
      };
    }),
    canAdd: list.length < LIMITS.toneItemsPerCharacter,
  };
}

export function presentCharacter(ctx: Context): CharacterTabVM {
  const { doc, session } = ctx;
  const story = doc.mode === "story";
  const member = story
    ? doc.members.find((candidate) => candidate.id === session.ui.character)
    : undefined;
  const memberIndex = member ? doc.members.indexOf(member) : -1;
  const characterCount = 1 + (story ? doc.members.length : 0);
  const settings = settingsUsage(doc);

  const nameOf = (memberId: string | null) => {
    if (memberId === null) return doc.name.trim() || "本人";
    const index = doc.members.findIndex((candidate) => candidate.id === memberId);
    return doc.members[index]?.name.trim() || `${index + 2}人目`;
  };
  // 9 人目からは色が足りないので「ほか N人」にまとめる
  const toParts = (shares: UsageShare[]): AllowancePart[] => {
    const parts = shares.slice(0, INKED_CHARACTERS).map((share, index) => ({
      key: share.memberId ?? MAIN_CHARACTER,
      label: nameOf(share.memberId),
      length: share.length,
      ink: castInk(index),
    }));
    const rest = shares.slice(INKED_CHARACTERS);
    if (rest.length > 0) {
      parts.push({
        key: "rest",
        label: `ほか${rest.length}人`,
        length: rest.reduce((sum, share) => sum + share.length, 0),
        ink: castInk(INKED_CHARACTERS),
      });
    }
    return parts;
  };
  const settingsParts = toParts(settingsShares(doc));
  const toneParts = toParts(toneShares(doc));
  const settingsTotal = settingsParts.reduce((sum, part) => sum + part.length, 0);
  const toneTotal = toneParts.reduce((sum, part) => sum + part.length, 0);

  const settingsCounter = (length: number): CounterVM => ({
    text: `${formatCount(length)}字`,
    tone:
      settings.over > 0
        ? "over"
        : settings.remaining <= LIMITS.settingsTotal * 0.1
          ? "near"
          : "normal",
    aside: story ? `全体の残り${formatCount(settings.remaining)}字` : null,
  });

  const castTabs: TabItemVM<string>[] = [
    {
      id: MAIN_CHARACTER,
      domId: "cast-tab-main",
      label: doc.name.trim() || "名前未設定",
      sub: "本人",
      avatar: avatar(imageSrc(session, doc.avatar), doc.name, castInk(0), doc.avatarBlurred),
      selected: !member,
    },
    ...doc.members.map((item, index) => ({
      id: item.id,
      domId: `cast-tab-${item.id}`,
      label: item.name.trim() || "名前未設定",
      sub: `${index + 2}人目`,
      avatar: avatar(imageSrc(session, item.avatar), item.name, castInk(index + 1)),
      selected: member?.id === item.id,
    })),
  ];

  return {
    story,
    people: story ? `${characterCount} / ${LIMITS.charactersTotal}人` : null,
    allowances: [
      allowance(
        "性格・設定",
        settingsParts,
        LIMITS.settingsTotal,
        settingsTotal > LIMITS.settingsTotal
          ? "誰の設定を削るかはお任せします。"
          : story
            ? "本人と登場人物の合計です。配分は自由です（「いまの状況」は別枠で20,000字）。"
            : null,
      ),
      allowance(
        "口調サンプル",
        toneParts,
        LIMITS.toneTotal,
        toneTotal > LIMITS.toneTotal
          ? "誰の口調サンプルを削るかはお任せします。"
          : "状況と発話例の字数の合計です。",
      ),
    ],
    scale: `マス目はひとつ${CHARS_PER_CELL}字（原稿用紙1枚ぶん）です。`,
    castTabs: story ? { items: castTabs, canAdd: characterCount < LIMITS.charactersTotal } : null,
    sheet: member
      ? memberSheet(ctx, member, memberIndex, settingsCounter)
      : mainSheet(ctx, settingsCounter),
    labelledBy: story ? (member ? `cast-tab-${member.id}` : "cast-tab-main") : null,
    leftover:
      !story && doc.members.length > 0
        ? `ストーリーモードで書いた登場人物が${doc.members.length}人ぶん残っています。雑談モードでは送られません（ストーリーに戻すと使えます）。`
        : null,
  };
}

function mainSheet(ctx: Context, settingsCounter: (length: number) => CounterVM): CharacterSheetVM {
  const { doc } = ctx;
  const scope = ["cast"];
  return {
    scope,
    ink: castInk(0),
    removeLabel: null,
    avatar: imageField(ctx, scope, ["avatar"], doc.avatar, {
      label: "アイコン",
      shape: "circle",
      blurred: doc.avatarBlurred,
    }),
    name: textField(ctx, scope, ["name"], {
      label: "名前",
      value: doc.name,
      placeholder: "キャストの名前",
      required: true,
      invalid: !doc.name.trim(),
      error: doc.name.trim() ? null : "名前を入力してください",
      maxLength: LIMITS.name,
      counter: counter(utf16Length(doc.name), LIMITS.name),
    }),
    avatarBlurred: toggle(["avatarBlurred"], "この画像をぼかして表示する", doc.avatarBlurred),
    profile: textField(ctx, scope, ["persona"], {
      label: "性格・設定",
      value: doc.persona,
      placeholder: "性格・話し方・背景など",
      required: true,
      invalid: !doc.persona.trim(),
      error: doc.persona.trim() ? null : "性格・設定を入力してください",
      hint: [
        "形容詞より、行動の癖で書くと生きます。「優しい」より「お礼が言えず『……置いといて』と言いながら必ず飲む」。",
      ],
      multiline: true,
      rows: 8,
      maxLength: LIMITS.settingsTotal,
      counter: settingsCounter(utf16Length(doc.persona)),
    }),
    partner: partner(ctx, scope, doc.partnerSettings),
    tones: tones(ctx, scope, doc.toneExamples),
  };
}

function memberSheet(
  ctx: Context,
  member: CastMember,
  index: number,
  settingsCounter: (length: number) => CounterVM,
): CharacterSheetVM {
  const sendable = sendableMembers(ctx.doc).includes(member);
  const label = member.name.trim() || `${index + 2}人目`;
  const scope = ["members", member.id];
  const missingName = sendable && !member.name.trim();
  return {
    scope,
    ink: castInk(index + 1),
    removeLabel: `${label}を削除`,
    avatar: imageField(ctx, scope, ["avatar"], member.avatar, {
      label: "アイコン",
      shape: "circle",
    }),
    name: textField(ctx, scope, ["name"], {
      label: "名前",
      ariaLabel: `${index + 2}人目の名前`,
      value: member.name,
      placeholder: "この人の名前",
      required: true,
      invalid: missingName,
      error: missingName ? "名前を入力してください" : null,
      maxLength: LIMITS.memberName,
      counter: counter(utf16Length(member.name), LIMITS.memberName),
    }),
    avatarBlurred: null,
    profile: textField(ctx, scope, ["profile"], {
      label: "性格・設定",
      ariaLabel: `${index + 2}人目の性格・設定`,
      value: member.profile,
      placeholder: "性格・話し方・ほかの人との関係",
      hint: ["性格・話し方・ほかの登場人物との関係。AIに渡ります。"],
      multiline: true,
      rows: 5,
      maxLength: LIMITS.settingsTotal,
      counter: settingsCounter(utf16Length(member.profile)),
    }),
    partner: partner(ctx, scope, member.partnerSettings),
    tones: tones(ctx, scope, member.toneExamples),
  };
}
