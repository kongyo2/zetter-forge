import { encodeWithinLimit, type ImageSpec, SOURCE_IMAGE_MAX_BYTES } from "@shared/images";
import Cropper from "cropperjs";

class ImageInputError extends Error {}

/** 選んだファイルを dataURL として読む（Zetter と同じく画像だけ、5MB まで）。 */
export function readImageFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/"))
    return Promise.reject(new ImageInputError("画像ファイルを選択してください。"));
  if (file.size > SOURCE_IMAGE_MAX_BYTES)
    return Promise.reject(new ImageInputError("5MB以下の画像を選択してください。"));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new ImageInputError("画像ファイルの読み込みに失敗しました。"));
    reader.readAsDataURL(file);
  });
}

/** Zetter のキャスト作成画面と同じ設定で Cropper を作る。 */
export function createCropper(image: HTMLImageElement, spec: ImageSpec): Cropper {
  return new Cropper(image, {
    aspectRatio: spec.aspectRatio ?? Number.NaN,
    viewMode: 1,
    dragMode: "move",
    autoCropArea: 1,
    restore: false,
    guides: true,
    center: false,
    highlight: false,
    cropBoxMovable: spec.cropBoxAdjustable,
    cropBoxResizable: spec.cropBoxAdjustable,
    toggleDragModeOnDblclick: false,
    responsive: true,
  });
}

function resizeCanvas(
  source: HTMLCanvasElement,
  width: number,
  height: number,
): HTMLCanvasElement | null {
  const resized = document.createElement("canvas");
  resized.width = width;
  resized.height = height;
  const context = resized.getContext("2d");
  if (!context) return null;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, width, height);
  return resized;
}

export interface CroppedImage {
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
}

/** 切り抜いて、Zetter と同じ規則で JPEG に圧縮する。 */
export async function cropToImage(cropper: Cropper, spec: ImageSpec): Promise<CroppedImage> {
  const canvas = cropper.getCroppedCanvas(spec.output);
  if (!canvas) throw new ImageInputError("画像を切り抜けませんでした。");
  const dataUrl = encodeWithinLimit(canvas, spec, { resize: resizeCanvas });
  if (!dataUrl || dataUrl.length > spec.maxDataUrlLength) {
    throw new ImageInputError("画像が大きすぎます。別の画像を選んでください。");
  }
  const size = await imageSize(dataUrl);
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return { dataUrl, ...size, bytes: (base64.length * 3) / 4 - padding };
}

function imageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new ImageInputError("画像の読み込みに失敗しました。"));
    image.src = dataUrl;
  });
}
