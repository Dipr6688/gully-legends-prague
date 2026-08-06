import { parseLocalMatchDate, isSuccessfullyFinalisedMatch } from "./leaderboard";
import { compareFixtureOrder } from "./next-match";
import { buildPlayerOfMatchSummary } from "./match-scorecard";
import { getPlayerById } from "./data/players";
import type { MatchRecord, TeamId } from "./types/match";

export const MATCH_ARCHIVE_PAGE_SIZE = 6;

export const ARCHIVE_MONTH_OPTIONS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
] as const;

export type MatchArchiveResultFilter = "all" | "teamA" | "teamB" | "tie";
export type MatchArchiveSortOrder = "newest" | "oldest";

export type MatchArchiveQuery = {
  q: string;
  month: number | "all";
  year: number | "all";
  result: MatchArchiveResultFilter;
  sort: MatchArchiveSortOrder;
  page: number;
};

export type MatchArchiveGroup = {
  dateKey: string;
  label: string;
  totalForDate: number;
  matches: MatchRecord[];
};

function parsePositiveInteger(value: string | null): number | null {
  if (!value) return null;

  const parsed = Number.parseInt(value, 10);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function normaliseArchiveQuery(
  params: URLSearchParams | Record<string, string | string[] | undefined>
): MatchArchiveQuery {
  const getValue = (key: string) => {
    if (params instanceof URLSearchParams) return params.get(key);

    const value = params[key];

    return Array.isArray(value) ? value[0] ?? null : value ?? null;
  };
  const month = parsePositiveInteger(getValue("month"));
  const year = parsePositiveInteger(getValue("year"));
  const result = getValue("result");
  const sort = getValue("sort");
  const page = parsePositiveInteger(getValue("page")) ?? 1;

  return {
    q: getValue("q")?.trim() ?? "",
    month: month && month >= 1 && month <= 12 ? month : "all",
    year: year ?? "all",
    result:
      result === "teamA" || result === "teamB" || result === "tie"
        ? result
        : "all",
    sort: sort === "oldest" ? "oldest" : "newest",
    page
  };
}

export function getArchiveResultCategory(
  match: MatchRecord
): Exclude<MatchArchiveResultFilter, "all"> | "other" {
  if (match.result.type === "tie") return "tie";

  if (
    match.result.type === "win_by_runs" ||
    match.result.type === "win_by_wickets"
  ) {
    return match.result.winnerTeamId;
  }

  return "other";
}

export function getAvailableArchiveYears(matches: MatchRecord[]): number[] {
  return Array.from(
    new Set(
      matches
        .map((match) => parseLocalMatchDate(match.matchDate)?.getFullYear())
        .filter((year): year is number => Number.isInteger(year))
    )
  ).sort((left, right) => right - left);
}

export function getArchiveMatchSearchText(match: MatchRecord): string {
  const playerOfMatch = buildPlayerOfMatchSummary(match, getPlayerById);

  return [
    match.matchName,
    match.venue,
    match.teams.teamA.teamName,
    match.teams.teamB.teamName,
    playerOfMatch?.name
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function filterArchivedMatches(
  matches: MatchRecord[],
  query: MatchArchiveQuery
): MatchRecord[] {
  const searchTerm = query.q.toLowerCase();

  return matches
    .filter(isSuccessfullyFinalisedMatch)
    .filter((match) => {
      const matchDate = parseLocalMatchDate(match.matchDate);

      if (!matchDate) return false;

      if (query.month !== "all" && matchDate.getMonth() + 1 !== query.month) {
        return false;
      }

      if (query.year !== "all" && matchDate.getFullYear() !== query.year) {
        return false;
      }

      if (
        query.result !== "all" &&
        getArchiveResultCategory(match) !== query.result
      ) {
        return false;
      }

      if (searchTerm && !getArchiveMatchSearchText(match).includes(searchTerm)) {
        return false;
      }

      return true;
    });
}

export function sortArchivedMatches(
  matches: MatchRecord[],
  sort: MatchArchiveSortOrder
): MatchRecord[] {
  return [...matches].sort((left, right) => {
    const leftDate = parseLocalMatchDate(left.matchDate)?.getTime() ?? 0;
    const rightDate = parseLocalMatchDate(right.matchDate)?.getTime() ?? 0;

    if (leftDate !== rightDate) {
      return sort === "newest" ? rightDate - leftDate : leftDate - rightDate;
    }

    return compareFixtureOrder(left, right);
  });
}

export function getPaginatedArchiveMatches(
  matches: MatchRecord[],
  page: number,
  pageSize = MATCH_ARCHIVE_PAGE_SIZE
): {
  pageMatches: MatchRecord[];
  currentPage: number;
  pageCount: number;
  totalMatches: number;
  startItem: number;
  endItem: number;
} {
  const totalMatches = matches.length;
  const pageCount = Math.max(1, Math.ceil(totalMatches / pageSize));
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const startIndex = (currentPage - 1) * pageSize;
  const pageMatches = matches.slice(startIndex, startIndex + pageSize);

  return {
    pageMatches,
    currentPage,
    pageCount,
    totalMatches,
    startItem: totalMatches === 0 ? 0 : startIndex + 1,
    endItem: Math.min(totalMatches, startIndex + pageMatches.length)
  };
}

export function groupArchiveMatchesByDate(
  matches: MatchRecord[],
  allFilteredMatches: MatchRecord[] = matches
): MatchArchiveGroup[] {
  const dateCounts = new Map<string, number>();

  for (const match of allFilteredMatches) {
    dateCounts.set(match.matchDate, (dateCounts.get(match.matchDate) ?? 0) + 1);
  }

  return matches.reduce<MatchArchiveGroup[]>((groups, match) => {
    const existingGroup = groups.find((group) => group.dateKey === match.matchDate);
    const matchDate = parseLocalMatchDate(match.matchDate);
    const label = matchDate
      ? new Intl.DateTimeFormat("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric"
        })
          .format(matchDate)
          .toUpperCase()
      : match.matchDate.toUpperCase();

    if (existingGroup) {
      existingGroup.matches.push(match);
    } else {
      groups.push({
        dateKey: match.matchDate,
        label,
        totalForDate: dateCounts.get(match.matchDate) ?? 1,
        matches: [match]
      });
    }

    return groups;
  }, []);
}

export function getTeamResultLabel(teamId: TeamId): string {
  return teamId === "teamA" ? "Team A Win" : "Team B Win";
}
