import {
  buildTeamInnings,
  buildTeamMatchData,
  calculateBowlerWickets,
  calculatePlayerCatches,
  calculatePlayerHatTricks,
  calculatePlayerRunOuts,
  calculatePlayerStumpings,
  getChasingTeamId,
  getDismissedBatterIds,
  getEligibleFieldingPlayerIds,
  getPerformanceKey,
  normalizeStoredRuns,
  sanitizeRuns,
  type MatchValidationInput
} from "@/lib/match-records";
import { getPlayerOfMatchRecommendation } from "@/lib/player-of-match";
import {
  calculatePlayerMatchXP,
  calculateSharedPlayerMatchXP
} from "@/lib/progression";
import { deriveQuickScoringInnings } from "@/lib/quick-scoring";
import { validateMatchInput } from "@/lib/match-validation-core";
import { activePlayers } from "@/lib/data/players";
import {
  getPragueMatchDateFromTimestamp,
  isValidIsoCalendarDate
} from "@/lib/app-sync/prague-date";
import type {
  AppSyncMatchPayload
} from "@/lib/app-sync/types";
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
} from "@/lib/types/match";

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
  sharedPlayerId,
  appliedAt,
  finalStatus,
  playerOfMatchId,
  matchDate
}: {
  performances: PlayerMatchPerformance[];
  allBowlingOvers: BowlingOver[];
  result: MatchResult;
  sharedPlayerId: string | null;
  appliedAt: string;
  finalStatus: MatchStatus;
  playerOfMatchId: string | null;
  matchDate: string;
}): FinalisedPlayerMatchRecord[] {
  const groupedByPlayerId = new Map<string, PlayerMatchPerformance[]>();

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
    const isSharedPlayerRecord =
      sharedPlayerId === playerId && playerPerformances.length > 1;
    const basePerformance = playerPerformances[0];
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
  const derivedA = deriveQuickScoringInnings({
    battingTeamId: "teamA",
    bowlingTeamId: "teamB",
    battingPlayerIds: teamAPlayerIds,
    bowlingPlayerIds: teamBPlayerIds,
    fieldingPlayerIds: getEligibleFieldingPlayerIds({
      bowlingPlayerIds: teamBPlayerIds,
      fieldingHelperIds
    }),
    events: payload.inningsAEvents,
    battingMode
  });
  const derivedB = deriveQuickScoringInnings({
    battingTeamId: "teamB",
    bowlingTeamId: "teamA",
    battingPlayerIds: teamBPlayerIds,
    bowlingPlayerIds: teamAPlayerIds,
    fieldingPlayerIds: getEligibleFieldingPlayerIds({
      bowlingPlayerIds: teamAPlayerIds,
      fieldingHelperIds
    }),
    events: payload.inningsBEvents,
    battingMode
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
    teamPlayerIds: teamAPlayerIds,
    teamId: "teamA",
    performances: performanceMap,
    ownBowlingOvers: teamABowlingOvers,
    opposingBowlingOvers: teamBBowlingOvers,
    fieldingHelperIds
  });
  const teamBPerformances = buildPerformanceList({
    teamPlayerIds: teamBPlayerIds,
    teamId: "teamB",
    performances: performanceMap,
    ownBowlingOvers: teamBBowlingOvers,
    opposingBowlingOvers: teamABowlingOvers,
    fieldingHelperIds
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

  const availablePlayerIds = Array.from(
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
  const validation = validateMatchInput(validationInput);

  if (!validation.ok) {
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
  const finalisedPlayerRecords = aggregateFinalisedPlayerRecords({
    performances,
    allBowlingOvers: [...teamABowlingOvers, ...teamBBowlingOvers],
    result: validation.result,
    sharedPlayerId,
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
    fieldingHelperIds,
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
