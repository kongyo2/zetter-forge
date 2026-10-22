import {
  AFFINITY_BASE_SUBJECT,
  AFFINITY_PACES,
  AFFINITY_STAGE_FIELDS,
  CAST_FILE_FORMAT,
  CAST_FILE_VERSION,
  CastFormatError,
  PARTNER_HABIT_CHIPS,
  PARTNER_SETTINGS_FIELDS,
  PARTNER_TIME_CHIPS,
  castDisplayTitle,
  createDefaultAffinityConfig,
  createEmptyCast,
  createEmptyMember,
  createEmptyPartnerSettings,
  createEmptyPersona,
  createEmptyStage,
  normalizeAffinityConfig,
  normalizeCastDocument,
  removeMember,
  sendableMembers,
  sortAffinityStages,
} from "@shared/cast";
import { describe, expect, it } from "vitest";

describe("createEmptyCast", () => {
  it("Zetter の新規作成と同じ既定値で始まる", () => {
    const doc = createEmptyCast();
    expect(doc).toMatchObject({
      format: CAST_FILE_FORMAT,
      mode: "story",
      status: "private",
      personaHidden: true,
      toneExamplesHidden: true,
      situationHidden: true,
      authorHidden: false,
      avatarBlurred: false,
      coverBlurred: false,
      showFavoriteCount: true,
      showTalkCount: true,
      affinity: null,
      introScript: [],
      tags: [],
    });
    expect(doc.partnerSettings).toEqual({
      dailyRoutine: "",
      messageHabits: "",
      proactiveMessages: "",
      distanceWhenApart: "",
      freeform: "",
    });
  });

  it("文字の欄・並び・画像は空で、作った日時と更新日時は同じ", () => {
    const now = new Date("2026-10-23T05:00:00.000Z");
    const doc = createEmptyCast(now);
    expect(doc).toMatchObject({
      formatVersion: CAST_FILE_VERSION,
      createdAt: "2026-10-23T05:00:00.000Z",
      updatedAt: "2026-10-23T05:00:00.000Z",
      name: "",
      persona: "",
      tagline: "",
      situation: "",
      aboutText: "",
      hook: "",
      zetterUrl: "",
      memo: "",
      avatar: null,
      cover: null,
      background: null,
      members: [],
      toneExamples: [],
      recommendedPersonas: [],
      lorebooks: [],
      gallery: [],
    });
    expect(createEmptyCast().id).not.toBe(createEmptyCast().id);
  });

  it("好感度のひな形は 0・25・50・75 の 4 段階", () => {
    const config = createDefaultAffinityConfig();
    expect(config.itemName).toBe("好感度");
    expect(config.stages.map((stage) => stage.startValue)).toEqual([0, 25, 50, 75]);
    expect(config.stages[0]?.freeText).toBe("まだ距離を測っている。丁寧だが慎重に接する。");
  });

  it("好感度のひな形は Zetter の createDefaultCastAffinityConfig と同じ値", () => {
    expect(createDefaultAffinityConfig()).toEqual({
      itemName: "好感度",
      minValue: 0,
      maxValue: 100,
      initialValue: 0,
      pace: "normal",
      showInChat: true,
      enabled: true,
      stages: [
        { ...createEmptyStage(0), freeText: "まだ距離を測っている。丁寧だが慎重に接する。" },
        { ...createEmptyStage(25), freeText: "少し打ち解け、相手に興味を示す。" },
        { ...createEmptyStage(50), freeText: "信頼を見せ、気持ちを少し言葉にする。" },
        { ...createEmptyStage(75), freeText: "親しく接するが、相手の意思と距離感を尊重する。" },
      ],
    });
  });

  it("登場人物・ペルソナ・段階のひな形は空で、id は 1 つずつ違う", () => {
    const member = createEmptyMember();
    expect(member).toEqual({
      id: expect.any(String),
      name: "",
      profile: "",
      toneExamples: [],
      partnerSettings: createEmptyPartnerSettings(),
      avatar: null,
    });
    expect(createEmptyMember().id).not.toBe(member.id);
    expect(createEmptyPersona()).toEqual({
      id: expect.any(String),
      name: "",
      useViewerName: false,
      tagline: "",
      note: "",
      avatar: null,
    });
    expect(createEmptyStage(null)).toEqual({
      startValue: null,
      callText: "",
      speechText: "",
      distanceText: "",
      agencyText: "",
      avoidText: "",
      freeText: "",
    });
  });
});

