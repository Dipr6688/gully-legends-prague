import { deriveAdvancedMatchStats } from "./advanced-cricket-stats";
import {
  getPostMatchCelebrationBaselineMatches,
  isBeforeCelebrationMatch,
  isOfficialCelebrationMatch
} from "./post-match-celebration";
import { sanitizeRuns } from "./match-records";
import type { PlayerCareerStats } from "./career-store";
import type { FinalisedPlayerMatchRecord, MatchRecord, TeamId } from "./types/match";
import type { Player } from "./types/player";

export type AchievementCategory =
  | "matches"
  | "batting"
  | "bowling"
  | "fielding"
  | "pom";

export type AchievementType = "career_milestone" | "special_achievement";

export type AchievementTier = "bronze" | "silver" | "gold" | "platinum" | "legend";

export type AchievementMetric =
  | "matches"
  | "runs"
  | "wickets"
  | "catches"
  | "runOuts"
  | "stumpings"
  | "sixes"
  | "pomAwards"
  | "singleInningsRuns"
  | "hatTricks"
  | "matchWickets";

export type AchievementIconKey =
  | "matches"
  | "runs"
  | "wickets"
  | "catches"
  | "run-outs"
  | "stumpings"
  | "sixes"
  | "pom"
  | "half-century"
  | "century"
  | "hat-trick"
  | "three-wicket-match"
  | "five-wicket-match";

export type AchievementDefinition = {
  id: string;
  category: AchievementCategory;
  type: AchievementType;
  metric: AchievementMetric;
  title: string;
  description: string;
  threshold: number;
  tier?: AchievementTier;
  iconKey: AchievementIconKey;
};

export type AchievementUnlock = {
  definition: AchievementDefinition;
  playerId: string;
  matchId?: string;
  matchDate?: string;
  matchNumber?: number | null;
  value: number;
};

export type CareerMilestoneProgress = {
  definition: AchievementDefinition;
  playerId: string;
  currentValue: number | null;
  targetValue: number;
  isReliable: boolean;
};

export type PlayerAchievements = {
  playerId: string;
  unlocked: AchievementUnlock[];
  locked: CareerMilestoneProgress[];
  nextMilestones: CareerMilestoneProgress[];
};

export type GetPlayerAchievementsInput = {
  player: Pick<Player, "id"> | { id: string };
  officialMatches: MatchRecord[];
  careerStats?: PlayerCareerStats | null;
};

export type GetAchievementsUnlockedByMatchInput = {
  match: MatchRecord;
  officialMatches: MatchRecord[];
  careerStatsByPlayerId?: Record<string, PlayerCareerStats | undefined>;
};

type CareerMetric = Exclude<
  AchievementMetric,
  "singleInningsRuns" | "hatTricks" | "matchWickets"
>;

type PlayerCareerAggregate = Record<CareerMetric, number> & {
  sixesReliable: boolean;
};

type MatchPlayerContribution = {
  playerId: string;
  matchId: string;
  matchDate: string;
  matchNumber?: number | null;
  matches: number;
  runs: number;
  wickets: number;
  catches: number;
  runOuts: number;
  stumpings: number;
  sixes: number;
  sixesKnown: boolean;
  pomAwards: number;
  maxRuns: number;
  maxWickets: number;
  hatTricks: number;
};

const CAREER_MILESTONE_TIERS: AchievementTier[] = [
  "bronze",
  "silver",
  "gold",
  "platinum",
  "legend"
];

function milestoneDefinitions({
  category,
  metric,
  iconKey,
  thresholds
}: {
  category: AchievementCategory;
  metric: CareerMetric;
  iconKey: AchievementIconKey;
  thresholds: Array<{ threshold: number; title: string; description: string }>;
}): AchievementDefinition[] {
  return thresholds.map((item, index) => ({
    id: `career-${metric}-${item.threshold}`,
    category,
    type: "career_milestone",
    metric,
    iconKey,
    threshold: item.threshold,
    title: item.title,
    description: item.description,
    tier: CAREER_MILESTONE_TIERS[Math.min(index, CAREER_MILESTONE_TIERS.length - 1)]
  }));
}

