import {
  calculateBattingStrikeRate,
  calculateBowlingEconomy,
  deliveryCountsAsBallFaced,
  eventRunsConcededByBowler,
  formatEconomy,
  formatStrikeRate
} from "../advanced-cricket-stats";
import { calculateBattingAverage } from "../leaderboard";
import { parseLocalMatchDate } from "../match-eligibility";
import { getMatchResultHeadline } from "../match-display";
import { formatCricketOversFromLegalBalls } from "../match-scorecard";
import { sanitizeRuns } from "../match-records";
import { isOfficialCelebrationMatch } from "../official-match-history";
import { getQuickScoringEventsForTeam } from "../quick-scoring";
import type {
  MatchRecord,
  PlayerMatchPerformance,
  QuickScoringEvent,
  TeamId
} from "../types/match";

export type PlayerTrendMetric =
  | "score"
  | "battingAverage"
  | "battingStrikeRate"
  | "economy"
  | "bowlingStrikeRate";

export type PlayerTrendPoint = {
  id: string;
  label: string;
  gameLabel: string;
  shortDateLabel: string;
  fullDateLabel: string;
  inningsLabel: string | null;
  matchName: string;
  matchDate: string;
  value: number;
  displayValue: string;
  detail: string;
  detailRows: Array<{ label: string; value: string }>;
};

export type PlayerTrendSeries = {
  metric: PlayerTrendMetric;
  label: string;
  shortLabel: string;
  axisLabel: string;
  lowerIsBetter: boolean;
  points: PlayerTrendPoint[];
  note: string;
  emptyMessage: string;
};

export type PlayerPerformanceTrends = {
  playerId: string;
  battingAverage: number | null;
  battingAverageDisplay: string;
  trackedBowlingStrikeRate: number | null;
  trackedBowlingStrikeRateDisplay: string;
  series: Record<PlayerTrendMetric, PlayerTrendSeries>;
};

type BattingInningsEntry = {
  id: string;
  match: MatchRecord;
  teamId: TeamId;
  runs: number;
  wasOut: boolean;
  sourceIndex: number;
  ballsFaced: number | null;
  fours: number | null;
  sixes: number | null;
};

type EventBattingEntry = {
  id: string;
  match: MatchRecord;
  teamId: TeamId;
  runs: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  sourceIndex: number;
};

type EventBowlingEntry = {
  id: string;
  match: MatchRecord;
  runsConceded: number;
  legalBalls: number;
  wickets: number;
};

type TrendLabelledEntry<T> = T & {
  label: string;
  gameLabel: string;
  shortDateLabel: string;
  fullDateLabel: string;
  inningsLabel: string | null;
};

const TREND_LABELS: Record<
  PlayerTrendMetric,
  Pick<PlayerTrendSeries, "label" | "shortLabel" | "axisLabel" | "lowerIsBetter" | "note" | "emptyMessage">
> = {
  score: {
    label: "Recent Innings Scores",
    shortLabel: "Score",
    axisLabel: "Runs",
    lowerIsBetter: false,
    note: "Last up to 10 official batting innings.",
    emptyMessage: "No official batting innings yet."
  },
  battingAverage: {
    label: "Batting Average Progression",
    shortLabel: "Bat Avg",
    axisLabel: "Batting Average",
    lowerIsBetter: false,
    note: "Official career average after each innings; not-outs do not add dismissals.",
    emptyMessage: "Batting average appears after the first official dismissal."
  },
  battingStrikeRate: {
    label: "Tracked Batting Strike Rate Progression",
    shortLabel: "Bat SR",
    axisLabel: "Strike Rate",
    lowerIsBetter: false,
    note: "Cumulative tracked batting strike rate; legacy balls are not fabricated.",
    emptyMessage: "No tracked batting balls yet."
  },
  economy: {
    label: "Tracked Economy Progression",
    shortLabel: "Economy",
    axisLabel: "Economy",
    lowerIsBetter: true,
    note: "Cumulative tracked bowling economy progression.",
    emptyMessage: "No tracked legal bowling balls yet."
  },
  bowlingStrikeRate: {
    label: "Tracked Bowling Strike Rate Progression",
    shortLabel: "Bowl SR",
    axisLabel: "Bowling Strike Rate",
    lowerIsBetter: true,
    note: "Cumulative tracked bowling strike rate progression.",
    emptyMessage: "Bowling strike rate appears after the first credited tracked wicket."
  }
};

function numericRuns(value: number | "") {
  return typeof value === "number" ? sanitizeRuns(value) : 0;
}