describe("Zetter の作成画面と同じ欄と札", () => {
  it("パートナー設定の 5 欄の見出しと例文", () => {
    expect(
      PARTNER_SETTINGS_FIELDS.map((field) => [field.key, field.label, field.placeholder]),
    ).toEqual([
      [
        "dailyRoutine",
        "ふだんの1日",
        "朝は7時ごろ起きて、コーヒーを淹れてから仕事へ。昼は外で済ませることが多い。夜は23時ごろまで本を読んでいる…",
      ],
      [
        "messageHabits",
        "メッセージの癖",
        "返事はわりと早いけど、一言だけのことが多い。絵文字はほとんど使わない…",
      ],
      [
        "proactiveMessages",
        "自分から送ること",
        "朝に天気の話をすることがある。きれいな景色を見つけたら写真の話をしたがる…",
      ],
      [
        "distanceWhenApart",
        "離れているときの距離感",
        "会えない日は少しそっけないふりをするけど、本当は返事を待っている…",
      ],
      ["freeform", "自由に", "そのほか、DMでのこのキャラについて自由に。"],
    ]);
  });

  it("「ふだんの1日」の時間帯の札と、「メッセージの癖」の札", () => {
    expect([...PARTNER_TIME_CHIPS]).toEqual(["朝", "昼", "夕方", "夜", "深夜"]);
    expect([...PARTNER_HABIT_CHIPS]).toEqual([
      "返事が早い",
      "気まぐれに返す",
      "一言で返す",
      "絵文字を使う",
      "絵文字は使わない",
    ]);
  });

  it("好感度の段階の 6 欄・変化の速さ・本体の個別設定のキー", () => {
    expect(AFFINITY_STAGE_FIELDS.map((field) => [field.key, field.label, field.multiline])).toEqual(
      [
        ["callText", "呼び方", false],
        ["speechText", "話し方", true],
        ["distanceText", "距離感", true],
        ["agencyText", "主体性", true],
        ["avoidText", "避けること", true],
        ["freeText", "自由記述", true],
      ],
    );
    expect(AFFINITY_PACES).toEqual([
      { value: "gentle", label: "緩やか" },
      { value: "normal", label: "普通" },
      { value: "rapid", label: "急接近" },
    ]);
    expect(AFFINITY_BASE_SUBJECT).toBe("__cast_base__");
  });
});

