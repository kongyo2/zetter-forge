import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import type { Extension } from "@codemirror/state";
import { Decoration, MatchDecorator, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { mermaidLanguageDescription } from "codemirror-lang-mermaid";

import { mermaidAssist } from "./mermaid";

// Zetter が会話の相手の名前に置き換える {{user}} を目立たせる
const placeholderMatcher = new MatchDecorator({
  regexp: /\{\{\s*user\s*\}\}/gu,
  decoration: Decoration.mark({ class: "cm-zetter-placeholder" }),
});

const placeholderMarks = ViewPlugin.define(
  (view) => ({
    decorations: placeholderMatcher.createDeco(view),
    update(update: ViewUpdate) {
      this.decorations = placeholderMatcher.updateDeco(update, this.decorations);
    },
  }),
  { decorations: (plugin) => plugin.decorations },
);

/**
 * GitHub 風の Markdown（@codemirror/lang-markdown の markdownLanguage は GFM の表・打ち消し線・
 * チェックリスト・自動リンクを含む）。``` の中は @codemirror/language-data の言語で色分けする。
 */
export function markdownSupport({ mermaid }: { mermaid: boolean }): Extension {
  return [
    markdown({
      base: markdownLanguage,
      codeLanguages: mermaid ? [mermaidLanguageDescription, ...languages] : languages,
    }),
    placeholderMarks,
    mermaid ? mermaidAssist() : [],
  ];
}
