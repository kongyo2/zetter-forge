import {
  AFFINITY_BASE_SUBJECT,
  type CastDocument,
  createEmptyCast,
  createEmptyMember,
} from "@shared/cast";
import { LIMITS } from "@shared/limits";
import { describe, expect, it } from "vitest";

import {
  type EditResult,
  appendHabitChip,
  applyAdd,
  applyCheck,
  applyCommit,
  applyInput,
  applyInsert,
  applyMove,
  applyRemove,
  insertTimeChip,
  placeImage,
} from "../src/renderer/src/app/edits";

function docOf(result: EditResult): CastDocument {
  if (!result || "refused" in result)
    throw new Error(`書き換えられませんでした: ${JSON.stringify(result)}`);
  return result.doc;
}

describe("文字の書き換え", () => {
  it("本人と登場人物の欄を、場所で書き分ける", () => {
    const member = createEmptyMember();
    const doc = { ...createEmptyCast(), members: [member] };
    expect(docOf(applyInput(doc, ["cast", "name"], "灯里")).name).toBe("灯里");
    expect(
      docOf(applyInput(doc, ["members", member.id, "profile"], "妹")).members[0]?.profile,
    ).toBe("妹");
    expect(
      docOf(applyInput(doc, ["members", member.id, "partnerSettings", "freeform"], "自由"))
        .members[0]?.partnerSettings.freeform,
    ).toBe("自由");
    // 元の文書は変えない
    expect(doc.name).toBe("");
    // 知らない場所は書き換えない
    expect(applyInput(doc, ["cast", "format"], "x")).toBeNull();
    expect(applyInput(doc, ["members", "いない", "name"], "x")).toBeNull();
  });

  it("イントロの種類と話者は 1 つの値で選び、いない人は話者にしない", () => {
    const member = createEmptyMember();
    const doc = {
      ...createEmptyCast(),
      members: [member],
      introScript: [{ kind: "narration" as const, text: "雨", speakerId: null }],
    };
    expect(
      docOf(applyInput(doc, ["intro", 0, "role"], `speech:${member.id}`)).introScript[0],
    ).toMatchObject({
      kind: "speech",
      speakerId: member.id,
    });
    expect(applyInput(doc, ["intro", 0, "role"], "speech:いない")).toBeNull();
  });

  it("雑談モードの最初のひとことは、なければ作る", () => {
    const doc = { ...createEmptyCast(), mode: "chat" as const };
    expect(docOf(applyInput(doc, ["intro", "first", "text"], "やあ")).introScript).toEqual([
      { kind: "speech", text: "やあ", speakerId: null },
    ]);
  });

  it("好感度の最小値を変えると 1 段階目もついてくる。1 段階目の開始値は変えられない", () => {
    const doc = docOf(applyAdd(createEmptyCast(), ["affinity"]));
    const moved = docOf(applyInput(doc, ["affinity", "default", "minValue"], "-10"));
    expect(moved.affinity?.default.stages[0]?.startValue).toBe(-10);
    expect(applyInput(doc, ["affinity", "default", "stages", 0, "startValue"], "5")).toBeNull();
    expect(
      docOf(applyInput(doc, ["affinity", "default", "maxValue"], "")).affinity?.default.maxValue,
    ).toBeNull();
  });
});

describe("オン・オフ", () => {
  it("「公開する・出す」の向きを、保存する値（隠す）に読み替える", () => {
    const doc = createEmptyCast();
    expect(docOf(applyCheck(doc, ["cast", "personaVisible"], true)).personaHidden).toBe(false);
    expect(docOf(applyCheck(doc, ["cast", "public"], true)).status).toBe("public");
  });

  it("「このキャラは好感度を使わない」は、個別設定がなければ共通設定を写して作る", () => {
    const doc = docOf(applyAdd(createEmptyCast(), ["affinity"]));
    const next = docOf(applyCheck(doc, ["affinity", AFFINITY_BASE_SUBJECT, "disabled"], true));
    expect(next.affinity?.overrides[AFFINITY_BASE_SUBJECT]).toMatchObject({
      enabled: false,
      itemName: "好感度",
    });
  });
});

