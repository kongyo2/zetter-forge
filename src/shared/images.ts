export type ImageKind = "avatar" | "member" | "persona" | "cover" | "background" | "gallery";

export interface ImageSpec {
  kind: ImageKind;
  title: string;
  aspectRatio: number | null;
  cropBoxAdjustable: boolean;
  output: { width: number; height: number } | { maxWidth: number; maxHeight: number };
  maxDataUrlLength: number;
  shrinkToFit: boolean;
}

export const JPEG_QUALITIES = [0.92, 0.85, 0.78, 0.7, 0.62] as const;

export const SOURCE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const IMAGE_SPECS: Record<ImageKind, ImageSpec> = {
  avatar: {
    kind: "avatar",
    title: "チャットのアイコンになる範囲",
    aspectRatio: 1,
    cropBoxAdjustable: false,
    output: { width: 400, height: 400 },
    maxDataUrlLength: 200000,
    shrinkToFit: false,
  },
  persona: {
    kind: "persona",
    title: "範囲を選択",
    aspectRatio: 1,
    cropBoxAdjustable: false,
    output: { width: 400, height: 400 },
    maxDataUrlLength: 200000,
    shrinkToFit: false,
  },
  member: {
    kind: "member",
    title: "範囲を選択",
    aspectRatio: 1,
    cropBoxAdjustable: false,
    output: { width: 1200, height: 400 },
    maxDataUrlLength: 400000,
    shrinkToFit: false,
  },
  cover: {
    kind: "cover",
    title: "一覧カードに映る範囲",
    aspectRatio: 3 / 4,
    cropBoxAdjustable: true,
    output: { width: 900, height: 1200 },
    maxDataUrlLength: 400000,
    shrinkToFit: true,
  },
  background: {
    kind: "background",
    title: "チャット画面に敷かれる範囲",
    aspectRatio: 9 / 16,
    cropBoxAdjustable: true,
    output: { width: 1080, height: 1920 },
    maxDataUrlLength: 400000,
    shrinkToFit: false,
  },
  gallery: {
    kind: "gallery",
    title: "残したい範囲（自由に切れます）",
    aspectRatio: null,
    cropBoxAdjustable: true,
    output: { maxWidth: 1600, maxHeight: 1600 },
    maxDataUrlLength: 400000,
    shrinkToFit: false,
  },
};

export interface EncodableCanvas {
  width: number;
  height: number;
  toDataURL(type: string, quality: number): string;
}

export type CropCanvas = EncodableCanvas;

export interface ImageMetrics {
  width: number;
  height: number;
  bytes: number;
}

export interface CroppedImage extends ImageMetrics {
  dataUrl: string;
}

export function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return (base64.length * 3) / 4 - padding;
}

export interface CanvasFactory<C extends EncodableCanvas> {
  resize(source: C, width: number, height: number): C | null;
}

function jpegWithin(canvas: EncodableCanvas, maxLength: number): string {
  let dataUrl = "";
  for (const quality of JPEG_QUALITIES) {
    dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length <= maxLength) break;
  }
  return dataUrl;
}

export function encodeWithinLimit<C extends EncodableCanvas>(
  canvas: C,
  spec: Pick<ImageSpec, "maxDataUrlLength" | "shrinkToFit">,
  factory?: CanvasFactory<C>,
): string | null {
  let source = canvas;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const dataUrl = jpegWithin(source, spec.maxDataUrlLength);
    if (dataUrl.length <= spec.maxDataUrlLength) return dataUrl;
    if (!spec.shrinkToFit || !factory) return null;
    if (Math.min(source.width, source.height) <= 320) return null;
    const scale = Math.min(0.82, Math.sqrt(spec.maxDataUrlLength / dataUrl.length) * 0.9);
    const width = Math.max(240, Math.floor(source.width * scale));
    const height = Math.max(320, Math.floor(source.height * scale));
    if (width >= source.width || height >= source.height) return null;
    const resized = factory.resize(source, width, height);
    if (!resized) return null;
    source = resized;
  }
  return null;
}

const FIRST_SLOT_NUMBER: Partial<Record<ImageKind, number>> = { gallery: 1, member: 2, persona: 1 };

export function imageSlotName(kind: ImageKind, index?: number): string {
  const first = FIRST_SLOT_NUMBER[kind];
  if (first === undefined) return kind;
  return `${kind}-${String((index ?? 0) + first).padStart(2, "0")}`;
}
