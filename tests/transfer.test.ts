import {
  AFFINITY_BASE_SUBJECT,
  type CastDocument,
  type CastImage,
  createDefaultAffinityConfig,
  createEmptyCast,
  createEmptyMember,
  createEmptyPersona,
  createEmptyStage,
} from "@shared/cast";
import { COPY_LOG_FORMAT, copyLogFile, normalizeCopyLog, textHash } from "@shared/copyLog";
import { describe, expect, it } from "vitest";

import { allowance } from "../src/renderer/src/app/presenters/allowance";
import {
  findTransferItem,
  isCopyable,
  nextTransferItem,
  transferGroups,
  transferItems,
  transferStatus,
} from "../src/renderer/src/app/transfer";

function cast(patch: Partial<CastDocument> = {}): CastDocument {
  return {
    ...createEmptyCast(),
    name: "灯里",
    persona: "古書店の店主。",
    tagline: "雨の日だけ開く",
    ...patch,
  };
}

const saved = (file: string): CastImage => ({ file, width: 400, height: 400, bytes: 1 });
const partnerKeys = (base: string) =>
  ["dailyRoutine", "messageHabits", "proactiveMessages", "distanceWhenApart", "freeform"].map(
    (field) => `${base}/partnerSettings/${field}`,
  );
const publishOptions = [
  "cast/personaVisible",
  "cast/toneExamplesVisible",
  "cast/situationVisible",
  "cast/authorVisible",
  "cast/showFavoriteCount",
  "cast/showTalkCount",
];
const itemOf = (doc: CastDocument, key: string) =>
  transferItems(doc).find((item) => item.key === key);

