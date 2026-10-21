import {
  AFFINITY_BASE_SUBJECT,
  AFFINITY_PACES,
  AFFINITY_STAGE_FIELDS,
  type AffinityConfig,
  type AffinityPace,
  type AffinityStage,
  createDefaultAffinityConfig,
  createEmptyStage,
  normalizeAffinityConfig,
  sendableMembers,
  sortAffinityStages,
} from "@shared/cast";
import { LIMITS } from "@shared/limits";
import { codePointLength, formatCount } from "@shared/text";
import {
  affinityStageTextLength,
  duplicateStageIndexes,
  validateAffinityConfig,
} from "@shared/validate";
import { useState } from "react";

import { IconError, IconPlus } from "../components/icons";
import { Avatar, onTabListKeyDown, Section, TextArea, TextInput, Toggle } from "../components/ui";
import { useEditor } from "../editor";
import { castInk } from "../ink";

type SubjectKey = "default" | string;

function parseInteger(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

export function AffinityTab() {
  const { doc, update, src } = useEditor();
  const [subject, setSubject] = useState<SubjectKey>("default");
  const [openStage, setOpenStage] = useState(0);
  const notice =
    doc.mode === "story" ? null : (
      <p className="inline-notice">
        今の形（雑談モード等）では好感度は効きません。設定は保持され、ストーリーモードに戻すと使えます。
      </p>
    );
  const affinity = doc.affinity;
  if (!affinity) {
    return (
      <div className="tab-body">
        <Section
          title="好感度"
          description="会話の積み重ねに合わせて、キャラクターごとの態度を変えます。"
        >
          {notice}
          <p className="note empty">
            まだ設定されていません。設定を始めると4段階のひな形が入ります。
          </p>
          <div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                update(
                  (draft) =>
                    void (draft.affinity = {
                      default: createDefaultAffinityConfig(),
                      overrides: {},
                    }),
                );
                setSubject("default");
                setOpenStage(0);
              }}
            >
              好感度を設定する
            </button>
          </div>
        </Section>
      </div>
    );
  }

  const members = sendableMembers(doc);
  const choices = [
    { key: "default", label: "共通設定", common: true, ink: null, avatar: null },
    {
      key: AFFINITY_BASE_SUBJECT,
      label: doc.name.trim() || "本体",
      common: false,
      ink: castInk(0),
      avatar: src(doc.avatar),
    },
    ...members.map((member) => {
      const index = doc.members.indexOf(member);
      return {
        key: member.id,
        label: member.name.trim() || `${index + 2}人目`,
        common: false,
        ink: castInk(index + 1),
        avatar: src(member.avatar),
      };
    }),
  ];
  const selected = choices.find((choice) => choice.key === subject) ?? choices[0]!;
  const config = selected.key === "default" ? affinity.default : affinity.overrides[selected.key];
  const isOverride = selected.key !== "default";

  const editConfig = (recipe: (target: AffinityConfig) => void) =>
    update((draft) => {
      if (!draft.affinity) return;
      const target =
        selected.key === "default"
          ? draft.affinity.default
          : draft.affinity.overrides[selected.key];
      if (target) recipe(target);
    });

  return (
    <div className="tab-body">
      <Section
        title="好感度"
        description="会話の積み重ねに合わせて、キャラクターごとの態度を変えます。共通設定は、個別設定のないキャラ全員に使われます。本体や登場人物ごとに個別設定を作ったり、好感度を使わない設定にもできます。"
      >
        {notice}
      </Section>
      <div className="cast-desk">
        <div
          className="cast-tabs"
          role="tablist"
          aria-label="好感度の設定対象"
          onKeyDown={onTabListKeyDown}
        >
          {choices.map((choice) => {
            const override = affinity.overrides[choice.key];
            const state = choice.common
              ? "既定"
              : override?.enabled === false
                ? "好感度なし"
                : override
                  ? "個別設定"
                  : "共通を使用";
            return (
              <button
                key={choice.key}
                type="button"
                role="tab"
                aria-selected={selected.key === choice.key}
                tabIndex={selected.key === choice.key ? 0 : -1}
                className={selected.key === choice.key ? "cast-tab is-selected" : "cast-tab"}
                onClick={() => {
                  setSubject(choice.key);
                  setOpenStage(0);
                }}
              >
                {choice.ink ? (
                  <Avatar src={choice.avatar} name={choice.label} ink={choice.ink} size="small" />
                ) : null}
                <span className="cast-tab-text">
                  <span className="cast-tab-name">{choice.label}</span>
                  <small>{state}</small>
                </span>
              </button>
            );
          })}
        </div>
        <div className="cast-sheet" role="tabpanel">
          {config ? (
            <ConfigEditor
              config={config}
              isOverride={isOverride}
              openStage={openStage}
              setOpenStage={setOpenStage}
              edit={editConfig}
              onResetOverride={() => {
                update(
                  (draft) => void (draft.affinity && delete draft.affinity.overrides[selected.key]),
                );
                setSubject("default");
              }}
            />
          ) : (
            <>
              <p className="note">
                共通設定を使っています。このキャラだけ変えたいときは、個別設定を作ってください。
              </p>
              <div className="button-row">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() =>
                    update((draft) => {
                      if (!draft.affinity) return;
                      draft.affinity.overrides[selected.key] = normalizeAffinityConfig(
                        structuredClone(draft.affinity.default),
                      )!;
                    })
                  }
                >
                  個別設定を作る
                </button>
                <button
                  type="button"
                  className="btn btn-plain"
                  onClick={() =>
                    update((draft) => {
                      if (!draft.affinity) return;
                      const copy = normalizeAffinityConfig(
                        structuredClone(draft.affinity.default),
                      )!;
                      copy.enabled = false;
                      draft.affinity.overrides[selected.key] = copy;
                    })
                  }
                >
                  このキャラは好感度を使わない
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <div>
        <button
          type="button"
          className="btn btn-plain btn-small btn-danger"
          onClick={() => {
            if (
              window.confirm("好感度設定を削除しますか？（共通設定と個別設定がすべて消えます）")
            ) {
              update((draft) => void (draft.affinity = null));
              setSubject("default");
            }
          }}
        >
          好感度設定を削除
        </button>
      </div>
    </div>
  );
}

