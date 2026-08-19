import { calculateRatingStatus, getLevelProgress, type RatingStatus } from "./progression";
import {
  ADVANCED_CRICKET_STAT_RULES,
  deriveAdvancedCareerStatsByPlayer,
  formatEconomy,
  formatStrikeRate,
  type AdvancedCareerStats
} from "./advanced-cricket-stats";
import {
  getFilteredFinalisedMatches,
  isMatchInCurrentMonth,
  isSuccessfullyFinalisedMatch,
  parseLocalMatchDate
} from "./match-eligibility";
import type { MatchRecord, PlayerMatchPerformance } from "./types/match";
import type { Player, RatingKey } from "./types/player";

export type LeaderboardCategory =
  | "runs"
  | "wickets"
  | "catches"
  | "strikeRate"
  | "economy"
  | "sixes"
  | "boundaries"
  | "ducks"
  | "xp"
  | "level";
export type LeaderboardPeriod = "all-time" | "current-month";
export {
  getFilteredFinalisedMatches,
  isMatchInCurrentMonth,
  isSuccessfullyFinalisedMatch,
  parseLocalMatchDate
};

export type LeaderSummary = {
  category: LeaderboardCategory;
  status: "single-leader" | "joint-leaders" | "race-not-started" | "all-tied";
  leaders: PlayerLeaderboardEntry[];
  value: number;
  displayValue: string;
  supportingText: string;
};

export type LeaderboardSupportingStats = {
  matches: number;
  trackedBattingInnings: number;
  highScore: number | null;
  bestBowling: string | null;
  runOuts: number;
  level: number;
  totalXP: number;
  xpToNextLevel: number;
  xpProgressPercentage: number;
  ratingStatus: RatingStatus;
  playerPower: number;
  ballsFaced: number;
  trackedBattingRuns: number;
  fours: number;
  sixes: number;
  boundaries: number;
  strikeRate: number | null;
  legalBallsBowled: number;
  trackedRunsConceded: number;
  economy: number | null;
  ducks: number;
  trackedBowlingMatches: number;
};

export type PlayerLeaderboardEntry = {
  player: Player;
  category: LeaderboardCategory;
  rank: number;
  primaryValue: number;
  displayValue: string;
  mutedZero: boolean;
  supporting: LeaderboardSupportingStats;
  rankable: boolean;
};

