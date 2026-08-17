import {
  calculateBattingAllocation,
  getChasingTeamId,
  sortBattingPerformances,
  sanitizeRuns
} from "./match-records";
import {
  calculateBowlingEconomy,
  deriveAdvancedMatchStats,
  formatEconomy,
  formatStrikeRate,
  type AdvancedInningsStats
} from "./advanced-cricket-stats";
import type {
  BowlingOver,
  DismissalEvent,
  FinalisedPlayerMatchRecord,
  MatchRecord,
  PlayerMatchPerformance,
  TeamId,
  TeamInnings
} from "./types/match";

export type PlayerNameResolver = (playerId: string) => string;

export type ScorecardBattingRow = {
  key: string;
  playerId: string;
  teamId: TeamId;
  batter: string;
  dismissal: string;
  runs: string;
  balls: string;
  fours: string;
  sixes: string;
  strikeRate: string;
};

export type ScorecardBowlingFigure = {
  playerId: string;
  bowler: string;
  overs: string;
  maidens: number;
  runsConceded: number;
  wickets: number;
  economy: string;
};

export type ScorecardInnings = {
  innings: TeamInnings;
  teamName: string;
  bowlingTeamName: string;
  score: string;
  overs: string;
  endLabel: string | null;
  battingRows: ScorecardBattingRow[];
  bowlingFigures: ScorecardBowlingFigure[];
  extras: number;
  total: string;
};

export type ScorecardPlayerOfMatch = {
  playerId: string;
  name: string;
  cardTitle: string;
  role: string;
  teamLabel: string;
  artwork: string;
  contributions: string[];
  xpAwarded: number;
} | null;

export function formatOneDecimal(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1) : "0.0";
}

export function formatCricketOversFromLegalBalls(legalBalls: number): string {
  const safeLegalBalls = Math.max(
    0,
    Number.isFinite(legalBalls) ? Math.round(legalBalls) : 0
  );

  return `${Math.floor(safeLegalBalls / 6)}.${safeLegalBalls % 6}`;
}

export function formatCompletedOvers(overs: number): string {
  const safeOvers = Math.max(0, Number.isFinite(overs) ? overs : 0);

  return formatCricketOversFromLegalBalls(safeOvers * 6);
}

function getOverLegalBalls(over: BowlingOver): number {
  return typeof over.legalBalls === "number" ? sanitizeRuns(over.legalBalls) : 6;
}

function pluralise(value: number, singular: string, plural: string): string {
  return value === 1 ? singular : plural;
}

export function getInningsByTeam(
  match: MatchRecord,
  battingTeamId: TeamId
): TeamInnings {
  return match.innings.first.battingTeamId === battingTeamId
    ? match.innings.first
    : match.innings.second;
}

export function getOrderedInnings(match: MatchRecord): [TeamInnings, TeamInnings] {
  const battingFirstTeamId =
    match.battingFirstTeamId ?? match.innings.first.battingTeamId;
  const chasingTeamId = match.chasingTeamId ?? getChasingTeamId(battingFirstTeamId);
  const firstInnings = getInningsByTeam(match, battingFirstTeamId);
  const secondInnings = getInningsByTeam(match, chasingTeamId);

  return [firstInnings, secondInnings];
}

export function getTeamName(match: MatchRecord, teamId: TeamId): string {
  return teamId === "teamA"
    ? match.teams.teamA.teamName || "Team A"
    : match.teams.teamB.teamName || "Team B";
}

export function formatDismissalText(
  performance: PlayerMatchPerformance,
  dismissals: DismissalEvent[],
  resolvePlayerName: PlayerNameResolver
): string {
  if (!performance.didBat) return "did not bat";

  const dismissal = dismissals.find(
    (event) =>
      event.dismissedBatterId === performance.playerId &&
      event.battingTeamId === (performance.representingTeamId ?? performance.teamId)
  );

  if (!dismissal) return "not out";

  const bowlerName = dismissal.creditedBowlerId
    ? resolvePlayerName(dismissal.creditedBowlerId)
    : "";
  const fielderName = dismissal.fielderId
    ? resolvePlayerName(dismissal.fielderId)
    : "";

  if (dismissal.type === "caught") {
    return `c ${fielderName} b ${bowlerName}`;
  }

  if (dismissal.type === "run_out") {
    return `run out (${fielderName})`;
  }

  if (dismissal.type === "lbw") {
    return `lbw b ${bowlerName}`;
  }

  return `b ${bowlerName}`;
}

