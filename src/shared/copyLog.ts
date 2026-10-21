// Zetter の画面へ写すためにコピーした記録。キャストのフォルダの copied.json に置く。
// 中身そのものは残さず、コピーした値のハッシュだけを持つ（あとで書き換えたかを見分けるため）。
export const COPY_LOG_FORMAT = "zetter-forge/copied";

interface CopyRecord {
  hash: string;
  /** コピーした日時（ISO 8601） */
  at: string;
}

/** キーは写す項目の場所（"cast/name" など） */
export type CopyLog = Readonly<Record<string, CopyRecord>>;

/** 値が変わったかを見分けるためのハッシュ（FNV-1a 32bit、16 進 8 桁）。 */
export function textHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** copied.json の中身を読む。形が違うものは空の記録として扱う。 */
export function normalizeCopyLog(raw: unknown): CopyLog {
  if (!isRecord(raw) || raw.format !== COPY_LOG_FORMAT || !isRecord(raw.items)) return {};
  const log: Record<string, CopyRecord> = {};
  for (const [key, value] of Object.entries(raw.items)) {
    if (isRecord(value) && typeof value.hash === "string" && typeof value.at === "string") {
      log[key] = { hash: value.hash, at: value.at };
    }
  }
  return log;
}

/** copied.json に書く形 */
export function copyLogFile(log: CopyLog): { format: typeof COPY_LOG_FORMAT; items: CopyLog } {
  return { format: COPY_LOG_FORMAT, items: log };
}