function getPerformanceRecords(match: MatchRecord): PlayerMatchPerformance[] {
  if (match.finalisedPlayerRecords?.length) return match.finalisedPlayerRecords;

  const inningsPerformances = [
    ...match.innings.first.battingPerformances,
    ...match.innings.second.battingPerformances
  ];

  return inningsPerformances.length
    ? inningsPerformances
    : [
        ...match.teams.teamA.playerPerformances,
        ...match.teams.teamB.playerPerformances
      ];
}

function timestampOf(match: MatchRecord) {
  const localDate = parseLocalMatchDate(match.matchDate);
  const parsedDate = Date.parse(match.matchDate);

  return localDate?.getTime() ?? (Number.isFinite(parsedDate) ? parsedDate : 0);
}

function sortOfficialMatches(matches: MatchRecord[]) {
  return [...matches]
    .filter(isOfficialCelebrationMatch)
    .sort((left, right) => {
      const dateDiff = timestampOf(left) - timestampOf(right);

      if (dateDiff !== 0) return dateDiff;

      const leftNumber = typeof left.matchNumber === "number" ? left.matchNumber : 0;
      const rightNumber = typeof right.matchNumber === "number" ? right.matchNumber : 0;

      if (leftNumber !== rightNumber) return leftNumber - rightNumber;

      return left.id.localeCompare(right.id);
    });
}

function getGameLabel(match: MatchRecord) {
  return typeof match.matchNumber === "number"
    ? `G${match.matchNumber}`
    : match.matchDate;
}

function formatShortTrendDate(matchDate: string) {
  const parsedDate = parseLocalMatchDate(matchDate);

  if (!parsedDate) return matchDate;

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short"
  }).format(parsedDate);
}

function formatFullTrendDate(matchDate: string) {
  const parsedDate = parseLocalMatchDate(matchDate);

  if (!parsedDate) return matchDate;

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(parsedDate);
}

function formatInningsLabel(occurrence: number) {
  if (occurrence === 1) return "First batting innings";
  if (occurrence === 2) return "Second batting innings";

  return `Batting innings ${occurrence}`;
}

function getTeamInningsIndex(match: MatchRecord, teamId: TeamId) {
  if (match.innings.first.battingTeamId === teamId) return 0;
  if (match.innings.second.battingTeamId === teamId) return 1;

  return 0;
}

function applyDuplicateGameSuffixes<T extends { match: MatchRecord }>(
  entries: T[]
): Array<TrendLabelledEntry<T>> {
  const countsByMatch = new Map<string, number>();
  const seen = new Map<string, number>();

  for (const entry of entries) {
    countsByMatch.set(entry.match.id, (countsByMatch.get(entry.match.id) ?? 0) + 1);
  }

  return entries.map((entry) => {
    const gameLabel = getGameLabel(entry.match);
    const occurrence = (seen.get(entry.match.id) ?? 0) + 1;
    const matchEntryCount = countsByMatch.get(entry.match.id) ?? 0;
    const needsSuffix = matchEntryCount > 1;

    seen.set(entry.match.id, occurrence);

    return {
      ...entry,
      label: needsSuffix
        ? `${gameLabel}-${String.fromCharCode(64 + occurrence)}`
        : gameLabel,
      gameLabel,
      shortDateLabel: formatShortTrendDate(entry.match.matchDate),
      fullDateLabel: formatFullTrendDate(entry.match.matchDate),
      inningsLabel: needsSuffix ? formatInningsLabel(occurrence) : null
    };
  });
}

function getTrackedBattingStatsForInnings(
  match: MatchRecord,
  teamId: TeamId,
  playerId: string
) {
  const events = getQuickScoringEventsForTeam(match.quickScoring, teamId);
  let ballsFaced = 0;
  let fours = 0;
  let sixes = 0;

  for (const event of events) {
    if (event.strikerId !== playerId) continue;

    if (deliveryCountsAsBallFaced(event)) ballsFaced += 1;
    if (event.batterRuns === 4) fours += 1;
    if (event.batterRuns === 6) sixes += 1;
  }

  return ballsFaced > 0 ? { ballsFaced, fours, sixes } : null;
}

function resultRow(match: MatchRecord) {
  return { label: "Result", value: getMatchResultHeadline(match) };
}

