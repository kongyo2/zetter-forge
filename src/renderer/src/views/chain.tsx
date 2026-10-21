// 画面の部品からのできごとを、部品の階層に沿って Root まで上らせる（Chain of Responsibility）。
// 途中の部品（Link）は、自分の場所を path の前に足すか、自分で受け持てるものは受け持つ。
// Root にたどり着いたできごとは、仲介役（Mediator）が裁定する。
import { type ReactNode, createContext, useContext, useMemo } from "react";

import type { ViewEvent } from "../app/events";
import type { Path } from "../app/types";

export type Emit = (event: ViewEvent) => void;

/** 受け持てば true を返す。受け持たないものは、上の部品へ渡る */
type Handler = (event: ViewEvent, next: Emit) => boolean;

const EmitContext = createContext<Emit | null>(null);

/** できごとを出す。部品は、自分の中での場所（相対の path）だけを書けばよい */
export function useEmit(): Emit {
  const emit = useContext(EmitContext);
  if (!emit) throw new Error("Root の外で部品が使われています。");
  return emit;
}

/** 鎖のいちばん上。ここまで上ってきたできごとを仲介役へ渡す */
export function ChainRoot({ onEvent, children }: { onEvent: Emit; children: ReactNode }) {
  return <EmitContext.Provider value={onEvent}>{children}</EmitContext.Provider>;
}

function prefix(scope: Path, event: ViewEvent): ViewEvent {
  return "path" in event ? { ...event, path: [...scope, ...event.path] } : event;
}

/**
 * 鎖の 1 つの輪。scope を渡すと、中から上ってきたできごとの path の前にそれを足す。
 * handle を渡すと、上へ渡す前に自分で受け持てるかを試す。
 *
 * 輪は「中にある部品」のできごとにだけ効く。部品が自分の場所を持つときは、輪をその部品の中ではなく
 * 呼び出す側に置く（<Link scope={vm.scope}><Tones vm={vm} /></Link>）。部品が自分で出すできごとも、
 * そうすれば同じ輪を通って上る。
 */
export function Link({
  scope,
  handle,
  children,
}: {
  scope?: Path;
  handle?: Handler;
  children: ReactNode;
}) {
  const parent = useEmit();
  const scopeKey = scope ? JSON.stringify(scope) : "";
  const emit = useMemo<Emit>(() => {
    const base: Path = scopeKey ? (JSON.parse(scopeKey) as Path) : [];
    return (event) => {
      const scoped = base.length > 0 ? prefix(base, event) : event;
      if (handle?.(scoped, parent)) return;
      parent(scoped);
    };
  }, [parent, scopeKey, handle]);
  return <EmitContext.Provider value={emit}>{children}</EmitContext.Provider>;
}
