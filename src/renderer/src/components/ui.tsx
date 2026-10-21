import { formatCount } from "@shared/text";
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useLayoutEffect,
  useRef,
} from "react";

import { IconDown, IconRemove, IconUp } from "./icons";

const TAB_KEYS = new Set(["ArrowLeft", "ArrowRight", "Home", "End"]);

/**
 * role="tablist" の中を ← → Home End で移り、移った先のタブを選ぶ。
 * 選んでいないタブは tabIndex={-1} にして、Tab キーでは選んでいるタブにだけ止まるようにする。
 */
export function onTabListKeyDown(event: KeyboardEvent<HTMLElement>): void {
  if (!TAB_KEYS.has(event.key)) return;
  const tabs = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')];
  const index = tabs.indexOf(document.activeElement as HTMLElement);
  if (index < 0) return;
  event.preventDefault();
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
  tabs[next]?.focus();
  tabs[next]?.click();
}

function SectionHead({
  title,
  description,
  meta,
}: {
  title: string;
  description?: ReactNode;
  /** 見出しの右に添える数（「3 / 12パート」など） */
  meta?: ReactNode;
}) {
  return (
    <div className="section-head">
      <div className="section-title">
        <h2>{title}</h2>
        {meta ? <span className="section-meta">{meta}</span> : null}
      </div>
      {description ? <p className="note">{description}</p> : null}
    </div>
  );
}

/** タブの中のひとまとまり。まとまりどうしは罫線で区切る。 */
export function Section({
  title,
  description,
  meta,
  className,
  children,
}: {
  title?: string;
  description?: ReactNode;
  meta?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <section className={className ? `section ${className}` : "section"}>
      {title ? <SectionHead title={title} description={description} meta={meta} /> : null}
      {children}
    </section>
  );
}

export function Field({
  label,
  required,
  hint,
  error,
  counter,
  children,
}: {
  label: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  error?: string | null;
  counter?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <div className="field-label">
        <span>{label}</span>
        {required ? <span className="required">必須</span> : null}
      </div>
      {hint ? <p className="note">{hint}</p> : null}
      {children}
      {error || counter ? (
        <div className="field-foot">
          <span className="field-error">{error ?? ""}</span>
          {counter}
        </div>
      ) : null}
    </div>
  );
}

export function Counter({
  length,
  max,
  unit = "",
}: {
  length: number;
  max: number;
  unit?: string;
}) {
  const state = length > max ? " is-over" : length >= max * 0.9 ? " is-near" : "";
  return (
    <span className={`counter${state}`}>
      {formatCount(length)}/{formatCount(max)}
      {unit}
    </span>
  );
}

export function TextInput({
  value,
  onChange,
  maxLength,
  placeholder,
  disabled,
  invalid,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <input
      className={className ? `input ${className}` : "input"}
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

const AUTOGROW_MAX_PX = 480;

export function TextArea({
  value,
  onChange,
  maxLength,
  placeholder,
  rows = 3,
  invalid,
  ariaLabel,
  textareaRef,
}: {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
  rows?: number;
  invalid?: boolean;
  ariaLabel?: string;
  textareaRef?: (element: HTMLTextAreaElement | null) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  // 中身の高さに合わせて伸ばす（長い設定を読み返せるように）
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight + 2, AUTOGROW_MAX_PX)}px`;
  }, [value]);
  return (
    <textarea
      ref={(element) => {
        ref.current = element;
        textareaRef?.(element);
      }}
      className="textarea"
      value={value}
      rows={rows}
      maxLength={maxLength}
      placeholder={placeholder}
      aria-invalid={invalid || undefined}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function Toggle({
  checked,
  onChange,
  title,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={disabled ? "toggle is-disabled" : "toggle"}>
      <span className="toggle-text">
        <span className="toggle-title">{title}</span>
        {description ? <span className="note">{description}</span> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
    </label>
  );
}

export function Disclosure({
  summary,
  children,
  defaultOpen = false,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="disclosure" open={defaultOpen}>
      <summary>{summary}</summary>
      <div className="disclosure-body">{children}</div>
    </details>
  );
}

/** 丸いアイコン。ink を渡すと、その人の色の輪で囲む。 */
export function Avatar({
  src,
  name,
  ink,
  blurred,
  size = "medium",
}: {
  src: string | null;
  name: string;
  ink?: string;
  blurred?: boolean;
  size?: "small" | "medium";
}) {
  const initial = Array.from(name.trim())[0] ?? "？";
  const classes = ["avatar", `avatar-${size}`, ink ? "is-inked" : ""].filter(Boolean).join(" ");
  return (
    <span
      className={classes}
      style={ink ? ({ "--ink": ink } as CSSProperties) : undefined}
      aria-hidden="true"
    >
      {src ? <img src={src} alt="" className={blurred ? "is-blurred" : undefined} /> : initial}
    </span>
  );
}

export function MoveButtons({
  index,
  count,
  onMove,
  onRemove,
  removeLabel = "削除",
}: {
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  return (
    <div className="row-actions">
      <button
        type="button"
        className="icon-button"
        disabled={index === 0}
        aria-label="上へ移動"
        title="上へ移動"
        onClick={() => onMove(index, index - 1)}
      >
        <IconUp />
      </button>
      <button
        type="button"
        className="icon-button"
        disabled={index === count - 1}
        aria-label="下へ移動"
        title="下へ移動"
        onClick={() => onMove(index, index + 1)}
      >
        <IconDown />
      </button>
      {onRemove ? (
        <button
          type="button"
          className="icon-button is-danger"
          aria-label={removeLabel}
          title={removeLabel}
          onClick={onRemove}
        >
          <IconRemove />
        </button>
      ) : null}
    </div>
  );
}

export function moveItem<T>(items: T[], from: number, to: number): void {
  if (to < 0 || to >= items.length) return;
  const [item] = items.splice(from, 1);
  if (item !== undefined) items.splice(to, 0, item);
}
