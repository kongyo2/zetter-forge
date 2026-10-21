import {
  AFFINITY_BASE_SUBJECT,
  type CastDocument,
  createDefaultAffinityConfig,
  createEmptyCast,
  createEmptyMember,
  createEmptyPartnerSettings,
  createEmptyPersona,
} from "@shared/cast";
import {
  affinityStageTextLength,
  duplicateStageIndexes,
  limitPartnerSettingsValue,
  missingRequired,
  partnerSettingsLength,
  settingsShares,
  settingsUsage,
  toneShares,
  toneUsage,
  validateAffinityConfig,
  validateCast,
} from "@shared/validate";
import { describe, expect, it } from "vitest";

function validCast(): CastDocument {
  const doc = createEmptyCast();
  doc.name = "灯里";
  doc.persona = "古書店の店主。";
  doc.tagline = "雨の日だけ開く古書店";
  return doc;
}

const messages = (doc: CastDocument) => validateCast(doc).map((issue) => issue.message);

describe("validateCast", () => {
  it("必須の欄がそろっていれば問題なし", () => {
    expect(validateCast(validCast())).toEqual([]);
  });

  it("名前・性格・設定・キャッチコピー（ストーリーのみ）が必須", () => {
    const doc = createEmptyCast();
    expect(messages(doc)).toEqual(
      expect.arrayContaining([
        "名前を入力してください。",
        "性格・設定を入力してください。",
        "キャッチコピーを入力してください。",
      ]),
    );
    doc.mode = "chat";
    expect(messages(doc)).not.toContain("キャッチコピーを入力してください。");
    expect(missingRequired({ ...validCast(), tagline: "" })).toEqual({
      character: false,
      experience: true,
    });
  });

  it("名前の欄は UTF-16 で数える（絵文字は 2 字）", () => {
    const doc = validCast();
    doc.name = "🌙".repeat(5);
    expect(messages(doc)).toEqual([]);
    doc.name = "🌙".repeat(6);
    expect(messages(doc)).toContain("名前は10文字までです。");
  });

  it("キャラクター設定は本人と登場人物で合計 20,000 字。雑談モードでは登場人物を数えない", () => {
    const doc = validCast();
    doc.persona = "あ".repeat(15000);
    doc.members = [{ ...createEmptyMember(), name: "葵", profile: "い".repeat(5001) }];
    expect(messages(doc)).toContain(
      "キャラクター設定（本人の性格・設定と登場人物のプロフィール）は合わせて20,000字までです。いまは20,001字で、1字ぶん超えています。誰の設定を削るかはお任せします（「いまの状況」は別枠です）。",
    );
    expect(settingsUsage(doc)).toEqual({ total: 20001, remaining: 0, over: 1 });
    doc.mode = "chat";
    expect(settingsUsage(doc).total).toBe(15000);
    expect(messages(doc).some((message) => message.startsWith("キャラクター設定"))).toBe(false);
  });

  it("口調サンプルの合計は送られる行（状況と発話例の両方がある行）だけを数える", () => {
    const doc = validCast();
    doc.toneExamples = [
      { situation: "あ".repeat(250), example: "い".repeat(3500) },
      { situation: "う".repeat(250), example: "え".repeat(3500) },
      { situation: "お".repeat(250), example: "か".repeat(2251) },
      { situation: "片方だけ", example: "" },
    ];
    const result = messages(doc);
    expect(result).toContain(
      "口調サンプルは全員の合計で10,000字までです。いまは10,001字で、1字ぶん超えています。誰の口調サンプルを削るかはお任せします。",
    );
    expect(result).toContain(
      "本人の口調サンプル4は状況と発話例の片方が空なので、Zetter では保存されません。",
    );
    // 画面のカウンタは入力中の値をそのまま数える（片方だけの行も入る）
    expect(toneUsage(doc).total).toBe(10001 + 4);
  });

  it("合計の内訳は本人、登場人物の順で、足すと合計になる", () => {
    const doc = validCast();
    const empty = createEmptyMember();
    const aoi = {
      ...createEmptyMember(),
      name: "葵",
      profile: "い".repeat(30),
      toneExamples: [{ situation: "朝", example: "おはよう" }],
    };
    doc.members = [aoi, empty];
    doc.toneExamples = [{ situation: "雨の日", example: "……いらっしゃい" }];
    expect(settingsShares(doc)).toEqual([
      { memberId: null, length: 7 },
      { memberId: aoi.id, length: 30 },
      { memberId: empty.id, length: 0 },
    ]);
    expect(toneShares(doc).map((share) => share.length)).toEqual([11, 5, 0]);
    const sum = (shares: { length: number }[]) =>
      shares.reduce((total, share) => total + share.length, 0);
    expect(sum(settingsShares(doc))).toBe(settingsUsage(doc).total);
    expect(sum(toneShares(doc))).toBe(toneUsage(doc).total);
    doc.mode = "chat";
    expect(settingsShares(doc)).toEqual([{ memberId: null, length: 7 }]);
    expect(toneShares(doc)).toEqual([{ memberId: null, length: 11 }]);
  });

  it("名前のある登場人物はそのまま、何か書いたのに名前がない登場人物はエラー", () => {
    const doc = validCast();
    doc.members = [{ ...createEmptyMember(), profile: "名前なし" }, createEmptyMember()];
    expect(messages(doc)).toContain("登場人物の名前を入力してください。");
    expect(missingRequired(doc).character).toBe(true);
  });

  it("名前のないペルソナは保存されない（遊ぶ人の名前を使うなら保存される）", () => {
    const doc = validCast();
    doc.recommendedPersonas = [{ ...createEmptyPersona(), note: "設定だけ" }];
    expect(messages(doc).some((message) => message.includes("名前が空なので"))).toBe(true);
    doc.recommendedPersonas = [{ ...createEmptyPersona(), useViewerName: true }];
    expect(messages(doc)).toEqual([]);
  });

  it("空のイントロのパートと空のタグは警告", () => {
    const doc = validCast();
    doc.introScript = [{ kind: "narration", text: " ", speakerId: null }];
    doc.tags = ["", "古書店"];
    const result = validateCast(doc);
    expect(result.filter((issue) => issue.level === "warning")).toHaveLength(2);
  });

  it("登場人物がいるときは、話者の選び方の注意を出す", () => {
    const doc = validCast();
    const member = { ...createEmptyMember(), name: "葵" };
    doc.members = [member];
    doc.introScript = [{ kind: "speech", text: "いらっしゃい。", speakerId: null }];
    const infos = () => validateCast(doc).filter((issue) => issue.level === "info");
    expect(infos()).toHaveLength(1);
    doc.introScript[0]!.speakerId = member.id;
    expect(infos()).toHaveLength(2);
    doc.mode = "chat";
    expect(infos()).toHaveLength(0);
  });

  it("好感度の個別設定のエラーには対象の名前が付く", () => {
    const doc = validCast();
    const member = { ...createEmptyMember(), name: "葵" };
    doc.members = [member];
    const broken = createDefaultAffinityConfig();
    broken.itemName = "";
    doc.affinity = {
      default: createDefaultAffinityConfig(),
      overrides: { [AFFINITY_BASE_SUBJECT]: broken, [member.id]: broken },
    };
    expect(messages(doc)).toEqual(
      expect.arrayContaining([
        "本体の個別設定: 項目名は1～20文字で入力してください。",
        "葵の個別設定: 項目名は1～20文字で入力してください。",
      ]),
    );
  });
});

