import { createEmptyMember } from "@shared/cast";
import type { SaveCastRequest } from "@shared/ipc";
import { LIMITS } from "@shared/limits";
import { describe, expect, it } from "vitest";

import {
  castNamed,
  createWorld,
  croppedImage,
  listing,
  loadedCast,
  opened,
  savedFrom,
  started,
} from "./helpers/world";

const name = (value: string) => ({ type: "input" as const, path: ["cast", "name"], value });

describe("ライブラリ", () => {
  it("読めなければ、読み込み中のままにせず、読み直せる形で知らせる", async () => {
    const world = createWorld();
    world.dispatch({ type: "app/start" });
    world.take("getLibrary").reject(new Error("EEXIST: file already exists"));
    await world.flush();
    expect(world.vm().sidebar.status).toEqual({
      kind: "failed",
      message: "EEXIST: file already exists",
    });
    world.dispatch({ type: "library/retry" });
    world.take("getLibrary").resolve(listing([{ name: "灯里" }]));
    await world.flush();
    expect(world.vm().sidebar.status).toBeNull();
    expect(world.vm().sidebar.items.map((item) => item.title)).toEqual(["灯里"]);
  });

  it("窓に戻ってきたら読み直す（続けて戻ってきたときは間をあける）", async () => {
    const world = await started();
    world.advance(5000);
    world.dispatch({ type: "window/focus" });
    expect(world.pending()).toEqual(["getLibrary"]);
    world.take("getLibrary").resolve(listing());
    await world.flush();
    world.advance(1000);
    world.dispatch({ type: "window/focus" });
    expect(world.pending()).toEqual([]);
  });

  it("絞り込みは、ひらがな・カタカナと全角・半角を区別しない", async () => {
    const world = await started([{ name: "アカリ" }, { name: "ＡＯＩ" }]);
    world.dispatch({ type: "library/query", value: "あかり" });
    expect(world.vm().sidebar.items.map((item) => item.title)).toEqual(["アカリ"]);
    world.dispatch({ type: "library/query", value: "aoi" });
    expect(world.vm().sidebar.items.map((item) => item.title)).toEqual(["ＡＯＩ"]);
  });
});

