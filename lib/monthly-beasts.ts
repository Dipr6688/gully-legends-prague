import { calculatePlayerMatchXP, XP_RULES } from "./progression";
import {
  isSuccessfullyFinalisedMatch,
  parseLocalMatchDate
} from "./leaderboard";
import type {
  BowlingOver,
  FinalisedPlayerMatchRecord,
  MatchRecord,
  PlayerMatchPerformance,
  PlayerMatchXPBreakdown
} from "./types/match";

export type MonthlyBeastCategory = "batting" | "bowling" | "fielding";

export type CrownedBeastWinner = {
  playerId: string;
  categoryXp: number;
};

export type CrownedMonthlyBeasts = {
  monthKey: string;
  crownedAt: string;
  battingWinners: CrownedBeastWinner[];
  bowlingWinners: CrownedBeastWinner[];
  fieldingWinners: CrownedBeastWinner[];
};

export type MonthlyBeastStanding = {
  rank: number;
  playerId: string;
  categoryXp: number;
  matchesPlayed: number;
  isJointLeader: boolean;
};

export type MonthlyBeastSummary = {
  category: MonthlyBeastCategory;
  monthKey: string;
  status: "race-not-started" | "single-leader" | "joint-leaders";
  leaders: MonthlyBeastStanding[];
  standings: MonthlyBeastStanding[];
  topThree: MonthlyBeastStanding[];
  highestXp: number;
};

export type MonthlyBeastDashboardPreview = {
  category: MonthlyBeastCategory;
  title: string;
  primaryText: string;
  supportingText: string;
  isCrowned: boolean;
};

export const MONTHLY_BEAST_CATEGORIES = {
  batting: {
    title: "BATTING BEAST",
    compactTitle: "Batting Beast",
    xpLabel: "BATTING XP",
    icon: "/ui/monthly-beasts/monthly-batting-beast-trimmed.png",
    accent: "orange",
    emptyTitle: "THE BATTING ARENA AWAITS",
    emptyCopy: "Finalise a match with batting records to begin the Batting Beast race."
  },
  bowling: {
    title: "BOWLING BEAST",
    compactTitle: "Bowling Beast",
    xpLabel: "BOWLING XP",
    icon: "/ui/monthly-beasts/monthly-bowling-beast-trimmed.png",
    accent: "purple",
    emptyTitle: "THE BOWLING ARENA AWAITS",
    emptyCopy: "Finalise a match with bowling records to begin the Bowling Beast race."
  },
  fielding: {
    title: "FIELDING BEAST",
    compactTitle: "Fielding Beast",
    xpLabel: "FIELDING XP",
    icon: "/ui/monthly-beasts/monthly-catching-beast-trimmed.png",
    accent: "green",
    emptyTitle: "THE FIELDING ARENA AWAITS",
    emptyCopy:
      "Record a catch or run-out in a finalised match to begin the Fielding Beast race."
  }
} as const satisfies Record<
  MonthlyBeastCategory,
  {
    title: string;
    compactTitle: string;
    xpLabel: string;
    icon: string;
    accent: "orange" | "purple" | "green";
    emptyTitle: string;
    emptyCopy: string;
  }
>;

const categories = Object.keys(MONTHLY_BEAST_CATEGORIES) as MonthlyBeastCategory[];

function getPerformanceRecords(match: MatchRecord): PlayerMatchPerformance[] {
  return (
    match.finalisedPlayerRecords ??
    [
      ...match.teams.teamA.playerPerformances,
      ...match.teams.teamB.playerPerformances
    ]
  );
}

function getPlayerOvers(match: MatchRecord, playerId: string): BowlingOver[] {
  return [
    ...match.teams.teamA.bowlingOvers,
    ...match.teams.teamB.bowlingOvers
  ].filter((over) => over.bowlerId === playerId);
}

function hasStoredBreakdown(
  performance: PlayerMatchPerformance
): performance is FinalisedPlayerMatchRecord {
  return (
    "xpBreakdown" in performance &&
    typeof performance.xpBreakdown === "object" &&
    performance.xpBreakdown !== null
  );
}

