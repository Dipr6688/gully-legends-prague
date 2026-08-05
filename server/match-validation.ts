import "server-only";

import {
  calculateTeamTotals,
  validateMatchRecordInput,
  type MatchValidationInput
} from "@/lib/match-records";

export function validateMatchOnServer(input: MatchValidationInput) {
  const totals = calculateTeamTotals(input.performances, input);
  const errors = validateMatchRecordInput(input);

  return {
    ok: errors.length === 0,
    errors,
    totals
  };
}
