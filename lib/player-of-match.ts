import {
  applyMatchXPWithLevelProtection,
  calculatePlayerMatchXP,
  calculateSharedPlayerMatchXP,
  getLevelFromXP,
  type XPMatchContext
} from "./progression";
import type { CareerProgressionState } from "./career-store";
import type {
  BowlingOver,
  FinalisedPlayerMatchRecord,
  MatchRecord,
  MatchResult,
  PlayerMatchPerformance,
  PlayerMatchXPBreakdown
} from "./types/match";

export type PlayerOfMatchCandidate = {
  playerId: string;
  prePomXP: number;
  xpBreakdown: PlayerMatchXPBreakdown;
};

export type PlayerOfMatchRecommendation = {
  recommendedPlayerId: string | null;
  leaders: PlayerOfMatchCandidate[];
  isTie: boolean;
};

export function calculatePrePomPlayerMatchXP(
  performance: PlayerMatchPerformance,
  context: XPMatchContext = {}
): PlayerMatchXPBreakdown {
  return calculatePlayerMatchXP(
    {
      ...performance,
      playerOfMatch: false
    },
    context
  );
}

export function calculatePrePomSharedPlayerMatchXP(
  performances: PlayerMatchPerformance[],
  context: XPMatchContext = {}
): PlayerMatchXPBreakdown {
  return calculateSharedPlayerMatchXP(
    performances.map((performance) => ({
      ...performance,
      playerOfMatch: false
    })),
    context
  );
}

export function getPlayerOfMatchRecommendation({
  performances,
  allBowlingOvers,
  result,
  sharedPlayerId
}: {
  performances: PlayerMatchPerformance[];
  allBowlingOvers: BowlingOver[];
  result: MatchResult;
  sharedPlayerId: string | null;
}): PlayerOfMatchRecommendation {
  const groupedByPlayerId = new Map<string, PlayerMatchPerformance[]>();

  for (const performance of performances) {
    groupedByPlayerId.set(performance.playerId, [
      ...(groupedByPlayerId.get(performance.playerId) ?? []),
      performance
    ]);
  }

  const candidates = [...groupedByPlayerId.entries()]
    .map(([playerId, playerPerformances]): PlayerOfMatchCandidate | null => {
      const playedPerformances = playerPerformances.filter(
        (performance) => performance.played
      );

      if (playedPerformances.length === 0) return null;

      const playerOvers = allBowlingOvers.filter(
        (over) => over.bowlerId === playerId
      );
      const isSharedPlayer =
        sharedPlayerId === playerId && playerPerformances.length > 1;
      const xpBreakdown = isSharedPlayer
        ? calculatePrePomSharedPlayerMatchXP(playerPerformances, {
            result,
            overs: playerOvers
          })
        : calculatePrePomPlayerMatchXP(playerPerformances[0], {
            result,
            overs: playerOvers
          });

      return {
        playerId,
        prePomXP: xpBreakdown.awardedXP,
        xpBreakdown
      };
    })
    .filter((candidate): candidate is PlayerOfMatchCandidate => Boolean(candidate));

  if (candidates.length === 0) {
    return {
      recommendedPlayerId: null,
      leaders: [],
      isTie: false
    };
  }

  const highestXP = Math.max(...candidates.map((candidate) => candidate.prePomXP));
  const leaders = candidates.filter((candidate) => candidate.prePomXP === highestXP);
  const isTie = leaders.length > 1;

  return {
    recommendedPlayerId: isTie ? null : leaders[0]?.playerId ?? null,
    leaders,
    isTie
  };
}

function setPlayerOfMatchFlag<T extends PlayerMatchPerformance>(
  performance: T,
  playerOfMatchId: string | null
): T {
  return {
    ...performance,
    playerOfMatch:
      Boolean(playerOfMatchId) && performance.playerId === playerOfMatchId
  };
}

function recalculateFinalisedTeamRecords(
  records: FinalisedPlayerMatchRecord[],
  allBowlingOvers: BowlingOver[],
  result: MatchResult,
  playerOfMatchId: string | null
): FinalisedPlayerMatchRecord[] {
  return records.map((record) => {
    const nextRecord = setPlayerOfMatchFlag(record, playerOfMatchId);
    const playerOvers = allBowlingOvers.filter(
      (over) => over.bowlerId === nextRecord.playerId
    );

    return {
      ...nextRecord,
      xpBreakdown: calculatePlayerMatchXP(nextRecord, {
        result,
        overs: playerOvers
      })
    };
  });
}

