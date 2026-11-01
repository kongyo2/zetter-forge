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
  | {
      type: "copy/text";
      sessionKey: number;
      key: string;
      hash: string;
      label: string;
      text: string;
    }
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
  | { type: "clipboard/write"; text: string; message: string };
