// MCP サーバーからの頼み（Remote）を、仲介役を動かして確かめる。外とのやり取りは偽物（helpers/world）。
import { createDefaultAffinityConfig } from "@shared/cast";
import type { SaveCastRequest } from "@shared/ipc";
import { LIMITS } from "@shared/limits";
import type { RemoteEdit, RemoteReply } from "@shared/remote";
import { describe, expect, it } from "vitest";

import { Remote } from "../src/renderer/src/app/remote";
import { type World, castNamed, loadedCast, opened, savedFrom, started } from "./helpers/world";

/** 待ちの打ち切り（timers に溜め、テストが好きなときに呼ぶ） */
function remoteOf(world: World, timers: (() => void)[] = []): Remote {
  return new Remote(world.mediator, { schedule: (_ms, task) => void timers.push(task) });
}

function resultOf(reply: RemoteReply): Record<string, unknown> {
  if (!reply.ok) throw new Error(`断られました: ${reply.error}`);
  return reply.result;
}

async function edit(remote: Remote, ...edits: RemoteEdit[]) {
  const result = resultOf(await remote.handle({ kind: "edit", edits }));
  return result as { results: Record<string, unknown>[]; issues: { path: string | null }[] };
}

describe("MCP サーバーからの頼み: 読む", () => {
  it("いまの様子: 開いているキャスト・処理・ダイアログ", async () => {
    const world = await started([{ name: "灯里" }]);
    const remote = remoteOf(world);
    expect(await remote.handle({ kind: "status" })).toEqual({
      ok: true,
      result: { root: "/library", editor: null, busy: null, dialog: null, messages: [] },
    });
    await opened(world, "cast-0", castNamed("灯里"));
    world.dispatch({ type: "input", path: ["cast", "name"], value: "灯里2" });
    expect(resultOf(await remote.handle({ kind: "status" }))).toMatchObject({
      editor: { folder: "cast-0", title: "灯里2", state: "unsaved" },
    });
  });

  it("開いているキャストの中身を、保存していない変更と確認も含めて返す", async () => {
    const world = await started([{ name: "灯里" }]);
    const remote = remoteOf(world);
    expect(await remote.handle({ kind: "read" })).toMatchObject({
      ok: false,
      error: "開いているキャストはありません。",
    });
    await opened(world, "cast-0", castNamed("灯里"));
    world.dispatch({ type: "input", path: ["cast", "persona"], value: "古書店の店主。" });
    const result = resultOf(await remote.handle({ kind: "read" }));
    expect(result).toMatchObject({
      source: "editor",
      folder: "cast-0",
      state: "unsaved",
      cast: { name: "灯里", persona: "古書店の店主。" },
      usage: { settings: { used: 7, limit: LIMITS.settingsTotal } },
    });
    expect(result.issues).toContainEqual(
      expect.objectContaining({ path: "cast/tagline", level: "error" }),
    );
  });

  it("Zetter へ写す項目を、作成画面の順にコピーの記録とあわせて返す", async () => {
    const world = await started([{ name: "灯里" }]);
    await opened(world, "cast-0", castNamed("灯里"));
    const result = resultOf(await remoteOf(world).handle({ kind: "transfer" })) as {
      groups: { title: string; items: Record<string, unknown>[] }[];
    };
    expect(result.groups.map((group) => group.title)).toContain("キャラクター");
    expect(result.groups[0]?.items[0]).toEqual({
      path: "cast/name",
      section: "本人",
      label: "名前",
      kind: "text",
      value: "灯里",
      status: "todo",
      notes: [],
    });
  });
});

