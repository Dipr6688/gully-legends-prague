import { parseLocalMatchDate } from "./leaderboard";
import {
  formatCompletedOvers,
  getOrderedInnings,
  getTeamName
} from "./match-scorecard";
import {
  formatInningsScore,
  sanitizeRuns
} from "./match-records";
import type { MatchRecord, TeamId } from "./types/match";

export type NextMatchState =
  | {
      type: "live";
      match: MatchRecord;
    }
  | {
      type: "match-day";
      match: MatchRecord;
    }
  | {
      type: "scheduled";
      match: MatchRecord;
    }
  | {
      type: "empty";
      match: null;
    };

export type NextMatchAction = {
  href: string;
  label: string;
};

export type MatchSlateItem = {
  match: MatchRecord;
  label: string;
  status: "done" | "live" | "next" | "later";
};

export type NextMatchLiveTeamSummary = {
  teamId: TeamId;
  teamName: string;
  score: string;
  detail: string;
};

export type DraftMatchSetupState =
  | "lineup-pending"
  | "setup-incomplete"
  | "ready";

export function isDeletedFixture(match: Pick<MatchRecord, "deletedAt">): boolean {
  return Boolean(match.deletedAt);
}

export function canDeleteScheduledFixture(match: MatchRecord): boolean {
  return !isDeletedFixture(match) && match.status === "draft";
}

export function isInProgressMatch(match: MatchRecord): boolean {
  return !isDeletedFixture(match) && match.status === "in_progress";
}

