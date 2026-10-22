// MCP サーバーを、公式の SDK のクライアントから HTTP でつないで確かめる。画面（仲介役）は偽物にして、
// 届いた頼みを控え、決めた返事を返す。保存先は本物のフォルダを使う。
import { promises as fs } from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createEmptyCast } from "@shared/cast";
import type { EditorReport, RemoteReply, RemoteRequest } from "@shared/remote";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { saveCast } from "../src/main/library";
import { McpHost, createZetterServer } from "../src/main/mcp";

const TOOLS = [
  "answer_dialog",
  "edit_cast",
  "get_status",
  "list_casts",
  "list_transfer_items",
  "new_cast",
  "open_cast",
  "read_cast",
  "save_cast",
];

let root: string;
let host: McpHost;
let requests: RemoteRequest[];
let editor: EditorReport | null;
let reply: (request: RemoteRequest) => RemoteReply;
const clients: Client[] = [];

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "zetter-forge-mcp-"));
  requests = [];
  editor = null;
  reply = (request) => ({ ok: true, result: { answered: request.kind } });
  host = new McpHost(
    () =>
      createZetterServer({
        version: "9.9.9",
        libraryRoot: () => root,
        remote: async (request) => {
          requests.push(request);
          return request.kind === "status" ? { ok: true, result: { editor } } : reply(request);
        },
      }),
    () => undefined,
  );
});

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await host.close();
  await fs.rm(root, { recursive: true, force: true });
});

async function serverUrl(): Promise<URL> {
  const status = await host.apply({ enabled: true, port: 0 });
  if (status.state !== "running")
    throw new Error(`立てられませんでした: ${JSON.stringify(status)}`);
  return new URL(status.url);
}

/** つなぐ。mode は SDK の版の決め方（legacy は initialize から始める 2025 年版） */
async function connect(mode: "legacy" | { pin: string } = "legacy"): Promise<Client> {
  const client = new Client({ name: "test", version: "1.0.0" }, { versionNegotiation: { mode } });
  await client.connect(new StreamableHTTPClientTransport(await serverUrl()));
  clients.push(client);
  return client;
}

async function call(name: string, args: Record<string, unknown> = {}) {
  const client = await connect();
  const result = await client.callTool({ name, arguments: args });
  const [first] = result.content as { type: string; text: string }[];
  return { result, text: first?.text ?? "" };
}

/** Host・Origin などを好きに付けて POST し、HTTP の状態を返す */
function post(url: URL, headers: Record<string, string>, pathname = url.pathname): Promise<number> {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "curl", version: "1" },
    },
  });
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: url.hostname,
        port: url.port,
        path: pathname,
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          ...headers,
        },
      },
      (response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      },
    );
    request.on("error", reject);
    request.end(body);
  });
}