export const ACHIEVEMENT_DEFINITIONS = [
  ...milestoneDefinitions({
    category: "matches",
    metric: "matches",
    iconKey: "matches",
    thresholds: [
      { threshold: 5, title: "Getting Started", description: "Play 5 official matches" },
      { threshold: 10, title: "Gully Regular", description: "Play 10 official matches" },
      { threshold: 25, title: "Seasoned Warrior", description: "Play 25 official matches" },
      { threshold: 50, title: "Gully Veteran", description: "Play 50 official matches" },
      { threshold: 100, title: "Gully Legend", description: "Play 100 official matches" }
    ]
  }),
  ...milestoneDefinitions({
    category: "batting",
    metric: "runs",
    iconKey: "runs",
    thresholds: [
      { threshold: 100, title: "Century Club", description: "Score 100 career runs" },
      { threshold: 250, title: "Run Machine", description: "Score 250 career runs" },
      { threshold: 500, title: "500 Club", description: "Score 500 career runs" },
      { threshold: 1000, title: "Thousand Run Club", description: "Score 1000 career runs" },
      { threshold: 2000, title: "Run Royalty", description: "Score 2000 career runs" }
    ]
  }),
  ...milestoneDefinitions({
    category: "bowling",
    metric: "wickets",
    iconKey: "wickets",
    thresholds: [
      { threshold: 10, title: "Wicket Hunter", description: "Take 10 career wickets" },
      { threshold: 25, title: "Strike Bowler", description: "Take 25 career wickets" },
      { threshold: 50, title: "Wicket Boss", description: "Take 50 career wickets" },
      { threshold: 100, title: "Stump Breaker", description: "Take 100 career wickets" }
    ]
  }),
  ...milestoneDefinitions({
    category: "fielding",
    metric: "catches",
    iconKey: "catches",
    thresholds: [
      { threshold: 10, title: "Safe Hands", description: "Take 10 career catches" },
      { threshold: 25, title: "Catch Magnet", description: "Take 25 career catches" },
      { threshold: 50, title: "Fielding Wall", description: "Take 50 career catches" }
    ]
  }),
  ...milestoneDefinitions({
    category: "fielding",
    metric: "runOuts",
    iconKey: "run-outs",
    thresholds: [
      { threshold: 5, title: "Direct Hit Starter", description: "Record 5 career run-outs" },
      { threshold: 10, title: "Run-Out Ranger", description: "Record 10 career run-outs" },
      { threshold: 25, title: "Throwdown Titan", description: "Record 25 career run-outs" }
    ]
  }),
  ...milestoneDefinitions({
    category: "fielding",
    metric: "stumpings",
    iconKey: "stumpings",
    thresholds: [
      { threshold: 5, title: "Quick Gloves", description: "Record 5 career stumpings" },
      { threshold: 10, title: "Stumping Specialist", description: "Record 10 career stumpings" },
      { threshold: 25, title: "Keeper King", description: "Record 25 career stumpings" }
    ]
  }),
  ...milestoneDefinitions({
    category: "batting",
    metric: "sixes",
    iconKey: "sixes",
    thresholds: [
      { threshold: 10, title: "Six Starter", description: "Hit 10 tracked official sixes" },
      { threshold: 25, title: "Six Machine", description: "Hit 25 tracked official sixes" },
      { threshold: 50, title: "Boundary Blaster", description: "Hit 50 tracked official sixes" },
      { threshold: 100, title: "Skyline Smasher", description: "Hit 100 tracked official sixes" }
    ]
  }),
  ...milestoneDefinitions({
    category: "pom",
    metric: "pomAwards",
    iconKey: "pom",
    thresholds: [
      { threshold: 1, title: "First Star", description: "Win Player of the Match once" },
      { threshold: 3, title: "Triple Star", description: "Win Player of the Match 3 times" },
      { threshold: 5, title: "Five-Star Hero", description: "Win Player of the Match 5 times" },
      { threshold: 10, title: "POM Royalty", description: "Win Player of the Match 10 times" }
    ]
  }),
  {
    id: "special-half-century",
    category: "batting",
    type: "special_achievement",
    metric: "singleInningsRuns",
    iconKey: "half-century",
    threshold: 50,
    title: "Half-Century",
    description: "Score 50+ runs in one official innings",
    tier: "gold"
  },
  {
    id: "special-century",
    category: "batting",
    type: "special_achievement",
    metric: "singleInningsRuns",
    iconKey: "century",
    threshold: 100,
    title: "Century",
    description: "Score 100+ runs in one official innings",
    tier: "legend"
  },
  {
    id: "special-hat-trick",
    category: "bowling",
    type: "special_achievement",
    metric: "hatTricks",
    iconKey: "hat-trick",
    threshold: 1,
    title: "Hat-Trick Hero",
    description: "Record an official hat-trick",
    tier: "legend"
  },
  {
    id: "special-three-wicket-match",
    category: "bowling",
    type: "special_achievement",
    metric: "matchWickets",
    iconKey: "three-wicket-match",
    threshold: 3,
    title: "Three-Wicket Burst",
    description: "Take 3+ wickets in one official match",
    tier: "gold"
  },
  {
    id: "special-five-wicket-match",
    category: "bowling",
    type: "special_achievement",
    metric: "matchWickets",
    iconKey: "five-wicket-match",
    threshold: 5,
    title: "Five-Wicket Fire",
    description: "Take 5+ wickets in one official match",
    tier: "legend"
  }
] as const satisfies AchievementDefinition[];