describe("写す項目", () => {
  it("Zetter の作成画面のタブの順に並べる", () => {
    const groups = transferGroups(
      cast({
        tags: ["古書店"],
        affinity: { default: createDefaultAffinityConfig(), overrides: {} },
      }),
    );
    expect(groups.map((group) => group.title)).toEqual([
      "キャラクター",
      "体験設定",
      "好感度",
      "見た目・公開",
    ]);
    const labels = transferItems(cast())
      .filter((item) => !item.skip)
      .map((item) => item.label);
    expect(labels.slice(0, 3)).toEqual(["名前", "性格・設定", "キャッチコピー"]);
  });

  it("ストーリーモードは、Zetter の作成画面の欄と同じ順に並べる", () => {
    const member = {
      ...createEmptyMember(),
      name: "葵",
      profile: "妹",
      toneExamples: [{ situation: "朝", example: "おはよう" }],
    };
    const persona = { ...createEmptyPersona(), name: "アキ" };
    const doc = cast({
      avatar: saved("images/avatar.jpg"),
      toneExamples: [{ situation: "雨の日", example: "いらっしゃい" }],
      members: [member],
      situation: "雨の古書店",
      introScript: [
        { kind: "narration", text: "雨が降っている。", speakerId: null },
        { kind: "speech", text: "いらっしゃい。", speakerId: null },
        { kind: "speech", text: "お姉ちゃん？", speakerId: member.id },
      ],
      aboutText: "紹介",
      recommendedPersonas: [persona],
      lorebooks: [{ id: "b1", title: "", note: "" }],
      cover: saved("images/cover.jpg"),
      tags: ["古書店"],
      hook: "……で？",
      background: saved("images/background.jpg"),
      gallery: [{ ...saved("images/gallery-01.jpg"), id: "g1", blurred: false }],
    });
    const m = `members/${member.id}`;
    const p = `personas/${persona.id}`;
    expect(
      transferGroups(doc).map((group) => [group.title, group.items.map((item) => item.key)]),
    ).toEqual([
      [
        "キャラクター",
        [
          "cast/name",
          "cast/avatar",
          "cast/avatarBlurred",
          "cast/persona",
          ...partnerKeys("cast"),
          "cast/toneExamples/0/situation",
          "cast/toneExamples/0/example",
          `${m}/name`,
          `${m}/avatar`,
          `${m}/profile`,
          ...partnerKeys(m),
          `${m}/toneExamples/0/situation`,
          `${m}/toneExamples/0/example`,
        ],
      ],
      [
        "体験設定",
        [
          "cast/mode",
          "cast/tagline",
          "cast/situation",
          "intro/0/text",
          "intro/1/text",
          "intro/2/text",
          "cast/aboutText",
          `${p}/avatar`,
          `${p}/useViewerName`,
          `${p}/name`,
          `${p}/tagline`,
          `${p}/note`,
        ],
      ],
      ["設定集", ["lorebooks/b1/title"]],
      [
        "見た目・公開",
        [
          "cast/public",
          "cast/cover",
          "cast/coverBlurred",
          "tags/0",
          "cast/hook",
          "cast/background",
          "gallery/g1",
          "gallery/g1/blurred",
          ...publishOptions,
        ],
      ],
    ]);
    // セリフには話者を添え、登場人物はまとまりの見出しに何人目かを出す
    expect(
      ["intro/0/text", "intro/1/text", "intro/2/text"].map((key) => {
        const item = itemOf(doc, key);
        return [item?.section, item?.label];
      }),
    ).toEqual([
      ["イントロ", "パート1（ナレーション）"],
      ["イントロ", "パート2（セリフ（灯里））"],
      ["イントロ", "パート3（セリフ（葵））"],
    ]);
    expect(itemOf(doc, `${m}/name`)).toMatchObject({
      section: "2人目「葵」",
      notes: ["Zetter の「登場人物を追加」で人数分の枠を足してから写します。"],
    });
    expect(itemOf(doc, "lorebooks/b1/title")).toMatchObject({
      kind: "setting",
      label: "連動する設定集1",
      value: "（書名なし）",
      skip: null,
      notes: ["Zetter の設定集の一覧から選びます。"],
    });
  });

  it("雑談モードは、アイコンを見た目・公開に、イントロを「最初のひとこと」にする", () => {
    const doc = cast({
      mode: "chat",
      avatar: saved("images/avatar.jpg"),
      members: [{ ...createEmptyMember(), name: "葵" }],
      introScript: [
        { kind: "speech", text: "やあ", speakerId: null },
        { kind: "speech", text: "またね", speakerId: null },
      ],
      situation: "雨の古書店",
      hook: "……で？",
    });
    expect(
      transferGroups(doc).map((group) => [group.title, group.items.map((item) => item.key)]),
    ).toEqual([
      ["キャラクター", ["cast/name", "cast/persona", ...partnerKeys("cast")]],
      ["体験設定", ["cast/mode", "intro/first/text", "cast/aboutText"]],
      [
        "見た目・公開",
        [
          "cast/public",
          "cast/cover",
          "cast/coverBlurred",
          "cast/avatar",
          "cast/avatarBlurred",
          "cast/background",
          ...publishOptions,
        ],
      ],
    ]);
    expect(itemOf(doc, "intro/first/text")).toMatchObject({
      label: "最初のひとこと",
      value: "やあ",
    });
    expect(itemOf(doc, "cast/mode")).toMatchObject({ value: "雑談", skip: null });
  });

  it("好感度・設定集のまとまりは、設定がなければ出さない", () => {
    expect(transferGroups(cast()).map((group) => group.title)).toEqual([
      "キャラクター",
      "体験設定",
      "見た目・公開",
    ]);
  });

  it("空の欄と Zetter の既定のままの設定は、何もしない項目にする", () => {
    const doc = cast({ affinity: { default: createDefaultAffinityConfig(), overrides: {} } });
    const item = (key: string) => transferItems(doc).find((candidate) => candidate.key === key);
    expect(item("cast/situation")?.skip).toBe("empty");
    expect(item("cast/mode")?.skip).toBe("default");
    expect(item("affinity/default/itemName")?.skip).toBe("default");
    doc.status = "public";
    expect(
      transferItems(structuredClone(doc)).find((candidate) => candidate.key === "cast/public")
        ?.skip,
    ).toBeNull();
  });

  it("見た目・公開の切り替えは、Zetter の新規作成の既定と違うものだけを写す", () => {
    const defaults = cast();
    expect(
      ["cast/avatarBlurred", "cast/coverBlurred", ...publishOptions].map(
        (key) => itemOf(defaults, key)?.skip,
      ),
    ).toEqual(Array(8).fill("default"));
    const changed = cast({
      avatarBlurred: true,
      coverBlurred: true,
      personaHidden: false,
      toneExamplesHidden: false,
      situationHidden: false,
      authorHidden: true,
      showFavoriteCount: false,
      showTalkCount: false,
    });
    expect(
      ["cast/avatarBlurred", "cast/coverBlurred", ...publishOptions].map((key) => {
        const item = itemOf(changed, key);
        return [item?.skip, item?.value];
      }),
    ).toEqual([
      [null, "オン"],
      [null, "オン"],
      [null, "オン"],
      [null, "オン"],
      [null, "オン"],
      [null, "オフ"],
      [null, "オフ"],
      [null, "オフ"],
    ]);
  });

  it("好感度の個別設定は、ひな形とも共通設定とも同じ欄だけを、何もしない項目にする", () => {
    const common = { ...createDefaultAffinityConfig(), itemName: "信頼度" };
    const override = { ...createDefaultAffinityConfig(), maxValue: 50 };
    const doc = cast({
      affinity: { default: common, overrides: { [AFFINITY_BASE_SUBJECT]: override } },
    });
    const skip = (key: string) =>
      transferItems(doc).find((candidate) => candidate.key === key)?.skip;
    const base = `affinity/${AFFINITY_BASE_SUBJECT}`;
    // 共通設定はひな形と比べる
    expect(skip("affinity/default/itemName")).toBeNull();
    expect(skip("affinity/default/maxValue")).toBe("default");
    // 個別設定の項目名はひな形と同じでも、共通設定とは違うので写す
    expect(skip(`${base}/itemName`)).toBeNull();
    expect(skip(`${base}/maxValue`)).toBeNull();
    expect(skip(`${base}/minValue`)).toBe("default");
    expect(skip(`${base}/stages/1/startValue`)).toBe("default");
  });

  it("好感度は共通設定、本体、送られる登場人物の順。使わない人は 1 項目だけ", () => {
    const member = { ...createEmptyMember(), name: "葵" };
    const hidden = createEmptyMember();
    const doc = cast({
      members: [member, hidden],
      affinity: {
        default: createDefaultAffinityConfig(),
        overrides: {
          [AFFINITY_BASE_SUBJECT]: { ...createDefaultAffinityConfig(), enabled: false },
          [member.id]: createDefaultAffinityConfig(),
          [hidden.id]: createDefaultAffinityConfig(),
        },
      },
    });
    const items = transferGroups(doc).find((group) => group.title === "好感度")?.items ?? [];
    expect([...new Set(items.map((item) => item.section))]).toEqual([
      "共通設定",
      "灯里の個別設定",
      "葵の個別設定",
    ]);
    expect(items.filter((item) => item.section === "灯里の個別設定")).toEqual([
      expect.objectContaining({
        key: `affinity/${AFFINITY_BASE_SUBJECT}/disabled`,
        kind: "setting",
        label: "このキャラは好感度を使わない",
        value: "オン",
        skip: null,
      }),
    ]);
    expect(
      items
        .filter((item) => item.section === "共通設定")
        .slice(0, 8)
        .map((item) => [item.key, item.label]),
    ).toEqual([
      ["affinity/default/itemName", "項目名"],
      ["affinity/default/minValue", "最小値"],
      ["affinity/default/maxValue", "最大値"],
      ["affinity/default/initialValue", "初期値"],
      ["affinity/default/pace", "変化の速さ"],
      ["affinity/default/showInChat", "チャットに好感度を表示する"],
      ["affinity/default/stages/0/startValue", "段階1の開始値"],
      ["affinity/default/stages/0/callText", "段階1の呼び方"],
    ]);
  });

  it("ひな形より多い段階には、Zetter で段階を足してから写すと添える。1 段階目の開始値は写さない", () => {
    const config = createDefaultAffinityConfig();
    config.pace = "rapid";
    config.stages.push({ ...createEmptyStage(90), freeText: "とても親しい" });
    const doc = cast({ affinity: { default: config, overrides: {} } });
    expect(itemOf(doc, "affinity/default/pace")).toMatchObject({ value: "急接近", skip: null });
    expect(itemOf(doc, "affinity/default/stages/4/startValue")).toMatchObject({
      value: "90",
      skip: null,
      notes: ["Zetter で「段階を追加」してから写します。"],
    });
    expect(itemOf(doc, "affinity/default/stages/4/freeText")).toMatchObject({
      value: "とても親しい",
      skip: null,
      notes: [],
    });
    expect(itemOf(doc, "affinity/default/stages/4/callText")?.skip).toBe("empty");
    expect(itemOf(doc, "affinity/default/stages/0/startValue")?.skip).toBe("default");
  });

  it("好感度の項目名の上限超えは、コードポイントで数えて添える", () => {
    const config = { ...createDefaultAffinityConfig(), itemName: "🌙".repeat(21) };
    expect(
      itemOf(cast({ affinity: { default: config, overrides: {} } }), "affinity/default/itemName")
        ?.notes,
    ).toEqual(["上限の20字を1字超えています。このまま貼ると Zetter では入りきりません。"]);
  });

  it("雑談モードでは、送られない登場人物・キャッチコピー・好感度を出さない", () => {
    const doc = cast({
      mode: "chat",
      members: [{ ...createEmptyMember(), name: "葵" }],
      affinity: { default: createDefaultAffinityConfig(), overrides: {} },
      introScript: [{ kind: "speech", text: "やあ", speakerId: null }],
    });
    const keys = transferItems(doc).map((item) => item.key);
    expect(keys).toContain("intro/first/text");
    expect(keys.some((key) => key.startsWith("members/"))).toBe(false);
    expect(keys).not.toContain("cast/tagline");
    expect(keys.some((key) => key.startsWith("affinity/"))).toBe(false);
  });

  it("「遊ぶ人の名前を使う」なら名前の欄は写さず、その切り替えを写す。名前が空なら保存されないと添える", () => {
    const viewer = { ...createEmptyPersona(), useViewerName: true };
    const unnamed = createEmptyPersona();
    const doc = cast({ recommendedPersonas: [viewer, unnamed] });
    expect(transferItems(doc).map((item) => item.key)).not.toContain(`personas/${viewer.id}/name`);
    expect(itemOf(doc, `personas/${viewer.id}/useViewerName`)).toMatchObject({
      kind: "setting",
      section: "この会話でのあなた1",
      value: "オン",
      skip: null,
    });
    expect(itemOf(doc, `personas/${unnamed.id}/useViewerName`)).toMatchObject({
      section: "この会話でのあなた2",
      value: "オフ",
      skip: "default",
    });
    expect(itemOf(doc, `personas/${unnamed.id}/name`)).toMatchObject({
      skip: "empty",
      notes: ["名前が空なので、Zetter では保存されません。"],
    });
  });

  it("片方だけの口調サンプルには、保存されないことを添える", () => {
    const doc = cast({ toneExamples: [{ situation: "雨の日", example: "" }] });
    expect(
      transferItems(doc)
        .filter((item) => item.key.startsWith("cast/toneExamples/0/"))
        .map((item) => [item.label, item.skip, item.notes]),
    ).toEqual([
      ["口調サンプル1の状況", null, ["状況と発話例の片方が空なので、Zetter では保存されません。"]],
      [
        "口調サンプル1の発話例",
        "empty",
        ["状況と発話例の片方が空なので、Zetter では保存されません。"],
      ],
    ]);
  });

  it("上限を超えている欄には、入りきらないことを添える", () => {
    const item = findTransferItem(cast({ name: "あ".repeat(11) }), ["cast", "name"]);
    expect(item?.notes[0]).toContain("上限の10字を1字超えています");
  });

  it("イントロの合計が上限を超えるときは、超えるパートにそのことを添える", () => {
    const part = (text: string) => ({ kind: "narration" as const, text, speakerId: null });
    const doc = cast({
      introScript: [part("あ".repeat(4000)), part("あ".repeat(4000)), part("あ".repeat(4000))],
    });
    expect(transferItems(doc).flatMap((item) => item.notes)).toEqual([]);
    doc.introScript.push(part("雨"), part("雨"));
    expect(
      transferItems(structuredClone(doc))
        .filter((item) => item.notes.length > 0)
        .map((item) => [item.key, item.notes]),
    ).toEqual([
      [
        "intro/3/text",
        [
          "イントロは全部のパートを合わせて12,000字までです（いまは12,002字）。このパートで上限を超えます。",
        ],
      ],
    ]);
  });

  it("遊び方シートは、何か書いたときだけ、イントロの下（オプション設定の前）に写す", () => {
    const keysOf = (doc: CastDocument) =>
      transferGroups(doc)
        .find((group) => group.title === "体験設定")
        ?.items.map((item) => item.key);
    const textKeys = ["summary", "world", "role", "start", "first", "hint", "gimmick"].map(
      (key) => `playGuide/${key}/text`,
    );
    // 空白だけなら書いていないのと同じ
    const blank = cast();
    blank.playGuide.world.text = " \n";
    expect(keysOf(blank)?.some((key) => key.startsWith("playGuide/"))).toBe(false);
    const story = cast({
      introScript: [{ kind: "narration", text: "雨。", speakerId: null }],
    });
    story.playGuide.world.text = "海辺の町";
    expect(keysOf(story)).toEqual([
      "cast/mode",
      "cast/tagline",
      "cast/situation",
      "intro/0/text",
      ...textKeys.slice(0, 2),
      "playGuide/world/hidden",
      ...textKeys.slice(2),
      "cast/aboutText",
    ]);
    // 雑談モードでも写す（Zetter はどちらのモードでも送る）
    const chat = structuredClone({ ...story, mode: "chat" as const });
    expect(keysOf(chat)).toEqual([
      "cast/mode",
      "intro/first/text",
      ...textKeys.slice(0, 2),
      "playGuide/world/hidden",
      ...textKeys.slice(2),
      "cast/aboutText",
    ]);
    expect(
      transferItems(story)
        .filter((item) => item.key.startsWith("playGuide/"))
        .map((item) => [item.section, item.label, item.kind, item.skip]),
    ).toEqual([
      ["遊び方シート", "あらすじ", "text", "empty"],
      ["遊び方シート", "世界観", "text", null],
      ["遊び方シート", "世界観の「隠しておく」", "setting", "default"],
      ["遊び方シート", "あなたの役割", "text", "empty"],
      ["遊び方シート", "始まりの状況", "text", "empty"],
      ["遊び方シート", "最初にできること（1行に1つ）", "text", "empty"],
      ["遊び方シート", "迷ったときのヒント", "text", "empty"],
      ["遊び方シート", "隠しギミック", "text", "empty"],
    ]);
  });

  it("遊び方シートの「隠しておく」は、欄ごとの既定（隠しギミックだけオン）と違うときに写す", () => {
    const doc = cast();
    doc.playGuide.summary = { text: "雨の古書店で、", hidden: true };
    doc.playGuide.gimmick = { text: "合言葉がある", hidden: false };
    doc.playGuide.hint = { text: "", hidden: true };
    expect(
      transferItems(doc)
        .filter((item) => item.key.endsWith("/hidden"))
        .map((item) => [item.key, item.value, item.skip]),
    ).toEqual([
      ["playGuide/summary/hidden", "オン", null],
      ["playGuide/gimmick/hidden", "オフ", null],
    ]);
    const item = findTransferItem(doc, ["playGuide", "summary", "text"]);
    expect(item).toMatchObject({ tab: "experience", group: "体験設定", value: "雨の古書店で、" });
    expect(isCopyable(item as NonNullable<typeof item>)).toBe(true);
    // 上限を超えていれば、入りきらないことを添える
    const over = structuredClone(doc);
    over.playGuide.role.text = "あ".repeat(201);
    expect(findTransferItem(over, ["playGuide", "role", "text"])?.notes[0]).toContain(
      "上限の200字を1字超えています",
    );
  });

  it("コピーできるのは、中身のある文字と保存した画像だけ（選ぶ欄は Zetter の画面で選ぶ）", () => {
    const doc = cast({ avatar: saved("images/avatar.jpg"), cover: saved("pending:cover") });
    const item = (key: string) => {
      const found = itemOf(doc, key);
      if (!found) throw new Error(`${key} がありません`);
      return found;
    };
    expect(isCopyable(item("cast/name"))).toBe(true);
    expect(isCopyable(item("cast/situation"))).toBe(false);
    expect(isCopyable(item("cast/avatar"))).toBe(true);
    expect(item("cast/avatar").value).toBe("images/avatar.jpg");
    expect(isCopyable(item("cast/cover"))).toBe(false);
    expect(item("cast/cover").notes).toEqual(["保存すると、ファイルの場所をコピーできます。"]);
    expect(isCopyable(item("cast/background"))).toBe(false);
    expect(isCopyable(item("cast/public"))).toBe(false);
    expect(transferStatus(item("cast/mode"), {})).toBe("skip");
    expect(
      transferStatus(item("cast/situation"), { "cast/situation": { hash: textHash(""), at: "" } }),
    ).toBe("skip");
  });

  it("コピーした値と今の値を比べて、済み・書き換えありを決める", () => {
    const doc = cast();
    const item = findTransferItem(doc, ["cast", "name"]);
    if (!item) throw new Error("名前の項目がありません");
    expect(transferStatus(item, {})).toBe("todo");
    const log = { [item.key]: { hash: textHash("灯里"), at: "" } };
    expect(transferStatus(item, log)).toBe("done");
    const changed = findTransferItem(cast({ name: "灯" }), ["cast", "name"]);
    expect(changed && transferStatus(changed, log)).toBe("changed");
  });

  it("次の項目は、まだのものか書き換えたものの先頭（保存前の画像は飛ばす）", () => {
    const doc = cast({ avatar: { file: "pending:a", width: 1, height: 1, bytes: 1 } });
    expect(nextTransferItem(doc, {})?.key).toBe("cast/name");
    const log = { "cast/name": { hash: textHash("灯里"), at: "" } };
    expect(nextTransferItem(doc, log)?.key).toBe("cast/persona");
  });

  it("すべてコピーしたら次の項目はなく、どれかを書き換えたらそこに戻る", () => {
    const doc = cast({ avatar: saved("images/avatar.jpg") });
    const log = Object.fromEntries(
      transferItems(doc)
        .filter(isCopyable)
        .map((item) => [item.key, { hash: textHash(item.value), at: "" }]),
    );
    expect(nextTransferItem(doc, log)).toBeNull();
    expect(nextTransferItem({ ...doc, tagline: "晴れの日も開く" }, log)?.key).toBe("cast/tagline");
  });

  it("見つからない場所は null", () => {
    expect(findTransferItem(cast(), ["cast", "memo"])).toBeNull();
  });
});

