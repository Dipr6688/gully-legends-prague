import { isBowlingOverComplete } from "./match-records";
import type {
  BowlingOver,
  FinalisedPlayerMatchRecord,
  MatchRecord,
  MatchResult,
  PlayerMatchPerformance,
  PlayerMatchXPBreakdown
} from "./types/match";
import type { PlayerRatings } from "./types/player";

export type RatingStatus = "UNRATED" | "SCOUTING" | "PROVISIONAL" | "ESTABLISHED";
export type XPRuleVersion = "v1" | "v2";

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
  matchDate?: string;
  xpRuleVersion?: XPRuleVersion;
};

export function formatPercentage(value: number): string {
  const safeValue = Number.isFinite(value)
    ? Math.min(100, Math.max(0, value))
    : 0;

  return `${safeValue.toFixed(1)}%`;
}

export const XP_V2_EFFECTIVE_DATE = "2026-09-01";
export const XP_V2_EFFECTIVE_DATE_LABEL = "1 September 2026";

export const XP_V1_RULES = {
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

// Kept as the public V1 alias for historical callers and tests.
export const XP_RULES = XP_V1_RULES;

export const XP_V2_RULES = {
  participation: 20,
  winBonus: 5,
  playerOfMatch: 15,
  fiftyBonus: 15,
  hundredAdditionalBonus: 25,
  duckPenalty: -8,
  wicket: 10,
  hatTrick: 25,
  regularBattingCareerCap: 50,
  positiveOverQualityCareerCap: 30,
  negativeOverQualityCareerFloor: -20,
  catch: 6,
  runOut: 8,
  stumping: 8,
  fieldingCareerCap: 40,
  minimumMatchXP: -15,
  maximumMatchXP: 160
} as const;

export const XP_V2_OVER_QUALITY_RULES = [
  { label: "0 runs", minimum: 0, maximum: 0, points: 10 },
  { label: "1-3 runs", minimum: 1, maximum: 3, points: 6 },
  { label: "4-6 runs", minimum: 4, maximum: 6, points: 3 },
  { label: "7-9 runs", minimum: 7, maximum: 9, points: 1 },
  { label: "10-12 runs", minimum: 10, maximum: 12, points: 0 },
  { label: "13-15 runs", minimum: 13, maximum: 15, points: -2 },
  { label: "16-18 runs", minimum: 16, maximum: 18, points: -4 },
  { label: "19-21 runs", minimum: 19, maximum: 21, points: -6 },
  { label: "22-24 runs", minimum: 22, maximum: 24, points: -8 },
  { label: "25-29 runs", minimum: 25, maximum: 29, points: -11 },
  {
    label: "30+ runs",
    minimum: 30,
    maximum: Number.POSITIVE_INFINITY,
    points: -15
  }
] as const;

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

export function getXPRuleVersionForMatchDate(matchDate: string): XPRuleVersion {
  return /^\d{4}-\d{2}-\d{2}$/.test(matchDate) &&
    matchDate >= XP_V2_EFFECTIVE_DATE
    ? "v2"
    : "v1";
}

export function getStoredXPRuleVersion(
  breakdown: Pick<PlayerMatchXPBreakdown, "xpRuleVersion"> | null | undefined
): XPRuleVersion {
  return breakdown?.xpRuleVersion === "v2" ? "v2" : "v1";
}

export function resolveXPRuleVersion(context: XPMatchContext = {}): XPRuleVersion {
  if (context.xpRuleVersion === "v1" || context.xpRuleVersion === "v2") {
    return context.xpRuleVersion;
  }

  return context.matchDate
    ? getXPRuleVersionForMatchDate(context.matchDate)
    : "v1";
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

export function calculateV2RawRegularBattingPoints(runs: number): number {
  const safeRuns = safeInteger(runs);

  return (
    Math.floor(Math.min(safeRuns, 60) / 2) +
    Math.floor(Math.max(safeRuns - 60, 0) / 4)
  );
}

export function calculateRawBattingPoints(
  performance: Pick<PlayerMatchPerformance, "didBat" | "runs" | "wasOut">
): number {
  if (!performance.didBat) return 0;

  const runs = safeInteger(performance.runs);
  const milestoneXP = calculateBattingMilestoneXP(runs);
  const duckPenalty = performance.wasOut && runs === 0
    ? XP_V2_RULES.duckPenalty
    : 0;

  return calculateV2RawRegularBattingPoints(runs) + milestoneXP + duckPenalty;
}

export function calculateCareerBattingXP(
  performance: Pick<PlayerMatchPerformance, "didBat" | "runs" | "wasOut">
): number {
  if (!performance.didBat) return 0;

  const runs = safeInteger(performance.runs);
  const milestoneXP = calculateBattingMilestoneXP(runs);
  const duckPenalty = performance.wasOut && runs === 0
    ? XP_V2_RULES.duckPenalty
    : 0;

  return (
    Math.min(
      calculateV2RawRegularBattingPoints(runs),
      XP_V2_RULES.regularBattingCareerCap
    ) +
    milestoneXP +
    duckPenalty
  );
}

export function calculateOverQualityPoints(runsConceded: number): number {
  const runs = safeInteger(runsConceded);
  const rule = XP_V2_OVER_QUALITY_RULES.find(
    ({ minimum, maximum }) => runs >= minimum && runs <= maximum
  );

  return rule?.points ?? XP_V2_OVER_QUALITY_RULES.at(-1)?.points ?? -15;
}

export function isCompletedOverEligibleForV2Quality(over: BowlingOver): boolean {
  if (!isBowlingOverComplete(over)) return false;

  return over.legalBalls === undefined || safeInteger(over.legalBalls) === 6;
}

export type OverQualityTotals = {
  positive: number;
  negative: number;
  total: number;
};

export function calculateRawOverQualityPoints(
  overs: BowlingOver[]
): OverQualityTotals {
  let positive = 0;
  let negative = 0;

  for (const over of overs) {
    if (!isCompletedOverEligibleForV2Quality(over)) continue;

    const points = calculateOverQualityPoints(safeInteger(over.runsConceded));

    if (points > 0) positive += points;
    if (points < 0) negative += points;
  }

  return { positive, negative, total: positive + negative };
}

export function calculateRawBowlingPoints(
  performance: Pick<PlayerMatchPerformance, "wickets" | "hatTricks">,
  overs: BowlingOver[] = []
): number {
  const quality = calculateRawOverQualityPoints(overs);

  return (
    safeInteger(performance.wickets) * XP_V2_RULES.wicket +
    safeInteger(performance.hatTricks) * XP_V2_RULES.hatTrick +
    quality.total
  );
}

export function calculateCareerBowlingXP(
  performance: Pick<PlayerMatchPerformance, "wickets" | "hatTricks">,
  overs: BowlingOver[] = []
): number {
  const quality = calculateRawOverQualityPoints(overs);

  return (
    safeInteger(performance.wickets) * XP_V2_RULES.wicket +
    safeInteger(performance.hatTricks) * XP_V2_RULES.hatTrick +
    Math.min(quality.positive, XP_V2_RULES.positiveOverQualityCareerCap) +
    Math.max(quality.negative, XP_V2_RULES.negativeOverQualityCareerFloor)
  );
}

export function calculateRawFieldingPoints(
  performance: Pick<PlayerMatchPerformance, "catches" | "runOuts" | "stumpings">
): number {
  return (
    safeInteger(performance.catches) * XP_V2_RULES.catch +
    safeInteger(performance.runOuts) * XP_V2_RULES.runOut +
    safeInteger(performance.stumpings) * XP_V2_RULES.stumping
  );
}

export function calculateCareerFieldingXP(
  performance: Pick<PlayerMatchPerformance, "catches" | "runOuts" | "stumpings">
): number {
  return Math.min(
    calculateRawFieldingPoints(performance),
    XP_V2_RULES.fieldingCareerCap
  );
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

export function clampAwardedMatchXP(
  rawTotalXP: number,
  xpRuleVersion: XPRuleVersion = "v1"
): number {
  const rules = xpRuleVersion === "v2" ? XP_V2_RULES : XP_V1_RULES;

  return Math.max(
    rules.minimumMatchXP,
    Math.min(rawTotalXP, rules.maximumMatchXP)
  );
}

function createEmptyXPBreakdown(
  xpRuleVersion: XPRuleVersion
): PlayerMatchXPBreakdown {
  return {
    xpRuleVersion,
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
    overQualityXP: 0,
    rawPositiveOverQualityPoints: 0,
    rawNegativeOverQualityPoints: 0,
    rawBattingPoints: 0,
    rawBowlingPoints: 0,
    rawFieldingPoints: 0,
    rawTotalXP: 0,
    awardedXP: 0
  };
}

function calculateV1PlayerMatchXP(
  performance: PlayerMatchPerformance,
  context: XPMatchContext
): PlayerMatchXPBreakdown {
  const overs = context.overs ?? [];
  const runs = safeInteger(performance.runs);
  const participationXP = XP_V1_RULES.participation;
  const winBonusXP = shouldAwardWinBonus(performance, context)
    ? XP_V1_RULES.winBonus
    : 0;
  const playerOfMatchXP = performance.playerOfMatch
    ? XP_V1_RULES.playerOfMatch
    : 0;
  const battingRunsXP = performance.didBat
    ? Math.min(
        Math.floor(runs / XP_V1_RULES.runsPerXP),
        XP_V1_RULES.ordinaryBattingCap
      )
    : 0;
  const battingMilestoneXP = performance.didBat
    ? calculateBattingMilestoneXP(runs)
    : 0;
  const duckPenaltyXP = performance.didBat && performance.wasOut && runs === 0
    ? XP_V1_RULES.duckPenalty
    : 0;
  const wicketXP = safeInteger(performance.wickets) * XP_V1_RULES.wicket;
  const hatTrickXP = safeInteger(performance.hatTricks) * XP_V1_RULES.hatTrick;
  const maidenXP = overs.filter(
    (over) =>
      isBowlingOverComplete(over) &&
      over.maiden &&
      safeInteger(over.runsConceded) === 0
  ).length * XP_V1_RULES.maiden;
  const expensiveOverPenaltyXP = calculateExpensiveOverPenalty(overs);
  const fieldingXP = Math.min(
    safeInteger(performance.catches) * XP_V1_RULES.catch +
      safeInteger(performance.runOuts) * XP_V1_RULES.runOut +
      safeInteger(performance.stumpings) * XP_V1_RULES.stumping,
    XP_V1_RULES.fieldingCap
  );
  const rawBattingPoints = battingRunsXP + battingMilestoneXP + duckPenaltyXP;
  const rawBowlingPoints =
    wicketXP + hatTrickXP + maidenXP + expensiveOverPenaltyXP;
  const rawTotalXP =
    participationXP +
    winBonusXP +
    playerOfMatchXP +
    rawBattingPoints +
    rawBowlingPoints +
    fieldingXP;

  return {
    xpRuleVersion: "v1",
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
    overQualityXP: maidenXP + expensiveOverPenaltyXP,
    rawPositiveOverQualityPoints: maidenXP,
    rawNegativeOverQualityPoints: expensiveOverPenaltyXP,
    rawBattingPoints,
    rawBowlingPoints,
    rawFieldingPoints: fieldingXP,
    rawTotalXP,
    awardedXP: clampAwardedMatchXP(rawTotalXP, "v1")
  };
}

function calculateV2PlayerMatchXP(
  performance: PlayerMatchPerformance,
  context: XPMatchContext
): PlayerMatchXPBreakdown {
  const overs = context.overs ?? [];
  const runs = safeInteger(performance.runs);
  const participationXP = XP_V2_RULES.participation;
  const winBonusXP = shouldAwardWinBonus(performance, context)
    ? XP_V2_RULES.winBonus
    : 0;
  const playerOfMatchXP = performance.playerOfMatch
    ? XP_V2_RULES.playerOfMatch
    : 0;
  const rawRegularBattingPoints = performance.didBat
    ? calculateV2RawRegularBattingPoints(runs)
    : 0;
  const battingRunsXP = Math.min(
    rawRegularBattingPoints,
    XP_V2_RULES.regularBattingCareerCap
  );
  const battingMilestoneXP = performance.didBat
    ? calculateBattingMilestoneXP(runs)
    : 0;
  const duckPenaltyXP = performance.didBat && performance.wasOut && runs === 0
    ? XP_V2_RULES.duckPenalty
    : 0;
  const wicketXP = safeInteger(performance.wickets) * XP_V2_RULES.wicket;
  const hatTrickXP = safeInteger(performance.hatTricks) * XP_V2_RULES.hatTrick;
  const rawOverQuality = calculateRawOverQualityPoints(overs);
  const careerPositiveOverQuality = Math.min(
    rawOverQuality.positive,
    XP_V2_RULES.positiveOverQualityCareerCap
  );
  const careerNegativeOverQuality = Math.max(
    rawOverQuality.negative,
    XP_V2_RULES.negativeOverQualityCareerFloor
  );
  const overQualityXP = careerPositiveOverQuality + careerNegativeOverQuality;
  const fieldingXP = calculateCareerFieldingXP(performance);
  const rawBattingPoints =
    rawRegularBattingPoints + battingMilestoneXP + duckPenaltyXP;
  const rawBowlingPoints =
    wicketXP + hatTrickXP + rawOverQuality.total;
  const rawFieldingPoints = calculateRawFieldingPoints(performance);
  const rawTotalXP =
    participationXP +
    winBonusXP +
    playerOfMatchXP +
    battingRunsXP +
    battingMilestoneXP +
    duckPenaltyXP +
    wicketXP +
    hatTrickXP +
    overQualityXP +
    fieldingXP;

  return {
    xpRuleVersion: "v2",
    participationXP,
    winBonusXP,
    playerOfMatchXP,
    battingRunsXP,
    battingMilestoneXP,
    duckPenaltyXP,
    wicketXP,
    hatTrickXP,
    maidenXP: 0,
    expensiveOverPenaltyXP: careerNegativeOverQuality,
    fieldingXP,
    overQualityXP,
    rawPositiveOverQualityPoints: rawOverQuality.positive,
    rawNegativeOverQualityPoints: rawOverQuality.negative,
    rawBattingPoints,
    rawBowlingPoints,
    rawFieldingPoints,
    rawTotalXP,
    awardedXP: clampAwardedMatchXP(rawTotalXP, "v2")
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
  const xpRuleVersion = resolveXPRuleVersion(context);

  if (!performance.played || context.result?.type === "no_result") {
    return createEmptyXPBreakdown(xpRuleVersion);
  }

  return xpRuleVersion === "v2"
    ? calculateV2PlayerMatchXP(performance, context)
    : calculateV1PlayerMatchXP(performance, context);
}

function aggregateSharedPerformance(
  performances: PlayerMatchPerformance[]
): PlayerMatchPerformance {
  const base = performances[0];

  return {
    ...base,
    played: performances.some((performance) => performance.played),
    playerOfMatch: performances.some((performance) => performance.playerOfMatch),
    didBat: performances.some((performance) => performance.didBat),
    runs: performances.reduce(
      (sum, performance) =>
        sum + (performance.didBat ? safeInteger(performance.runs) : 0),
      0
    ),
    wasOut: performances.some((performance) => performance.wasOut),
    wickets: performances.reduce(
      (sum, performance) => sum + safeInteger(performance.wickets),
      0
    ),
    hatTricks: performances.reduce(
      (sum, performance) => sum + safeInteger(performance.hatTricks),
      0
    ),
    catches: performances.reduce(
      (sum, performance) => sum + safeInteger(performance.catches),
      0
    ),
    runOuts: performances.reduce(
      (sum, performance) => sum + safeInteger(performance.runOuts),
      0
    ),
    stumpings: performances.reduce(
      (sum, performance) => sum + safeInteger(performance.stumpings),
      0
    )
  };
}

export function calculateSharedPlayerMatchXP(
  performances: PlayerMatchPerformance[],
  context: XPMatchContext = {}
): PlayerMatchXPBreakdown {
  const playedPerformances = performances.filter((performance) => performance.played);
  const xpRuleVersion = resolveXPRuleVersion(context);

  if (playedPerformances.length === 0 || context.result?.type === "no_result") {
    return createEmptyXPBreakdown(xpRuleVersion);
  }

  if (xpRuleVersion === "v2") {
    const aggregate = aggregateSharedPerformance(playedPerformances);
    const base = calculateV2PlayerMatchXP(aggregate, {
      ...context,
      xpRuleVersion: "v2"
    });
    const battingMilestoneXP = playedPerformances.reduce((sum, performance) => {
      if (!performance.didBat) return sum;
      return sum + calculateBattingMilestoneXP(safeInteger(performance.runs));
    }, 0);
    const duckPenaltyXP = playedPerformances.reduce((sum, performance) => {
      const runs = safeInteger(performance.runs);
      return sum +
        (performance.didBat && performance.wasOut && runs === 0
          ? XP_V2_RULES.duckPenalty
          : 0);
    }, 0);
    const rawRegularBattingPoints = calculateV2RawRegularBattingPoints(
      safeInteger(aggregate.runs)
    );
    const battingRunsXP = Math.min(
      rawRegularBattingPoints,
      XP_V2_RULES.regularBattingCareerCap
    );
    const rawBattingPoints =
      rawRegularBattingPoints + battingMilestoneXP + duckPenaltyXP;
    const rawTotalXP =
      base.participationXP +
      base.playerOfMatchXP +
      battingRunsXP +
      battingMilestoneXP +
      duckPenaltyXP +
      base.wicketXP +
      base.hatTrickXP +
      (base.overQualityXP ?? 0) +
      base.fieldingXP;

    return {
      ...base,
      winBonusXP: 0,
      battingRunsXP,
      battingMilestoneXP,
      duckPenaltyXP,
      rawBattingPoints,
      rawTotalXP,
      awardedXP: clampAwardedMatchXP(rawTotalXP, "v2")
    };
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
        performance.runOuts * XP_RULES.runOut +
        (performance.stumpings ?? 0) * XP_RULES.stumping,
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
    xpRuleVersion: "v1",
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
    overQualityXP: maidenXP + expensiveOverPenaltyXP,
    rawPositiveOverQualityPoints: maidenXP,
    rawNegativeOverQualityPoints: expensiveOverPenaltyXP,
    rawBattingPoints: battingRunsXP + battingMilestoneXP + duckPenaltyXP,
    rawBowlingPoints:
      wicketXP + hatTrickXP + maidenXP + expensiveOverPenaltyXP,
    rawFieldingPoints: fieldingXP,
    rawTotalXP,
    awardedXP: clampAwardedMatchXP(rawTotalXP, "v1")
  };
}

export function calculatePrePomPerformanceScore(
  performance: PlayerMatchPerformance,
  context: XPMatchContext = {}
): number {
  const xpRuleVersion = resolveXPRuleVersion(context);
  const breakdown = calculatePlayerMatchXP(
    { ...performance, playerOfMatch: false },
    { ...context, xpRuleVersion }
  );

  return xpRuleVersion === "v2"
    ? breakdown.participationXP +
        breakdown.winBonusXP +
        (breakdown.rawBattingPoints ?? 0) +
        (breakdown.rawBowlingPoints ?? 0) +
        (breakdown.rawFieldingPoints ?? 0)
    : breakdown.awardedXP;
}

export function calculatePrePomSharedPerformanceScore(
  performances: PlayerMatchPerformance[],
  context: XPMatchContext = {}
): number {
  const xpRuleVersion = resolveXPRuleVersion(context);
  const breakdown = calculateSharedPlayerMatchXP(
    performances.map((performance) => ({
      ...performance,
      playerOfMatch: false
    })),
    { ...context, xpRuleVersion }
  );

  return xpRuleVersion === "v2"
    ? breakdown.participationXP +
        (breakdown.rawBattingPoints ?? 0) +
        (breakdown.rawBowlingPoints ?? 0) +
        (breakdown.rawFieldingPoints ?? 0)
    : breakdown.awardedXP;
}

export function calculateMatchXP(
  performance: PlayerMatchPerformance,
  context: XPMatchContext = {}
): number {
  return calculatePlayerMatchXP(performance, context).awardedXP;
}

export function withAuthoritativeXPBreakdowns(match: MatchRecord): MatchRecord {
  if (match.status !== "finalised") return match;

  const allBowlingOvers = [
    ...match.teams.teamA.bowlingOvers,
    ...match.teams.teamB.bowlingOvers
  ];
  const originalTeamPerformances = [
    ...match.teams.teamA.playerPerformances,
    ...match.teams.teamB.playerPerformances
  ];
  const calculateForPerformance = (
    performance: PlayerMatchPerformance
  ): PlayerMatchXPBreakdown =>
    calculatePlayerMatchXP(performance, {
      result: match.result,
      overs: allBowlingOvers.filter(
        (over) => over.bowlerId === performance.playerId
      ),
      matchDate: match.matchDate
    });
  const calculateFinalRecord = (
    record: FinalisedPlayerMatchRecord
  ): FinalisedPlayerMatchRecord => {
    const playerContexts = originalTeamPerformances.filter(
      (performance) => performance.playerId === record.playerId
    );
    const isSharedPlayer =
      match.sharedPlayerId === record.playerId && playerContexts.length > 1;
    const playerOvers = allBowlingOvers.filter(
      (over) => over.bowlerId === record.playerId
    );

    return {
      ...record,
      xpBreakdown: isSharedPlayer
        ? calculateSharedPlayerMatchXP(playerContexts, {
            result: match.result,
            overs: playerOvers,
            matchDate: match.matchDate
          })
        : calculateForPerformance(record)
    };
  };

  return {
    ...match,
    teams: {
      teamA: {
        ...match.teams.teamA,
        playerPerformances: match.teams.teamA.playerPerformances.map(
          (performance) => ({
            ...performance,
            xpBreakdown: calculateForPerformance(performance)
          })
        )
      },
      teamB: {
        ...match.teams.teamB,
        playerPerformances: match.teams.teamB.playerPerformances.map(
          (performance) => ({
            ...performance,
            xpBreakdown: calculateForPerformance(performance)
          })
        )
      }
    },
    finalisedPlayerRecords: (match.finalisedPlayerRecords ?? []).map(
      calculateFinalRecord
    )
  };
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
      batting:
        total.inningsBatted > 0
          ? clampRating(
              0.6 * percentileRank(runsPerInnings, runsPerInnings[index]) +
                0.25 * percentileRank(milestoneIndex, milestoneIndex[index]) +
                0.15 * percentileRank(duckAvoidance, duckAvoidance[index])
            )
          : 0,
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
