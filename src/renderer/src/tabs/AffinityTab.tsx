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
import { codePointLength } from "@shared/text";
import {
  affinityStageTextLength,
  duplicateStageIndexes,
  validateAffinityConfig,
} from "@shared/validate";
import { useState } from "react";

import { Card, SectionHead, TextArea, TextInput, Toggle } from "../components/ui";
import { useEditor } from "../editor";

type SubjectKey = "default" | string;

function parseInteger(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

export function AffinityTab() {
  const { doc, update } = useEditor();
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
        <SectionHead
          title="好感度"
          description="会話の積み重ねに合わせて、キャラクターごとの態度を変えます。"
        />
        {notice}
        <Card>
          <p className="note">まだ設定されていません。設定を始めると4段階のひな形が入ります。</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              update(
                (draft) =>
                  void (draft.affinity = { default: createDefaultAffinityConfig(), overrides: {} }),
              );
              setSubject("default");
              setOpenStage(0);
            }}
          >
            好感度を設定する
          </button>
        </Card>
      </div>
    );
  }

  const members = sendableMembers(doc);
  const choices = [
    { key: "default", label: "共通設定", common: true },
    {
      key: AFFINITY_BASE_SUBJECT,
      label: doc.name.trim() ? `本体（${doc.name.trim()}）` : "本体",
      common: false,
    },
    ...members.map((member) => ({
      key: member.id,
      label: member.name.trim() || `${doc.members.indexOf(member) + 2}人目`,
      common: false,
    })),
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
      <SectionHead
        title="好感度"
        description="会話の積み重ねに合わせて、キャラクターごとの態度を変えます。"
      />
      {notice}
      <p className="note">
        共通設定は個別設定のないキャラ全員に使われます。本体や登場人物ごとに個別設定を作成したり、好感度を使わない設定にできます。
      </p>
      <div className="character-chooser" role="tablist" aria-label="好感度の設定対象">
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
              className={selected.key === choice.key ? "chooser-item is-selected" : "chooser-item"}
              onClick={() => {
                setSubject(choice.key);
                setOpenStage(0);
              }}
            >
              <span>{choice.label}</span>
              <small>{state}</small>
            </button>
          );
        })}
      </div>
      <div className="selected-head">
        <h2>{selected.label}</h2>
        <span className="note">{isOverride && config ? "個別設定" : "共通設定"}</span>
      </div>
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
        <Card>
          <p className="note">
            共通設定を使用しています。個別に変えたい場合は、このキャラ用の設定を作成してください。
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
                  const copy = normalizeAffinityConfig(structuredClone(draft.affinity.default))!;
                  copy.enabled = false;
                  draft.affinity.overrides[selected.key] = copy;
                })
              }
            >
              このキャラは好感度を使わない
            </button>
          </div>
        </Card>
      )}
      <button
        type="button"
        className="btn btn-plain btn-danger"
        onClick={() => {
          if (window.confirm("好感度設定を削除しますか？（共通設定と個別設定がすべて消えます）")) {
            update((draft) => void (draft.affinity = null));
            setSubject("default");
          }
        }}
      >
        好感度設定を削除
      </button>
    </div>
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
      <Card>
        {disabledToggle}
        <p className="note">このキャラには好感度を使いません。</p>
        <button type="button" className="btn btn-plain" onClick={onResetOverride}>
          共通設定に戻す
        </button>
      </Card>
    );
  }
  const current = openStage >= config.stages.length ? 0 : openStage;
  const editStage = (index: number, recipe: (stage: AffinityStage) => void) =>
    edit((target) => {
      const stage = target.stages[index];
      if (stage) recipe(stage);
    });
  return (
    <Card className="affinity-editor">
      <div className="affinity-grid">
        <label className="field">
          <span className="field-label">項目名</span>
          <TextInput
            value={config.itemName}
            ariaLabel="項目名"
            onChange={(value) => edit((target) => void (target.itemName = value))}
          />
          <span
            className={
              codePointLength(config.itemName) > LIMITS.affinityItemName
                ? "counter is-over"
                : "counter"
            }
          >
            {codePointLength(config.itemName)}/{LIMITS.affinityItemName}字
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
                className="input"
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
        </div>
        <label className="field">
          <span className="field-label">変化の速さ</span>
          <select
            className="input"
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
        <Toggle
          checked={config.showInChat}
          onChange={(checked) => edit((target) => void (target.showInChat = checked))}
          title="チャットに好感度を表示する"
        />
        {disabledToggle}
      </div>
      {error ? <p className="field-error block">{error}</p> : null}
      <div className="stages">
        {config.stages.map((stage, index) => {
          const isOpen = index === current;
          const length = affinityStageTextLength(stage);
          const summary = [
            ["呼び方", stage.callText],
            ["話し方", stage.speechText],
            ["距離感", stage.distanceText],
          ]
            .map(([label, value]) => `${label} ${value || "—"}`)
            .join(" ・ ");
          return (
            <section key={index} className={isOpen ? "stage is-open" : "stage"}>
              <button
                type="button"
                className="stage-toggle"
                aria-expanded={isOpen}
                onClick={() => setOpenStage(isOpen ? -1 : index)}
              >
                <strong>段階 {index + 1}</strong>
                <span className="stage-range">{stage.startValue ?? "—"}〜</span>
                <span className="note stage-summary">{summary}</span>
              </button>
              {isOpen ? (
                <div className="stage-body">
                  <label className="field">
                    <span className="field-label">開始値</span>
                    <input
                      className="input"
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
                  <p
                    className={
                      length > LIMITS.affinityStageText
                        ? "counter is-over"
                        : length >= 900
                          ? "counter is-near"
                          : "counter"
                    }
                  >
                    合計 {length}/{LIMITS.affinityStageText}字
                  </p>
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
                  ) : null}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
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
          段階を追加（{config.stages.length}/{LIMITS.affinityStages}）
        </button>
        {isOverride ? (
          <button type="button" className="btn btn-plain" onClick={onResetOverride}>
            共通設定に戻す
          </button>
        ) : null}
      </div>
    </Card>
  );
}
