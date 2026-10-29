// 上限の値と字数の数え方。値は 2026-10-29 に z-etter.com/cast/create（app.js?v=13f314ca5840）の
// 定数・入力欄の maxlength・保存前の確認と突き合わせたもの。Zetter で上限が変わったら、ここも変える。
import { LIMITS } from "@shared/limits";
import { codePointLength, formatCount, utf16Length } from "@shared/text";
import { describe, expect, it } from "vitest";

describe("LIMITS", () => {
  it("Zetter の作成画面と同じ上限", () => {
    expect(LIMITS).toEqual({
      // キャラクター（名前の maxlength、CAST_MEMBER_NAME_MAX）
      name: 10,
      memberName: 10,
      // 体験設定・見た目（キャッチコピー・一言セリフ・いまの状況・このキャストについての maxlength）
      tagline: 40,
      hook: 40,
      situation: 20000,
      aboutText: 3000,
      // イントロ（パートの maxlength と「パートを追加 n/12」。合計は「作り方」の依頼文の
      // 「1パート4000文字・全部合わせて12000文字まで」）
      introPart: 4000,
      introParts: 12,
      introTotal: 12000,
      // タグ（「最大5個・各20文字まで」）
      tag: 20,
      tags: 5,
      // 口調サンプル（CAST_TONE_SITUATION_MAX・CAST_TONE_EXAMPLE_MAX・CAST_TONE_MAX_ITEMS）
      toneSituation: 250,
      toneExample: 3500,
      toneItemsPerCharacter: 10,
      // 全員で分け合う枠（CAST_SETTINGS_TOTAL_MAX・CAST_TONE_TOTAL_MAX）
      settingsTotal: 20000,
      toneTotal: 10000,
      // 登場人物（CAST_MEMBER_MAX_TOTAL・CAST_MEMBER_MAX_CHILDREN）
      charactersTotal: 10,
      members: 9,
      // この会話でのあなた（5 件まで、名前 20・紹介文 50・キャストに伝わるもの 2000）
      personas: 5,
      personaName: 20,
      personaTagline: 50,
      personaNote: 2000,
      // パートナー設定（CAST_PARTNER_SETTINGS_MAX_CHARS）
      partnerSettingsTotal: 5000,
      // 好感度（validateCastAffinityConfigForUi）
      affinityItemName: 20,
      affinityStages: 10,
      affinityStageText: 1000,
      // ギャラリー（10 枚まで）・設定集（10 冊まで連動、書名 20 字）
      gallery: 10,
      lorebooks: 10,
      lorebookTitle: 20,
      // 遊び方シート（CAST_PLAY_GUIDE_FIELDS と、各欄の maxlength）
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
    // 12 パートを上限まで書くと合計を超える（パートごとの上限だけでは足りない）
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
    // サロゲートペアは 2、ZWJ でつないだ絵文字は部品の数だけ数える
    expect(utf16Length("🌙")).toBe(2);
    expect(utf16Length("👨‍👩‍👧")).toBe(8);
  });

  it("好感度・パートナー設定は Array.from と同じく、コードポイントで数える", () => {
    expect(codePointLength("")).toBe(0);
    expect(codePointLength("灯里")).toBe(2);
    expect(codePointLength("🌙")).toBe(1);
    // 結合した絵文字は、見た目は 1 字でもコードポイントの数（3 人 + ZWJ 2 つ）になる
    expect(codePointLength("👨‍👩‍👧")).toBe(5);
  });

  it("件数は ja-JP の 3 桁区切りにする（数でないものは 0）", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(999)).toBe("999");
    expect(formatCount(20000)).toBe("20,000");
    expect(formatCount(1234567)).toBe("1,234,567");
    expect(formatCount(Number.NaN)).toBe("0");
  });
});
