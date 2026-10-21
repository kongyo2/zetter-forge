/** HTML の maxlength と同じ数え方（UTF-16 のコード単位）。 */
export function utf16Length(value: string): number {
  return value.length;
}

/** 絵文字などのサロゲートペアを 1 字と数える（Zetter の好感度・パートナー設定と同じ）。 */
export function codePointLength(value: string): number {
  return Array.from(value).length;
}

/** 3 桁区切り（Zetter の画面と同じ ja-JP 表記）。 */
export function formatCount(count: number): string {
  return Number(count || 0).toLocaleString("ja-JP");
}
