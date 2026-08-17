import { parseLocalMatchDate } from "./leaderboard";
import {
  formatInningsScore,
  getFinalResultHeadline
} from "./match-records";
import type { MatchRecord, TeamId, TeamInnings } from "./types/match";

export type MatchScoreRow = {
  teamId: TeamId;
  teamName: string;
  score: string;
};

export function formatMatchDisplayDate(matchDate: string): string {
  const parsedDate = parseLocalMatchDate(matchDate);

  if (!parsedDate) return matchDate.toUpperCase();

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric"
  })
    .format(parsedDate)
    .toUpperCase();
}

export function getTeamInnings(match: MatchRecord, teamId: TeamId): TeamInnings {
  return match.innings.first.battingTeamId === teamId
    ? match.innings.first
    : match.innings.second;
}

export function getMatchTeamScore(match: MatchRecord, teamId: TeamId): string {
  const innings = getTeamInnings(match, teamId);

  return formatInningsScore(innings.runs, innings.wicketsLost);
}

function isTeamId(value: unknown): value is TeamId {
  return value === "teamA" || value === "teamB";
}

function getTeamName(match: MatchRecord, teamId: TeamId): string {
  return teamId === "teamA"
    ? match.teams.teamA.teamName || "Team A"
    : match.teams.teamB.teamName || "Team B";
}

export function getMatchScoreRowsInInningsOrder(match: MatchRecord): MatchScoreRow[] {
  const firstTeamId = isTeamId(match.battingFirstTeamId)
    ? match.battingFirstTeamId
    : isTeamId(match.innings.first.battingTeamId)
      ? match.innings.first.battingTeamId
      : null;
  const secondTeamId =
    firstTeamId && isTeamId(match.innings.second.battingTeamId)
      ? match.innings.second.battingTeamId
      : firstTeamId === "teamA"
        ? "teamB"
        : firstTeamId === "teamB"
          ? "teamA"
          : null;
  const orderedTeamIds =
    firstTeamId && secondTeamId && firstTeamId !== secondTeamId
      ? [firstTeamId, secondTeamId]
      : (["teamA", "teamB"] as const);

  return orderedTeamIds.map((teamId) => ({
    teamId,
    teamName: getTeamName(match, teamId),
    score: getMatchTeamScore(match, teamId)
  }));
}

export function getMatchResultHeadline(match: MatchRecord): string {
  return getFinalResultHeadline(
    match.result,
    match.teams.teamA.teamName,
    match.teams.teamB.teamName
  );
}