/**
 * 段階を最小値〜最大値の目盛りに並べた帯。開始値が範囲内で小さい順に並んでいるときだけ描く
 * （そうでなければ、すぐ上のエラー文が直し方を伝える）。
 */
function StageRuler({
  config,
  openStage,
  onOpen,
}: {
  config: AffinityConfig;
  openStage: number;
  onOpen: (index: number) => void;
}) {
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
    return { index, from, to };
  });
  const showInitial =
    initial !== null && Number.isSafeInteger(initial) && initial >= min && initial <= max;
  return (
    <figure className="ruler">
      <div className="ruler-track">
        {bands.map((band) => (
          <button
            key={band.index}
            type="button"
            className={band.index === openStage ? "ruler-band is-open" : "ruler-band"}
            style={{
              left: `${percent(band.from)}%`,
              width: `max(4px, calc(${percent(band.to) - percent(band.from)}% - 2px))`,
            }}
            aria-label={`段階${band.index + 1}（${band.from}〜）を開く`}
            title={`段階${band.index + 1}（${band.from}〜）`}
            onClick={() => onOpen(band.index)}
          />
        ))}
      </div>
      <div className="ruler-scale" aria-hidden="true">
        {bands.map((band) => (
          <span key={band.index} style={{ left: `${percent(band.from)}%` }}>
            {band.from}
          </span>
        ))}
        <span className="is-end" style={{ left: "100%" }}>
          {max}
        </span>
      </div>
      {showInitial ? (
        <div className="ruler-initial" style={{ left: `${percent(initial)}%` }}>
          初期値 {initial}
        </div>
      ) : null}
      <figcaption className="visually-hidden">
        {bands.map((band) => `段階${band.index + 1}は${band.from}から`).join("、")}
      </figcaption>
    </figure>
  );
}

