import {
  AFFINITY_BASE_SUBJECT,
  type CastDocument,
  createDefaultAffinityConfig,
  createEmptyCast,
  createEmptyMember,
  createEmptyPartnerSettings,
  createEmptyPersona,
  createEmptyStage,
} from "@shared/cast";
import {
  affinityStageTextLength,
  duplicateStageIndexes,
  introUsage,
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
const issueOf = (doc: CastDocument, message: string) =>
  validateCast(doc).find((issue) => issue.message === message);

/** max 字までは message が出ず、1 字超えると出ることを確かめて、そのときの確認を返す */
function overLimit(set: (doc: CastDocument, value: string) => void, max: number, message: string) {
  const doc = validCast();
  set(doc, "あ".repeat(max));
  expect(messages(doc)).not.toContain(message);
  set(doc, "あ".repeat(max + 1));
  return issueOf(doc, message);
}

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

  it("必須の欄は空白だけでも未入力で、直す欄へ飛べる", () => {
    const doc = { ...validCast(), name: " ", persona: "\n", tagline: "　" };
    expect(validateCast(doc)).toEqual([
      {
        level: "error",
        tab: "character",
        message: "名前を入力してください。",
        path: ["cast", "name"],
      },
      {
        level: "error",
        tab: "character",
        message: "性格・設定を入力してください。",
        path: ["cast", "persona"],
      },
      {
        level: "error",
        tab: "experience",
        message: "キャッチコピーを入力してください。",
        path: ["cast", "tagline"],
      },
    ]);
  });

  it("名前の欄は UTF-16 で数える（絵文字は 2 字）", () => {
    const doc = validCast();
    doc.name = "🌙".repeat(5);
    expect(messages(doc)).toEqual([]);
    doc.name = "🌙".repeat(6);
    expect(messages(doc)).toContain("名前は10文字までです。");
  });

  it("名前・キャッチコピー・いまの状況・このキャストについて・一言セリフの上限", () => {
    expect(
      overLimit((doc, value) => void (doc.name = value), 10, "名前は10文字までです。"),
    ).toMatchObject({ level: "error", tab: "character", path: ["cast", "name"] });
    expect(
      overLimit((doc, value) => void (doc.tagline = value), 40, "キャッチコピーは40文字までです。"),
    ).toMatchObject({ level: "error", tab: "experience", path: ["cast", "tagline"] });
    expect(
      overLimit(
        (doc, value) => void (doc.situation = value),
        20000,
        "いまの状況は20,000文字までです。",
      ),
    ).toMatchObject({ level: "error", tab: "experience", path: ["cast", "situation"] });
    expect(
      overLimit(
        (doc, value) => void (doc.aboutText = value),
        3000,
        "このキャストについては3000文字までです。",
      ),
    ).toMatchObject({ level: "error", tab: "experience", path: ["cast", "aboutText"] });
    expect(
      overLimit((doc, value) => void (doc.hook = value), 40, "一言セリフは40文字までです。"),
    ).toMatchObject({ level: "error", tab: "publish", path: ["cast", "hook"] });
  });

  it("雑談モードでは、キャッチコピー・いまの状況・一言セリフを確かめない（Zetter は送らない）", () => {
    const doc = {
      ...validCast(),
      mode: "chat" as const,
      tagline: "あ".repeat(41),
      situation: "あ".repeat(20001),
      hook: "あ".repeat(41),
    };
    expect(validateCast(doc)).toEqual([]);
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

  it("キャラクター設定の合計は送られる分（前後の空白を除いた値）で確かめる。画面のカウンタは入力中の値を数える", () => {
    const doc = validCast();
    doc.persona = `${"あ".repeat(20000)}\n\n `;
    expect(messages(doc)).toEqual([]);
    expect(settingsUsage(doc)).toEqual({ total: 20003, remaining: 0, over: 3 });
    // 空白のあとに字があれば、その空白も送られるので数に入る
    expect(messages({ ...doc, persona: `${doc.persona}あ` })).toContain(
      "キャラクター設定（本人の性格・設定と登場人物のプロフィール）は合わせて20,000字までです。いまは20,004字で、4字ぶん超えています。誰の設定を削るかはお任せします（「いまの状況」は別枠です）。",
    );
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

  it("口調サンプルの合計も、前後の空白を除いた値で確かめる", () => {
    const doc = validCast();
    doc.toneExamples = [
      { situation: "あ".repeat(250), example: "い".repeat(3500) },
      { situation: "う".repeat(250), example: "え".repeat(3500) },
      { situation: `${"お".repeat(248)}  `, example: "か".repeat(2252) },
    ];
    expect(messages(doc)).toEqual([]);
    expect(toneUsage(doc)).toEqual({ total: 10002, remaining: 0, over: 2 });
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

  it("名前のない登場人物のエラーは、最初のその人の名前の欄へ飛べる", () => {
    const doc = validCast();
    const named = { ...createEmptyMember(), name: "葵" };
    const unnamed = { ...createEmptyMember(), profile: "妹" };
    doc.members = [named, unnamed, { ...createEmptyMember(), profile: "弟" }];
    expect(validateCast(doc).filter((issue) => issue.message.startsWith("登場人物の名前"))).toEqual(
      [
        {
          level: "error",
          tab: "character",
          message: "登場人物の名前を入力してください。",
          path: ["members", unnamed.id, "name"],
        },
      ],
    );
  });

  it("登場人物は 9 人（本人を含めて 10 人）まで。雑談モードでは数えない", () => {
    const doc = validCast();
    doc.members = Array.from({ length: 9 }, (_, index) => ({
      ...createEmptyMember(),
      name: `人${index}`,
    }));
    expect(messages(doc)).toEqual([]);
    doc.members.push({ ...createEmptyMember(), name: "十人目" });
    expect(issueOf(doc, "登場人物は本人を含めて10人までです。")).toEqual({
      level: "error",
      tab: "character",
      message: "登場人物は本人を含めて10人までです。",
    });
    doc.mode = "chat";
    expect(messages(doc)).toEqual([]);
  });

  it("登場人物の名前は 10 字まで", () => {
    const doc = validCast();
    const member = { ...createEmptyMember(), name: "あ".repeat(10) };
    doc.members = [member];
    expect(messages(doc)).toEqual([]);
    member.name = "あ".repeat(11);
    expect(issueOf(doc, `登場人物「${member.name}」の名前は10文字までです。`)).toMatchObject({
      level: "error",
      tab: "character",
      path: ["members", member.id, "name"],
    });
  });

  it("口調サンプルは 1 人 10 件まで。超えた最初の行へ飛べる", () => {
    const doc = validCast();
    doc.toneExamples = Array.from({ length: 10 }, () => ({ situation: "朝", example: "おはよう" }));
    expect(messages(doc)).toEqual([]);
    doc.toneExamples.push({ situation: "夜", example: "おやすみ" });
    expect(issueOf(doc, "本人の口調サンプルは10件までです。")).toMatchObject({
      level: "error",
      path: ["cast", "toneExamples", 10, "situation"],
    });
  });

  it("口調サンプルの状況は 250 字、発話例は 3500 字まで（UTF-16 で数える）", () => {
    const doc = validCast();
    doc.toneExamples = [{ situation: "🌙".repeat(125), example: "例".repeat(3500) }];
    expect(messages(doc)).toEqual([]);
    doc.toneExamples = [{ situation: "🌙".repeat(126), example: "例".repeat(3501) }];
    expect(validateCast(doc)).toEqual(
      expect.arrayContaining([
        {
          level: "error",
          tab: "character",
          message: "本人の口調サンプル1の状況は250文字までです。",
          path: ["cast", "toneExamples", 0, "situation"],
        },
        {
          level: "error",
          tab: "character",
          message: "本人の口調サンプル1の発話例は3500文字までです。",
          path: ["cast", "toneExamples", 0, "example"],
        },
      ]),
    );
  });

  it("片方だけの口調サンプルは、空の欄へ飛べる警告。登場人物の行は名前で呼ぶ", () => {
    const doc = validCast();
    const member = {
      ...createEmptyMember(),
      name: " 葵 ",
      toneExamples: [{ situation: "", example: "おはよう" }],
    };
    doc.members = [member];
    doc.toneExamples = [{ situation: "雨の日", example: " " }];
    expect(
      issueOf(
        doc,
        "本人の口調サンプル1は状況と発話例の片方が空なので、Zetter では保存されません。",
      ),
    ).toMatchObject({ level: "warning", path: ["cast", "toneExamples", 0, "example"] });
    expect(
      issueOf(
        doc,
        "「葵」の口調サンプル1は状況と発話例の片方が空なので、Zetter では保存されません。",
      ),
    ).toMatchObject({
      level: "warning",
      path: ["members", member.id, "toneExamples", 0, "situation"],
    });
  });

  it("パートナー設定は 1 人 5 欄の合計 5,000 字まで（コードポイントで数える）", () => {
    const doc = validCast();
    doc.partnerSettings.freeform = "🌙".repeat(5000);
    expect(messages(doc)).toEqual([]);
    doc.partnerSettings.dailyRoutine = "朝";
    expect(issueOf(doc, "本人のパートナー設定は合計5,000字までです（いまは5,001字）。")).toEqual({
      level: "error",
      tab: "character",
      message: "本人のパートナー設定は合計5,000字までです（いまは5,001字）。",
      path: ["cast", "partnerSettings", "dailyRoutine"],
    });
    const member = { ...createEmptyMember(), profile: "妹" };
    member.partnerSettings.messageHabits = "あ".repeat(5001);
    doc.members = [member];
    expect(
      issueOf(doc, "名前のない登場人物のパートナー設定は合計5,000字までです（いまは5,001字）。"),
    ).toMatchObject({ path: ["members", member.id, "partnerSettings", "dailyRoutine"] });
  });

  it("名前も性格・設定もなく、パートナー設定だけ書いた登場人物は警告（Zetter は送らない）", () => {
    const doc = validCast();
    const member = createEmptyMember();
    member.partnerSettings.freeform = "毎朝連絡する";
    doc.members = [member];
    expect(validateCast(doc)).toEqual([
      {
        level: "warning",
        tab: "character",
        message:
          "名前も性格・設定もない登場人物は、パートナー設定だけ書いても Zetter では保存されません。",
        path: ["members", member.id, "name"],
      },
    ]);
    doc.mode = "chat";
    expect(validateCast(doc)).toEqual([]);
  });

  it("名前のないペルソナは保存されない（遊ぶ人の名前を使うなら保存される）", () => {
    const doc = validCast();
    doc.recommendedPersonas = [{ ...createEmptyPersona(), note: "設定だけ" }];
    expect(messages(doc).some((message) => message.includes("名前が空なので"))).toBe(true);
    doc.recommendedPersonas = [{ ...createEmptyPersona(), useViewerName: true }];
    expect(messages(doc)).toEqual([]);
  });

  it("この会話でのあなたは 5 件まで、名前 20・紹介文 50・キャストに伝わるもの 2000 字まで", () => {
    const doc = validCast();
    const persona = {
      ...createEmptyPersona(),
      name: "あ".repeat(20),
      tagline: "あ".repeat(50),
      note: "あ".repeat(2000),
    };
    doc.recommendedPersonas = [persona];
    expect(messages(doc)).toEqual([]);
    Object.assign(persona, {
      name: "あ".repeat(21),
      tagline: "あ".repeat(51),
      note: "あ".repeat(2001),
    });
    expect(validateCast(doc).map((issue) => [issue.tab, issue.message, issue.path])).toEqual([
      [
        "experience",
        "この会話でのあなた1の名前は20文字までです。",
        ["personas", persona.id, "name"],
      ],
      [
        "experience",
        "この会話でのあなた1の紹介文は50文字までです。",
        ["personas", persona.id, "tagline"],
      ],
      [
        "experience",
        "この会話でのあなた1のキャストに伝わるものは2000文字までです。",
        ["personas", persona.id, "note"],
      ],
    ]);
    // 「遊ぶ人の名前を使う」なら、名前の欄は使わない
    persona.useViewerName = true;
    expect(messages(doc)).not.toContain("この会話でのあなた1の名前は20文字までです。");
    doc.recommendedPersonas = Array.from({ length: 6 }, () => ({
      ...createEmptyPersona(),
      name: "アキ",
    }));
    expect(issueOf(doc, "この会話でのあなたは5件までです。")).toEqual({
      level: "error",
      tab: "experience",
      message: "この会話でのあなたは5件までです。",
    });
  });

  it("空のイントロのパートと空のタグは警告", () => {
    const doc = validCast();
    doc.introScript = [{ kind: "narration", text: " ", speakerId: null }];
    doc.tags = ["", "古書店"];
    const result = validateCast(doc);
    expect(result.filter((issue) => issue.level === "warning")).toHaveLength(2);
  });

  it("イントロは 12 パート、1 パート 4000 字まで", () => {
    const doc = validCast();
    const part = (text: string) => ({ kind: "narration" as const, text, speakerId: null });
    doc.introScript = Array.from({ length: 12 }, () => part("雨"));
    doc.introScript[1] = part("あ".repeat(4000));
    expect(messages(doc)).toEqual([]);
    doc.introScript.push(part("雨"));
    doc.introScript[1] = part("あ".repeat(4001));
    expect(issueOf(doc, "イントロは12パートまでです。")).toEqual({
      level: "error",
      tab: "experience",
      message: "イントロは12パートまでです。",
    });
    expect(issueOf(doc, "イントロのパート2は4000文字までです。")).toMatchObject({
      level: "error",
      path: ["intro", 1, "text"],
    });
  });

  it("イントロは全部のパートを合わせて 12,000 字まで。合計が上限を超えるパートへ飛べる", () => {
    const part = (text: string) => ({ kind: "narration" as const, text, speakerId: null });
    const doc = validCast();
    doc.introScript = [part("あ".repeat(4000)), part("あ".repeat(4000)), part("あ".repeat(4000))];
    expect(messages(doc)).toEqual([]);
    doc.introScript.push(part("雨"), part("雨"));
    expect(validateCast(doc)).toEqual([
      {
        level: "error",
        tab: "experience",
        message:
          "イントロは全部のパートを合わせて12,000字までです。いまは12,002字で、2字ぶん超えています。どのパートを削るかはお任せします。",
        path: ["intro", 3, "text"],
      },
    ]);
    expect(introUsage(doc)).toEqual({ total: 12002, remaining: 0, over: 2, crossing: 3 });
  });

  it("イントロの合計は送られる分（前後の空白を除いた、空でないパート）で数える", () => {
    const part = (text: string) => ({ kind: "speech" as const, text, speakerId: null });
    const doc = validCast();
    doc.introScript = [
      part(`  ${"あ".repeat(4000)}\n`),
      part(" \n　"),
      part("🌙".repeat(2000)),
      part(`${"あ".repeat(4000)}　`),
    ];
    expect(introUsage(doc)).toEqual({ total: 12000, remaining: 0, over: 0, crossing: null });
    expect(messages(doc).filter((message) => message.startsWith("イントロは全部"))).toEqual([]);
    // 絵文字は UTF-16 で 2 字に数える
    (doc.introScript[2] as { text: string }).text = `${"🌙".repeat(2000)}a`;
    expect(introUsage(doc)).toMatchObject({ total: 12001, crossing: 3 });
  });

  it("雑談モードでは、イントロの合計を確かめない（Zetter へは最初のひとことしか写さない）", () => {
    const part = (text: string) => ({ kind: "speech" as const, text, speakerId: null });
    const doc = {
      ...validCast(),
      mode: "chat" as const,
      introScript: Array.from({ length: 4 }, () => part("あ".repeat(4000))),
    };
    expect(messages(doc).filter((message) => message.startsWith("イントロは全部"))).toEqual([]);
  });

  it("遊び方シートは欄ごとの上限まで（UTF-16 で数える）。直す欄へ飛べる", () => {
    const fields = [
      ["summary", "あらすじ", 400],
      ["world", "世界観", 600],
      ["role", "あなたの役割", 200],
      ["start", "始まりの状況", 300],
      ["first", "最初にできること（1行に1つ）", 300],
      ["hint", "迷ったときのヒント", 400],
      ["gimmick", "隠しギミック", 400],
    ] as const;
    for (const [key, label, max] of fields) {
      const message = `遊び方シートの「${label}」は${max}文字までです。`;
      expect(
        overLimit((doc, value) => void (doc.playGuide[key].text = value), max, message),
      ).toEqual({ level: "error", tab: "experience", message, path: ["playGuide", key, "text"] });
    }
    const doc = validCast();
    doc.playGuide.role.text = "🌙".repeat(100);
    expect(messages(doc)).toEqual([]);
    doc.playGuide.role.text = `${"🌙".repeat(100)}a`;
    expect(messages(doc)).toEqual(["遊び方シートの「あなたの役割」は200文字までです。"]);
  });

  it("遊び方シートは前後の空白も数え、どちらのモードでも確かめる（Zetter は切らずに、どちらのモードでも送る）", () => {
    const message = "遊び方シートの「あらすじ」は400文字までです。";
    const story = validCast();
    story.playGuide.summary.text = ` ${"あ".repeat(400)}`;
    expect(messages(story)).toEqual([message]);
    const chat = { ...validCast(), mode: "chat" as const };
    chat.playGuide.summary.text = `${"あ".repeat(400)}\n`;
    expect(messages(chat)).toEqual([message]);
  });

  it("空のパートの警告は数を出し、最初の空のパートへ飛べる。雑談モードの 1 つ目は「最初のひとこと」の欄", () => {
    const part = (text: string) => ({ kind: "speech" as const, text, speakerId: null });
    const story = { ...validCast(), introScript: [part("雨"), part(" "), part("\n")] };
    expect(
      issueOf(story, "中身が空のイントロのパートが2件あります。Zetter では保存されません。"),
    ).toMatchObject({ level: "warning", path: ["intro", 1, "text"] });
    const chat = {
      ...validCast(),
      mode: "chat" as const,
      introScript: [part("あ".repeat(4001)), part("")],
    };
    expect(issueOf(chat, "イントロのパート1は4000文字までです。")?.path).toEqual([
      "intro",
      "first",
      "text",
    ]);
    expect(
      issueOf(chat, "中身が空のイントロのパートが1件あります。Zetter では保存されません。")?.path,
    ).toEqual(["intro", 1, "text"]);
    expect(
      issueOf(
        { ...chat, introScript: [part("")] },
        "中身が空のイントロのパートが1件あります。Zetter では保存されません。",
      )?.path,
    ).toEqual(["intro", "first", "text"]);
  });

  it("設定集は 10 冊、タグは 5 個・各 20 字、ギャラリーは 10 枚まで", () => {
    const doc = validCast();
    doc.lorebooks = Array.from({ length: 10 }, (_, index) => ({
      id: `book-${index}`,
      title: "",
      note: "",
    }));
    doc.tags = ["あ".repeat(20), "b", "c", "d", "e"];
    doc.gallery = Array.from({ length: 10 }, (_, index) => ({
      id: `g${index}`,
      file: `images/gallery-${index + 1}.jpg`,
      width: 1,
      height: 1,
      bytes: 1,
      blurred: false,
    }));
    expect(messages(doc)).toEqual([]);
    doc.lorebooks.push({ id: "book-10", title: "", note: "" });
    doc.tags = ["あ".repeat(21), "b", "c", "d", "e", "f"];
    doc.gallery.push({
      id: "g10",
      file: "images/gallery-11.jpg",
      width: 1,
      height: 1,
      bytes: 1,
      blurred: false,
    });
    expect(
      validateCast(doc).map((issue) => [issue.level, issue.tab, issue.message, issue.path ?? null]),
    ).toEqual([
      ["error", "lorebook", "連動できる設定集は10冊までです。", null],
      ["error", "publish", "タグは5個までです。", null],
      ["error", "publish", "タグ1は20文字までです。", ["tags", 0]],
      ["error", "publish", "ギャラリー画像は10枚まで登録できます。", null],
    ]);
  });

  it("空のタグは、数を出して最初の空のタグへ飛べる警告", () => {
    const doc = { ...validCast(), tags: ["古書店", " ", "", "雨"] };
    expect(validateCast(doc)).toEqual([
      {
        level: "warning",
        tab: "publish",
        message: "空のタグが2個あります。Zetter では保存されません。",
        path: ["tags", 1],
      },
    ]);
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

  it("話者の注意は、送られる登場人物と中身のあるセリフがあるときだけ", () => {
    const doc = validCast();
    const infos = () => validateCast(doc).filter((issue) => issue.level === "info");
    doc.introScript = [
      { kind: "narration", text: "雨", speakerId: null },
      { kind: "speech", text: " ", speakerId: null },
    ];
    doc.members = [{ ...createEmptyMember(), name: "葵" }];
    expect(infos()).toEqual([]);
    doc.introScript[1]!.text = "いらっしゃい。";
    doc.members = [createEmptyMember()];
    expect(infos()).toEqual([]);
    doc.members = [{ ...createEmptyMember(), name: "葵" }];
    expect(infos()).toEqual([
      {
        level: "info",
        tab: "experience",
        message:
          "Zetter では、登場人物がいるキャストのセリフのパートは、話者（本体を含む）を1つずつ選ばないと完成できません。",
      },
    ]);
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

  it("好感度のエラーは設定ごとに飛べる。名前のない登場人物は「登場人物」と呼び、送られない人は確かめない", () => {
    const doc = validCast();
    const unnamed = { ...createEmptyMember(), profile: "妹" };
    const empty = createEmptyMember();
    const broken = createDefaultAffinityConfig();
    broken.maxValue = -1;
    doc.members = [unnamed, empty];
    doc.affinity = {
      default: broken,
      overrides: { [unnamed.id]: broken, [empty.id]: broken },
    };
    const range = "好感度の範囲は整数で、最小値より最大値を大きくしてください。";
    expect(validateCast(doc).filter((issue) => issue.tab === "affinity")).toEqual([
      { level: "error", tab: "affinity", message: range, path: ["affinity", "default"] },
      {
        level: "error",
        tab: "affinity",
        message: `登場人物の個別設定: ${range}`,
        path: ["affinity", unnamed.id],
      },
    ]);
  });

  it("雑談モードの好感度のエラーには、雑談モードでは効かないことを添える", () => {
    const doc = { ...validCast(), mode: "chat" as const };
    const broken = createDefaultAffinityConfig();
    broken.itemName = " ";
    doc.affinity = {
      default: createDefaultAffinityConfig(),
      overrides: { [AFFINITY_BASE_SUBJECT]: broken },
    };
    expect(validateCast(doc)).toEqual([
      {
        level: "error",
        tab: "affinity",
        message:
          "本体の個別設定: 項目名は1～20文字で入力してください。（雑談モードでは効きません）",
        path: ["affinity", AFFINITY_BASE_SUBJECT],
      },
    ]);
  });
});

describe("missingRequired", () => {
  it("タブの「未入力」は Zetter の作成画面（castCreateRequiredUiState）と同じ条件", () => {
    const doc = validCast();
    expect(missingRequired(doc)).toEqual({ character: false, experience: false });
    expect(missingRequired({ ...doc, name: " " }).character).toBe(true);
    expect(missingRequired({ ...doc, persona: "\n" }).character).toBe(true);
    expect(missingRequired({ ...doc, tagline: "　" }).experience).toBe(true);
    expect(missingRequired({ ...doc, mode: "chat", tagline: "" }).experience).toBe(false);
    // 何も書いていない登場人物は送られないので、名前がなくてもよい
    expect(missingRequired({ ...doc, members: [createEmptyMember()] }).character).toBe(false);
    // 雑談モードでは登場人物を送らないので、名前のない登場人物が残っていてもよい
    const unnamed = { ...createEmptyMember(), profile: "妹" };
    expect(missingRequired({ ...doc, members: [unnamed] }).character).toBe(true);
    expect(missingRequired({ ...doc, mode: "chat", members: [unnamed] }).character).toBe(false);
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

  it("項目名は前後の空白を除いて数える", () => {
    const config = createDefaultAffinityConfig();
    config.itemName = `  ${"あ".repeat(20)}　`;
    expect(validateAffinityConfig(config)).toBe("");
    config.itemName = "　";
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
    [
      (c: ReturnType<typeof createDefaultAffinityConfig>) => void (c.minValue = 2.5),
      "好感度の範囲は整数で、最小値より最大値を大きくしてください。",
    ],
    [
      (c: ReturnType<typeof createDefaultAffinityConfig>) => void (c.initialValue = null),
      "初期値は範囲内の整数にしてください。",
    ],
    [
      (c: ReturnType<typeof createDefaultAffinityConfig>) => void (c.initialValue = -1),
      "初期値は範囲内の整数にしてください。",
    ],
    [
      (c: ReturnType<typeof createDefaultAffinityConfig>) => void (c.pace = "fast" as "normal"),
      "変化の速さを選択してください。",
    ],
    [
      (c: ReturnType<typeof createDefaultAffinityConfig>) =>
        void (c.stages = Array.from({ length: 11 }, (_, index) => ({
          ...createEmptyStage(index * 5),
          freeText: "態度",
        }))),
      "段階は1～10段階にしてください。",
    ],
    [
      (c: ReturnType<typeof createDefaultAffinityConfig>) => void (c.stages[3]!.startValue = null),
      "段階の開始値は範囲内の整数にしてください。",
    ],
    [
      (c: ReturnType<typeof createDefaultAffinityConfig>) => void (c.stages[3]!.startValue = 75.5),
      "段階の開始値は範囲内の整数にしてください。",
    ],
  ])("規則ごとの文言 %#", (breakIt, expected) => {
    const config = createDefaultAffinityConfig();
    breakIt(config);
    expect(validateAffinityConfig(config)).toBe(expected);
  });

  it("10 段階ちょうど、開始値が最大値ちょうどの段階は通る", () => {
    const config = createDefaultAffinityConfig();
    config.stages = Array.from({ length: 10 }, (_, index) => ({
      ...createEmptyStage(index === 9 ? 100 : index * 10),
      callText: "名前",
    }));
    expect(validateAffinityConfig(config)).toBe("");
  });

  it("1 つの段階で規則が重なるときは、Zetter と同じ順で最初の 1 つを返す", () => {
    const config = createDefaultAffinityConfig();
    // 重複していて、態度文もない
    config.stages[1] = createEmptyStage(0);
    expect(validateAffinityConfig(config)).toBe(
      "段階の開始値が重複しています。段階ごとに異なる値を入力してください。",
    );
    // 範囲の外で、6 欄の合計も超えている
    config.stages[1] = { ...createEmptyStage(200), freeText: "あ".repeat(1001) };
    expect(validateAffinityConfig(config)).toBe("段階の開始値は範囲内の整数にしてください。");
  });

  it("6 欄の合計はコードポイントで数える", () => {
    const stage = { ...createDefaultAffinityConfig().stages[0]!, freeText: "🌙".repeat(1000) };
    expect(affinityStageTextLength(stage)).toBe(1000);
  });

  it("6 欄の合計は、すべての欄を足す", () => {
    const stage = {
      startValue: 0,
      callText: "あ",
      speechText: "いい",
      distanceText: "🌙",
      agencyText: "\n",
      avoidText: "う",
      freeText: "えお",
    };
    expect(affinityStageTextLength(stage)).toBe(8);
  });

  it("重複している段階を見つける", () => {
    const config = createDefaultAffinityConfig();
    config.stages[2]!.startValue = 25;
    expect([...duplicateStageIndexes(config)]).toEqual([1, 2]);
  });

  it("未入力の段階は重なりに数えず、3 つ以上重なればすべて返す", () => {
    const config = createDefaultAffinityConfig();
    config.stages = [0, null, null, 25, 25, 25].map((value) => createEmptyStage(value));
    expect([...duplicateStageIndexes(config)].sort()).toEqual([3, 4, 5]);
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

  it("5 欄の合計は、すべての欄を足す", () => {
    expect(
      partnerSettingsLength({
        dailyRoutine: "朝",
        messageHabits: "🌙🌙",
        proactiveMessages: "",
        distanceWhenApart: "\n",
        freeform: "自由に",
      }),
    ).toBe(7);
  });

  it("消すときと、上限より短く書き換えるときは切り詰めない", () => {
    const settings = { ...createEmptyPartnerSettings(), dailyRoutine: "あ".repeat(5000) };
    expect(limitPartnerSettingsValue(settings, "dailyRoutine", "あ".repeat(4000))).toBe(
      "あ".repeat(4000),
    );
    expect(limitPartnerSettingsValue(settings, "dailyRoutine", "")).toBe("");
    const small = { ...createEmptyPartnerSettings(), freeform: "あいう" };
    expect(limitPartnerSettingsValue(small, "freeform", "あXう")).toBe("あXう");
  });

  it("ほかの欄だけで上限を超えているときは、足した分を入れず、元の文字は残す", () => {
    const settings = {
      ...createEmptyPartnerSettings(),
      freeform: "あ".repeat(5001),
      dailyRoutine: "朝起きる",
    };
    expect(limitPartnerSettingsValue(settings, "dailyRoutine", "朝早く起きる")).toBe("朝起きる");
  });
});
