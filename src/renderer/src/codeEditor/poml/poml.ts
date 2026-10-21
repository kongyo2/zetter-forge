// POML の色分けと入力補助。
// - 色分け: microsoft/POML の VS Code 拡張と同じ TextMate 文法（poml.tmLanguage.json）を
//   shiki で読み、codemirror-shiki で CodeMirror に載せる。色は shiki の CSS 変数テーマ
//   （--poml-token-*。styles.css で決める）。
// - 括弧の自動で閉じる・コメント: 同じ拡張の language-configuration.json
// - 補完・説明・書き間違い・{{ }} の場所: pomljs（メインプロセス。src/main/poml.ts）
// poml.tmLanguage.json と language-configuration.json は microsoft/POML（MIT License。同じフォルダの LICENSE）。
import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { linter } from "@codemirror/lint";
import { EditorState, type Extension, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, hoverTooltip } from "@codemirror/view";
import type { PomlCompletionOption, PomlRange } from "@shared/poml";
import shiki from "codemirror-shiki";
import {
  type HighlighterCore,
  type LanguageRegistration,
  createCssVariablesTheme,
  createHighlighterCore,
} from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

import languageConfiguration from "./language-configuration.json";
import grammar from "./poml.tmLanguage.json";

const THEME = "forge-poml";

let highlighter: Promise<HighlighterCore> | null = null;

function pomlHighlighter(): Promise<HighlighterCore> {
  highlighter ??= createHighlighterCore({
    langs: [{ ...(grammar as unknown as LanguageRegistration), name: "poml" }],
    themes: [createCssVariablesTheme({ name: THEME, variablePrefix: "--poml-" })],
    // 画面の Content-Security-Policy では WebAssembly を動かせないので、Oniguruma ではなく JavaScript の正規表現で読む
    engine: createJavaScriptRegexEngine(),
  });
  return highlighter;
}

/** language-configuration.json の自動で閉じる括弧（CodeMirror の closeBrackets が扱える 1 字のもの）とコメント */
const languageData = EditorState.languageData.of(() => [
  {
    closeBrackets: {
      brackets: languageConfiguration.autoClosingPairs
        .map((pair) => pair.open)
        .filter((open) => open.length === 1),
    },
    commentTokens: {
      block: {
        open: languageConfiguration.comments.blockComment[0],
        close: languageConfiguration.comments.blockComment[1],
      },
    },
  },
]);

// ---- pomljs（メインプロセス）に聞く入力補助 ----

const COMPLETION_TYPES: Record<PomlCompletionOption["kind"], string> = {
  element: "class",
  attribute: "property",
  value: "enum",
};

function infoElement(text: string): HTMLElement {
  const dom = document.createElement("div");
  dom.className = "cm-poml-doc";
  dom.textContent = text;
  return dom;
}

async function completePoml(context: CompletionContext): Promise<CompletionResult | null> {
  // タグの中（< のあと、> の前）でだけ聞く。本文を書いているあいだは聞かない
  const line = context.state.doc.lineAt(context.pos);
  const before = line.text.slice(0, context.pos - line.from);
  if (!context.explicit && !/<[^<>]*$/u.test(before)) return null;
  const result = await window.forge.completePoml(context.state.doc.toString(), context.pos);
  if (!result || context.aborted) return null;
  return {
    from: result.from,
    to: result.to,
    options: result.options.map((option) => ({
      label: option.label,
      type: COMPLETION_TYPES[option.kind],
      detail: option.detail,
      info: () => infoElement(option.info),
    })),
  };
}

const pomlHover = hoverTooltip(async (view, pos) => {
  const hover = await window.forge.hoverPoml(view.state.doc.toString(), pos);
  if (!hover) return null;
  return {
    pos: hover.from,
    end: hover.to,
    above: true,
    create: () => ({ dom: infoElement(hover.text) }),
  };
});

const setExpressions = StateEffect.define<PomlRange[]>();
const expressionMark = Decoration.mark({ class: "cm-poml-expression" });

/** pomljs が式として読むところ（{{ }}、if / for の値など） */
const expressions = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    let next = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setExpressions)) continue;
      const length = transaction.state.doc.length;
      next = Decoration.set(
        effect.value
          .filter((range) => range.to <= length)
          .map((range) => expressionMark.range(range.from, range.to)),
        true,
      );
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** 書き間違いの指摘（pomljs の読み込みエラーと、描画のときに出る「コンポーネントがない」） */
const pomlLinter = linter(
  async (view) => {
    const doc = view.state.doc;
    const analysis = await window.forge.analyzePoml(doc.toString());
    // 待っているあいだに書き換わっていたら、古い位置の印は付けない（指摘は linter が捨てる）
    if (view.state.doc === doc) view.dispatch({ effects: setExpressions.of(analysis.expressions) });
    return analysis.diagnostics.map((diagnostic) => ({ ...diagnostic, source: "POML" }));
  },
  { delay: 400 },
);

export function pomlSupport({ assist }: { assist: boolean }): Extension {
  return [
    shiki({ highlighter: pomlHighlighter(), language: "poml", theme: THEME }),
    languageData,
    assist
      ? [
          EditorState.languageData.of(() => [{ autocomplete: completePoml }]),
          pomlHover,
          expressions,
          pomlLinter,
        ]
      : [],
  ];
}
