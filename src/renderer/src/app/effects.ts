// 仲介役（Mediator）が状態を変えたあとに頼む、外とのやり取り。
// 頼むだけで、実際に行うのは Mediator の外側（ports）。結果は SystemEvent で戻ってくる。
import type { CopyLog } from "@shared/copyLog";
import type { CropCanvas, ImageKind } from "@shared/images";
import type { SaveCastRequest } from "@shared/ipc";
import type { McpSettings } from "@shared/mcp";

import type { PickedFile } from "./types";

export type Effect =
  | { type: "library/load"; token: number }
  | { type: "library/choose"; token: number }
  | { type: "library/open-folder" }
  | { type: "cast/load"; token: number; folder: string }
  | { type: "cast/save"; token: number; request: SaveCastRequest }
  | { type: "cast/delete"; token: number; folder: string }
  | { type: "cast/open-folder"; folder: string }
  | { type: "cast/write-copy-log"; folder: string; log: CopyLog }
  | { type: "image/read"; token: number; file: PickedFile }
  | { type: "image/encode"; token: number; canvas: CropCanvas; image: ImageKind }
  | { type: "image/show"; folder: string; file: string }
  /** 文字をコピーする。終わったら記録のために copy/done を返す */
  | {
      type: "copy/text";
      sessionKey: number;
      key: string;
      hash: string;
      label: string;
      text: string;
    }
  /** 画像ファイルの絶対パスをコピーする */
  | {
      type: "copy/image-path";
      sessionKey: number;
      key: string;
      hash: string;
      label: string;
      folder: string;
      file: string;
    }
  | { type: "url/open"; url: string }
  | { type: "toast/expire"; id: number; after: number }
  | { type: "mcp/load"; token: number }
  | { type: "mcp/save"; token: number; settings: McpSettings }
  /** 文字をコピーして、終わったら message を知らせる（Zetter へ写す記録には残さない） */
  | { type: "clipboard/write"; text: string; message: string };
