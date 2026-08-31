import {
  applyMatchXPWithLevelProtection,
  calculatePlayerMatchXP,
  calculatePlayerRatingSnapshots,
  getLevelFromXP,
  type PlayerProgressionTotals
} from "./progression";
import type {
  FinalisedPlayerMatchRecord,
  MatchRecord,
  PlayerMatchPerformance
} from "./types/match";
import type { Player } from "./types/player";

export const CAREER_PROGRESS_STORAGE_KEY = "gully-legends-prague-career-v1";
export const CAREER_PROGRESS_UPDATED_EVENT = "gully-legends-career-progress-updated";
export const FINALISATION_VERSION = 1;

export type PlayerCareerStats = {
  playerId: string;
  matches: number;
  inningsBatted: number;
  runs: number;
  fifties: number;
  centuries: number;
  dismissedDucks: number;
  wickets: number;
  catches: number;
  runOuts: number;
  stumpings: number;
  hatTricks: number;
  threeWicketHauls: number;
  matchesBowled: number;
  completedOvers: number;
  totalRunsConceded: number;
  totalXP: number;
  level: number;
};

export type AppliedPlayerMatchProgression = {
  idempotencyKey: string;
  matchId: string;
  playerId: string;
  xpBreakdown: ReturnType<typeof calculatePlayerMatchXP>;
  progressionAppliedAt: string;
  appliedFinalisationVersion: number;
};

export type CareerProgressionState = {
  playerCareers: Record<string, PlayerCareerStats>;
  appliedProgressions: Record<string, AppliedPlayerMatchProgression>;
};

export function createEmptyCareerProgressionState(): CareerProgressionState {
  return {
    playerCareers: {},
    appliedProgressions: {}
  };
}

export function createEmptyPlayerCareerStats(playerId: string): PlayerCareerStats {
  return {
    playerId,
    matches: 0,
    inningsBatted: 0,
    runs: 0,
    fifties: 0,
    centuries: 0,
    dismissedDucks: 0,
    wickets: 0,
    catches: 0,
    runOuts: 0,
    stumpings: 0,
    hatTricks: 0,
    threeWicketHauls: 0,
    matchesBowled: 0,
    completedOvers: 0,
    totalRunsConceded: 0,
    totalXP: 0,
    level: 0
  };
}

export function loadCareerProgressionState(): CareerProgressionState {
  if (typeof window === "undefined") return createEmptyCareerProgressionState();

  try {
    const rawState = window.localStorage.getItem(CAREER_PROGRESS_STORAGE_KEY);
    if (!rawState) return createEmptyCareerProgressionState();

    const parsed = JSON.parse(rawState) as Partial<CareerProgressionState>;

    return {
      playerCareers: parsed.playerCareers ?? {},
      appliedProgressions: parsed.appliedProgressions ?? {}
    };
  } catch {
    return createEmptyCareerProgressionState();
  }
}

export function saveCareerProgressionState(state: CareerProgressionState) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(CAREER_PROGRESS_STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event(CAREER_PROGRESS_UPDATED_EVENT));
}

export function getPlayerMatchIdempotencyKey(matchId: string, playerId: string): string {
  return `${matchId}:${playerId}`;
}