describe("保存", () => {
  it("保存しているあいだは「保存中…」で、新しいキャストはフォルダなしで送る", async () => {
    const world = await started();
    world.dispatch({ type: "library/new" });
    world.dispatch(name("灯里"));
    world.dispatch({ type: "editor/save" });
    expect(world.pending()).toEqual(["saveCast"]);
    const request = world.calls[0]?.args[0] as SaveCastRequest | undefined;
    expect(request?.folder).toBeNull();
    expect(world.vm().workspace).toMatchObject({ editor: { saveState: { text: "保存中…" } } });
  });

  it("保存が終わると、同じ編集のまとまりのまま保存済みになる", async () => {
    const world = await started();
    world.dispatch({ type: "library/new" });
    const key = world.session().key;
    world.dispatch(name("灯里"));
    world.dispatch({ type: "add", path: ["members"] });
    const member = world.session().doc.members[0]?.id;
    world.dispatch({ type: "editor/save" });
    const call = world.take("saveCast");
    call.resolve(savedFrom(call.args[0] as SaveCastRequest, "灯里-1234"));
    await world.flush();
    const session = world.session();
    expect(session.key).toBe(key);
    expect(session.folder).toBe("灯里-1234");
    expect(session.dirty).toBe(false);
    expect(session.ui.character).toBe(member);
  });

  it("保存中に別のキャストを開くと、保存が終わってから開く（保存先を取り違えない）", async () => {
    const world = await started([{ name: "A" }, { name: "B" }]);
    await opened(world, "cast-1", castNamed("B"));
    world.dispatch(name("B2"));
    world.dispatch({ type: "editor/save" });
    world.dispatch({ type: "library/open", folder: "cast-0" });
    // まだ開かない
    expect(world.pending()).toEqual(["saveCast"]);
    const save = world.take("saveCast");
    expect((save.args[0] as SaveCastRequest).folder).toBe("cast-1");
    save.resolve(savedFrom(save.args[0] as SaveCastRequest));
    await world.flush();
    world.take("getLibrary").resolve(listing([{ name: "A" }, { name: "B2" }]));
    world.take("loadCast").resolve(loadedCast("cast-0", castNamed("A")));
    await world.flush();
    expect(world.session().folder).toBe("cast-0");
    expect(world.session().doc.name).toBe("A");
    expect(world.session().dirty).toBe(false);
  });

  it("保存中に書き足してから別のキャストを開こうとしたら、もう一度確かめる", async () => {
    const world = await started([{ name: "A" }, { name: "B" }]);
    await opened(world, "cast-1", castNamed("B"));
    world.dispatch(name("B2"));
    world.dispatch({ type: "editor/save" });
    world.dispatch(name("B3"));
    world.dispatch({ type: "library/open", folder: "cast-0" });
    const save = world.take("saveCast");
    save.resolve(savedFrom(save.args[0] as SaveCastRequest));
    await world.flush();
    expect(world.pending()).not.toContain("loadCast");
    expect(world.mediator.getState().dialog).toMatchObject({ kind: "confirm" });
    expect(world.session().doc.name).toBe("B3");
    expect(world.session().dirty).toBe(true);
  });

  it("保存中にもう一度保存を頼むと、終わってから書き足した分も保存する", async () => {
    const world = await started();
    await opened(world, "cast-0", castNamed("A"));
    world.dispatch(name("A2"));
    world.dispatch({ type: "editor/save" });
    world.dispatch(name("A3"));
    world.dispatch({ type: "menu", command: "save" });
    expect(world.pending()).toEqual(["saveCast"]);
    const first = world.take("saveCast");
    first.resolve(savedFrom(first.args[0] as SaveCastRequest));
    await world.flush();
    const second = world.take("saveCast");
    expect((second.args[0] as SaveCastRequest).doc.name).toBe("A3");
    second.resolve(savedFrom(second.args[0] as SaveCastRequest));
    await world.flush();
    expect(world.session().dirty).toBe(false);
  });

  it("保存中に書き足した分は残し、書き出した画像の参照だけを差し替える", async () => {
    const world = await started();
    world.dispatch({ type: "library/new" });
    world.dispatch({
      type: "pick",
      path: ["cast", "avatar"],
      files: [{ name: "a.jpg", type: "image/jpeg", size: 10 }],
    });
    world.take("read").resolve("data:image/jpeg;base64,AAAA");
    await world.flush();
    world.dispatch({ type: "crop/confirm", canvas: { width: 1, height: 1, toDataURL: () => "" } });
    world.take("encode").resolve(croppedImage);
    await world.flush();
    const pending = world.session().doc.avatar?.file as string;
    expect(pending).toMatch(/^pending:/u);
    world.dispatch({ type: "editor/save" });
    world.dispatch(name("書き足し"));
    const save = world.take("saveCast");
    const request = save.args[0] as SaveCastRequest;
    expect(Object.keys(request.pendingImages)).toEqual([pending]);
    save.resolve(savedFrom(request, "new-folder"));
    await world.flush();
    const session = world.session();
    expect(session.doc.avatar?.file).toMatch(/^images\//u);
    expect(session.doc.name).toBe("書き足し");
    expect(session.dirty).toBe(true);
    expect(session.pendingImages).toEqual({});
  });

  it("保存先のフォルダがなくなっていたら、新しいキャストとして保存し直せる", async () => {
    const world = await started();
    await opened(
      world,
      "cast-0",
      castNamed("A", { avatar: { file: "images/a.jpg", width: 1, height: 1, bytes: 1 } }),
    );
    world.dispatch(name("A2"));
    world.dispatch({ type: "editor/save" });
    world.take("saveCast").resolve({ kind: "missing", message: "フォルダが見つかりません。" });
    await world.flush();
    const dialog = world.mediator.getState().dialog;
    expect(dialog).toMatchObject({ kind: "confirm", title: "保存先のフォルダが見つかりません" });
    world.dispatch({ type: "dialog/choose", choice: "save-as-new" });
    const request = world.take("saveCast").args[0] as SaveCastRequest;
    expect(request.folder).toBeNull();
    expect(request.doc.name).toBe("A2");
    // 元のフォルダの画像は新しいフォルダにはないので外す
    expect(request.doc.avatar).toBeNull();
  });

  it("保存先が見つからなくても、画像を切り抜いている途中なら閉じずに知らせ、次の保存で勧める", async () => {
    const world = await started();
    await opened(world, "cast-0", castNamed("A"));
    world.dispatch(name("A2"));
    world.dispatch({ type: "editor/save" });
    world.dispatch({
      type: "pick",
      path: ["cast", "avatar"],
      files: [{ name: "a.jpg", type: "image/jpeg", size: 10 }],
    });
    world.take("saveCast").resolve({ kind: "missing", message: "フォルダが見つかりません。" });
    await world.flush();
    expect(world.mediator.getState().dialog).toMatchObject({ kind: "crop" });
    expect(world.mediator.getState().toasts.at(-1)).toMatchObject({
      tone: "error",
      message: "保存できませんでした: フォルダが見つかりません。",
    });
    world.dispatch({ type: "crop/cancel" });
    world.dispatch({ type: "editor/save" });
    world.take("saveCast").resolve({ kind: "missing", message: "フォルダが見つかりません。" });
    await world.flush();
    expect(world.mediator.getState().dialog).toMatchObject({
      kind: "confirm",
      title: "保存先のフォルダが見つかりません",
    });
  });

  it("保存のほかの失敗では、新しいキャストとしての保存は勧めない", async () => {
    const world = await started();
    await opened(world, "cast-0", castNamed("A"));
    world.dispatch(name("A2"));
    world.dispatch({ type: "editor/save" });
    world.take("saveCast").reject(new Error("EACCES: permission denied"));
    await world.flush();
    expect(world.mediator.getState().dialog).toBeNull();
    expect(world.mediator.getState().toasts.at(-1)).toMatchObject({ tone: "error" });
    expect(world.session().dirty).toBe(true);
  });
});

describe("開く・作る", () => {
  it("保存していない変更があれば確かめる（保存して開く・保存しないで開く・キャンセル）", async () => {
    const world = await started([{ name: "A" }, { name: "B" }]);
    await opened(world, "cast-1", castNamed("B"));
    world.dispatch(name("B2"));
    world.dispatch({ type: "library/open", folder: "cast-0" });
    expect(world.pending()).toEqual([]);
    const vm = world.vm().dialog;
    expect(vm).toMatchObject({ kind: "confirm", initial: "save" });
    expect(vm?.kind === "confirm" && vm.choices.map((choice) => choice.id)).toEqual([
      "save",
      "discard",
    ]);
    world.dispatch({ type: "dialog/cancel" });
    expect(world.mediator.getState().dialog).toBeNull();
    expect(world.session().doc.name).toBe("B2");

    world.dispatch({ type: "library/open", folder: "cast-0" });
    world.dispatch({ type: "dialog/choose", choice: "save" });
    const save = world.take("saveCast");
    save.resolve(savedFrom(save.args[0] as SaveCastRequest));
    await world.flush();
    expect(world.take("loadCast").args).toEqual(["cast-0"]);
  });

  it("後から頼んだ読み込みが先に終わっても、先に頼んだ古い結果では上書きしない", async () => {
    const world = await started([{ name: "A" }, { name: "B" }]);
    world.dispatch({ type: "library/open", folder: "cast-0" });
    world.dispatch({ type: "library/open", folder: "cast-1" });
    const first = world.take("loadCast");
    const second = world.take("loadCast");
    second.resolve(loadedCast("cast-1", castNamed("B")));
    await world.flush();
    first.resolve(loadedCast("cast-0", castNamed("A")));
    await world.flush();
    expect(world.session().folder).toBe("cast-1");
  });

  it("読み込みのあいだに書き換えたら、黙って捨てずに確かめる", async () => {
    const world = await started([{ name: "A" }, { name: "B" }]);
    await opened(world, "cast-1", castNamed("B"));
    world.dispatch({ type: "library/open", folder: "cast-0" });
    world.dispatch(name("B2"));
    world.take("loadCast").resolve(loadedCast("cast-0", castNamed("A")));
    await world.flush();
    expect(world.session().doc.name).toBe("B2");
    expect(world.mediator.getState().dialog).toMatchObject({ kind: "confirm" });
    world.dispatch({ type: "dialog/choose", choice: "discard" });
    expect(world.session().folder).toBe("cast-0");
  });

  it("読み込みのあいだに書き換えたら、保存してから開くこともできる", async () => {
    const world = await started([{ name: "A" }, { name: "B" }]);
    await opened(world, "cast-1", castNamed("B"));
    world.dispatch({ type: "library/open", folder: "cast-0" });
    world.dispatch(name("B2"));
    world.take("loadCast").resolve(loadedCast("cast-0", castNamed("A")));
    await world.flush();
    expect(world.vm().dialog).toMatchObject({ kind: "confirm", initial: "save" });
    world.dispatch({ type: "dialog/choose", choice: "save" });
    const save = world.take("saveCast");
    expect(save.args[0]).toMatchObject({ folder: "cast-1", doc: { name: "B2" } });
    save.resolve(savedFrom(save.args[0] as SaveCastRequest));
    await world.flush();
    world.take("loadCast").resolve(loadedCast("cast-0", castNamed("A")));
    await world.flush();
    expect(world.session().folder).toBe("cast-0");
  });

  it("読み込みのあいだに出した確かめは閉じ、開いたキャストには効かない", async () => {
    const world = await started([{ name: "A" }, { name: "B" }]);
    await opened(world, "cast-1", castNamed("B"));
    world.dispatch({ type: "library/open", folder: "cast-0" });
    world.dispatch({ type: "transfer/reset" });
    expect(world.mediator.getState().dialog).toMatchObject({ kind: "confirm" });
    const copyLog = { "cast/name": { hash: "00000000", at: "2026-10-20T00:00:00.000Z" } };
    world.take("loadCast").resolve(loadedCast("cast-0", castNamed("A"), copyLog));
    await world.flush();
    expect(world.session().folder).toBe("cast-0");
    expect(world.mediator.getState().dialog).toBeNull();
    world.dispatch({ type: "dialog/choose", choice: "reset" });
    expect(world.session().copyLog).toEqual(copyLog);
    expect(world.pending()).not.toContain("writeCopyLog");
  });

  it("読み込みのあいだに保存を頼むと、先に保存してから開き直す", async () => {
    const world = await started([{ name: "A" }, { name: "B" }]);
    await opened(world, "cast-1", castNamed("B"));
    world.dispatch({ type: "library/open", folder: "cast-0" });
    world.dispatch(name("B2"));
    world.dispatch({ type: "menu", command: "save" });
    const load = world.take("loadCast");
    const save = world.take("saveCast");
    expect(save.args[0]).toMatchObject({ folder: "cast-1", doc: { name: "B2" } });
    // 保存を始める前に頼んだ読み込みの結果は使わない
    load.resolve(loadedCast("cast-0", castNamed("A")));
    await world.flush();
    expect(world.session().folder).toBe("cast-1");
    save.resolve(savedFrom(save.args[0] as SaveCastRequest));
    await world.flush();
    expect(world.mediator.getState().dialog).toBeNull();
    world.take("loadCast").resolve(loadedCast("cast-0", castNamed("A")));
    await world.flush();
    expect(world.session().folder).toBe("cast-0");
  });

  it("「保存して続ける」のあとに出したダイアログは、保存が終わったら閉じて続ける", async () => {
    const world = await started([{ name: "A" }, { name: "B" }]);
    await opened(world, "cast-1", castNamed("B"));
    world.dispatch(name("B2"));
    world.dispatch({ type: "library/open", folder: "cast-0" });
    world.dispatch({ type: "dialog/choose", choice: "save" });
    world.dispatch({ type: "transfer/reset" });
    expect(world.mediator.getState().dialog).toMatchObject({ kind: "confirm" });
    const save = world.take("saveCast");
    save.resolve(savedFrom(save.args[0] as SaveCastRequest));
    await world.flush();
    expect(world.mediator.getState().dialog).toBeNull();
    expect(world.take("loadCast").args).toEqual(["cast-0"]);
  });

  it("読み込み中に別のキャストを開こうとして確かめているあいだは、先の読み込みで差し替えない", async () => {
    const world = await started([{ name: "A" }, { name: "B" }, { name: "C" }]);
    await opened(world, "cast-1", castNamed("B"));
    world.dispatch({ type: "library/open", folder: "cast-0" });
    world.dispatch(name("B2"));
    world.dispatch({ type: "library/open", folder: "cast-2" });
    expect(world.mediator.getState().dialog).toMatchObject({
      kind: "confirm",
      message: expect.stringContaining("「C」を開く") as string,
    });
    world.take("loadCast").resolve(loadedCast("cast-0", castNamed("A")));
    await world.flush();
    expect(world.mediator.getState().dialog).toMatchObject({
      message: expect.stringContaining("「C」を開く") as string,
    });
    world.dispatch({ type: "dialog/choose", choice: "discard" });
    world.take("loadCast").resolve(loadedCast("cast-2", castNamed("C")));
    await world.flush();
    expect(world.session().folder).toBe("cast-2");
  });

  it("保存先を選んでいるあいだは、キャストを切り替えず、選んだ保存先を捨てない", async () => {
    const world = await started([{ name: "A" }]);
    world.dispatch({ type: "library/choose-root" });
    const choose = world.take("chooseLibraryRoot");
    world.dispatch({ type: "menu", command: "new" });
    world.dispatch({ type: "library/open", folder: "cast-0" });
    expect(world.pending()).toEqual([]);
    expect(world.mediator.getState().session).toBeNull();
    choose.resolve({ ...listing([{ name: "B" }]), root: "/other" });
    await world.flush();
    expect(world.vm().sidebar.root).toBe("/other");
    expect(world.vm().sidebar.items.map((item) => item.title)).toEqual(["B"]);
  });

  it("ダイアログを出しているあいだは、メニューの新規・保存を受け付けない", async () => {
    const world = await started();
    world.dispatch({ type: "library/new" });
    world.dispatch(name("A"));
    world.dispatch({ type: "menu", command: "new" });
    expect(world.mediator.getState().dialog).toMatchObject({ kind: "confirm" });
    world.dispatch({ type: "menu", command: "save" });
    world.dispatch({ type: "menu", command: "new" });
    expect(world.pending()).toEqual([]);
    expect(world.session().doc.name).toBe("A");
  });
});

describe("書き換え", () => {
  it("{{user}} が上限に入りきらないときは、本文を削らずに入れない", async () => {
    const world = await started();
    world.dispatch({ type: "library/new" });
    world.dispatch({ type: "add", path: ["intro"] });
    const text = `${"あ".repeat(3990)}おわり。`;
    world.dispatch({ type: "input", path: ["intro", 0, "text"], value: text });
    world.dispatch({
      type: "insert",
      path: ["intro", 0, "text"],
      text: "{{user}}",
      selection: { start: 0, end: 0 },
    });
    expect(world.session().doc.introScript[0]?.text).toBe(text);
    expect(world.mediator.getState().toasts.at(-1)).toMatchObject({ tone: "error" });
    world.dispatch({ type: "input", path: ["intro", 0, "text"], value: "やあ" });
    world.dispatch({
      type: "insert",
      path: ["intro", 0, "text"],
      text: "{{user}}",
      selection: { start: 2, end: 2 },
    });
    expect(world.session().doc.introScript[0]?.text).toBe("やあ{{user}}");
    expect(world.session().ui.focus).toMatchObject({
      path: ["intro", 0, "text"],
      selection: { start: 10, end: 10 },
    });
  });

  it("フォーカスを移す頼みは一度きりで、タブを切り替えて戻っても効かない", async () => {
    const world = await started();
    world.dispatch({ type: "library/new" });
    world.dispatch({ type: "add", path: ["cast", "toneExamples"] });
    expect(world.session().ui.focus?.path).toEqual(["cast", "toneExamples", 0, "situation"]);
    world.dispatch({ type: "reveal" });
    expect(world.session().ui.focus).not.toBeNull();
    world.dispatch({ type: "editor/tab", tab: "memo" });
    world.dispatch({ type: "editor/tab", tab: "character" });
    expect(world.session().ui.focus).toBeNull();
  });

  it("消したものは「元に戻す」で戻せる（そのあと書き換えたら戻さない）", async () => {
    const world = await started();
    world.dispatch({ type: "library/new" });
    world.dispatch({ type: "add", path: ["tags"] });
    world.dispatch({ type: "input", path: ["tags", 0], value: "古書店" });
    world.dispatch({ type: "remove", path: ["tags", 0] });
    expect(world.session().doc.tags).toEqual([]);
    const toast = world.vm().toasts.at(-1);
    expect(toast).toMatchObject({ undoable: true });
    world.dispatch({ type: "toast/undo", id: toast?.id as number });
    expect(world.session().doc.tags).toEqual(["古書店"]);

    world.dispatch({ type: "remove", path: ["tags", 0] });
    world.dispatch(name("あとから"));
    const stale = world.vm().toasts.find((candidate) => candidate.message === "タグを外しました。");
    expect(stale?.undoable).toBe(false);
    world.dispatch({ type: "toast/undo", id: stale?.id as number });
    expect(world.session().doc.tags).toEqual([]);
  });

  it("登場人物は確かめてから消し、話者と好感度の個別設定も消える", async () => {
    const world = await started();
    world.dispatch({ type: "library/new" });
    world.dispatch({ type: "add", path: ["members"] });
    const id = world.session().doc.members[0]?.id as string;
    world.dispatch({ type: "input", path: ["members", id, "name"], value: "葵" });
    world.dispatch({ type: "add", path: ["intro"] });
    world.dispatch({ type: "input", path: ["intro", 0, "role"], value: `speech:${id}` });
    world.dispatch({ type: "remove", path: ["members", id] });
    expect(world.session().doc.members).toHaveLength(1);
    world.dispatch({ type: "dialog/choose", choice: "remove" });
    expect(world.session().doc.members).toEqual([]);
    expect(world.session().doc.introScript[0]?.speakerId).toBeNull();
    expect(world.session().ui.character).toBe("main");
  });

  it("確認欄から、直す場所（人・欄）へ移る", async () => {
    const world = await started();
    world.dispatch({ type: "library/new" });
    world.dispatch({ type: "add", path: ["members"] });
    const member = { ...createEmptyMember(), profile: "名前なし" };
    world.dispatch({
      type: "input",
      path: ["members", world.session().doc.members[0]?.id as string, "profile"],
      value: member.profile,
    });
    world.dispatch({ type: "editor/character", id: "main" });
    world.dispatch({ type: "editor/tab", tab: "publish" });
    const editor = world.vm().workspace;
    const issue =
      editor.kind === "editor"
        ? editor.editor.checks.groups
            .flatMap((group) => group.issues)
            .find((candidate) => candidate.message === "登場人物の名前を入力してください。")
        : undefined;
    expect(issue?.path).not.toBeNull();
    world.dispatch({
      type: "editor/jump",
      tab: issue?.tab ?? "character",
      target: issue?.path ?? null,
    });
    const ui = world.session().ui;
    expect(ui.tab).toBe("character");
    expect(ui.character).toBe(world.session().doc.members[0]?.id);
    expect(ui.focus?.path).toEqual(issue?.path);
  });
});

describe("画像", () => {
  it("ギャラリーは空きの枚数だけ切り抜き、読めない画像は飛ばす", async () => {
    const world = await started();
    const gallery = Array.from({ length: LIMITS.gallery - 2 }, (_, index) => ({
      file: `images/gallery-${index}.jpg`,
      width: 1,
      height: 1,
      bytes: 1,
      id: `g${index}`,
      blurred: false,
    }));
    await opened(world, "cast-0", castNamed("A", { gallery }));
    const file = (index: number) => ({ name: `${index}.jpg`, type: "image/jpeg", size: 10 });
    world.dispatch({
      type: "pick",
      path: ["gallery"],
      files: [file(1), file(2), file(3), file(4)],
    });
    expect(world.mediator.getState().dialog).toMatchObject({ kind: "crop", total: 2 });
    world.take("read").reject(new Error("画像ファイルを選択してください。"));
    await world.flush();
    expect(world.mediator.getState().dialog).toMatchObject({
      kind: "crop",
      index: 2,
      error: "1枚目の画像を開けませんでした: 画像ファイルを選択してください。",
    });
    world.dispatch({ type: "crop/failed", message: "画像として読めませんでした。" });
    expect(world.mediator.getState().dialog).toBeNull();
    expect(world.mediator.getState().toasts.at(-1)).toMatchObject({ tone: "error" });
  });
});

describe("Zetter へ写す", () => {
  it("コピーした項目を覚え、書き換えたら「書き換えあり」になる", async () => {
    const world = await started();
    await opened(world, "cast-0", castNamed("灯里"));
    world.dispatch({ type: "copy", path: ["cast", "name"] });
    const copy = world.take("copyText");
    expect(copy.args).toEqual(["灯里"]);
    copy.resolve(undefined);
    await world.flush();
    const write = world.take("writeCopyLog");
    expect(write.args[0]).toBe("cast-0");
    expect(Object.keys(write.args[1] as object)).toEqual(["cast/name"]);
    world.dispatch({ type: "editor/tab", tab: "transfer" });
    const status = () => {
      const editor = world.vm().workspace;
      if (editor.kind !== "editor" || editor.editor.panel.tab !== "transfer")
        throw new Error("写すタブではありません");
      return editor.editor.panel.vm.groups[0]?.sections[0]?.items.find(
        (item) => item.key === "cast/name",
      )?.status;
    };
    expect(status()).toBe("done");
    world.dispatch(name("灯"));
    expect(status()).toBe("changed");
  });

  it("「次の項目をコピー」は Zetter の欄の順に、まだのものを 1 つずつコピーする", async () => {
    const world = await started();
    await opened(
      world,
      "cast-0",
      castNamed("灯里", { persona: "古書店の店主", tagline: "雨の日だけ開く" }),
    );
    const copyNext = async () => {
      world.dispatch({ type: "menu", command: "copy-next" });
      const call = world.take("copyText");
      call.resolve(undefined);
      await world.flush();
      world.take("writeCopyLog").resolve(undefined);
      return call.args[0];
    };
    const first = await copyNext();
    const second = await copyNext();
    const third = await copyNext();
    expect([first, second, third]).toEqual(["灯里", "古書店の店主", "雨の日だけ開く"]);
  });

  it("Zetter を開くと、控えた URL があればそのページ、なければ Zetter を開く", async () => {
    const world = await started();
    await opened(world, "cast-0", castNamed("灯里"));
    world.dispatch({ type: "transfer/open-zetter" });
    expect(world.take("openExternal").args).toEqual(["https://z-etter.com/"]);
    world.dispatch({
      type: "input",
      path: ["cast", "zetterUrl"],
      value: " https://z-etter.com/cast/42 ",
    });
    world.dispatch({ type: "transfer/open-zetter" });
    expect(world.take("openExternal").args).toEqual(["https://z-etter.com/cast/42"]);
    world.dispatch({ type: "input", path: ["cast", "zetterUrl"], value: "file:///etc/passwd" });
    world.dispatch({ type: "transfer/open-zetter" });
    expect(world.take("openExternal").args).toEqual(["https://z-etter.com/"]);
  });

  it("まだ保存していない画像は、場所をコピーできないことを知らせる", async () => {
    const world = await started();
    world.dispatch({ type: "library/new" });
    world.dispatch({
      type: "pick",
      path: ["cast", "avatar"],
      files: [{ name: "a.jpg", type: "image/jpeg", size: 1 }],
    });
    world.take("read").resolve("data:image/jpeg;base64,AAAA");
    await world.flush();
    world.dispatch({ type: "crop/confirm", canvas: { width: 1, height: 1, toDataURL: () => "" } });
    world.take("encode").resolve(croppedImage);
    await world.flush();
    world.dispatch({ type: "copy", path: ["cast", "avatar"] });
    expect(world.pending()).toEqual([]);
    expect(world.mediator.getState().toasts.at(-1)).toMatchObject({ tone: "error" });
  });
});
