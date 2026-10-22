// 何人かで分け合う字数の枠を、400 字詰めの原稿用紙のマスで描く（位置と幅は Presenter が決める）。
import type { CSSProperties } from "react";

import type { AllowanceVM } from "../../app/viewModels";
import { toneClass } from "./basics";
import { IconError, IconWarning } from "./icons";

export function Allowance({ vm }: { vm: AllowanceVM }) {
  return (
    <section className={`allowance${toneClass(vm.tone)}`} aria-label={`${vm.title}の字数`}>
      <h3 className="allowance-title">{vm.title}</h3>
      <div className="allowance-bar">
        <div className="meter" role="img" aria-label={vm.meterLabel}>
          {vm.rows.map((row, index) => (
            <div
              key={index}
              className="meter-row"
              style={{ "--cells": row.cells, width: row.width } as CSSProperties}
            >
              {row.fills.map((fill) => (
                <span
                  key={fill.key}
                  className={fill.last ? "meter-fill is-last" : "meter-fill"}
                  style={{ left: fill.left, width: fill.width, background: fill.ink }}
                  title={fill.title}
                />
              ))}
              {row.over ? <span className="meter-over" style={{ left: row.over }} /> : null}
              {row.limit ? <span className="meter-limit" style={{ left: row.limit }} /> : null}
            </div>
          ))}
        </div>
        <span className="allowance-figure">
          <strong>{vm.total}</strong> / {vm.max}字
        </span>
      </div>
      <div className="allowance-legend">
        {vm.legend.length > 0 ? (
          <ul>
            {vm.legend.map((part) => (
              <li key={part.key} className={part.empty ? "is-empty" : undefined}>
                <span
                  className="swatch"
                  style={{ "--swatch": part.ink } as CSSProperties}
                  aria-hidden="true"
                />
                <span className="legend-name">{part.label}</span>
                <span className="legend-value">{part.value}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <span className="allowance-rest">
          {vm.rest.icon === "error" ? (
            <IconError />
          ) : vm.rest.icon === "warning" ? (
            <IconWarning />
          ) : null}
          {vm.rest.text}
        </span>
      </div>
      {vm.note ? <p className="note">{vm.note}</p> : null}
    </section>
  );
}