export const LEADERBOARD_CATEGORIES = {
  runs: {
    label: "MOST RUNS",
    shortLabel: "RUNS",
    crownTitle: "RUN KINGS",
    accent: "orange",
    icon: "/ui/leaderboard/most-runs.png",
    unit: "RUNS",
    emptyTitle: "RACE NOT STARTED",
    emptyCopy: "Finalise a match with batting records to begin the Run Kings race.",
    quickStatus: "CURRENT RUN KING",
    ratingKey: "batting"
  },
  wickets: {
    label: "MOST WICKETS",
    shortLabel: "WICKETS",
    crownTitle: "WICKET HUNTERS",
    accent: "purple",
    icon: "/ui/leaderboard/most-wickets.png",
    unit: "WICKETS",
    emptyTitle: "RACE NOT STARTED",
    emptyCopy:
      "Finalise a match with bowler-credited wickets to begin the Wicket Hunters race.",
    quickStatus: "CURRENT WICKET HUNTER",
    ratingKey: "bowling"
  },
  catches: {
    label: "MOST CATCHES",
    shortLabel: "CATCHES",
    crownTitle: "SAFE HANDS",
    accent: "green",
    icon: "/ui/leaderboard/most-catches.png",
    unit: "CATCHES",
    emptyTitle: "RACE NOT STARTED",
    emptyCopy: "Finalise a match with catches to begin the Safe Hands race.",
    quickStatus: "CURRENT SAFE HANDS",
    ratingKey: "fielding"
  },
  strikeRate: {
    label: "BEST STRIKE RATE",
    shortLabel: "STRIKE RATE",
    crownTitle: "LIGHTNING BLADES",
    accent: "orange",
    icon: "/ui/leaderboard/best-strike-rate.png",
    unit: "SR",
    emptyTitle: "NOT ENOUGH BALLS FACED",
    emptyCopy: "Players qualify after 20 tracked balls faced.",
    quickStatus: "CURRENT STRIKE RATE STAR",
    ratingKey: "batting"
  },
  economy: {
    label: "BEST ECONOMY",
    shortLabel: "ECONOMY",
    crownTitle: "RUN-SAVING WIZARDS",
    accent: "purple",
    icon: "/ui/leaderboard/best-economy.png",
    unit: "ECO",
    emptyTitle: "NOT ENOUGH OVERS BOWLED",
    emptyCopy: "Players qualify after 18 legal balls bowled.",
    quickStatus: "CURRENT ECONOMY ACE",
    ratingKey: "bowling"
  },
  sixes: {
    label: "SIX MACHINE",
    shortLabel: "SIXES",
    crownTitle: "SIX MACHINE",
    accent: "orange",
    icon: "/ui/leaderboard/six-machine.png",
    unit: "SIXES",
    emptyTitle: "NO ROCKETS LAUNCHED",
    emptyCopy: "Finalise an event-backed six to fire up the Six Machine race.",
    quickStatus: "CURRENT SIX MACHINE",
    ratingKey: "batting"
  },
  boundaries: {
    label: "BOUNDARY BANDIT",
    shortLabel: "BOUNDARIES",
    crownTitle: "BOUNDARY BANDITS",
    accent: "cyan",
    icon: "/ui/leaderboard/boundary-bandit.png",
    unit: "BOUNDARIES",
    emptyTitle: "BOUNDARY LINE QUIET",
    emptyCopy: "Finalise event-backed fours or sixes to begin the Boundary Bandit race.",
    quickStatus: "CURRENT BOUNDARY BANDIT",
    ratingKey: "batting"
  },
  ducks: {
    label: "DUCK COLLECTOR",
    shortLabel: "DUCKS",
    crownTitle: "THE DUCK POND",
    accent: "gold",
    icon: "/ui/leaderboard/duck-collector.png",
    unit: "DUCKS",
    emptyTitle: "THE POND IS EMPTY",
    emptyCopy: "No one has joined the Golden Zero Club yet.",
    quickStatus: "DUCK POND LEADER",
    ratingKey: "batting"
  },
  xp: {
    label: "HIGHEST XP",
    shortLabel: "XP",
    crownTitle: "XP WARRIORS",
    accent: "cyan",
    icon: "/ui/leaderboard/highest-xp.png",
    unit: "XP",
    emptyTitle: "RACE NOT STARTED",
    emptyCopy: "Finalise the first match to begin the XP Warriors race.",
    quickStatus: "CURRENT XP WARRIOR",
    ratingKey: "batting"
  },
  level: {
    label: "HIGHEST LEVEL",
    shortLabel: "LEVEL",
    crownTitle: "LEVEL LEGENDS",
    accent: "gold",
    icon: "/ui/leaderboard/highest-level.png",
    unit: "LEVEL",
    emptyTitle: "ALL PLAYERS TIED",
    emptyCopy: "Every warrior currently stands together at Level 0.",
    quickStatus: "CURRENT LEVEL LEGEND",
    ratingKey: "batting"
  }
} as const satisfies Record<
  LeaderboardCategory,
  {
    label: string;
    shortLabel: string;
    crownTitle: string;
    accent: "orange" | "purple" | "green" | "cyan" | "gold";
    icon: string;
    unit: string;
    emptyTitle: string;
    emptyCopy: string;
    quickStatus: string;
    ratingKey: RatingKey;
  }
>;

type PeriodTotals = {
  matches: number;
  runs: number;
  wickets: number;
  catches: number;
  runOuts: number;
  xp: number;
  highScore: number | null;
  bestBowling: string | null;
  ducks: number;
};

function numericRuns(value: number | "") {
  return value === "" ? 0 : Number(value) || 0;
}

function getPerformanceRecords(match: MatchRecord): PlayerMatchPerformance[] {
  return (
    match.finalisedPlayerRecords ??
    [
      ...match.teams.teamA.playerPerformances,
      ...match.teams.teamB.playerPerformances
    ]
  );
}

function getPlayerBowlingRuns(match: MatchRecord, playerId: string) {
  return [
    ...match.teams.teamA.bowlingOvers,
    ...match.teams.teamB.bowlingOvers
  ].reduce(
    (total, over) =>
      over.bowlerId === playerId ? total + (Number(over.runsConceded) || 0) : total,
    0
  );
}