function isDraftMatch(match: MatchRecord): boolean {
  return !isDeletedFixture(match) && match.status === "draft";
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseStartTimeMinutes(startTime?: string): number | null {
  if (!startTime) return null;

  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(startTime);
  if (!match) return null;

  return Number(match[1]) * 60 + Number(match[2]);
}

export function compareFixtureOrder(left: MatchRecord, right: MatchRecord): number {
  const leftDate = parseLocalMatchDate(left.matchDate)?.getTime() ?? 0;
  const rightDate = parseLocalMatchDate(right.matchDate)?.getTime() ?? 0;

  if (leftDate !== rightDate) return leftDate - rightDate;

  const leftNumber = left.matchNumber ?? Number.POSITIVE_INFINITY;
  const rightNumber = right.matchNumber ?? Number.POSITIVE_INFINITY;

  if (leftNumber !== rightNumber) return leftNumber - rightNumber;

  const leftTime = parseStartTimeMinutes(left.startTime) ?? Number.POSITIVE_INFINITY;
  const rightTime =
    parseStartTimeMinutes(right.startTime) ?? Number.POSITIVE_INFINITY;

  if (leftTime !== rightTime) return leftTime - rightTime;

  return left.id.localeCompare(right.id);
}

export function getFixtureLabel(match: MatchRecord): string {
  return match.matchNumber ? `GAME ${match.matchNumber}` : "GAME";
}

export function getSameDayFixtures(
  matches: MatchRecord[],
  matchDate: string
): MatchRecord[] {
  return matches
    .filter((match) => match.matchDate === matchDate && !isDeletedFixture(match))
    .sort(compareFixtureOrder);
}

export function compactSameDayUnplayedMatchNumbers(
  matches: MatchRecord[],
  matchDate: string
): MatchRecord[] {
  const sameDayVisibleMatches = matches.filter(
    (match) => match.matchDate === matchDate && !isDeletedFixture(match)
  );
  const lockedNumbers = sameDayVisibleMatches
    .filter((match) => match.status !== "draft")
    .map((match) => match.matchNumber)
    .filter((value): value is number => Number.isInteger(value));
  const firstUnplayedNumber =
    lockedNumbers.length > 0 ? Math.max(...lockedNumbers) + 1 : 1;
  const nextNumbers = new Map(
    sameDayVisibleMatches
      .filter((match) => match.status === "draft")
      .sort(compareFixtureOrder)
      .map((match, index) => [match.id, firstUnplayedNumber + index])
  );

  return matches.map((match) =>
    nextNumbers.has(match.id)
      ? {
          ...match,
          matchNumber: nextNumbers.get(match.id) ?? match.matchNumber
        }
      : match
  );
}

export function getNextAvailableMatchNumber(
  matches: MatchRecord[],
  matchDate: string
): number {
  const usedNumbers = new Set(
    getSameDayFixtures(matches, matchDate)
      .map((match) => match.matchNumber)
      .filter((value): value is number => Number.isInteger(value))
  );
  let candidate = 1;

  while (usedNumbers.has(candidate)) {
    candidate += 1;
  }

  return candidate;
}

export function hasDuplicateMatchNumber({
  matches,
  matchDate,
  matchNumber,
  currentMatchId
}: {
  matches: MatchRecord[];
  matchDate: string;
  matchNumber: number | null | undefined;
  currentMatchId?: string;
}): boolean {
  if (!Number.isInteger(matchNumber)) return false;

  return matches.some(
    (match) =>
      !isDeletedFixture(match) &&
      match.id !== currentMatchId &&
      match.matchDate === matchDate &&
      match.matchNumber === matchNumber
  );
}

export function getLiveMatchConflict(
  matches: MatchRecord[],
  currentMatchId: string
): MatchRecord | null {
  return (
    matches.find(
      (match) => match.id !== currentMatchId && match.status === "in_progress"
    ) ?? null
  );
}

export function getNextMatchState(
  matches: MatchRecord[],
  now = new Date()
): NextMatchState {
  const inProgressMatch = [...matches].sort(compareFixtureOrder).find(isInProgressMatch);

  if (inProgressMatch) {
    return {
      type: "live",
      match: inProgressMatch
    };
  }

  const today = startOfLocalDay(now);
  const draftMatches = matches
    .filter(isDraftMatch)
    .map((match) => ({
      match,
      matchDate: parseLocalMatchDate(match.matchDate)
    }))
    .filter(
      (entry): entry is { match: MatchRecord; matchDate: Date } =>
        entry.matchDate !== null && startOfLocalDay(entry.matchDate) >= today
    )
    .map((entry) => entry.match)
    .sort(compareFixtureOrder);
  const nextDraftMatch = draftMatches[0];

  if (!nextDraftMatch) {
    return {
      type: "empty",
      match: null
    };
  }

  const nextDraftDate = parseLocalMatchDate(nextDraftMatch.matchDate);
  const isToday =
    nextDraftDate !== null &&
    startOfLocalDay(nextDraftDate).getTime() === today.getTime();

  return {
    type: isToday ? "match-day" : "scheduled",
    match: nextDraftMatch
  };
}

export function getMatchPositionLabel({
  matches,
  match
}: {
  matches: MatchRecord[];
  match: MatchRecord;
}): string | null {
  const sameDayFixtures = getSameDayFixtures(matches, match.matchDate);
  const index = sameDayFixtures.findIndex((candidate) => candidate.id === match.id);

  if (index < 0 || sameDayFixtures.length <= 1) return null;

  return `${getFixtureLabel(match)} OF ${sameDayFixtures.length}`;
}

export function getTodaySlate({
  matches,
  match,
  now = new Date()
}: {
  matches: MatchRecord[];
  match: MatchRecord;
  now?: Date;
}): MatchSlateItem[] {
  const selectedDate = match.matchDate;
  const state = getNextMatchState(matches, now);

  return getSameDayFixtures(matches, selectedDate).map((fixture) => {
    const label = String(fixture.matchNumber ?? "?");
    const status =
      fixture.status === "finalised"
        ? "done"
        : fixture.status === "in_progress"
          ? "live"
          : state.match?.id === fixture.id
            ? "next"
            : "later";

    return {
      match: fixture,
      label,
      status
    };
  });
}

export function hasAssignedTeams(match: MatchRecord): boolean {
  return (
    getTeamPlayerCount(match, "teamA") > 0 &&
    getTeamPlayerCount(match, "teamB") > 0
  );
}

export function getTeamPlayerCount(match: MatchRecord, teamId: TeamId): number {
  const team = teamId === "teamA" ? match.teams.teamA : match.teams.teamB;
  const playerIds = new Set(team.playerIds);

  if (match.sharedPlayerId) {
    playerIds.add(match.sharedPlayerId);
  }

  return playerIds.size;
}

export function getDraftMatchSetupState(match: MatchRecord): DraftMatchSetupState {
  if (!hasAssignedTeams(match)) return "lineup-pending";

  const teamAPlayerCount = getTeamPlayerCount(match, "teamA");
  const teamBPlayerCount = getTeamPlayerCount(match, "teamB");
  const uniqueAttendanceCount = getUniqueAttendanceCount(match);
  const sharedPlayerRequired = uniqueAttendanceCount % 2 === 1;
  const sharedPlayerValid =
    !sharedPlayerRequired ||
    (Boolean(match.sharedPlayerId) &&
      match.teams.teamA.playerIds.includes(match.sharedPlayerId as string) &&
      match.teams.teamB.playerIds.includes(match.sharedPlayerId as string));
  const scheduledOversIsValid =
    Number.isInteger(match.scheduledOversPerInnings) &&
    (match.scheduledOversPerInnings ?? 0) > 0;
  const isReadyToStart =
    uniqueAttendanceCount > 0 &&
    teamAPlayerCount === teamBPlayerCount &&
    sharedPlayerValid &&
    scheduledOversIsValid &&
    match.battingFirstTeamId !== null;

  return isReadyToStart ? "ready" : "setup-incomplete";
}

export function getUniqueAttendanceCount(match: MatchRecord): number {
  return new Set([
    ...match.teams.teamA.playerIds,
    ...match.teams.teamB.playerIds
  ]).size;
}

export function formatNextMatchDateLine(
  match: MatchRecord,
  stateType: "match-day" | "scheduled"
): string {
  const parsedDate = parseLocalMatchDate(match.matchDate);
  const parts: string[] = [];

  if (stateType === "match-day") {
    parts.push("TODAY");
  } else if (parsedDate) {
    parts.push(
      new Intl.DateTimeFormat("en-GB", {
        weekday: "short"
      })
        .format(parsedDate)
        .toUpperCase()
    );
    parts.push(
      new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short"
      })
        .format(parsedDate)
        .toUpperCase()
    );
  } else {
    parts.push(match.matchDate.toUpperCase());
  }

  if (parseStartTimeMinutes(match.startTime) !== null) {
    parts.push(match.startTime as string);
  }

  return parts.join(" \u2022 ");
}

