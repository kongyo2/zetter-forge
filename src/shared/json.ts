// JSON として読んだ値を調べるための決まりごと（cast.json・copied.json・settings.json で使う）。
export type JsonObject = Record<string, unknown>;

/** 配列でないオブジェクト（JSON の {…}）か */
export function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
