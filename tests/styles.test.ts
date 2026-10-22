// 画面の CSS のうち、崩れても型やほかのテストでは気づけない決まりを確かめる。
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../src/renderer/src/styles.css", import.meta.url), "utf8");

/** セレクタのどれかが selector そのものである規則の、property の値（@media の中も含め、出てくる順） */
function valuesOf(selector: string, property: string): string[] {
  const values: string[] = [];
  const source = css.replace(/\/\*[\s\S]*?\*\//gu, "");
  for (const [, selectors = "", body = ""] of source.matchAll(/([^{}]+)\{([^{}]*)\}/gu)) {
    if (!selectors.split(",").some((part) => part.trim() === selector)) continue;
    for (const declaration of body.split(";")) {
      const colon = declaration.indexOf(":");
      if (colon >= 0 && declaration.slice(0, colon).trim() === property)
        values.push(declaration.slice(colon + 1).trim());
    }
  }
  return values;
}

describe("編集画面が流れないための CSS", () => {
  it(".workspace は、フォーカスや scrollIntoView で流れない（#8）", () => {
    expect(valuesOf(".workspace", "overflow")).toEqual(["clip"]);
  });

  it(".editor-main は、中の absolute の要素の基準になる", () => {
    expect(valuesOf(".editor-main", "position")).toEqual(["relative"]);
  });
});