const CAREER_MILESTONE_DEFINITIONS = ACHIEVEMENT_DEFINITIONS.filter(
  (definition) => definition.type === "career_milestone"
);

const SPECIAL_ACHIEVEMENT_DEFINITIONS = ACHIEVEMENT_DEFINITIONS.filter(
  (definition) => definition.type === "special_achievement"
);

function emptyAggregate(): PlayerCareerAggregate {
  return {
    matches: 0,
    runs: 0,
    wickets: 0,
    catches: 0,
    runOuts: 0,
    stumpings: 0,
    sixes: 0,
    pomAwards: 0,
    sixesReliable: true
  };
}

function compareMatches(left: MatchRecord, right: MatchRecord): number {
  if (isBeforeCelebrationMatch(left, right)) return -1;
  if (isBeforeCelebrationMatch(right, left)) return 1;

  return left.id.localeCompare(right.id);
}

function getOfficialAchievementMatches(matches: MatchRecord[]): MatchRecord[] {
  return matches.filter(isOfficialCelebrationMatch).sort(compareMatches);
}

function getFinalisedRecords(match: MatchRecord): FinalisedPlayerMatchRecord[] {
  return match.finalisedPlayerRecords ?? [];
}

function getPlayedPlayerIds(match: MatchRecord): Set<string> {
  return new Set(
    getFinalisedRecords(match)
      .filter((record) => record.played)
      .map((record) => record.playerId)
  );
}

function getEventBackedSixesByPlayer(match: MatchRecord): {
  sixesByPlayer: Map<string, number>;
  trackedBattingTeamIds: Set<TeamId>;
} {
  const stats = deriveAdvancedMatchStats(match);
  const sixesByPlayer = new Map<string, number>();
  const trackedBattingTeamIds = new Set<TeamId>();

  for (const innings of stats.innings) {
    if (innings.hasEventHistory) {
      trackedBattingTeamIds.add(innings.battingTeamId);
    }

    for (const batting of innings.battingByPlayer.values()) {
      sixesByPlayer.set(
        batting.playerId,
        (sixesByPlayer.get(batting.playerId) ?? 0) + batting.sixes
      );
    }
  }

  return { sixesByPlayer, trackedBattingTeamIds };
}

