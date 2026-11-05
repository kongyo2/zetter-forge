import {
  type EncodableCanvas,
  centerSquare,
  dataUrlBytes,
  encodeWithinLimit,
  IMAGE_SPECS,
  imageSlotName,
  JPEG_QUALITIES,
  SOURCE_IMAGE_MAX_BYTES,
  usableAsSquare,
} from "@shared/images";
import { describe, expect, it } from "vitest";

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

  it("上限ちょうどの長さなら収まる", () => {
    const canvas = fakeCanvas(400, 400, () => IMAGE_SPECS.avatar.maxDataUrlLength);
    expect(encodeWithinLimit(canvas, IMAGE_SPECS.avatar)?.length).toBe(200000);
    expect(canvas.calls).toEqual([0.92]);
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

  it("カバーの縮小は Zetter の encodeCastCoverCanvasWithinLimit と同じ式（最低画質での長さから倍率を決める）", () => {
    const sizes: [number, number][] = [];
    const make = (width: number, height: number) =>
      fakeCanvas(width, height, (quality, area) => Math.round(area * quality));
    const result = encodeWithinLimit(make(900, 1200), IMAGE_SPECS.cover, {
      resize: (_source, width, height) => {
        sizes.push([width, height]);
        return make(width, height);
      },
    });
    expect(sizes).toEqual([[626, 834]]);
    expect(result?.length).toBe(Math.round(626 * 834 * 0.7));
  });

  it("カバーでも、縮小しない種類の画像は縮小しない", () => {
    let resized = 0;
    const canvas = fakeCanvas(1600, 1600, () => 500000);
    expect(
      encodeWithinLimit(canvas, IMAGE_SPECS.gallery, {
        resize: (source) => {
          resized += 1;
          return source;
        },
      }),
    ).toBeNull();
    expect(resized).toBe(0);
  });

  it("カバーは、短辺が 320 以下なら縮小をあきらめて null", () => {
    let resized = 0;
    const canvas = fakeCanvas(300, 400, () => 500000);
    const result = encodeWithinLimit(canvas, IMAGE_SPECS.cover, {
      resize: (source) => {
        resized += 1;
        return source;
      },
    });
    expect(result).toBeNull();
    expect(resized).toBe(0);
    expect(canvas.calls).toEqual([...JPEG_QUALITIES]);
  });

  it("カバーは、縮小した画像を作れなければ null", () => {
    const canvas = fakeCanvas(900, 1200, () => 500000);
    expect(encodeWithinLimit(canvas, IMAGE_SPECS.cover, { resize: () => null })).toBeNull();
    expect(canvas.calls).toEqual([...JPEG_QUALITIES]);
  });

  it("カバーの縮小は、幅 240・高さ 320 より小さくしない", () => {
    const shrink = (width: number, height: number, length: number) => {
      const sizes: [number, number][] = [];
      const make = (w: number, h: number) => fakeCanvas(w, h, () => length);
      const result = encodeWithinLimit(make(width, height), IMAGE_SPECS.cover, {
        resize: (_source, w, h) => {
          sizes.push([w, h]);
          return make(w, h);
        },
      });
      return { result, sizes };
    };
    expect(shrink(400, 1000, 5_000_000)).toEqual({ result: null, sizes: [[240, 320]] });
    expect(shrink(900, 330, 500000)).toEqual({ result: null, sizes: [[724, 320]] });
  });

  it("カバーの縮小は 8 回まで", () => {
    const sizes: [number, number][] = [];
    const make = (width: number, height: number) => fakeCanvas(width, height, () => 500000);
    const result = encodeWithinLimit(make(20000, 20000), IMAGE_SPECS.cover, {
      resize: (_source, width, height) => {
        sizes.push([width, height]);
        return make(width, height);
      },
    });
    expect(result).toBeNull();
    expect(sizes).toHaveLength(8);
  });
});