function ConfigEditor({
  config,
  isOverride,
  openStage,
  setOpenStage,
  edit,
  onResetOverride,
}: {
  config: AffinityConfig;
  isOverride: boolean;
  openStage: number;
  setOpenStage: (index: number) => void;
  edit: (recipe: (target: AffinityConfig) => void) => void;
  onResetOverride: () => void;
}) {
  const error = validateAffinityConfig(config);
  const duplicates = duplicateStageIndexes(config);
  const disabledToggle = isOverride ? (
    <Toggle
      checked={config.enabled === false}
      onChange={(checked) => edit((target) => void (target.enabled = !checked))}
      title="このキャラは好感度を使わない"
    />
  ) : null;
  if (isOverride && config.enabled === false) {
    return (
      <>
        {disabledToggle}
        <p className="note">このキャラには好感度を使いません。</p>
        <div>
          <button type="button" className="btn btn-plain" onClick={onResetOverride}>
            共通設定に戻す
          </button>
        </div>
      </>
    );
  }
  const current = openStage >= config.stages.length ? 0 : openStage;
  const editStage = (index: number, recipe: (stage: AffinityStage) => void) =>
    edit((target) => {
      const stage = target.stages[index];
      if (stage) recipe(stage);
    });
  const itemNameLength = codePointLength(config.itemName);
  return (
    <>
      <div className="affinity-grid">
        <label className="field">
          <span className="field-label">項目名</span>
          <TextInput
            value={config.itemName}
            ariaLabel="項目名"
            onChange={(value) => edit((target) => void (target.itemName = value))}
          />
          <span className="field-foot">
            <span />
            <span
              className={itemNameLength > LIMITS.affinityItemName ? "counter is-over" : "counter"}
            >
              {itemNameLength}/{LIMITS.affinityItemName}字
            </span>
          </span>
        </label>
        <div className="affinity-range">
          {(
            [
              ["minValue", "最小値"],
              ["maxValue", "最大値"],
              ["initialValue", "初期値"],
            ] as const
          ).map(([key, label]) => (
            <label className="field" key={key}>
              <span className="field-label">{label}</span>
              <input
                className="input input-number"
                type="number"
                step={1}
                value={config[key] ?? ""}
                onChange={(event) =>
                  edit((target) => {
                    target[key] = parseInteger(event.target.value);
                    // 最小値を変えると 1 段階目の開始値も一緒に変わる（Zetter と同じ）
                    if (key === "minValue" && target.stages[0])
                      target.stages[0].startValue = target.minValue;
                  })
                }
              />
            </label>
          ))}
          <label className="field">
            <span className="field-label">変化の速さ</span>
            <select
              className="input select"
              value={config.pace}
              onChange={(event) =>
                edit((target) => void (target.pace = event.target.value as AffinityPace))
              }
            >
              {AFFINITY_PACES.map((pace) => (
                <option key={pace.value} value={pace.value}>
                  {pace.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Toggle
          checked={config.showInChat}
          onChange={(checked) => edit((target) => void (target.showInChat = checked))}
          title="チャットに好感度を表示する"
        />
        {disabledToggle}
      </div>
      {error ? (
        <p className="field-error block">
          <IconError />
          {error}
        </p>
      ) : null}
      <StageRuler config={config} openStage={current} onOpen={setOpenStage} />
      <ol className="stages">
        {config.stages.map((stage, index) => {
          const isOpen = index === current;
          const length = affinityStageTextLength(stage);
          const filled = AFFINITY_STAGE_FIELDS.filter((field) => stage[field.key].trim());
          return (
            <li key={index} className={isOpen ? "stage is-open" : "stage"}>
              <button
                type="button"
                className="stage-toggle"
                aria-expanded={isOpen}
                onClick={() => setOpenStage(isOpen ? -1 : index)}
              >
                <span className="stage-name">段階 {index + 1}</span>
                <span className="stage-range">{stage.startValue ?? "—"}〜</span>
                <span className="stage-summary">
                  {stage.callText.trim() ||
                    stage.speechText.trim() ||
                    stage.freeText.trim() ||
                    "まだ書いていません"}
                </span>
                <span className="stage-filled">
                  {filled.length}/{AFFINITY_STAGE_FIELDS.length}欄
                </span>
              </button>
              {isOpen ? (
                <div className="stage-body">
                  <label className="field stage-start">
                    <span className="field-label">開始値</span>
                    <input
                      className="input input-number"
                      type="number"
                      step={1}
                      min={config.minValue ?? undefined}
                      max={config.maxValue ?? undefined}
                      readOnly={index === 0}
                      aria-invalid={duplicates.has(index) || undefined}
                      value={stage.startValue ?? ""}
                      onChange={(event) =>
                        editStage(
                          index,
                          (target) => void (target.startValue = parseInteger(event.target.value)),
                        )
                      }
                      onBlur={() => {
                        // 開始値を確定したら小さい順に並べ直す（1段階目は固定。Zetter と同じ）。
                        // 開いている段階は並べ替え後の位置へついていく。
                        const order = [...config.stages];
                        sortAffinityStages({ ...config, stages: order });
                        edit((target) => sortAffinityStages(target));
                        setOpenStage(order.indexOf(stage));
                      }}
                    />
                    {index === 0 ? (
                      <span className="note">1段階目は最小値から始まります。</span>
                    ) : null}
                    {duplicates.has(index) ? (
                      <span className="field-error">開始値が他の段階と重複しています。</span>
                    ) : null}
                  </label>
                  {AFFINITY_STAGE_FIELDS.map((field) => (
                    <label className="field" key={field.key}>
                      <span className="field-label">{field.label}</span>
                      {field.multiline ? (
                        <TextArea
                          value={stage[field.key]}
                          rows={2}
                          placeholder="返事で分かるように書く"
                          ariaLabel={`段階${index + 1}の${field.label}`}
                          onChange={(value) =>
                            editStage(index, (target) => void (target[field.key] = value))
                          }
                        />
                      ) : (
                        <TextInput
                          value={stage[field.key]}
                          placeholder="例: 名前で呼ぶ"
                          ariaLabel={`段階${index + 1}の${field.label}`}
                          onChange={(value) =>
                            editStage(index, (target) => void (target[field.key] = value))
                          }
                        />
                      )}
                    </label>
                  ))}
                  <div className="field-foot">
                    {config.stages.length > 1 ? (
                      <button
                        type="button"
                        className="btn btn-plain btn-small btn-danger"
                        onClick={() => {
                          edit((target) => {
                            target.stages.splice(index, 1);
                            const first = target.stages[0];
                            if (index === 0 && first) first.startValue = target.minValue;
                          });
                          setOpenStage(Math.min(index, config.stages.length - 2));
                        }}
                      >
                        この段階を削除
                      </button>
                    ) : (
                      <span />
                    )}
                    <span
                      className={
                        length > LIMITS.affinityStageText
                          ? "counter is-over"
                          : length >= 900
                            ? "counter is-near"
                            : "counter"
                      }
                    >
                      6欄の合計 {length}/{formatCount(LIMITS.affinityStageText)}字
                    </span>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      <div className="button-row">
        <button
          type="button"
          className="btn btn-outline"
          disabled={config.stages.length >= LIMITS.affinityStages}
          onClick={() => {
            edit((target) => {
              const last = target.stages.at(-1)?.startValue;
              const start = Number.isSafeInteger(last)
                ? (last as number) + 1
                : (target.minValue ?? 0) + target.stages.length;
              target.stages.push(createEmptyStage(start));
            });
            setOpenStage(config.stages.length);
          }}
        >
          <IconPlus />
          段階を追加
          <span className="btn-count">
            {config.stages.length}/{LIMITS.affinityStages}
          </span>
        </button>
        {isOverride ? (
          <button type="button" className="btn btn-plain" onClick={onResetOverride}>
            共通設定に戻す
          </button>
        ) : null}
      </div>
    </>
  );
}