describe("札と {{user}}", () => {
  it("時間帯の札は、行の途中なら改行してから入れる（行の頭ならそのまま）", () => {
    expect(insertTimeChip("起きる", { start: 3, end: 3 }, "朝")).toEqual({
      value: "起きる\n【朝】 ",
      caret: 8,
    });
    expect(insertTimeChip("起きる", { start: 0, end: 0 }, "朝")).toEqual({
      value: "【朝】 起きる",
      caret: 4,
    });
    // 先頭が改行でも、行の頭なら改行を足さない
    expect(insertTimeChip("\n起きる", { start: 0, end: 0 }, "朝").value).toBe("【朝】 \n起きる");
    expect(insertTimeChip("a\nb", { start: 2, end: 2 }, "夜").value).toBe("a\n【夜】 b");
  });

  it("癖の札は末尾に一文を足し、同じ文があれば足さない", () => {
    expect(appendHabitChip("", "返事が早い")).toBe("返事が早い。");
    expect(appendHabitChip("気まぐれ", "返事が早い")).toBe("気まぐれ。\n返事が早い。");
    expect(appendHabitChip("返事が早い。", "返事が早い")).toBe("返事が早い。");
  });

  it("札が 5 欄の合計に入りきらないときは、途中で切らずに入れない", () => {
    const doc = createEmptyCast();
    doc.partnerSettings.freeform = "あ".repeat(LIMITS.partnerSettingsTotal - 3);
    const result = applyInsert(doc, ["cast", "partnerSettings", "dailyRoutine"], "朝", {
      start: 0,
      end: 0,
    });
    expect(result).toMatchObject({ refused: expect.stringContaining("5つの欄の合計") });
    const fits = applyInsert(doc, ["cast", "partnerSettings", "dailyRoutine"], "朝", {
      start: 0,
      end: 0,
    });
    expect(fits && "refused" in fits).toBe(true);
    doc.partnerSettings.freeform = "";
    expect(
      docOf(
        applyInsert(doc, ["cast", "partnerSettings", "dailyRoutine"], "朝", { start: 0, end: 0 }),
      ).partnerSettings.dailyRoutine,
    ).toBe("【朝】 ");
  });

  it("決まった札のほかは入れない", () => {
    const doc = createEmptyCast();
    expect(
      applyInsert(doc, ["cast", "partnerSettings", "dailyRoutine"], "<script>", {
        start: 0,
        end: 0,
      }),
    ).toBeNull();
    expect(applyInsert(doc, ["cast", "name"], "{{user}}", { start: 0, end: 0 })).toBeNull();
  });
});

describe("足す・消す・並べ替える", () => {
  it("上限まで足したら、それ以上は足さない", () => {
    let doc = createEmptyCast();
    for (let index = 0; index < LIMITS.tags; index += 1) doc = docOf(applyAdd(doc, ["tags"]));
    expect(applyAdd(doc, ["tags"])).toBeNull();
  });

  it("足した欄へフォーカスを移す", () => {
    const result = applyAdd(createEmptyCast(), ["cast", "toneExamples"]);
    expect(result && !("refused" in result) && result.focus?.path).toEqual([
      "cast",
      "toneExamples",
      0,
      "situation",
    ]);
  });

  it("消したものは知らせの文言を付けて返す（元に戻すため）", () => {
    const doc = { ...createEmptyCast(), tags: ["a", "b"] };
    const result = applyRemove(doc, ["tags", 0], { stage: 0 });
    expect(result).toMatchObject({ removed: "タグを外しました。" });
    expect(docOf(result).tags).toEqual(["b"]);
  });

  it("並べ替えは範囲の中だけ", () => {
    const doc = {
      ...createEmptyCast(),
      introScript: [
        { kind: "narration" as const, text: "1", speakerId: null },
        { kind: "narration" as const, text: "2", speakerId: null },
      ],
    };
    expect(docOf(applyMove(doc, ["intro", 0], 1)).introScript.map((part) => part.text)).toEqual([
      "2",
      "1",
    ]);
    expect(applyMove(doc, ["intro", 0], -1)).toBeNull();
  });

  it("好感度の開始値を確定したら並べ直し、開いている段階はついていく", () => {
    const doc = docOf(applyAdd(createEmptyCast(), ["affinity"]));
    const edited = docOf(applyInput(doc, ["affinity", "default", "stages", 3, "startValue"], "10"));
    const result = applyCommit(edited, ["affinity", "default", "stages", 3, "startValue"], {
      stage: 3,
    });
    expect(docOf(result).affinity?.default.stages.map((stage) => stage.startValue)).toEqual([
      0, 10, 25, 50,
    ]);
    expect(result && !("refused" in result) && result.ui?.stage).toBe(1);
  });
});

describe("画像", () => {
  it("ギャラリーは上限まで足し、それ以上は断る", () => {
    let doc = createEmptyCast();
    const image = { file: "pending:x", width: 1, height: 1, bytes: 1 };
    for (let index = 0; index < LIMITS.gallery; index += 1)
      doc = docOf(placeImage(doc, ["gallery"], image));
    expect(placeImage(doc, ["gallery"], image)).toMatchObject({ refused: expect.any(String) });
  });

  it("画像を外すと「元に戻す」の文言を返す", () => {
    const doc = {
      ...createEmptyCast(),
      cover: { file: "images/c.jpg", width: 1, height: 1, bytes: 1 },
    };
    const result = applyRemove(doc, ["cast", "cover"], { stage: 0 });
    expect(docOf(result).cover).toBeNull();
    expect(result).toMatchObject({ removed: "画像を外しました。" });
  });
});
