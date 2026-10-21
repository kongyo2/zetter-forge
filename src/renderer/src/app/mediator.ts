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
  forge: Omit<ForgeApi, "onCommand">;
  images: ImagePort;
  /** ms ミリ秒後に task を行う */
  schedule(ms: number, task: () => void): void;
  now(): number;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
          (error) => ({ type: "library/failed", token: effect.token, message: messageOf(error) }),
        );
        return;
      case "library/choose":
        this.settle(
          forge.chooseLibraryRoot(),
          (listing) => ({ type: "root/chosen", token: effect.token, listing }),
          (error) => ({ type: "root/failed", token: effect.token, message: messageOf(error) }),
        );
        return;
      case "library/open-folder":
        this.attempt(forge.openLibraryFolder(), "ライブラリのフォルダを開けませんでした");
        return;
      case "cast/load":
        this.settle(
          forge.loadCast(effect.folder),
          (loaded) => ({ type: "cast/loaded", token: effect.token, loaded }),
          (error) => ({ type: "cast/load-failed", token: effect.token, message: messageOf(error) }),
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
          (error) => ({
            type: "image/read-failed",
            token: effect.token,
            message: messageOf(error),
          }),
        );
        return;
      case "image/encode":
        this.settle(
          images.encode(effect.canvas, effect.image),
          (image) => ({ type: "image/encoded", token: effect.token, image }),
          (error) => ({
            type: "image/encode-failed",
            token: effect.token,
            message: messageOf(error),
          }),
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
      case "toast/expire":
        this.ports.schedule(effect.after, () =>
          this.dispatch({ type: "toast/expire", id: effect.id }),
        );
        return;
    }
  }
}
