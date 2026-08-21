import {
  ADVANCED_CRICKET_STAT_RULES,
  deriveAdvancedCareerStatsByPlayer,
  formatEconomy,
  formatStrikeRate,
  type AdvancedCareerStats
} from "./advanced-cricket-stats";
import type { PlayerCareerStats } from "./career-store";
import { sanitizeRuns } from "./match-records";
import {
  isBeforeCelebrationMatch,
  isOfficialCelebrationMatch
} from "./official-match-history";
import { getPlayerAchievements } from "./player-achievements";
import type {
  MatchRecord,
  PlayerMatchPerformance
} from "./types/match";
import type { Player } from "./types/player";

export const GULLY_FACE_OFF_NAME = "GULLY FACE-OFF" as const;

export type FaceOffMetricLeader = "left" | "right" | "tie" | "unavailable";
export type FaceOffMetricDirection = "higher" | "lower";
export type FaceOffMetricAvailability = "reliable" | "partial" | "unavailable";
export type FaceOffSectionId =
  | "batting"
  | "bowling"
  | "fielding"
  | "career-glory";

export type FaceOffMetricId =
  | "career-runs"
  | "innings"
  | "highest-score"
  | "fours"
  | "sixes"
  | "strike-rate"
  | "wickets"
  | "economy"
  | "hat-tricks"
  | "catches"
  | "run-outs"
  | "stumpings"
  | "matches"
  | "pom-awards"
  | "xp"
  | "level"
  | "trophies";

export type FaceOffAvailability =
  | {
      status: "ready";
    }
  | {
      status: "invalid";
      reason: "same_player" | "missing_player";
      playerIds: string[];
    };

export type GullyFaceOffPlayer = {
  id: string;
  slug: string;
  name: string;
  cardTitle: string;
  cardImage: string;
  role: string;
  xp: number;
  level: number;
};

export type FaceOffMetricValue = {
  value: number | null;
  displayValue: string;
  availability: FaceOffMetricAvailability;
  context?: Record<string, number | string | boolean>;
};

export type FaceOffMetric = {
  id: FaceOffMetricId;
  label: string;
  direction: FaceOffMetricDirection;
  left: FaceOffMetricValue;
  right: FaceOffMetricValue;
  leader: FaceOffMetricLeader;
  availability: FaceOffMetricAvailability;
  difference: number | null;
};

export type FaceOffSectionEdge = {
  leftWins: number;
  rightWins: number;
  ties: number;
  unavailable: number;
  leader: FaceOffMetricLeader;
};

export type FaceOffSection = {
  id: FaceOffSectionId;
  title: string;
  metrics: FaceOffMetric[];
  edge: FaceOffSectionEdge;
};

export type GullyFaceOff = {
  featureName: typeof GULLY_FACE_OFF_NAME;
  availability: FaceOffAvailability;
  left: GullyFaceOffPlayer | null;
  right: GullyFaceOffPlayer | null;
  sections: FaceOffSection[];
  officialMatchCount: number;
  hasOverallWinner: false;
};

export type BuildGullyFaceOffInput = {
  players: Player[];
  matches: MatchRecord[];
  leftPlayerId: string;
  rightPlayerId: string;
  careerStatsByPlayerId?: Record<string, PlayerCareerStats | undefined>;
};

type MetricDefinition = {
  id: FaceOffMetricId;
  sectionId: FaceOffSectionId;
  label: string;
  direction: FaceOffMetricDirection;
};

type FaceOffAggregate = {
  playerId: string;
  matches: number;
  innings: number;
  runs: number;
  highestScore: number | null;
  wickets: number;
  catches: number;
  runOuts: number;
  stumpings: number;
  hatTricks: number;
  pomAwards: number;
};

type PlayerSnapshot = {
  player: GullyFaceOffPlayer;
  aggregate: FaceOffAggregate;
  advanced: AdvancedCareerStats | null;
  trophies: number;
};

const SECTION_TITLES: Record<FaceOffSectionId, string> = {
  batting: "Batting Battle",
  bowling: "Bowling Battle",
  fielding: "Fielding Battle",
  "career-glory": "Career & Glory"
};

