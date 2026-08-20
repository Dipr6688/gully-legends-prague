import { deriveAdvancedMatchStats } from "./advanced-cricket-stats";
import {
  isSuccessfullyFinalisedMatch,
  parseLocalMatchDate
} from "./match-eligibility";
import { sanitizeRuns } from "./match-records";
import { getLevelFromXP, getLevelProgress, type PlayerLevelProgress } from "./progression";
import type { FinalisedPlayerMatchRecord, MatchRecord, MatchResult } from "./types/match";

export type PostMatchCelebrationMetric =
  | "runs"
  | "wickets"
  | "catches"
  | "runOuts"
  | "stumpings"
  | "fours"
  | "sixes"
  | "matchXP";

export type PostMatchCelebrationMetricSource =
  | "finalised_player_record"
  | "event_backed_advanced_stats"
  | "authoritative_xp_breakdown";

export type PostMatchCelebrationMetricDefinition = {
  key: PostMatchCelebrationMetric;
  label: string;
  recordLabel: string;
  unit: string;
  comparison: "higher";
  source: PostMatchCelebrationMetricSource;
  minimumQualifyingValue: number;
};

export const POST_MATCH_CELEBRATION_METRICS = {
  runs: {
    key: "runs",
    label: "Runs",
    recordLabel: "Highest individual score",
    unit: "runs",
    comparison: "higher",
    source: "finalised_player_record",
    minimumQualifyingValue: 1
  },
  wickets: {
    key: "wickets",
    label: "Wickets",
    recordLabel: "Most wickets in a match",
    unit: "wickets",
    comparison: "higher",
    source: "finalised_player_record",
    minimumQualifyingValue: 1
  },
  catches: {
    key: "catches",
    label: "Catches",
    recordLabel: "Most catches in a match",
    unit: "catches",
    comparison: "higher",
    source: "finalised_player_record",
    minimumQualifyingValue: 1
  },
  runOuts: {
    key: "runOuts",
    label: "Run-outs",
    recordLabel: "Most run-outs in a match",
    unit: "run-outs",
    comparison: "higher",
    source: "finalised_player_record",
    minimumQualifyingValue: 1
  },
  stumpings: {
    key: "stumpings",
    label: "Stumpings",
    recordLabel: "Most stumpings in a match",
    unit: "stumpings",
    comparison: "higher",
    source: "finalised_player_record",
    minimumQualifyingValue: 1
  },
  fours: {
    key: "fours",
    label: "Fours",
    recordLabel: "Most fours in a match",
    unit: "fours",
    comparison: "higher",
    source: "event_backed_advanced_stats",
    minimumQualifyingValue: 1
  },
  sixes: {
    key: "sixes",
    label: "Sixes",
    recordLabel: "Most sixes in a match",
    unit: "sixes",
    comparison: "higher",
    source: "event_backed_advanced_stats",
    minimumQualifyingValue: 1
  },
  matchXP: {
    key: "matchXP",
    label: "Match XP",
    recordLabel: "Highest XP earned in a match",
    unit: "XP",
    comparison: "higher",
    source: "authoritative_xp_breakdown",
    minimumQualifyingValue: 1
  }
} as const satisfies Record<
  PostMatchCelebrationMetric,
  PostMatchCelebrationMetricDefinition
>;

export type PostMatchPersonalBestKind = "first_personal_best" | "personal_best";

export type PostMatchPersonalBest = {
  kind: PostMatchPersonalBestKind;
  playerId: string;
  metric: PostMatchCelebrationMetric;
  metricLabel: string;
  unit: string;
  currentValue: number;
  previousBest: number | null;
  improvement: number | null;
  matchId: string;
};

export type PostMatchRecordStatus = "firstRecord" | "broken";

export type PostMatchRecord = {
  status: PostMatchRecordStatus;
  playerId: string;
  metric: PostMatchCelebrationMetric;
  metricLabel: string;
  recordLabel: string;
  unit: string;
  currentValue: number;
  previousRecord: {
    value: number;
    holderPlayerIds: string[];
    matchId: string;
  } | null;
  matchId: string;
};

