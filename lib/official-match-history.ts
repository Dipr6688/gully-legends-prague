import {
  isSuccessfullyFinalisedMatch,
  parseLocalMatchDate
} from "./match-eligibility";
import type { MatchRecord } from "./types/match";

function parseTimestamp(value: string | undefined): number | null {
  if (!value) return null;

  const parsed = Date.parse(value);

  return Number.isFinite(parsed) ? parsed : null;
}

export function isOfficialCelebrationMatch(match: MatchRecord): boolean {
  return (
    isSuccessfullyFinalisedMatch(match) &&
    !match.isDemo &&
    !match.isDemoTestMatch &&
    !match.deletedAt &&
    !match.id.startsWith("apk-pending-")
  );
}

export function isBeforeCelebrationMatch(
  candidate: MatchRecord,
  target: MatchRecord
): boolean {
  if (candidate.id === target.id) return false;

  const candidateDate = parseLocalMatchDate(candidate.matchDate);
  const targetDate = parseLocalMatchDate(target.matchDate);

  if (candidateDate && targetDate) {
    const candidateTime = candidateDate.getTime();
    const targetTime = targetDate.getTime();

    if (candidateTime < targetTime) return true;
    if (candidateTime > targetTime) return false;
  }

  if (
    candidate.matchDate === target.matchDate &&
    typeof candidate.matchNumber === "number" &&
    typeof target.matchNumber === "number"
  ) {
    return candidate.matchNumber < target.matchNumber;
  }

  const candidateAppliedAt = parseTimestamp(candidate.progressionAppliedAt);
  const targetAppliedAt = parseTimestamp(target.progressionAppliedAt);

  if (candidateAppliedAt !== null && targetAppliedAt !== null) {
    return candidateAppliedAt < targetAppliedAt;
  }

  const candidateUpdatedAt = parseTimestamp(candidate.supabaseUpdatedAt);
  const targetUpdatedAt = parseTimestamp(target.supabaseUpdatedAt);

  if (candidateUpdatedAt !== null && targetUpdatedAt !== null) {
    return candidateUpdatedAt < targetUpdatedAt;
  }

  return false;
}

export function getPostMatchCelebrationBaselineMatches({
  match,
  historicalMatches
}: {
  match: MatchRecord;
  historicalMatches: MatchRecord[];
}): MatchRecord[] {
  return historicalMatches.filter(
    (candidate) =>
      isOfficialCelebrationMatch(candidate) && isBeforeCelebrationMatch(candidate, match)
  );
}
