import {
  AFFINITY_BASE_SUBJECT,
  type CastDocument,
  createDefaultAffinityConfig,
  createEmptyCast,
  createEmptyMember,
  createEmptyPersona,
} from "@shared/cast";
import { LIMITS } from "@shared/limits";
import { describe, expect, it } from "vitest";

import {
  type EditResult,
  USER_PLACEHOLDER,
  appendHabitChip,
  applyAdd,
  applyCheck,
  applyCommit,
  applyInput,
  applyInsert,
  applyMove,
  applyRemove,
  imageKindAt,
  insertTimeChip,
  introRoleValue,
  isImagePath,
  placeImage,
  readImage,
  removalNeedsConfirm,
  removeAffinity,
  removeMemberById,
  trimIntro,
} from "../src/renderer/src/app/edits";
import { AFFINITY_DEFAULT, MAIN_CHARACTER } from "../src/renderer/src/app/types";

function docOf(result: EditResult): CastDocument {
  if (!result || "refused" in result)
    throw new Error(`書き換えられませんでした: ${JSON.stringify(result)}`);
  return result.doc;
}

/** 書き換えた結果のうち、文書のほか（フォーカス・画面の状態・知らせ）だけ */
function extrasOf(result: EditResult) {
  if (!result || "refused" in result)
    throw new Error(`書き換えられませんでした: ${JSON.stringify(result)}`);
  const { doc: _doc, ...extras } = result;
  return extras;
}

