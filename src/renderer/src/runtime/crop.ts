// 画像の読み込み・切り抜き・圧縮（ブラウザの機能を使うところ）。
import {
  type CroppedImage,
  type CropCanvas,
  IMAGE_SPECS,
  type ImageKind,
  type ImageSpec,
  SOURCE_IMAGE_MAX_BYTES,
  dataUrlBytes,
  encodeWithinLimit,
} from "@shared/images";
import Cropper from "cropperjs";

import type { ImagePort } from "../app/mediator";
import type { PickedFile } from "../app/types";

class ImageInputError extends Error {}

/** 選んだファイルを dataURL として読む（Zetter と同じく画像だけ、5MB まで）。 */
function readImageFile(file: PickedFile): Promise<string> {
  if (!file.type.startsWith("image/"))
    return Promise.reject(new ImageInputError("画像ファイルを選択してください。"));
  if (file.size > SOURCE_IMAGE_MAX_BYTES)
    return Promise.reject(new ImageInputError("5MB以下の画像を選択してください。"));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new ImageInputError("画像ファイルの読み込みに失敗しました。"));
    reader.readAsDataURL(file as File);
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

function resizeCanvas(source: CropCanvas, width: number, height: number): CropCanvas | null {
  const resized = document.createElement("canvas");
  resized.width = width;
  resized.height = height;
  const context = resized.getContext("2d");
  if (!context) return null;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source as HTMLCanvasElement, 0, 0, width, height);
  return resized;
}

function imageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new ImageInputError("画像の読み込みに失敗しました。"));
    image.src = dataUrl;
  });
}

/** 切り抜いたキャンバスを、Zetter と同じ規則で JPEG に圧縮する。 */
async function encodeCrop(canvas: CropCanvas, kind: ImageKind): Promise<CroppedImage> {
  const spec = IMAGE_SPECS[kind];
  const dataUrl = encodeWithinLimit(canvas, spec, { resize: resizeCanvas });
  if (!dataUrl || dataUrl.length > spec.maxDataUrlLength) {
    throw new ImageInputError("画像が大きすぎます。別の画像を選んでください。");
  }
  const size = await imageSize(dataUrl);
  return { dataUrl, ...size, bytes: dataUrlBytes(dataUrl) };
}

export const browserImages: ImagePort = { read: readImageFile, encode: encodeCrop };