export type PostMatchProgressionSnapshot = {
  playerId: string;
  beforeTotalXP: number;
  afterTotalXP: number;
  awardedXP: number;
  beforeLevel?: number;
  afterLevel?: number;
};

export type PostMatchProgressionChange = {
  playerId: string;
  beforeTotalXP: number;
  afterTotalXP: number;
  awardedXP: number;
  xpGained: number;
  beforeLevel: number;
  afterLevel: number;
  beforeProgress: PlayerLevelProgress;
  afterProgress: PlayerLevelProgress;
};

export type PostMatchLevelUp = {
  playerId: string;
  fromLevel: number;
  toLevel: number;
  levelsGained: number;
};

export type PostMatchPlayerOfMatch = {
  playerId: string;
  matchXP: number;
};

export type PostMatchCelebrationHighlightType =
  | "result"
  | "player_of_match"
  | "record_broken"
  | "first_record"
  | "personal_best"
  | "first_personal_best"
  | "level_up";

export type PostMatchCelebrationHighlight = {
  type: PostMatchCelebrationHighlightType;
  priority: number;
  playerId?: string;
  metric?: PostMatchCelebrationMetric;
};

export type PostMatchCelebrationSummary = {
  matchId: string;
  isEligibleOfficialMatch: boolean;
  result: MatchResult;
  playerOfMatch: PostMatchPlayerOfMatch | null;
  progressionChanges: PostMatchProgressionChange[];
  levelUps: PostMatchLevelUp[];
  personalBests: PostMatchPersonalBest[];
  recordsBroken: PostMatchRecord[];
  highlights: PostMatchCelebrationHighlight[];
};

export type BuildPostMatchCelebrationSummaryInput = {
  match: MatchRecord;
  historicalMatches: MatchRecord[];
  progressionSnapshots?: PostMatchProgressionSnapshot[];
};

type AggregatedMatchMetrics = {
  playerId: string;
  runs: number;
  wickets: number;
  catches: number;
  runOuts: number;
  stumpings: number;
  matchXP: number | null;
  playerOfMatch: boolean;
};

type MetricValue = {
  playerId: string;
  value: number;
  matchId: string;
};

function qualifiesMetricValue(
  metric: PostMatchCelebrationMetric,
  value: number
): boolean {
  return value >= POST_MATCH_CELEBRATION_METRICS[metric].minimumQualifyingValue;
}

export function isOfficialCelebrationMatch(match: MatchRecord): boolean {
  return (
    isSuccessfullyFinalisedMatch(match) &&
    !match.isDemo &&
    !match.isDemoTestMatch &&
    !match.deletedAt &&
    !match.id.startsWith("apk-pending-")
  );
}

function parseTimestamp(value: string | undefined): number | null {
  if (!value) return null;

  const parsed = Date.parse(value);

  return Number.isFinite(parsed) ? parsed : null;
}

export function isBeforeCelebrationMatch(
  candidate: MatchRecord,
  target: MatchRecord
): boolean {
  if (candidate.id === target.id) return false;

  const candidateDate = parseLocalMatchDate(candidate.matchDate);
  const targetDate = parseLocalMatchDate(target.matchDate);

  if (candidateDate && targetDate) {
    const candidateTime = candidateDate.getTime();
    const targetTime = targetDate.getTime();

    if (candidateTime < targetTime) return true;
    if (candidateTime > targetTime) return false;
  }

  if (
    candidate.matchDate === target.matchDate &&
    typeof candidate.matchNumber === "number" &&
    typeof target.matchNumber === "number"
  ) {
    return candidate.matchNumber < target.matchNumber;
  }

  const candidateAppliedAt = parseTimestamp(candidate.progressionAppliedAt);
  const targetAppliedAt = parseTimestamp(target.progressionAppliedAt);

  if (candidateAppliedAt !== null && targetAppliedAt !== null) {
    return candidateAppliedAt < targetAppliedAt;
  }

  const candidateUpdatedAt = parseTimestamp(candidate.supabaseUpdatedAt);
  const targetUpdatedAt = parseTimestamp(target.supabaseUpdatedAt);

  if (candidateUpdatedAt !== null && targetUpdatedAt !== null) {
    return candidateUpdatedAt < targetUpdatedAt;
  }

  return false;
}

