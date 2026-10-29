import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  type CastDocument,
  createEmptyCast,
  createEmptyMember,
  createEmptyPlayGuide,
} from "@shared/cast";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CAST_MISSING,
  castFilePath,
  castImagePath,
  listCasts,
  loadCast,
  sanitizeFolderName,
  saveCast,
  writeCopyLog,
} from "../src/main/library";

// 1×1 の JPEG（中身は何でもよいが、ファイル名のハッシュが変わることを確かめる）
const JPEG_A = `data:image/jpeg;base64,${Buffer.from("fake-jpeg-a").toString("base64")}`;
const JPEG_B = `data:image/jpeg;base64,${Buffer.from("fake-jpeg-b").toString("base64")}`;

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "zetter-forge-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

function castWithImages(): CastDocument {
  const doc = createEmptyCast();
  doc.name = "灯里";
  doc.persona = "古書店の店主。";
  doc.avatar = { file: "pending:a", width: 400, height: 400, bytes: 0 };
  const member = { ...createEmptyMember(), name: "葵" };
  member.avatar = { file: "pending:m", width: 400, height: 400, bytes: 0 };
  doc.members = [member];
  doc.gallery = [{ file: "pending:g", width: 10, height: 20, bytes: 0, id: "g1", blurred: true }];
  return doc;
}

async function filesIn(dir: string): Promise<string[]> {
  try {
    return (await fs.readdir(dir)).sort();
  } catch {
    return [];
  }
}