describe("コピーした記録のファイル", () => {
  it("形が違うものは空として読む", () => {
    expect(normalizeCopyLog(null)).toEqual({});
    expect(normalizeCopyLog({ format: "other", items: {} })).toEqual({});
    // 記録の並びは、中身が記録の形でも読まない
    expect(normalizeCopyLog({ format: COPY_LOG_FORMAT, items: [{ hash: "1", at: "t" }] })).toEqual(
      {},
    );
    expect(
      normalizeCopyLog({
        format: "zetter-forge/copied",
        items: { "cast/name": { hash: "1", at: "t" }, broken: { hash: 1 } },
      }),
    ).toEqual({ "cast/name": { hash: "1", at: "t" } });
  });

  it("書き出した形を読み直すと、同じ記録になる", () => {
    const log = { "cast/name": { hash: textHash("灯里"), at: "2026-10-23T00:00:00.000Z" } };
    expect(copyLogFile(log)).toEqual({ format: "zetter-forge/copied", items: log });
    expect(normalizeCopyLog(JSON.parse(JSON.stringify(copyLogFile(log))))).toEqual(log);
  });

  it("ハッシュは同じ文字なら同じ、違えば違う", () => {
    expect(textHash("灯里")).toBe(textHash("灯里"));
    expect(textHash("灯里")).not.toBe(textHash("灯"));
    expect(textHash("")).toMatch(/^[0-9a-f]{8}$/u);
  });

  it("ハッシュは FNV-1a（32 bit）の 16 進 8 桁", () => {
    expect(textHash("")).toBe("811c9dc5");
    expect(textHash("a")).toBe("e40c292c");
    expect(textHash("foobar")).toBe("bf9cf968");
  });
});

describe("原稿用紙の字数の枠", () => {
  it("上限をわずかに超えても、細いだけの行を作らずに 1 マス足す", () => {
    const vm = allowance(
      "性格・設定",
      [{ key: "a", label: "本人", length: 20001, ink: "red" }],
      20000,
      null,
    );
    expect(vm.rows.map((row) => row.cells)).toEqual([25, 25, 1]);
    expect(vm.tone).toBe("over");
    expect(vm.rest.text).toBe("1字オーバー");
    // 上限の線は 2 行目の終わり、斜線は 3 行目
    expect(vm.rows[1]?.limit).toBe("100%");
    expect(vm.rows[2]?.over).toBe("0%");
  });

  it("内訳は 2 人以上で字数があるときだけ出す", () => {
    expect(
      allowance("口調", [{ key: "a", label: "本人", length: 5, ink: "red" }], 10000, null).legend,
    ).toEqual([]);
    expect(
      allowance(
        "口調",
        [
          { key: "a", label: "本人", length: 5, ink: "red" },
          { key: "b", label: "葵", length: 0, ink: "blue" },
        ],
        10000,
        null,
      ).legend.map((part) => part.empty),
    ).toEqual([false, true]);
  });
});