describe("normalizeCastDocument", () => {
  it("キャストのファイルでなければ CastFormatError", () => {
    expect(() => normalizeCastDocument({ name: "x" })).toThrow(CastFormatError);
    expect(() => normalizeCastDocument(null)).toThrow(CastFormatError);
  });

  it("欠けた値を既定値で埋める", () => {
    const doc = normalizeCastDocument({ format: CAST_FILE_FORMAT, name: "灯" });
    expect(doc.name).toBe("灯");
    expect(doc.personaHidden).toBe(true);
    expect(doc.mode).toBe("story");
    expect(doc.members).toEqual([]);
  });

  it("モードと公開状態は、決まった値のほかは既定（ストーリー・非公開）にする", () => {
    const read = (mode: unknown, status: unknown) => {
      const doc = normalizeCastDocument({ format: CAST_FILE_FORMAT, mode, status });
      return [doc.mode, doc.status];
    };
    expect(read("chat", "public")).toEqual(["chat", "public"]);
    expect(read("CHAT", "Public")).toEqual(["story", "private"]);
    expect(read(null, 1)).toEqual(["story", "private"]);
  });

  it("オン・オフは真偽値のときだけ使い、ほかは既定値にする", () => {
    const doc = normalizeCastDocument({
      format: CAST_FILE_FORMAT,
      personaHidden: false,
      authorHidden: "true",
      showTalkCount: 0,
      avatarBlurred: true,
    });
    expect(doc).toMatchObject({
      personaHidden: false,
      authorHidden: false,
      showTalkCount: true,
      avatarBlurred: true,
    });
  });

  it("版は整数のときだけ使い、id と日時が欠けていれば作る", () => {
    const doc = normalizeCastDocument({ format: CAST_FILE_FORMAT, formatVersion: 2, id: "" });
    expect(doc.formatVersion).toBe(2);
    expect(doc.id).toMatch(/^[0-9a-f-]{36}$/u);
    expect(Date.parse(doc.createdAt)).not.toBeNaN();
    expect(doc.updatedAt).toBe(doc.createdAt);
    for (const formatVersion of [1.5, "2", null]) {
      expect(normalizeCastDocument({ format: CAST_FILE_FORMAT, formatVersion }).formatVersion).toBe(
        CAST_FILE_VERSION,
      );
    }
  });

  it("文字でない値は空にし、並びでないものは空の並びにする（タグは文字だけ残す）", () => {
    const doc = normalizeCastDocument({
      format: CAST_FILE_FORMAT,
      name: 1,
      persona: null,
      members: "x",
      toneExamples: {},
      introScript: 3,
      tags: ["古書店", 3, null, "雨"],
    });
    expect(doc).toMatchObject({ name: "", persona: "", members: [], toneExamples: [] });
    expect(doc.introScript).toEqual([]);
    expect(doc.tags).toEqual(["古書店", "雨"]);
  });

  it("知らないキーを上の階層でも中の階層でも残す", () => {
    const raw = {
      ...createEmptyCast(),
      futureField: { a: 1 },
      members: [{ ...createEmptyMember(), name: "葵", futureMemberField: "keep" }],
      affinity: {
        default: { ...createDefaultAffinityConfig(), futureConfigField: true },
        overrides: {},
        futureAffinityField: 3,
      },
    };
    const doc = normalizeCastDocument(JSON.parse(JSON.stringify(raw)));
    expect((doc as unknown as Record<string, unknown>).futureField).toEqual({ a: 1 });
    expect((doc.members[0] as unknown as Record<string, unknown>).futureMemberField).toBe("keep");
    const affinity = doc.affinity as unknown as Record<string, unknown> & {
      default: Record<string, unknown>;
    };
    expect(affinity.default.futureConfigField).toBe(true);
    expect(affinity.futureAffinityField).toBe(3);
  });

  it("保存前の画像はふつうは外し、指定すれば残す", () => {
    const raw = {
      ...createEmptyCast(),
      avatar: { file: "pending:abc", width: 400, height: 400, bytes: 10 },
      gallery: [{ file: "pending:def", width: 1, height: 1, bytes: 1, id: "g", blurred: false }],
    };
    expect(normalizeCastDocument(raw).avatar).toBeNull();
    expect(normalizeCastDocument(raw).gallery).toEqual([]);
    const kept = normalizeCastDocument(raw, { keepPendingImages: true });
    expect(kept.avatar?.file).toBe("pending:abc");
    expect(kept.gallery).toHaveLength(1);
  });

  it("画像は file のある記録だけを残し、大きさが数でなければ 0 にする", () => {
    const doc = normalizeCastDocument({
      format: CAST_FILE_FORMAT,
      avatar: {
        file: "images/avatar.jpg",
        width: "400",
        height: 400,
        bytes: Number.NaN,
        crop: "keep",
      },
      cover: { file: "" },
      background: "images/background.jpg",
      gallery: [
        { file: "images/gallery-01.jpg", width: 1, height: 1, bytes: 1 },
        { file: "images/gallery-02.jpg", id: "g2", blurred: true },
        null,
        { id: "no-file" },
      ],
    });
    expect(doc.avatar).toEqual({
      file: "images/avatar.jpg",
      width: 0,
      height: 400,
      bytes: 0,
      crop: "keep",
    });
    expect(doc.cover).toBeNull();
    expect(doc.background).toBeNull();
    expect(doc.gallery).toEqual([
      {
        file: "images/gallery-01.jpg",
        width: 1,
        height: 1,
        bytes: 1,
        id: expect.any(String),
        blurred: false,
      },
      { file: "images/gallery-02.jpg", width: 0, height: 0, bytes: 0, id: "g2", blurred: true },
    ]);
  });

  it("登場人物・ペルソナ・設定集は欠けた値を補い、id がなければ作る", () => {
    const doc = normalizeCastDocument({
      format: CAST_FILE_FORMAT,
      members: [
        {
          name: "葵",
          toneExamples: [{ situation: "朝" }, "x"],
          partnerSettings: { freeform: 3, dailyRoutine: "早起き" },
          avatar: { file: "images/member-02.jpg", width: 400, height: 400, bytes: 1 },
        },
      ],
      recommendedPersonas: [{ name: "アキ", useViewerName: "yes" }],
      lorebooks: [{ title: "世界地図" }, null],
    });
    expect(doc.members).toEqual([
      {
        id: expect.any(String),
        name: "葵",
        profile: "",
        toneExamples: [
          { situation: "朝", example: "" },
          { situation: "", example: "" },
        ],
        partnerSettings: { ...createEmptyPartnerSettings(), dailyRoutine: "早起き" },
        avatar: { file: "images/member-02.jpg", width: 400, height: 400, bytes: 1 },
      },
    ]);
    expect(doc.recommendedPersonas).toEqual([
      {
        id: expect.any(String),
        name: "アキ",
        useViewerName: false,
        tagline: "",
        note: "",
        avatar: null,
      },
    ]);
    expect(doc.lorebooks.map((book) => [book.title, book.note])).toEqual([
      ["世界地図", ""],
      ["", ""],
    ]);
    expect(doc.lorebooks[0]?.id).not.toBe(doc.lorebooks[1]?.id);
  });

  it("いない登場人物を指す話者は本体に戻す", () => {
    const raw = {
      ...createEmptyCast(),
      introScript: [{ kind: "speech", text: "やあ", speakerId: "missing" }],
    };
    expect(normalizeCastDocument(raw).introScript[0]?.speakerId).toBeNull();
  });

  it("イントロはセリフでなければナレーションにし、話者は登場人物のセリフにだけ残す", () => {
    const doc = normalizeCastDocument({
      format: CAST_FILE_FORMAT,
      members: [{ id: "m1", name: "葵" }],
      introScript: [
        { kind: "speech", text: "やあ", speakerId: "m1" },
        { kind: "narration", text: "雨", speakerId: "m1" },
        { kind: "monologue", text: "……" },
        { kind: "speech", text: "", speakerId: "" },
        "x",
      ],
    });
    expect(doc.introScript).toEqual([
      { kind: "speech", text: "やあ", speakerId: "m1" },
      { kind: "narration", text: "雨", speakerId: null },
      { kind: "narration", text: "……", speakerId: null },
      { kind: "speech", text: "", speakerId: null },
      { kind: "narration", text: "", speakerId: null },
    ]);
  });

  it("好感度の数値は Zetter と同じく空なら null、整数でなければ既定値", () => {
    const raw = {
      ...createEmptyCast(),
      affinity: {
        default: {
          ...createDefaultAffinityConfig(),
          minValue: "",
          maxValue: "abc",
          initialValue: "7",
        },
        overrides: {},
      },
    };
    const config = normalizeCastDocument(raw).affinity?.default;
    expect(config?.minValue).toBeNull();
    expect(config?.maxValue).toBe(100);
    expect(config?.initialValue).toBe(7);
  });

  it("好感度の数は Number() と同じに読む（段階の開始値の既定は空）", () => {
    const read = (value: unknown) => {
      const config = normalizeAffinityConfig({ minValue: value, stages: [{ startValue: value }] });
      return [config?.minValue, config?.stages[0]?.startValue];
    };
    expect(read(null)).toEqual([null, null]);
    expect(read("")).toEqual([null, null]);
    // 空白だけは 0、指数表記も数として読む（Zetter の normalizeNumber と同じ）
    expect(read(" ")).toEqual([0, 0]);
    expect(read("1e2")).toEqual([100, 100]);
    expect(read("-3")).toEqual([-3, -3]);
    expect(read(undefined)).toEqual([0, null]);
    expect(read(2.5)).toEqual([0, null]);
    expect(read(2 ** 53)).toEqual([0, null]);
  });

  it("好感度の設定の欠けた値は Zetter の normalizeCastAffinityConfig と同じに補う", () => {
    expect(normalizeAffinityConfig({})).toEqual({ ...createDefaultAffinityConfig(), stages: [] });
    expect(normalizeAffinityConfig(null)).toBeNull();
    expect(normalizeAffinityConfig("on")).toBeNull();
    // 表示と有効は false のときだけ切る。変化の速さは 3 つのどれかでなければ「普通」
    expect(
      normalizeAffinityConfig({ itemName: 3, pace: "fast", showInChat: 0, enabled: false }),
    ).toMatchObject({ itemName: "好感度", pace: "normal", showInChat: true, enabled: false });
    expect(
      normalizeAffinityConfig({ stages: [null, { freeText: 5, callText: "名前" }] })?.stages,
    ).toEqual([createEmptyStage(null), { ...createEmptyStage(null), callText: "名前" }]);
  });

  it("好感度の個別設定は、設定として読めないものを外す。共通設定が読めなければ好感度なし", () => {
    const doc = normalizeCastDocument({
      format: CAST_FILE_FORMAT,
      affinity: {
        default: createDefaultAffinityConfig(),
        overrides: { [AFFINITY_BASE_SUBJECT]: { itemName: "信頼" }, broken: "x", empty: null },
      },
    });
    expect(Object.keys(doc.affinity?.overrides ?? {})).toEqual([AFFINITY_BASE_SUBJECT]);
    expect(doc.affinity?.overrides[AFFINITY_BASE_SUBJECT]?.itemName).toBe("信頼");
    const read = (affinity: unknown) =>
      normalizeCastDocument({ format: CAST_FILE_FORMAT, affinity }).affinity;
    expect(read({ overrides: {} })).toBeNull();
    expect(read("on")).toBeNull();
    expect(read({ default: {}, overrides: [] })?.overrides).toEqual({});
  });
});

