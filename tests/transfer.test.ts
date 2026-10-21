import {
  createDefaultAffinityConfig,
  createEmptyCast,
  createEmptyMember,
  type CastDocument,
} from "@shared/cast";
import { normalizeCopyLog, textHash } from "@shared/copyLog";
import { describe, expect, it } from "vitest";

import { allowance } from "../src/renderer/src/app/presenters/allowance";
import {
  findTransferItem,
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

  it("上限を超えている欄には、入りきらないことを添える", () => {
    const item = findTransferItem(cast({ name: "あ".repeat(11) }), ["cast", "name"]);
    expect(item?.notes[0]).toContain("上限の10字を1字超えています");
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
});

describe("コピーした記録のファイル", () => {
  it("形が違うものは空として読む", () => {
    expect(normalizeCopyLog(null)).toEqual({});
    expect(normalizeCopyLog({ format: "other", items: {} })).toEqual({});
    expect(
      normalizeCopyLog({
        format: "zetter-forge/copied",
        items: { "cast/name": { hash: "1", at: "t" }, broken: { hash: 1 } },
      }),
    ).toEqual({ "cast/name": { hash: "1", at: "t" } });
  });

  it("ハッシュは同じ文字なら同じ、違えば違う", () => {
    expect(textHash("灯里")).toBe(textHash("灯里"));
    expect(textHash("灯里")).not.toBe(textHash("灯"));
    expect(textHash("")).toMatch(/^[0-9a-f]{8}$/u);
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
