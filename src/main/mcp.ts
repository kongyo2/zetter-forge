// AI のエージェント（Claude Code・Pi など）から Zetter Forge を操作するための MCP サーバー。
// 公式の SDK で Streamable HTTP の窓口（/mcp）を 127.0.0.1 に立てる。2026-07-28 版の手順にも、
// それより前の initialize から始める手順にも答える（どちらで来たかは SDK の createMcpHandler が見分ける）。
// 編集中のキャストは画面が持っているので、開く・書き換える・保存するは画面の仲介役に頼む
// （ファイルを直接書くと、画面の保存していない変更と食い違う）。保存したキャストは、ここで読む。
import { type Server, createServer } from "node:http";

import {
  localhostHostValidation,
  localhostOriginValidation,
  toNodeHandler,
} from "@modelcontextprotocol/node";
import {
  type CallToolResult,
  type McpHttpHandler,
  McpServer,
  createMcpHandler,
} from "@modelcontextprotocol/server";
import { PLAY_GUIDE_FIELDS } from "@shared/cast";
import type { JsonObject } from "@shared/json";
import { LIMITS } from "@shared/limits";
import { type McpSettings, type McpStatus, mcpUrl } from "@shared/mcp";
import {
  type EditorReport,
  type RemoteReply,
  type RemoteRequest,
  castReport,
} from "@shared/remote";
import { formatCount } from "@shared/text";
import * as z from "zod";

import { listCasts, loadCast } from "./library";

const MCP_PATH = "/mcp";

export interface McpDeps {
  /** アプリの版（サーバーの名乗りに使う） */
  version: string;
  /** いまの保存先のフォルダ */
  libraryRoot(): string;
  /** 画面の仲介役に頼む。窓がなければ失敗の返事になる */
  remote(request: RemoteRequest): Promise<RemoteReply>;
}

const INSTRUCTIONS = `Zetter Forge は、Zetter（AI と会話するサービス）のキャストの設定を、パソコンに保存して書き直すためのアプリです。
- 読む: list_casts で保存したキャストを並べ、read_cast で中身と「Zetter で完成するときの確認」（issues）を読む。
- 書く: open_cast か new_cast で編集画面に開き、edit_cast で書き換え、save_cast で保存する。書き換えは画面にすぐ出るが、保存するまでファイルには残らない。
- 保存していない変更を捨てる・登場人物を消すなどのときは、確かめのダイアログが出る。answer_dialog で答えるか、利用者に任せる。
- 場所（path）は "cast/name"・"members/<id>/profile" のように / でつなぐ。issues の path も、そのまま edit_cast に使える。`;

const n = formatCount;

