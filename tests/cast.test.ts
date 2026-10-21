import {
  AFFINITY_BASE_SUBJECT,
  CAST_FILE_FORMAT,
  CastFormatError,
  createDefaultAffinityConfig,
  createEmptyCast,
  createEmptyMember,
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

  it("好感度のひな形は 0・25・50・75 の 4 段階", () => {
    const config = createDefaultAffinityConfig();
    expect(config.itemName).toBe("好感度");
    expect(config.stages.map((stage) => stage.startValue)).toEqual([0, 25, 50, 75]);
    expect(config.stages[0]?.freeText).toBe("まだ距離を測っている。丁寧だが慎重に接する。");
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

  it("いない登場人物を指す話者は本体に戻す", () => {
    const raw = {
      ...createEmptyCast(),
      introScript: [{ kind: "speech", text: "やあ", speakerId: "missing" }],
    };
    expect(normalizeCastDocument(raw).introScript[0]?.speakerId).toBeNull();
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
});