export function getPostMatchCelebrationBaselineMatches({
  match,
  historicalMatches
}: {
  match: MatchRecord;
  historicalMatches: MatchRecord[];
}): MatchRecord[] {
  return historicalMatches.filter(
    (candidate) =>
      isOfficialCelebrationMatch(candidate) && isBeforeCelebrationMatch(candidate, match)
  );
}

function getFinalisedPlayerRecords(match: MatchRecord): FinalisedPlayerMatchRecord[] {
  return match.finalisedPlayerRecords ?? [];
}

function getOfficialAwardedXP(record: FinalisedPlayerMatchRecord): number | null {
  const awardedXP = record.xpBreakdown?.awardedXP;

  return typeof awardedXP === "number" && Number.isFinite(awardedXP)
    ? awardedXP
    : null;
}

function aggregateMatchMetrics(match: MatchRecord): Map<string, AggregatedMatchMetrics> {
  const byPlayer = new Map<string, AggregatedMatchMetrics>();

  for (const record of getFinalisedPlayerRecords(match)) {
    if (!record.played) continue;

    const current =
      byPlayer.get(record.playerId) ??
      {
        playerId: record.playerId,
        runs: 0,
        wickets: 0,
        catches: 0,
        runOuts: 0,
        stumpings: 0,
        matchXP: null,
        playerOfMatch: false
      };

    current.runs += record.didBat ? sanitizeRuns(record.runs) : 0;
    current.wickets += sanitizeRuns(record.wickets);
    current.catches += sanitizeRuns(record.catches);
    current.runOuts += sanitizeRuns(record.runOuts);
    current.stumpings += sanitizeRuns(record.stumpings ?? 0);
    current.playerOfMatch = current.playerOfMatch || record.playerOfMatch;
    const awardedXP = getOfficialAwardedXP(record);

    if (awardedXP !== null) {
      current.matchXP =
        current.matchXP === null ? awardedXP : Math.max(current.matchXP, awardedXP);
    }

    byPlayer.set(record.playerId, current);
  }

  return byPlayer;
}

function getFinalisedMetricValues(
  match: MatchRecord,
  metric: PostMatchCelebrationMetric
): Map<string, MetricValue> {
  const metricValues = new Map<string, MetricValue>();
  const definition = POST_MATCH_CELEBRATION_METRICS[metric];

  if (definition.source === "event_backed_advanced_stats") {
    const advancedStats = deriveAdvancedMatchStats(match);

    for (const innings of advancedStats.innings) {
      if (!innings.hasEventHistory) continue;

      for (const batting of innings.battingByPlayer.values()) {
        const previous = metricValues.get(batting.playerId)?.value ?? 0;
        const value =
          metric === "fours"
            ? batting.fours
            : metric === "sixes"
              ? batting.sixes
              : 0;

        metricValues.set(batting.playerId, {
          playerId: batting.playerId,
          value: previous + value,
          matchId: match.id
        });
      }
    }

    return metricValues;
  }

  const aggregatedMetrics = aggregateMatchMetrics(match);

  for (const item of aggregatedMetrics.values()) {
    let value: number;

    switch (metric) {
      case "runs":
        value = item.runs;
        break;
      case "wickets":
        value = item.wickets;
        break;
      case "catches":
        value = item.catches;
        break;
      case "runOuts":
        value = item.runOuts;
        break;
      case "stumpings":
        value = item.stumpings;
        break;
      case "matchXP":
        value = item.matchXP ?? 0;
        break;
      case "fours":
      case "sixes":
        value = 0;
        break;
    }

    metricValues.set(item.playerId, {
      playerId: item.playerId,
      value,
      matchId: match.id
    });
  }

  return metricValues;
}

function findPreviousPersonalBest({
  baselineMatches,
  playerId,
  metric
}: {
  baselineMatches: MatchRecord[];
  playerId: string;
  metric: PostMatchCelebrationMetric;
}): number | null {
  let best: number | null = null;

  for (const match of baselineMatches) {
    const value = getFinalisedMetricValues(match, metric).get(playerId)?.value;

    if (value === undefined || !qualifiesMetricValue(metric, value)) continue;
    if (best === null || value > best) best = value;
  }

  return best;
}