describe("saveCast", () => {
  it("新しいキャストのフォルダを作り、保存前の画像をハッシュ入りの名前で書き出す", async () => {
    const saved = await saveCast(root, {
      folder: null,
      doc: castWithImages(),
      pendingImages: { "pending:a": JPEG_A, "pending:m": JPEG_B, "pending:g": JPEG_A },
      now: new Date("2026-10-21T00:00:00.000Z"),
    });
    expect(saved.folder).toMatch(/^灯里-[0-9a-f]{8}$/u);
    const images = await filesIn(path.join(root, saved.folder, "images"));
    expect(images).toHaveLength(3);
    expect(images.find((name) => name.startsWith("avatar-"))).toMatch(
      /^avatar-[0-9a-f]{12}\.jpg$/u,
    );
    expect(images.some((name) => name.startsWith("member-02-"))).toBe(true);
    expect(images.some((name) => name.startsWith("gallery-01-"))).toBe(true);
    expect(saved.doc.avatar?.file).toMatch(/^images\/avatar-/u);
    expect(saved.doc.avatar?.bytes).toBe(Buffer.from("fake-jpeg-a").length);
    expect(saved.doc.gallery[0]).toMatchObject({ id: "g1", blurred: true, width: 10, height: 20 });
    expect(saved.replacedImages["pending:a"]?.file).toBe(saved.doc.avatar?.file);
    expect(saved.doc.updatedAt).toBe("2026-10-21T00:00:00.000Z");
    const onDisk = JSON.parse(
      await fs.readFile(path.join(root, saved.folder, "cast.json"), "utf8"),
    );
    expect(onDisk).toEqual(saved.doc);
  });

  it("dataURL が届かなかった画像は参照ごと外す", async () => {
    const saved = await saveCast(root, { folder: null, doc: castWithImages(), pendingImages: {} });
    expect(saved.doc.avatar).toBeNull();
    expect(saved.doc.members[0]?.avatar).toBeNull();
    expect(saved.doc.gallery).toEqual([]);
  });

  it("保存のたびに前の版を history に残し、どこからも参照されない画像を消す", async () => {
    const first = await saveCast(root, {
      folder: null,
      doc: castWithImages(),
      pendingImages: { "pending:a": JPEG_A, "pending:m": JPEG_A, "pending:g": JPEG_A },
    });
    const dir = path.join(root, first.folder);
    // アイコンを差し替える
    const second = await saveCast(root, {
      folder: first.folder,
      doc: { ...first.doc, avatar: { file: "pending:new", width: 400, height: 400, bytes: 0 } },
      pendingImages: { "pending:new": JPEG_B },
    });
    expect(await filesIn(path.join(dir, "history"))).toHaveLength(1);
    // 古いアイコンは history の版が参照しているので残る
    expect(
      (await filesIn(path.join(dir, "images"))).filter((name) => name.startsWith("avatar-")),
    ).toHaveLength(2);
    // history を消すと、次の保存で古いアイコンは片付く
    await fs.rm(path.join(dir, "history"), { recursive: true });
    await saveCast(root, {
      folder: second.folder,
      doc: { ...second.doc, memo: "更新" },
      pendingImages: {},
    });
    expect(
      (await filesIn(path.join(dir, "images"))).filter((name) => name.startsWith("avatar-")),
    ).toHaveLength(1);
  });

  it("知らないキーを保存しても読み込んでも残す", async () => {
    const doc = { ...createEmptyCast(), name: "未来", futureField: { nested: [1, 2] } };
    const saved = await saveCast(root, { folder: null, doc, pendingImages: {} });
    const loaded = await loadCast(root, saved.folder);
    expect((loaded.doc as unknown as Record<string, unknown>).futureField).toEqual({
      nested: [1, 2],
    });
  });

  it("遊び方シートのない前の版のファイルは、開いても書き換えず、保存してもほかの中身はそのまま", async () => {
    // 0.2.0 までの版が書いた cast.json（playGuide がない）
    const { playGuide: _, ...older } = { ...createEmptyCast(), name: "灯里", persona: "店主。" };
    const folder = "灯里-older";
    const file = path.join(root, folder, "cast.json");
    const text = `${JSON.stringify(older, null, 2)}\n`;
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, text, "utf8");

    const loaded = await loadCast(root, folder);
    expect(loaded.doc.playGuide).toEqual(createEmptyPlayGuide());
    expect(loaded.notices).toEqual([]);
    expect(await fs.readFile(file, "utf8")).toBe(text);

    const saved = await saveCast(root, { folder, doc: loaded.doc, pendingImages: {} });
    const {
      playGuide,
      updatedAt: _updatedAt,
      ...rest
    } = JSON.parse(await fs.readFile(file, "utf8"));
    const { updatedAt: _olderUpdatedAt, ...olderRest } = older;
    expect(rest).toEqual(olderRest);
    expect(playGuide).toEqual(createEmptyPlayGuide());
    expect(saved.doc.formatVersion).toBe(older.formatVersion);
    // 前の版は history に残る
    const history = await filesIn(path.join(root, folder, "history"));
    expect(history).toHaveLength(1);
    expect(
      await fs.readFile(path.join(root, folder, "history", history[0] as string), "utf8"),
    ).toBe(text);
  });

  it("新しい版で保存されたファイルには知らせを付ける", async () => {
    const saved = await saveCast(root, {
      folder: null,
      doc: { ...createEmptyCast(), formatVersion: 99 },
      pendingImages: {},
    });
    expect((await loadCast(root, saved.folder)).notices).toHaveLength(1);
  });

  it("見つからないフォルダへの保存は、フォルダがないことが分かるエラー", async () => {
    const saving = saveCast(root, { folder: "ない", doc: createEmptyCast(), pendingImages: {} });
    await expect(saving).rejects.toThrow("キャストのフォルダが見つかりません");
    await expect(saving).rejects.toMatchObject({ code: CAST_MISSING });
    // 保存先のフォルダを勝手に作らない
    expect(await filesIn(root)).toEqual([]);
  });
});

