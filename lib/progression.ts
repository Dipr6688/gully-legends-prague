import { isBowlingOverComplete } from "./match-records";
import type {
  BowlingOver,
  MatchResult,
  PlayerMatchPerformance,
  PlayerMatchXPBreakdown
} from "./types/match";
import type { PlayerRatings } from "./types/player";

export type RatingStatus = "UNRATED" | "SCOUTING" | "PROVISIONAL" | "ESTABLISHED";

export type PlayerProgress = {
  level: number;
  xp: number;
};

export type PlayerLevelProgress = {
  level: number;
  totalXP: number;
  currentLevelThreshold: number;
  nextLevelThreshold: number;
  xpWithinLevel: number;
  xpRequiredWithinLevel: number;
  progressPercentage: number;
};

export type ApplyMatchXPArgs = {
  currentTotalXP: number;
  currentLevel: number;
  awardedMatchXP: number;
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
  stumpings: number;
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

export type XPMatchContext = {
  teamWon?: boolean;
  result?: MatchResult;
  overs?: BowlingOver[];
};

export function formatPercentage(value: number): string {
  const safeValue = Number.isFinite(value)
    ? Math.min(100, Math.max(0, value))
    : 0;

  return `${safeValue.toFixed(1)}%`;
}

export const XP_RULES = {
  participation: 20,
  winBonus: 5,
  playerOfMatch: 15,
  runsPerXP: 2,
  ordinaryBattingCap: 30,
  fiftyBonus: 15,
  hundredAdditionalBonus: 25,
  duckPenalty: -8,
  wicket: 10,
  hatTrick: 25,
  maiden: 5,
  expensiveOver: {
    twentyOneToTwentyFour: -5,
    twentyFiveToTwentyNine: -8,
    thirtyOrMore: -12,
    matchPenaltyFloor: -20
  },
  catch: 6,
  runOut: 8,
  stumping: 8,
  fieldingCap: 24,
  minimumMatchXP: -15,
  maximumMatchXP: 120
} as const;

export const LEVEL_RULES = {
  baseXP: 150,
  linearXP: 50,
  quadraticXP: 10
} as const;

export const PLAYER_POWER_RULES = {
  batting: {
    title: "Blade Power",
    outputRange: "0-100",
    factors: [
      { label: "Runs per innings", weight: 0.6 },
      { label: "Milestone innings", weight: 0.25 },
      { label: "Duck avoidance", weight: 0.15 }
    ]
  },
  bowling: {
    title: "Delivery Threat",
    outputRange: "0-100",
    factors: [
      { label: "Wickets per bowling match", weight: 0.55 },
      { label: "Economy control", weight: 0.3 },
      { label: "Hat-tricks and three-wicket hauls", weight: 0.15 }
    ]
  },
  fielding: {
    title: "Field Reflex",
    outputRange: "0-100",
    factors: [
      { label: "Catches per match", weight: 0.65 },
      { label: "Run-outs per match", weight: 0.35 }
    ]
  }
} as const;

export const RATING_STATUS_RULES = [
  {
    status: "UNRATED",
    range: "0 finalised matches",
    description: "Waiting for the player's first finalised performance."
  },
  {
    status: "SCOUTING",
    range: "1-2 finalised matches",
    description: "Early data is being collected."
  },
  {
    status: "PROVISIONAL",
    range: "3-7 finalised matches",
    description: "A numeric rating is available but still developing."
  },
  {
    status: "ESTABLISHED",
    range: "8 or more finalised matches",
    description: "The rating is supported by a larger performance record."
  }
] as const satisfies Array<{
  status: RatingStatus;
  range: string;
  description: string;
}>;

function safeInteger(value: unknown): number {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) return 0;

  return Math.max(0, Math.floor(numericValue));
}

export function getOverPenalty(runsConceded: number): number {
  if (runsConceded >= 30) return XP_RULES.expensiveOver.thirtyOrMore;
  if (runsConceded >= 25) return XP_RULES.expensiveOver.twentyFiveToTwentyNine;
  if (runsConceded >= 21) return XP_RULES.expensiveOver.twentyOneToTwentyFour;
  return 0;
}