function getBattingInnings(matches: MatchRecord[], playerId: string) {
  const entries: BattingInningsEntry[] = [];

  for (const match of sortOfficialMatches(matches)) {
    getPerformanceRecords(match)
      .filter((performance) => performance.playerId === playerId && performance.didBat)
      .sort((left, right) => {
        const leftTeam = left.representingTeamId ?? left.teamId;
        const rightTeam = right.representingTeamId ?? right.teamId;

        return getTeamInningsIndex(match, leftTeam) - getTeamInningsIndex(match, rightTeam);
      })
      .forEach((performance, index) => {
        const teamId = performance.representingTeamId ?? performance.teamId;
        const trackedStats = getTrackedBattingStatsForInnings(
          match,
          teamId,
          playerId
        );

        entries.push({
          id: `${match.id}-batting-${teamId}-${index}`,
          match,
          teamId,
          runs: numericRuns(performance.runs),
          wasOut: performance.wasOut,
          sourceIndex: index,
          ballsFaced: trackedStats?.ballsFaced ?? null,
          fours: trackedStats?.fours ?? null,
          sixes: trackedStats?.sixes ?? null
        });
      });
  }

  return applyDuplicateGameSuffixes(entries);
}

function getEventBattingInnings(matches: MatchRecord[], playerId: string) {
  const entries: EventBattingEntry[] = [];

  for (const match of sortOfficialMatches(matches)) {
    [match.innings.first, match.innings.second].forEach((innings, inningsIndex) => {
      const events = getQuickScoringEventsForTeam(
        match.quickScoring,
        innings.battingTeamId
      );
      let runs = 0;
      let ballsFaced = 0;
      let fours = 0;
      let sixes = 0;

      for (const event of events) {
        if (event.strikerId !== playerId) continue;

        runs += sanitizeRuns(event.batterRuns);
        if (deliveryCountsAsBallFaced(event)) ballsFaced += 1;
        if (event.batterRuns === 4) fours += 1;
        if (event.batterRuns === 6) sixes += 1;
      }

      if (ballsFaced > 0) {
        entries.push({
          id: `${match.id}-tracked-batting-${innings.battingTeamId}-${inningsIndex}`,
          match,
          teamId: innings.battingTeamId,
          runs,
          ballsFaced,
          fours,
          sixes,
          sourceIndex: inningsIndex
        });
      }
    });
  }

  return applyDuplicateGameSuffixes(entries);
}

function wicketCreditedToBowler(event: QuickScoringEvent, playerId: string) {
  return Boolean(
    event.wicket &&
      event.bowlerId === playerId &&
      event.wicket.type !== "run_out"
  );
}

function getEventBowlingAppearances(matches: MatchRecord[], playerId: string) {
  const entries: EventBowlingEntry[] = [];

  for (const match of sortOfficialMatches(matches)) {
    let runsConceded = 0;
    let legalBalls = 0;
    let wickets = 0;

    for (const innings of [match.innings.first, match.innings.second]) {
      const events = getQuickScoringEventsForTeam(
        match.quickScoring,
        innings.battingTeamId
      );

      for (const event of events) {
        if (event.bowlerId !== playerId) continue;

        runsConceded += eventRunsConcededByBowler(event);
        if (event.legalDelivery) legalBalls += 1;
        if (wicketCreditedToBowler(event, playerId)) wickets += 1;
      }
    }

    if (legalBalls > 0) {
      entries.push({
        id: `${match.id}-tracked-bowling`,
        match,
        runsConceded,
        legalBalls,
        wickets
      });
    }
  }

  return applyDuplicateGameSuffixes(entries);
}

function lastTen(points: PlayerTrendPoint[]) {
  return points.slice(-10);
}

function createSeries(
  metric: PlayerTrendMetric,
  points: PlayerTrendPoint[]
): PlayerTrendSeries {
  return {
    metric,
    ...TREND_LABELS[metric],
    points: lastTen(points)
  };
}

function formatAverage(value: number | null) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(2)
    : "-";
}

export function calculateTrackedBowlingStrikeRate({
  legalBalls,
  wickets
}: {
  legalBalls: number;
  wickets: number;
}): number | null {
  const safeWickets = sanitizeRuns(wickets);

  if (safeWickets === 0) return null;

  return sanitizeRuns(legalBalls) / safeWickets;
}

export function formatBowlingStrikeRate(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(2)
    : "-";
}

function basePointFields(entry: TrendLabelledEntry<{ match: MatchRecord }>) {
  return {
    label: entry.label,
    gameLabel: entry.gameLabel,
    shortDateLabel: entry.shortDateLabel,
    fullDateLabel: entry.fullDateLabel,
    inningsLabel: entry.inningsLabel,
    matchName: entry.match.matchName,
    matchDate: entry.match.matchDate
  };
}