describe("MCP サーバー", () => {
  it.each(["legacy", { pin: "2026-07-28" }] as const)(
    "initialize から始める 2025 年版でも、2026-07-28 版でもつながり、同じ道具が並ぶ（%o）",
    async (mode) => {
      const client = await connect(mode);
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name).sort()).toEqual(TOOLS);
      expect(client.getServerVersion()).toMatchObject({ name: "zetter-forge", version: "9.9.9" });
      expect(client.getInstructions()).toContain("edit_cast");
      const result = await client.callTool({ name: "get_status", arguments: {} });
      expect(result.structuredContent).toEqual({ editor: null });
    },
  );

  it("読むだけの道具と書き換える道具を、annotations で見分けられる", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const hints = Object.fromEntries(tools.map((tool) => [tool.name, tool.annotations]));
    for (const name of ["get_status", "list_casts", "read_cast", "list_transfer_items"])
      expect(hints[name]).toMatchObject({ readOnlyHint: true, openWorldHint: false });
    expect(hints.edit_cast).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(hints.open_cast).toMatchObject({ readOnlyHint: false, destructiveHint: false });
  });

  it("画面の返事を、JSON の文字と structuredContent の両方で返す", async () => {
    const { result, text } = await call("open_cast", { folder: "灯里-1234" });
    expect(requests).toEqual([{ kind: "open", folder: "灯里-1234" }]);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ answered: "open" });
    expect(JSON.parse(text)).toEqual({ answered: "open" });
  });

  it("画面が断ったら isError にして、わけを返す", async () => {
    reply = () => ({
      ok: false,
      error: "開いているキャストはありません。",
      detail: { busy: null },
    });
    const { result, text } = await call("save_cast");
    expect(result.isError).toBe(true);
    expect(text).toContain("開いているキャストはありません。");
    expect(text).toContain('"busy": null');
  });

  it("edit_cast は、数で書いた値を文字にして画面に渡す", async () => {
    await call("edit_cast", {
      edits: [
        { action: "set", path: "affinity/default/maxValue", value: 120 },
        { action: "switch", path: "cast/public", on: true },
        { action: "move", path: "intro/1", offset: -1 },
      ],
    });
    expect(requests).toEqual([
      {
        kind: "edit",
        edits: [
          { action: "set", path: "affinity/default/maxValue", value: "120" },
          { action: "switch", path: "cast/public", on: true },
          { action: "move", path: "intro/1", offset: -1 },
        ],
      },
    ]);
  });

  it("edit_cast の形が違えば、画面に頼まずに断る", async () => {
    const { result } = await call("edit_cast", {
      edits: [{ action: "rename", path: "cast/name" }],
    });
    expect(result.isError).toBe(true);
    expect(requests).toEqual([]);
  });

  it("list_casts は保存先を読み、編集画面で開いているものに印を付ける", async () => {
    const doc = { ...createEmptyCast(), name: "灯里", persona: "古書店の店主。" };
    const saved = await saveCast(root, { folder: null, doc, pendingImages: {} });
    await saveCast(root, {
      folder: null,
      doc: { ...createEmptyCast(), name: "葵" },
      pendingImages: {},
    });
    editor = { folder: saved.folder, title: "灯里", state: "unsaved" };
    const { result } = await call("list_casts");
    const listing = result.structuredContent as { root: string; casts: Record<string, unknown>[] };
    expect(listing.root).toBe(root);
    expect(listing.casts).toHaveLength(2);
    expect(listing.casts.find((cast) => cast.name === "灯里")).toMatchObject({
      folder: saved.folder,
      mode: "story",
      open: true,
      unsaved: true,
    });
    expect(listing.casts.find((cast) => cast.name === "葵")).not.toHaveProperty("open");
  });

  it("read_cast は、開いていないキャストを保存先から読んで、確認を添える", async () => {
    const doc = { ...createEmptyCast(), name: "灯里", persona: "古書店の店主。" };
    const saved = await saveCast(root, { folder: null, doc, pendingImages: {} });
    const { result } = await call("read_cast", { folder: saved.folder });
    expect(requests).toEqual([{ kind: "status" }]);
    expect(result.structuredContent).toMatchObject({
      source: "library",
      folder: saved.folder,
      state: "saved",
      cast: { name: "灯里", persona: "古書店の店主。" },
      usage: { settings: { used: 7, limit: 20000 } },
    });
    const { issues } = result.structuredContent as { issues: { path: string | null }[] };
    expect(issues).toContainEqual({
      level: "error",
      tab: "experience",
      message: "キャッチコピーを入力してください。",
      path: "cast/tagline",
    });
  });

  it("read_cast は、folder を省くと画面に頼み、渡すと開いていても保存したファイルを読む", async () => {
    await call("read_cast");
    expect(requests).toEqual([{ kind: "read" }]);
    const doc = { ...createEmptyCast(), name: "灯里" };
    const saved = await saveCast(root, { folder: null, doc, pendingImages: {} });
    editor = { folder: saved.folder, title: "灯里", state: "unsaved" };
    const { result } = await call("read_cast", { folder: saved.folder });
    expect(result.structuredContent).toMatchObject({
      source: "library",
      cast: { name: "灯里" },
      note: expect.stringContaining("保存していない変更があります"),
    });
    editor = { ...editor, state: "saved" };
    const again = await call("read_cast", { folder: saved.folder });
    expect(again.result.structuredContent).not.toHaveProperty("note");
    expect(requests.filter((request) => request.kind === "read")).toHaveLength(1);
  });

  it("キャストのフォルダの外は読まない", async () => {
    const { result, text } = await call("read_cast", { folder: ".." });
    expect(result.isError).toBe(true);
    expect(text).toContain("キャストのフォルダ名が正しくありません");
  });

  it("ほかのサイトからの呼び出し（DNS リバインディングを含む）と、/mcp 以外は断る", async () => {
    const url = await serverUrl();
    expect(await post(url, {})).toBe(200);
    expect(await post(url, { origin: "https://evil.example" })).toBe(403);
    expect(await post(url, { host: `evil.example:${url.port}` })).toBe(403);
    expect(await post(url, { "content-type": "text/plain" })).toBe(415);
    expect(await post(url, {}, "/other")).toBe(404);
  });
});

describe("MCP サーバーを立てる・止める", () => {
  it("設定に合わせて立て、同じ設定なら立て直さず、オフにすると止める", async () => {
    const url = await serverUrl();
    expect(await host.apply({ enabled: true, port: 0 })).toEqual({
      state: "running",
      url: url.href,
    });
    expect(await host.apply({ enabled: false, port: 0 })).toEqual({ state: "off" });
    await expect(post(url, {})).rejects.toThrow();
  });

  it("ポートがふさがっていれば、わけを返す", async () => {
    const blocker = net.createServer();
    await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", resolve));
    const { port } = blocker.address() as net.AddressInfo;
    try {
      expect(await host.apply({ enabled: true, port })).toEqual({
        state: "failed",
        message: `ポート ${port} はほかのアプリが使っています。別の番号にしてください。`,
      });
      expect(await host.status()).toMatchObject({ state: "failed" });
    } finally {
      await new Promise((resolve) => blocker.close(resolve));
    }
  });
});
