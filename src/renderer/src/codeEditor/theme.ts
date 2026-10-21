import { tags } from "@lezer/highlight";
import { type CreateThemeOptions, createTheme } from "@uiw/codemirror-themes";
import { mermaidTags } from "codemirror-lang-mermaid";

// 色はすべて styles.css の変数を使う（明るい・暗いの切り替えも styles.css に任せる）。
// light / dark の違いは、補完の一覧などの CodeMirror 既定の部品の色合いだけ。
const settings: CreateThemeOptions["settings"] = {
  background: "var(--sheet)",
  foreground: "var(--text)",
  caret: "var(--text)",
  selection: "color-mix(in srgb, var(--focus) 26%, transparent)",
  selectionMatch: "color-mix(in srgb, var(--focus) 14%, transparent)",
  fontFamily: "var(--font-text)",
  fontSize: "15px",
};

const styles: CreateThemeOptions["styles"] = [
  { tag: tags.heading, fontWeight: "700" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: [tags.link, tags.url], color: "var(--focus)" },
  { tag: tags.monospace, fontFamily: "var(--font-code)", color: "var(--cast-7)" },
  { tag: tags.quote, color: "var(--text-2)" },
  // Markdown の記号（# * > - ``` など）
  {
    tag: [tags.processingInstruction, tags.contentSeparator, tags.labelName, tags.meta],
    color: "var(--text-3)",
  },
  { tag: tags.comment, color: "var(--text-3)", fontStyle: "italic" },
  {
    tag: [tags.keyword, tags.controlKeyword, tags.modifier, tags.operatorKeyword],
    color: "var(--cast-5)",
  },
  { tag: [tags.string, tags.special(tags.string), tags.character], color: "var(--ok)" },
  { tag: [tags.number, tags.bool, tags.atom, tags.null], color: "var(--cast-7)" },
  { tag: [tags.typeName, tags.className, tags.tagName, tags.namespace], color: "var(--cast-1)" },
  { tag: [tags.attributeName, tags.propertyName], color: "var(--cast-3)" },
  {
    tag: [tags.function(tags.variableName), tags.definition(tags.variableName)],
    color: "var(--cast-6)",
  },
  { tag: [tags.operator, tags.punctuation, tags.bracket], color: "var(--text-2)" },
  { tag: mermaidTags.diagramName, color: "var(--cast-5)", fontWeight: "700" },
  { tag: tags.invalid, color: "var(--error)" },
];

export const forgeLightTheme = createTheme({ theme: "light", settings, styles });
export const forgeDarkTheme = createTheme({ theme: "dark", settings, styles });
