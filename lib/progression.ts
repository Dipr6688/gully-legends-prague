import type { BowlingOver, PlayerMatchPerformance } from "./types/match";
import type { PlayerRatings } from "./types/player";

export type RatingStatus = "UNRATED" | "SCOUTING" | "PROVISIONAL" | "ESTABLISHED";

export type PlayerProgress = {
  level: number;
  xp: number;
};

export type PlayerProgressionTotals = {
  playerId: string;
  finalisedMatches: number;
  inningsBatted: number;
  totalRuns: number;
  fifties: number;
  centuries: number;
  dismissedDucks: number;
  matchesBowled: number;
  totalWickets: number;
  completedOvers: number;
  totalRunsConceded: number;
  hatTricks: number;
  threeWicketHauls: number;
  catches: number;
  runOuts: number;
};

export type DisplayedRating = {
  status: RatingStatus;
  value: number | null;
};

export type PlayerRatingSnapshot = {
  playerId: string;
  rawRatings: PlayerRatings;
  displayedRatings: Record<keyof PlayerRatings, DisplayedRating>;
};

export function getOverPenalty(runsConceded: number): number {
  if (runsConceded >= 30) return -12;
  if (runsConceded >= 25) return -8;
  if (runsConceded >= 21) return -5;
  return 0;
}

export function calculateExpensiveOverPenalty(overs: BowlingOver[]): number {
  const total = overs.reduce(
    (sum, over) => sum + getOverPenalty(over.runsConceded),
    0
  );

  return Math.max(total, -20);
}

export function calculateMatchXP(performance: PlayerMatchPerformance): number {
  const participationXP = performance.played ? 20 : 0;
  const winXP = performance.played && performance.teamWon ? 5 : 0;
  const playerOfMatchXP = performance.playerOfMatch ? 15 : 0;
  const regularBattingXP = performance.didBat
    ? Math.min(Math.floor(performance.runs / 2), 30)
    : 0;
  const fiftyXP = performance.didBat && performance.runs >= 50 ? 15 : 0;
  const centuryXP = performance.didBat && performance.runs >= 100 ? 25 : 0;
  const duckPenalty =
    performance.didBat && performance.wasOut && performance.runs === 0 ? -8 : 0;
  const wicketXP = performance.wickets * 10;
  const hatTrickXP = performance.hatTricks * 25;
  const maidenXP =
    performance.overs.filter((over) => over.maiden || over.runsConceded === 0)
      .length * 5;
  const expensiveOverPenalty = calculateExpensiveOverPenalty(performance.overs);
  const fieldingXP = Math.min(
    performance.catches * 6 +
      performance.runOuts * 8 +
      (performance.stumpings ?? 0) * 8,
    24
  );

  const matchXP =
    participationXP +
    winXP +
    playerOfMatchXP +
    regularBattingXP +
    fiftyXP +
    centuryXP +
    duckPenalty +
    wicketXP +
    hatTrickXP +
    maidenXP +
    expensiveOverPenalty +
    fieldingXP;

  return Math.max(matchXP, -15);
}

export function xpNeededToAdvance(currentLevel: number): number {
  return 100 + 50 * currentLevel + 20 * currentLevel * currentLevel;
}

export function cumulativeXPThresholdForLevel(level: number): number {
  let threshold = 0;

  for (let currentLevel = 0; currentLevel < level; currentLevel += 1) {
    threshold += xpNeededToAdvance(currentLevel);
  }

  return threshold;
}

export function calculateLevelFromXP(totalXP: number): number {
  let level = 0;

  while (totalXP >= cumulativeXPThresholdForLevel(level + 1)) {
    level += 1;
  }

  return level;
}

export function applyMatchXP(
  currentProgress: PlayerProgress,
  matchXP: number
): PlayerProgress {
  const achievedLevelFloor = cumulativeXPThresholdForLevel(currentProgress.level);
  const xp = Math.max(currentProgress.xp + matchXP, achievedLevelFloor);
  const level = Math.max(currentProgress.level, calculateLevelFromXP(xp));

  return { level, xp };
}

export function aggregatePlayerPerformances(
  playerId: string,
  performances: PlayerMatchPerformance[]
): PlayerProgressionTotals {
  return performances
    .filter((performance) => performance.playerId === playerId && performance.played)
    .reduce<PlayerProgressionTotals>(
      (totals, performance) => {
        const completedOvers = performance.overs.length;
        const totalRunsConceded = performance.overs.reduce(
          (sum, over) => sum + over.runsConceded,
          0
        );

        totals.finalisedMatches += 1;
        totals.inningsBatted += performance.didBat ? 1 : 0;
        totals.totalRuns += performance.didBat ? performance.runs : 0;
        totals.centuries += performance.didBat && performance.runs >= 100 ? 1 : 0;
        totals.fifties +=
          performance.didBat && performance.runs >= 50 && performance.runs < 100 ? 1 : 0;
        totals.dismissedDucks +=
          performance.didBat && performance.wasOut && performance.runs === 0 ? 1 : 0;
        totals.matchesBowled += completedOvers > 0 ? 1 : 0;
        totals.completedOvers += completedOvers;
        totals.totalRunsConceded += totalRunsConceded;
        totals.totalWickets += performance.wickets;
        totals.hatTricks += performance.hatTricks;
        totals.threeWicketHauls += performance.wickets >= 3 ? 1 : 0;
        totals.catches += performance.catches;
        totals.runOuts += performance.runOuts;

        return totals;
      },
      createEmptyTotals(playerId)
    );
}

