// Markdown の ```mermaid の入力補助。
// - 色分け: codemirror-lang-mermaid（markdown.ts でフェンスの言語として登録する）
// - 図のひな形: Mermaid 公式の @mermaid-js/examples
// - 図の種類の判定・書き間違いの指摘: mermaid 本体（detectType / parse）
// - ブロックの場所: @codemirror/lang-markdown の構文木
import {
  type Completion,
  type CompletionContext,
  type CompletionResult,
  completeAnyWord,
} from "@codemirror/autocomplete";
import { markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { type Diagnostic, linter } from "@codemirror/lint";
import { EditorState, type Extension } from "@codemirror/state";
import { diagramData } from "@mermaid-js/examples";

import { loadMermaid } from "./mermaidLoader";

type Tree = ReturnType<typeof syntaxTree>;

interface Fence {
  /** ``` のあとの言語名 */
  info: { from: number; to: number; text: string };
  /** 中身（空のブロックなら null） */
  code: { from: number; to: number } | null;
  /** 閉じフェンスの位置（まだ閉じていなければ null） */
  closing: number | null;
}

export interface MermaidBlock {
  from: number;
  to: number;
  code: string;
}

function readFence(
  node: Tree["topNode"],
  read: (from: number, to: number) => string,
): Fence | null {
  const info = node.getChild("CodeInfo");
  if (!info) return null;
  const code = node.getChild("CodeText");
  const marks = node.getChildren("CodeMark");
  return {
    info: { from: info.from, to: info.to, text: read(info.from, info.to) },
    code: code ? { from: code.from, to: code.to } : null,
    closing: marks.length > 1 ? (marks[marks.length - 1]?.from ?? null) : null,
  };
}

const isMermaid = (fence: Fence) => fence.info.text.trim().toLowerCase() === "mermaid";

/** 閉じフェンスまで書けている ```mermaid のブロック */
function collectBlocks(tree: Tree, read: (from: number, to: number) => string): MermaidBlock[] {
  const blocks: MermaidBlock[] = [];
  tree.iterate({
    enter: (ref) => {
      if (ref.name !== "FencedCode") return undefined;
      const fence = readFence(ref.node, read);
      if (fence && fence.closing !== null && fence.code && isMermaid(fence))
        blocks.push({ ...fence.code, code: read(fence.code.from, fence.code.to) });
      return false;
    },
  });
  return blocks;
}

/** 入力欄の文章（Markdown）から ```mermaid のブロックを取り出す（図の表示に使う） */
export function mermaidBlocksOf(text: string): MermaidBlock[] {
  return collectBlocks(markdownLanguage.parser.parse(text), (from, to) => text.slice(from, to));
}

function fenceAt(state: EditorState, pos: number): Fence | null {
  let found: Fence | null = null;
  syntaxTree(state).iterate({
    from: pos,
    to: pos,
    enter: (ref) => {
      if (ref.name !== "FencedCode") return undefined;
      found = readFence(ref.node, (from, to) => state.sliceDoc(from, to));
      return false;
    },
  });
  return found;
}

function examples(wrap: (code: string) => string): Completion[] {
  return diagramData.flatMap((diagram) =>
    diagram.examples.map((example) => ({
      label:
        example.isDefault || diagram.examples.length === 1
          ? diagram.name
          : `${diagram.name}: ${example.title}`,
      detail: "Mermaid",
      info: diagram.description,
      type: "text",
      boost: example.isDefault ? 1 : 0,
      apply: wrap(example.code.trim()),
    })),
  );
}

const DIAGRAMS = examples((code) => `${code}\n`);
const FENCES = examples((code) => `mermaid\n${code}\n\`\`\``);

/** フェンスの言語名を書いているところ（```mer など）なら、閉じフェンスまでまとめて入れる */
function completeFence(context: CompletionContext, fence: Fence): CompletionResult | null {
  if (fence.closing !== null || context.pos < fence.info.from || context.pos > fence.info.to)
    return null;
  const typed = context.state.sliceDoc(fence.info.from, context.pos).toLowerCase();
  if (!"mermaid".startsWith(typed) || (!typed && !context.explicit)) return null;
  return { from: fence.info.from, to: fence.info.to, options: FENCES, filter: false };
}

async function completeMermaid(context: CompletionContext): Promise<CompletionResult | null> {
  const fence = fenceAt(context.state, context.pos);
  if (!fence) return null;
  const fenceCompletion = completeFence(context, fence);
  if (fenceCompletion || !isMermaid(fence)) return fenceCompletion;
  const contentFrom = context.state.doc.lineAt(fence.info.to).to + 1;
  if (context.pos < contentFrom || (fence.closing !== null && context.pos > fence.closing))
    return null;
  const word = context.matchBefore(/[\w-]*/u);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  const mermaid = await loadMermaid();
  if (context.aborted) return null;
  try {
    // 図の種類がもう書いてあれば、この図の中の語を補完する
    mermaid.detectType(context.state.sliceDoc(contentFrom, word.from));
    return completeAnyWord(context);
  } catch {
    return { from: word.from, options: DIAGRAMS };
  }
}

interface MermaidParseError {
  message?: string;
  hash?: { loc?: { first_line: number; last_line: number } };
}

async function mermaidDiagnostics(state: EditorState): Promise<Diagnostic[]> {
  const tree = ensureSyntaxTree(state, state.doc.length, 200) ?? syntaxTree(state);
  const blocks = collectBlocks(tree, (from, to) => state.sliceDoc(from, to)).filter((block) =>
    block.code.trim(),
  );
  if (blocks.length === 0) return [];
  const mermaid = await loadMermaid();
  const results = await Promise.all(
    blocks.map(async (block): Promise<Diagnostic | null> => {
      try {
        await mermaid.parse(block.code);
        return null;
      } catch (raw) {
        const error = raw as MermaidParseError;
        // jison で読む図は、何行目かを hash.loc に入れて返す（ブロックの中の 1 から数えた行）
        const firstLine = state.doc.lineAt(block.from).number;
        const loc = error.hash?.loc;
        const lines =
          loc && firstLine + loc.last_line - 1 <= state.doc.lines
            ? {
                from: state.doc.line(firstLine + loc.first_line - 1).from,
                to: state.doc.line(firstLine + loc.last_line - 1).to,
              }
            : { from: block.from, to: block.to };
        return {
          ...lines,
          severity: "error",
          source: "Mermaid",
          message: (error.message ?? String(raw)).split("\n").slice(0, 4).join("\n"),
        };
      }
    }),
  );
  return results.filter((diagnostic) => diagnostic !== null);
}

/**
 * Mermaid の入力補助。補完は言語ごとのデータではなく EditorState.languageData に足して、
 * Markdown の本文（```mer と書いているところ）でも mermaid の中でも効くようにする。
 */
export function mermaidAssist(): Extension {
  return [
    EditorState.languageData.of(() => [{ autocomplete: completeMermaid }]),
    linter((view) => mermaidDiagnostics(view.state), { delay: 750 }),
  ];
}
