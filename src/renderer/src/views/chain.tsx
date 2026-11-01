import { type ReactNode, createContext, useContext, useMemo } from "react";

import type { ViewEvent } from "../app/events";
import type { Path } from "../app/types";

export type Emit = (event: ViewEvent) => void;

type Handler = (event: ViewEvent, next: Emit) => boolean;

const EmitContext = createContext<Emit | null>(null);

export function useEmit(): Emit {
  const emit = useContext(EmitContext);
  if (!emit) throw new Error("Root の外で部品が使われています。");
  return emit;
}

export function ChainRoot({ onEvent, children }: { onEvent: Emit; children: ReactNode }) {
  return <EmitContext.Provider value={onEvent}>{children}</EmitContext.Provider>;
}

function prefix(scope: Path, event: ViewEvent): ViewEvent {
  return "path" in event ? { ...event, path: [...scope, ...event.path] } : event;
}

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
