// 登場人物ごとの色（インク）。本人が 1 番、登場人物は「N人目」の順に 2 番から使う。
// 8 色の並びは、色覚の違いがあっても隣り合う人を見分けられるように選んである
// （値は styles.css の --cast-1〜8）。9 人目からは灰色にまとめる。
const INK_SLOTS = 8;

/** index は本人が 0、登場人物が 1 から（「N人目」の N - 1）。 */
export function castInk(index: number): string {
  return index < INK_SLOTS ? `var(--cast-${index + 1})` : "var(--cast-other)";
}

/** 色の付く人数。これより後ろの人は凡例で「ほか N人」にまとめる。 */
export const INKED_CHARACTERS = INK_SLOTS;
