import {
  buildTeamInnings,
  buildTeamMatchData,
  calculateMatchResult,
  calculateBowlerWickets,
  calculatePlayerCatches,
  calculatePlayerHatTricks,
  calculatePlayerRunOuts,
  calculatePlayerStumpings,
  getChasingTeamId,
  getDismissedBatterIds,
  getEligibleFieldingPlayerIds,
  getInningsState,
  getPerformanceKey,
  normalizeStoredRuns,
  sanitizeRuns,
  type MatchValidationInput
} from "../match-records";
import { getPlayerOfMatchRecommendation } from "../player-of-match";
import {
  calculatePlayerMatchXP,
  calculateSharedPlayerMatchXP
} from "../progression";
import { deriveQuickScoringInnings } from "../quick-scoring";
import {
  inningsIndexForTeam,
  isRosterTransitionShape,
  resolveRosterTransitions
} from "./roster-transitions";
import { validateMatchInput } from "../match-validation-core";
import { activePlayers } from "../data/players";
import {
  getPragueMatchDateFromTimestamp,
  isValidIsoCalendarDate
} from "./prague-date";
import type {
  AppSyncMatchPayload
} from "./types";
import type {
  BowlingOver,
  FinalisedPlayerMatchRecord,
  MatchRecord,
  MatchResult,
  MatchStatus,
  PlayerMatchPerformance,
  QuickScoringEvent,
  QuickScoringDismissalType,
  QuickScoringExtraType,
  TeamId
} from "../types/match";

export type AssembledPendingImport = {
  ok: true;
  matchDate: string;
  derivedMatch: MatchRecord;
  validationResult: Record<string, unknown>;
  pomRecommendation: ReturnType<typeof getPlayerOfMatchRecommendation>;
};

export type AppSyncAssemblyResult =
  | AssembledPendingImport
  | {
      ok: false;
      errors: string[];
      matchDate: string | null;
      derivedMatch: MatchRecord | null;
      validationResult: Record<string, unknown>;
    };

const QUICK_DISMISSAL_TYPES = new Set<QuickScoringDismissalType>([
  "bowled",
  "caught",
  "stumped",
  "run_out",
  "other_bowler_wicket"
]);

