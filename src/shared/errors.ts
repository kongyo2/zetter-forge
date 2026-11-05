export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function failure(error: unknown): { ok: false; error: string } {
  return { ok: false, error: errorMessage(error) };
}
