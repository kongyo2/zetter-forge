import { type CastDocument, castDisplayTitle } from "@shared/cast";

export function memberOrdinal(index: number): string {
  return `${index + 2}人目`;
}

export function memberLabel(member: { name: string } | undefined, index: number): string {
  return member?.name.trim() || memberOrdinal(index);
}

export function selfLabel(doc: Pick<CastDocument, "name">): string {
  return doc.name.trim() || "本体";
}

export function toneLabel(index: number, part: string): string {
  return `口調サンプル${index + 1}の${part}`;
}

export function stageLabel(index: number, part: string): string {
  return `段階${index + 1}の${part}`;
}

export function displayTitle(doc: Pick<CastDocument, "mode" | "tagline" | "name">): string {
  return castDisplayTitle(doc).title || "名前未設定のキャスト";
}
