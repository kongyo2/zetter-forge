// 仲介役（Mediator）。画面の部品から上ってきたできごとを受け取り、状態機械（machine.ts）で
// 裁定して状態を進め、頼まれた外とのやり取り（ports）を行って結果をまた受け取る。
// 画面の部品は Mediator の状態を直接さわらず、Presenter が作った描画用の値だけを受け取る。
import type { CopyLog } from "@shared/copyLog";
import type { CroppedImage, CropCanvas, ImageKind } from "@shared/images";
import type { ForgeApi } from "@shared/ipc";

import type { Effect } from "./effects";
import type { AppEvent } from "./events";
import { arbitrate } from "./machine";
import { type AppState, initialState } from "./state";
import type { PickedFile } from "./types";

/** 画像ファイルの読み込みと、切り抜いた画像の圧縮 */
export interface ImagePort {
  read(file: PickedFile): Promise<string>;
  encode(canvas: CropCanvas, image: ImageKind): Promise<CroppedImage>;
}

/** Mediator が外とやり取りする口 */
export interface Ports {
  forge: Omit<ForgeApi, "onCommand" | "onRemote">;
  images: ImagePort;
  /** ms ミリ秒後に task を行う */
  schedule(ms: number, task: () => void): void;
  now(): number;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 頼んだ処理が失敗したことを知らせるできごと（どの頼みのものかは token で見分ける） */
type FailureType =
  | "library/failed"
  | "root/failed"
  | "cast/load-failed"
  | "cast/delete-failed"
  | "image/read-failed"
  | "image/encode-failed"
  | "mcp/load-failed"
  | "mcp/save-failed";

function toFailure(type: FailureType, token: number): (error: unknown) => AppEvent {
  return (error) => ({ type, token, message: messageOf(error) });
}

export class Mediator {
  private state: AppState;
  private readonly listeners = new Set<() => void>();
  private readonly queue: AppEvent[] = [];
  private dispatching = false;

  constructor(private readonly ports: Ports) {
    this.state = initialState(ports.now());
  }

  readonly getState = (): AppState => this.state;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** できごとを受け取る。判断の途中で届いたものは、いまの判断が終わってから順に裁定する */
  readonly dispatch = (event: AppEvent): void => {
    this.queue.push(event);
    if (this.dispatching) return;
    this.dispatching = true;
    try {
      for (let next = this.queue.shift(); next; next = this.queue.shift()) this.arbitrate(next);
    } finally {
      this.dispatching = false;
    }
  };

  private arbitrate(event: AppEvent): void {
    const { state, effects } = arbitrate(this.state, event, this.ports.now());
    if (state !== this.state) {
      this.state = state;
      for (const listener of this.listeners) listener();
    }
    for (const effect of effects) this.run(effect);
  }

  /** 頼んだ処理の結果を、できごとにして受け取り直す */
  private settle<T>(
    task: Promise<T>,
    succeeded: (value: T) => AppEvent,
    failed: (error: unknown) => AppEvent,
  ): void {
    task.then(succeeded, failed).then(this.dispatch, (error: unknown) => console.error(error));
  }

  private attempt(task: Promise<unknown>, failure: string): void {
    task.catch((error: unknown) =>
      this.dispatch({ type: "task/failed", message: `${failure}: ${messageOf(error)}` }),
    );
  }

  private writeCopyLog(folder: string, log: CopyLog): void {
    this.attempt(this.ports.forge.writeCopyLog(folder, log), "コピーの記録を残せませんでした");
  }

  private run(effect: Effect): void {
    const { forge, images } = this.ports;
    switch (effect.type) {
      case "library/load":
        this.settle(
          forge.getLibrary(),
          (listing) => ({ type: "library/loaded", token: effect.token, listing }),
          toFailure("library/failed", effect.token),
        );
        return;
      case "library/choose":
        this.settle(
          forge.chooseLibraryRoot(),
          (listing) => ({ type: "root/chosen", token: effect.token, listing }),
          toFailure("root/failed", effect.token),
        );
        return;
      case "library/open-folder":
        this.attempt(forge.openLibraryFolder(), "ライブラリのフォルダを開けませんでした");
        return;
      case "cast/load":
        this.settle(
          forge.loadCast(effect.folder),
          (loaded) => ({ type: "cast/loaded", token: effect.token, loaded }),
          toFailure("cast/load-failed", effect.token),
        );
        return;
      case "cast/save":
        this.settle(
          forge.saveCast(effect.request),
          (result): AppEvent =>
            result.kind === "saved"
              ? { type: "cast/saved", token: effect.token, saved: result.cast }
              : {
                  type: "cast/save-failed",
                  token: effect.token,
                  message: result.message,
                  missing: true,
                },
          (error) => ({
            type: "cast/save-failed",
            token: effect.token,
            message: messageOf(error),
            missing: false,
          }),
        );
        return;
      case "cast/delete":
        this.settle(
          forge.deleteCast(effect.folder),
          (result) => ({
            type: "cast/deleted",
            token: effect.token,
            missing: result.kind === "missing",
          }),
          toFailure("cast/delete-failed", effect.token),
        );
        return;
      case "cast/open-folder":
        this.attempt(forge.openCastFolder(effect.folder), "フォルダを開けませんでした");
        return;
      case "cast/write-copy-log":
        this.writeCopyLog(effect.folder, effect.log);
        return;
      case "image/read":
        this.settle(
          images.read(effect.file),
          (source) => ({ type: "image/read", token: effect.token, source }),
          toFailure("image/read-failed", effect.token),
        );
        return;
      case "image/encode":
        this.settle(
          images.encode(effect.canvas, effect.image),
          (image) => ({ type: "image/encoded", token: effect.token, image }),
          toFailure("image/encode-failed", effect.token),
        );
        return;
      case "image/show":
        this.attempt(
          forge.showImage(effect.folder, effect.file),
          "画像のファイルを開けませんでした",
        );
        return;
      case "copy/text":
      case "copy/image-path": {
        const copying =
          effect.type === "copy/text"
            ? forge.copyText(effect.text)
            : forge.imagePath(effect.folder, effect.file).then((file) => forge.copyText(file));
        this.settle(
          copying,
          () => ({
            type: "copy/done",
            sessionKey: effect.sessionKey,
            key: effect.key,
            hash: effect.hash,
            label: effect.label,
          }),
          (error) => ({ type: "copy/failed", message: messageOf(error) }),
        );
        return;
      }
      case "url/open":
        this.attempt(forge.openExternal(effect.url), "ページを開けませんでした");
        return;
      case "mcp/load":
        this.settle(
          forge.getMcp(),
          (info) => ({ type: "mcp/loaded", token: effect.token, info }),
          toFailure("mcp/load-failed", effect.token),
        );
        return;
      case "mcp/save":
        this.settle(
          forge.saveMcp(effect.settings),
          (info) => ({ type: "mcp/saved", token: effect.token, info }),
          toFailure("mcp/save-failed", effect.token),
        );
        return;
      case "clipboard/write":
        this.settle(
          forge.copyText(effect.text),
          () => ({ type: "notice", message: effect.message }),
          (error) => ({ type: "copy/failed", message: messageOf(error) }),
        );
        return;
      case "toast/expire":
        this.ports.schedule(effect.after, () =>
          this.dispatch({ type: "toast/expire", id: effect.id }),
        );
        return;
    }
  }
}
