// 好感度のタブに描くもの。
import {
  AFFINITY_BASE_SUBJECT,
  AFFINITY_PACES,
  AFFINITY_STAGE_FIELDS,
  type AffinityConfig,
  sendableMembers,
} from "@shared/cast";
import { LIMITS } from "@shared/limits";
import { codePointLength, formatCount } from "@shared/text";
import {
  affinityStageTextLength,
  duplicateStageIndexes,
  validateAffinityConfig,
} from "@shared/validate";

import { castInk } from "../ink";
import { AFFINITY_DEFAULT, type Path } from "../types";
import type { AffinityConfigVM, AffinityTabVM, RulerVM, StageVM, TabItemVM } from "../viewModels";
import { type Context, avatar, imageSrc, textField, toggle } from "./common";

/**
 * 段階を最小値〜最大値の目盛りに並べた帯。開始値が範囲内で小さい順に並んでいるときだけ描く
 * （そうでなければ、すぐ上のエラー文が直し方を伝える）。
 */
function ruler(config: AffinityConfig, open: number): RulerVM | null {
  const { minValue: min, maxValue: max, initialValue: initial } = config;
  if (min === null || max === null || !Number.isSafeInteger(min) || !Number.isSafeInteger(max))
    return null;
  if (max <= min) return null;
  const starts = config.stages.map((stage) => stage.startValue);
  const ordered = starts.every(
    (value, index) =>
      value !== null &&
      Number.isSafeInteger(value) &&
      value >= min &&
      value <= max &&
      (index === 0 || value > (starts[index - 1] as number)),
  );
  if (!ordered || starts.length === 0) return null;
  const percent = (value: number) => ((value - min) / (max - min)) * 100;
  const bands = starts.map((value, index) => {
    const from = value as number;
    const to = (starts[index + 1] as number | undefined) ?? max;
    return {
      index,
      from,
      left: `${percent(from)}%`,
      width: `max(4px, calc(${percent(to) - percent(from)}% - 2px))`,
      open: index === open,
      label: `段階${index + 1}（${from}〜）`,
    };
  });
  const showInitial =
    initial !== null && Number.isSafeInteger(initial) && initial >= min && initial <= max;
  return {
    bands,
    max,
    initial: showInitial ? { left: `${percent(initial)}%`, value: initial } : null,
    caption: bands.map((band) => `段階${band.index + 1}は${band.from}から`).join("、"),
  };
}

function configVM(
  ctx: Context,
  scope: Path,
  value: AffinityConfig,
  override: boolean,
  openStage: number,
): AffinityConfigVM {
  const duplicates = duplicateStageIndexes(value);
  const current = openStage >= value.stages.length ? 0 : openStage;
  const itemNameLength = codePointLength(value.itemName);
  const number = (input: number | null) => (input === null ? "" : String(input));
  const stages: StageVM[] = value.stages.map((stage, index) => {
    const stageScope = [...scope, "stages", index];
    const length = affinityStageTextLength(stage);
    const filled = AFFINITY_STAGE_FIELDS.filter((field) => stage[field.key].trim());
    return {
      index,
      open: index === current,
      name: `段階 ${index + 1}`,
      range: `${stage.startValue ?? "—"}〜`,
      summary:
        stage.callText.trim() ||
        stage.speechText.trim() ||
        stage.freeText.trim() ||
        "まだ書いていません",
      filled: `${filled.length}/${AFFINITY_STAGE_FIELDS.length}欄`,
      start: textField(ctx, stageScope, ["startValue"], {
        label: "開始値",
        ariaLabel: `段階${index + 1}の開始値`,
        value: number(stage.startValue),
        plain: true,
        invalid: duplicates.has(index),
        commitOnBlur: index > 0,
        numeric: { min: value.minValue, max: value.maxValue, readOnly: index === 0 },
      }),
      startNote: index === 0 ? "1段階目は最小値から始まります。" : null,
      duplicate: duplicates.has(index),
      fields: AFFINITY_STAGE_FIELDS.map((field) =>
        textField(ctx, stageScope, [field.key], {
          label: field.label,
          ariaLabel: `段階${index + 1}の${field.label}`,
          value: stage[field.key],
          placeholder: field.multiline ? "返事で分かるように書く" : "例: 名前で呼ぶ",
          multiline: field.multiline,
          rows: 2,
        }),
      ),
      canRemove: value.stages.length > 1,
      counter: {
        text: `6欄の合計 ${length}/${formatCount(LIMITS.affinityStageText)}字`,
        tone: length > LIMITS.affinityStageText ? "over" : length >= 900 ? "near" : "normal",
        aside: null,
      },
    };
  });
  return {
    itemName: textField(ctx, scope, ["itemName"], {
      label: "項目名",
      value: value.itemName,
      counter: {
        text: `${itemNameLength}/${LIMITS.affinityItemName}字`,
        tone: itemNameLength > LIMITS.affinityItemName ? "over" : "normal",
        aside: null,
      },
    }),
    ranges: (
      [
        ["minValue", "最小値"],
        ["maxValue", "最大値"],
        ["initialValue", "初期値"],
      ] as const
    ).map(([key, label]) =>
      textField(ctx, scope, [key], {
        label,
        value: number(value[key]),
        plain: true,
        numeric: { min: null, max: null, readOnly: false },
      }),
    ),
    pace: {
      name: ["pace"],
      label: "変化の速さ",
      value: value.pace,
      options: AFFINITY_PACES.map((pace) => ({
        value: pace.value,
        label: pace.label,
        group: null,
      })),
    },
    showInChat: toggle(["showInChat"], "チャットに好感度を表示する", value.showInChat),
    disabled: override
      ? toggle(["disabled"], "このキャラは好感度を使わない", value.enabled === false)
      : null,
    error: validateAffinityConfig(value) || null,
    ruler: ruler(value, current),
    stages,
    canAddStage: value.stages.length < LIMITS.affinityStages,
    stageCount: `${value.stages.length}/${LIMITS.affinityStages}`,
    canReset: override,
  };
}

