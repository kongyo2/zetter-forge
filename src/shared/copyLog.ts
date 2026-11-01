import { isRecord } from "./json";

export const COPY_LOG_FORMAT = "zetter-forge/copied";

interface CopyRecord {
  hash: string;
  at: string;
}

export type CopyLog = Readonly<Record<string, CopyRecord>>;

export function textHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

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

export function copyLogFile(log: CopyLog): { format: typeof COPY_LOG_FORMAT; items: CopyLog } {
  return { format: COPY_LOG_FORMAT, items: log };
}