const METRIC_DEFINITIONS: MetricDefinition[] = [
  { id: "career-runs", sectionId: "batting", label: "Career Runs", direction: "higher" },
  { id: "innings", sectionId: "batting", label: "Innings", direction: "higher" },
  { id: "highest-score", sectionId: "batting", label: "Highest Score", direction: "higher" },
  { id: "fours", sectionId: "batting", label: "Fours", direction: "higher" },
  { id: "sixes", sectionId: "batting", label: "Sixes", direction: "higher" },
  { id: "strike-rate", sectionId: "batting", label: "Batting Strike Rate", direction: "higher" },
  { id: "wickets", sectionId: "bowling", label: "Wickets", direction: "higher" },
  { id: "economy", sectionId: "bowling", label: "Bowling Economy", direction: "lower" },
  { id: "hat-tricks", sectionId: "bowling", label: "Hat-Tricks", direction: "higher" },
  { id: "catches", sectionId: "fielding", label: "Catches", direction: "higher" },
  { id: "run-outs", sectionId: "fielding", label: "Run-Outs", direction: "higher" },
  { id: "stumpings", sectionId: "fielding", label: "Stumpings", direction: "higher" },
  { id: "matches", sectionId: "career-glory", label: "Matches", direction: "higher" },
  { id: "pom-awards", sectionId: "career-glory", label: "Official POM Awards", direction: "higher" },
  { id: "xp", sectionId: "career-glory", label: "XP", direction: "higher" },
  { id: "level", sectionId: "career-glory", label: "Level", direction: "higher" },
  { id: "trophies", sectionId: "career-glory", label: "Trophies", direction: "higher" }
];

export function getOfficialGullyFaceOffMatches(matches: MatchRecord[]): MatchRecord[] {
  return matches.filter(isOfficialCelebrationMatch).sort((left, right) => {
    if (isBeforeCelebrationMatch(left, right)) return -1;
    if (isBeforeCelebrationMatch(right, left)) return 1;

    return left.id.localeCompare(right.id);
  });
}

function emptyAggregate(playerId: string): FaceOffAggregate {
  return {
    playerId,
    matches: 0,
    innings: 0,
    runs: 0,
    highestScore: null,
    wickets: 0,
    catches: 0,
    runOuts: 0,
    stumpings: 0,
    hatTricks: 0,
    pomAwards: 0
  };
}

function getFinalisedRecords(match: MatchRecord): PlayerMatchPerformance[] {
  return (
    match.finalisedPlayerRecords ??
    [
      ...match.teams.teamA.playerPerformances,
      ...match.teams.teamB.playerPerformances
    ]
  ) as PlayerMatchPerformance[];
}

function buildAggregates(matches: MatchRecord[]): Map<string, FaceOffAggregate> {
  const aggregates = new Map<string, FaceOffAggregate>();

  function ensure(playerId: string): FaceOffAggregate {
    const current = aggregates.get(playerId) ?? emptyAggregate(playerId);
    aggregates.set(playerId, current);

    return current;
  }

  for (const match of matches) {
    const recordsByPlayer = new Map<string, PlayerMatchPerformance[]>();

    for (const record of getFinalisedRecords(match)) {
      if (!record.played) continue;

      recordsByPlayer.set(record.playerId, [
        ...(recordsByPlayer.get(record.playerId) ?? []),
        record
      ]);
    }

    for (const [playerId, records] of recordsByPlayer) {
      const aggregate = ensure(playerId);

      aggregate.matches += 1;
      aggregate.pomAwards += records.some((record) => record.playerOfMatch) ? 1 : 0;

      for (const record of records) {
        const runs = record.didBat ? sanitizeRuns(record.runs) : 0;

        if (record.didBat) {
          aggregate.innings += 1;
          aggregate.runs += runs;
          aggregate.highestScore =
            aggregate.highestScore === null
              ? runs
              : Math.max(aggregate.highestScore, runs);
        }

        aggregate.wickets += sanitizeRuns(record.wickets);
        aggregate.catches += sanitizeRuns(record.catches);
        aggregate.runOuts += sanitizeRuns(record.runOuts);
        aggregate.stumpings += sanitizeRuns(record.stumpings ?? 0);
        aggregate.hatTricks += sanitizeRuns(record.hatTricks);
      }
    }
  }

  return aggregates;
}