const QUICK_EXTRA_TYPES = new Set<QuickScoringExtraType>([
  "wide",
  "no_ball",
  null
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isTeamId(value: unknown): value is TeamId {
  return value === "teamA" || value === "teamB";
}

function isBattingMode(value: unknown): value is AppSyncMatchPayload["battingMode"] {
  return value === "two_batter" || value === "single_batter";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isQuickScoringEvent(value: unknown): value is QuickScoringEvent {
  if (!isRecord(value)) return false;

  const wicket = value.wicket;
  const wicketIsValid =
    wicket === null ||
    (isRecord(wicket) &&
      QUICK_DISMISSAL_TYPES.has(wicket.type as QuickScoringDismissalType) &&
      typeof wicket.dismissedPlayerId === "string" &&
      (typeof wicket.fielderId === "string" || wicket.fielderId === null) &&
      (typeof wicket.newBatterId === "string" || wicket.newBatterId === null) &&
      typeof wicket.completedRuns === "number");

  return (
    typeof value.id === "string" &&
    typeof value.sequence === "number" &&
    isTeamId(value.battingTeamId) &&
    isTeamId(value.bowlingTeamId) &&
    typeof value.strikerId === "string" &&
    typeof value.nonStrikerId === "string" &&
    typeof value.bowlerId === "string" &&
    typeof value.batterRuns === "number" &&
    QUICK_EXTRA_TYPES.has(value.extraType as QuickScoringExtraType) &&
    typeof value.extras === "number" &&
    typeof value.legalDelivery === "boolean" &&
    typeof value.timestamp === "string" &&
    wicketIsValid
  );
}

export function isAppSyncMatchPayload(value: unknown): value is AppSyncMatchPayload {
  return (
    isRecord(value) &&
    typeof value.offlineMatchId === "string" &&
    value.offlineMatchId.trim().length > 0 &&
    typeof value.syncVersion === "number" &&
    Number.isInteger(value.syncVersion) &&
    value.syncVersion > 0 &&
    typeof value.isDemo === "boolean" &&
    (value.matchDate === undefined || typeof value.matchDate === "string") &&
    (value.pomRecommendationPlayerId === undefined ||
      value.pomRecommendationPlayerId === null ||
      typeof value.pomRecommendationPlayerId === "string") &&
    typeof value.startedAt === "string" &&
    (value.completedAt === undefined ||
      value.completedAt === null ||
      typeof value.completedAt === "string") &&
    typeof value.matchName === "string" &&
    typeof value.scheduledOversPerInnings === "number" &&
    isBattingMode(value.battingMode) &&
    isTeamId(value.battingFirstTeamId) &&
    isStringArray(value.teamAPlayerIds) &&
    isStringArray(value.teamBPlayerIds) &&
    (value.sharedPlayerId === undefined ||
      value.sharedPlayerId === null ||
      typeof value.sharedPlayerId === "string") &&
    (value.fieldingHelperIds === undefined ||
      isStringArray(value.fieldingHelperIds)) &&
    (value.rosterTransitions === undefined ||
      (Array.isArray(value.rosterTransitions) &&
        value.rosterTransitions.every(isRosterTransitionShape))) &&
    Array.isArray(value.inningsAEvents) &&
    value.inningsAEvents.every(isQuickScoringEvent) &&
    Array.isArray(value.inningsBEvents) &&
    value.inningsBEvents.every(isQuickScoringEvent)
  );
}

function formatPragueStartTime(startedAt: string): string | undefined {
  const date = new Date(startedAt);

  if (!Number.isFinite(date.getTime())) return undefined;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Prague",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;

  return hour && minute ? `${hour}:${minute}` : undefined;
}

function createEmptyPerformance(
  playerId: string,
  teamId: TeamId
): PlayerMatchPerformance {
  return {
    playerId,
    teamId,
    representingTeamId: teamId,
    played: true,
    playerOfMatch: false,
    didBat: false,
    battingPosition: null,
    runs: "",
    wasOut: false,
    wickets: 0,
    hatTricks: 0,
    catches: 0,
    runOuts: 0,
    stumpings: 0
  };
}

function buildPerformanceList({
  teamPlayerIds,
  teamId,
  performances,
  ownBowlingOvers,
  opposingBowlingOvers,
  fieldingHelperIds
}: {
  teamPlayerIds: string[];
  teamId: TeamId;
  performances: Record<string, PlayerMatchPerformance>;
  ownBowlingOvers: BowlingOver[];
  opposingBowlingOvers: BowlingOver[];
  fieldingHelperIds: string[];
}): PlayerMatchPerformance[] {
  const dismissedBatterIds = new Set(getDismissedBatterIds(opposingBowlingOvers));
  const helperIdSet = new Set(fieldingHelperIds);

  return teamPlayerIds.map((playerId) => {
    const key = getPerformanceKey(playerId, teamId);
    const base =
      performances[key] ??
      performances[playerId] ??
      createEmptyPerformance(playerId, teamId);
    const wasDismissed = dismissedBatterIds.has(playerId);

    return {
      ...base,
      teamId,
      representingTeamId: teamId,
      played: true,
      didBat: base.didBat || wasDismissed,
      runs: normalizeStoredRuns(base.runs),
      wasOut: wasDismissed,
      wickets: calculateBowlerWickets(playerId, ownBowlingOvers),
      hatTricks: calculatePlayerHatTricks(playerId, ownBowlingOvers),
      catches:
        calculatePlayerCatches(playerId, ownBowlingOvers) +
        (helperIdSet.has(playerId)
          ? calculatePlayerCatches(playerId, opposingBowlingOvers)
          : 0),
      runOuts:
        calculatePlayerRunOuts(playerId, ownBowlingOvers) +
        (helperIdSet.has(playerId)
          ? calculatePlayerRunOuts(playerId, opposingBowlingOvers)
          : 0),
      stumpings:
        calculatePlayerStumpings(playerId, ownBowlingOvers) +
        (helperIdSet.has(playerId)
          ? calculatePlayerStumpings(playerId, opposingBowlingOvers)
          : 0)
    };
  });
}

function aggregateFinalisedPlayerRecords({
  performances,
  allBowlingOvers,
  result,
  everSharedPlayerIds,
  finalTeamByPlayerId,
  appliedAt,
  finalStatus,
  playerOfMatchId,
  matchDate
}: {
  performances: PlayerMatchPerformance[];
  allBowlingOvers: BowlingOver[];
  result: MatchResult;
  everSharedPlayerIds: string[];
  finalTeamByPlayerId: Map<string, TeamId>;
  appliedAt: string;
  finalStatus: MatchStatus;
  playerOfMatchId: string | null;
  matchDate: string;
}): FinalisedPlayerMatchRecord[] {
  const groupedByPlayerId = new Map<string, PlayerMatchPerformance[]>();
  const everShared = new Set(everSharedPlayerIds);

  for (const performance of performances) {
    groupedByPlayerId.set(performance.playerId, [
      ...(groupedByPlayerId.get(performance.playerId) ?? []),
      {
        ...performance,
        playerOfMatch: Boolean(playerOfMatchId) && performance.playerId === playerOfMatchId
      }
    ]);
  }

  return [...groupedByPlayerId.entries()].map(([playerId, playerPerformances]) => {
    const playerOvers = allBowlingOvers.filter((over) => over.bowlerId === playerId);
    const isSharedPlayerRecord = everShared.has(playerId);
    const finalTeamId = finalTeamByPlayerId.get(playerId);
    const basePerformance =
      playerPerformances.find((performance) => performance.teamId === finalTeamId) ??
      playerPerformances[0];
    const aggregatePerformance: PlayerMatchPerformance = {
      ...basePerformance,
      teamId: basePerformance.teamId,
      representingTeamId: basePerformance.teamId,
      played: playerPerformances.some((performance) => performance.played),
      playerOfMatch: Boolean(playerOfMatchId) && playerId === playerOfMatchId,
      didBat: playerPerformances.some((performance) => performance.didBat),
      runs: playerPerformances.reduce(
        (sum, performance) =>
          sum + (performance.didBat ? sanitizeRuns(performance.runs) : 0),
        0
      ),
      wasOut: playerPerformances.some((performance) => performance.wasOut),
      wickets: playerPerformances.reduce(
        (sum, performance) => sum + sanitizeRuns(performance.wickets),
        0
      ),
      hatTricks: playerPerformances.reduce(
        (sum, performance) => sum + sanitizeRuns(performance.hatTricks),
        0
      ),
      catches: playerPerformances.reduce(
        (sum, performance) => sum + sanitizeRuns(performance.catches),
        0
      ),
      runOuts: playerPerformances.reduce(
        (sum, performance) => sum + sanitizeRuns(performance.runOuts),
        0
      ),
      stumpings: playerPerformances.reduce(
        (sum, performance) => sum + sanitizeRuns(performance.stumpings ?? 0),
        0
      )
    };

    return {
      ...aggregatePerformance,
      xpBreakdown: isSharedPlayerRecord
        ? calculateSharedPlayerMatchXP(playerPerformances, {
            result,
            overs: playerOvers,
            matchDate
          })
        : calculatePlayerMatchXP(aggregatePerformance, {
            result,
            overs: playerOvers,
            matchDate
          }),
      progressionAppliedAt:
        finalStatus === "finalised" && result.type !== "no_result"
          ? appliedAt
          : undefined
    };
  });
}

export function buildApkOfficialMatchId(importId: string): string {
  return `apk-match-${importId}`;
}

export function assemblePendingImportMatch({
  payload,
  matchId,
  matchDate,
  matchNumber = null,
  playerOfMatchId = null,
  appliedAt = new Date().toISOString()
}: {
  payload: AppSyncMatchPayload;
  matchId?: string;
  matchDate?: string;
  matchNumber?: number | null;
  playerOfMatchId?: string | null;
  appliedAt?: string;
}): AppSyncAssemblyResult {
  const errors: string[] = [];
  let derivedMatchDate: string | null =
    matchDate ?? payload.matchDate ?? null;

  if (derivedMatchDate) {
    if (!isValidIsoCalendarDate(derivedMatchDate)) {
      errors.push("Invalid matchDate. Use YYYY-MM-DD.");
      derivedMatchDate = null;
    }
  } else {
    derivedMatchDate = getPragueMatchDateFromTimestamp(payload.startedAt);
  }

  if (!derivedMatchDate && !payload.matchDate && !matchDate) {
    errors.push("Invalid startedAt timestamp.");
  }

  if (
    payload.completedAt &&
    Date.parse(payload.completedAt) < Date.parse(payload.startedAt)
  ) {
    errors.push("completedAt must be after startedAt.");
  }

  for (const event of [...payload.inningsAEvents, ...payload.inningsBEvents]) {
    if (event.wicket && !QUICK_DISMISSAL_TYPES.has(event.wicket.type)) {
      errors.push("Unsupported wicket type in APK payload.");
      break;
    }
  }

  const knownPlayerIds = new Set(activePlayers.map((player) => player.id));
  const suppliedPlayerIds = [
    ...payload.teamAPlayerIds,
    ...payload.teamBPlayerIds,
    payload.sharedPlayerId ?? "",
    ...(payload.fieldingHelperIds ?? [])
  ].filter(Boolean);

  for (const playerId of suppliedPlayerIds) {
    if (!knownPlayerIds.has(playerId)) {
      errors.push(`Unknown player id: ${playerId}.`);
      break;
    }
  }

  const rosterResolution = resolveRosterTransitions(payload, knownPlayerIds);
  errors.push(...rosterResolution.errors);

  const sharedPlayerId = payload.sharedPlayerId ?? null;
  const teamAPlayerIds = Array.from(
    new Set(
      sharedPlayerId
        ? [...payload.teamAPlayerIds, sharedPlayerId]
        : payload.teamAPlayerIds
    )
  );
  const teamBPlayerIds = Array.from(
    new Set(
      sharedPlayerId
        ? [...payload.teamBPlayerIds, sharedPlayerId]
        : payload.teamBPlayerIds
    )
  );
  const fieldingHelperIds = Array.from(
    new Set(
      (payload.fieldingHelperIds ?? []).filter(
        (playerId) => playerId && playerId !== sharedPlayerId
      )
    )
  );
  const battingMode = payload.battingMode;
  const derivationTeamAPlayerIds = rosterResolution.hasTransitions
    ? rosterResolution.teamAPlayerIds
    : teamAPlayerIds;
  const derivationTeamBPlayerIds = rosterResolution.hasTransitions
    ? rosterResolution.teamBPlayerIds
    : teamBPlayerIds;
  const derivationHelperIds = rosterResolution.hasTransitions
    ? rosterResolution.fieldingHelperIds
    : fieldingHelperIds;
  const eventEligibility = (battingTeamId: TeamId) => {
    const inningsIndex = inningsIndexForTeam(payload, battingTeamId);
    const bowlingTeamId = getChasingTeamId(battingTeamId);

    return (_event: QuickScoringEvent, eventIndex: number) => {
      const snapshot = rosterResolution.getSnapshot(inningsIndex, eventIndex);
      const battingPlayerIds = rosterResolution.getTeamPlayerIds(
        snapshot,
        battingTeamId
      );
      const bowlingPlayerIds = rosterResolution.getTeamPlayerIds(
        snapshot,
        bowlingTeamId
      );

      return {
        battingPlayerIds,
        bowlingPlayerIds,
        fieldingPlayerIds: getEligibleFieldingPlayerIds({
          bowlingPlayerIds,
          fieldingHelperIds: snapshot.fieldingHelperIds
        })
      };
    };
  };
  const derivedA = deriveQuickScoringInnings({
    battingTeamId: "teamA",
    bowlingTeamId: "teamB",
    battingPlayerIds: derivationTeamAPlayerIds,
    bowlingPlayerIds: derivationTeamBPlayerIds,
    fieldingPlayerIds: getEligibleFieldingPlayerIds({
      bowlingPlayerIds: derivationTeamBPlayerIds,
      fieldingHelperIds: derivationHelperIds
    }),
    events: payload.inningsAEvents,
    battingMode,
    eventEligibility: rosterResolution.hasTransitions
      ? eventEligibility("teamA")
      : undefined
  });
  const derivedB = deriveQuickScoringInnings({
    battingTeamId: "teamB",
    bowlingTeamId: "teamA",
    battingPlayerIds: derivationTeamBPlayerIds,
    bowlingPlayerIds: derivationTeamAPlayerIds,
    fieldingPlayerIds: getEligibleFieldingPlayerIds({
      bowlingPlayerIds: derivationTeamAPlayerIds,
      fieldingHelperIds: derivationHelperIds
    }),
    events: payload.inningsBEvents,
    battingMode,
    eventEligibility: rosterResolution.hasTransitions
      ? eventEligibility("teamB")
      : undefined
  });

  errors.push(...derivedA.missingInformation, ...derivedB.missingInformation);

  const performanceMap: Record<string, PlayerMatchPerformance> = {};

  for (const performance of [
    ...derivedA.battingPerformances,
    ...derivedB.battingPerformances
  ]) {
    performanceMap[getPerformanceKey(performance.playerId, performance.teamId)] =
      performance;
  }

  const teamABowlingOvers = derivedB.bowlingOvers;
  const teamBBowlingOvers = derivedA.bowlingOvers;
  const teamAPerformances = buildPerformanceList({
    teamPlayerIds: derivationTeamAPlayerIds,
    teamId: "teamA",
    performances: performanceMap,
    ownBowlingOvers: teamABowlingOvers,
    opposingBowlingOvers: teamBBowlingOvers,
    fieldingHelperIds: derivationHelperIds
  });
  const teamBPerformances = buildPerformanceList({
    teamPlayerIds: derivationTeamBPlayerIds,
    teamId: "teamB",
    performances: performanceMap,
    ownBowlingOvers: teamBBowlingOvers,
    opposingBowlingOvers: teamABowlingOvers,
    fieldingHelperIds: derivationHelperIds
  });
  const performances = [...teamAPerformances, ...teamBPerformances];

  if (
    playerOfMatchId &&
    !performances.some(
      (performance) => performance.played && performance.playerId === playerOfMatchId
    )
  ) {
    errors.push("Player of the Match must be a match participant.");
  }
  const suppliedPomRecommendationId =
    payload.pomRecommendationPlayerId?.trim() || null;
  const apkPomRecommendation = suppliedPomRecommendationId
    ? activePlayers.some((player) => player.id === suppliedPomRecommendationId)
      ? performances.some(
          (performance) =>
            performance.played && performance.playerId === suppliedPomRecommendationId
        )
        ? {
            status: "valid" as const,
            suppliedPlayerId: suppliedPomRecommendationId,
            playerId: suppliedPomRecommendationId,
            message: null
          }
        : {
            status: "ignored" as const,
            suppliedPlayerId: suppliedPomRecommendationId,
            playerId: null,
            message: "APK POM recommendation ignored: player did not participate."
          }
      : {
          status: "ignored" as const,
          suppliedPlayerId: suppliedPomRecommendationId,
          playerId: null,
          message: "APK POM recommendation ignored: unknown player."
        }
    : {
        status: "none" as const,
        suppliedPlayerId: null,
        playerId: null,
        message: null
      };

  const availablePlayerIds = rosterResolution.hasTransitions
    ? rosterResolution.participantIds
    : Array.from(
        new Set([...teamAPlayerIds, ...teamBPlayerIds, ...fieldingHelperIds])
      );
  const validationInput: MatchValidationInput = {
    matchDate: derivedMatchDate ?? "",
    matchNumber,
    startTime: formatPragueStartTime(payload.startedAt),
    matchName: payload.matchName,
    teamAName: payload.teamAName ?? "Team A",
    teamBName: payload.teamBName ?? "Team B",
    status: "finalised",
    stage: "finalise",
    scheduledOversPerInnings: payload.scheduledOversPerInnings,
    battingMode,
    battingFirstTeamId: payload.battingFirstTeamId,
    inningsExtras: {
      teamA: derivedA.extras,
      teamB: derivedB.extras
    },
    availablePlayerIds,
    teamAPlayerIds,
    teamBPlayerIds,
    sharedPlayerId,
    fieldingHelperIds,
    performances,
    bowlingOvers: {
      teamA: teamABowlingOvers,
      teamB: teamBBowlingOvers
    }
  };
  let validation = validateMatchInput(validationInput);

  if (rosterResolution.hasTransitions) {
    const transitionTeams = {
      teamA: buildTeamMatchData({
        teamId: "teamA",
        teamName: payload.teamAName ?? "Team A",
        playerIds: derivationTeamAPlayerIds,
        performances,
        bowlingOvers: teamABowlingOvers
      }),
      teamB: buildTeamMatchData({
        teamId: "teamB",
        teamName: payload.teamBName ?? "Team B",
        playerIds: derivationTeamBPlayerIds,
        performances,
        bowlingOvers: teamBBowlingOvers
      })
    };
    const transitionInnings = (teamId: TeamId) => {
      const derived = teamId === "teamA" ? derivedA : derivedB;
      const inningsIndex = inningsIndexForTeam(payload, teamId);
      const eventCount =
        teamId === "teamA"
          ? payload.inningsAEvents.length
          : payload.inningsBEvents.length;
      const endSnapshot = rosterResolution.getSnapshot(inningsIndex, eventCount);
      const battingPlayerCount = rosterResolution.getTeamPlayerIds(
        endSnapshot,
        teamId
      ).length;

      return {
        battingTeamId: teamId,
        bowlingTeamId: getChasingTeamId(teamId),
        runs: derived.runs,
        wicketsLost: derived.wicketsLost,
        extras: derived.extras,
        playerCount: battingPlayerCount,
        completedOvers: derived.completedOvers,
        battingPerformances: derived.battingPerformances,
        bowlingOvers: teamId === "teamA" ? teamBBowlingOvers : teamABowlingOvers
      };
    };
    const firstInnings = transitionInnings(payload.battingFirstTeamId);
    const chasingTeamId = getChasingTeamId(payload.battingFirstTeamId);
    const secondInnings = transitionInnings(chasingTeamId);
    const firstState = getInningsState({
      battingTeamId: firstInnings.battingTeamId,
      bowlingTeamId: firstInnings.bowlingTeamId,
      battingPlayerCount: firstInnings.playerCount,
      bowlingOvers: firstInnings.bowlingOvers,
      scheduledOvers: payload.scheduledOversPerInnings,
      runs: firstInnings.runs
    });
    const secondState = getInningsState({
      battingTeamId: secondInnings.battingTeamId,
      bowlingTeamId: secondInnings.bowlingTeamId,
      battingPlayerCount: secondInnings.playerCount,
      bowlingOvers: secondInnings.bowlingOvers,
      scheduledOvers: payload.scheduledOversPerInnings,
      runs: secondInnings.runs,
      target: firstInnings.runs + 1
    });

    if (!Number.isInteger(payload.scheduledOversPerInnings) || payload.scheduledOversPerInnings <= 0) {
      errors.push("Scheduled overs per innings must be a positive integer.");
    }
    if (derivedA.legalBalls > payload.scheduledOversPerInnings * 6) {
      errors.push("Team A innings contains play beyond the scheduled overs.");
    }
    if (derivedB.legalBalls > payload.scheduledOversPerInnings * 6) {
      errors.push("Team B innings contains play beyond the scheduled overs.");
    }
    if (!firstState.isComplete) errors.push("The first innings is not complete.");
    if (!secondState.isComplete) errors.push("The second innings is not complete.");

    validation = {
      ok: errors.length === 0,
      errors: [],
      totals: {
        teamATotal: derivedA.runs,
        teamBTotal: derivedB.runs
      },
      completedOvers: {
        teamA: transitionTeams.teamA.completedBowlingOvers,
        teamB: transitionTeams.teamB.completedBowlingOvers
      },
      result: calculateMatchResult(
        "finalised",
        payload.battingFirstTeamId,
        firstInnings,
        secondInnings
      ),
      teams: transitionTeams,
      scheduledOversPerInnings: payload.scheduledOversPerInnings,
      battingFirstTeamId: payload.battingFirstTeamId,
      chasingTeamId,
      innings: {
        first: firstInnings,
        second: secondInnings
      }
    };
  } else if (!validation.ok) {
    errors.push(...validation.errors);
  }

  const quickScoring = {
    version: 2 as const,
    setupLocked: true,
    battingMode,
    inningsPhase: "second_innings" as const,
    inningsAEvents: payload.inningsAEvents,
    inningsBEvents: payload.inningsBEvents
  };
  const teams = validation.teams ?? {
    teamA: buildTeamMatchData({
      teamId: "teamA",
      teamName: payload.teamAName ?? "Team A",
      playerIds: teamAPlayerIds,
      performances,
      bowlingOvers: teamABowlingOvers
    }),
    teamB: buildTeamMatchData({
      teamId: "teamB",
      teamName: payload.teamBName ?? "Team B",
      playerIds: teamBPlayerIds,
      performances,
      bowlingOvers: teamBBowlingOvers
    })
  };
  const firstInnings =
    validation.innings?.first ??
    buildTeamInnings({
      battingTeamId: payload.battingFirstTeamId,
      battingPlayerIds:
        payload.battingFirstTeamId === "teamA" ? teamAPlayerIds : teamBPlayerIds,
      performances,
      bowlingOvers:
        payload.battingFirstTeamId === "teamA"
          ? teamBBowlingOvers
          : teamABowlingOvers,
      extras:
        payload.battingFirstTeamId === "teamA" ? derivedA.extras : derivedB.extras
    });
  const chasingTeamId = getChasingTeamId(payload.battingFirstTeamId);
  const secondInnings =
    validation.innings?.second ??
    buildTeamInnings({
      battingTeamId: chasingTeamId,
      battingPlayerIds: chasingTeamId === "teamA" ? teamAPlayerIds : teamBPlayerIds,
      performances,
      bowlingOvers:
        chasingTeamId === "teamA" ? teamBBowlingOvers : teamABowlingOvers,
      extras: chasingTeamId === "teamA" ? derivedA.extras : derivedB.extras
    });
  const finalTeamByPlayerId = new Map<string, TeamId>();

  for (const playerId of rosterResolution.participantIds) {
    if (payload.teamAPlayerIds.includes(playerId)) {
      finalTeamByPlayerId.set(playerId, "teamA");
      continue;
    }
    if (payload.teamBPlayerIds.includes(playerId)) {
      finalTeamByPlayerId.set(playerId, "teamB");
      continue;
    }

    const latestExclusiveSnapshot = [...rosterResolution.snapshots]
      .reverse()
      .find(
        (snapshot) =>
          snapshot.teamAPlayerIds.includes(playerId) ||
          snapshot.teamBPlayerIds.includes(playerId)
      );
    const firstPerformance = performances.find(
      (performance) => performance.playerId === playerId
    );

    finalTeamByPlayerId.set(
      playerId,
      latestExclusiveSnapshot?.teamAPlayerIds.includes(playerId)
        ? "teamA"
        : latestExclusiveSnapshot?.teamBPlayerIds.includes(playerId)
          ? "teamB"
          : firstPerformance?.teamId ?? "teamA"
    );
  }
  const finalisedPlayerRecords = aggregateFinalisedPlayerRecords({
    performances,
    allBowlingOvers: [...teamABowlingOvers, ...teamBBowlingOvers],
    result: validation.result,
    everSharedPlayerIds: rosterResolution.everSharedPlayerIds,
    finalTeamByPlayerId,
    appliedAt,
    finalStatus: "finalised",
    playerOfMatchId,
    matchDate: derivedMatchDate ?? ""
  });
  const derivedMatch: MatchRecord = {
    id: matchId ?? `apk-pending-${payload.offlineMatchId}`,
    isDemo: payload.isDemo,
    isDemoTestMatch: payload.isDemo,
    matchDate: derivedMatchDate ?? "",
    matchNumber,
    startTime: formatPragueStartTime(payload.startedAt),
    matchName: payload.matchName,
    venue: payload.venue || "CZU Gully Arena",
    status: "finalised",
    scheduledOversPerInnings: payload.scheduledOversPerInnings,
    battingMode,
    battingFirstTeamId: payload.battingFirstTeamId,
    chasingTeamId,
    sharedPlayerId,
    everSharedPlayerIds: rosterResolution.everSharedPlayerIds,
    fieldingHelperIds,
    rosterTransitions: payload.rosterTransitions,
    teams,
    innings: {
      first: firstInnings,
      second: secondInnings
    },
    result: validation.result,
    finalisedPlayerRecords,
    quickScoring,
    progressionAppliedAt: validation.result.type !== "no_result" ? appliedAt : undefined,
    appliedFinalisationVersion: validation.result.type !== "no_result" ? 1 : undefined
  };
  const pomRecommendation = getPlayerOfMatchRecommendation({
    performances,
    allBowlingOvers: [...teamABowlingOvers, ...teamBBowlingOvers],
    result: validation.result,
    sharedPlayerId,
    everSharedPlayerIds: rosterResolution.everSharedPlayerIds,
    matchDate: derivedMatchDate ?? ""
  });
  const validationResult = {
    ok: errors.length === 0,
    errors,
    result: validation.result,
    pomRecommendation,
    apkPomRecommendation
  };

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
      matchDate: derivedMatchDate,
      derivedMatch,
      validationResult
    };
  }

  return {
    ok: true,
    matchDate: derivedMatch.matchDate,
    derivedMatch,
    validationResult,
    pomRecommendation
  };
}
