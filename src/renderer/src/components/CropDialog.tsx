import type { ImageSpec } from "@shared/images";
import type Cropper from "cropperjs";
import { useEffect, useRef, useState } from "react";

import { type CroppedImage, createCropper, cropToImage } from "../crop";

export function CropDialog({
  source,
  spec,
  remaining,
  onCancel,
  onConfirm,
  onError,
}: {
  source: string;
  spec: ImageSpec;
  /** ギャラリーで続けて切り抜く残りの枚数 */
  remaining?: number;
  onCancel: () => void;
  onConfirm: (image: CroppedImage) => void;
  onError: (message: string) => void;
}) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const cropperRef = useRef<Cropper | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const image = imageRef.current;
    if (!image) return undefined;
    const start = () => {
      cropperRef.current?.destroy();
      cropperRef.current = createCropper(image, spec);
    };
    if (image.complete && image.naturalWidth > 0) start();
    else image.addEventListener("load", start, { once: true });
    return () => {
      image.removeEventListener("load", start);
      cropperRef.current?.destroy();
      cropperRef.current = null;
    };
  }, [source, spec]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const confirm = async () => {
    const cropper = cropperRef.current;
    if (!cropper || busy) return;
    setBusy(true);
    try {
      onConfirm(await cropToImage(cropper, spec));
    } catch (error) {
      onError(error instanceof Error ? error.message : "画像を切り抜けませんでした。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal crop-modal" role="dialog" aria-modal="true" aria-label={spec.title}>
        <h2 className="modal-title">{spec.title}</h2>
        <div className="crop-stage">
          <img ref={imageRef} src={source} alt="" />
        </div>
        <p className="note">
          Zetter のキャスト作成画面と同じ比率・大きさで切り抜きます。
          {typeof remaining === "number" && remaining > 0 ? `（あと${remaining}枚）` : ""}
        </p>
        <div className="modal-actions">
          <button type="button" className="btn btn-plain" onClick={onCancel}>
            キャンセル
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void confirm()}
          >
            この範囲にする
          </button>
        </div>
      </div>
    </div>
  );
}