function getMatchContribution(match: MatchRecord, playerId: string): MatchPlayerContribution | null {
  const records = getFinalisedRecords(match).filter(
    (record) => record.played && record.playerId === playerId
  );

  if (records.length === 0) return null;

  const { sixesByPlayer, trackedBattingTeamIds } = getEventBackedSixesByPlayer(match);
  let sixesKnown = true;

  for (const record of records) {
    const battingTeamId = record.representingTeamId ?? record.teamId;

    if (record.didBat && !trackedBattingTeamIds.has(battingTeamId)) {
      sixesKnown = false;
    }
  }

  const runsByRecord = records.map((record) =>
    record.didBat ? sanitizeRuns(record.runs) : 0
  );
  const wicketsByRecord = records.map((record) => sanitizeRuns(record.wickets));

  return {
    playerId,
    matchId: match.id,
    matchDate: match.matchDate,
    matchNumber: match.matchNumber ?? null,
    matches: 1,
    runs: runsByRecord.reduce((sum, value) => sum + value, 0),
    wickets: wicketsByRecord.reduce((sum, value) => sum + value, 0),
    catches: records.reduce((sum, record) => sum + sanitizeRuns(record.catches), 0),
    runOuts: records.reduce((sum, record) => sum + sanitizeRuns(record.runOuts), 0),
    stumpings: records.reduce((sum, record) => sum + sanitizeRuns(record.stumpings ?? 0), 0),
    sixes: sixesByPlayer.get(playerId) ?? 0,
    sixesKnown,
    pomAwards: records.some((record) => record.playerOfMatch) ? 1 : 0,
    maxRuns: Math.max(0, ...runsByRecord),
    maxWickets: Math.max(0, ...wicketsByRecord),
    hatTricks: records.reduce((sum, record) => sum + sanitizeRuns(record.hatTricks), 0)
  };
}

function applyContribution(
  aggregate: PlayerCareerAggregate,
  contribution: MatchPlayerContribution
): PlayerCareerAggregate {
  return {
    matches: aggregate.matches + contribution.matches,
    runs: aggregate.runs + contribution.runs,
    wickets: aggregate.wickets + contribution.wickets,
    catches: aggregate.catches + contribution.catches,
    runOuts: aggregate.runOuts + contribution.runOuts,
    stumpings: aggregate.stumpings + contribution.stumpings,
    sixes: aggregate.sixes + (contribution.sixesKnown ? contribution.sixes : 0),
    pomAwards: aggregate.pomAwards + contribution.pomAwards,
    sixesReliable: aggregate.sixesReliable && contribution.sixesKnown
  };
}

function careerMetricValue(
  aggregate: PlayerCareerAggregate,
  metric: CareerMetric
): number | null {
  if (metric === "sixes" && !aggregate.sixesReliable) return null;

  return aggregate[metric];
}

function contributionSpecialValue(
  contribution: MatchPlayerContribution,
  metric: AchievementMetric
): number {
  switch (metric) {
    case "singleInningsRuns":
      return contribution.maxRuns;
    case "hatTricks":
      return contribution.hatTricks;
    case "matchWickets":
      return contribution.maxWickets;
    default:
      return 0;
  }
}

function unlockFromContribution(
  definition: AchievementDefinition,
  contribution: MatchPlayerContribution,
  value: number
): AchievementUnlock {
  return {
    definition,
    playerId: contribution.playerId,
    matchId: contribution.matchId,
    matchDate: contribution.matchDate,
    matchNumber: contribution.matchNumber,
    value
  };
}

function buildTimelineUnlocks({
  playerId,
  matches
}: {
  playerId: string;
  matches: MatchRecord[];
}): {
  unlocked: AchievementUnlock[];
  aggregate: PlayerCareerAggregate;
} {
  let aggregate = emptyAggregate();
  const unlockedById = new Map<string, AchievementUnlock>();

  for (const match of getOfficialAchievementMatches(matches)) {
    const contribution = getMatchContribution(match, playerId);

    if (!contribution) continue;

    const previous = aggregate;
    const next = applyContribution(aggregate, contribution);

    for (const definition of CAREER_MILESTONE_DEFINITIONS) {
      const metric = definition.metric as CareerMetric;
      const previousValue = careerMetricValue(previous, metric);
      const nextValue = careerMetricValue(next, metric);

      if (
        previousValue !== null &&
        nextValue !== null &&
        previousValue < definition.threshold &&
        nextValue >= definition.threshold
      ) {
        unlockedById.set(
          definition.id,
          unlockFromContribution(definition, contribution, nextValue)
        );
      }
    }

    for (const definition of SPECIAL_ACHIEVEMENT_DEFINITIONS) {
      if (unlockedById.has(definition.id)) continue;

      const value = contributionSpecialValue(contribution, definition.metric);

      if (value >= definition.threshold) {
        unlockedById.set(
          definition.id,
          unlockFromContribution(definition, contribution, value)
        );
      }
    }

    aggregate = next;
  }

  return {
    unlocked: [...unlockedById.values()].sort(compareUnlocks),
    aggregate
  };
}

