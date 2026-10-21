// POML の入力補助（メインプロセスの pomljs が答える）のやり取りに使う形。
// 位置はすべて入力欄の文章の中の UTF-16 の位置で、to は含まない。

export interface PomlRange {
  from: number;
  to: number;
}

export interface PomlDiagnostic extends PomlRange {
  severity: "error" | "warning";
  message: string;
}

export interface PomlAnalysis {
  diagnostics: PomlDiagnostic[];
  /** {{ }} や if / for の値など、POML が式として読むところ */
  expressions: PomlRange[];
}

export interface PomlCompletionOption {
  label: string;
  kind: "element" | "attribute" | "value";
  detail: string;
  info: string;
}

export interface PomlCompletions extends PomlRange {
  options: PomlCompletionOption[];
}

export interface PomlHover extends PomlRange {
  text: string;
}
