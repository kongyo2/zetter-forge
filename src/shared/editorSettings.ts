/**
 * 入力欄の書式。色分けと入力補助だけを変え、保存する文章（Zetter に送る文章）は変えない。
 * - plain: いままでどおりの入力欄
 * - markdown: GitHub 風の Markdown（表・打ち消し線・チェックリストなど）
 * - poml: microsoft/POML（Prompt Orchestration Markup Language）
 */
export type SyntaxMode = "plain" | "markdown" | "poml";

const SYNTAX_MODES: readonly SyntaxMode[] = ["plain", "markdown", "poml"];

export interface EditorSettings {
  syntax: SyntaxMode;
  /** POML のタグ・属性の補完、説明の表示、書き間違いの指摘（pomljs を使う） */
  pomlAssist: boolean;
  /** ```mermaid の中の色分け・補完・書き間違いの指摘 */
  mermaidAssist: boolean;
  /** ```mermaid の図を入力欄の下に描く */
  mermaidPreview: boolean;
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  syntax: "plain",
  pomlAssist: true,
  mermaidAssist: true,
  mermaidPreview: true,
};

/** 設定ファイルや画面から来た値を、足りない・おかしい項目は既定値にして整える。 */
export function normalizeEditorSettings(raw: unknown): EditorSettings {
  const source = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const flag = (key: "pomlAssist" | "mermaidAssist" | "mermaidPreview") => {
    const value = source[key];
    return typeof value === "boolean" ? value : DEFAULT_EDITOR_SETTINGS[key];
  };
  return {
    syntax: SYNTAX_MODES.includes(source.syntax as SyntaxMode)
      ? (source.syntax as SyntaxMode)
      : DEFAULT_EDITOR_SETTINGS.syntax,
    pomlAssist: flag("pomlAssist"),
    mermaidAssist: flag("mermaidAssist"),
    mermaidPreview: flag("mermaidPreview"),
  };
}