export function calculateBattingMilestoneXP(runs: number): number {
  let milestoneXP = 0;

  if (runs >= 50) milestoneXP += XP_RULES.fiftyBonus;
  if (runs >= 100) milestoneXP += XP_RULES.hundredAdditionalBonus;

  return milestoneXP;
}

export function calculateExpensiveOverPenaltyForRuns(
  runsConceded: number
): number {
  return getOverPenalty(runsConceded);
}

export function calculateExpensiveOverPenalty(overs: BowlingOver[]): number {
  const total = overs.reduce(
    (sum, over) =>
      isBowlingOverComplete(over)
        ? sum + calculateExpensiveOverPenaltyForRuns(safeInteger(over.runsConceded))
        : sum,
    0
  );

  return Math.max(total, XP_RULES.expensiveOver.matchPenaltyFloor);
}

export function clampAwardedMatchXP(rawTotalXP: number): number {
  return Math.max(
    XP_RULES.minimumMatchXP,
    Math.min(rawTotalXP, XP_RULES.maximumMatchXP)
  );
}

function createEmptyXPBreakdown(): PlayerMatchXPBreakdown {
  return {
    participationXP: 0,
    winBonusXP: 0,
    playerOfMatchXP: 0,
    battingRunsXP: 0,
    battingMilestoneXP: 0,
    duckPenaltyXP: 0,
    wicketXP: 0,
    hatTrickXP: 0,
    maidenXP: 0,
    expensiveOverPenaltyXP: 0,
    fieldingXP: 0,
    rawTotalXP: 0,
    awardedXP: 0
  };
}

function shouldAwardWinBonus(
  performance: PlayerMatchPerformance,
  context: XPMatchContext
): boolean {
  if (!performance.played) return false;

  if (context.result) {
    return (
      context.result.type !== "tie" &&
      context.result.type !== "no_result" &&
      "winnerTeamId" in context.result &&
      context.result.winnerTeamId === performance.teamId
    );
  }

  return Boolean(context.teamWon);
}

export function calculatePlayerMatchXP(
  performance: PlayerMatchPerformance,
  context: XPMatchContext = {}
): PlayerMatchXPBreakdown {
  if (!performance.played || context.result?.type === "no_result") {
    return createEmptyXPBreakdown();
  }

  const overs = context.overs ?? [];
  const runs = safeInteger(performance.runs);
  const participationXP = performance.played ? XP_RULES.participation : 0;
  const winBonusXP = shouldAwardWinBonus(performance, context) ? XP_RULES.winBonus : 0;
  const playerOfMatchXP =
    performance.played && performance.playerOfMatch ? XP_RULES.playerOfMatch : 0;
  const battingRunsXP = performance.didBat
    ? Math.min(
        Math.floor(runs / XP_RULES.runsPerXP),
        XP_RULES.ordinaryBattingCap
      )
    : 0;
  const battingMilestoneXP = performance.didBat
    ? calculateBattingMilestoneXP(runs)
    : 0;
  const duckPenaltyXP =
    performance.played && performance.didBat && performance.wasOut && runs === 0
      ? XP_RULES.duckPenalty
      : 0;
  const wicketXP = performance.wickets * XP_RULES.wicket;
  const hatTrickXP = performance.hatTricks * XP_RULES.hatTrick;
  const maidenXP =
    overs.filter(
      (over) =>
        isBowlingOverComplete(over) &&
        over.maiden &&
        safeInteger(over.runsConceded) === 0
    ).length * XP_RULES.maiden;
  const expensiveOverPenaltyXP = calculateExpensiveOverPenalty(overs);
  const fieldingXP = Math.min(
    performance.catches * XP_RULES.catch +
      performance.runOuts * XP_RULES.runOut +
      (performance.stumpings ?? 0) * XP_RULES.stumping,
    XP_RULES.fieldingCap
  );

  const rawTotalXP =
    participationXP +
    winBonusXP +
    playerOfMatchXP +
    battingRunsXP +
    battingMilestoneXP +
    duckPenaltyXP +
    wicketXP +
    hatTrickXP +
    maidenXP +
    expensiveOverPenaltyXP +
    fieldingXP;

  const awardedXP = clampAwardedMatchXP(rawTotalXP);

  return {
    participationXP,
    winBonusXP,
    playerOfMatchXP,
    battingRunsXP,
    battingMilestoneXP,
    duckPenaltyXP,
    wicketXP,
    hatTrickXP,
    maidenXP,
    expensiveOverPenaltyXP,
    fieldingXP,
    rawTotalXP,
    awardedXP
  };
}

