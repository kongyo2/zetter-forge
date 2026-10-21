import type { CastImage } from "@shared/cast";
import { IMAGE_SPECS, type ImageKind } from "@shared/images";
import { useRef, useState } from "react";

import { readImageFile } from "../crop";
import type { CroppedImage } from "../crop";
import { useEditor } from "../editor";
import { CropDialog } from "./CropDialog";

/** 画像ファイルを選んで切り抜くまでの流れ（複数選べるのはギャラリーだけ）。 */
export function useImagePicker(kind: ImageKind, onPicked: (image: CastImage) => void) {
  const editor = useEditor();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [queue, setQueue] = useState<File[]>([]);
  const [source, setSource] = useState<string | null>(null);
  const spec = IMAGE_SPECS[kind];

  const openNext = async (files: File[]) => {
    const [next, ...rest] = files;
    setQueue(rest);
    if (!next) {
      setSource(null);
      return;
    }
    try {
      setSource(await readImageFile(next));
    } catch (error) {
      editor.notify(error instanceof Error ? error.message : "画像を開けませんでした。", "error");
      await openNext(rest);
    }
  };

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      multiple={kind === "gallery"}
      hidden
      onChange={(event) => {
        const files = [...(event.target.files ?? [])];
        event.target.value = "";
        void openNext(files);
      }}
    />
  );

  const dialog = source ? (
    <CropDialog
      source={source}
      spec={spec}
      remaining={kind === "gallery" ? queue.length : undefined}
      onCancel={() => {
        // ギャラリーの連続トリミング中にキャンセルしたら、残りも取りやめる（Zetter と同じ）
        setQueue([]);
        setSource(null);
      }}
      onError={(message) => editor.notify(message, "error")}
      onConfirm={(cropped: CroppedImage) => {
        onPicked(editor.addImage(cropped));
        void openNext(queue);
      }}
    />
  ) : null;

  return {
    open: () => inputRef.current?.click(),
    element: (
      <>
        {input}
        {dialog}
      </>
    ),
  };
}

export function ImageField({
  kind,
  image,
  onChange,
  shape,
  emptyLabel,
  blurred,
  removeLabel = "画像を外す",
}: {
  kind: Exclude<ImageKind, "gallery">;
  image: CastImage | null;
  onChange: (image: CastImage | null) => void;
  shape: "circle" | "portrait" | "tall";
  emptyLabel: string;
  blurred?: boolean;
  removeLabel?: string;
}) {
  const editor = useEditor();
  const picker = useImagePicker(kind, onChange);
  const src = editor.src(image);
  return (
    <div className={`image-field image-${shape}`}>
      <button
        type="button"
        className={src ? "image-pick has-image" : "image-pick"}
        onClick={picker.open}
        aria-label={src ? `${emptyLabel}（選び直す）` : emptyLabel}
      >
        {src ? (
          <img src={src} alt="" className={blurred ? "is-blurred" : undefined} />
        ) : (
          <span className="image-empty">{emptyLabel}</span>
        )}
      </button>
      {image ? (
        <div className="image-meta">
          <span className="note">
            {image.width}×{image.height}・{Math.round(image.bytes / 1024)}KB
          </span>
          <button type="button" className="btn btn-plain btn-small" onClick={() => onChange(null)}>
            {removeLabel}
          </button>
        </div>
      ) : null}
      {picker.element}
    </div>
  );
}
