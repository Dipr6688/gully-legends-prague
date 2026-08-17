import { getQuickScoringEventsForTeam } from "./quick-scoring";
import { sanitizeRuns } from "./match-records";
import { getFilteredFinalisedMatches } from "./match-eligibility";
import type {
  MatchRecord,
  PlayerMatchPerformance,
  QuickScoringEvent,
  TeamId
} from "./types/match";

export const ADVANCED_CRICKET_STAT_RULES = {
  minimumBallsFacedForStrikeRate: 20,
  minimumLegalBallsForEconomy: 18
} as const;

export type AdvancedBattingStats = {
  playerId: string;
  teamId: TeamId;
  runs: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  strikeRate: number | null;
};

export type AdvancedBowlingStats = {
  playerId: string;
  runsConceded: number;
  legalBalls: number;
  economy: number | null;
};

export type AdvancedInningsStats = {
  battingTeamId: TeamId;
  bowlingTeamId: TeamId;
  hasEventHistory: boolean;
  battingByPlayer: Map<string, AdvancedBattingStats>;
  bowlingByPlayer: Map<string, AdvancedBowlingStats>;
};

export type AdvancedCareerStats = {
  playerId: string;
  inningsBatted: number;
  trackedBattingInnings: number;
  trackedBattingRuns: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  boundaries: number;
  strikeRate: number | null;
  highestScore: number | null;
  highestScoreNotOut: boolean;
  ducks: number;
  matchesBowled: number;
  trackedBowlingMatches: number;
  trackedRunsConceded: number;
  legalBallsBowled: number;
  economy: number | null;
  matchesWithEventHistory: number;
  legacyFinalisedMatchesWithoutEvents: number;
};

function createBattingStats(
  playerId: string,
  teamId: TeamId
): AdvancedBattingStats {
  return {
    playerId,
    teamId,
    runs: 0,
    ballsFaced: 0,
    fours: 0,
    sixes: 0,
    strikeRate: null
  };
}

function createBowlingStats(playerId: string): AdvancedBowlingStats {
  return {
    playerId,
    runsConceded: 0,
    legalBalls: 0,
    economy: null
  };
}

function createCareerStats(playerId: string): AdvancedCareerStats {
  return {
    playerId,
    inningsBatted: 0,
    trackedBattingInnings: 0,
    trackedBattingRuns: 0,
    ballsFaced: 0,
    fours: 0,
    sixes: 0,
    boundaries: 0,
    strikeRate: null,
    highestScore: null,
    highestScoreNotOut: false,
    ducks: 0,
    matchesBowled: 0,
    trackedBowlingMatches: 0,
    trackedRunsConceded: 0,
    legalBallsBowled: 0,
    economy: null,
    matchesWithEventHistory: 0,
    legacyFinalisedMatchesWithoutEvents: 0
  };
}

export function calculateBattingStrikeRate({
  runs,
  ballsFaced
}: {
  runs: number;
  ballsFaced: number;
}): number | null {
  const safeBalls = sanitizeRuns(ballsFaced);

  if (safeBalls === 0) return null;

  return (sanitizeRuns(runs) * 100) / safeBalls;
}

export function calculateBowlingEconomy({
  runsConceded,
  legalBalls
}: {
  runsConceded: number;
  legalBalls: number;
}): number | null {
  const safeLegalBalls = sanitizeRuns(legalBalls);

  if (safeLegalBalls === 0) return null;

  return (sanitizeRuns(runsConceded) * 6) / safeLegalBalls;
}

export function formatStrikeRate(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(1)
    : "-";
}

export function formatEconomy(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(2)
    : "-";
}

export function deliveryCountsAsBallFaced(event: QuickScoringEvent): boolean {
  return event.extraType !== "wide";
}

export function eventRunsConcededByBowler(event: QuickScoringEvent): number {
  return sanitizeRuns(event.batterRuns) + sanitizeRuns(event.extras);
}