describe("MCP サーバーからの頼み: 書き換える", () => {
  it("画面の操作と同じ決まりで書き換え、1 件ずつ結果を返す", async () => {
    const world = await started();
    const remote = remoteOf(world);
    world.dispatch({ type: "library/new" });
    const { results, issues } = await edit(
      remote,
      { action: "set", path: "cast/name", value: "灯里" },
      { action: "add", path: "members" },
      { action: "set", path: "cast/unknown", value: "x" },
      { action: "switch", path: "cast/public", on: true },
      { action: "add", path: "cast/toneExamples" },
      { action: "set", path: "cast/toneExamples/0/situation", value: "雨の日" },
      { action: "set", path: "intro/0/text", value: "（パートがまだない）" },
    );
    const doc = world.session().doc;
    const member = doc.members[0]?.id;
    expect(results.map((entry) => entry.result)).toEqual([
      "applied",
      "applied",
      "ignored",
      "applied",
      "applied",
      "applied",
      "ignored",
    ]);
    expect(results[1]).toMatchObject({ added: `members/${member}` });
    expect(results[4]).toMatchObject({ added: "cast/toneExamples/0" });
    expect(doc).toMatchObject({ name: "灯里", status: "public" });
    expect(doc.toneExamples).toEqual([{ situation: "雨の日", example: "" }]);
    // 足した欄へフォーカスを移さない（利用者が書いている欄から離さない）
    expect(world.session().ui.focus).toBeNull();
    expect(issues).toContainEqual(expect.objectContaining({ path: "cast/persona" }));
  });

  it("上限に合わせて切り詰めたら、入った値を返す", async () => {
    const world = await started();
    world.dispatch({ type: "library/new" });
    const long = "あ".repeat(LIMITS.partnerSettingsTotal + 10);
    const { results } = await edit(remoteOf(world), {
      action: "set",
      path: "cast/partnerSettings/freeform",
      value: long,
    });
    expect(results[0]).toMatchObject({
      result: "applied",
      stored: "あ".repeat(LIMITS.partnerSettingsTotal),
    });
  });

  it("好感度の段階の開始値は、書いたあとで小さい順に並べ直す", async () => {
    const world = await started();
    world.dispatch({ type: "library/new" });
    const { results } = await edit(
      remoteOf(world),
      { action: "add", path: "affinity" },
      { action: "set", path: "affinity/default/stages/1/startValue", value: "90" },
    );
    expect(results[0]).toMatchObject({ result: "applied", added: "affinity/default" });
    expect(world.session().doc.affinity?.default.stages.map((stage) => stage.startValue)).toEqual([
      0, 50, 75, 90,
    ]);
  });

  it("確かめが要る削除はダイアログを出し、そのあとの書き換えは行わない", async () => {
    const world = await started();
    const remote = remoteOf(world);
    world.dispatch({ type: "library/new" });
    await edit(remote, { action: "add", path: "members" });
    const member = world.session().doc.members[0]?.id as string;
    const result = await edit(
      remote,
      { action: "remove", path: `members/${member}` },
      { action: "set", path: "cast/name", value: "灯里" },
    );
    expect(result.results.map((entry) => entry.result)).toEqual(["confirm", "skipped"]);
    expect(result).toMatchObject({
      dialog: { kind: "confirm", choices: [{ id: "remove", label: "削除する" }] },
    });
    expect(world.session().doc.name).toBe("");
    // ダイアログに答えるまで、ほかの書き換えは断る
    const blocked = await remote.handle({
      kind: "edit",
      edits: [{ action: "set", path: "cast/name", value: "灯里" }],
    });
    expect(blocked).toMatchObject({ ok: false, error: expect.stringContaining("answer_dialog") });
    expect(await remote.handle({ kind: "answer", choice: "nope" })).toMatchObject({
      ok: false,
      error: "choice は remove・cancel のどれかにしてください。",
    });
    expect(resultOf(await remote.handle({ kind: "answer", choice: "remove" }))).toMatchObject({
      done: true,
      dialog: null,
    });
    expect(world.session().doc.members).toEqual([]);
  });

  it("キャストを開いていないときや、利用者が設定の画面を開いているときは断る", async () => {
    const world = await started();
    const remote = remoteOf(world);
    const change: RemoteEdit = { action: "set", path: "cast/name", value: "灯里" };
    expect(await remote.handle({ kind: "edit", edits: [change] })).toMatchObject({
      ok: false,
      error: expect.stringContaining("開いているキャストはありません"),
    });
    world.dispatch({ type: "library/new" });
    world.dispatch({ type: "settings/open" });
    expect(await remote.handle({ kind: "edit", edits: [change] })).toMatchObject({
      ok: false,
      error: expect.stringContaining("設定の画面が開いています"),
    });
    expect(await remote.handle({ kind: "answer", choice: "cancel" })).toMatchObject({
      ok: false,
      error: expect.stringContaining("答えられません"),
    });
  });
});