export function createEmptyPlayerPerformanceTrends(
  playerId: string
): PlayerPerformanceTrends {
  return {
    playerId,
    battingAverage: null,
    battingAverageDisplay: "-",
    trackedBowlingStrikeRate: null,
    trackedBowlingStrikeRateDisplay: "-",
    series: {
      score: createSeries("score", []),
      battingAverage: createSeries("battingAverage", []),
      battingStrikeRate: createSeries("battingStrikeRate", []),
      economy: createSeries("economy", []),
      bowlingStrikeRate: createSeries("bowlingStrikeRate", [])
    }
  };
}

export function buildPlayerPerformanceTrends({
  matches,
  playerId
}: {
  matches: MatchRecord[];
  playerId: string;
}): PlayerPerformanceTrends {
  const battingInnings = getBattingInnings(matches, playerId);
  const trackedBattingInnings = getEventBattingInnings(matches, playerId);
  const trackedBowlingAppearances = getEventBowlingAppearances(matches, playerId);
  let cumulativeRuns = 0;
  let cumulativeDismissals = 0;
  let cumulativeTrackedBattingRuns = 0;
  let cumulativeTrackedBattingBalls = 0;
  let cumulativeBowlingRuns = 0;
  let cumulativeLegalBalls = 0;
  let cumulativeStrikeRateLegalBalls = 0;
  let cumulativeBowlerWickets = 0;

  const scorePoints = battingInnings.map((innings) => {
    const suffix = innings.wasOut ? "" : "*";
    const detailRows = [
      innings.ballsFaced === null
        ? null
        : { label: "Balls", value: String(innings.ballsFaced) },
      innings.ballsFaced === null
        ? null
        : {
            label: "Strike Rate",
            value: formatStrikeRate(
              calculateBattingStrikeRate({
                runs: innings.runs,
                ballsFaced: innings.ballsFaced
              })
            )
          },
      innings.fours === null || innings.sixes === null
        ? null
        : { label: "4s / 6s", value: `${innings.fours} / ${innings.sixes}` },
      resultRow(innings.match)
    ].filter((row): row is { label: string; value: string } => row !== null);

    return {
      id: innings.id,
      ...basePointFields(innings),
      value: innings.runs,
      displayValue: `${innings.runs}${suffix}`,
      detail: innings.wasOut ? "Out" : "Not out",
      detailRows
    };
  });
  const battingAveragePoints = battingInnings.flatMap((innings) => {
    cumulativeRuns += innings.runs;
    if (innings.wasOut) cumulativeDismissals += 1;

    const average =
      cumulativeDismissals > 0
        ? calculateBattingAverage({
            runs: cumulativeRuns,
            dismissals: cumulativeDismissals
          })
        : null;

    if (average === null) return [];

    return [
      {
        id: `${innings.id}-average`,
        ...basePointFields(innings),
        value: average,
        displayValue: formatAverage(average),
        detail: `${cumulativeRuns} runs / ${cumulativeDismissals} dismissals`,
        detailRows: [
          { label: "Innings score", value: `${innings.runs}${innings.wasOut ? "" : "*"}` },
          { label: "Career runs", value: String(cumulativeRuns) },
          { label: "Dismissals", value: String(cumulativeDismissals) },
          { label: "Career average after innings", value: formatAverage(average) },
          resultRow(innings.match)
        ]
      }
    ];
  });
  const battingStrikeRatePoints = trackedBattingInnings.map((innings) => {
    cumulativeTrackedBattingRuns += innings.runs;
    cumulativeTrackedBattingBalls += innings.ballsFaced;

    const inningsStrikeRate = calculateBattingStrikeRate({
      runs: innings.runs,
      ballsFaced: innings.ballsFaced
    });
    const careerStrikeRate = calculateBattingStrikeRate({
      runs: cumulativeTrackedBattingRuns,
      ballsFaced: cumulativeTrackedBattingBalls
    });
    const safeCareerStrikeRate = careerStrikeRate ?? 0;

    return {
      id: `${innings.id}-strike-rate`,
      ...basePointFields(innings),
      value: safeCareerStrikeRate,
      displayValue: formatStrikeRate(careerStrikeRate),
      detail: `Tracked career SR after match: ${formatStrikeRate(careerStrikeRate)}`,
      detailRows: [
        { label: "Innings runs", value: String(innings.runs) },
        { label: "Innings balls", value: String(innings.ballsFaced) },
        { label: "Innings SR", value: formatStrikeRate(inningsStrikeRate) },
        { label: "4s / 6s", value: `${innings.fours} / ${innings.sixes}` },
        { label: "Tracked career runs", value: String(cumulativeTrackedBattingRuns) },
        { label: "Tracked career balls", value: String(cumulativeTrackedBattingBalls) },
        { label: "Tracked career SR after match", value: formatStrikeRate(careerStrikeRate) },
        resultRow(innings.match)
      ]
    };
  });
  const economyPoints = trackedBowlingAppearances.map((appearance) => {
    cumulativeBowlingRuns += appearance.runsConceded;
    cumulativeLegalBalls += appearance.legalBalls;

    const matchEconomy = calculateBowlingEconomy({
      runsConceded: appearance.runsConceded,
      legalBalls: appearance.legalBalls
    });
    const economy = calculateBowlingEconomy({
      runsConceded: cumulativeBowlingRuns,
      legalBalls: cumulativeLegalBalls
    });
    const safeEconomy = economy ?? 0;

    return {
      id: `${appearance.id}-economy`,
      ...basePointFields(appearance),
      value: safeEconomy,
      displayValue: formatEconomy(economy),
      detail: `Tracked career economy after match: ${formatEconomy(economy)}`,
      detailRows: [
        { label: "Match spell", value: formatCricketOversFromLegalBalls(appearance.legalBalls) },
        { label: "Match runs conceded", value: String(appearance.runsConceded) },
        { label: "Match wickets", value: String(appearance.wickets) },
        { label: "Match economy", value: formatEconomy(matchEconomy) },
        { label: "Tracked career overs", value: formatCricketOversFromLegalBalls(cumulativeLegalBalls) },
        { label: "Tracked career runs conceded", value: String(cumulativeBowlingRuns) },
        { label: "Tracked career economy after match", value: formatEconomy(economy) },
        resultRow(appearance.match)
      ]
    };
  });
  const bowlingStrikeRatePoints = trackedBowlingAppearances.flatMap((appearance) => {
    cumulativeStrikeRateLegalBalls += appearance.legalBalls;
    cumulativeBowlerWickets += appearance.wickets;

    const matchStrikeRate = calculateTrackedBowlingStrikeRate({
      legalBalls: appearance.legalBalls,
      wickets: appearance.wickets
    });
    const strikeRate = calculateTrackedBowlingStrikeRate({
      legalBalls: cumulativeStrikeRateLegalBalls,
      wickets: cumulativeBowlerWickets
    });

    if (strikeRate === null) return [];

    return [
      {
        id: `${appearance.id}-bowling-strike-rate`,
        ...basePointFields(appearance),
        value: strikeRate,
        displayValue: formatBowlingStrikeRate(strikeRate),
        detail: `Tracked career bowling SR after match: ${formatBowlingStrikeRate(strikeRate)}`,
        detailRows: [
          { label: "Match legal balls", value: String(appearance.legalBalls) },
          { label: "Match wickets", value: String(appearance.wickets) },
          matchStrikeRate === null
            ? null
            : { label: "Match bowling SR", value: formatBowlingStrikeRate(matchStrikeRate) },
          { label: "Tracked career legal balls", value: String(cumulativeStrikeRateLegalBalls) },
          { label: "Tracked career bowler wickets", value: String(cumulativeBowlerWickets) },
          { label: "Tracked career overs", value: formatCricketOversFromLegalBalls(cumulativeStrikeRateLegalBalls) },
          { label: "Tracked career bowling SR after match", value: formatBowlingStrikeRate(strikeRate) },
          resultRow(appearance.match)
        ].filter((row): row is { label: string; value: string } => row !== null)
      }
    ];
  });
  const finalBattingAverage =
    cumulativeDismissals > 0
      ? calculateBattingAverage({
          runs: cumulativeRuns,
          dismissals: cumulativeDismissals
        })
      : null;
  const finalBowlingStrikeRate = calculateTrackedBowlingStrikeRate({
    legalBalls: cumulativeStrikeRateLegalBalls,
    wickets: cumulativeBowlerWickets
  });

  return {
    playerId,
    battingAverage: finalBattingAverage,
    battingAverageDisplay: formatAverage(finalBattingAverage),
    trackedBowlingStrikeRate: finalBowlingStrikeRate,
    trackedBowlingStrikeRateDisplay: formatBowlingStrikeRate(finalBowlingStrikeRate),
    series: {
      score: createSeries("score", scorePoints),
      battingAverage: createSeries("battingAverage", battingAveragePoints),
      battingStrikeRate: createSeries("battingStrikeRate", battingStrikeRatePoints),
      economy: createSeries("economy", economyPoints),
      bowlingStrikeRate: createSeries("bowlingStrikeRate", bowlingStrikeRatePoints)
    }
  };
}
