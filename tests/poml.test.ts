import { describe, expect, it } from "vitest";

import { analyzePoml, completePoml, hoverPoml } from "../src/main/poml";

const slice = (text: string, range: { from: number; to: number }) =>
  text.slice(range.from, range.to);

describe("POML の入力補助（pomljs）", () => {
  it("知らないタグを、POML の候補つきの文言で指摘する", () => {
    const text = "<role>先生</role>\n<unknown-tag>やあ</unknown-tag>";
    const { diagnostics } = analyzePoml(text);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.severity).toBe("warning");
    expect(slice(text, diagnostics[0]!)).toBe("unknown-tag");
    expect(diagnostics[0]?.message).toMatch(/unknown-tag not found/u);
  });

  it("let や <poml> 直下の stylesheet は、描画のときと同じく知らないタグにしない", () => {
    const text =
      '<poml><stylesheet>{"p": {"syntax": "json"}}</stylesheet><let name="x" value="1" /><p>{{x}}</p></poml>';
    expect(analyzePoml(text).diagnostics).toEqual([]);
  });

  it("構文の誤りは pomljs の文言と位置で返す", () => {
    const text = "<poml><p sp>y</p></poml>";
    const { diagnostics } = analyzePoml(text);
    expect(diagnostics[0]?.severity).toBe("error");
    expect(diagnostics[0]?.message).toMatch(/EQUALS/u);
    expect(diagnostics[0]!.from).toBeGreaterThan(0);
  });

  it("式として読むところを返す（本文・属性・if）", () => {
    const text = '<role>あなたは{{ user }}</role>\n<task caption="T{{i}}" if="x > 1">hi</task>';
    const ranges = analyzePoml(text).expressions.map((range) => slice(text, range));
    expect(ranges).toEqual(["{{ user }}", "{{i}}", '"x > 1"']);
  });

  it("ただの文章でも落ちない", () => {
    expect(analyzePoml("ただの文章 {{user}} です").diagnostics).toEqual([]);
    expect(analyzePoml("").diagnostics.every((item) => item.from === 0)).toBe(true);
  });

  it("タグ名・属性・属性の値を補完する", () => {
    const tag = completePoml("<role>a</role>\n<ta", 18);
    expect(tag?.options.map((option) => option.label)).toContain("Task");
    expect(tag?.options[0]?.kind).toBe("element");
    expect(slice("<role>a</role>\n<ta", tag!)).toBe("ta");

    const value = completePoml('<task captionStyle="">x</task>', 20);
    expect(value?.options.map((option) => option.label)).toEqual([
      "header",
      "bold",
      "plain",
      "hidden",
    ]);
    expect(value?.options[0]?.info).toMatch(/^captionStyle: /u);
  });

  it("タグ名の説明を出す", () => {
    const text = "<output-format>JSON で</output-format>";
    const hover = hoverPoml(text, 3);
    expect(slice(text, hover!)).toBe("output-format");
    expect(hover?.text).toMatch(/format in which the model should provide the output/u);
    expect(hover?.text).toMatch(/- captionStyle: /u);
  });
});
