import {
  isSuccessfullyFinalisedMatch,
  parseLocalMatchDate
} from "./leaderboard";
import {
  loadMatchHistory,
  saveMatchHistory,
  MATCH_HISTORY_UPDATED_EVENT
} from "./match-history-store";
import {
  canDeleteScheduledFixture,
  compactSameDayUnplayedMatchNumbers,
  isDeletedFixture
} from "./next-match";
import type { MatchRecord } from "./types/match";

export type MatchRepository = {
  getAllMatches(): MatchRecord[];
  getFinalisedMatches(): MatchRecord[];
  getMatchById(matchId: string): MatchRecord | null;
  saveMatch(match: MatchRecord): void;
  deleteScheduledMatch(matchId: string): boolean;
};

export function compareMatchDatesDescending(
  left: Pick<MatchRecord, "matchDate">,
  right: Pick<MatchRecord, "matchDate">
): number {
  const leftDate = parseLocalMatchDate(left.matchDate)?.getTime() ?? 0;
  const rightDate = parseLocalMatchDate(right.matchDate)?.getTime() ?? 0;

  return rightDate - leftDate;
}

function compareMatchNumbersDescending(
  left: Pick<MatchRecord, "matchNumber">,
  right: Pick<MatchRecord, "matchNumber">
): number {
  const leftNumber = left.matchNumber ?? Number.NEGATIVE_INFINITY;
  const rightNumber = right.matchNumber ?? Number.NEGATIVE_INFINITY;

  return rightNumber - leftNumber;
}

function getFinalisedFallbackTime(match: MatchRecord): number {
  const fallbackDate =
    match.progressionAppliedAt ?? match.supabaseUpdatedAt ?? "";
  const parsedTime = Date.parse(fallbackDate);

  return Number.isFinite(parsedTime) ? parsedTime : 0;
}

export function compareFinalisedMatchesDescending(
  left: MatchRecord,
  right: MatchRecord
): number {
  const dateOrder = compareMatchDatesDescending(left, right);

  if (dateOrder !== 0) return dateOrder;

  const matchNumberOrder = compareMatchNumbersDescending(left, right);

  if (matchNumberOrder !== 0) return matchNumberOrder;

  const leftFallbackTime = getFinalisedFallbackTime(left);
  const rightFallbackTime = getFinalisedFallbackTime(right);

  if (leftFallbackTime !== rightFallbackTime) {
    return rightFallbackTime - leftFallbackTime;
  }

  return right.id.localeCompare(left.id);
}

export function getFinalisedMatches(matches: MatchRecord[]): MatchRecord[] {
  return matches
    .filter((match) => !isDeletedFixture(match))
    .filter(isSuccessfullyFinalisedMatch)
    .sort(compareFinalisedMatchesDescending);
}

export class LocalMatchRepository implements MatchRepository {
  private getStoredMatches(): MatchRecord[] {
    return loadMatchHistory();
  }

  getAllMatches(): MatchRecord[] {
    return this.getStoredMatches().filter((match) => !isDeletedFixture(match));
  }

  getFinalisedMatches(): MatchRecord[] {
    return getFinalisedMatches(this.getAllMatches());
  }

  getMatchById(matchId: string): MatchRecord | null {
    return this.getAllMatches().find((match) => match.id === matchId) ?? null;
  }

  saveMatch(match: MatchRecord): void {
    const currentMatches = this.getStoredMatches();
    const nextMatches = [
      match,
      ...currentMatches.filter((storedMatch) => storedMatch.id !== match.id)
    ];

    saveMatchHistory(nextMatches);
  }

  deleteScheduledMatch(matchId: string): boolean {
    const currentMatches = this.getStoredMatches();
    const targetMatch = currentMatches.find(
      (match) => match.id === matchId && !isDeletedFixture(match)
    );

    if (!targetMatch || !canDeleteScheduledFixture(targetMatch)) return false;

    const deletedMatch = {
      ...targetMatch,
      deletedAt: new Date().toISOString()
    };
    const withDeletedMatch = currentMatches.map((match) =>
      match.id === matchId ? deletedMatch : match
    );
    const nextMatches = compactSameDayUnplayedMatchNumbers(
      withDeletedMatch,
      targetMatch.matchDate
    );

    saveMatchHistory(nextMatches);

    return true;
  }
}

export const localMatchRepository: MatchRepository = new LocalMatchRepository();
export { MATCH_HISTORY_UPDATED_EVENT };