function playerToFaceOffPlayer(
  player: Player,
  careerStats?: PlayerCareerStats
): GullyFaceOffPlayer {
  return {
    id: player.id,
    slug: player.slug,
    name: player.name,
    cardTitle: player.cardTitle,
    cardImage: player.cardImage,
    role: player.role,
    xp: sanitizeRuns(careerStats?.totalXP ?? player.xp),
    level: sanitizeRuns(careerStats?.level ?? player.level)
  };
}

function formatNumberValue(value: number | null): string {
  return value === null ? "UNKNOWN" : String(value);
}

function reliableNumber(
  value: number,
  context?: FaceOffMetricValue["context"]
): FaceOffMetricValue {
  return {
    value,
    displayValue: formatNumberValue(value),
    availability: "reliable",
    context
  };
}

function unavailableValue(
  context?: FaceOffMetricValue["context"],
  availability: FaceOffMetricAvailability = "unavailable"
): FaceOffMetricValue {
  return {
    value: null,
    displayValue: "UNKNOWN",
    availability,
    context
  };
}

function isBattingTrackingReliable(advanced: AdvancedCareerStats | null): boolean {
  if (!advanced) return false;

  return advanced.inningsBatted === advanced.trackedBattingInnings;
}

function trackedBattingContext(advanced: AdvancedCareerStats | null) {
  return {
    trackedInnings: advanced?.trackedBattingInnings ?? 0,
    innings: advanced?.inningsBatted ?? 0,
    ballsFaced: advanced?.ballsFaced ?? 0
  };
}

function getMetricValue(snapshot: PlayerSnapshot, metricId: FaceOffMetricId): FaceOffMetricValue {
  const { aggregate, advanced, player } = snapshot;

  switch (metricId) {
    case "career-runs":
      return reliableNumber(aggregate.runs);
    case "innings":
      return reliableNumber(aggregate.innings);
    case "highest-score":
      return aggregate.highestScore === null
        ? unavailableValue({ innings: aggregate.innings })
        : reliableNumber(aggregate.highestScore, { innings: aggregate.innings });
    case "fours":
      return isBattingTrackingReliable(advanced)
        ? reliableNumber(advanced?.fours ?? 0, trackedBattingContext(advanced))
        : unavailableValue(trackedBattingContext(advanced), "partial");
    case "sixes":
      return isBattingTrackingReliable(advanced)
        ? reliableNumber(advanced?.sixes ?? 0, trackedBattingContext(advanced))
        : unavailableValue(trackedBattingContext(advanced), "partial");
    case "strike-rate":
      if (
        advanced &&
        isBattingTrackingReliable(advanced) &&
        advanced.strikeRate !== null &&
        advanced.ballsFaced >= ADVANCED_CRICKET_STAT_RULES.minimumBallsFacedForStrikeRate
      ) {
        return {
          value: advanced.strikeRate,
          displayValue: formatStrikeRate(advanced.strikeRate),
          availability: "reliable",
          context: trackedBattingContext(advanced)
        };
      }

      return unavailableValue(
        {
          ...trackedBattingContext(advanced),
          minimumBallsFaced: ADVANCED_CRICKET_STAT_RULES.minimumBallsFacedForStrikeRate
        },
        advanced && !isBattingTrackingReliable(advanced) ? "partial" : "unavailable"
      );
    case "wickets":
      return reliableNumber(aggregate.wickets);
    case "economy":
      if (
        advanced &&
        advanced.economy !== null &&
        advanced.legalBallsBowled >= ADVANCED_CRICKET_STAT_RULES.minimumLegalBallsForEconomy
      ) {
        return {
          value: advanced.economy,
          displayValue: formatEconomy(advanced.economy),
          availability: "reliable",
          context: {
            legalBalls: advanced.legalBallsBowled,
            trackedBowlingMatches: advanced.trackedBowlingMatches,
            minimumLegalBalls: ADVANCED_CRICKET_STAT_RULES.minimumLegalBallsForEconomy
          }
        };
      }

      return unavailableValue({
        legalBalls: advanced?.legalBallsBowled ?? 0,
        trackedBowlingMatches: advanced?.trackedBowlingMatches ?? 0,
        minimumLegalBalls: ADVANCED_CRICKET_STAT_RULES.minimumLegalBallsForEconomy
      });
    case "hat-tricks":
      return reliableNumber(aggregate.hatTricks);
    case "catches":
      return reliableNumber(aggregate.catches);
    case "run-outs":
      return reliableNumber(aggregate.runOuts);
    case "stumpings":
      return reliableNumber(aggregate.stumpings);
    case "matches":
      return reliableNumber(aggregate.matches);
    case "pom-awards":
      return reliableNumber(aggregate.pomAwards);
    case "xp":
      return reliableNumber(player.xp);
    case "level":
      return reliableNumber(player.level);
    case "trophies":
      return reliableNumber(snapshot.trophies);
  }
}

