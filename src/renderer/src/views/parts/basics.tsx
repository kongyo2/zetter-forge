import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { ViewEvent } from "../../app/events";
import type { Path } from "../../app/types";
import type {
  AvatarVM,
  CopyVM,
  CounterVM,
  FocusVM,
  MoveVM,
  SelectVM,
  TabItemVM,
  ToggleVM,
} from "../../app/viewModels";
import { Link, useEmit } from "../chain";
import { IconCheck, IconCopy, IconDown, IconFolder, IconPlus, IconRemove, IconUp } from "./icons";

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
      {title ? (
        <div className="section-head">
          <div className="section-title">
            <h2>{title}</h2>
            {meta ? <span className="section-meta">{meta}</span> : null}
          </div>
          {description ? <p className="note">{description}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Subsection({
  title,
  meta,
  children,
}: {
  title?: string;
  meta?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="subsection">
      {title ? (
        <div className="subhead">
          <h3>{title}</h3>
          {meta}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function EmitButton({
  event,
  className,
  disabled,
  ariaLabel,
  title,
  children,
}: {
  event: ViewEvent;
  className: string;
  disabled?: boolean;
  ariaLabel?: string;
  title?: string;
  children: ReactNode;
}) {
  const emit = useEmit();
  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
      onClick={() => emit(event)}
    >
      {children}
    </button>
  );
}

export function MiniCheck({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="mini-check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {children}
    </label>
  );
}

export function useFocusRequest<E extends HTMLElement>(
  focus: FocusVM | null,
  ref: RefObject<E | null>,
  apply: (element: E, focus: FocusVM) => void,
): void {
  const emit = useEmit();
  const nonce = focus?.nonce;
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !focus) return;
    emit({ type: "reveal" });
    apply(element, focus);
  }, [nonce]);
}

export function toneClass(tone: CounterVM["tone"]): string {
  return tone === "over" ? " is-over" : tone === "near" ? " is-near" : "";
}

export function Counter({ vm }: { vm: CounterVM }) {
  return (
    <span className={`counter${toneClass(vm.tone)}`}>
      {vm.text}
      {vm.aside ? <span className="counter-aside">{vm.aside}</span> : null}
    </span>
  );
}

export function Toggle({ vm }: { vm: ToggleVM }) {
  const emit = useEmit();
  return (
    <label className={vm.disabled ? "toggle is-disabled" : "toggle"}>
      <span className="toggle-text">
        <span className="toggle-title">{vm.label}</span>
        {vm.description ? <span className="note">{vm.description}</span> : null}
      </span>
      <input
        type="checkbox"
        className="visually-hidden"
        checked={vm.checked}
        disabled={vm.disabled}
        onChange={(event) => emit({ type: "check", path: vm.name, checked: event.target.checked })}
      />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
    </label>
  );
}

export function Select({ vm, className }: { vm: SelectVM; className?: string }) {
  const emit = useEmit();
  const groups: { group: string | null; options: SelectVM["options"] }[] = [];
  for (const option of vm.options) {
    const last = groups.at(-1);
    if (last && last.group === option.group) last.options.push(option);
    else groups.push({ group: option.group, options: [option] });
  }
  const render = (options: SelectVM["options"]) =>
    options.map((option) => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ));
  return (
    <select
      className={className ?? "input select"}
      aria-label={vm.label}
      value={vm.value}
      onChange={(event) => emit({ type: "input", path: vm.name, value: event.target.value })}
    >
      {groups.map((group, index) =>
        group.group ? (
          <optgroup key={`${group.group}-${index}`} label={group.group}>
            {render(group.options)}
          </optgroup>
        ) : (
          render(group.options)
        ),
      )}
    </select>
  );
}

export function Disclosure({
  summary,
  hint,
  children,
}: {
  summary: string;
  hint?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement | null>(null);
  const reveal = useCallback((event: ViewEvent) => {
    if (event.type === "reveal" && ref.current) ref.current.open = true;
    return false;
  }, []);
  return (
    <details className="disclosure" ref={ref}>
      <summary>
        {summary}
        {hint ? <span className="summary-hint">{hint}</span> : null}
      </summary>
      <Link handle={reveal}>
        <div className="disclosure-body">{children}</div>
      </Link>
    </details>
  );
}

export function Avatar({ vm, size = "medium" }: { vm: AvatarVM; size?: "small" | "medium" }) {
  const classes = ["avatar", `avatar-${size}`, vm.ink ? "is-inked" : ""].filter(Boolean).join(" ");
  return (
    <span
      className={classes}
      style={vm.ink ? ({ "--ink": vm.ink } as CSSProperties) : undefined}
      aria-hidden="true"
    >
      {vm.src ? (
        <img src={vm.src} alt="" className={vm.blurred ? "is-blurred" : undefined} />
      ) : (
        vm.initial
      )}
    </span>
  );
}

export function MoveButtons({ vm }: { vm: MoveVM }) {
  return (
    <div className="row-actions">
      <EmitButton
        event={{ type: "move", path: [], offset: -1 }}
        className="icon-button"
        disabled={!vm.canUp}
        ariaLabel="上へ移動"
        title="上へ移動"
      >
        <IconUp />
      </EmitButton>
      <EmitButton
        event={{ type: "move", path: [], offset: 1 }}
        className="icon-button"
        disabled={!vm.canDown}
        ariaLabel="下へ移動"
        title="下へ移動"
      >
        <IconDown />
      </EmitButton>
      {vm.removeLabel ? (
        <EmitButton
          event={{ type: "remove", path: [] }}
          className="icon-button is-danger"
          ariaLabel={vm.removeLabel}
          title={vm.removeLabel}
        >
          <IconRemove />
        </EmitButton>
      ) : null}
    </div>
  );
}

export function RowList<Row>({
  rows,
  empty,
  className = "rows",
  keyOf,
  children,
}: {
  rows: readonly Row[];
  empty: string;
  className?: string;
  keyOf: (row: Row) => string | number;
  children: (row: Row) => ReactNode;
}) {
  if (rows.length === 0) return <p className="note empty">{empty}</p>;
  return (
    <ol className={className}>
      {rows.map((row) => {
        const key = keyOf(row);
        return (
          <Link key={key} scope={[key]}>
            {children(row)}
          </Link>
        );
      })}
    </ol>
  );
}

export function SortableRow({
  index,
  move,
  className,
  children,
}: {
  index: number;
  move: MoveVM;
  className?: string;
  children: ReactNode;
}) {
  return (
    <li className={className ? `row ${className}` : "row"}>
      <div className="row-head">
        <span className="row-index">{index + 1}</span>
        <MoveButtons vm={move} />
      </div>
      {children}
    </li>
  );
}

export function AddButton({
  path = [],
  disabled,
  children,
}: {
  path?: Path;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <EmitButton event={{ type: "add", path }} className="btn btn-outline" disabled={disabled}>
      <IconPlus />
      {children}
    </EmitButton>
  );
}

export function RemoveButton({ children }: { children: ReactNode }) {
  return (
    <EmitButton event={{ type: "remove", path: [] }} className="btn btn-plain btn-small btn-danger">
      {children}
    </EmitButton>
  );
}

export function ShowFileButton({ path = [], title }: { path?: Path; title?: string }) {
  return (
    <EmitButton
      event={{ type: "show-file", path }}
      className="btn btn-plain btn-small"
      title={title}
    >
      <IconFolder />
      フォルダで見る
    </EmitButton>
  );
}

const FLASH_MS = 1600;

export function CopyButton({
  vm,
  name,
  label = "コピー",
}: {
  vm: CopyVM;
  name: Path;
  label?: string;
}) {
  const emit = useEmit();
  const [flashing, setFlashing] = useState(false);
  useEffect(() => {
    if (vm.flash === null) return undefined;
    setFlashing(true);
    const timer = window.setTimeout(() => setFlashing(false), FLASH_MS);
    return () => {
      window.clearTimeout(timer);
      setFlashing(false);
    };
  }, [vm.flash]);
  const text = flashing
    ? "コピーしました"
    : vm.state === "done"
      ? "コピー済み"
      : vm.state === "changed"
        ? "コピーし直す"
        : label;
  return (
    <button
      type="button"
      className={`copy-button is-${vm.state}${flashing ? " is-flash" : ""}`}
      title={vm.title}
      onClick={() => emit({ type: "copy", path: name })}
    >
      {flashing || vm.state === "done" ? <IconCheck /> : <IconCopy />}
      <span>{text}</span>
    </button>
  );
}

const TAB_KEYS = new Set(["ArrowLeft", "ArrowRight", "Home", "End"]);

export function TabList<T extends { id: string; domId: string; selected: boolean }>({
  items,
  label,
  className,
  controls,
  itemClass,
  children,
}: {
  items: readonly T[];
  label: string;
  className: string;
  controls?: string;
  itemClass: (item: T) => string;
  children: (item: T) => ReactNode;
}) {
  const emit = useEmit();
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!TAB_KEYS.has(event.key)) return;
    const index = items.findIndex((item) => refs.current.get(item.id) === document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;
    const target = items[next];
    if (!target) return;
    refs.current.get(target.id)?.focus();
    emit({ type: "tab/select", id: target.id });
  };
  return (
    <div className={className} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {items.map((item) => (
        <button
          key={item.id}
          ref={(element) => {
            if (element) refs.current.set(item.id, element);
            else refs.current.delete(item.id);
          }}
          type="button"
          role="tab"
          id={item.domId}
          aria-selected={item.selected}
          aria-controls={controls}
          tabIndex={item.selected ? 0 : -1}
          className={itemClass(item)}
          onClick={() => emit({ type: "tab/select", id: item.id })}
        >
          {children(item)}
        </button>
      ))}
    </div>
  );
}

export function CastTabs({
  items,
  label,
  controls,
}: {
  items: readonly TabItemVM<string>[];
  label: string;
  controls?: string;
}) {
  return (
    <TabList
      items={items}
      label={label}
      className="cast-tabs"
      controls={controls}
      itemClass={(item) => (item.selected ? "cast-tab is-selected" : "cast-tab")}
    >
      {(item) => (
        <>
          {item.avatar ? <Avatar vm={item.avatar} size="small" /> : null}
          <span className="cast-tab-text">
            <span className="cast-tab-name">{item.label}</span>
            <small>{item.sub}</small>
          </span>
        </>
      )}
    </TabList>
  );
}

export function TabMeaning({
  to,
  children,
}: {
  to: (id: string) => ViewEvent;
  children: ReactNode;
}) {
  const translate = useCallback(
    (event: ViewEvent, next: (event: ViewEvent) => void) => {
      if (event.type !== "tab/select") return false;
      next(to(event.id));
      return true;
    },
    [to],
  );
  return <Link handle={translate}>{children}</Link>;
}