describe("MCP サーバーからの頼み: 開く・作る・保存する", () => {
  it("開いて、読み終えるまで待つ", async () => {
    const world = await started([{ name: "灯里" }]);
    const pending = remoteOf(world).handle({ kind: "open", folder: "cast-0" });
    world.take("loadCast").resolve(loadedCast("cast-0", castNamed("灯里")));
    expect(resultOf(await pending)).toMatchObject({
      done: true,
      editor: { folder: "cast-0", title: "灯里", state: "saved" },
    });
  });

  it("開けなければ、画面に出た知らせを返す", async () => {
    const world = await started([{ name: "灯里" }]);
    const pending = remoteOf(world).handle({ kind: "open", folder: "cast-0" });
    world.take("loadCast").reject(new Error("cast.json が JSON として読めません。"));
    expect(await pending).toMatchObject({
      ok: false,
      error: "開けませんでした: cast.json が JSON として読めません。",
    });
  });

  it("保存していない変更があれば確かめ、答えたら続ける", async () => {
    const world = await started([{ name: "A" }, { name: "B" }]);
    const remote = remoteOf(world);
    await opened(world, "cast-0", castNamed("A"));
    world.dispatch({ type: "input", path: ["cast", "name"], value: "A2" });
    expect(resultOf(await remote.handle({ kind: "open", folder: "cast-1" }))).toMatchObject({
      done: false,
      editor: { folder: "cast-0", state: "unsaved" },
      dialog: {
        kind: "confirm",
        title: "保存していない変更があります",
        choices: [{ id: "save" }, { id: "discard" }],
      },
    });
    const answered = remote.handle({ kind: "answer", choice: "discard" });
    world.take("loadCast").resolve(loadedCast("cast-1", castNamed("B")));
    expect(resultOf(await answered)).toMatchObject({
      done: true,
      editor: { folder: "cast-1", title: "B", state: "saved" },
      dialog: null,
    });
  });

  it("新しいキャストを作り、保存するとフォルダを返す", async () => {
    const world = await started();
    const remote = remoteOf(world);
    expect(resultOf(await remote.handle({ kind: "new" }))).toMatchObject({
      done: true,
      editor: { folder: null, state: "new" },
    });
    await edit(remote, { action: "set", path: "cast/name", value: "灯里" });
    const pending = remote.handle({ kind: "save" });
    const save = world.take("saveCast");
    expect((save.args[0] as SaveCastRequest).doc.name).toBe("灯里");
    save.resolve(savedFrom(save.args[0] as SaveCastRequest, "灯里-1234"));
    expect(resultOf(await pending)).toMatchObject({
      done: true,
      editor: { folder: "灯里-1234", state: "saved" },
      messages: [{ tone: "info", text: "保存しました。" }],
    });
  });

  it("保存できなければ、わけを返す", async () => {
    const world = await started();
    world.dispatch({ type: "library/new" });
    const pending = remoteOf(world).handle({ kind: "save" });
    world.take("saveCast").reject(new Error("EACCES: permission denied"));
    expect(await pending).toMatchObject({
      ok: false,
      error: "保存できませんでした: EACCES: permission denied",
    });
  });

  it("待ちきれなければ、まだ終わっていないと返す", async () => {
    const world = await started();
    const timers: (() => void)[] = [];
    world.dispatch({ type: "library/new" });
    const pending = remoteOf(world, timers).handle({ kind: "save" });
    for (const timer of timers) timer();
    expect(await pending).toMatchObject({
      ok: false,
      error: expect.stringContaining("まだ終わっていません"),
      detail: { busy: "saving" },
    });
  });

  it("好感度の設定を消すときも、ダイアログで確かめる", async () => {
    const world = await started();
    const remote = remoteOf(world);
    world.dispatch({ type: "library/new" });
    world.dispatch({ type: "add", path: ["affinity"] });
    expect(world.session().doc.affinity?.default).toEqual(createDefaultAffinityConfig());
    const { results } = await edit(remote, { action: "remove", path: "affinity" });
    expect(results[0]).toMatchObject({ result: "confirm" });
    expect(resultOf(await remote.handle({ kind: "answer", choice: "cancel" }))).toMatchObject({
      done: true,
    });
    expect(world.session().doc.affinity).not.toBeNull();
  });
});
