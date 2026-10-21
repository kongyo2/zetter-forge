// 画像の切り抜きと圧縮の規則。Zetter のキャスト作成画面（Cropper.js 1.6.2）と同じにして、
// ここで作った画像を Zetter で選び直しても、切り抜き枠が画像全体に一致するようにする。
export type ImageKind = "avatar" | "member" | "persona" | "cover" | "background" | "gallery";

export interface ImageSpec {
  kind: ImageKind;
  /** 切り抜き画面の見出し */
  title: string;
  /** 縦横比。null は自由比率 */
  aspectRatio: number | null;
  /** 枠の大きさを変えられるか（アイコンは画像を動かして合わせる） */
  cropBoxAdjustable: boolean;
  /** getCroppedCanvas に渡す大きさ */
  output: { width: number; height: number } | { maxWidth: number; maxHeight: number };
  /** dataURL の長さの上限 */
  maxDataUrlLength: number;
  /** カバーだけは画質を下げても収まらないとき縮小して再挑戦する */
  shrinkToFit: boolean;
}

export const JPEG_QUALITIES = [0.92, 0.85, 0.78, 0.7, 0.62] as const;

/** 選べる元画像の大きさの上限（Zetter と同じ 5MB） */
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
  // 登場人物のアイコンは、Zetter では 1200×400 を指定して正方形の枠から 400×400 になり、上限は 400,000。
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

/** 切り抜いたキャンバスを、上限に収まる JPEG の dataURL にする（収まらなければ null）。 */
export interface EncodableCanvas {
  width: number;
  height: number;
  toDataURL(type: string, quality: number): string;
}

export interface CanvasFactory<C extends EncodableCanvas> {
  /** source を width×height に縮小した新しいキャンバスを返す */
  resize(source: C, width: number, height: number): C | null;
}

export function encodeWithinLimit<C extends EncodableCanvas>(
  canvas: C,
  spec: Pick<ImageSpec, "maxDataUrlLength" | "shrinkToFit">,
  factory?: CanvasFactory<C>,
): string | null {
  if (!spec.shrinkToFit || !factory) {
    let dataUrl = "";
    for (const quality of JPEG_QUALITIES) {
      dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (dataUrl.length <= spec.maxDataUrlLength) return dataUrl;
    }
    return null;
  }
  // カバー: 画質を下げても収まらなければ縮小して繰り返す（最大 8 回、短辺 320 まで）。
  let source = canvas;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    let dataUrl = "";
    for (const quality of JPEG_QUALITIES) {
      dataUrl = source.toDataURL("image/jpeg", quality);
      if (dataUrl.length <= spec.maxDataUrlLength) return dataUrl;
    }
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

/** 画像ファイルの名前に使う枠の名前 */
export function imageSlotName(kind: ImageKind, index?: number): string {
  if (kind === "gallery") return `gallery-${String((index ?? 0) + 1).padStart(2, "0")}`;
  if (kind === "member") return `member-${String((index ?? 0) + 2).padStart(2, "0")}`;
  if (kind === "persona") return `persona-${String((index ?? 0) + 1).padStart(2, "0")}`;
  return kind;
}