export function buildBattingRows(
  innings: TeamInnings,
  resolvePlayerName: PlayerNameResolver,
  advancedStats?: AdvancedInningsStats
): ScorecardBattingRow[] {
  const dismissals = innings.bowlingOvers.flatMap((over) => over.dismissals);

  return sortBattingPerformances(innings.battingPerformances).map((performance) => {
    const trackedBatting = advancedStats?.battingByPlayer.get(performance.playerId);

    return {
      key: `${performance.playerId}:${performance.representingTeamId ?? performance.teamId}`,
      playerId: performance.playerId,
      teamId: performance.representingTeamId ?? performance.teamId,
      batter: resolvePlayerName(performance.playerId),
      dismissal: formatDismissalText(performance, dismissals, resolvePlayerName),
      runs: performance.didBat ? String(sanitizeRuns(performance.runs)) : "-",
      balls:
        performance.didBat && advancedStats?.hasEventHistory
          ? String(trackedBatting?.ballsFaced ?? 0)
          : "-",
      fours:
        performance.didBat && advancedStats?.hasEventHistory
          ? String(trackedBatting?.fours ?? 0)
          : "-",
      sixes:
        performance.didBat && advancedStats?.hasEventHistory
          ? String(trackedBatting?.sixes ?? 0)
          : "-",
      strikeRate:
        performance.didBat && advancedStats?.hasEventHistory
          ? formatStrikeRate(trackedBatting?.strikeRate ?? null)
          : "-"
    };
  });
}

export function buildBowlingFigures(
  bowlingOvers: BowlingOver[],
  resolvePlayerName: PlayerNameResolver
): ScorecardBowlingFigure[] {
  const bowlerIds = Array.from(
    new Set(bowlingOvers.map((over) => over.bowlerId).filter(Boolean))
  );

  return bowlerIds.map((playerId) => {
    const playerOvers = bowlingOvers.filter((over) => over.bowlerId === playerId);
    const maidens = playerOvers.filter(
      (over) => over.maiden && Number(over.runsConceded) === 0
    ).length;
    const legalBalls = playerOvers.reduce(
      (total, over) => total + getOverLegalBalls(over),
      0
    );
    const runsConceded = playerOvers.reduce(
      (total, over) => total + sanitizeRuns(over.runsConceded),
      0
    );
    const wickets = playerOvers
      .flatMap((over) => over.dismissals)
      .filter((dismissal) => dismissal.creditedBowlerId === playerId).length;
    const economy = calculateBowlingEconomy({ runsConceded, legalBalls });

    return {
      playerId,
      bowler: resolvePlayerName(playerId),
      overs: formatCricketOversFromLegalBalls(legalBalls),
      maidens,
      runsConceded,
      wickets,
      economy: formatEconomy(economy)
    };
  });
}

export function getInningsEndLabel(
  match: MatchRecord,
  innings: TeamInnings
): string | null {
  const isChase = innings.battingTeamId === match.chasingTeamId;
  const firstInnings = getInningsByTeam(
    match,
    match.battingFirstTeamId ?? match.innings.first.battingTeamId
  );
  const target = firstInnings.runs + 1;

  if (isChase && innings.runs >= target) return "Target chased";
  if (innings.playerCount > 0 && innings.wicketsLost >= innings.playerCount) {
    return "All out";
  }

  return null;
}

export function buildScorecardInnings(
  match: MatchRecord,
  innings: TeamInnings,
  resolvePlayerName: PlayerNameResolver
): ScorecardInnings {
  const allocation = calculateBattingAllocation(
    innings.runs,
    innings.battingPerformances
  );
  const advancedMatchStats = deriveAdvancedMatchStats(match);
  const advancedInningsStats = advancedMatchStats.innings.find(
    (item) => item.battingTeamId === innings.battingTeamId
  );

  return {
    innings,
    teamName: getTeamName(match, innings.battingTeamId),
    bowlingTeamName: getTeamName(match, innings.bowlingTeamId),
    score: `${sanitizeRuns(innings.runs)}/${sanitizeRuns(innings.wicketsLost)}`,
    overs: `${formatCompletedOvers(innings.completedOvers)} overs`,
    endLabel: getInningsEndLabel(match, innings),
    battingRows: buildBattingRows(innings, resolvePlayerName, advancedInningsStats),
    bowlingFigures: buildBowlingFigures(innings.bowlingOvers, resolvePlayerName),
    extras: allocation.extras,
    total: `${sanitizeRuns(innings.runs)}/${sanitizeRuns(innings.wicketsLost)}`
  };
}

