import {
  type EncodableCanvas,
  encodeWithinLimit,
  IMAGE_SPECS,
  imageSlotName,
  JPEG_QUALITIES,
} from "@shared/images";
import { describe, expect, it } from "vitest";

/** 画質に応じて dataURL の長さが変わるだけの擬似キャンバス */
function fakeCanvas(
  width: number,
  height: number,
  lengthAt: (quality: number, area: number) => number,
) {
  const calls: number[] = [];
  const canvas: EncodableCanvas & { calls: number[] } = {
    width,
    height,
    calls,
    toDataURL: (_type, quality) => {
      calls.push(quality);
      return "x".repeat(lengthAt(quality, width * height));
    },
  };
  return canvas;
}

describe("encodeWithinLimit", () => {
  it("画質を 0.92 から順に下げ、上限に収まった最初の画質を使う", () => {
    const canvas = fakeCanvas(400, 400, (quality) => Math.round(quality * 250000));
    const result = encodeWithinLimit(canvas, IMAGE_SPECS.avatar);
    expect(result?.length).toBe(Math.round(0.78 * 250000));
    expect(canvas.calls).toEqual([0.92, 0.85, 0.78]);
  });

  it("最低画質でも収まらなければ null（Zetter の「画像が大きすぎます」）", () => {
    const canvas = fakeCanvas(1080, 1920, () => 500000);
    expect(encodeWithinLimit(canvas, IMAGE_SPECS.background)).toBeNull();
    expect(canvas.calls).toEqual([...JPEG_QUALITIES]);
  });

  it("カバーは縮小して再挑戦する", () => {
    const sizes: [number, number][] = [];
    const make = (width: number, height: number): EncodableCanvas => ({
      width,
      height,
      toDataURL: (_type, quality) => "x".repeat(Math.round(width * height * quality * 0.6)),
    });
    const result = encodeWithinLimit(make(900, 1200), IMAGE_SPECS.cover, {
      resize: (_source, width, height) => {
        sizes.push([width, height]);
        return make(width, height);
      },
    });
    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThanOrEqual(IMAGE_SPECS.cover.maxDataUrlLength);
    expect(sizes.length).toBeGreaterThan(0);
  });
});

describe("IMAGE_SPECS", () => {
  it("Zetter の作成画面と同じ比率と出力", () => {
    expect(IMAGE_SPECS.avatar).toMatchObject({
      aspectRatio: 1,
      output: { width: 400, height: 400 },
      maxDataUrlLength: 200000,
    });
    expect(IMAGE_SPECS.cover).toMatchObject({
      aspectRatio: 3 / 4,
      output: { width: 900, height: 1200 },
      maxDataUrlLength: 400000,
    });
    expect(IMAGE_SPECS.background).toMatchObject({
      aspectRatio: 9 / 16,
      output: { width: 1080, height: 1920 },
    });
    expect(IMAGE_SPECS.gallery).toMatchObject({
      aspectRatio: null,
      output: { maxWidth: 1600, maxHeight: 1600 },
    });
    expect(IMAGE_SPECS.member).toMatchObject({ aspectRatio: 1, maxDataUrlLength: 400000 });
  });

  it("ファイル名に使う枠の名前", () => {
    expect(imageSlotName("avatar")).toBe("avatar");
    expect(imageSlotName("gallery", 0)).toBe("gallery-01");
    expect(imageSlotName("member", 0)).toBe("member-02");
    expect(imageSlotName("persona", 4)).toBe("persona-05");
  });
});