describe("validateAffinityConfig", () => {
  it("ひな形はそのまま通る", () => {
    expect(validateAffinityConfig(createDefaultAffinityConfig())).toBe("");
  });

  it("項目名はコードポイントで数える（絵文字 20 個まで）", () => {
    const config = createDefaultAffinityConfig();
    config.itemName = "🌙".repeat(20);
    expect(validateAffinityConfig(config)).toBe("");
    config.itemName = "🌙".repeat(21);
    expect(validateAffinityConfig(config)).toBe("項目名は1～20文字で入力してください。");
  });

  it.each([
    [
      (c: ReturnType<typeof createDefaultAffinityConfig>) => void (c.maxValue = 0),
      "好感度の範囲は整数で、最小値より最大値を大きくしてください。",
    ],
    [
      (c: ReturnType<typeof createDefaultAffinityConfig>) => void (c.minValue = null),
      "好感度の範囲は整数で、最小値より最大値を大きくしてください。",
    ],
    [
      (c: ReturnType<typeof createDefaultAffinityConfig>) => void (c.initialValue = 101),
      "初期値は範囲内の整数にしてください。",
    ],
    [
      (c: ReturnType<typeof createDefaultAffinityConfig>) => void (c.stages = []),
      "段階は1～10段階にしてください。",
    ],
    [
      (c: ReturnType<typeof createDefaultAffinityConfig>) => void (c.stages[1]!.startValue = 0),
      "段階の開始値が重複しています。段階ごとに異なる値を入力してください。",
    ],
    [
      (c: ReturnType<typeof createDefaultAffinityConfig>) => void (c.stages[2]!.startValue = 10),
      "段階の開始値は小さい順にしてください。",
    ],
    [
      (c: ReturnType<typeof createDefaultAffinityConfig>) => void (c.stages[0]!.startValue = 5),
      "最初の段階の開始値は最小値にしてください。",
    ],
    [
      (c: ReturnType<typeof createDefaultAffinityConfig>) => void (c.stages[1]!.startValue = 101),
      "段階の開始値は範囲内の整数にしてください。",
    ],
    [
      (c: ReturnType<typeof createDefaultAffinityConfig>) => void (c.stages[1]!.freeText = ""),
      "各段階に態度文を1つ以上入力してください。",
    ],
    [
      (c: ReturnType<typeof createDefaultAffinityConfig>) =>
        void (c.stages[1]!.freeText = "🌙".repeat(1001)),
      "各段階の6欄は合計1000文字以内にしてください。",
    ],
  ])("規則ごとの文言 %#", (breakIt, expected) => {
    const config = createDefaultAffinityConfig();
    breakIt(config);
    expect(validateAffinityConfig(config)).toBe(expected);
  });

  it("6 欄の合計はコードポイントで数える", () => {
    const stage = { ...createDefaultAffinityConfig().stages[0]!, freeText: "🌙".repeat(1000) };
    expect(affinityStageTextLength(stage)).toBe(1000);
  });

  it("重複している段階を見つける", () => {
    const config = createDefaultAffinityConfig();
    config.stages[2]!.startValue = 25;
    expect([...duplicateStageIndexes(config)]).toEqual([1, 2]);
  });
});

describe("パートナー設定", () => {
  it("5 欄の合計をコードポイントで数え、上限を超える挿入分だけを切り詰める", () => {
    const settings = { ...createEmptyPartnerSettings(), dailyRoutine: "あ".repeat(4998) };
    expect(partnerSettingsLength(settings)).toBe(4998);
    expect(limitPartnerSettingsValue(settings, "freeform", "🌙🌙🌙")).toBe("🌙🌙");
    // 既存の文字の間に挿入した場合も、前後は残して挿入分を詰める
    const edited = limitPartnerSettingsValue(
      settings,
      "dailyRoutine",
      `あ${"いいい"}${"あ".repeat(4997)}`,
    );
    expect(Array.from(edited)).toHaveLength(5000);
    expect(edited.startsWith("あいい")).toBe(true);
  });
});
