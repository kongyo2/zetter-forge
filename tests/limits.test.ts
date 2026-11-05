import { LIMITS } from "@shared/limits";
import { clipUtf16, codePointLength, formatCount, utf16Length } from "@shared/text";
import { describe, expect, it } from "vitest";

describe("LIMITS", () => {
  it("Zetter の作成画面と同じ上限", () => {
    expect(LIMITS).toEqual({
      name: 10,
      memberName: 10,
      tagline: 40,
      hook: 40,
      situation: 20000,
      aboutText: 3000,
      introPart: 4000,
      introParts: 12,
      introTotal: 12000,
      tag: 20,
      tags: 5,
      toneSituation: 250,
      toneExample: 3500,
      toneItemsPerCharacter: 10,
      settingsTotal: 20000,
      toneTotal: 10000,
      charactersTotal: 10,
      members: 9,
      personas: 5,
      personaName: 20,
      personaTagline: 50,
      personaNote: 2000,
      partnerSettingsTotal: 5000,
      affinityItemName: 20,
      affinityStages: 10,
      affinityStageText: 1000,
      gallery: 10,
      lorebooks: 10,
      lorebookTitle: 20,
      playGuide: {
        summary: 400,
        world: 600,
        role: 200,
        start: 300,
        first: 300,
        hint: 400,
        gimmick: 400,
      },
    });
  });

  it("イントロの合計は、1 パートの上限より大きく、全部のパートの上限の和より小さい", () => {
    expect(LIMITS.introTotal).toBeGreaterThan(LIMITS.introPart);
    expect(LIMITS.introTotal).toBeLessThan(LIMITS.introPart * LIMITS.introParts);
  });

  it("登場人物は本人を含めた人数から本人を引いた数", () => {
    expect(LIMITS.members).toBe(LIMITS.charactersTotal - 1);
  });
});

describe("字数の数え方", () => {
  it("HTML の maxlength と同じく、UTF-16 のコード単位で数える", () => {
    expect(utf16Length("")).toBe(0);
    expect(utf16Length("灯里")).toBe(2);
    expect(utf16Length("🌙")).toBe(2);
    expect(utf16Length("👨‍👩‍👧")).toBe(8);
  });

  it("好感度・パートナー設定は Array.from と同じく、コードポイントで数える", () => {
    expect(codePointLength("")).toBe(0);
    expect(codePointLength("灯里")).toBe(2);
    expect(codePointLength("🌙")).toBe(1);
    expect(codePointLength("👨‍👩‍👧")).toBe(5);
  });

  it("字数で切るときは、UTF-16 で数え、絵文字（サロゲートペア）の途中では切らない", () => {
    expect(clipUtf16("灯里", 5)).toBe("灯里");
    expect(clipUtf16("一二三", 2)).toBe("一二");
    expect(clipUtf16("一🌙", 2)).toBe("一");
    expect(clipUtf16("一🌙", 3)).toBe("一🌙");
    expect(clipUtf16("灯里", 0)).toBe("");
  });

  it("件数は ja-JP の 3 桁区切りにする（数でないものは 0）", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(999)).toBe("999");
    expect(formatCount(20000)).toBe("20,000");
    expect(formatCount(1234567)).toBe("1,234,567");
    expect(formatCount(Number.NaN)).toBe("0");
  });
});