describe("castDisplayTitle", () => {
  it("ストーリーでキャッチコピーがあれば、それを見出しにして名前を添える（Zetter の castDisplayTitleCore と同じ）", () => {
    expect(
      castDisplayTitle({ mode: "story", tagline: " 雨の日だけ開く古書店 ", name: " 灯里 " }),
    ).toEqual({ title: "雨の日だけ開く古書店", sub: "灯里" });
    expect(castDisplayTitle({ mode: "story", tagline: "　", name: "灯里" })).toEqual({
      title: "灯里",
      sub: "",
    });
    expect(
      castDisplayTitle({ mode: "chat", tagline: "雨の日だけ開く古書店", name: "灯里" }),
    ).toEqual({ title: "灯里", sub: "" });
    expect(castDisplayTitle({ mode: "story", tagline: "", name: "" })).toEqual({
      title: "",
      sub: "",
    });
  });
});

describe("sendableMembers", () => {
  it("何も書いていない登場人物と、雑談モードの登場人物は送られない", () => {
    const doc = createEmptyCast();
    const empty = createEmptyMember();
    const named = { ...createEmptyMember(), name: "葵" };
    const toneOnly = {
      ...createEmptyMember(),
      toneExamples: [{ situation: "", example: "ひとこと" }],
    };
    doc.members = [empty, named, toneOnly];
    expect(sendableMembers(doc)).toEqual([named, toneOnly]);
    doc.mode = "chat";
    expect(sendableMembers(doc)).toEqual([]);
  });

  it("送られるのは 9 人（本人を含めて 10 人）まで", () => {
    const doc = createEmptyCast();
    doc.members = Array.from({ length: 11 }, (_, index) => ({
      ...createEmptyMember(),
      name: `人${index}`,
    }));
    expect(sendableMembers(doc)).toEqual(doc.members.slice(0, 9));
  });

  it("アイコンだけの人は送られ、空白だけ・パートナー設定だけの人は送られない", () => {
    const avatarOnly = {
      ...createEmptyMember(),
      avatar: { file: "images/member-02.jpg", width: 400, height: 400, bytes: 1 },
    };
    const blank = {
      ...createEmptyMember(),
      name: " ",
      profile: "\n",
      toneExamples: [{ situation: "　", example: "" }],
    };
    const partnerOnly = createEmptyMember();
    partnerOnly.partnerSettings.freeform = "毎朝連絡する";
    const doc = { ...createEmptyCast(), members: [blank, avatarOnly, partnerOnly] };
    expect(sendableMembers(doc)).toEqual([avatarOnly]);
  });
});