export function eventBoundaryCounts(event: QuickScoringEvent): {
  fours: number;
  sixes: number;
} {
  const batterRuns = sanitizeRuns(event.batterRuns);

  return {
    fours: batterRuns === 4 ? 1 : 0,
    sixes: batterRuns === 6 ? 1 : 0
  };
}

export function deriveAdvancedInningsStats({
  battingTeamId,
  bowlingTeamId,
  events
}: {
  battingTeamId: TeamId;
  bowlingTeamId: TeamId;
  events: QuickScoringEvent[];
}): AdvancedInningsStats {
  const battingByPlayer = new Map<string, AdvancedBattingStats>();
  const bowlingByPlayer = new Map<string, AdvancedBowlingStats>();

  for (const event of [...events].sort((left, right) => left.sequence - right.sequence)) {
    if (event.strikerId) {
      const batting =
        battingByPlayer.get(event.strikerId) ??
        createBattingStats(event.strikerId, battingTeamId);

      batting.runs += sanitizeRuns(event.batterRuns);
      const boundaries = eventBoundaryCounts(event);
      batting.fours += boundaries.fours;
      batting.sixes += boundaries.sixes;
      if (deliveryCountsAsBallFaced(event)) {
        batting.ballsFaced += 1;
      }
      batting.strikeRate = calculateBattingStrikeRate({
        runs: batting.runs,
        ballsFaced: batting.ballsFaced
      });
      battingByPlayer.set(event.strikerId, batting);
    }

    if (event.bowlerId) {
      const bowling =
        bowlingByPlayer.get(event.bowlerId) ?? createBowlingStats(event.bowlerId);

      bowling.runsConceded += eventRunsConcededByBowler(event);
      if (event.legalDelivery) {
        bowling.legalBalls += 1;
      }
      bowling.economy = calculateBowlingEconomy({
        runsConceded: bowling.runsConceded,
        legalBalls: bowling.legalBalls
      });
      bowlingByPlayer.set(event.bowlerId, bowling);
    }
  }

  return {
    battingTeamId,
    bowlingTeamId,
    hasEventHistory: events.length > 0,
    battingByPlayer,
    bowlingByPlayer
  };
}

export function deriveAdvancedMatchStats(match: MatchRecord) {
  const firstEvents = getQuickScoringEventsForTeam(
    match.quickScoring,
    match.innings.first.battingTeamId
  );
  const secondEvents = getQuickScoringEventsForTeam(
    match.quickScoring,
    match.innings.second.battingTeamId
  );
  const innings = [
    deriveAdvancedInningsStats({
      battingTeamId: match.innings.first.battingTeamId,
      bowlingTeamId: match.innings.first.bowlingTeamId,
      events: firstEvents
    }),
    deriveAdvancedInningsStats({
      battingTeamId: match.innings.second.battingTeamId,
      bowlingTeamId: match.innings.second.bowlingTeamId,
      events: secondEvents
    })
  ];

  return {
    innings,
    hasEventHistory: innings.some((item) => item.hasEventHistory)
  };
}

function getContextPerformances(match: MatchRecord): PlayerMatchPerformance[] {
  const inningsPerformances = [
    ...match.innings.first.battingPerformances,
    ...match.innings.second.battingPerformances
  ];

  return inningsPerformances.length > 0
    ? inningsPerformances
    : [
        ...match.teams.teamA.playerPerformances,
        ...match.teams.teamB.playerPerformances
      ];
}

function applyBattingPerformance(
  career: AdvancedCareerStats,
  performance: PlayerMatchPerformance
) {
  if (!performance.didBat) return;

  const runs = sanitizeRuns(performance.runs);

  career.inningsBatted += 1;
  career.ducks += performance.wasOut && runs === 0 ? 1 : 0;

  if (
    career.highestScore === null ||
    runs > career.highestScore ||
    (runs === career.highestScore && !performance.wasOut)
  ) {
    career.highestScore = runs;
    career.highestScoreNotOut = !performance.wasOut;
  }
}

