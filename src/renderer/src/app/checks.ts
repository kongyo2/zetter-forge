// 確認（Zetter で完成するときに問題になる点）。同じ文書なら一度だけ数える。
import { validateCast } from "@shared/validate";

import { perDocument } from "./memo";

export const issuesOf = perDocument(validateCast);
