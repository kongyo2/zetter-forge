// 画面の部品（View）と仲介役（Mediator）のあいだで使う基本の型。
// このフォルダ（app/）は DOM にも React にも触れない。仲介役の判断をそのままテストできるようにするため。
import type { EditorTab } from "@shared/validate";

/** 文書の中の場所の 1 区切り。リストの要素は id（文字列）か位置（数） */
type Segment = string | number;
/** 文書の中の場所（["cast", "name"]、["members", <id>, "profile"] など） */
export type Path = readonly Segment[];

/** 入力欄の中で選んでいる範囲（カーソルの位置） */
export interface Selection {
  start: number;
  end: number;
}

/** 選んだ画像ファイル（DOM の File と同じ形のうち、仲介役が見るところだけ） */
export interface PickedFile {
  readonly name: string;
  readonly type: string;
  readonly size: number;
}

/** 編集画面のタブ（確認の対象になるタブと、Zetter へ写すタブ） */
export type ViewTab = EditorTab | "transfer";

/** キャラクターのタブで本人を指すキー */
export const MAIN_CHARACTER = "main";

/** 好感度の共通設定を指すキー */
export const AFFINITY_DEFAULT = "default";

export function samePath(left: Path, right: Path): boolean {
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
}

/** 場所を 1 つの文字列にする（コピーの記録のキーなど） */
export function pathKey(path: Path): string {
  return path.join("/");
}