function compareUnlocks(left: AchievementUnlock, right: AchievementUnlock): number {
  const leftType = left.definition.type === "career_milestone" ? 0 : 1;
  const rightType = right.definition.type === "career_milestone" ? 0 : 1;

  if (leftType !== rightType) return leftType - rightType;
  if (left.definition.category !== right.definition.category) {
    return left.definition.category.localeCompare(right.definition.category);
  }
  if (left.definition.threshold !== right.definition.threshold) {
    return left.definition.threshold - right.definition.threshold;
  }

  return left.definition.id.localeCompare(right.definition.id);
}

function applyCareerStatsOverride(
  aggregate: PlayerCareerAggregate,
  careerStats?: PlayerCareerStats | null
): PlayerCareerAggregate {
  if (!careerStats) return aggregate;

  return {
    ...aggregate,
    matches: sanitizeRuns(careerStats.matches),
    runs: sanitizeRuns(careerStats.runs),
    wickets: sanitizeRuns(careerStats.wickets),
    catches: sanitizeRuns(careerStats.catches),
    runOuts: sanitizeRuns(careerStats.runOuts),
    stumpings: sanitizeRuns(careerStats.stumpings)
  };
}

export function getPlayerAchievements({
  player,
  officialMatches,
  careerStats
}: GetPlayerAchievementsInput): PlayerAchievements {
  const timeline = buildTimelineUnlocks({
    playerId: player.id,
    matches: officialMatches
  });
  const aggregate = applyCareerStatsOverride(timeline.aggregate, careerStats);
  const unlockedById = new Set(timeline.unlocked.map((unlock) => unlock.definition.id));
  const locked = CAREER_MILESTONE_DEFINITIONS.filter(
    (definition) => !unlockedById.has(definition.id)
  ).map((definition): CareerMilestoneProgress => {
    const metric = definition.metric as CareerMetric;
    const currentValue = careerMetricValue(aggregate, metric);

    return {
      definition,
      playerId: player.id,
      currentValue,
      targetValue: definition.threshold,
      isReliable: currentValue !== null
    };
  });
  const nextMilestones = [...locked]
    .filter((item) => item.isReliable)
    .sort((left, right) => {
      const leftGap = left.targetValue - (left.currentValue ?? 0);
      const rightGap = right.targetValue - (right.currentValue ?? 0);

      if (left.definition.metric !== right.definition.metric) {
        return left.definition.metric.localeCompare(right.definition.metric);
      }

      return leftGap - rightGap;
    })
    .filter((item, index, items) =>
      items.findIndex((candidate) => candidate.definition.metric === item.definition.metric) === index
    );

  return {
    playerId: player.id,
    unlocked: timeline.unlocked,
    locked,
    nextMilestones
  };
}

function getPlayerIdsInMatch(match: MatchRecord): string[] {
  return [...getPlayedPlayerIds(match)].sort();
}

export function getAchievementsUnlockedByMatch({
  match,
  officialMatches,
  careerStatsByPlayerId = {}
}: GetAchievementsUnlockedByMatchInput): AchievementUnlock[] {
  if (!isOfficialCelebrationMatch(match)) return [];

  const baselineMatches = getPostMatchCelebrationBaselineMatches({
    match,
    historicalMatches: officialMatches
  });
  const withTargetMatches = [
    ...baselineMatches,
    match
  ].filter((candidate, index, list) =>
    list.findIndex((item) => item.id === candidate.id) === index
  );
  const unlocks: AchievementUnlock[] = [];

  for (const playerId of getPlayerIdsInMatch(match)) {
    const before = getPlayerAchievements({
      player: { id: playerId },
      officialMatches: baselineMatches,
      careerStats: null
    });
    const after = getPlayerAchievements({
      player: { id: playerId },
      officialMatches: withTargetMatches,
      careerStats: careerStatsByPlayerId[playerId] ?? null
    });
    const beforeIds = new Set(before.unlocked.map((unlock) => unlock.definition.id));

    for (const unlock of after.unlocked) {
      if (beforeIds.has(unlock.definition.id)) continue;
      if (unlock.matchId !== match.id) continue;

      unlocks.push(unlock);
    }
  }

  return unlocks.sort(compareUnlocks);
}
