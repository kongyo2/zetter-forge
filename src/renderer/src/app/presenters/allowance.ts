// 何人かで分け合う字数の枠を、400 字詰めの原稿用紙のマスで描くための値。
import { formatCount } from "@shared/text";

import type { AllowanceVM } from "../viewModels";

/** 400 字詰めの原稿用紙 1 枚を 1 マスとして描く。 */
export const CHARS_PER_CELL = 400;
/** 1 行のマスの数。原稿用紙に書くように、行の終わりで次の行へ折り返す。 */
const CELLS_PER_ROW = 25;

export interface AllowancePart {
  key: string;
  label: string;
  length: number;
  /** マスを塗る色（castInk の値） */
  ink: string;
}

export function allowance(
  title: string,
  parts: AllowancePart[],
  max: number,
  note: string | null,
): AllowanceVM {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const over = total - max;
  const near = over <= 0 && max - total <= max * 0.1;
  // マスは 1 マスずつ並べる。上限を超えたら、超えた分が入るマスまで足す
  const cells = Math.max(1, Math.ceil(Math.max(total, max) / CHARS_PER_CELL - 1e-9));
  const limitCell = max / CHARS_PER_CELL;
  const rowCount = Math.ceil(cells / CELLS_PER_ROW);

  let start = 0;
  const filled = parts.filter((part) => part.length > 0);
  const pieces = filled.map((part, index) => {
    const from = start / CHARS_PER_CELL;
    start += part.length;
    return { ...part, from, to: start / CHARS_PER_CELL, last: index === filled.length - 1 };
  });

  const rows = Array.from({ length: rowCount }, (_, row) => {
    const rowStart = row * CELLS_PER_ROW;
    const rowCells = Math.min(CELLS_PER_ROW, cells - rowStart);
    const rowEnd = rowStart + rowCells;
    const size = (length: number) => `${(length / rowCells) * 100}%`;
    const at = (cell: number) => size(cell - rowStart);
    const fills = pieces.flatMap((piece) => {
      const from = Math.max(piece.from, rowStart);
      const to = Math.min(piece.to, rowEnd);
      if (to <= from) return [];
      return [
        {
          key: piece.key,
          left: `calc(${at(from)} + 1px)`,
          width: `max(2px, calc(${size(to - from)} - 2px))`,
          ink: piece.ink,
          title: `${piece.label} ${formatCount(piece.length)}字`,
          last: piece.last && to === piece.to,
        },
      ];
    });
    return {
      cells: rowCells,
      width: `${(rowCells / CELLS_PER_ROW) * 100}%`,
      fills,
      over: over > 0 && limitCell < rowEnd ? at(Math.max(limitCell, rowStart)) : null,
      limit: over > 0 && limitCell > rowStart && limitCell <= rowEnd ? at(limitCell) : null,
    };
  });

  return {
    title,
    tone: over > 0 ? "over" : near ? "near" : "normal",
    rows,
    meterLabel: `${formatCount(max)}字のうち${formatCount(total)}字`,
    total: formatCount(total),
    max: formatCount(max),
    legend:
      parts.length > 1 && total > 0
        ? parts.map((part) => ({
            key: part.key,
            label: part.label,
            value: formatCount(part.length),
            ink: part.ink,
            empty: part.length === 0,
          }))
        : [],
    rest:
      over > 0
        ? { text: `${formatCount(over)}字オーバー`, icon: "error" }
        : { text: `あと${formatCount(max - total)}字`, icon: near ? "warning" : null },
    note,
  };
}