function getStoredAwardedXP(performance: PlayerMatchPerformance) {
  if (!("xpBreakdown" in performance)) return 0;

  const xpBreakdown = performance.xpBreakdown;

  if (
    typeof xpBreakdown !== "object" ||
    xpBreakdown === null ||
    !("awardedXP" in xpBreakdown)
  ) {
    return 0;
  }

  const awardedXP = Number(xpBreakdown.awardedXP);

  return Number.isFinite(awardedXP) ? awardedXP : 0;
}

function formatBestBowling(wickets: number, runsConceded: number) {
  return wickets > 0 ? `${wickets}/${runsConceded}` : null;
}

function isBetterBowling(current: string | null, next: string | null) {
  if (!next) return false;
  if (!current) return true;

  const [currentWickets, currentRuns] = current.split("/").map(Number);
  const [nextWickets, nextRuns] = next.split("/").map(Number);

  if (nextWickets !== currentWickets) return nextWickets > currentWickets;

  return nextRuns < currentRuns;
}

function createEmptyPeriodTotals(): PeriodTotals {
  return {
    matches: 0,
    runs: 0,
    wickets: 0,
    catches: 0,
    runOuts: 0,
    xp: 0,
    highScore: null,
    bestBowling: null,
    ducks: 0
  };
}

export function getPeriodTotalsByPlayer(matches: MatchRecord[]) {
  const totalsByPlayer = new Map<string, PeriodTotals>();

  for (const match of matches) {
    for (const performance of getPerformanceRecords(match)) {
      if (!performance.played) continue;

      const current = totalsByPlayer.get(performance.playerId) ?? createEmptyPeriodTotals();
      const runs = performance.didBat ? numericRuns(performance.runs) : 0;
      const matchBowling = formatBestBowling(
        performance.wickets,
        getPlayerBowlingRuns(match, performance.playerId)
      );

      totalsByPlayer.set(performance.playerId, {
        matches: current.matches + 1,
        runs: current.runs + runs,
        wickets: current.wickets + performance.wickets,
        catches: current.catches + performance.catches,
        runOuts: current.runOuts + performance.runOuts,
        xp: current.xp + getStoredAwardedXP(performance),
        ducks:
          current.ducks +
          (performance.didBat && performance.wasOut && runs === 0 ? 1 : 0),
        highScore: Math.max(current.highScore ?? 0, runs) || current.highScore,
        bestBowling: isBetterBowling(current.bestBowling, matchBowling)
          ? matchBowling
          : current.bestBowling
      });
    }
  }

  return totalsByPlayer;
}

function getPrimaryValue({
  advancedStats,
  category,
  period,
  player,
  periodTotals
}: {
  advancedStats: AdvancedCareerStats;
  category: LeaderboardCategory;
  period: LeaderboardPeriod;
  player: Player;
  periodTotals: PeriodTotals;
}) {
  if (category === "strikeRate") return advancedStats.strikeRate ?? 0;
  if (category === "economy") return advancedStats.economy ?? 0;
  if (category === "sixes") return advancedStats.sixes;
  if (category === "boundaries") return advancedStats.boundaries;
  if (category === "ducks") return advancedStats.ducks;

  if (period === "all-time") {
    if (category === "runs") return player.stats.runs;
    if (category === "wickets") return player.stats.wickets;
    if (category === "catches") return player.stats.catches;
    if (category === "xp") return player.xp;
    return player.level;
  }

  if (category === "runs") return periodTotals.runs;
  if (category === "wickets") return periodTotals.wickets;
  if (category === "catches") return periodTotals.catches;
  if (category === "xp") return periodTotals.xp;

  return player.level;
}

export function formatLeaderboardValue(
  category: LeaderboardCategory,
  value: number
): string {
  if (category === "level") return `LEVEL ${value}`;
  if (category === "strikeRate") return `${formatStrikeRate(value)} SR`;
  if (category === "economy") return `${formatEconomy(value)} ECO`;
  if (category === "sixes") return `${value} ${value === 1 ? "SIX" : "SIXES"}`;
  if (category === "boundaries") {
    return `${value} ${value === 1 ? "BOUNDARY" : "BOUNDARIES"}`;
  }
  if (category === "ducks") return `${value} ${value === 1 ? "DUCK" : "DUCKS"}`;

  return `${value} ${LEADERBOARD_CATEGORIES[category].unit}`;
}

function hasSameCompetitionPosition(
  left: PlayerLeaderboardEntry,
  right: PlayerLeaderboardEntry
) {
  if (left.primaryValue !== right.primaryValue) return false;

  if (left.category === "catches" && right.category === "catches") {
    return left.supporting.runOuts === right.supporting.runOuts;
  }

  return true;
}

