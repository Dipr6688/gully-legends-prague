import "server-only";

import { validateMatchInput } from "@/lib/match-validation-core";
import type { MatchValidationInput } from "@/lib/match-records";

export function validateMatchOnServer(input: MatchValidationInput) {
  return validateMatchInput(input);
}