const EDIT_DESCRIPTION = `開いているキャストを、画面で操作するのと同じ決まりで書き換える。edits を前から順に行い、1 件ずつ結果を返す（applied: 書き換えた、ignored: その場所にその操作はない、refused: 上限などで断られた、confirm: 確かめのダイアログが出た、skipped: ダイアログのため行わなかった）。書き換えは画面にすぐ出るが、ファイルに残すには save_cast で保存する。

action:
- set: 文字・数・選択肢を value に書く
- switch: on でオン・オフを切り替える
- add: 並びに 1 つ足す（足したものの場所を added で返す）
- remove: 1 つ消す・画像を外す（登場人物・好感度設定・イントロの 2 つ目以降は確かめのダイアログが出るので、answer_dialog で答える）
- move: offset（-1 で上へ、1 で下へ）で並べ替える

path は / でつなぐ。<id> は read_cast の cast にある id、<i> は 0 から数えた位置。
- 本人: cast/name, cast/persona（性格・設定）, cast/partnerSettings/<dailyRoutine|messageHabits|proactiveMessages|distanceWhenApart|freeform>, cast/toneExamples（add）, cast/toneExamples/<i>（remove・move）, cast/toneExamples/<i>/<situation|example>, cast/avatarBlurred（switch）
- 登場人物（ストーリーモードだけ）: members（add）, members/<id>（remove）, members/<id>/<name|profile>, members/<id>/partnerSettings/…, members/<id>/toneExamples/…（本人と同じ）
- 体験設定: cast/mode（story・chat）, cast/tagline（キャッチコピー）, cast/situation（いまの状況）, cast/aboutText（このキャストについて）, intro（add）, intro/<i>（remove・move）, intro/<i>/text, intro/<i>/role（narration・speech:（本体のセリフ）・speech:<登場人物の id>）, intro/first/text（雑談モードの最初のひとこと）, intro/rest（remove で、雑談モードでは見えない 2 つ目以降をまとめて消す）
- 遊び方シート（遊ぶ人に見せる案内。AI には伝わらない）: playGuide/<summary|world|role|start|first|hint|gimmick>/text（あらすじ・世界観・あなたの役割・始まりの状況・最初にできること（1 行に 1 つ）・迷ったときのヒント・隠しギミック）, playGuide/<…>/hidden（switch。オンで「隠しておく」。gimmick だけ既定がオン）
- この会話でのあなた: personas（add）, personas/<id>（remove）, personas/<id>/<name|tagline|note>, personas/<id>/useViewerName（switch）
- 好感度: affinity（add で 4 段階のひな形を作る、remove で全部消す）。<対象> は default（共通設定）、__cast_base__（本体）か登場人物の id。affinity/<対象>（add で個別設定を作る、remove で共通設定に戻す）, affinity/<対象>/<itemName|minValue|maxValue|initialValue|pace>（pace は gentle・normal・rapid）, affinity/<対象>/showInChat（switch）, affinity/<対象>/disabled（switch。オンでそのキャラは好感度を使わない。default にはない）, affinity/<対象>/stages（add）, affinity/<対象>/stages/<i>（remove）, affinity/<対象>/stages/<i>/<startValue|callText|speechText|distanceText|agencyText|avoidText|freeText>（1 段階目の startValue は最小値で決まる）
- 設定集: lorebooks（add）, lorebooks/<id>（remove・move）, lorebooks/<id>/<title|note>
- 見た目・公開: cast/public, cast/coverBlurred, cast/personaVisible, cast/toneExamplesVisible, cast/situationVisible, cast/authorVisible, cast/showFavoriteCount, cast/showTalkCount（どれも switch）, cast/hook（一言セリフ）, tags（add）, tags/<i>（set・remove）, gallery/<id>/blurred（switch）
- メモ（Zetter には送られない）: cast/zetterUrl, cast/memo
- 画像は外す（remove）ことだけできる: cast/avatar, cast/cover, cast/background, members/<id>/avatar, personas/<id>/avatar, gallery/<id>

Zetter の上限（超えても書けるが、read_cast の issues に出る）: 名前 ${n(LIMITS.name)} 字、キャッチコピーと一言セリフ ${n(LIMITS.tagline)} 字、性格・設定と登場人物のプロフィールは合わせて ${n(LIMITS.settingsTotal)} 字、口調サンプルは 1 人 ${n(LIMITS.toneItemsPerCharacter)} 件・状況 ${n(LIMITS.toneSituation)} 字・発話例 ${n(LIMITS.toneExample)} 字・全員で ${n(LIMITS.toneTotal)} 字、パートナー設定は 1 人 5 欄で ${n(LIMITS.partnerSettingsTotal)} 字（超える分は切り詰める）、いまの状況 ${n(LIMITS.situation)} 字、イントロは ${n(LIMITS.introParts)} パート・1 パート ${n(LIMITS.introPart)} 字・全部で ${n(LIMITS.introTotal)} 字（ストーリーモード）、遊び方シートは ${PLAY_GUIDE_FIELDS.map((field) => `${field.key} ${n(LIMITS.playGuide[field.key])} 字`).join("・")}、このキャストについて ${n(LIMITS.aboutText)} 字、登場人物は本人を含めて ${n(LIMITS.charactersTotal)} 人、この会話でのあなた ${n(LIMITS.personas)} 件（名前 ${n(LIMITS.personaName)} 字・紹介文 ${n(LIMITS.personaTagline)} 字・キャストに伝わるもの ${n(LIMITS.personaNote)} 字）、タグ ${n(LIMITS.tags)} 個（${n(LIMITS.tag)} 字）、好感度の段階 ${n(LIMITS.affinityStages)} 個（1 段階の 6 欄で ${n(LIMITS.affinityStageText)} 字）、設定集 ${n(LIMITS.lorebooks)} 冊。`;

const noInput = z.object({});

const readInput = z.object({
  folder: z
    .string()
    .min(1)
    .optional()
    .describe(
      "list_casts の folder。省くと編集画面で開いているキャスト（保存していない変更も含む）",
    ),
});

const openInput = z.object({
  folder: z.string().min(1).describe("list_casts の folder"),
});

const editInput = z.object({
  edits: z
    .array(
      z.object({
        action: z.enum(["set", "switch", "add", "remove", "move"]),
        path: z
          .string()
          .min(1)
          .describe("場所（例: cast/name、members/<id>/profile、intro/0/text）"),
        value: z.union([z.string(), z.number()]).optional().describe("set で書く値"),
        on: z.boolean().optional().describe("switch でオンにするなら true"),
        offset: z.literal([-1, 1]).optional().describe("move の向き（-1 は上、1 は下）"),
      }),
    )
    .min(1)
    .max(200),
});

const answerInput = z.object({
  choice: z.string().min(1).describe("dialog.choices の id か、取りやめるなら cancel"),
});

function jsonResult(value: JsonObject): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

