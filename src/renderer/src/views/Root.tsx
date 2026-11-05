import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import type { Mediator } from "../app/mediator";
import { presentRoot } from "../app/presenters/root";
import type { RootVM, ToastVM } from "../app/viewModels";
import { ChainRoot, useEmit } from "./chain";
import { Dialog } from "./Dialogs";
import { Editor } from "./Editor";
import { EmitButton } from "./parts/basics";
import { Sidebar } from "./Sidebar";
import { Welcome } from "./Welcome";

function Toasts({ vms }: { vms: ToastVM[] }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {vms.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.tone}`}>
          <span>{toast.message}</span>
          {toast.undoable ? (
            <EmitButton event={{ type: "toast/undo", id: toast.id }} className="toast-action">
              元に戻す
            </EmitButton>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function RootView({ vm }: { vm: RootVM }) {
  const emit = useEmit();
  const preventUnload = useRef(vm.preventUnload);
  preventUnload.current = vm.preventUnload;
  useEffect(() => {
    document.title = vm.title;
  }, [vm.title]);
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!preventUnload.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const onFocus = () => emit({ type: "window/focus" });
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("focus", onFocus);
    };
  }, [emit]);
  return (
    <div className="app">
      <Sidebar vm={vm.sidebar} />
      <main className="workspace">
        {vm.workspace.kind === "editor" ? (
          <Editor vm={vm.workspace.editor} />
        ) : (
          <Welcome hasCasts={vm.workspace.hasCasts} />
        )}
      </main>
      {vm.dialog ? <Dialog vm={vm.dialog} /> : null}
      <Toasts vms={vm.toasts} />
    </div>
  );
}

export function Root({ mediator }: { mediator: Mediator }) {
  const state = useSyncExternalStore(mediator.subscribe, mediator.getState, mediator.getState);
  const vm = useMemo(() => presentRoot(state), [state]);
  return (
    <ChainRoot onEvent={mediator.dispatch}>
      <RootView vm={vm} />
    </ChainRoot>
  );
}
