import type { MatchRecord, MatchStatus } from "./types/match";

type StoredMatchStatus = MatchStatus | "FINALIZED" | "FINALIZED_MATCH";

export function parseLocalMatchDate(value: string): Date | null {
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (isoMatch) {
    const [, year, month, day] = isoMatch;

    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const displayMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);

  if (displayMatch) {
    const [, day, month, year] = displayMatch;

    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  return null;
}

export function isSuccessfullyFinalisedMatch(match: MatchRecord): boolean {
  const normalisedStatus = String(match.status as StoredMatchStatus).toLowerCase();
  const isFinalised =
    normalisedStatus === "finalised" ||
    normalisedStatus === "finalized" ||
    normalisedStatus === "finalized_match";

  return isFinalised && match.result.type !== "no_result";
}

export function isMatchInCurrentMonth(match: MatchRecord, now = new Date()): boolean {
  const matchDate = parseLocalMatchDate(match.matchDate);

  if (!matchDate) return false;

  const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return matchDate >= startOfCurrentMonth && matchDate < startOfNextMonth;
}

export function getFilteredFinalisedMatches({
  matches,
  period,
  now = new Date()
}: {
  matches: MatchRecord[];
  period: "all-time" | "current-month";
  now?: Date;
}) {
  return matches
    .filter(isSuccessfullyFinalisedMatch)
    .filter((match) =>
      period === "current-month" ? isMatchInCurrentMonth(match, now) : true
    );
}
