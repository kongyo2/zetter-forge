// 文字・数の欄。値は描くだけで、書き換えたら input、札を押したら insert を出す（Passive View）。
// カーソルの位置・フォーカス・欄の高さは描き方のことなので、この部品が扱う。
import { type CSSProperties, Fragment, useId, useLayoutEffect, useRef } from "react";

import type { ChipsVM, HintPart, TextFieldVM } from "../../app/viewModels";
import { useEmit } from "../chain";
import { Counter, CopyButton } from "./basics";

type Element = HTMLInputElement | HTMLTextAreaElement;

function Hint({ parts }: { parts: HintPart[] }) {
  return (
    <p className="note">
      {parts.map((part, index) =>
        typeof part === "string" ? (
          <Fragment key={index}>{part}</Fragment>
        ) : (
          <code key={index}>{part.code}</code>
        ),
      )}
    </p>
  );
}

function Chips({ vm, onChip }: { vm: ChipsVM; onChip: (text: string) => void }) {
  if (vm.style === "button") {
    return (
      <span className="field-tools">
        {vm.items.map((item) => (
          <button
            key={item.text}
            type="button"
            className="btn btn-plain btn-small"
            // 押してもカーソルの位置を失わないよう、フォーカスを欄に残す
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onChip(item.text)}
          >
            {item.label}
          </button>
        ))}
      </span>
    );
  }
  return (
    <div className="chips" role="group" aria-label={vm.label}>
      {vm.items.map((item) => (
        <button
          key={item.text}
          type="button"
          className="chip"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChip(item.text)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function TextField({ vm, className }: { vm: TextFieldVM; className?: string }) {
  const emit = useEmit();
  const id = useId();
  const ref = useRef<Element | null>(null);
  /** 一度でもこの欄にカーソルを置いたか（置いていなければ、札は末尾に入れる） */
  const touched = useRef(false);

  // フォーカスを移す頼み。閉じている「オプション設定」の中なら、先に開いてもらう
  const nonce = vm.focus?.nonce;
  useLayoutEffect(() => {
    const element = ref.current;
    const focus = vm.focus;
    if (!element || !focus) return;
    emit({ type: "reveal" });
    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: "center" });
    if (focus.selection && !(element instanceof HTMLInputElement && element.type === "number"))
      element.setSelectionRange(focus.selection.start, focus.selection.end);
    // nonce が変わったときだけ動かす
  }, [nonce]);

  const onChip = (text: string) => {
    const element = ref.current;
    const end = vm.value.length;
    const selection =
      element &&
      touched.current &&
      !(element instanceof HTMLInputElement && element.type === "number")
        ? { start: element.selectionStart ?? end, end: element.selectionEnd ?? end }
        : { start: end, end };
    emit({ type: "insert", path: vm.name, text, selection });
  };

  const common = {
    id,
    "aria-label": vm.ariaLabel ?? undefined,
    "aria-invalid": vm.invalid || undefined,
    "aria-required": vm.required || undefined,
    value: vm.value,
    placeholder: vm.placeholder || undefined,
    disabled: vm.disabled,
    onFocus: () => {
      touched.current = true;
    },
    onBlur: vm.commitOnBlur ? () => emit({ type: "commit", path: vm.name }) : undefined,
  };
  const input = vm.multiline ? (
    <textarea
      {...common}
      ref={(element) => {
        ref.current = element;
      }}
      className={vm.plain ? "textarea input-plain" : "textarea"}
      rows={vm.rows}
      style={{ "--rows": vm.rows } as CSSProperties}
      maxLength={vm.maxLength ?? undefined}
      onChange={(event) => emit({ type: "input", path: vm.name, value: event.target.value })}
    />
  ) : (
    <input
      {...common}
      ref={(element) => {
        ref.current = element;
      }}
      className={[
        "input",
        vm.numeric ? "input-number" : "",
        vm.plain && !vm.numeric ? "input-plain" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      type={vm.numeric ? "number" : "text"}
      step={vm.numeric ? 1 : undefined}
      min={vm.numeric?.min ?? undefined}
      max={vm.numeric?.max ?? undefined}
      readOnly={vm.numeric?.readOnly || undefined}
      maxLength={vm.numeric ? undefined : (vm.maxLength ?? undefined)}
      onChange={(event) => emit({ type: "input", path: vm.name, value: event.target.value })}
    />
  );

  const below = vm.chips?.placement === "below" ? vm.chips : null;
  const above = vm.chips?.placement === "above" ? vm.chips : null;
  const foot = vm.error || vm.warning || vm.counter || below;
  return (
    <div className="field">
      <div className={vm.labelHidden ? "field-label visually-hidden" : "field-label"}>
        <label htmlFor={id}>{vm.label}</label>
        {vm.required ? <span className="required">必須</span> : null}
        {vm.copy && !vm.labelHidden ? (
          <span className="field-copy">
            <CopyButton vm={vm.copy} name={vm.name} />
          </span>
        ) : null}
      </div>
      {vm.hint ? <Hint parts={vm.hint} /> : null}
      {above ? <Chips vm={above} onChip={onChip} /> : null}
      {vm.copy && vm.labelHidden ? (
        <div className="field-row">
          {input}
          <CopyButton vm={vm.copy} name={vm.name} />
        </div>
      ) : (
        input
      )}
      {foot ? (
        <div className="field-foot">
          <span className="field-foot-start">
            {below ? <Chips vm={below} onChip={onChip} /> : null}
            {vm.error ? <span className="field-error">{vm.error}</span> : null}
            {vm.warning ? <span className="field-warning">{vm.warning}</span> : null}
          </span>
          {vm.counter ? <Counter vm={vm.counter} /> : null}
        </div>
      ) : null}
    </div>
  );
}
