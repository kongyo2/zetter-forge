// ダイアログ。<dialog> を前面に出すと、裏の画面は操作も読み上げもされなくなり、Esc で取りやめになる。
// 閉じるかどうかは仲介役が決めるので、Esc（cancel）ではこの部品から閉じずに知らせるだけ。
import type Cropper from "cropperjs";
import {
  type ReactNode,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { ViewEvent } from "../app/events";
import type { DialogVM, SettingsDialogVM } from "../app/viewModels";
import { createCropper } from "../runtime/crop";
import { type Emit, Link, useEmit } from "./chain";
import { Toggle } from "./parts/basics";
import { IconCopy } from "./parts/icons";

function Modal({
  label,
  className,
  onCancel,
  children,
}: {
  label: string;
  className: string;
  onCancel: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return undefined;
    // 閉じたあとに、開く前にフォーカスがあったところへ戻す
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    // はじめのフォーカスは、印を付けたボタンに置く（showModal は最初のボタンを選んでしまう）
    dialog.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
    return () => {
      if (dialog.open) dialog.close();
      if (before?.isConnected) before.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      aria-label={label}
      onCancel={(event: SyntheticEvent) => {
        event.preventDefault();
        onCancel();
      }}
    >
      {children}
    </dialog>
  );
}

function ConfirmDialog({ vm }: { vm: Extract<DialogVM, { kind: "confirm" }> }) {
  const emit = useEmit();
  return (
    <Modal
      label={vm.title}
      className="confirm-modal"
      onCancel={() => emit({ type: "dialog/cancel" })}
    >
      <h2 className="modal-title">{vm.title}</h2>
      <p className="modal-message">{vm.message}</p>
      <div className="modal-actions">
        <button
          type="button"
          className="btn btn-plain"
          data-initial-focus={vm.initial === "cancel" || undefined}
          onClick={() => emit({ type: "dialog/cancel" })}
        >
          {vm.cancelLabel}
        </button>
        {vm.choices.map((choice) => (
          <button
            key={choice.id}
            type="button"
            className={
              choice.tone === "primary"
                ? "btn btn-primary"
                : choice.tone === "danger"
                  ? "btn btn-outline btn-danger"
                  : "btn btn-outline"
            }
            data-initial-focus={vm.initial === choice.id || undefined}
            onClick={() => emit({ type: "dialog/choose", choice: choice.id })}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </Modal>
  );
}

function CropDialog({ vm }: { vm: Extract<DialogVM, { kind: "crop" }> }) {
  const emit = useEmit();
  const imageRef = useRef<HTMLImageElement | null>(null);
  const cropperRef = useRef<Cropper | null>(null);
  // 切り抜けるようになった画像（token）。それまでは「この範囲にする」を押せない（押しても切り抜けない）
  const [readyToken, setReadyToken] = useState<number | null>(null);

  // Cropper は描き方の道具なので、この部品が持つ。画像が替わるたびに作り直す
  useEffect(() => {
    const image = imageRef.current;
    if (!image || !vm.source) return undefined;
    const token = vm.token;
    const start = () => {
      cropperRef.current?.destroy();
      cropperRef.current = createCropper(image, vm.spec, () => setReadyToken(token));
    };
    const fail = () => emit({ type: "crop/failed", message: "画像として読めませんでした。" });
    if (image.complete && image.naturalWidth > 0) start();
    else {
      image.addEventListener("load", start, { once: true });
      image.addEventListener("error", fail, { once: true });
    }
    return () => {
      image.removeEventListener("load", start);
      image.removeEventListener("error", fail);
      cropperRef.current?.destroy();
      cropperRef.current = null;
    };
  }, [vm.source, vm.spec, vm.token, emit]);

  const confirm = () => {
    const canvas = cropperRef.current?.getCroppedCanvas(vm.spec.output);
    if (canvas) emit({ type: "crop/confirm", canvas });
    else emit({ type: "crop/failed", message: "画像を切り抜けませんでした。" });
  };

  return (
    <Modal label={vm.title} className="crop-modal" onCancel={() => emit({ type: "crop/cancel" })}>
      <h2 className="modal-title">
        {vm.title}
        {vm.progress ? <span className="modal-progress">{vm.progress}</span> : null}
      </h2>
      {vm.error ? (
        <p className="field-error block" role="alert">
          {vm.error}
        </p>
      ) : null}
      <div className="crop-stage">
        {vm.source ? (
          <img key={vm.token} ref={imageRef} src={vm.source} alt="" />
        ) : (
          <p className="crop-loading">読み込み中…</p>
        )}
      </div>
      <p className="note">Zetter のキャスト作成画面と同じ比率・大きさで切り抜きます。</p>
      <div className="modal-actions">
        <button
          type="button"
          className="btn btn-plain"
          onClick={() => emit({ type: "crop/cancel" })}
        >
          キャンセル
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={vm.busy || readyToken !== vm.token}
          onClick={confirm}
          data-initial-focus
        >
          この範囲にする
        </button>
      </div>
    </Modal>
  );
}

const PORT_ID = "settings-port";
const PORT_HINT_ID = "settings-port-hint";

function SettingsDialog({ vm }: { vm: SettingsDialogVM }) {
  const emit = useEmit();
  // トグルのオン・オフを、設定の書き換えとして上へ渡す
  const enable = useCallback((event: ViewEvent, next: Emit) => {
    if (event.type !== "check") return false;
    next({ type: "settings/change", patch: { enabled: event.checked } });
    return true;
  }, []);
  return (
    <Modal label="設定" className="settings-modal" onCancel={() => emit({ type: "dialog/cancel" })}>
      <form
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          emit({ type: "settings/save" });
        }}
      >
        <h2 className="modal-title">設定</h2>
        <section className="settings-section" aria-labelledby="settings-mcp-title">
          <h3 id="settings-mcp-title">AI エージェントとの連携（MCP）</h3>
          <Link handle={enable}>
            <Toggle vm={vm.enabled} />
          </Link>
          <div className="settings-port">
            <label className="field-label" htmlFor={PORT_ID}>
              ポート
            </label>
            <input
              id={PORT_ID}
              className="input input-number"
              inputMode="numeric"
              value={vm.port.value}
              disabled={vm.port.disabled}
              aria-invalid={vm.port.invalid || undefined}
              aria-describedby={PORT_HINT_ID}
              onChange={(event) =>
                emit({ type: "settings/change", patch: { port: event.target.value } })
              }
            />
            <span className="note" id={PORT_HINT_ID}>
              {vm.port.hint}。ほかのアプリと重ならない番号にします。
            </span>
          </div>
          <div className="settings-status">
            <p className={`mcp-status is-${vm.status.tone}`} role="status">
              {vm.status.text}
            </p>
            {vm.status.url ? (
              <div className="field-row">
                <input
                  className="input input-plain"
                  readOnly
                  value={vm.status.url}
                  aria-label="MCP サーバーの URL"
                  onFocus={(event) => event.target.select()}
                />
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => emit({ type: "settings/copy-url" })}
                >
                  <IconCopy />
                  コピー
                </button>
              </div>
            ) : null}
          </div>
          <p className="note">
            動いているあいだ、AI エージェントの MCP の設定に上の URL（Streamable
            HTTP）を足すとつながります。このパソコンの中からだけつながり、つないだ AI
            は画面での操作と同じように、開いているキャストを書き換えたり保存したりできます。
          </p>
        </section>
        {vm.error ? (
          <p className="field-error block" role="alert">
            {vm.error}
          </p>
        ) : null}
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-plain"
            onClick={() => emit({ type: "dialog/cancel" })}
          >
            {vm.closeLabel}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!vm.canApply}>
            この設定にする
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function Dialog({ vm }: { vm: DialogVM }) {
  switch (vm.kind) {
    case "confirm":
      return <ConfirmDialog key={vm.id} vm={vm} />;
    case "crop":
      return <CropDialog vm={vm} />;
    case "settings":
      return <SettingsDialog vm={vm} />;
  }
}