describe("コピーした記録", () => {
  it("書いた記録を読み込みで返し、壊れた記録は空として読む", async () => {
    const saved = await saveCast(root, { folder: null, doc: castWithImages(), pendingImages: {} });
    expect((await loadCast(root, saved.folder)).copyLog).toEqual({});
    const log = { "cast/name": { hash: "0123abcd", at: "2026-10-21T00:00:00.000Z" } };
    await writeCopyLog(root, saved.folder, log);
    expect((await loadCast(root, saved.folder)).copyLog).toEqual(log);
    await fs.writeFile(path.join(root, saved.folder, "copied.json"), "{ broken");
    expect((await loadCast(root, saved.folder)).copyLog).toEqual({});
  });

  it("続けて書いても、最後に書いた記録が残る", async () => {
    const saved = await saveCast(root, { folder: null, doc: castWithImages(), pendingImages: {} });
    const writes = Array.from({ length: 8 }, (_, index) =>
      writeCopyLog(root, saved.folder, {
        [`cast/${index}`]: { hash: String(index), at: "2026-10-21T00:00:00.000Z" },
      }),
    );
    await Promise.all(writes);
    expect(Object.keys((await loadCast(root, saved.folder)).copyLog)).toEqual(["cast/7"]);
    const names = await filesIn(path.join(root, saved.folder));
    expect(names.filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("ないキャストには書かない", async () => {
    await expect(writeCopyLog(root, "ない", {})).rejects.toMatchObject({ code: CAST_MISSING });
    expect(await filesIn(root)).toEqual([]);
  });
});

describe("画像のファイルの場所", () => {
  it("キャストの images の中のファイルだけ返す", async () => {
    const saved = await saveCast(root, {
      folder: null,
      doc: castWithImages(),
      pendingImages: { "pending:a": JPEG_A },
    });
    const file = saved.doc.avatar?.file as string;
    expect(await castImagePath(root, saved.folder, file)).toBe(path.join(root, saved.folder, file));
    await expect(castImagePath(root, saved.folder, "cast.json")).rejects.toThrow();
    await expect(castImagePath(root, saved.folder, "images/../cast.json")).rejects.toThrow();
    await expect(castImagePath(root, saved.folder, "images/none.jpg")).rejects.toThrow(
      "見つかりません",
    );
  });
});

describe("listCasts", () => {
  it("新しい順に並べ、壊れた cast.json は errors に入れる", async () => {
    const older = await saveCast(root, {
      folder: null,
      doc: { ...createEmptyCast(), name: "古い" },
      pendingImages: {},
      now: new Date("2026-01-01T00:00:00.000Z"),
    });
    const newer = await saveCast(root, {
      folder: null,
      doc: { ...createEmptyCast(), name: "新しい" },
      pendingImages: {},
      now: new Date("2026-06-01T00:00:00.000Z"),
    });
    await fs.mkdir(path.join(root, "壊れた"));
    await fs.writeFile(path.join(root, "壊れた", "cast.json"), "{ broken");
    await fs.mkdir(path.join(root, "関係ないフォルダ"));
    const listing = await listCasts(root);
    expect(listing.casts.map((cast) => cast.folder)).toEqual([newer.folder, older.folder]);
    expect(listing.errors).toEqual([
      { folder: "壊れた", message: "cast.json が JSON として読めません。" },
    ]);
  });
});

describe("パス", () => {
  it("キャストのフォルダの外は指せない", () => {
    expect(() => castFilePath(root, "a", "../b/cast.json")).toThrow();
    expect(() => castFilePath(root, "..", "cast.json")).toThrow();
    expect(() => castFilePath(root, "a/b", "cast.json")).toThrow();
    expect(castFilePath(root, "a", "images/x.jpg")).toBe(path.join(root, "a", "images", "x.jpg"));
  });

  it("Windows で使えない文字と予約名を避ける", () => {
    expect(sanitizeFolderName('a<b>:c"d/e\\f|g?h*i')).toBe("abcdefghi");
    expect(sanitizeFolderName("CON")).toBe("CON_");
    expect(sanitizeFolderName("名前. ")).toBe("名前");
    expect(Array.from(sanitizeFolderName("🌙".repeat(50)))).toHaveLength(40);
  });
});
