import {
  PARTNER_HABIT_CHIPS,
  PARTNER_SETTINGS_FIELDS,
  PARTNER_TIME_CHIPS,
  type PartnerSettings,
  type ToneExample,
} from "@shared/cast";
import { LIMITS } from "@shared/limits";
import { formatCount } from "@shared/text";
import { limitPartnerSettingsValue, partnerSettingsLength } from "@shared/validate";
import { useRef } from "react";

import { IconPlus } from "./icons";
import { Counter, MoveButtons, TextArea, type TextHandle, TextInput, moveItem } from "./ui";

/** 「ふだんの1日」の札: カーソル位置に【朝】を入れる（行の途中なら改行してから）。Zetter と同じ。 */
function insertTimeChip(value: string, start: number, end: number, label: string) {
  const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const insertion = `${start === lineStart ? "" : "\n"}【${label}】 `;
  return {
    value: `${value.slice(0, start)}${insertion}${value.slice(end)}`,
    caret: start + insertion.length,
  };
}

/** 「メッセージの癖」の札: 末尾に一文を足す（同じ文が既にあれば何もしない）。Zetter と同じ。 */
function appendHabitChip(value: string, phrase: string): string {
  const trimmed = value.trimEnd();
  const sentence = `${phrase.replace(/[。.!！?？]*$/u, "")}。`;
  if (trimmed.includes(sentence.replace(/。$/u, ""))) return value;
  const separator = trimmed ? (/[。.!！?？]$/u.test(trimmed) ? "\n" : "。\n") : "";
  return `${trimmed}${separator}${sentence}`;
}

export function PartnerSettingsEditor({
  value,
  onChange,
}: {
  value: PartnerSettings;
  onChange: (next: PartnerSettings) => void;
}) {
  const routineRef = useRef<TextHandle | null>(null);
  const total = partnerSettingsLength(value);
  const nearLimit = total >= LIMITS.partnerSettingsTotal * 0.9;
  const setField = (field: keyof PartnerSettings, next: string) =>
    onChange({ ...value, [field]: limitPartnerSettingsValue(value, field, next) });

  return (
    <div className="subsection">
      <div className="subhead">
        <h3>パートナー設定</h3>
        <span className={nearLimit ? "counter is-near" : "counter"}>
          {nearLimit
            ? `残り${formatCount(Math.max(0, LIMITS.partnerSettingsTotal - total))}字`
            : `${formatCount(total)}/${formatCount(LIMITS.partnerSettingsTotal)}字`}
        </span>
      </div>
      <p className="note">
        パートナー（DM
        のようなやり取り）での、このキャラクターのふるまいです。5つの欄の合計で5,000字まで書けます。
      </p>
      {PARTNER_SETTINGS_FIELDS.map((field) => (
        <div key={field.key} className="field">
          <div className="field-label">
            <span>{field.label}</span>
          </div>
          {field.key === "dailyRoutine" ? (
            <div className="chips" aria-label="時間帯の見出しを入れる">
              {PARTNER_TIME_CHIPS.map((label) => (
                <button
                  key={label}
                  type="button"
                  className="chip"
                  onClick={() => {
                    const element = routineRef.current;
                    const start = element?.selectionStart ?? value.dailyRoutine.length;
                    const end = element?.selectionEnd ?? start;
                    const next = insertTimeChip(value.dailyRoutine, start, end, label);
                    setField("dailyRoutine", next.value);
                    requestAnimationFrame(() => {
                      element?.focus();
                      element?.setSelectionRange(next.caret, next.caret);
                    });
                  }}
                >
                  【{label}】
                </button>
              ))}
            </div>
          ) : null}
          {field.key === "messageHabits" ? (
            <div className="chips" aria-label="よくある癖を書き足す">
              {PARTNER_HABIT_CHIPS.map((label) => (
                <button
                  key={label}
                  type="button"
                  className="chip"
                  onClick={() =>
                    setField("messageHabits", appendHabitChip(value.messageHabits, label))
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
          <TextArea
            value={value[field.key]}
            onChange={(next) => setField(field.key, next)}
            placeholder={field.placeholder}
            rows={2}
            ariaLabel={field.label}
            textareaRef={
              field.key === "dailyRoutine" ? (element) => (routineRef.current = element) : undefined
            }
          />
        </div>
      ))}
    </div>
  );
}

export function ToneExamplesEditor({
  items,
  onChange,
}: {
  items: ToneExample[];
  onChange: (next: ToneExample[]) => void;
}) {
  const edit = (recipe: (draft: ToneExample[]) => void) => {
    const draft = items.map((item) => ({ ...item }));
    recipe(draft);
    onChange(draft);
  };
  return (
    <div className="subsection">
      <div className="subhead">
        <h3>口調サンプル</h3>
        <span className="counter">
          {items.length} / {LIMITS.toneItemsPerCharacter}件
        </span>
      </div>
      <p className="note">口調例は基本の話し方の見本です。好感度の段階の話し方が優先されます。</p>
      {items.length === 0 ? (
        <p className="note empty">まだありません。3〜5件あると声が安定します。</p>
      ) : (
        <ol className="rows">
          {items.map((item, index) => {
            const half =
              !!item.situation.trim() !== !!item.example.trim()
                ? "状況と発話例の両方を書くと保存されます"
                : "";
            return (
              <li className="row tone-row" key={index}>
                <div className="row-head">
                  <span className="row-index">{index + 1}</span>
                  <MoveButtons
                    index={index}
                    count={items.length}
                    onMove={(from, to) => edit((draft) => moveItem(draft, from, to))}
                    onRemove={() => edit((draft) => draft.splice(index, 1))}
                    removeLabel="この話し方の例を削除"
                  />
                </div>
                <div className="field">
                  <span className="field-label">状況</span>
                  <TextInput
                    value={item.situation}
                    maxLength={LIMITS.toneSituation}
                    placeholder="例: 元気がないと相談された"
                    ariaLabel={`口調サンプル${index + 1}の状況`}
                    onChange={(next) =>
                      edit((draft) => ((draft[index] as ToneExample).situation = next))
                    }
                  />
                  <div className="field-foot">
                    <span />
                    <Counter length={item.situation.length} max={LIMITS.toneSituation} />
                  </div>
                </div>
                <div className="field">
                  <span className="field-label">発話例</span>
                  <TextArea
                    value={item.example}
                    maxLength={LIMITS.toneExample}
                    placeholder="そのときどう返すか"
                    rows={2}
                    ariaLabel={`口調サンプル${index + 1}の発話例`}
                    onChange={(next) =>
                      edit((draft) => ((draft[index] as ToneExample).example = next))
                    }
                  />
                  <div className="field-foot">
                    <span className="field-warning">{half}</span>
                    <Counter length={item.example.length} max={LIMITS.toneExample} />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <button
        type="button"
        className="btn btn-outline"
        disabled={items.length >= LIMITS.toneItemsPerCharacter}
        onClick={() => edit((draft) => draft.push({ situation: "", example: "" }))}
      >
        <IconPlus />
        口調サンプルを追加
      </button>
    </div>
  );
}