describe("removeMember", () => {
  it("その人の話者指定と好感度の個別設定も消す", () => {
    const doc = createEmptyCast();
    const member = { ...createEmptyMember(), name: "葵" };
    doc.members = [member];
    doc.introScript = [{ kind: "speech", text: "やあ", speakerId: member.id }];
    doc.affinity = {
      default: createDefaultAffinityConfig(),
      overrides: {
        [member.id]: createDefaultAffinityConfig(),
        [AFFINITY_BASE_SUBJECT]: createDefaultAffinityConfig(),
      },
    };
    removeMember(doc, member.id);
    expect(doc.members).toEqual([]);
    expect(doc.introScript[0]?.speakerId).toBeNull();
    expect(Object.keys(doc.affinity.overrides)).toEqual([AFFINITY_BASE_SUBJECT]);
  });

  it("好感度がなくても外せて、ほかの人の話者指定は残す", () => {
    const aoi = { ...createEmptyMember(), name: "葵" };
    const saku = { ...createEmptyMember(), name: "朔" };
    const doc = {
      ...createEmptyCast(),
      members: [aoi, saku],
      introScript: [{ kind: "speech" as const, text: "やあ", speakerId: saku.id }],
    };
    removeMember(doc, aoi.id);
    expect(doc.members).toEqual([saku]);
    expect(doc.introScript[0]?.speakerId).toBe(saku.id);
    expect(doc.affinity).toBeNull();
  });
});

