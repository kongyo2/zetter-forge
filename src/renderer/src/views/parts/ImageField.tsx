// 画像の欄。ファイルを選んだら pick を出し、切り抜きは仲介役がダイアログで進める（Passive View）。
import { type ReactNode, useLayoutEffect, useRef } from "react";

import type { Path, PickedFile } from "../../app/types";
import type { ImageFieldVM } from "../../app/viewModels";
import { useEmit } from "../chain";
import { CopyButton } from "./basics";
import { IconFolder } from "./icons";

/** ファイルを選ぶ欄（見えない <input type="file">）と、それを開くボタンの組 */
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
          // 同じファイルを続けて選んでも change が起きるように空にする
          event.target.value = "";
          if (files.length > 0) emit({ type: "pick", path: name, files });
        }}
      />
    </>
  );
}

export function ImageField({ vm }: { vm: ImageFieldVM }) {
  const emit = useEmit();
  const button = useRef<HTMLButtonElement | null>(null);
  const nonce = vm.focus?.nonce;
  useLayoutEffect(() => {
    if (!vm.focus || !button.current) return;
    emit({ type: "reveal" });
    button.current.focus();
  }, [nonce]);
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
              <button
                type="button"
                className="btn btn-plain btn-small"
                title="画像のファイルをフォルダで見る"
                onClick={() => emit({ type: "show-file", path: vm.name })}
              >
                <IconFolder />
                フォルダで見る
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-plain btn-small"
              onClick={() => emit({ type: "remove", path: vm.name })}
            >
              {vm.removeLabel}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