function errorResult(message: string, detail?: JsonObject): CallToolResult {
  const text = detail ? `${message}\n\n${JSON.stringify(detail, null, 2)}` : message;
  return { content: [{ type: "text", text }], isError: true };
}

function fromReply(reply: RemoteReply): CallToolResult {
  return reply.ok ? jsonResult(reply.result) : errorResult(reply.error, reply.detail);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 編集画面で開いているキャスト（窓がないときなどは null） */
async function openEditor(deps: McpDeps): Promise<EditorReport | null> {
  const status = await deps.remote({ kind: "status" });
  return status.ok ? ((status.result.editor as EditorReport | null) ?? null) : null;
}

/** 道具を並べたサーバー。HTTP の窓口は、頼み 1 回ごとにこれを作り直す */
export function createZetterServer(deps: McpDeps): McpServer {
  const server = new McpServer(
    { name: "zetter-forge", title: "Zetter Forge", version: deps.version },
    { instructions: INSTRUCTIONS },
  );
  const local = { openWorldHint: false };
  const reading = { ...local, readOnlyHint: true };

  server.registerTool(
    "get_status",
    {
      title: "いまの様子",
      description:
        "アプリのいまの様子を返す。編集画面で開いているキャスト（folder・名前・保存の状態）、進めている処理（busy）、出ているダイアログ（dialog）、画面に出ている知らせ（messages）。",
      inputSchema: noInput,
      annotations: reading,
    },
    async () => fromReply(await deps.remote({ kind: "status" })),
  );

  server.registerTool(
    "list_casts",
    {
      title: "保存したキャストの一覧",
      description:
        "保存先のフォルダにあるキャストを、新しく保存した順に返す。folder は open_cast・read_cast に渡す名前。編集画面で開いているものには open（保存していない変更があれば unsaved）が付く。",
      inputSchema: noInput,
      annotations: reading,
    },
    async () => {
      const root = deps.libraryRoot();
      try {
        const [{ casts, errors }, editor] = await Promise.all([listCasts(root), openEditor(deps)]);
        return jsonResult({
          root,
          casts: casts.map(({ folder, doc }) => ({
            folder,
            name: doc.name,
            tagline: doc.tagline,
            mode: doc.mode,
            status: doc.status,
            updatedAt: doc.updatedAt,
            ...(editor?.folder === folder
              ? { open: true, unsaved: editor.state === "unsaved" }
              : {}),
          })),
          errors,
          editor,
        });
      } catch (error) {
        return errorResult(`保存先のフォルダを読めませんでした: ${messageOf(error)}`);
      }
    },
  );

  server.registerTool(
    "read_cast",
    {
      title: "キャストを読む",
      description:
        "キャストの中身（cast.json と同じ形）と、Zetter で完成するときの確認（issues: error は完成できない、warning は Zetter が保存しない、info は写すときの注意）、字数の合計の使い方（usage）を返す。folder を渡すと保存したファイルを（source: library）、省くと編集画面で開いているキャストを保存していない変更も含めて（source: editor）返す。",
      inputSchema: readInput,
      annotations: reading,
    },
    async ({ folder }) => {
      if (folder === undefined) return fromReply(await deps.remote({ kind: "read" }));
      try {
        const loaded = await loadCast(deps.libraryRoot(), folder);
        const editor = await openEditor(deps);
        return jsonResult({
          source: "library",
          folder: loaded.folder,
          state: "saved",
          cast: loaded.doc,
          notices: loaded.notices,
          ...castReport(loaded.doc),
          ...(editor?.folder === loaded.folder && editor.state === "unsaved"
            ? {
                note: "このキャストは編集画面で開いていて、保存していない変更があります。画面の中身は folder を省いて読めます。",
              }
            : {}),
        });
      } catch (error) {
        return errorResult(`「${folder}」を読めませんでした: ${messageOf(error)}`);
      }
    },
  );

  server.registerTool(
    "list_transfer_items",
    {
      title: "Zetter へ写す項目",
      description:
        "編集画面で開いているキャストの「Zetter へ写す」の項目を、Zetter の作成画面と同じ順に返す。kind: text は貼る文字、image は選ぶ画像（value はキャストのフォルダの中のファイル）、setting は画面で選ぶ設定。status: todo はまだ、done はコピー済み、changed はコピーしたあとに書き換えた、skip は何もしなくてよい。",
      inputSchema: noInput,
      annotations: reading,
    },
    async () => fromReply(await deps.remote({ kind: "transfer" })),
  );

  server.registerTool(
    "open_cast",
    {
      title: "キャストを開く",
      description:
        "保存したキャストを編集画面で開く。いまのキャストに保存していない変更があると確かめのダイアログが出るので、answer_dialog で答える。",
      inputSchema: openInput,
      annotations: { ...local, readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ folder }) => fromReply(await deps.remote({ kind: "open", folder })),
  );

  server.registerTool(
    "new_cast",
    {
      title: "新しいキャストを作る",
      description:
        "新しいキャストを編集画面に作る（Zetter の新規作成と同じ既定値）。保存するまでフォルダはできない。いまのキャストに保存していない変更があると確かめのダイアログが出る。",
      inputSchema: noInput,
      annotations: { ...local, readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async () => fromReply(await deps.remote({ kind: "new" })),
  );

  server.registerTool(
    "edit_cast",
    {
      title: "キャストを書き換える",
      description: EDIT_DESCRIPTION,
      inputSchema: editInput,
      annotations: { ...local, readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ edits }) =>
      fromReply(
        await deps.remote({
          kind: "edit",
          edits: edits.map(({ value, ...edit }) =>
            value === undefined ? edit : { ...edit, value: String(value) },
          ),
        }),
      ),
  );

  server.registerTool(
    "save_cast",
    {
      title: "キャストを保存する",
      description:
        "編集画面で開いているキャストを保存する。新しいキャストは保存先にフォルダができる（folder を返す）。保存のたびに前の版を history に残す。",
      inputSchema: noInput,
      annotations: { ...local, readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async () => fromReply(await deps.remote({ kind: "save" })),
  );

  server.registerTool(
    "answer_dialog",
    {
      title: "確かめのダイアログに答える",
      description:
        "画面に出ている確かめのダイアログに答える。choice は dialog.choices の id（save: 保存して続ける、discard: 保存しないで続ける、remove: 消す など）か、取りやめるなら cancel。",
      inputSchema: answerInput,
      annotations: { ...local, readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ choice }) => fromReply(await deps.remote({ kind: "answer", choice })),
  );

  return server;
}

/** 待ち受けを始められなかったわけ */
function listenFailure(error: unknown, port: number): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "EADDRINUSE")
    return `ポート ${port} はほかのアプリが使っています。別の番号にしてください。`;
  if (code === "EACCES") return `ポート ${port} は使えません。別の番号にしてください。`;
  return messageOf(error);
}

/** 設定に合わせて MCP サーバーを立てたり止めたりする。頼まれた順に 1 つずつ行う */
export class McpHost {
  private server: Server | null = null;
  private handler: McpHttpHandler | null = null;
  private port: number | null = null;
  private current: McpStatus = { state: "off" };
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly factory: () => McpServer,
    private readonly report: (error: Error) => void = (error) => console.error("[mcp]", error),
  ) {}

  /** いまの様子（立てている途中なら、終わるのを待ってから） */
  async status(): Promise<McpStatus> {
    await this.queue;
    return this.current;
  }

  apply(settings: McpSettings): Promise<McpStatus> {
    const next = this.queue.then(() => this.reconcile(settings));
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** 止める（アプリを終えるとき） */
  async close(): Promise<void> {
    await this.apply({ enabled: false, port: this.port ?? 0 });
  }

  private async reconcile(settings: McpSettings): Promise<McpStatus> {
    if (settings.enabled && this.server && this.port === settings.port) return this.current;
    await this.stop();
    if (!settings.enabled) {
      this.current = { state: "off" };
      return this.current;
    }
    try {
      this.current = { state: "running", url: mcpUrl(await this.start(settings.port)) };
    } catch (error) {
      this.current = { state: "failed", message: listenFailure(error, settings.port) };
    }
    return this.current;
  }

  /** 待ち受けを始めて、待ち受けたポートを返す（0 を渡すと空いている番号になる） */
  private async start(port: number): Promise<number> {
    const handler = createMcpHandler(() => this.factory(), { onerror: this.report });
    const serve = toNodeHandler(handler, { onerror: this.report });
    // ほかのサイトから（DNS リバインディングを含め）呼ばれないよう、Host と Origin を確かめる
    const validHost = localhostHostValidation();
    const validOrigin = localhostOriginValidation();
    const server = createServer((request, response) => {
      if (!validHost(request, response) || !validOrigin(request, response)) return;
      if (request.url?.split("?", 1)[0] !== MCP_PATH) {
        response.writeHead(404).end();
        return;
      }
      void serve(request, response);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        // このパソコンの中からだけつなげる
        server.listen(port, "127.0.0.1", () => {
          server.off("error", reject);
          resolve();
        });
      });
    } catch (error) {
      await handler.close();
      throw error;
    }
    server.on("error", this.report);
    this.server = server;
    this.handler = handler;
    this.port = port;
    const address = server.address();
    return typeof address === "object" && address ? address.port : port;
  }

  private async stop(): Promise<void> {
    const { server, handler } = this;
    this.server = null;
    this.handler = null;
    this.port = null;
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        // 開いたままのつながり（keep-alive・SSE）も切る
        server.closeAllConnections();
      });
    }
    await handler?.close();
  }
}