function buildPersonalBests({
  match,
  baselineMatches
}: {
  match: MatchRecord;
  baselineMatches: MatchRecord[];
}): PostMatchPersonalBest[] {
  const personalBests: PostMatchPersonalBest[] = [];

  for (const metric of Object.keys(
    POST_MATCH_CELEBRATION_METRICS
  ) as PostMatchCelebrationMetric[]) {
    const definition = POST_MATCH_CELEBRATION_METRICS[metric];
    const currentValues = getFinalisedMetricValues(match, metric);

    for (const current of currentValues.values()) {
      if (!qualifiesMetricValue(metric, current.value)) continue;

      const previousBest = findPreviousPersonalBest({
        baselineMatches,
        playerId: current.playerId,
        metric
      });

      if (previousBest !== null && current.value <= previousBest) continue;

      personalBests.push({
        kind: previousBest === null ? "first_personal_best" : "personal_best",
        playerId: current.playerId,
        metric,
        metricLabel: definition.label,
        unit: definition.unit,
        currentValue: current.value,
        previousBest,
        improvement: previousBest === null ? null : current.value - previousBest,
        matchId: match.id
      });
    }
  }

  return personalBests;
}

function findHistoricalRecord({
  baselineMatches,
  metric
}: {
  baselineMatches: MatchRecord[];
  metric: PostMatchCelebrationMetric;
}): {
  value: number;
  holderPlayerIds: string[];
  matchId: string;
} | null {
  let record: {
    value: number;
    holderPlayerIds: string[];
    matchId: string;
  } | null = null;

  for (const match of baselineMatches) {
    for (const metricValue of getFinalisedMetricValues(match, metric).values()) {
      if (!qualifiesMetricValue(metric, metricValue.value)) continue;

      if (record === null || metricValue.value > record.value) {
        record = {
          value: metricValue.value,
          holderPlayerIds: [metricValue.playerId],
          matchId: metricValue.matchId
        };
      } else if (metricValue.value === record.value) {
        record.holderPlayerIds.push(metricValue.playerId);
      }
    }
  }

  return record;
}

function buildRecords({
  match,
  baselineMatches
}: {
  match: MatchRecord;
  baselineMatches: MatchRecord[];
}): PostMatchRecord[] {
  const records: PostMatchRecord[] = [];

  for (const metric of Object.keys(
    POST_MATCH_CELEBRATION_METRICS
  ) as PostMatchCelebrationMetric[]) {
    const definition = POST_MATCH_CELEBRATION_METRICS[metric];
    const currentValues = [...getFinalisedMetricValues(match, metric).values()].filter(
      (metricValue) => qualifiesMetricValue(metric, metricValue.value)
    );

    if (currentValues.length === 0) continue;

    const currentRecordValue = Math.max(
      ...currentValues.map((metricValue) => metricValue.value)
    );
    const currentRecordHolders = currentValues.filter(
      (metricValue) => metricValue.value === currentRecordValue
    );
    const previousRecord = findHistoricalRecord({ baselineMatches, metric });

    if (previousRecord !== null && currentRecordValue <= previousRecord.value) {
      continue;
    }

    for (const holder of currentRecordHolders) {
      records.push({
        status: previousRecord === null ? "firstRecord" : "broken",
        playerId: holder.playerId,
        metric,
        metricLabel: definition.label,
        recordLabel: definition.recordLabel,
        unit: definition.unit,
        currentValue: currentRecordValue,
        previousRecord,
        matchId: match.id
      });
    }
  }

  return records;
}

function buildProgressionChanges(
  snapshots: PostMatchProgressionSnapshot[] | undefined
): PostMatchProgressionChange[] {
  if (!snapshots) return [];

  return snapshots.map((snapshot) => {
    const beforeLevel = snapshot.beforeLevel ?? getLevelFromXP(snapshot.beforeTotalXP);
    const derivedAfterLevel = getLevelFromXP(snapshot.afterTotalXP);
    const afterLevel = snapshot.afterLevel ?? Math.max(beforeLevel, derivedAfterLevel);

    return {
      playerId: snapshot.playerId,
      beforeTotalXP: snapshot.beforeTotalXP,
      afterTotalXP: snapshot.afterTotalXP,
      awardedXP: snapshot.awardedXP,
      xpGained: snapshot.afterTotalXP - snapshot.beforeTotalXP,
      beforeLevel,
      afterLevel,
      beforeProgress: getLevelProgress(snapshot.beforeTotalXP),
      afterProgress: getLevelProgress(snapshot.afterTotalXP)
    };
  });
}