export function presentAffinity(ctx: Context): AffinityTabVM {
  const { doc, session } = ctx;
  const notice =
    doc.mode === "story"
      ? null
      : "今の形（雑談モード等）では好感度は効きません。設定は保持され、ストーリーモードに戻すと使えます。";
  const affinity = doc.affinity;
  if (!affinity) return { scope: ["affinity"], notice, setup: null };

  const members = sendableMembers(doc);
  const choices = [
    { key: AFFINITY_DEFAULT, label: "共通設定", ink: null, image: null, blurred: false },
    {
      key: AFFINITY_BASE_SUBJECT,
      label: doc.name.trim() || "本体",
      ink: castInk(0),
      image: imageSrc(session, doc.avatar),
      blurred: doc.avatarBlurred,
    },
    ...members.map((member) => {
      const index = doc.members.indexOf(member);
      return {
        key: member.id,
        label: member.name.trim() || `${index + 2}人目`,
        ink: castInk(index + 1),
        image: imageSrc(session, member.avatar),
        blurred: false,
      };
    }),
  ];
  // 選んでいた人が選べなくなったら（中身を消したなど）、共通設定を見せる
  const selected = choices.find((choice) => choice.key === session.ui.subject) ?? choices[0];
  const selectedKey = selected?.key ?? AFFINITY_DEFAULT;
  const subjects: TabItemVM<string>[] = choices.map((choice) => {
    const override = affinity.overrides[choice.key];
    return {
      id: choice.key,
      domId: `affinity-tab-${choice.key}`,
      label: choice.label,
      sub:
        choice.key === AFFINITY_DEFAULT
          ? "既定"
          : override?.enabled === false
            ? "好感度なし"
            : override
              ? "個別設定"
              : "共通を使用",
      avatar: choice.ink ? avatar(choice.image, choice.label, choice.ink, choice.blurred) : null,
      selected: choice.key === selectedKey,
    };
  });
  const isOverride = selectedKey !== AFFINITY_DEFAULT;
  const value = isOverride ? affinity.overrides[selectedKey] : affinity.default;
  const scope = ["affinity", selectedKey];
  return {
    scope: ["affinity"],
    notice,
    setup: {
      subjects,
      subject: [selectedKey],
      sheet: !value
        ? { kind: "inherit" }
        : isOverride && value.enabled === false
          ? {
              kind: "disabled",
              disabled: toggle(["disabled"], "このキャラは好感度を使わない", true),
              // 使わない設定でも中身は確認されるので、直すものがあれば見せる（欄は使う設定に戻すと出る）
              error: validateAffinityConfig(value) || null,
            }
          : { kind: "config", config: configVM(ctx, scope, value, isOverride, session.ui.stage) },
    },
  };
}