describe("dataUrlBytes", () => {
  it("base64 の長さと末尾の = の数から、ファイルの大きさを出す", () => {
    expect(dataUrlBytes("data:image/jpeg;base64,AAAA")).toBe(3);
    expect(dataUrlBytes("data:image/jpeg;base64,AAA=")).toBe(2);
    expect(dataUrlBytes("data:image/jpeg;base64,AA==")).toBe(1);
    expect(dataUrlBytes("data:image/jpeg;base64,")).toBe(0);
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

  it("切り抜き画面の見出し・枠を動かせるか・縮小するか（Zetter の openCropModal・cropConfirmBtn と同じ）", () => {
    expect(
      Object.values(IMAGE_SPECS).map((spec) => [
        spec.kind,
        spec.title,
        spec.cropBoxAdjustable,
        spec.shrinkToFit,
        spec.maxDataUrlLength,
      ]),
    ).toEqual([
      ["avatar", "チャットのアイコンになる範囲", false, false, 200000],
      ["persona", "範囲を選択", false, false, 200000],
      ["member", "範囲を選択", false, false, 400000],
      ["cover", "一覧カードに映る範囲", true, true, 400000],
      ["background", "チャット画面に敷かれる範囲", true, false, 400000],
      ["gallery", "残したい範囲（自由に切れます）", true, false, 400000],
    ]);
    expect(IMAGE_SPECS.persona).toMatchObject({
      aspectRatio: 1,
      output: { width: 400, height: 400 },
    });
    expect(IMAGE_SPECS.member.output).toEqual({ width: 1200, height: 400 });
  });

  it("元の画像は 5MB まで、画質は 0.92 から 0.62 まで 5 段階", () => {
    expect(SOURCE_IMAGE_MAX_BYTES).toBe(5 * 1024 * 1024);
    expect([...JPEG_QUALITIES]).toEqual([0.92, 0.85, 0.78, 0.7, 0.62]);
  });

  it("ファイル名に使う枠の名前", () => {
    expect(imageSlotName("avatar")).toBe("avatar");
    expect(imageSlotName("gallery", 0)).toBe("gallery-01");
    expect(imageSlotName("member", 0)).toBe("member-02");
    expect(imageSlotName("persona", 4)).toBe("persona-05");
  });

  it("番号を省いたときは 1 つ目（登場人物は 2 人目）の名前にする", () => {
    expect(imageSlotName("cover")).toBe("cover");
    expect(imageSlotName("background")).toBe("background");
    expect(imageSlotName("gallery")).toBe("gallery-01");
    expect(imageSlotName("gallery", 9)).toBe("gallery-10");
    expect(imageSlotName("member")).toBe("member-02");
    expect(imageSlotName("persona")).toBe("persona-01");
  });
});

describe("保存した画像を登場人物のアイコンにする", () => {
  const jpeg = "data:image/jpeg;base64,AAAA";

  it("正方形で、保存できる形式と大きさなら、そのまま使う", () => {
    expect(usableAsSquare("member", jpeg, { width: 400, height: 400 })).toBe(true);
    expect(usableAsSquare("member", "data:image/png;base64,AAAA", { width: 1, height: 1 })).toBe(
      true,
    );
    expect(usableAsSquare("member", jpeg, { width: 600, height: 300 })).toBe(false);
    expect(usableAsSquare("member", "data:image/gif;base64,AAAA", { width: 9, height: 9 })).toBe(
      false,
    );
    expect(usableAsSquare("member", jpeg, { width: 0, height: 0 })).toBe(false);
    const big = `data:image/jpeg;base64,${"A".repeat(IMAGE_SPECS.member.maxDataUrlLength)}`;
    expect(usableAsSquare("member", big, { width: 400, height: 400 })).toBe(false);
  });

  it("そのまま使えなければ、中央の正方形を、切り抜きと同じ一辺 400 までに縮めて切り出す", () => {
    expect(centerSquare("member", { width: 600, height: 300 })).toEqual({
      x: 150,
      y: 0,
      size: 300,
      side: 300,
    });
    expect(centerSquare("member", { width: 1000, height: 1600 })).toEqual({
      x: 0,
      y: 300,
      size: 1000,
      side: 400,
    });
    expect(centerSquare("gallery", { width: 3000, height: 2000 })).toMatchObject({ side: 1600 });
    expect(centerSquare("member", { width: 0, height: 10 })).toBeNull();
  });
});