function aggregateFinalisedRecordsByPlayer({
  records,
  allBowlingOvers,
  result,
  sharedPlayerId,
  playerOfMatchId
}: {
  records: FinalisedPlayerMatchRecord[];
  allBowlingOvers: BowlingOver[];
  result: MatchResult;
  sharedPlayerId: string | null;
  playerOfMatchId: string | null;
}): FinalisedPlayerMatchRecord[] {
  const groupedByPlayerId = new Map<string, FinalisedPlayerMatchRecord[]>();

  for (const record of records) {
    groupedByPlayerId.set(record.playerId, [
      ...(groupedByPlayerId.get(record.playerId) ?? []),
      record
    ]);
  }

  return [...groupedByPlayerId.entries()].map(([playerId, playerRecords]) => {
    const baseRecord = setPlayerOfMatchFlag(playerRecords[0], playerOfMatchId);
    const aggregateRecord: FinalisedPlayerMatchRecord = {
      ...baseRecord,
      played: playerRecords.some((record) => record.played),
      playerOfMatch: Boolean(playerOfMatchId) && playerId === playerOfMatchId,
      didBat: playerRecords.some((record) => record.didBat),
      runs: playerRecords.reduce(
        (sum, record) => sum + (record.didBat ? Number(record.runs) || 0 : 0),
        0
      ),
      wasOut: playerRecords.some((record) => record.wasOut),
      wickets: playerRecords.reduce((sum, record) => sum + record.wickets, 0),
      hatTricks: playerRecords.reduce((sum, record) => sum + record.hatTricks, 0),
      catches: playerRecords.reduce((sum, record) => sum + record.catches, 0),
      runOuts: playerRecords.reduce((sum, record) => sum + record.runOuts, 0),
      stumpings: playerRecords.reduce(
        (sum, record) => sum + (record.stumpings ?? 0),
        0
      ),
      xpBreakdown: baseRecord.xpBreakdown
    };
    const playerOvers = allBowlingOvers.filter((over) => over.bowlerId === playerId);
    const isSharedPlayer =
      sharedPlayerId === playerId && playerRecords.length > 1;

    return {
      ...aggregateRecord,
      xpBreakdown: isSharedPlayer
        ? calculateSharedPlayerMatchXP(playerRecords, {
            result,
            overs: playerOvers
          })
        : calculatePlayerMatchXP(aggregateRecord, {
            result,
            overs: playerOvers
          })
    };
  });
}

export function applyPlayerOfMatchCorrectionToFinalisedMatch({
  match,
  currentState,
  nextPlayerOfMatchId,
  correctedAt = new Date().toISOString()
}: {
  match: MatchRecord;
  currentState: CareerProgressionState;
  nextPlayerOfMatchId: string | null;
  correctedAt?: string;
}): {
  match: MatchRecord;
  state: CareerProgressionState;
  affectedPlayerIds: string[];
} {
  if (match.status !== "finalised" || match.result.type === "no_result") {
    return {
      match,
      state: currentState,
      affectedPlayerIds: []
    };
  }

  const allBowlingOvers = [
    ...match.teams.teamA.bowlingOvers,
    ...match.teams.teamB.bowlingOvers
  ];
  const previousPlayerOfMatchId =
    (match.finalisedPlayerRecords ?? [])
      .find((record) => record.playerOfMatch)
      ?.playerId ??
    [
      ...match.teams.teamA.playerPerformances,
      ...match.teams.teamB.playerPerformances
    ].find((record) => record.playerOfMatch)?.playerId ??
    null;

  if (previousPlayerOfMatchId === nextPlayerOfMatchId) {
    return {
      match,
      state: currentState,
      affectedPlayerIds: []
    };
  }

  const nextTeamARecords = recalculateFinalisedTeamRecords(
    match.teams.teamA.playerPerformances as FinalisedPlayerMatchRecord[],
    allBowlingOvers,
    match.result,
    nextPlayerOfMatchId
  );
  const nextTeamBRecords = recalculateFinalisedTeamRecords(
    match.teams.teamB.playerPerformances as FinalisedPlayerMatchRecord[],
    allBowlingOvers,
    match.result,
    nextPlayerOfMatchId
  );
  const nextFinalisedPlayerRecords = aggregateFinalisedRecordsByPlayer({
    records: [...nextTeamARecords, ...nextTeamBRecords],
    allBowlingOvers,
    result: match.result,
    sharedPlayerId: match.sharedPlayerId ?? null,
    playerOfMatchId: nextPlayerOfMatchId
  });
  const nextApplications = { ...currentState.appliedProgressions };
  const nextCareers = { ...currentState.playerCareers };
  const affectedPlayerIds = Array.from(
    new Set(
      [previousPlayerOfMatchId, nextPlayerOfMatchId].filter(
        (playerId): playerId is string => Boolean(playerId)
      )
    )
  );

  for (const playerId of affectedPlayerIds) {
    const key = `${match.id}:${playerId}`;
    const previousApplication = nextApplications[key];
    const nextRecord = nextFinalisedPlayerRecords.find(
      (record) => record.playerId === playerId
    );

    if (!previousApplication || !nextRecord) continue;

    const xpDelta =
      nextRecord.xpBreakdown.awardedXP - previousApplication.xpBreakdown.awardedXP;
    const currentCareer = nextCareers[playerId];

    if (currentCareer) {
      const totalXP = applyMatchXPWithLevelProtection({
        currentTotalXP: currentCareer.totalXP,
        currentLevel: currentCareer.level,
        awardedMatchXP: xpDelta
      });

      nextCareers[playerId] = {
        ...currentCareer,
        totalXP,
        level: Math.max(currentCareer.level, getLevelFromXP(totalXP))
      };
    }

    nextApplications[key] = {
      ...previousApplication,
      xpBreakdown: nextRecord.xpBreakdown,
      progressionAppliedAt: correctedAt
    };
  }

  return {
    match: {
      ...match,
      teams: {
        teamA: {
          ...match.teams.teamA,
          playerPerformances: nextTeamARecords
        },
        teamB: {
          ...match.teams.teamB,
          playerPerformances: nextTeamBRecords
        }
      },
      finalisedPlayerRecords: nextFinalisedPlayerRecords
    },
    state: {
      playerCareers: nextCareers,
      appliedProgressions: nextApplications
    },
    affectedPlayerIds
  };
}