function getXpBreakdown(
  match: MatchRecord,
  performance: PlayerMatchPerformance
): PlayerMatchXPBreakdown {
  if (hasStoredBreakdown(performance)) {
    return performance.xpBreakdown;
  }

  return calculatePlayerMatchXP(performance, {
    result: match.result,
    overs: getPlayerOvers(match, performance.playerId)
  });
}

export function getCurrentMonthKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function isValidMonthKey(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));
}

export function parseMonthKey(monthKey: string): Date {
  const [year, month] = monthKey.split("-").map(Number);

  return new Date(year, month - 1, 1);
}

export function formatMonthLabel(monthKey: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric"
  })
    .format(parseMonthKey(monthKey))
    .toUpperCase();
}

export function addMonthsToMonthKey(monthKey: string, amount: number): string {
  const date = parseMonthKey(monthKey);
  date.setMonth(date.getMonth() + amount);

  return getCurrentMonthKey(date);
}

export function isFutureMonthKey(monthKey: string, now = new Date()): boolean {
  return parseMonthKey(monthKey) > parseMonthKey(getCurrentMonthKey(now));
}

export function getFinalisedMatchesForMonth({
  matches,
  monthKey
}: {
  matches: MatchRecord[];
  monthKey: string;
}): MatchRecord[] {
  return matches.filter((match) => {
    if (!isSuccessfullyFinalisedMatch(match)) return false;

    const matchDate = parseLocalMatchDate(match.matchDate);
    if (!matchDate) return false;

    return getCurrentMonthKey(matchDate) === monthKey;
  });
}

export function getMonthlyBeastCategoryXp({
  match,
  performance,
  category
}: {
  match: MatchRecord;
  performance: PlayerMatchPerformance;
  category: MonthlyBeastCategory;
}): number {
  if (!performance.played || match.result.type === "no_result") return 0;

  const breakdown = getXpBreakdown(match, performance);

  if (category === "batting") {
    return (
      breakdown.battingRunsXP +
      breakdown.battingMilestoneXP +
      breakdown.duckPenaltyXP
    );
  }

  if (category === "bowling") {
    return (
      breakdown.wicketXP +
      breakdown.hatTrickXP +
      breakdown.maidenXP +
      breakdown.expensiveOverPenaltyXP
    );
  }

  return Math.min(
    performance.catches * XP_RULES.catch + performance.runOuts * XP_RULES.runOut,
    XP_RULES.fieldingCap
  );
}

function getCompetitionRankedStandings(
  standings: Omit<MonthlyBeastStanding, "rank" | "isJointLeader">[]
): MonthlyBeastStanding[] {
  let previousXp: number | null = null;
  let previousRank = 0;
  const highestXp = standings[0]?.categoryXp ?? 0;
  const leaderCount = standings.filter((standing) => standing.categoryXp === highestXp)
    .length;

  return standings.map((standing, index) => {
    const rank =
      previousXp !== null && standing.categoryXp === previousXp
        ? previousRank
        : index + 1;

    previousXp = standing.categoryXp;
    previousRank = rank;

    return {
      ...standing,
      rank,
      isJointLeader: rank === 1 && leaderCount > 1
    };
  });
}

export function getMonthlyBeastStandings({
  matches,
  monthKey,
  category
}: {
  matches: MatchRecord[];
  monthKey: string;
  category: MonthlyBeastCategory;
}): MonthlyBeastStanding[] {
  const totalsByPlayer = new Map<string, { categoryXp: number; matchesPlayed: number }>();

  for (const match of getFinalisedMatchesForMonth({ matches, monthKey })) {
    for (const performance of getPerformanceRecords(match)) {
      if (!performance.played) continue;

      const categoryXp = getMonthlyBeastCategoryXp({ match, performance, category });
      const current = totalsByPlayer.get(performance.playerId) ?? {
        categoryXp: 0,
        matchesPlayed: 0
      };

      totalsByPlayer.set(performance.playerId, {
        categoryXp: current.categoryXp + categoryXp,
        matchesPlayed: current.matchesPlayed + 1
      });
    }
  }

  const standings = [...totalsByPlayer.entries()]
    .map(([playerId, totals]) => ({ playerId, ...totals }))
    .filter((standing) => standing.categoryXp > 0)
    .sort((left, right) => {
      if (right.categoryXp !== left.categoryXp) {
        return right.categoryXp - left.categoryXp;
      }

      return left.playerId.localeCompare(right.playerId);
    });

  return getCompetitionRankedStandings(standings);
}

