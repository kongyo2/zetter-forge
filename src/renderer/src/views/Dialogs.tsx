// ダイアログ。<dialog> を前面に出すと、裏の画面は操作も読み上げもされなくなり、Esc で取りやめになる。
// 閉じるかどうかは仲介役が決めるので、Esc（cancel）ではこの部品から閉じずに知らせるだけ。
import type Cropper from "cropperjs";
import { type ReactNode, type SyntheticEvent, useEffect, useLayoutEffect, useRef } from "react";

import type { DialogVM } from "../app/viewModels";
import { createCropper } from "../runtime/crop";
import { useEmit } from "./chain";

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

  // Cropper は描き方の道具なので、この部品が持つ。画像が替わるたびに作り直す
  useEffect(() => {
    const image = imageRef.current;
    if (!image || !vm.source) return undefined;
    const start = () => {
      cropperRef.current?.destroy();
      cropperRef.current = createCropper(image, vm.spec);
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
  }, [vm.source, vm.spec, emit]);

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
          disabled={vm.busy || !vm.source}
          onClick={confirm}
          data-initial-focus
        >
          この範囲にする
        </button>
      </div>
    </Modal>
  );
}

export function Dialog({ vm }: { vm: DialogVM }) {
  return vm.kind === "confirm" ? <ConfirmDialog key={vm.id} vm={vm} /> : <CropDialog vm={vm} />;
}