function combineAvailability(
  left: FaceOffMetricValue,
  right: FaceOffMetricValue
): FaceOffMetricAvailability {
  if (left.availability === "reliable" && right.availability === "reliable") {
    return "reliable";
  }

  if (left.availability === "partial" || right.availability === "partial") {
    return "partial";
  }

  return "unavailable";
}

function getLeader({
  left,
  right,
  direction
}: {
  left: FaceOffMetricValue;
  right: FaceOffMetricValue;
  direction: FaceOffMetricDirection;
}): FaceOffMetricLeader {
  if (
    left.availability !== "reliable" ||
    right.availability !== "reliable" ||
    left.value === null ||
    right.value === null
  ) {
    return "unavailable";
  }

  if (left.value === right.value) return "tie";

  const leftWins = direction === "higher"
    ? left.value > right.value
    : left.value < right.value;

  return leftWins ? "left" : "right";
}

function buildMetric(
  definition: MetricDefinition,
  left: PlayerSnapshot,
  right: PlayerSnapshot
): FaceOffMetric {
  const leftValue = getMetricValue(left, definition.id);
  const rightValue = getMetricValue(right, definition.id);
  const leader = getLeader({
    left: leftValue,
    right: rightValue,
    direction: definition.direction
  });
  const hasDifference =
    leftValue.value !== null &&
    rightValue.value !== null &&
    leftValue.availability === "reliable" &&
    rightValue.availability === "reliable";
  const difference = hasDifference && leftValue.value !== null && rightValue.value !== null
    ? Math.abs(leftValue.value - rightValue.value)
    : null;

  return {
    id: definition.id,
    label: definition.label,
    direction: definition.direction,
    left: leftValue,
    right: rightValue,
    leader,
    availability: combineAvailability(leftValue, rightValue),
    difference
  };
}

function buildSectionEdge(metrics: FaceOffMetric[]): FaceOffSectionEdge {
  const edge = metrics.reduce(
    (summary, metric) => {
      if (metric.leader === "left") summary.leftWins += 1;
      if (metric.leader === "right") summary.rightWins += 1;
      if (metric.leader === "tie") summary.ties += 1;
      if (metric.leader === "unavailable") summary.unavailable += 1;

      return summary;
    },
    {
      leftWins: 0,
      rightWins: 0,
      ties: 0,
      unavailable: 0
    }
  );
  const leader =
    edge.leftWins === edge.rightWins
      ? "tie"
      : edge.leftWins > edge.rightWins
        ? "left"
        : "right";

  return {
    ...edge,
    leader:
      edge.leftWins === 0 && edge.rightWins === 0 && edge.ties === 0
        ? "unavailable"
        : leader
  };
}

function buildSections(left: PlayerSnapshot, right: PlayerSnapshot): FaceOffSection[];
function buildSections(left: PlayerSnapshot, right: PlayerSnapshot): FaceOffSection[] {
  return (Object.keys(SECTION_TITLES) as FaceOffSectionId[]).map((sectionId) => {
    const metrics = METRIC_DEFINITIONS
      .filter((definition) => definition.sectionId === sectionId)
      .map((definition) => buildMetric(definition, left, right));

    return {
      id: sectionId,
      title: SECTION_TITLES[sectionId],
      metrics,
      edge: buildSectionEdge(metrics)
    };
  });
}