export function calculateRatingStatus(finalisedMatches: number): RatingStatus {
  if (finalisedMatches === 0) return "UNRATED";
  if (finalisedMatches <= 2) return "SCOUTING";
  if (finalisedMatches <= 7) return "PROVISIONAL";
  return "ESTABLISHED";
}

export function calculateDisplayedRating(
  rawRating: number,
  finalisedMatches: number
): DisplayedRating {
  const status = calculateRatingStatus(finalisedMatches);

  if (finalisedMatches < 3) {
    return { status, value: null };
  }

  const reliability = Math.min(finalisedMatches / 8, 1);
  const value = Math.round(50 + reliability * (clampRating(rawRating) - 50));

  return { status, value: clampRating(value) };
}

export function calculatePlayerRatingSnapshots(
  totals: PlayerProgressionTotals[]
): PlayerRatingSnapshot[] {
  const runsPerInnings = totals.map((total) =>
    total.inningsBatted > 0 ? total.totalRuns / total.inningsBatted : 0
  );
  const milestoneIndex = totals.map((total) =>
    total.inningsBatted > 0
      ? (total.fifties + 2 * total.centuries) / total.inningsBatted
      : 0
  );
  const duckAvoidance = totals.map((total) =>
    total.inningsBatted > 0 ? 1 - total.dismissedDucks / total.inningsBatted : 0
  );
  const wicketsPerBowlingMatch = totals.map((total) =>
    total.matchesBowled > 0 ? total.totalWickets / total.matchesBowled : 0
  );
  const economy = totals.map((total) =>
    total.completedOvers > 0 ? total.totalRunsConceded / total.completedOvers : 0
  );
  const bowlingImpact = totals.map((total) =>
    total.matchesBowled > 0
      ? (2 * total.hatTricks + total.threeWicketHauls) / total.matchesBowled
      : 0
  );
  const catchesPerMatch = totals.map((total) =>
    total.finalisedMatches > 0 ? total.catches / total.finalisedMatches : 0
  );
  const runOutsPerMatch = totals.map((total) =>
    total.finalisedMatches > 0 ? total.runOuts / total.finalisedMatches : 0
  );

  return totals.map((total, index) => {
    const rawRatings = {
      batting: clampRating(
        0.6 * percentileRank(runsPerInnings, runsPerInnings[index]) +
          0.25 * percentileRank(milestoneIndex, milestoneIndex[index]) +
          0.15 * percentileRank(duckAvoidance, duckAvoidance[index])
      ),
      bowling:
        total.matchesBowled > 0 && total.completedOvers > 0
          ? clampRating(
              0.55 *
                percentileRank(
                  wicketsPerBowlingMatch,
                  wicketsPerBowlingMatch[index]
                ) +
                0.3 * reversedPercentileRank(economy, economy[index]) +
                0.15 * percentileRank(bowlingImpact, bowlingImpact[index])
            )
          : 0,
      fielding:
        total.finalisedMatches > 0
          ? clampRating(
              0.65 * percentileRank(catchesPerMatch, catchesPerMatch[index]) +
                0.35 * percentileRank(runOutsPerMatch, runOutsPerMatch[index])
            )
          : 0
    };

    return {
      playerId: total.playerId,
      rawRatings,
      displayedRatings: {
        batting: calculateDisplayedRating(rawRatings.batting, total.finalisedMatches),
        bowling: calculateDisplayedRating(rawRatings.bowling, total.finalisedMatches),
        fielding: calculateDisplayedRating(rawRatings.fielding, total.finalisedMatches)
      }
    };
  });
}

function createEmptyTotals(playerId: string): PlayerProgressionTotals {
  return {
    playerId,
    finalisedMatches: 0,
    inningsBatted: 0,
    totalRuns: 0,
    fifties: 0,
    centuries: 0,
    dismissedDucks: 0,
    matchesBowled: 0,
    totalWickets: 0,
    completedOvers: 0,
    totalRunsConceded: 0,
    hatTricks: 0,
    threeWicketHauls: 0,
    catches: 0,
    runOuts: 0
  };
}

function percentileRank(values: number[], value: number): number {
  if (values.length <= 1) return 50;
  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) return 50;

  const lowerCount = values.filter((candidate) => candidate < value).length;
  return (lowerCount / (values.length - 1)) * 100;
}

function reversedPercentileRank(values: number[], value: number): number {
  if (values.length <= 1) return 50;
  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) return 50;

  const higherCount = values.filter((candidate) => candidate > value).length;
  return (higherCount / (values.length - 1)) * 100;
}

function clampRating(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