function buildLevelUps(
  progressionChanges: PostMatchProgressionChange[]
): PostMatchLevelUp[] {
  return progressionChanges
    .filter((change) => change.afterLevel > change.beforeLevel)
    .map((change) => ({
      playerId: change.playerId,
      fromLevel: change.beforeLevel,
      toLevel: change.afterLevel,
      levelsGained: change.afterLevel - change.beforeLevel
    }));
}

function getOfficialPlayerOfMatch(match: MatchRecord): PostMatchPlayerOfMatch | null {
  for (const record of aggregateMatchMetrics(match).values()) {
    if (!record.playerOfMatch) continue;

    return {
      playerId: record.playerId,
      matchXP: record.matchXP ?? 0
    };
  }

  return null;
}

function buildHighlights({
  isEligibleOfficialMatch,
  playerOfMatch,
  recordsBroken,
  personalBests,
  levelUps
}: {
  isEligibleOfficialMatch: boolean;
  playerOfMatch: PostMatchPlayerOfMatch | null;
  recordsBroken: PostMatchRecord[];
  personalBests: PostMatchPersonalBest[];
  levelUps: PostMatchLevelUp[];
}): PostMatchCelebrationHighlight[] {
  if (!isEligibleOfficialMatch) return [];

  const highlights: PostMatchCelebrationHighlight[] = [{ type: "result", priority: 10 }];

  if (playerOfMatch) {
    highlights.push({
      type: "player_of_match",
      priority: 20,
      playerId: playerOfMatch.playerId
    });
  }

  for (const record of recordsBroken) {
    highlights.push({
      type: record.status === "firstRecord" ? "first_record" : "record_broken",
      priority: record.status === "firstRecord" ? 35 : 30,
      playerId: record.playerId,
      metric: record.metric
    });
  }

  for (const personalBest of personalBests) {
    highlights.push({
      type:
        personalBest.kind === "first_personal_best"
          ? "first_personal_best"
          : "personal_best",
      priority: personalBest.kind === "first_personal_best" ? 55 : 50,
      playerId: personalBest.playerId,
      metric: personalBest.metric
    });
  }

  for (const levelUp of levelUps) {
    highlights.push({
      type: "level_up",
      priority: 60,
      playerId: levelUp.playerId
    });
  }

  return highlights.sort((left, right) => left.priority - right.priority);
}

export function buildPostMatchCelebrationSummary({
  match,
  historicalMatches,
  progressionSnapshots
}: BuildPostMatchCelebrationSummaryInput): PostMatchCelebrationSummary {
  const isEligibleOfficialMatch = isOfficialCelebrationMatch(match);
  const baselineMatches = isEligibleOfficialMatch
    ? getPostMatchCelebrationBaselineMatches({ match, historicalMatches })
    : [];
  const personalBests = isEligibleOfficialMatch
    ? buildPersonalBests({ match, baselineMatches })
    : [];
  const recordsBroken = isEligibleOfficialMatch
    ? buildRecords({ match, baselineMatches })
    : [];
  const progressionChanges = isEligibleOfficialMatch
    ? buildProgressionChanges(progressionSnapshots)
    : [];
  const levelUps = buildLevelUps(progressionChanges);
  const playerOfMatch = isEligibleOfficialMatch ? getOfficialPlayerOfMatch(match) : null;

  return {
    matchId: match.id,
    isEligibleOfficialMatch,
    result: match.result,
    playerOfMatch,
    progressionChanges,
    levelUps,
    personalBests,
    recordsBroken,
    highlights: buildHighlights({
      isEligibleOfficialMatch,
      playerOfMatch,
      recordsBroken,
      personalBests,
      levelUps
    })
  };
}
