// 体験設定のタブに描くもの。
import { sendableMembers } from "@shared/cast";
import { LIMITS } from "@shared/limits";
import { utf16Length } from "@shared/text";

import { USER_PLACEHOLDER, introRoleValue } from "../edits";
import { castInk } from "../ink";
import type { ChipsVM, ExperienceTabVM, IntroPartVM, PersonaVM, SelectVM } from "../viewModels";
import { type Context, counter, imageField, textField, toggle } from "./common";

const MODE_OPTIONS = [
  { value: "story", title: "ストーリー", text: "地の文とセリフで、じっくり物語を進めます。" },
  { value: "chat", title: "雑談", text: "地の文なしで、短い掛け合いをテンポよく続けます。" },
] as const;

const USER_CHIP: ChipsVM = {
  label: `${USER_PLACEHOLDER}を挿入`,
  placement: "below",
  style: "button",
  items: [{ label: `${USER_PLACEHOLDER}を挿入`, text: USER_PLACEHOLDER }],
};

function intro(ctx: Context): IntroPartVM[] {
  const { doc } = ctx;
  const members = sendableMembers(doc);
  const mainName = doc.name.trim() || "キャスト本体";
  const count = doc.introScript.length;
  return doc.introScript.map((part, index) => {
    // 選べなくなった登場人物（中身を消した人）が話者のままなら、その人も選択肢に残す
    const orphan =
      part.speakerId && !members.some((member) => member.id === part.speakerId)
        ? doc.members.find((member) => member.id === part.speakerId)
        : undefined;
    const speakers = [...members, ...(orphan ? [orphan] : [])];
    const role: SelectVM = {
      name: ["role"],
      label: `パート${index + 1}の種類と話者`,
      value: introRoleValue(part),
      options: [
        { value: "narration", label: "ナレーション", group: null },
        ...(speakers.length > 0
          ? [
              { value: "speech:", label: mainName, group: "セリフ" },
              ...speakers.map((member) => ({
                value: `speech:${member.id}`,
                label: member.name.trim() || "名前のない登場人物",
                group: "セリフ",
              })),
            ]
          : [{ value: "speech:", label: "セリフ", group: null }]),
      ],
    };
    const speech = part.kind === "speech";
    const speakerIndex = part.speakerId
      ? doc.members.findIndex((member) => member.id === part.speakerId) + 1
      : 0;
    return {
      index,
      speech,
      ink: speech ? castInk(Math.max(0, speakerIndex)) : null,
      role,
      text: textField(ctx, ["intro", index], ["text"], {
        label: `イントロのパート${index + 1}`,
        labelHidden: true,
        value: part.text,
        placeholder: speech ? "セリフを入力" : "地の文を入力",
        multiline: true,
        rows: 2,
        maxLength: LIMITS.introPart,
        counter: counter(utf16Length(part.text), LIMITS.introPart),
        chips: USER_CHIP,
      }),
      move: { canUp: index > 0, canDown: index < count - 1, removeLabel: "このパートを削除" },
    };
  });
}

function personas(ctx: Context): PersonaVM[] {
  return ctx.doc.recommendedPersonas.map((persona, index) => {
    const scope = ["personas", persona.id];
    return {
      id: persona.id,
      index,
      avatar: imageField(ctx, scope, ["avatar"], persona.avatar, {
        label: "画像",
        shape: "circle",
      }),
      name: textField(ctx, scope, ["name"], {
        label: `ペルソナ${index + 1}の名前`,
        labelHidden: true,
        value: persona.useViewerName ? "" : persona.name,
        placeholder: persona.useViewerName ? "遊ぶ人の名前が入ります" : "名前（例: アキ）",
        disabled: persona.useViewerName,
        maxLength: LIMITS.personaName,
        counter: counter(persona.useViewerName ? 0 : utf16Length(persona.name), LIMITS.personaName),
      }),
      tagline: textField(ctx, scope, ["tagline"], {
        label: `ペルソナ${index + 1}の紹介文`,
        labelHidden: true,
        value: persona.tagline,
        placeholder: "紹介文（例: 密かに片想いしている同級生）",
        maxLength: LIMITS.personaTagline,
        counter: counter(utf16Length(persona.tagline), LIMITS.personaTagline),
      }),
      useViewerName: toggle(["useViewerName"], "遊ぶ人の名前を使う", persona.useViewerName),
      note: textField(ctx, scope, ["note"], {
        label: `ペルソナ${index + 1}のキャストに伝わるもの`,
        labelHidden: true,
        value: persona.note,
        placeholder: "例: 18歳。クールな印象でいつもジャージ姿",
        multiline: true,
        rows: 3,
        maxLength: LIMITS.personaNote,
        counter: counter(utf16Length(persona.note), LIMITS.personaNote),
        warning:
          !persona.name.trim() && !persona.useViewerName
            ? "名前が空のペルソナは保存されません"
            : null,
      }),
    };
  });
}