const withAffinity = () => docOf(applyAdd(createEmptyCast(), ["affinity"]));

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

  it("イントロの種類と話者を表す値（ナレーション・本体のセリフ・登場人物のセリフ）", () => {
    expect(introRoleValue({ kind: "narration", speakerId: null })).toBe("narration");
    expect(introRoleValue({ kind: "speech", speakerId: null })).toBe("speech:");
    expect(introRoleValue({ kind: "speech", speakerId: "m1" })).toBe("speech:m1");
  });

  it("ナレーションにすると話者を外す（Zetter も地の文には話者を持たせない）", () => {
    const member = createEmptyMember();
    const doc = {
      ...createEmptyCast(),
      members: [member],
      introScript: [{ kind: "speech" as const, text: "やあ", speakerId: member.id }],
    };
    expect(docOf(applyInput(doc, ["intro", 0, "role"], "narration")).introScript[0]).toEqual({
      kind: "narration",
      text: "やあ",
      speakerId: null,
    });
    expect(docOf(applyInput(doc, ["intro", 0, "role"], "speech:")).introScript[0]).toEqual({
      kind: "speech",
      text: "やあ",
      speakerId: null,
    });
    expect(applyInput(doc, ["intro", 0, "role"], "monologue")).toBeNull();
    expect(docOf(applyInput(doc, ["intro", 0, "text"], "こんにちは")).introScript[0]?.text).toBe(
      "こんにちは",
    );
    expect(applyInput(doc, ["intro", 1, "text"], "x")).toBeNull();
    expect(applyInput(doc, ["intro", 0, "kind"], "speech")).toBeNull();
  });

  it("雑談モードの最初のひとことは、なければ作る", () => {
    const doc = { ...createEmptyCast(), mode: "chat" as const };
    expect(docOf(applyInput(doc, ["intro", "first", "text"], "やあ")).introScript).toEqual([
      { kind: "speech", text: "やあ", speakerId: null },
    ]);
  });

  it("雑談モードの最初のひとことは、あれば 1 つ目のパートを書き換える", () => {
    const doc = {
      ...createEmptyCast(),
      mode: "chat" as const,
      introScript: [
        { kind: "speech" as const, text: "やあ", speakerId: null },
        { kind: "speech" as const, text: "またね", speakerId: null },
      ],
    };
    expect(
      docOf(applyInput(doc, ["intro", "first", "text"], "こんにちは")).introScript.map(
        (part) => part.text,
      ),
    ).toEqual(["こんにちは", "またね"]);
  });

  it("モード・ペルソナ・設定集・タグ・口調サンプルを書き換える", () => {
    const persona = createEmptyPersona();
    const doc = {
      ...createEmptyCast(),
      recommendedPersonas: [persona],
      lorebooks: [{ id: "b1", title: "", note: "" }],
      tags: ["古書店"],
      toneExamples: [{ situation: "", example: "" }],
    };
    expect(docOf(applyInput(doc, ["cast", "mode"], "chat")).mode).toBe("chat");
    expect(applyInput(doc, ["cast", "mode"], "group")).toBeNull();
    expect(docOf(applyInput(doc, ["cast", "memo"], "メモ")).memo).toBe("メモ");
    expect(
      docOf(applyInput(doc, ["personas", persona.id, "note"], "18歳")).recommendedPersonas[0]?.note,
    ).toBe("18歳");
    expect(applyInput(doc, ["personas", persona.id, "avatar"], "x")).toBeNull();
    expect(applyInput(doc, ["personas", "いない", "name"], "x")).toBeNull();
    expect(
      docOf(applyInput(doc, ["lorebooks", "b1", "title"], "世界地図")).lorebooks[0]?.title,
    ).toBe("世界地図");
    expect(applyInput(doc, ["lorebooks", "b1", "id"], "x")).toBeNull();
    expect(applyInput(doc, ["lorebooks", "いない", "note"], "x")).toBeNull();
    expect(docOf(applyInput(doc, ["tags", 0], "雨")).tags).toEqual(["雨"]);
    expect(applyInput(doc, ["tags", 1], "雨")).toBeNull();
    expect(
      docOf(applyInput(doc, ["cast", "toneExamples", 0, "example"], "おはよう")).toneExamples[0],
    ).toEqual({ situation: "", example: "おはよう" });
    expect(applyInput(doc, ["cast", "toneExamples", 0, "note"], "x")).toBeNull();
    expect(applyInput(doc, ["cast", "toneExamples", 1, "example"], "x")).toBeNull();
  });

  it("パートナー設定は、5 欄の合計に入りきらない分を切り詰めて書く（Zetter の入力欄と同じ）", () => {
    const doc = createEmptyCast();
    doc.partnerSettings.freeform = "あ".repeat(LIMITS.partnerSettingsTotal - 2);
    const next = docOf(applyInput(doc, ["cast", "partnerSettings", "dailyRoutine"], "朝昼晩"));
    expect(next.partnerSettings.dailyRoutine).toBe("朝昼");
    expect(applyInput(doc, ["cast", "partnerSettings", "unknown"], "x")).toBeNull();
  });

  it("好感度の最小値を変えると 1 段階目もついてくる。1 段階目の開始値は変えられない", () => {
    const doc = withAffinity();
    const moved = docOf(applyInput(doc, ["affinity", "default", "minValue"], "-10"));
    expect(moved.affinity?.default.stages[0]?.startValue).toBe(-10);
    expect(applyInput(doc, ["affinity", "default", "stages", 0, "startValue"], "5")).toBeNull();
    expect(
      docOf(applyInput(doc, ["affinity", "default", "maxValue"], "")).affinity?.default.maxValue,
    ).toBeNull();
  });

  it("好感度の項目名・数・変化の速さ・段階の文を書き換える", () => {
    const doc = withAffinity();
    const config = (result: EditResult) => docOf(result).affinity?.default;
    expect(config(applyInput(doc, ["affinity", "default", "itemName"], "信頼度"))?.itemName).toBe(
      "信頼度",
    );
    expect(config(applyInput(doc, ["affinity", "default", "pace"], "rapid"))?.pace).toBe("rapid");
    expect(applyInput(doc, ["affinity", "default", "pace"], "fast")).toBeNull();
    // 数でなければ空にする（整数かどうかは確認で見る。Zetter の数の欄と同じ）
    expect(
      config(applyInput(doc, ["affinity", "default", "initialValue"], "abc"))?.initialValue,
    ).toBeNull();
    expect(
      config(applyInput(doc, ["affinity", "default", "stages", 1, "startValue"], "12.5"))?.stages[1]
        ?.startValue,
    ).toBe(12.5);
    expect(
      config(applyInput(doc, ["affinity", "default", "stages", 1, "speechText"], "敬語"))?.stages[1]
        ?.speechText,
    ).toBe("敬語");
    expect(applyInput(doc, ["affinity", "default", "stages", 1, "unknown"], "x")).toBeNull();
    expect(applyInput(doc, ["affinity", "default", "stages", 9, "freeText"], "x")).toBeNull();
    expect(applyInput(doc, ["affinity", "default", "enabled"], "x")).toBeNull();
    // 個別設定がない人、好感度がないキャストは書き換えない
    expect(applyInput(doc, ["affinity", AFFINITY_BASE_SUBJECT, "itemName"], "x")).toBeNull();
    expect(applyInput(createEmptyCast(), ["affinity", "default", "itemName"], "x")).toBeNull();
  });
});

