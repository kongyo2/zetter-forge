import { formatCount } from "@shared/text";
import type { CSSProperties, ReactNode } from "react";

import { IconError, IconWarning } from "./icons";

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

interface Piece {
  key: string;
  label: string;
  length: number;
  ink: string;
  /** マス単位の位置 */
  from: number;
  to: number;
  last: boolean;
}

/**
 * 何人かで分け合う字数の枠。誰がどれだけ使っているかを色の区切りと凡例の数字で見せる。
 * マスの大きさはどの枠でも同じなので、枠の大きさは行の数で比べられる。
 */
export function Allowance({
  title,
  parts,
  max,
  note,
}: {
  title: string;
  parts: AllowancePart[];
  max: number;
  note?: ReactNode;
}) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  // 上限を超えたら、超えた分まで見えるように行を足す
  const span = Math.max(total, max);
  const over = total - max;
  const near = over <= 0 && max - total <= max * 0.1;
  const cells = span / CHARS_PER_CELL;
  const limitCell = max / CHARS_PER_CELL;
  const rowCount = Math.max(1, Math.ceil(cells / CELLS_PER_ROW - 1e-9));

  let start = 0;
  const filled = parts.filter((part) => part.length > 0);
  const pieces: Piece[] = filled.map((part, index) => {
    const from = start / CHARS_PER_CELL;
    start += part.length;
    return {
      ...part,
      from,
      to: start / CHARS_PER_CELL,
      last: index === filled.length - 1,
    };
  });

  const rows = Array.from({ length: rowCount }, (_, row) => {
    const rowStart = row * CELLS_PER_ROW;
    const rowCells = Math.min(CELLS_PER_ROW, cells - rowStart);
    const rowEnd = rowStart + rowCells;
    const size = (length: number) => `${(length / rowCells) * 100}%`;
    const percent = (cell: number) => size(cell - rowStart);
    return (
      <div
        key={row}
        className="meter-row"
        style={
          {
            "--cells": rowCells,
            width: `${(rowCells / CELLS_PER_ROW) * 100}%`,
          } as CSSProperties
        }
      >
        {pieces.flatMap((piece) => {
          const from = Math.max(piece.from, rowStart);
          const to = Math.min(piece.to, rowEnd);
          if (to <= from) return [];
          return [
            <span
              key={piece.key}
              className={piece.last && to === piece.to ? "meter-fill is-last" : "meter-fill"}
              style={{
                left: `calc(${percent(from)} + 1px)`,
                width: `max(2px, calc(${size(to - from)} - 2px))`,
                background: piece.ink,
              }}
              title={`${piece.label} ${formatCount(piece.length)}字`}
            />,
          ];
        })}
        {over > 0 && limitCell < rowEnd ? (
          <span className="meter-over" style={{ left: percent(Math.max(limitCell, rowStart)) }} />
        ) : null}
        {over > 0 && limitCell > rowStart && limitCell <= rowEnd ? (
          <span className="meter-limit" style={{ left: percent(limitCell) }} />
        ) : null}
      </div>
    );
  });

  return (
    <section
      className={over > 0 ? "allowance is-over" : near ? "allowance is-near" : "allowance"}
      aria-label={`${title}の字数`}
    >
      <h3 className="allowance-title">{title}</h3>
      <div className="allowance-bar">
        <div
          className="meter"
          role="img"
          aria-label={`${formatCount(max)}字のうち${formatCount(total)}字`}
        >
          {rows}
        </div>
        <span className="allowance-figure">
          <strong>{formatCount(total)}</strong> / {formatCount(max)}字
        </span>
      </div>
      <div className="allowance-legend">
        {parts.length > 1 && total > 0 ? (
          <ul>
            {parts.map((part) => (
              <li key={part.key} className={part.length === 0 ? "is-empty" : undefined}>
                <span
                  className="swatch"
                  style={{ "--swatch": part.ink } as CSSProperties}
                  aria-hidden="true"
                />
                <span className="legend-name">{part.label}</span>
                <span className="legend-value">{formatCount(part.length)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <span className="allowance-rest">
          {over > 0 ? (
            <>
              <IconError />
              {formatCount(over)}字オーバー
            </>
          ) : (
            <>
              {near ? <IconWarning /> : null}
              あと{formatCount(max - total)}字
            </>
          )}
        </span>
      </div>
      {note ? <p className="note">{note}</p> : null}
    </section>
  );
}
