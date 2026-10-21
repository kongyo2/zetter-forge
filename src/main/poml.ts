// POML の入力補助。microsoft/POML の pomljs が持つ言語機能（VS Code 拡張の言語サーバーが使う
// PomlFile）をそのまま使う。pomljs は sharp などの Node 向けの依存があるので、画面側ではなく
// メインプロセスで動かす。
//
// PomlFile は読み込む（構文を解析する）だけにして、描画（react() / poml()）はしない。描画すると
// {{ }} や if / for の中身を JavaScript として実行するので、他の人から受け取ったキャストを開いた
// だけでコードが動いてしまう。
import { Module, createRequire } from "node:module";
import path from "node:path";

import type {
  PomlAnalysis,
  PomlCompletionOption,
  PomlCompletions,
  PomlDiagnostic,
  PomlHover,
  PomlRange,
} from "@shared/poml";

// ---- pomljs のうち、ここで使う部分の形（pomljs は型定義を同梱していない） ----

/** pomljs の位置。end も含む */
interface Span {
  start: number;
  end: number;
}

interface PomlToken {
  type: "element" | "attribute" | "attributeValue" | "expression";
  range: Span;
  element?: string;
  attribute?: string;
  value?: string;
  expression?: string;
}

/** @xml-tools/ast の要素 */
interface XmlElement {
  name: string | null;
  subElements: XmlElement[];
}

interface PomlFile {
  getCompletions(offset: number): PomlToken[];
  getHoverToken(offset: number): PomlToken | undefined;
  getExpressionTokens(): PomlToken[];
  xmlRootElement(): XmlElement | undefined;
  /** タグ名の範囲。POML 自身が「コンポーネントがない」の位置に使う */
  xmlOpenNameRange(element: XmlElement): Span;
}

interface Parameter {
  name: string;
  type: string;
  choices: string[];
  description: string;
}

interface Component {
  name: string;
  spec(): { description: string } | undefined;
  /** 元になったコンポーネントから受け継ぐ属性も含む */
  parameters(): Parameter[];
}

interface Pomljs {
  PomlFile: new (text: string) => PomlFile;
  ErrorCollection: { clear(): void; list(): unknown[] };
  /** 見つからなければ、候補を添えた文言を返す */
  findComponentByAlias(alias: string): Component | string;
}

let pomljs: Pomljs | null = null;

/**
 * pomljs は読み込むときに画像の処理（sharp）も読む。ここでは画像を描かないので sharp は使わないが、
 * sharp のネイティブ部分がその CPU 向けに入っていないと（Apple Silicon の CI で作った Intel 版の
 * macOS アプリなど）pomljs ごと読めなくなる。そのときは、呼ばれたらエラーにするだけの代わりを置く。
 */
function allowMissingSharp(pomlRequire: NodeJS.Require): void {
  try {
    pomlRequire("sharp");
  } catch (error) {
    const id = pomlRequire.resolve("sharp");
    const placeholder = new Module(id);
    placeholder.exports = () => {
      throw new Error("sharp を読み込めないので、画像は扱えません。", { cause: error });
    };
    placeholder.loaded = true;
    pomlRequire.cache[id] = placeholder;
  }
}

function load(): Pomljs {
  if (pomljs) return pomljs;
  const require = createRequire(__filename);
  // PomlFile と ErrorCollection は pomljs の入口から出ていないので、同じパッケージの中のファイルを読む
  // （入口と同じファイルなので、入口が登録したコンポーネントの一覧もそのまま使える）。
  const root = path.dirname(require.resolve("pomljs/package.json"));
  allowMissingSharp(createRequire(path.join(root, "dist", "index.cjs")));
  const entry = require("pomljs") as { read?: unknown };
  if (typeof entry.read !== "function") throw new Error("pomljs を読み込めませんでした。");
  const { PomlFile } = require(path.join(root, "dist", "file.cjs")) as Pick<Pomljs, "PomlFile">;
  const base = require(path.join(root, "dist", "base.cjs")) as Omit<Pomljs, "PomlFile">;
  pomljs = {
    PomlFile,
    ErrorCollection: base.ErrorCollection,
    findComponentByAlias: base.findComponentByAlias,
  };
  return pomljs;
}

/** 読み込み、そのあいだに pomljs が集めたエラーも返す */
function read(text: string): { poml: Pomljs; file: PomlFile; root: XmlElement | undefined } {
  const poml = load();
  poml.ErrorCollection.clear();
  const file = new poml.PomlFile(text);
  return { poml, file, root: file.xmlRootElement() };
}

function toRange({ start, end }: Span): PomlRange {
  return { from: start, to: Math.max(start, end + 1) };
}

// pomljs の描画（parseXmlElement）が、コンポーネントを探す前に自分で扱うタグ
const HANDLED_BEFORE_LOOKUP = new Set([
  "let",
  "include",
  "meta",
  "output-schema",
  "outputschema",
  "tool-definition",
  "tool-def",
  "tooldef",
  "tool",
  "runtime",
]);
// <poml> の直下にあるときは描画されないタグ
const SKIPPED_UNDER_POML = new Set(["stylesheet", "context"]);

