import {
  type CroppedImage,
  type CropCanvas,
  IMAGE_SPECS,
  type ImageKind,
  type ImageSpec,
  SOURCE_IMAGE_MAX_BYTES,
  centerSquare,
  dataUrlBytes,
  encodeWithinLimit,
  usableAsSquare,
} from "@shared/images";
import Cropper from "cropperjs";

import type { ImagePort } from "../app/mediator";
import type { PickedFile } from "../app/types";

class ImageInputError extends Error {}

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

export function createCropper(
  image: HTMLImageElement,
  spec: ImageSpec,
  onReady: () => void,
): Cropper {
  return new Cropper(image, {
    ready: onReady,
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

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new ImageInputError("画像の読み込みに失敗しました。"));
    image.src = dataUrl;
  });
}

async function imageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  const image = await loadImage(dataUrl);
  return { width: image.naturalWidth, height: image.naturalHeight };
}

async function squareImage(source: string, kind: ImageKind): Promise<CroppedImage> {
  const image = await loadImage(source);
  const size = { width: image.naturalWidth, height: image.naturalHeight };
  if (usableAsSquare(kind, source, size))
    return { dataUrl: source, ...size, bytes: dataUrlBytes(source) };
  const crop = centerSquare(kind, size);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!crop || !context) throw new ImageInputError("画像の読み込みに失敗しました。");
  canvas.width = crop.side;
  canvas.height = crop.side;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, crop.x, crop.y, crop.size, crop.size, 0, 0, crop.side, crop.side);
  return encodeCrop(canvas, kind);
}

async function encodeCrop(canvas: CropCanvas, kind: ImageKind): Promise<CroppedImage> {
  const spec = IMAGE_SPECS[kind];
  const dataUrl = encodeWithinLimit(canvas, spec, { resize: resizeCanvas });
  if (!dataUrl || dataUrl.length > spec.maxDataUrlLength) {
    throw new ImageInputError("画像が大きすぎます。別の画像を選んでください。");
  }
  const size = await imageSize(dataUrl);
  return { dataUrl, ...size, bytes: dataUrlBytes(dataUrl) };
}

export const browserImages: ImagePort = {
  read: readImageFile,
  encode: encodeCrop,
  square: squareImage,
};
