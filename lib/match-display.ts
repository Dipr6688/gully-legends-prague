import { parseLocalMatchDate } from "./leaderboard";
import {
  formatInningsScore,
  getFinalResultHeadline
} from "./match-records";
import type { MatchRecord, TeamId, TeamInnings } from "./types/match";

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

export function getMatchResultHeadline(match: MatchRecord): string {
  return getFinalResultHeadline(
    match.result,
    match.teams.teamA.teamName,
    match.teams.teamB.teamName
  );
}