/** 描画のときに出る「コンポーネントがない」を、描画せずに同じ関数で調べる */
function unknownComponents(poml: Pomljs, file: PomlFile, root: XmlElement): PomlDiagnostic[] {
  const found: PomlDiagnostic[] = [];
  const visit = (element: XmlElement, parent: string | null) => {
    const name = element.name?.toLowerCase();
    if (!name) return;
    if (parent === "poml" && SKIPPED_UNDER_POML.has(name)) return;
    if (!HANDLED_BEFORE_LOOKUP.has(name)) {
      const component = poml.findComponentByAlias(element.name ?? "");
      if (typeof component === "string") {
        found.push({
          ...toRange(file.xmlOpenNameRange(element)),
          severity: "warning",
          message: component,
        });
      }
    }
    for (const child of element.subElements) visit(child, name);
  };
  visit(root, null);
  return found;
}

function toDiagnostic(error: unknown, length: number): PomlDiagnostic {
  const { message, startIndex, endIndex } = error as {
    message?: string;
    startIndex?: number;
    endIndex?: number;
  };
  const from = Math.min(startIndex ?? 0, length);
  const to = Math.min(Math.max(from, (endIndex ?? from) + 1), length);
  return { from, to, severity: "error", message: message ?? String(error) };
}

/**
 * pomljs は属性の値の中の {{ }} の位置を、値を囲む引用符のぶんだけ手前にずらして返すので、
 * 「{{」の 1 字前から始まっていたら 1 字うしろへ直す。
 */
function expressionRange(text: string, token: PomlToken): PomlRange {
  const range = toRange(token.range);
  if (text.startsWith("{{", range.from) || !text.startsWith("{{", range.from + 1)) return range;
  return { from: range.from + 1, to: Math.min(range.to + 1, text.length) };
}

export function analyzePoml(text: string): PomlAnalysis {
  const { poml, file, root } = read(text);
  const diagnostics = root ? unknownComponents(poml, file, root) : [];
  for (const error of poml.ErrorCollection.list())
    diagnostics.push(toDiagnostic(error, text.length));
  const expressions = file
    .getExpressionTokens()
    .map((token) => expressionRange(text, token))
    .filter((range) => range.to > range.from);
  return { diagnostics: diagnostics.sort((a, b) => a.from - b.from), expressions };
}

// 説明の書き方は POML の VS Code 拡張（packages/poml-vscode/lsp/documentFormatter.ts）に合わせる
function parameterDoc(param: Parameter): string {
  let desc = "";
  if (param.type !== "string" && param.type.length >= 1)
    desc += `${param.type.charAt(0).toUpperCase()}${param.type.slice(1)}. `;
  if (param.choices.length > 0) desc += `Can be one of: ${param.choices.join(", ")}. `;
  desc += param.description;
  return `${param.name}: ${desc}`;
}

function componentDoc(component: Component): string {
  const spec = component.spec();
  if (!spec) return `Documentation unavailable for ${component.name}.`;
  const parts = [spec.description];
  const params = component.parameters();
  if (params.length > 0)
    parts.push(`Parameters\n${params.map((param) => `- ${parameterDoc(param)}`).join("\n")}`);
  return parts.join("\n\n");
}

function docFor(poml: Pomljs, element: string, attribute?: string): string {
  const component = poml.findComponentByAlias(element);
  if (typeof component === "string") return component;
  if (attribute === undefined) return componentDoc(component);
  const param = component.parameters().find((item) => item.name === attribute);
  return param
    ? parameterDoc(param)
    : `Documentation unavailable for ${attribute} in component ${component.name}.`;
}

function completionOption(poml: Pomljs, token: PomlToken): PomlCompletionOption | null {
  if (token.type === "element" && token.element)
    return {
      label: token.element,
      kind: "element",
      detail: "Component",
      info: docFor(poml, token.element),
    };
  if (!token.element || !token.attribute) return null;
  if (token.type === "attribute")
    return {
      label: token.attribute,
      kind: "attribute",
      detail: `Parameter of ${token.element}`,
      info: docFor(poml, token.element, token.attribute),
    };
  if (token.type === "attributeValue" && token.value !== undefined)
    return {
      label: token.value,
      kind: "value",
      detail: `${token.attribute} of ${token.element}`,
      info: docFor(poml, token.element, token.attribute),
    };
  return null;
}

export function completePoml(text: string, offset: number): PomlCompletions | null {
  const { poml, file } = read(text);
  const tokens = file.getCompletions(offset);
  const first = tokens[0];
  if (!first) return null;
  const options = tokens
    .map((token) => completionOption(poml, token))
    .filter((option) => option !== null);
  return options.length ? { ...toRange(first.range), options } : null;
}

export function hoverPoml(text: string, offset: number): PomlHover | null {
  const { poml, file } = read(text);
  const token = file.getHoverToken(offset);
  if (!token?.element) return null;
  const attribute = token.type !== "element" ? token.attribute : undefined;
  return { ...toRange(token.range), text: docFor(poml, token.element, attribute) };
}