function getPlayerPowerValue(player: Player, category: LeaderboardCategory) {
  const ratingKey = LEADERBOARD_CATEGORIES[category].ratingKey;

  return player.ratings[ratingKey];
}

export function getCompetitionRankings(entries: PlayerLeaderboardEntry[]) {
  let previousEntry: PlayerLeaderboardEntry | null = null;
  let previousRank = 0;
  let rankedCount = 0;

  return entries.map((entry) => {
    if (!entry.rankable) return { ...entry, rank: 0 };

    rankedCount += 1;
    const rank =
      previousEntry !== null && hasSameCompetitionPosition(entry, previousEntry)
        ? previousRank
        : rankedCount;

    previousEntry = entry;
    previousRank = rank;

    return { ...entry, rank };
  });
}

function getEmptyAdvancedStats(playerId: string): AdvancedCareerStats {
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

function isEntryRankable({
  advancedStats,
  category,
  primaryValue
}: {
  advancedStats: AdvancedCareerStats;
  category: LeaderboardCategory;
  primaryValue: number;
}) {
  if (category === "level") return true;
  if (category === "strikeRate") {
    return (
      advancedStats.ballsFaced >=
      ADVANCED_CRICKET_STAT_RULES.minimumBallsFacedForStrikeRate
    );
  }
  if (category === "economy") {
    return (
      advancedStats.legalBallsBowled >=
      ADVANCED_CRICKET_STAT_RULES.minimumLegalBallsForEconomy
    );
  }
  if (category === "sixes") return advancedStats.sixes > 0;
  if (category === "boundaries") return advancedStats.boundaries > 0;

  return primaryValue > 0;
}

export function getLeaderboardEntries({
  players,
  matches,
  category,
  period,
  now = new Date()
}: {
  players: Player[];
  matches: MatchRecord[];
  category: LeaderboardCategory;
  period: LeaderboardPeriod;
  now?: Date;
}): PlayerLeaderboardEntry[] {
  const filteredMatches = getFilteredFinalisedMatches({ matches, period, now });
  const allTimeMatchTotals = getPeriodTotalsByPlayer(
    getFilteredFinalisedMatches({ matches, period: "all-time", now })
  );
  const periodTotalsByPlayer = getPeriodTotalsByPlayer(filteredMatches);
  const advancedStatsByPlayer = deriveAdvancedCareerStatsByPlayer({
    matches,
    period,
    now
  });
  const allTimeAdvancedStatsByPlayer = deriveAdvancedCareerStatsByPlayer({
    matches,
    period: "all-time",
    now
  });
  const entries = players.map((player) => {
    const periodTotals = periodTotalsByPlayer.get(player.id) ?? createEmptyPeriodTotals();
    const allTimeTotals = allTimeMatchTotals.get(player.id) ?? createEmptyPeriodTotals();
    const advancedStats =
      advancedStatsByPlayer.get(player.id) ?? getEmptyAdvancedStats(player.id);
    const allTimeAdvancedStats =
      allTimeAdvancedStatsByPlayer.get(player.id) ?? getEmptyAdvancedStats(player.id);
    const primaryValue = getPrimaryValue({
      advancedStats,
      category,
      period,
      player,
      periodTotals
    });
    const levelProgress = getLevelProgress(player.xp);
    const rankable = isEntryRankable({ advancedStats, category, primaryValue });
    const supporting: LeaderboardSupportingStats = {
      matches: period === "all-time" ? player.stats.matches : periodTotals.matches,
      trackedBattingInnings: advancedStats.trackedBattingInnings,
      highScore:
        period === "all-time" ? allTimeTotals.highScore : periodTotals.highScore,
      bestBowling:
        period === "all-time" ? allTimeTotals.bestBowling : periodTotals.bestBowling,
      runOuts: period === "all-time" ? player.stats.runOuts : periodTotals.runOuts,
      level: player.level,
      totalXP: period === "all-time" ? player.xp : periodTotals.xp,
      xpToNextLevel: levelProgress.xpRequiredWithinLevel - levelProgress.xpWithinLevel,
      xpProgressPercentage: levelProgress.progressPercentage,
      ratingStatus: calculateRatingStatus(player.stats.matches),
      playerPower: getPlayerPowerValue(player, category),
      ballsFaced: advancedStats.ballsFaced,
      trackedBattingRuns: advancedStats.trackedBattingRuns,
      fours: advancedStats.fours,
      sixes: advancedStats.sixes,
      boundaries: advancedStats.boundaries,
      strikeRate: advancedStats.strikeRate,
      legalBallsBowled: advancedStats.legalBallsBowled,
      trackedRunsConceded: advancedStats.trackedRunsConceded,
      economy: advancedStats.economy,
      ducks:
        period === "all-time" ? allTimeAdvancedStats.ducks : advancedStats.ducks,
      trackedBowlingMatches: advancedStats.trackedBowlingMatches
    };

    return {
      player,
      category,
      rank: 0,
      primaryValue,
      displayValue: formatLeaderboardValue(category, primaryValue),
      mutedZero: !rankable,
      supporting,
      rankable
    };
  });
  const sortedEntries = entries.sort((left, right) => {
    if (left.rankable !== right.rankable) return left.rankable ? -1 : 1;

    if (category === "economy" && left.rankable && right.rankable) {
      if (left.primaryValue !== right.primaryValue) {
        return left.primaryValue - right.primaryValue;
      }
    } else if (right.primaryValue !== left.primaryValue) {
      return right.primaryValue - left.primaryValue;
    }

    if (category === "catches" && left.supporting.runOuts !== right.supporting.runOuts) {
      return right.supporting.runOuts - left.supporting.runOuts;
    }

    return left.player.name.localeCompare(right.player.name);
  });

  return getCompetitionRankings(sortedEntries);
}

export function getLeaderboardSummary({
  entries,
  category
}: {
  entries: PlayerLeaderboardEntry[];
  category: LeaderboardCategory;
}): LeaderSummary {
  const rankedEntries = entries.filter((entry) => entry.rankable);
  const leadingEntry = rankedEntries[0];
  const bestValue = leadingEntry?.primaryValue ?? 0;
  const leaders = leadingEntry
    ? rankedEntries.filter((entry) => hasSameCompetitionPosition(entry, leadingEntry))
    : [];

  if (category === "level" && leaders.length === entries.length) {
    return {
      category,
      status: "all-tied",
      leaders,
      value: bestValue,
      displayValue: formatLeaderboardValue(category, bestValue),
      supportingText: `ALL PLAYERS TIED AT ${formatLeaderboardValue(category, bestValue)}`
    };
  }

  if (leaders.length === 0) {
    return {
      category,
      status: "race-not-started",
      leaders: [],
      value: 0,
      displayValue: formatLeaderboardValue(category, 0),
      supportingText: LEADERBOARD_CATEGORIES[category].emptyCopy
    };
  }

  return {
    category,
    status: leaders.length > 1 ? "joint-leaders" : "single-leader",
    leaders,
    value: bestValue,
    displayValue:
      leaders.length > 1 && category !== "level"
        ? category === "strikeRate" || category === "economy"
          ? `${formatLeaderboardValue(category, bestValue)} EACH`
          : `${bestValue} EACH`
        : formatLeaderboardValue(category, bestValue),
    supportingText:
      leaders.length > 1 ? "JOINT LEADERS" : LEADERBOARD_CATEGORIES[category].quickStatus
  };
}

export function getLeaderboardPodium(entries: PlayerLeaderboardEntry[]) {
  return entries.filter((entry) => entry.rankable && entry.rank > 0 && entry.rank <= 3);
}

export type LeaderboardPodiumRankGroup = {
  rank: number;
  entries: PlayerLeaderboardEntry[];
};

export function groupLeaderboardPodiumEntries(
  entries: PlayerLeaderboardEntry[]
): LeaderboardPodiumRankGroup[] {
  return getLeaderboardPodium(entries).reduce<LeaderboardPodiumRankGroup[]>(
    (groups, entry) => {
      const existingGroup = groups.find((group) => group.rank === entry.rank);

      if (existingGroup) {
        existingGroup.entries.push(entry);
      } else {
        groups.push({
          rank: entry.rank,
          entries: [entry]
        });
      }

      return groups;
    },
    []
  );
}

export function hasAnyFinalisedLeaderboardData(players: Player[], matches: MatchRecord[]) {
  return (
    getFilteredFinalisedMatches({ matches, period: "all-time" }).length > 0 ||
    players.some((player) => player.stats.matches > 0)
  );
}
