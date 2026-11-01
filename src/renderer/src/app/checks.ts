import { validateCast } from "@shared/validate";

import { perDocument } from "./memo";

export const issuesOf = perDocument(validateCast);
