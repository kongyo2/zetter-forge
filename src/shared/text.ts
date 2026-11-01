export function utf16Length(value: string): number {
  return value.length;
}

export function codePointLength(value: string): number {
  return Array.from(value).length;
}

export function formatCount(count: number): string {
  return Number(count || 0).toLocaleString("ja-JP");
}
