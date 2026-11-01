const INK_SLOTS = 8;

export function castInk(index: number): string {
  return index < INK_SLOTS ? `var(--cast-${index + 1})` : "var(--cast-other)";
}

export const INKED_CHARACTERS = INK_SLOTS;