describe("sortAffinityStages", () => {
  it("1 段階目は動かさず、残りを開始値の小さい順にする（未入力は最後）", () => {
    const config = createDefaultAffinityConfig();
    config.stages = [
      { ...config.stages[0]!, startValue: 0 },
      { ...config.stages[1]!, startValue: 80 },
      { ...config.stages[2]!, startValue: null },
      { ...config.stages[3]!, startValue: 30 },
    ];
    sortAffinityStages(config);
    expect(config.stages.map((stage) => stage.startValue)).toEqual([0, 30, 80, null]);
  });

  it("整数でない開始値は未入力と同じく最後に回し、同じ値どうしは元の順のまま", () => {
    const stage = (startValue: number | null, freeText: string) => ({
      ...createEmptyStage(startValue),
      freeText,
    });
    const config = createDefaultAffinityConfig();
    config.stages = [
      stage(0, "a"),
      stage(2.5, "b"),
      stage(50, "c"),
      stage(null, "d"),
      stage(10, "e"),
      stage(50, "f"),
    ];
    sortAffinityStages(config);
    expect(config.stages.map((item) => item.freeText)).toEqual(["a", "e", "c", "f", "b", "d"]);
    config.stages = [stage(40, "only")];
    sortAffinityStages(config);
    expect(config.stages.map((item) => item.freeText)).toEqual(["only"]);
  });
});
