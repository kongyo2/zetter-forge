// 文書から作る値の控え。文書は書き換えずに作り直す（edits.ts）ので、同じ文書には同じ値を返せばよい。
import type { CastDocument } from "@shared/cast";

/** compute を、同じ文書には一度だけ行う形にする */
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
