// mermaid は大きいので、使うときに初めて読み込む。
type Mermaid = (typeof import("mermaid"))["default"];

let loading: Promise<Mermaid> | null = null;
let initializedTheme: "default" | "dark" | null = null;

function preferredTheme(): "default" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "default";
}

export async function loadMermaid(): Promise<Mermaid> {
  loading ??= import("mermaid").then((module) => module.default);
  const mermaid = await loading;
  const theme = preferredTheme();
  if (theme !== initializedTheme) {
    mermaid.initialize({
      startOnLoad: false,
      // 図の中の HTML やクリック時のスクリプトを無効にする
      securityLevel: "strict",
      // 書き間違いのときに、ページへエラーの図を差し込まない（こちらで文言を出す）
      suppressErrorRendering: true,
      theme,
    });
    initializedTheme = theme;
  }
  return mermaid;
}
