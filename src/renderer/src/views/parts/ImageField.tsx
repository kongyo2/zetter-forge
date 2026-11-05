import { type ReactNode, useRef } from "react";

import type { Path, PickedFile } from "../../app/types";
import type { ImageFieldVM } from "../../app/viewModels";
import { useEmit } from "../chain";
import { CopyButton, EmitButton, ShowFileButton, useFocusRequest } from "./basics";

export function FilePicker({
  name,
  multiple,
  children,
}: {
  name: Path;
  multiple: boolean;
  children: (open: () => void) => ReactNode;
}) {
  const emit = useEmit();
  const input = useRef<HTMLInputElement | null>(null);
  return (
    <>
      {children(() => input.current?.click())}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple={multiple}
        hidden
        onChange={(event) => {
          const files: PickedFile[] = [...(event.target.files ?? [])];
          event.target.value = "";
          if (files.length > 0) emit({ type: "pick", path: name, files });
        }}
      />
    </>
  );
}

export function ImageField({ vm }: { vm: ImageFieldVM }) {
  const button = useRef<HTMLButtonElement | null>(null);
  useFocusRequest(vm.focus, button, (element) => element.focus());
  return (
    <div className={`image-field image-${vm.shape}`}>
      <FilePicker name={vm.name} multiple={vm.multiple}>
        {(open) => (
          <button
            ref={button}
            type="button"
            className={vm.src ? "image-pick has-image" : "image-pick"}
            onClick={open}
            aria-label={vm.src ? `${vm.label}（選び直す）` : vm.label}
          >
            {vm.src ? (
              <img src={vm.src} alt="" className={vm.blurred ? "is-blurred" : undefined} />
            ) : (
              <span className="image-empty">{vm.label}</span>
            )}
          </button>
        )}
      </FilePicker>
      {vm.meta ? (
        <div className="image-meta">
          <span className="image-size">
            <span>{vm.meta.size}</span>
            <span>{vm.meta.bytes}</span>
          </span>
          <div className="image-actions">
            {vm.copy ? <CopyButton vm={vm.copy} name={vm.name} label="場所をコピー" /> : null}
            {vm.canShowFile ? (
              <ShowFileButton path={vm.name} title="画像のファイルをフォルダで見る" />
            ) : null}
            <EmitButton
              event={{ type: "remove", path: vm.name }}
              className="btn btn-plain btn-small"
            >
              {vm.removeLabel}
            </EmitButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}