function buildSnapshot({
  player,
  careerStats,
  aggregate,
  advanced,
  officialMatches
}: {
  player: Player;
  careerStats?: PlayerCareerStats;
  aggregate?: FaceOffAggregate;
  advanced?: AdvancedCareerStats;
  officialMatches: MatchRecord[];
}): PlayerSnapshot {
  return {
    player: playerToFaceOffPlayer(player, careerStats),
    aggregate: aggregate ?? emptyAggregate(player.id),
    advanced: advanced ?? null,
    trophies: getPlayerAchievements({
      player,
      officialMatches,
      careerStats: careerStats ?? null
    }).unlocked.length
  };
}

export function buildGullyFaceOff({
  players,
  matches,
  leftPlayerId,
  rightPlayerId,
  careerStatsByPlayerId = {}
}: BuildGullyFaceOffInput): GullyFaceOff {
  const playersById = new Map(players.map((player) => [player.id, player]));
  const leftPlayer = playersById.get(leftPlayerId) ?? null;
  const rightPlayer = playersById.get(rightPlayerId) ?? null;
  const officialMatches = getOfficialGullyFaceOffMatches(matches);

  if (leftPlayerId === rightPlayerId) {
    return {
      featureName: GULLY_FACE_OFF_NAME,
      availability: {
        status: "invalid",
        reason: "same_player",
        playerIds: [leftPlayerId, rightPlayerId]
      },
      left: leftPlayer
        ? playerToFaceOffPlayer(leftPlayer, careerStatsByPlayerId[leftPlayerId])
        : null,
      right: rightPlayer
        ? playerToFaceOffPlayer(rightPlayer, careerStatsByPlayerId[rightPlayerId])
        : null,
      sections: [],
      officialMatchCount: officialMatches.length,
      hasOverallWinner: false
    };
  }

  if (!leftPlayer || !rightPlayer) {
    return {
      featureName: GULLY_FACE_OFF_NAME,
      availability: {
        status: "invalid",
        reason: "missing_player",
        playerIds: [leftPlayerId, rightPlayerId]
      },
      left: leftPlayer
        ? playerToFaceOffPlayer(leftPlayer, careerStatsByPlayerId[leftPlayerId])
        : null,
      right: rightPlayer
        ? playerToFaceOffPlayer(rightPlayer, careerStatsByPlayerId[rightPlayerId])
        : null,
      sections: [],
      officialMatchCount: officialMatches.length,
      hasOverallWinner: false
    };
  }

  const aggregates = buildAggregates(officialMatches);
  const advancedByPlayer = deriveAdvancedCareerStatsByPlayer({
    matches: officialMatches
  });
  const leftSnapshot = buildSnapshot({
    player: leftPlayer,
    careerStats: careerStatsByPlayerId[leftPlayer.id],
    aggregate: aggregates.get(leftPlayer.id),
    advanced: advancedByPlayer.get(leftPlayer.id),
    officialMatches
  });
  const rightSnapshot = buildSnapshot({
    player: rightPlayer,
    careerStats: careerStatsByPlayerId[rightPlayer.id],
    aggregate: aggregates.get(rightPlayer.id),
    advanced: advancedByPlayer.get(rightPlayer.id),
    officialMatches
  });

  return {
    featureName: GULLY_FACE_OFF_NAME,
    availability: { status: "ready" },
    left: leftSnapshot.player,
    right: rightSnapshot.player,
    sections: buildSections(leftSnapshot, rightSnapshot),
    officialMatchCount: officialMatches.length,
    hasOverallWinner: false
  };
}

export function findFaceOffMetric(
  faceOff: GullyFaceOff,
  metricId: FaceOffMetricId
): FaceOffMetric | null {
  for (const section of faceOff.sections) {
    const metric = section.metrics.find((item) => item.id === metricId);

    if (metric) return metric;
  }

  return null;
}