export function getMonthlyBeastSummary({
  matches,
  monthKey,
  category
}: {
  matches: MatchRecord[];
  monthKey: string;
  category: MonthlyBeastCategory;
}): MonthlyBeastSummary {
  const standings = getMonthlyBeastStandings({ matches, monthKey, category });
  const highestXp = standings[0]?.categoryXp ?? 0;
  const leaders = standings.filter((standing) => standing.rank === 1);

  return {
    category,
    monthKey,
    status:
      leaders.length === 0
        ? "race-not-started"
        : leaders.length > 1
          ? "joint-leaders"
          : "single-leader",
    leaders,
    standings,
    topThree: standings.filter((standing) => standing.rank <= 3),
    highestXp
  };
}

export function createCrownedMonthlyBeasts({
  matches,
  monthKey,
  crownedAt = new Date().toISOString()
}: {
  matches: MatchRecord[];
  monthKey: string;
  crownedAt?: string;
}): CrownedMonthlyBeasts {
  const winnersFor = (category: MonthlyBeastCategory): CrownedBeastWinner[] =>
    getMonthlyBeastSummary({ matches, monthKey, category }).leaders.map((leader) => ({
      playerId: leader.playerId,
      categoryXp: leader.categoryXp
    }));

  return {
    monthKey,
    crownedAt,
    battingWinners: winnersFor("batting"),
    bowlingWinners: winnersFor("bowling"),
    fieldingWinners: winnersFor("fielding")
  };
}

export function getCrownedMonthlyBeasts({
  crownedAwards,
  monthKey
}: {
  crownedAwards: CrownedMonthlyBeasts[];
  monthKey: string;
}): CrownedMonthlyBeasts | null {
  return crownedAwards.find((award) => award.monthKey === monthKey) ?? null;
}

export function getWinnersForCategory(
  crownedAward: CrownedMonthlyBeasts,
  category: MonthlyBeastCategory
): CrownedBeastWinner[] {
  if (category === "batting") return crownedAward.battingWinners;
  if (category === "bowling") return crownedAward.bowlingWinners;

  return crownedAward.fieldingWinners;
}

export function getMonthlyBeastDashboardPreview({
  matches,
  crownedAwards,
  monthKey,
  playerNames
}: {
  matches: MatchRecord[];
  crownedAwards: CrownedMonthlyBeasts[];
  monthKey: string;
  playerNames: Record<string, string>;
}): MonthlyBeastDashboardPreview[] {
  const crownedAward = getCrownedMonthlyBeasts({ crownedAwards, monthKey });

  return categories.map((category) => {
    const title = MONTHLY_BEAST_CATEGORIES[category].compactTitle;

    if (crownedAward) {
      const winners = getWinnersForCategory(crownedAward, category);

      if (winners.length === 0) {
        return {
          category,
          title,
          primaryText: "Race not started",
          supportingText: "No crowned race",
          isCrowned: true
        };
      }

      return {
        category,
        title,
        primaryText:
          winners.length > 1
            ? "JOINT WINNERS"
            : (playerNames[winners[0].playerId] ?? winners[0].playerId),
        supportingText:
          winners.length > 1
            ? winners
                .map((winner) => playerNames[winner.playerId] ?? winner.playerId)
                .join(" & ")
            : `${formatMonthLabel(monthKey).split(" ")[0]} winner`,
        isCrowned: true
      };
    }

    const summary = getMonthlyBeastSummary({ matches, monthKey, category });

    if (summary.status === "race-not-started") {
      return {
        category,
        title,
        primaryText: "Race not started",
        supportingText: "",
        isCrowned: false
      };
    }

    return {
      category,
      title,
      primaryText:
        summary.status === "joint-leaders"
          ? "JOINT LEADERS"
          : (playerNames[summary.leaders[0].playerId] ?? summary.leaders[0].playerId),
      supportingText:
        summary.status === "joint-leaders"
          ? summary.leaders
              .map((leader) => playerNames[leader.playerId] ?? leader.playerId)
              .join(" & ")
          : "Leading the race",
      isCrowned: false
    };
  });
}
