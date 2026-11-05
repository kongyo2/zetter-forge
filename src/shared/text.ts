export function utf16Length(value: string): number {
  return value.length;
}

export function codePointLength(value: string): number {
  return Array.from(value).length;
}

export function formatCount(count: number): string {
  return Number(count || 0).toLocaleString("ja-JP");
}

export function sumLengths(items: readonly { length: number }[]): number {
  return items.reduce((sum, item) => sum + item.length, 0);
}

export function numberText(value: number | null): string {
  return value === null ? "" : String(value);
}

export function quoted(text: string): string {
  const trimmed = text.trim();
  return trimmed ? `「${trimmed}」` : "";
}