export function getNextMatchCountdownLabel(
  match: MatchRecord,
  now = new Date()
): string | null {
  const parsedDate = parseLocalMatchDate(match.matchDate);
  if (!parsedDate) return null;

  const differenceMs =
    startOfLocalDay(parsedDate).getTime() - startOfLocalDay(now).getTime();
  const differenceDays = Math.round(differenceMs / 86_400_000);

  if (differenceDays < 0) return null;
  if (differenceDays === 0) return "TODAY";
  if (differenceDays === 1) return "TOMORROW";

  return `IN ${differenceDays} DAYS`;
}

export function getNextMatchAction(state: NextMatchState): NextMatchAction {
  if (state.type === "empty") {
    return {
      href: "/matches/new",
      label: "CREATE A MATCH TO BEGIN \u2192"
    };
  }

  const href = `/matches/${state.match.id}`;

  if (state.type === "live") {
    return {
      href,
      label: "CONTINUE SCORING \u2192"
    };
  }

  if (state.type === "match-day") {
    return {
      href,
      label:
        getDraftMatchSetupState(state.match) === "ready"
          ? "START SCORING \u2192"
          : "PREPARE MATCH \u2192"
    };
  }

  return {
    href,
    label:
      getDraftMatchSetupState(state.match) === "ready"
        ? "MANAGE MATCH \u2192"
        : "PREPARE MATCH \u2192"
  };
}

export function getLiveNextMatchTeamSummaries(
  match: MatchRecord
): NextMatchLiveTeamSummary[] {
  const [firstInnings, secondInnings] = getOrderedInnings(match);
  const secondInningsStarted =
    sanitizeRuns(secondInnings.runs) > 0 ||
    sanitizeRuns(secondInnings.wicketsLost) > 0 ||
    sanitizeRuns(secondInnings.completedOvers) > 0;

  const firstSummary: NextMatchLiveTeamSummary = {
    teamId: firstInnings.battingTeamId,
    teamName: getTeamName(match, firstInnings.battingTeamId),
    score: formatInningsScore(firstInnings.runs, firstInnings.wicketsLost),
    detail: `${formatCompletedOvers(firstInnings.completedOvers)} OVERS COMPLETED`
  };
  const secondSummary: NextMatchLiveTeamSummary = {
    teamId: secondInnings.battingTeamId,
    teamName: getTeamName(match, secondInnings.battingTeamId),
    score: secondInningsStarted
      ? formatInningsScore(secondInnings.runs, secondInnings.wicketsLost)
      : "YET TO BAT",
    detail: secondInningsStarted
      ? `${formatCompletedOvers(secondInnings.completedOvers)} OVERS COMPLETED`
      : ""
  };

  return [firstSummary, secondSummary];
}
