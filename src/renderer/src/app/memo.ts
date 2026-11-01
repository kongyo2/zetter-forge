import type { CastDocument } from "@shared/cast";

export function perDocument<T>(compute: (doc: CastDocument) => T): (doc: CastDocument) => T {
  const cache = new WeakMap<CastDocument, T>();
  return (doc) => {
    const cached = cache.get(doc);
    if (cached !== undefined) return cached;
    const value = compute(doc);
    cache.set(doc, value);
    return value;
  };
}
