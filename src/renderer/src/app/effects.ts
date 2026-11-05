import type { CopyLog } from "@shared/copyLog";
import type { CropCanvas, ImageKind } from "@shared/images";
import type { SaveCastRequest } from "@shared/ipc";
import type { McpSettings } from "@shared/mcp";

import type { CopyMark, PickedFile } from "./types";

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
  | { type: "member/read-source"; token: number; folder: string }
  | { type: "image/show"; folder: string; file: string }
  | ({ type: "copy/text"; text: string } & CopyMark)
  | ({ type: "copy/image-path"; folder: string; file: string } & CopyMark)
  | { type: "url/open"; url: string }
  | { type: "toast/expire"; id: number; after: number }
  | { type: "mcp/load"; token: number }
  | { type: "mcp/save"; token: number; settings: McpSettings }
  | { type: "clipboard/write"; text: string; message: string };
