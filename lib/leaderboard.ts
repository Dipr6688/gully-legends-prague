import { calculateRatingStatus, getLevelProgress, type RatingStatus } from "./progression";
import type { MatchRecord, MatchStatus, PlayerMatchPerformance } from "./types/match";
import type { Player, RatingKey } from "./types/player";

export type LeaderboardCategory = "runs" | "wickets" | "catches" | "xp" | "level";
export type LeaderboardPeriod = "all-time" | "current-month";

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
  highScore: number | null;
  bestBowling: string | null;
  runOuts: number;
  level: number;
  totalXP: number;
  xpToNextLevel: number;
  xpProgressPercentage: number;
  ratingStatus: RatingStatus;
  playerPower: number;
};

export type PlayerLeaderboardEntry = {
  player: Player;
  category: LeaderboardCategory;
  rank: number;
  primaryValue: number;
  displayValue: string;
  mutedZero: boolean;
  supporting: LeaderboardSupportingStats;
};

type StoredMatchStatus = MatchStatus | "FINALIZED" | "FINALIZED_MATCH";

export const LEADERBOARD_CATEGORIES = {
  runs: {
    label: "MOST RUNS",
    shortLabel: "RUNS",
    crownTitle: "RUN KINGS",
    accent: "orange",
    icon: "/ui/most-runs-bat.png",
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
    icon: "/ui/most-wickets-wicket-smash.png",
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
    icon: "/ui/most-catches-gloves-ball.png",
    unit: "CATCHES",
    emptyTitle: "RACE NOT STARTED",
    emptyCopy: "Finalise a match with catches to begin the Safe Hands race.",
    quickStatus: "CURRENT SAFE HANDS",
    ratingKey: "fielding"
  },
  xp: {
    label: "HIGHEST XP",
    shortLabel: "XP",
    crownTitle: "XP WARRIORS",
    accent: "cyan",
    icon: "/ui/create-match-button.png",
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
    icon: "/ui/view-all-leaderboard-trophy.png",
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
};

export function parseLocalMatchDate(value: string): Date | null {
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (isoMatch) {
    const [, year, month, day] = isoMatch;

    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const displayMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);

  if (displayMatch) {
    const [, day, month, year] = displayMatch;

    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  return null;
}

export function isSuccessfullyFinalisedMatch(match: MatchRecord): boolean {
  const normalisedStatus = String(match.status as StoredMatchStatus).toLowerCase();
  const isFinalised =
    normalisedStatus === "finalised" ||
    normalisedStatus === "finalized" ||
    normalisedStatus === "finalized_match";

  return isFinalised && match.result.type !== "no_result";
}

export function isMatchInCurrentMonth(match: MatchRecord, now = new Date()): boolean {
  const matchDate = parseLocalMatchDate(match.matchDate);

  if (!matchDate) return false;

  const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return matchDate >= startOfCurrentMonth && matchDate < startOfNextMonth;
}

export function getFilteredFinalisedMatches({
  matches,
  period,
  now = new Date()
}: {
  matches: MatchRecord[];
  period: LeaderboardPeriod;
  now?: Date;
}) {
  return matches
    .filter(isSuccessfullyFinalisedMatch)
    .filter((match) =>
      period === "current-month" ? isMatchInCurrentMonth(match, now) : true
    );
}

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
    bestBowling: null
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
  category,
  period,
  player,
  periodTotals
}: {
  category: LeaderboardCategory;
  period: LeaderboardPeriod;
  player: Player;
  periodTotals: PeriodTotals;
}) {
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

  return `${value} ${LEADERBOARD_CATEGORIES[category].unit}`;
}

function getPlayerPowerValue(player: Player, category: LeaderboardCategory) {
  const ratingKey = LEADERBOARD_CATEGORIES[category].ratingKey;

  return player.ratings[ratingKey];
}

export function getCompetitionRankings(entries: PlayerLeaderboardEntry[]) {
  let previousValue: number | null = null;
  let previousRank = 0;

  return entries.map((entry, index) => {
    const rank =
      previousValue !== null && entry.primaryValue === previousValue
        ? previousRank
        : index + 1;

    previousValue = entry.primaryValue;
    previousRank = rank;

    return { ...entry, rank };
  });
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
  const entries = players.map((player) => {
    const periodTotals = periodTotalsByPlayer.get(player.id) ?? createEmptyPeriodTotals();
    const allTimeTotals = allTimeMatchTotals.get(player.id) ?? createEmptyPeriodTotals();
    const primaryValue = getPrimaryValue({ category, period, player, periodTotals });
    const levelProgress = getLevelProgress(player.xp);
    const supporting: LeaderboardSupportingStats = {
      matches: period === "all-time" ? player.stats.matches : periodTotals.matches,
      highScore:
        period === "all-time" ? allTimeTotals.highScore : periodTotals.highScore,
      bestBowling:
        period === "all-time" ? allTimeTotals.bestBowling : periodTotals.bestBowling,
      runOuts: period === "all-time" ? allTimeTotals.runOuts : periodTotals.runOuts,
      level: player.level,
      totalXP: period === "all-time" ? player.xp : periodTotals.xp,
      xpToNextLevel: levelProgress.xpRequiredWithinLevel - levelProgress.xpWithinLevel,
      xpProgressPercentage: levelProgress.progressPercentage,
      ratingStatus: calculateRatingStatus(player.stats.matches),
      playerPower: getPlayerPowerValue(player, category)
    };

    return {
      player,
      category,
      rank: 0,
      primaryValue,
      displayValue: formatLeaderboardValue(category, primaryValue),
      mutedZero: primaryValue === 0,
      supporting
    };
  });
  const sortedEntries = entries.sort((left, right) => {
    if (right.primaryValue !== left.primaryValue) {
      return right.primaryValue - left.primaryValue;
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
  const highestValue = entries[0]?.primaryValue ?? 0;
  const leaders = entries.filter((entry) => entry.primaryValue === highestValue);

  if (category === "level" && leaders.length === entries.length) {
    return {
      category,
      status: "all-tied",
      leaders,
      value: highestValue,
      displayValue: formatLeaderboardValue(category, highestValue),
      supportingText: `ALL PLAYERS TIED AT ${formatLeaderboardValue(category, highestValue)}`
    };
  }

  if (highestValue === 0) {
    return {
      category,
      status: "race-not-started",
      leaders: [],
      value: 0,
      displayValue: formatLeaderboardValue(category, 0),
      supportingText:
        category === "level"
          ? "ALL PLAYERS TIED"
          : `NO ${LEADERBOARD_CATEGORIES[category].unit} RECORDED YET`
    };
  }

  return {
    category,
    status: leaders.length > 1 ? "joint-leaders" : "single-leader",
    leaders,
    value: highestValue,
    displayValue:
      leaders.length > 1 && category !== "level"
        ? `${highestValue} EACH`
        : formatLeaderboardValue(category, highestValue),
    supportingText:
      leaders.length > 1 ? "JOINT LEADERS" : LEADERBOARD_CATEGORIES[category].quickStatus
  };
}

export function getLeaderboardPodium(entries: PlayerLeaderboardEntry[]) {
  return entries.filter((entry) => entry.primaryValue > 0).slice(0, 3);
}

export function hasAnyFinalisedLeaderboardData(players: Player[], matches: MatchRecord[]) {
  return (
    getFilteredFinalisedMatches({ matches, period: "all-time" }).length > 0 ||
    players.some((player) => player.stats.matches > 0)
  );
}