export function formatHighestScore(stats: AdvancedCareerStats): string {
  if (stats.highestScore === null) return "-";

  return `${stats.highestScore}${stats.highestScoreNotOut ? "*" : ""}`;
}

export function formatLegalBallsAsOvers(legalBalls: number): string {
  const safeLegalBalls = sanitizeRuns(legalBalls);

  return `${Math.floor(safeLegalBalls / 6)}.${safeLegalBalls % 6}`;
}

export function deriveAdvancedCareerStatsByPlayer({
  matches,
  period = "all-time",
  now = new Date()
}: {
  matches: MatchRecord[];
  period?: "all-time" | "current-month";
  now?: Date;
}): Map<string, AdvancedCareerStats> {
  const statsByPlayer = new Map<string, AdvancedCareerStats>();
  const finalisedMatches = getFilteredFinalisedMatches({ matches, period, now });

  function ensureCareer(playerId: string) {
    const current = statsByPlayer.get(playerId) ?? createCareerStats(playerId);
    statsByPlayer.set(playerId, current);

    return current;
  }

  for (const match of finalisedMatches) {
    const matchStats = deriveAdvancedMatchStats(match);
    const hasEventHistory = matchStats.hasEventHistory;
    const trackedBattingTeamIds = new Set(
      matchStats.innings
        .filter((innings) => innings.hasEventHistory)
        .map((innings) => innings.battingTeamId)
    );
    const playerIdsInMatch = new Set<string>();
    const bowlersInMatch = new Set<string>();

    for (const performance of getContextPerformances(match)) {
      if (!performance.played) continue;

      playerIdsInMatch.add(performance.playerId);
      const career = ensureCareer(performance.playerId);

      applyBattingPerformance(career, performance);
      if (
        performance.didBat &&
        trackedBattingTeamIds.has(performance.representingTeamId ?? performance.teamId)
      ) {
        career.trackedBattingInnings += 1;
      }
    }

    for (const innings of matchStats.innings) {
      for (const batting of innings.battingByPlayer.values()) {
        const career = ensureCareer(batting.playerId);

        playerIdsInMatch.add(batting.playerId);
        career.trackedBattingRuns += batting.runs;
        career.ballsFaced += batting.ballsFaced;
        career.fours += batting.fours;
        career.sixes += batting.sixes;
      }

      for (const bowling of innings.bowlingByPlayer.values()) {
        const career = ensureCareer(bowling.playerId);

        playerIdsInMatch.add(bowling.playerId);
        if (bowling.legalBalls > 0) bowlersInMatch.add(bowling.playerId);
        career.trackedRunsConceded += bowling.runsConceded;
        career.legalBallsBowled += bowling.legalBalls;
      }
    }

    for (const playerId of bowlersInMatch) {
      const career = ensureCareer(playerId);

      career.matchesBowled += 1;
      career.trackedBowlingMatches += 1;
    }

    for (const playerId of playerIdsInMatch) {
      const career = ensureCareer(playerId);

      if (hasEventHistory) {
        career.matchesWithEventHistory += 1;
      } else {
        career.legacyFinalisedMatchesWithoutEvents += 1;
      }
    }
  }

  for (const career of statsByPlayer.values()) {
    career.strikeRate = calculateBattingStrikeRate({
      runs: career.trackedBattingRuns,
      ballsFaced: career.ballsFaced
    });
    career.boundaries = career.fours + career.sixes;
    career.economy = calculateBowlingEconomy({
      runsConceded: career.trackedRunsConceded,
      legalBalls: career.legalBallsBowled
    });
  }

  return statsByPlayer;
}

export function getAdvancedCareerStatsForPlayer({
  matches,
  playerId
}: {
  matches: MatchRecord[];
  playerId: string;
}): AdvancedCareerStats {
  return (
    deriveAdvancedCareerStatsByPlayer({ matches }).get(playerId) ??
    createCareerStats(playerId)
  );
}