describe("オン・オフ", () => {
  it("「公開する・出す」の向きを、保存する値（隠す）に読み替える", () => {
    const doc = createEmptyCast();
    expect(docOf(applyCheck(doc, ["cast", "personaVisible"], true)).personaHidden).toBe(false);
    expect(docOf(applyCheck(doc, ["cast", "public"], true)).status).toBe("public");
  });

  it.each([
    ["avatarBlurred", true, { avatarBlurred: true }],
    ["coverBlurred", true, { coverBlurred: true }],
    ["toneExamplesVisible", true, { toneExamplesHidden: false }],
    ["situationVisible", true, { situationHidden: false }],
    ["authorVisible", false, { authorHidden: true }],
    ["showFavoriteCount", false, { showFavoriteCount: false }],
    ["showTalkCount", false, { showTalkCount: false }],
    ["public", false, { status: "private" }],
  ] as const)("%s を %s にする", (key, checked, expected) => {
    expect(docOf(applyCheck(createEmptyCast(), ["cast", key], checked))).toMatchObject(expected);
  });

  it("ペルソナの「遊ぶ人の名前を使う」・ギャラリーのぼかし・チャットへの好感度の表示を切り替える", () => {
    const persona = createEmptyPersona();
    const image = {
      id: "g1",
      file: "images/gallery-01.jpg",
      width: 1,
      height: 1,
      bytes: 1,
      blurred: false,
    };
    const doc = { ...withAffinity(), recommendedPersonas: [persona], gallery: [image] };
    expect(
      docOf(applyCheck(doc, ["personas", persona.id, "useViewerName"], true)).recommendedPersonas[0]
        ?.useViewerName,
    ).toBe(true);
    expect(applyCheck(doc, ["personas", "いない", "useViewerName"], true)).toBeNull();
    expect(docOf(applyCheck(doc, ["gallery", "g1", "blurred"], true)).gallery[0]?.blurred).toBe(
      true,
    );
    expect(applyCheck(doc, ["gallery", "いない", "blurred"], true)).toBeNull();
    expect(
      docOf(applyCheck(doc, ["affinity", "default", "showInChat"], false)).affinity?.default
        .showInChat,
    ).toBe(false);
    expect(applyCheck(doc, ["affinity", AFFINITY_BASE_SUBJECT, "showInChat"], false)).toBeNull();
    // 共通設定は「使わない」にできない
    expect(applyCheck(doc, ["affinity", "default", "disabled"], true)).toBeNull();
    expect(applyCheck(doc, ["cast", "unknown"], true)).toBeNull();
    expect(applyCheck(createEmptyCast(), ["affinity", "default", "showInChat"], true)).toBeNull();
  });

  it("「このキャラは好感度を使わない」は、個別設定がなければ共通設定を写して作る", () => {
    const doc = withAffinity();
    const next = docOf(applyCheck(doc, ["affinity", AFFINITY_BASE_SUBJECT, "disabled"], true));
    expect(next.affinity?.overrides[AFFINITY_BASE_SUBJECT]).toMatchObject({
      enabled: false,
      itemName: "好感度",
    });
  });

  it("「このキャラは好感度を使わない」を外すと、個別設定は残したまま使う設定に戻る", () => {
    const off = docOf(
      applyCheck(withAffinity(), ["affinity", AFFINITY_BASE_SUBJECT, "disabled"], true),
    );
    off.affinity!.overrides[AFFINITY_BASE_SUBJECT]!.itemName = "信頼度";
    const on = docOf(applyCheck(off, ["affinity", AFFINITY_BASE_SUBJECT, "disabled"], false));
    expect(on.affinity?.overrides[AFFINITY_BASE_SUBJECT]).toMatchObject({
      enabled: true,
      itemName: "信頼度",
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
    // 先頭が改行でも、行の頭なら改行を足さない（Zetter の insertCastPartnerTimeChip は
    // lastIndexOf の都合でこのときだけ改行を足すが、ここでは足さない）
    expect(insertTimeChip("\n起きる", { start: 0, end: 0 }, "朝").value).toBe("【朝】 \n起きる");
    expect(insertTimeChip("a\nb", { start: 2, end: 2 }, "夜").value).toBe("a\n【夜】 b");
  });

  it("時間帯の札は、選んでいる範囲を置き換え、範囲の外の位置は端に寄せる", () => {
    expect(insertTimeChip("朝ごはん", { start: 0, end: 2 }, "昼")).toEqual({
      value: "【昼】 はん",
      caret: 4,
    });
    expect(insertTimeChip("夜", { start: 9, end: 9 }, "深夜")).toEqual({
      value: "夜\n【深夜】 ",
      caret: 7,
    });
    expect(insertTimeChip("夜", { start: -1, end: -1 }, "朝").value).toBe("【朝】 夜");
  });

  it("癖の札は末尾に一文を足し、同じ文があれば足さない", () => {
    expect(appendHabitChip("", "返事が早い")).toBe("返事が早い。");
    expect(appendHabitChip("気まぐれ", "返事が早い")).toBe("気まぐれ。\n返事が早い。");
    expect(appendHabitChip("返事が早い。", "返事が早い")).toBe("返事が早い。");
  });

  it("癖の札は、文の終わりの記号があれば句点を足さずに改行し、末尾の空白は落とす", () => {
    expect(appendHabitChip("気まぐれ！  \n", "一言で返す")).toBe("気まぐれ！\n一言で返す。");
    expect(appendHabitChip("早い?", "絵文字を使う")).toBe("早い?\n絵文字を使う。");
    // 同じ言い回しが文の途中にあっても足さない（Zetter と同じ）
    expect(appendHabitChip("返事が早いほう", "返事が早い")).toBe("返事が早いほう");
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

  it("札を入れたら、その欄の入れた位置へカーソルを移す（癖の札は末尾）", () => {
    const member = createEmptyMember();
    member.partnerSettings.messageHabits = "気まぐれ";
    const doc = { ...createEmptyCast(), members: [member] };
    const base = ["members", member.id, "partnerSettings"] as const;
    const habit = applyInsert(doc, [...base, "messageHabits"], "返事が早い", { start: 0, end: 0 });
    expect(docOf(habit).members[0]?.partnerSettings.messageHabits).toBe("気まぐれ。\n返事が早い。");
    expect(extrasOf(habit)).toEqual({
      focus: { path: [...base, "messageHabits"], selection: { start: 12, end: 12 } },
    });
    const time = applyInsert(doc, [...base, "dailyRoutine"], "夜", { start: 0, end: 0 });
    expect(extrasOf(time)).toEqual({
      focus: { path: [...base, "dailyRoutine"], selection: { start: 4, end: 4 } },
    });
    // 札は決まった欄にだけ入れる
    expect(applyInsert(doc, [...base, "freeform"], "返事が早い", { start: 0, end: 0 })).toBeNull();
    expect(applyInsert(doc, [...base, "messageHabits"], "朝", { start: 0, end: 0 })).toBeNull();
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

  it("{{user}} はカーソルの位置に入れ（選んだ範囲は置き換え）、入れたあとへカーソルを移す", () => {
    const doc = {
      ...createEmptyCast(),
      introScript: [{ kind: "speech" as const, text: "いらっしゃい、。", speakerId: null }],
    };
    const result = applyInsert(doc, ["intro", 0, "text"], USER_PLACEHOLDER, { start: 7, end: 7 });
    expect(docOf(result).introScript[0]?.text).toBe("いらっしゃい、{{user}}。");
    expect(extrasOf(result)).toEqual({
      focus: { path: ["intro", 0, "text"], selection: { start: 15, end: 15 } },
    });
    expect(
      docOf(applyInsert(doc, ["intro", 0, "text"], USER_PLACEHOLDER, { start: 0, end: 6 }))
        .introScript[0]?.text,
    ).toBe("{{user}}、。");
    expect(
      applyInsert(doc, ["intro", 1, "text"], USER_PLACEHOLDER, { start: 0, end: 0 }),
    ).toBeNull();
    expect(
      applyInsert(doc, ["intro", 0, "role"], USER_PLACEHOLDER, { start: 0, end: 0 }),
    ).toBeNull();
  });

  it("{{user}} が 1 パートの上限に入りきらないときは、後ろを切らずに入れない", () => {
    const part = (text: string) => ({ kind: "speech" as const, text, speakerId: null });
    const fits = { ...createEmptyCast(), introScript: [part("あ".repeat(LIMITS.introPart - 8))] };
    expect(
      docOf(applyInsert(fits, ["intro", 0, "text"], USER_PLACEHOLDER, { start: 0, end: 0 }))
        .introScript[0]?.text,
    ).toHaveLength(LIMITS.introPart);
    const full = { ...createEmptyCast(), introScript: [part("あ".repeat(LIMITS.introPart - 7))] };
    expect(applyInsert(full, ["intro", 0, "text"], USER_PLACEHOLDER, { start: 0, end: 0 })).toEqual(
      {
        refused: "イントロのパートは4,000字までなので、{{user}} が入りません。",
      },
    );
  });

  it("雑談モードの最初のひとことに {{user}} を入れるとき、パートがなければ作る", () => {
    const doc = { ...createEmptyCast(), mode: "chat" as const };
    expect(
      docOf(applyInsert(doc, ["intro", "first", "text"], USER_PLACEHOLDER, { start: 0, end: 0 }))
        .introScript,
    ).toEqual([{ kind: "speech", text: "{{user}}", speakerId: null }]);
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

  it("登場人物はストーリーモードで 9 人まで足し、足した人の名前の欄へ移る", () => {
    let doc = createEmptyCast();
    for (let index = 0; index < LIMITS.members; index += 1) {
      const result = applyAdd(doc, ["members"]);
      doc = docOf(result);
      const added = doc.members.at(-1)!;
      expect(extrasOf(result)).toEqual({
        focus: { path: ["members", added.id, "name"], selection: null },
        ui: { character: added.id },
      });
    }
    expect(doc.members).toHaveLength(9);
    expect(applyAdd(doc, ["members"])).toBeNull();
    expect(applyAdd({ ...createEmptyCast(), mode: "chat" }, ["members"])).toBeNull();
  });

  it("口調サンプルは 1 人 10 件まで（登場人物も同じ）", () => {
    const member = createEmptyMember();
    let doc = { ...createEmptyCast(), members: [member] };
    for (let index = 0; index < LIMITS.toneItemsPerCharacter; index += 1)
      doc = docOf(applyAdd(doc, ["members", member.id, "toneExamples"]));
    expect(doc.members[0]?.toneExamples).toHaveLength(10);
    expect(applyAdd(doc, ["members", member.id, "toneExamples"])).toBeNull();
    expect(applyAdd(doc, ["members", "いない", "toneExamples"])).toBeNull();
  });

  it("ペルソナは 5 件・設定集は 10 冊まで足し、足したものの最初の欄へ移る", () => {
    let doc = createEmptyCast();
    for (let index = 0; index < LIMITS.personas; index += 1) {
      const result = applyAdd(doc, ["personas"]);
      doc = docOf(result);
      expect(extrasOf(result).focus?.path).toEqual([
        "personas",
        doc.recommendedPersonas.at(-1)!.id,
        "name",
      ]);
    }
    expect(applyAdd(doc, ["personas"])).toBeNull();
    for (let index = 0; index < LIMITS.lorebooks; index += 1) {
      const result = applyAdd(doc, ["lorebooks"]);
      doc = docOf(result);
      expect(extrasOf(result).focus?.path).toEqual([
        "lorebooks",
        doc.lorebooks.at(-1)!.id,
        "title",
      ]);
    }
    expect(doc.lorebooks.at(-1)).toEqual({ id: expect.any(String), title: "", note: "" });
    expect(applyAdd(doc, ["lorebooks"])).toBeNull();
  });

  it("イントロのパートはナレーションで足す（Zetter のストーリーモードと同じ。12 パートまで）", () => {
    let doc = createEmptyCast();
    for (let index = 0; index < LIMITS.introParts; index += 1) {
      const result = applyAdd(doc, ["intro"]);
      doc = docOf(result);
      expect(extrasOf(result).focus?.path).toEqual(["intro", index, "text"]);
    }
    expect(doc.introScript.at(-1)).toEqual({ kind: "narration", text: "", speakerId: null });
    expect(applyAdd(doc, ["intro"])).toBeNull();
  });

  it("好感度を設定すると、ひな形が入って共通設定の 1 段階目を開く。二度目は何もしない", () => {
    const result = applyAdd(createEmptyCast(), ["affinity"]);
    expect(docOf(result).affinity).toEqual({
      default: createDefaultAffinityConfig(),
      overrides: {},
    });
    expect(extrasOf(result)).toEqual({ ui: { subject: AFFINITY_DEFAULT, stage: 0 } });
    expect(applyAdd(docOf(result), ["affinity"])).toBeNull();
  });

  it("好感度の個別設定は共通設定を写して作り（別のもの）、すでにあれば作らない", () => {
    const doc = withAffinity();
    doc.affinity!.default.itemName = "信頼度";
    const result = applyAdd(doc, ["affinity", AFFINITY_BASE_SUBJECT]);
    const next = docOf(result);
    expect(next.affinity?.overrides[AFFINITY_BASE_SUBJECT]).toEqual(next.affinity?.default);
    expect(next.affinity?.overrides[AFFINITY_BASE_SUBJECT]).not.toBe(next.affinity?.default);
    expect(extrasOf(result)).toEqual({ ui: { stage: 0 } });
    expect(applyAdd(next, ["affinity", AFFINITY_BASE_SUBJECT])).toBeNull();
    expect(applyAdd(next, ["affinity", AFFINITY_DEFAULT])).toBeNull();
    expect(applyAdd(createEmptyCast(), ["affinity", AFFINITY_BASE_SUBJECT])).toBeNull();
  });

  it("段階は最後の段階の次の値で足し、足した段階を開く（10 段階まで）", () => {
    let doc = withAffinity();
    const result = applyAdd(doc, ["affinity", "default", "stages"]);
    doc = docOf(result);
    expect(doc.affinity?.default.stages.map((stage) => stage.startValue)).toEqual([
      0, 25, 50, 75, 76,
    ]);
    expect(extrasOf(result)).toEqual({
      focus: { path: ["affinity", "default", "stages", 4, "startValue"], selection: null },
      ui: { stage: 4 },
    });
    // 最後の段階の開始値が数でなければ、最小値＋段階の数から始める
    // （Zetter は Number(null) が 0 になるので未入力のあとは 1 を入れるが、ここでは未入力を 0 とみなさない）
    doc.affinity!.default.stages[4]!.startValue = null;
    doc.affinity!.default.minValue = 10;
    doc = docOf(applyAdd(doc, ["affinity", "default", "stages"]));
    expect(doc.affinity?.default.stages.at(-1)?.startValue).toBe(15);
    while (doc.affinity!.default.stages.length < LIMITS.affinityStages)
      doc = docOf(applyAdd(doc, ["affinity", "default", "stages"]));
    expect(applyAdd(doc, ["affinity", "default", "stages"])).toBeNull();
    expect(applyAdd(doc, ["affinity", AFFINITY_BASE_SUBJECT, "stages"])).toBeNull();
  });

  it("消したものは知らせの文言を付けて返す（元に戻すため）", () => {
    const doc = { ...createEmptyCast(), tags: ["a", "b"] };
    const result = applyRemove(doc, ["tags", 0], { stage: 0 });
    expect(result).toMatchObject({ removed: "タグを外しました。" });
    expect(docOf(result).tags).toEqual(["b"]);
  });

  it("外したものごとの知らせの文言", () => {
    const member = {
      ...createEmptyMember(),
      toneExamples: [{ situation: "朝", example: "おはよう" }],
      avatar: { file: "images/member-02.jpg", width: 400, height: 400, bytes: 1 },
    };
    const persona = createEmptyPersona();
    const doc = {
      ...withAffinity(),
      members: [member],
      recommendedPersonas: [persona],
      lorebooks: [{ id: "b1", title: "世界地図", note: "" }],
      introScript: [{ kind: "narration" as const, text: "雨", speakerId: null }],
      toneExamples: [{ situation: "雨の日", example: "いらっしゃい" }],
      gallery: [
        { id: "g1", file: "images/gallery-01.jpg", width: 1, height: 1, bytes: 1, blurred: false },
      ],
    };
    doc.affinity!.overrides[AFFINITY_BASE_SUBJECT] = createDefaultAffinityConfig();
    const removed = (path: (string | number)[]) =>
      (applyRemove(doc, path, { stage: 0 }) as { removed?: string } | null)?.removed;
    expect(removed(["gallery", "g1"])).toBe("ギャラリー画像を外しました。");
    expect(removed(["members", member.id, "avatar"])).toBe("画像を外しました。");
    expect(removed(["cast", "toneExamples", 0])).toBe("口調サンプルを削除しました。");
    expect(removed(["members", member.id, "toneExamples", 0])).toBe("口調サンプルを削除しました。");
    expect(removed(["intro", 0])).toBe("イントロのパートを削除しました。");
    expect(removed(["personas", persona.id])).toBe("ペルソナを削除しました。");
    expect(removed(["lorebooks", "b1"])).toBe("設定集を外しました。");
    expect(removed(["affinity", AFFINITY_BASE_SUBJECT])).toBe(
      "個別設定をやめて、共通設定に戻しました。",
    );
    // ないものは外さない
    expect(applyRemove(doc, ["gallery", "いない"], { stage: 0 })).toBeNull();
    expect(applyRemove(doc, ["cast", "cover"], { stage: 0 })).toBeNull();
    expect(applyRemove(doc, ["cast", "toneExamples", 3], { stage: 0 })).toBeNull();
    expect(applyRemove(doc, ["affinity", member.id], { stage: 0 })).toBeNull();
    expect(applyRemove(doc, ["affinity", AFFINITY_DEFAULT], { stage: 0 })).toBeNull();
  });

  it("段階を消すと開いている段階がついていく。1 段階目を消すと次の段階が最小値から始まり、最後の 1 段階は消せない", () => {
    const doc = withAffinity();
    const first = applyRemove(doc, ["affinity", "default", "stages", 0], { stage: 2 });
    expect(docOf(first).affinity?.default.stages.map((stage) => stage.startValue)).toEqual([
      0, 50, 75,
    ]);
    expect(extrasOf(first)).toEqual({ ui: { stage: 1 }, removed: "段階を削除しました。" });
    // 開いている段階より後ろを消しても、開いている段階は動かない
    expect(
      extrasOf(applyRemove(doc, ["affinity", "default", "stages", 3], { stage: 1 })).ui,
    ).toEqual({
      stage: 1,
    });
    // 開いている最後の段階を消すと、1 つ前を開く
    expect(
      extrasOf(applyRemove(doc, ["affinity", "default", "stages", 3], { stage: 3 })).ui,
    ).toEqual({
      stage: 2,
    });
    const single = withAffinity();
    single.affinity!.default.stages = [single.affinity!.default.stages[0]!];
    expect(applyRemove(single, ["affinity", "default", "stages", 0], { stage: 0 })).toBeNull();
  });

  it("確かめてから消すもの: 登場人物（名前か「N人目」）・好感度設定・雑談モードの見えていないパート", () => {
    const aoi = { ...createEmptyMember(), name: " 葵 " };
    const unnamed = createEmptyMember();
    const doc = { ...createEmptyCast(), members: [aoi, unnamed] };
    expect(removalNeedsConfirm(doc, ["members", aoi.id])).toBe("葵");
    expect(removalNeedsConfirm(doc, ["members", unnamed.id])).toBe("3人目");
    expect(removalNeedsConfirm(doc, ["members", "いない"])).toBeNull();
    expect(removalNeedsConfirm(doc, ["affinity"])).toBeNull();
    expect(removalNeedsConfirm(docOf(applyAdd(doc, ["affinity"])), ["affinity"])).toBe(
      "好感度設定",
    );
    const part = { kind: "speech" as const, text: "やあ", speakerId: null };
    expect(removalNeedsConfirm({ ...doc, introScript: [part] }, ["intro", "rest"])).toBeNull();
    expect(removalNeedsConfirm({ ...doc, introScript: [part, part] }, ["intro", "rest"])).toBe(
      "イントロ",
    );
    expect(removalNeedsConfirm(doc, ["tags", 0])).toBeNull();
  });

  it("確かめたあとに、登場人物・好感度設定・見えていないパートを消す", () => {
    const member = { ...createEmptyMember(), name: "葵" };
    const doc = {
      ...withAffinity(),
      members: [member],
      introScript: [
        { kind: "speech" as const, text: "やあ", speakerId: member.id },
        { kind: "speech" as const, text: "またね", speakerId: null },
      ],
    };
    doc.affinity!.overrides[member.id] = createDefaultAffinityConfig();
    const removed = removeMemberById(doc, member.id);
    expect(removed.doc.members).toEqual([]);
    expect(removed.doc.introScript[0]?.speakerId).toBeNull();
    expect(removed.doc.affinity?.overrides).toEqual({});
    expect(removed.ui).toEqual({ character: MAIN_CHARACTER });
    // 元の文書は変えない
    expect(doc.members).toHaveLength(1);
    expect(removeAffinity(doc)).toEqual({
      doc: { ...doc, affinity: null },
      ui: { subject: AFFINITY_DEFAULT, stage: 0 },
    });
    expect(trimIntro(doc).doc.introScript.map((part) => part.text)).toEqual(["やあ"]);
    expect(doc.introScript).toHaveLength(2);
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

  it("口調サンプルと設定集も並べ替え、口調サンプルは動かした行へ移る", () => {
    const member = {
      ...createEmptyMember(),
      toneExamples: [
        { situation: "朝", example: "1" },
        { situation: "夜", example: "2" },
      ],
    };
    const doc = {
      ...createEmptyCast(),
      members: [member],
      lorebooks: [
        { id: "a", title: "A", note: "" },
        { id: "b", title: "B", note: "" },
      ],
    };
    const moved = applyMove(doc, ["members", member.id, "toneExamples", 1], -1);
    expect(docOf(moved).members[0]?.toneExamples.map((tone) => tone.situation)).toEqual([
      "夜",
      "朝",
    ]);
    expect(extrasOf(moved).focus?.path).toEqual([
      "members",
      member.id,
      "toneExamples",
      0,
      "situation",
    ]);
    expect(applyMove(doc, ["members", member.id, "toneExamples", 1], 1)).toBeNull();
    expect(docOf(applyMove(doc, ["lorebooks", "a"], 1)).lorebooks.map((book) => book.id)).toEqual([
      "b",
      "a",
    ]);
    expect(applyMove(doc, ["lorebooks", "b"], 1)).toBeNull();
    expect(applyMove(doc, ["tags", 0], 1)).toBeNull();
  });

  it("好感度の開始値を確定したら並べ直し、開いている段階はついていく", () => {
    const doc = withAffinity();
    const edited = docOf(applyInput(doc, ["affinity", "default", "stages", 3, "startValue"], "10"));
    const result = applyCommit(edited, ["affinity", "default", "stages", 3, "startValue"], {
      stage: 3,
    });
    expect(docOf(result).affinity?.default.stages.map((stage) => stage.startValue)).toEqual([
      0, 10, 25, 50,
    ]);
    expect(result && !("refused" in result) && result.ui?.stage).toBe(1);
  });

  it("開始値でない欄の確定では並べ直さない", () => {
    const doc = withAffinity();
    expect(
      applyCommit(doc, ["affinity", "default", "stages", 1, "freeText"], { stage: 0 }),
    ).toBeNull();
    expect(applyCommit(doc, ["cast", "name"], { stage: 0 })).toBeNull();
    expect(
      applyCommit(doc, ["affinity", "default", "stages", 9, "startValue"], { stage: 0 }),
    ).toBeNull();
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

  it("切り抜いた画像を、本人・登場人物・ペルソナの枠に入れ、ギャラリーには末尾に足す", () => {
    const member = createEmptyMember();
    const persona = createEmptyPersona();
    const doc = { ...createEmptyCast(), members: [member], recommendedPersonas: [persona] };
    const image = { file: "pending:a", width: 400, height: 400, bytes: 1 };
    const slots = [
      ["cast", "avatar"],
      ["cast", "cover"],
      ["cast", "background"],
      ["members", member.id, "avatar"],
      ["personas", persona.id, "avatar"],
    ];
    for (const path of slots) {
      expect(isImagePath(path)).toBe(true);
      expect(readImage(docOf(placeImage(doc, path, image)), path)).toEqual(image);
    }
    expect(placeImage(doc, ["members", "いない", "avatar"], image)).toBeNull();
    expect(placeImage(doc, ["cast", "name"], image)).toBeNull();
    const gallery = docOf(placeImage(doc, ["gallery"], image)).gallery;
    expect(gallery).toEqual([{ ...image, id: expect.any(String), blurred: false }]);
    expect(readImage({ ...doc, gallery }, ["gallery", gallery[0]!.id])).toEqual(gallery[0]);
  });

  it("画像の枠の種類（切り抜きの比率と大きさを決める）", () => {
    expect(imageKindAt(["cast", "avatar"])).toBe("avatar");
    expect(imageKindAt(["cast", "cover"])).toBe("cover");
    expect(imageKindAt(["cast", "background"])).toBe("background");
    expect(imageKindAt(["members", "m1", "avatar"])).toBe("member");
    expect(imageKindAt(["personas", "p1", "avatar"])).toBe("persona");
    expect(imageKindAt(["gallery"])).toBe("gallery");
    expect(imageKindAt(["cast", "name"])).toBeNull();
    expect(isImagePath(["gallery", "g1"])).toBe(true);
    expect(isImagePath(["gallery"])).toBe(false);
    expect(isImagePath(["cast", "avatar", "file"])).toBe(false);
    expect(isImagePath(["members", "m1", "name"])).toBe(false);
    expect(readImage(createEmptyCast(), ["cast", "name"])).toBeNull();
  });
});
