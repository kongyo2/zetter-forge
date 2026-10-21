import { formatCount } from "@shared/text";
import { type ReactNode, useLayoutEffect, useRef } from "react";

export function SectionHead({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {description ? <p className="note">{description}</p> : null}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={className ? `card ${className}` : "card"}>{children}</section>;
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
        {required ? <span className="badge badge-required">必須</span> : null}
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
      {length}/{max}
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

const AUTOGROW_MAX_PX = 420;

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

export function Budget({
  label,
  total,
  max,
  note,
}: {
  label: string;
  total: number;
  max: number;
  note: string;
}) {
  const state = total > max ? " is-over" : max - total <= max * 0.1 ? " is-near" : "";
  return (
    <section className={`budget${state}`} aria-label={label}>
      <div className="budget-row">
        <span className="budget-label">{label}</span>
        <span className="budget-value">
          {formatCount(total)} / {formatCount(max)}
        </span>
      </div>
      <div className="budget-bar" aria-hidden="true">
        <span style={{ width: `${Math.min(100, (total / max) * 100)}%` }} />
      </div>
      <p className="note">{note}</p>
    </section>
  );
}

export function MoveButtons({
  index,
  count,
  onMove,
  onRemove,
  removeLabel,
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
        className="btn btn-plain btn-small"
        disabled={index === 0}
        onClick={() => onMove(index, index - 1)}
      >
        上へ
      </button>
      <button
        type="button"
        className="btn btn-plain btn-small"
        disabled={index === count - 1}
        onClick={() => onMove(index, index + 1)}
      >
        下へ
      </button>
      {onRemove ? (
        <button type="button" className="btn btn-plain btn-small btn-danger" onClick={onRemove}>
          {removeLabel ?? "削除"}
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