function getTeamContextRecords(match: MatchRecord): FinalisedPlayerMatchRecord[] {
  return [
    ...match.teams.teamA.playerPerformances,
    ...match.teams.teamB.playerPerformances
  ].filter(
    (record): record is FinalisedPlayerMatchRecord => "xpBreakdown" in record
  );
}

function getPlayerOfMatchRecords(match: MatchRecord): FinalisedPlayerMatchRecord[] {
  const finalisedRecords = match.finalisedPlayerRecords ?? [];
  const selectedPlayerId =
    finalisedRecords.find((record) => record.playerOfMatch)?.playerId ??
    getTeamContextRecords(match).find((record) => record.playerOfMatch)?.playerId;

  if (!selectedPlayerId) return [];

  const aggregateRecord = finalisedRecords.find(
    (record) => record.playerId === selectedPlayerId
  );

  return aggregateRecord
    ? [aggregateRecord]
    : getTeamContextRecords(match).filter(
        (record) => record.playerId === selectedPlayerId
      );
}

export function buildContributionItems(
  records: FinalisedPlayerMatchRecord[],
  maidenOvers = 0
): string[] {
  const totals = records.reduce(
    (sum, record) => ({
      runs: sum.runs + sanitizeRuns(record.runs),
      wickets: sum.wickets + sanitizeRuns(record.wickets),
      catches: sum.catches + sanitizeRuns(record.catches),
      runOuts: sum.runOuts + sanitizeRuns(record.runOuts),
      hatTricks: sum.hatTricks + sanitizeRuns(record.hatTricks)
    }),
    {
      runs: 0,
      wickets: 0,
      catches: 0,
      runOuts: 0,
      hatTricks: 0
    }
  );
  const items: string[] = [];

  if (totals.runs > 0) {
    items.push(`${totals.runs} ${pluralise(totals.runs, "run", "runs")}`);
  }
  if (totals.wickets > 0) {
    items.push(`${totals.wickets} ${pluralise(totals.wickets, "wicket", "wickets")}`);
  }
  if (totals.catches > 0) {
    items.push(`${totals.catches} ${pluralise(totals.catches, "catch", "catches")}`);
  }
  if (totals.runOuts > 0) items.push(`${totals.runOuts} run-outs`);
  if (totals.hatTricks > 0) items.push(`${totals.hatTricks} hat-tricks`);
  if (maidenOvers > 0) {
    items.push(`${maidenOvers} ${pluralise(maidenOvers, "maiden over", "maiden overs")}`);
  }

  return items;
}

function countPlayerMaidenOvers(match: MatchRecord, playerId: string): number {
  return [
    ...match.teams.teamA.bowlingOvers,
    ...match.teams.teamB.bowlingOvers
  ].filter(
    (over) =>
      over.bowlerId === playerId &&
      over.maiden &&
      sanitizeRuns(over.runsConceded) === 0
  ).length;
}

export function buildPlayerOfMatchSummary(
  match: MatchRecord,
  getPlayer: (playerId: string) =>
    | {
        name: string;
        cardTitle: string;
        role: string;
        cardImage: string;
      }
    | undefined
): ScorecardPlayerOfMatch {
  const records = getPlayerOfMatchRecords(match);
  const selectedPlayerId = records[0]?.playerId;

  if (!selectedPlayerId) return null;

  const player = getPlayer(selectedPlayerId);
  const contextRecords = getTeamContextRecords(match).filter(
    (record) => record.playerId === selectedPlayerId
  );
  const teamIds = Array.from(
    new Set(
      (contextRecords.length > 0 ? contextRecords : records).map(
        (record) => record.representingTeamId ?? record.teamId
      )
    )
  );
  const teamLabel =
    teamIds.length > 1
      ? "Shared Player"
      : getTeamName(match, teamIds[0] ?? records[0].teamId);

  return {
    playerId: selectedPlayerId,
    name: player?.name ?? selectedPlayerId,
    cardTitle: player?.cardTitle ?? "Gully Legend",
    role: player?.role ?? "Gully Legend",
    artwork: player?.cardImage ?? "/player-cards/aninda.png",
    teamLabel,
    contributions: buildContributionItems(
      records,
      countPlayerMaidenOvers(match, selectedPlayerId)
    ),
    xpAwarded: records.reduce(
      (total, record) => total + sanitizeRuns(record.xpBreakdown.awardedXP),
      0
    )
  };
}
