// 仲介役（Mediator）を、外とのやり取りを偽物にして動かす。頼まれた処理は止めておき、
// テストが好きな順に結果を返せる（保存中に別の操作をする、などを再現するため）。
import { type CastDocument, createEmptyCast } from "@shared/cast";
import type { CopyLog } from "@shared/copyLog";
import type { CroppedImage } from "@shared/images";
import type {
  CastSummary,
  LibraryListing,
  LoadedCast,
  SaveCastRequest,
  SaveCastResult,
  SavedCast,
} from "@shared/ipc";

import type { AppEvent } from "../../src/renderer/src/app/events";
import { Mediator, type Ports } from "../../src/renderer/src/app/mediator";
import { presentRoot } from "../../src/renderer/src/app/presenters/root";
import type { Session } from "../../src/renderer/src/app/state";
import type { RootVM } from "../../src/renderer/src/app/viewModels";

interface Call {
  method: string;
  args: unknown[];
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

export interface World {
  mediator: Mediator;
  calls: Call[];
  /** まだ返していない method の呼び出しを 1 つ取り出す（なければ失敗） */
  take(method: string): Call;
  /** まだ返していない呼び出しの名前 */
  pending(): string[];
  /** 返した結果が仲介役に届くまで待つ */
  flush(): Promise<void>;
  dispatch(event: AppEvent): void;
  session(): Session;
  vm(): RootVM;
  /** 時刻を進める（予約した知らせの片付けも行う） */
  advance(ms: number): void;
  now: number;
}

export function createWorld(): World {
  const calls: Call[] = [];
  const timers: { at: number; task: () => void }[] = [];
  const call =
    (method: string, crossesBridge = false) =>
    (...args: unknown[]) =>
      new Promise<never>((resolve, reject) =>
        calls.push({
          method,
          args,
          resolve: resolve as (value: unknown) => void,
          // メインプロセスからのエラーは contextBridge を越えると文言しか残らないので、同じにする
          reject: crossesBridge
            ? (error) => reject(new Error(error instanceof Error ? error.message : String(error)))
            : reject,
        }),
      );
  const forge = (method: string) => call(method, true);
  const world = {
    now: Date.parse("2026-10-21T00:00:00.000Z"),
  } as World;
  const ports: Ports = {
    forge: {
      getLibrary: forge("getLibrary"),
      chooseLibraryRoot: forge("chooseLibraryRoot"),
      loadCast: forge("loadCast"),
      saveCast: forge("saveCast"),
      openCastFolder: forge("openCastFolder"),
      openLibraryFolder: forge("openLibraryFolder"),
      showImage: forge("showImage"),
      imagePath: forge("imagePath"),
      writeCopyLog: forge("writeCopyLog"),
      copyText: forge("copyText"),
      openExternal: forge("openExternal"),
    },
    images: { read: call("read"), encode: call("encode") },
    schedule: (ms, task) => timers.push({ at: world.now + ms, task }),
    now: () => world.now,
  };
  const mediator = new Mediator(ports);
  Object.assign(world, {
    mediator,
    calls,
    take(method: string) {
      const index = calls.findIndex((candidate) => candidate.method === method);
      if (index < 0)
        throw new Error(`${method} は呼ばれていません（${world.pending().join(", ")}）`);
      return calls.splice(index, 1)[0] as Call;
    },
    pending: () => calls.map((candidate) => candidate.method),
    flush: () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
    dispatch: (event: AppEvent) => mediator.dispatch(event),
    session() {
      const session = mediator.getState().session;
      if (!session) throw new Error("キャストを開いていません");
      return session;
    },
    vm: () => presentRoot(mediator.getState()),
    advance(ms: number) {
      world.now += ms;
      for (const timer of [...timers]) {
        if (timer.at <= world.now) {
          timers.splice(timers.indexOf(timer), 1);
          timer.task();
        }
      }
    },
  });
  return world;
}

export function listing(casts: Partial<CastSummary>[] = []): LibraryListing {
  return {
    root: "/library",
    casts: casts.map((cast, index) => ({
      folder: `cast-${index}`,
      id: `id-${index}`,
      name: `キャスト${index}`,
      tagline: "",
      mode: "story",
      status: "private",
      updatedAt: "2026-10-20T00:00:00.000Z",
      avatarUrl: null,
      avatarBlurred: false,
      ...cast,
    })),
    errors: [],
  };
}

export function castNamed(name: string, patch: Partial<CastDocument> = {}): CastDocument {
  return {
    ...createEmptyCast(new Date("2026-10-01T00:00:00.000Z")),
    name,
    persona: "設定",
    ...patch,
  };
}

export function loadedCast(folder: string, doc: CastDocument, copyLog: CopyLog = {}): LoadedCast {
  return { folder, doc, imageUrls: {}, notices: [], copyLog };
}

/** saveCast に届いた中身を、メインプロセスが保存したときと同じ形で返す */
export function savedFrom(
  request: SaveCastRequest,
  folder = request.folder ?? "saved-folder",
): SaveCastResult {
  const doc = structuredClone(request.doc);
  const replacedImages: SavedCast["replacedImages"] = {};
  const swap = <T extends { file: string; width: number; height: number; bytes: number }>(
    image: T | null,
  ) => {
    if (!image?.file.startsWith("pending:")) return image;
    const file = `images/${image.file.slice("pending:".length)}.jpg`;
    replacedImages[image.file] = {
      file,
      width: image.width,
      height: image.height,
      bytes: image.bytes,
    };
    return { ...image, file };
  };
  doc.avatar = swap(doc.avatar);
  doc.gallery = doc.gallery.map((image) => swap(image) as typeof image);
  for (const member of doc.members) member.avatar = swap(member.avatar);
  doc.updatedAt = "2026-10-21T01:00:00.000Z";
  return { kind: "saved", cast: { folder, doc, imageUrls: {}, notices: [], replacedImages } };
}

export const croppedImage: CroppedImage = {
  dataUrl: "data:image/jpeg;base64,AAAA",
  width: 400,
  height: 400,
  bytes: 3,
};

/** 起動して、一覧が読めたところまで進める */
export async function started(casts: Partial<CastSummary>[] = []): Promise<World> {
  const world = createWorld();
  world.dispatch({ type: "app/start" });
  world.take("getLibrary").resolve(listing(casts));
  await world.flush();
  return world;
}

/** folder のキャストを開いたところまで進める */
export async function opened(world: World, folder: string, doc: CastDocument): Promise<void> {
  world.dispatch({ type: "library/open", folder });
  world.take("loadCast").resolve(loadedCast(folder, doc));
  await world.flush();
}