export function presentExperience(ctx: Context): ExperienceTabVM {
  const { doc } = ctx;
  const story = doc.mode === "story";
  const scope = ["cast"];
  const first = doc.introScript[0];
  const hidden = Math.max(0, doc.introScript.length - 1);
  return {
    scope,
    mode: {
      name: ["mode"],
      options: MODE_OPTIONS.map((option) => ({ ...option, selected: doc.mode === option.value })),
    },
    story: story
      ? {
          tagline: textField(ctx, scope, ["tagline"], {
            label: "キャッチコピー",
            value: doc.tagline,
            placeholder: "一言で紹介すると？",
            required: true,
            invalid: !doc.tagline.trim(),
            error: doc.tagline.trim() ? null : "キャッチコピーを入力してください",
            maxLength: LIMITS.tagline,
            counter: counter(utf16Length(doc.tagline), LIMITS.tagline),
          }),
          situation: textField(ctx, scope, ["situation"], {
            label: "いまの状況",
            value: doc.situation,
            placeholder: "舞台設定・ユーザーとの関係性など",
            hint: [
              "舞台となる場所・時間帯と、相手との関係。",
              { code: USER_PLACEHOLDER },
              " は相手の呼び名に置き換わります。",
            ],
            multiline: true,
            rows: 5,
            maxLength: LIMITS.situation,
            counter: counter(utf16Length(doc.situation), LIMITS.situation),
          }),
          intro: {
            scope: ["intro"],
            meta: `${doc.introScript.length} / ${LIMITS.introParts}パート`,
            parts: intro(ctx),
            canAdd: doc.introScript.length < LIMITS.introParts,
          },
        }
      : null,
    chat: story
      ? null
      : {
          scope: ["intro"],
          first: textField(ctx, ["intro"], ["first", "text"], {
            label: "最初のひとこと",
            value: first?.text ?? "",
            placeholder: "キャストからの最初のメッセージ",
            multiline: true,
            rows: 2,
            maxLength: LIMITS.introPart,
            counter: counter(utf16Length(first?.text ?? ""), LIMITS.introPart),
            chips: USER_CHIP,
          }),
          hidden:
            hidden > 0
              ? `ストーリーモードで書いたイントロのパートが、ほかに${hidden}件残っています。`
              : null,
        },
    about: textField(ctx, scope, ["aboutText"], {
      label: "このキャストについて",
      value: doc.aboutText,
      placeholder: "例: [pink][large]ひよりです！[/large][/pink]\nよろしくね。",
      hint: [
        "AIには渡さない、表示専用の紹介文です。Markdownと装飾タグで詳細ページを自由に飾れます。",
      ],
      multiline: true,
      rows: 3,
      maxLength: LIMITS.aboutText,
      counter: counter(utf16Length(doc.aboutText), LIMITS.aboutText),
    }),
    personas: {
      scope: ["personas"],
      meta: `${doc.recommendedPersonas.length} / ${LIMITS.personas}件`,
      rows: personas(ctx),
      canAdd: doc.recommendedPersonas.length < LIMITS.personas,
    },
  };
}