export function calculateSharedPlayerMatchXP(
  performances: PlayerMatchPerformance[],
  context: XPMatchContext = {}
): PlayerMatchXPBreakdown {
  const playedPerformances = performances.filter((performance) => performance.played);

  if (playedPerformances.length === 0 || context.result?.type === "no_result") {
    return createEmptyXPBreakdown();
  }

  const overs = context.overs ?? [];
  const participationXP = XP_RULES.participation;
  const winBonusXP = 0;
  const playerOfMatchXP = playedPerformances.some(
    (performance) => performance.playerOfMatch
  )
    ? XP_RULES.playerOfMatch
    : 0;
  const totalBattingRuns = playedPerformances
    .filter((performance) => performance.didBat)
    .reduce((sum, performance) => sum + safeInteger(performance.runs), 0);
  const battingRunsXP = Math.min(
    Math.floor(totalBattingRuns / XP_RULES.runsPerXP),
    XP_RULES.ordinaryBattingCap
  );
  const battingMilestoneXP = playedPerformances.reduce((sum, performance) => {
    if (!performance.didBat) return sum;

    return sum + calculateBattingMilestoneXP(safeInteger(performance.runs));
  }, 0);
  const duckPenaltyXP = playedPerformances.reduce((sum, performance) => {
    const runs = safeInteger(performance.runs);

    return (
      sum +
      (performance.didBat && performance.wasOut && runs === 0
        ? XP_RULES.duckPenalty
        : 0)
    );
  }, 0);
  const wicketXP =
    playedPerformances.reduce(
      (sum, performance) => sum + safeInteger(performance.wickets),
      0
    ) * XP_RULES.wicket;
  const hatTrickXP =
    playedPerformances.reduce(
      (sum, performance) => sum + safeInteger(performance.hatTricks),
      0
    ) * XP_RULES.hatTrick;
  const maidenXP =
    overs.filter(
      (over) =>
        isBowlingOverComplete(over) &&
        over.maiden &&
        safeInteger(over.runsConceded) === 0
    ).length * XP_RULES.maiden;
  const expensiveOverPenaltyXP = calculateExpensiveOverPenalty(overs);
  const fieldingXP = Math.min(
    playedPerformances.reduce(
      (sum, performance) =>
        sum +
        performance.catches * XP_RULES.catch +
        performance.runOuts * XP_RULES.runOut,
      0
    ),
    XP_RULES.fieldingCap
  );
  const rawTotalXP =
    participationXP +
    winBonusXP +
    playerOfMatchXP +
    battingRunsXP +
    battingMilestoneXP +
    duckPenaltyXP +
    wicketXP +
    hatTrickXP +
    maidenXP +
    expensiveOverPenaltyXP +
    fieldingXP;

  return {
    participationXP,
    winBonusXP,
    playerOfMatchXP,
    battingRunsXP,
    battingMilestoneXP,
    duckPenaltyXP,
    wicketXP,
    hatTrickXP,
    maidenXP,
    expensiveOverPenaltyXP,
    fieldingXP,
    rawTotalXP,
    awardedXP: clampAwardedMatchXP(rawTotalXP)
  };
}

