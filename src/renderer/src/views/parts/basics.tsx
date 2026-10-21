// 小さな部品。どれも渡された値を描き、操作されたらできごとを出すだけ（Passive View）。
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { ViewEvent } from "../../app/events";
import type { Path } from "../../app/types";
import type { AvatarVM, CopyVM, CounterVM, MoveVM, SelectVM, ToggleVM } from "../../app/viewModels";
import { Link, useEmit } from "../chain";
import { IconCheck, IconCopy, IconDown, IconRemove, IconUp } from "./icons";

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
  /** 見出しの右に添える数（「3 / 12パート」など） */
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

export function Counter({ vm }: { vm: CounterVM }) {
  const tone = vm.tone === "over" ? " is-over" : vm.tone === "near" ? " is-near" : "";
  return (
    <span className={`counter${tone}`}>
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

/**
 * 開け閉めできるまとまり。開いているかどうかは描き方だけのことなので、この部品が持つ。
 * 中の入力欄へフォーカスを移す頼み（reveal）が上ってきたら、自分を開いてから上へ渡す。
 */
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

/** 丸いアイコン。ink があれば、その人の色の輪で囲む。 */
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

/** 並べ替えと削除のボタン。どれを動かすかは、上の部品（Link）が path に足す */
export function MoveButtons({ vm }: { vm: MoveVM }) {
  const emit = useEmit();
  return (
    <div className="row-actions">
      <button
        type="button"
        className="icon-button"
        disabled={!vm.canUp}
        aria-label="上へ移動"
        title="上へ移動"
        onClick={() => emit({ type: "move", path: [], offset: -1 })}
      >
        <IconUp />
      </button>
      <button
        type="button"
        className="icon-button"
        disabled={!vm.canDown}
        aria-label="下へ移動"
        title="下へ移動"
        onClick={() => emit({ type: "move", path: [], offset: 1 })}
      >
        <IconDown />
      </button>
      {vm.removeLabel ? (
        <button
          type="button"
          className="icon-button is-danger"
          aria-label={vm.removeLabel}
          title={vm.removeLabel}
          onClick={() => emit({ type: "remove", path: [] })}
        >
          <IconRemove />
        </button>
      ) : null}
    </div>
  );
}

const FLASH_MS = 1600;

/** Zetter に貼るためのコピー。コピーした直後だけ「コピーしました」と描く */
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

/**
 * タブの並び。← → Home End で移り、移った先を選ぶ（選んでいないタブは Tab キーで止まらない）。
 * 選んだことは tab/select で知らせ、何を選んだかは上の部品が意味を足す。
 */
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

/** 中の TabList の tab/select を、この場所での意味（editor/tab など）に読み替える輪 */
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