export function applyFinalisedMatchToCareerStats(
  match: MatchRecord,
  currentState: CareerProgressionState = createEmptyCareerProgressionState(),
  appliedAt = new Date().toISOString()
): CareerProgressionState {
  if (
    match.status !== "finalised" ||
    match.result.type === "no_result" ||
    match.isDemo ||
    match.isDemoTestMatch
  ) {
    return currentState;
  }

  const playerCareers = { ...currentState.playerCareers };
  const appliedProgressions = { ...currentState.appliedProgressions };
  const allPerformances = (match.finalisedPlayerRecords ??
    [
      ...match.teams.teamA.playerPerformances,
      ...match.teams.teamB.playerPerformances
    ]) as PlayerMatchPerformance[];
  const allBowlingOvers = [
    ...match.teams.teamA.bowlingOvers,
    ...match.teams.teamB.bowlingOvers
  ];

  for (const performance of allPerformances) {
    if (!performance.played) continue;

    const idempotencyKey = getPlayerMatchIdempotencyKey(match.id, performance.playerId);
    if (appliedProgressions[idempotencyKey]) continue;

    const playerOvers = allBowlingOvers.filter(
      (over) => over.bowlerId === performance.playerId
    );
    const storedBreakdown = (performance as FinalisedPlayerMatchRecord).xpBreakdown;
    const xpBreakdown = storedBreakdown ?? calculatePlayerMatchXP(performance, {
      result: match.result,
      overs: playerOvers,
      matchDate: match.matchDate
    });
    const currentCareer =
      playerCareers[performance.playerId] ??
      createEmptyPlayerCareerStats(performance.playerId);
    const runs = Number(performance.runs) || 0;
    const completedBowlingOvers = playerOvers.length;
    const nextTotalXP = applyMatchXPWithLevelProtection({
      currentTotalXP: currentCareer.totalXP,
      currentLevel: currentCareer.level,
      awardedMatchXP: xpBreakdown.awardedXP
    });

    playerCareers[performance.playerId] = {
      ...currentCareer,
      matches: currentCareer.matches + 1,
      inningsBatted: currentCareer.inningsBatted + (performance.didBat ? 1 : 0),
      runs: currentCareer.runs + (performance.didBat ? runs : 0),
      fifties:
        currentCareer.fifties +
        (performance.didBat && runs >= 50 && runs < 100 ? 1 : 0),
      centuries:
        currentCareer.centuries + (performance.didBat && runs >= 100 ? 1 : 0),
      dismissedDucks:
        currentCareer.dismissedDucks +
        (performance.didBat && performance.wasOut && runs === 0 ? 1 : 0),
      wickets: currentCareer.wickets + performance.wickets,
      catches: currentCareer.catches + performance.catches,
      runOuts: currentCareer.runOuts + performance.runOuts,
      stumpings: currentCareer.stumpings + (performance.stumpings ?? 0),
      hatTricks: currentCareer.hatTricks + performance.hatTricks,
      threeWicketHauls:
        currentCareer.threeWicketHauls + (performance.wickets >= 3 ? 1 : 0),
      matchesBowled:
        currentCareer.matchesBowled + (completedBowlingOvers > 0 ? 1 : 0),
      completedOvers: currentCareer.completedOvers + completedBowlingOvers,
      totalRunsConceded:
        currentCareer.totalRunsConceded +
        playerOvers.reduce((total, over) => total + (Number(over.runsConceded) || 0), 0),
      totalXP: nextTotalXP,
      level: Math.max(currentCareer.level, getLevelFromXP(nextTotalXP))
    };

    appliedProgressions[idempotencyKey] = {
      idempotencyKey,
      matchId: match.id,
      playerId: performance.playerId,
      xpBreakdown,
      progressionAppliedAt: appliedAt,
      appliedFinalisationVersion: FINALISATION_VERSION
    };
  }

  return {
    playerCareers,
    appliedProgressions
  };
}

export function applyFinalisedMatchToLocalCareerStats(match: MatchRecord) {
  const currentState = loadCareerProgressionState();
  const nextState = applyFinalisedMatchToCareerStats(match, currentState);

  saveCareerProgressionState(nextState);

  return nextState;
}

export function mergeCareerStateWithRoster(
  state: CareerProgressionState,
  players: Player[]
): CareerProgressionState {
  const playerCareers = { ...state.playerCareers };

  for (const player of players) {
    playerCareers[player.id] =
      playerCareers[player.id] ?? createEmptyPlayerCareerStats(player.id);
  }

  return {
    playerCareers,
    appliedProgressions: { ...state.appliedProgressions }
  };
}

export function mergePlayersWithCareerState(
  basePlayers: Player[],
  state: CareerProgressionState
): Player[] {
  const rosterCareerState = mergeCareerStateWithRoster(state, basePlayers);
  const totals = basePlayers.map((player): PlayerProgressionTotals => {
    const career = rosterCareerState.playerCareers[player.id];

    return {
      playerId: player.id,
      finalisedMatches: career.matches,
      inningsBatted: career.inningsBatted,
      totalRuns: career.runs,
      fifties: career.fifties,
      centuries: career.centuries,
      dismissedDucks: career.dismissedDucks,
      matchesBowled: career.matchesBowled,
      totalWickets: career.wickets,
      completedOvers: career.completedOvers,
      totalRunsConceded: career.totalRunsConceded,
      hatTricks: career.hatTricks,
      threeWicketHauls: career.threeWicketHauls,
      catches: career.catches,
      runOuts: career.runOuts,
      stumpings: career.stumpings
    };
  });
  const ratings = new Map(
    calculatePlayerRatingSnapshots(totals).map((snapshot) => [
      snapshot.playerId,
      snapshot.rawRatings
    ])
  );

  return basePlayers.map((player) => {
    const career = rosterCareerState.playerCareers[player.id];

    return {
      ...player,
      level: career.level,
      xp: career.totalXP,
      stats: {
        matches: career.matches,
        runs: career.runs,
        wickets: career.wickets,
        catches: career.catches,
        runOuts: career.runOuts,
        hatTricks: career.hatTricks
      },
      ratings: ratings.get(player.id) ?? player.ratings
    };
  });
}