export function calculateMatchXP(
  performance: PlayerMatchPerformance,
  context: XPMatchContext = {}
): number {
  return calculatePlayerMatchXP(performance, context).awardedXP;
}

export function xpNeededToAdvance(currentLevel: number): number {
  return (
    LEVEL_RULES.baseXP +
    LEVEL_RULES.linearXP * currentLevel +
    LEVEL_RULES.quadraticXP * currentLevel * currentLevel
  );
}

export function cumulativeXPForLevel(targetLevel: number): number {
  let threshold = 0;

  for (let currentLevel = 0; currentLevel < targetLevel; currentLevel += 1) {
    threshold += xpNeededToAdvance(currentLevel);
  }

  return threshold;
}

export function cumulativeXPThresholdForLevel(level: number): number {
  return cumulativeXPForLevel(level);
}

export function getLevelFromXP(totalXP: number): number {
  let level = 0;
  let threshold = 0;

  while (totalXP >= threshold + xpNeededToAdvance(level)) {
    threshold += xpNeededToAdvance(level);
    level += 1;
  }

  return level;
}

export function calculateLevelFromXP(totalXP: number): number {
  return getLevelFromXP(totalXP);
}

export function getLevelProgress(totalXP: number): PlayerLevelProgress {
  const level = getLevelFromXP(totalXP);
  const currentLevelThreshold = cumulativeXPForLevel(level);
  const xpRequiredWithinLevel = xpNeededToAdvance(level);
  const xpWithinLevel = Math.max(0, totalXP - currentLevelThreshold);
  const progressPercentage = Math.min(
    100,
    Math.max(0, (xpWithinLevel / xpRequiredWithinLevel) * 100)
  );

  return {
    level,
    totalXP,
    currentLevelThreshold,
    nextLevelThreshold: currentLevelThreshold + xpRequiredWithinLevel,
    xpWithinLevel,
    xpRequiredWithinLevel,
    progressPercentage
  };
}

export function applyMatchXPWithLevelProtection({
  currentTotalXP,
  currentLevel,
  awardedMatchXP
}: ApplyMatchXPArgs): number {
  const currentLevelFloor = cumulativeXPForLevel(currentLevel);

  return Math.max(currentLevelFloor, currentTotalXP + awardedMatchXP);
}

export function applyMatchXP(
  currentProgress: PlayerProgress,
  matchXP: number
): PlayerProgress {
  const xp = applyMatchXPWithLevelProtection({
    currentTotalXP: currentProgress.xp,
    currentLevel: currentProgress.level,
    awardedMatchXP: matchXP
  });
  const level = Math.max(currentProgress.level, getLevelFromXP(xp));

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
        const overs = "overs" in performance && Array.isArray(performance.overs)
          ? performance.overs
          : [];
        const completedOvers = overs.length;
      const totalRunsConceded = overs.reduce(
          (sum, over) => sum + safeInteger(over.runsConceded),
          0
        );

        totals.finalisedMatches += 1;
        totals.inningsBatted += performance.didBat ? 1 : 0;
        const runs = safeInteger(performance.runs);

        totals.totalRuns += performance.didBat ? runs : 0;
        totals.centuries += performance.didBat && runs >= 100 ? 1 : 0;
        totals.fifties +=
          performance.didBat && runs >= 50 && runs < 100 ? 1 : 0;
        totals.dismissedDucks +=
          performance.didBat && performance.wasOut && runs === 0 ? 1 : 0;
        totals.matchesBowled += completedOvers > 0 ? 1 : 0;
        totals.completedOvers += completedOvers;
        totals.totalRunsConceded += totalRunsConceded;
        totals.totalWickets += performance.wickets;
        totals.hatTricks += performance.hatTricks;
        totals.threeWicketHauls += performance.wickets >= 3 ? 1 : 0;
        totals.catches += performance.catches;
        totals.runOuts += performance.runOuts;
        totals.stumpings += performance.stumpings ?? 0;

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
    runOuts: 0,
    stumpings: 0
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
