import type {
  BowlingOver,
  DismissalEvent,
  MatchTeams,
  MatchResult,
  MatchStatus,
  PlayerMatchPerformance,
  TeamId,
  InningsState,
  TeamInnings,
  TeamMatchData
} from "./types/match";

export type TeamRosters = {
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
  sharedPlayerId?: string | null;
};

export type MatchTotals = {
  teamATotal: number;
  teamBTotal: number;
};

export type TeamSelectionState = TeamRosters & {
  availablePlayerIds: string[];
};

export type TeamBowlingOvers = {
  teamA: BowlingOver[];
  teamB: BowlingOver[];
};

export type MatchValidationStage = "schedule" | "draft" | "start" | "finalise";

export type MatchValidationInput = TeamSelectionState & {
  matchDate: string;
  matchNumber?: number | null;
  startTime?: string;
  matchName?: string;
  teamAName?: string;
  teamBName?: string;
  status: MatchStatus;
  stage?: MatchValidationStage;
  scheduledOversPerInnings?: number | null;
  battingFirstTeamId?: TeamId | null;
  inningsExtras?: Record<TeamId, number>;
  performances: PlayerMatchPerformance[];
  bowlingOvers: TeamBowlingOvers;
};

export function getPerformanceKey(playerId: string, teamId: TeamId): string {
  return `${playerId}:${teamId}`;
}

export function getPerformanceRecordKey(performance: PlayerMatchPerformance): string {
  return getPerformanceKey(
    performance.playerId,
    performance.representingTeamId ?? performance.teamId
  );
}

export function getSharedPlayerId(rosters: TeamRosters): string | null {
  return rosters.sharedPlayerId ?? null;
}

export function hasOddAvailablePlayers(availablePlayerIds: string[]): boolean {
  return availablePlayerIds.length % 2 === 1;
}

export function isSharedPlayer(playerId: string, rosters: TeamRosters): boolean {
  return getSharedPlayerId(rosters) === playerId;
}

export function applySharedPlayerToRosters(
  rosters: MatchTeams
): MatchTeams {
  const sharedPlayerId = rosters.sharedPlayerId;
  const teamAPlayerIds = Array.from(new Set(rosters.teamAPlayerIds));
  const teamBPlayerIds = Array.from(new Set(rosters.teamBPlayerIds));

  if (!sharedPlayerId) {
    return {
      teamAPlayerIds,
      teamBPlayerIds,
      sharedPlayerId: null
    };
  }

  return {
    teamAPlayerIds: Array.from(new Set([...teamAPlayerIds, sharedPlayerId])),
    teamBPlayerIds: Array.from(new Set([...teamBPlayerIds, sharedPlayerId])),
    sharedPlayerId
  };
}

export function getDistributablePlayerIds(
  availablePlayerIds: string[],
  sharedPlayerId: string | null
): string[] {
  return availablePlayerIds.filter((playerId) => playerId !== sharedPlayerId);
}

export function getOrdinaryCrossTeamPlayerIds(rosters: TeamRosters): string[] {
  const sharedPlayerId = getSharedPlayerId(rosters);

  return getCrossTeamPlayerIds(rosters).filter(
    (playerId) => playerId !== sharedPlayerId
  );
}

export type GetInningsStateArgs = {
  battingTeamId: TeamId;
  bowlingTeamId: TeamId;
  battingPlayerCount: number;
  bowlingOvers: BowlingOver[];
  scheduledOvers: number | "" | null;
  runs: number;
  target?: number;
};

export type PlayerStatMaximums = {
  wickets: number;
  runOuts: number;
  catches: number;
  hatTricks: number;
};

export type BowlingFeedScore = {
  runs: number;
  wicketsLost: number;
  completedOvers: number;
};

export type LiveInningsScore = BowlingFeedScore & {
  overFeedRuns: number;
  allocatedBatterRuns: number;
  extras: number;
  battingAllocationTotal: number;
  source: "bowling_feed" | "player_records";
  isReconciled: boolean;
};

export type BattingAllocation = {
  playerRunsTotal: number;
  extras: number;
  isValid: boolean;
  excessPlayerRuns: number;
};

export type LiveResultPreview = {
  headline: string;
  detail: string;
};

export const MATCH_RULES = {
  teamScore: {
    formula: ["Total Player Runs", "Extras", "Official Team Score"]
  },
  wickets: {
    formula: [
      "Bowler-Credited Wickets",
      "Run-Outs",
      "Total Innings Wickets"
    ]
  },
  bowlerCreditedDismissals: [
    "Bowled",
    "LBW",
    "Caught",
    "Stumped",
    "Other bowler-credited dismissal"
  ],
  dismissalCredits: {
    bowlerWicket: {
      bowler: "+1 wicket",
      fielder: "No fielding credit",
      innings: "+1 wicket"
    },
    caught: {
      bowler: "+1 wicket",
      fielder: "+1 catch",
      innings: "+1 wicket"
    },
    runOut: {
      bowler: "No wicket",
      fielder: "+1 run-out",
      innings: "+1 wicket"
    },
    stumped: {
      bowler: "+1 wicket",
      fielder: "+1 stumping",
      innings: "+1 wicket"
    }
  },
  finalisationUpdates: [
    "confirms the result",
    "awards XP",
    "updates career statistics",
    "updates Levels",
    "updates Player Power",
    "updates Leaderboard and Monthly Beasts data"
  ]
} as const;

export function sanitizeRuns(value: unknown): number {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) return 0;

  return Math.max(0, Math.floor(numericValue));
}

export function normalizeNonNegativeIntegerInput(
  rawValue: string
): number | "" {
  if (rawValue === "") return "";

  const digitsOnly = rawValue.replace(/\D/g, "");

  if (digitsOnly === "") return "";

  const parsed = Number.parseInt(digitsOnly, 10);

  if (!Number.isFinite(parsed)) return "";

  return Math.max(0, parsed);
}

export function normalizeStoredRuns(value: unknown): number | "" {
  if (value === null || value === undefined || value === "") return "";

  const parsed = Number.parseInt(String(value), 10);

  return Number.isFinite(parsed) ? Math.max(0, parsed) : "";
}

export function normalizeBattingPosition(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  const parsed = Number.parseInt(String(value), 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function getNextBattingPosition(
  performances: PlayerMatchPerformance[],
  teamId: TeamId
): number {
  const currentMaximum = performances
    .filter(
      (performance) =>
        (performance.representingTeamId ?? performance.teamId) === teamId &&
        performance.didBat
    )
    .reduce(
      (maximum, performance) =>
        Math.max(maximum, normalizeBattingPosition(performance.battingPosition) ?? 0),
      0
    );

  return currentMaximum + 1;
}

export function sortBattingPerformances(
  performances: PlayerMatchPerformance[]
): PlayerMatchPerformance[] {
  return performances
    .map((performance, index) => ({ performance, index }))
    .sort((left, right) => {
      const leftPosition = left.performance.didBat
        ? normalizeBattingPosition(left.performance.battingPosition)
        : null;
      const rightPosition = right.performance.didBat
        ? normalizeBattingPosition(right.performance.battingPosition)
        : null;

      if (leftPosition !== null && rightPosition !== null) {
        return leftPosition - rightPosition || left.index - right.index;
      }

      if (leftPosition !== null) return -1;
      if (rightPosition !== null) return 1;

      if (left.performance.didBat !== right.performance.didBat) {
        return left.performance.didBat ? -1 : 1;
      }

      return left.index - right.index;
    })
    .map(({ performance }) => performance);
}

export function calculateTeamTotal(
  teamId: TeamId,
  performances: PlayerMatchPerformance[]
): number {
  return performances
    .filter((record) => record.teamId === teamId)
    .reduce((total, record) => total + sanitizeRuns(record.runs), 0);
}

export function calculateTeamTotals(
  performances: PlayerMatchPerformance[],
  rosters?: TeamRosters
): MatchTotals {
  const selectedPerformances = rosters
    ? performances.filter(
        (record) =>
          (record.teamId === "teamA" &&
            rosters.teamAPlayerIds.includes(record.playerId)) ||
          (record.teamId === "teamB" &&
            rosters.teamBPlayerIds.includes(record.playerId))
      )
    : performances;

  return {
    teamATotal: calculateTeamTotal("teamA", selectedPerformances),
    teamBTotal: calculateTeamTotal("teamB", selectedPerformances)
  };
}

export function calculateCompletedBowlingOvers(overs: BowlingOver[]): number {
  return overs.reduce((total, over) => {
    if (typeof over.legalBalls === "number") {
      return total + sanitizeRuns(over.legalBalls) / 6;
    }

    return total + (isBowlingOverComplete(over) ? 1 : 0);
  }, 0);
}

export function getChasingTeamId(battingFirstTeamId: TeamId): TeamId {
  return battingFirstTeamId === "teamA" ? "teamB" : "teamA";
}

export function getBattingTeamForBowlingTeam(bowlingTeamId: TeamId): TeamId {
  return bowlingTeamId === "teamA" ? "teamB" : "teamA";
}

export function calculateWicketsLost(overs: BowlingOver[]): number {
  return calculateScoreFromBowlingFeed(overs).wicketsLost;
}

export function formatInningsScore(runs: number, wicketsLost: number): string {
  return `${sanitizeRuns(runs)}/${sanitizeRuns(wicketsLost)}`;
}

function pluralise(value: number, singular: string, plural: string): string {
  return value === 1 ? singular : plural;
}

export function isBowlingOverComplete(over: BowlingOver): boolean {
  const hasBowler =
    typeof over.bowlerId === "string" && over.bowlerId.length > 0;
  const hasRuns =
    over.runsConceded !== "" &&
    Number.isInteger(Number(over.runsConceded)) &&
    Number(over.runsConceded) >= 0;
  const hasWicketsTaken =
    over.wicketsTaken !== "" &&
    Number.isInteger(Number(over.wicketsTaken)) &&
    Number(over.wicketsTaken) >= 0;
  const hasCorrectDismissalCount =
    hasWicketsTaken && over.dismissals.length === Number(over.wicketsTaken);
  const hasDismissalDetails = over.dismissals.every(isDismissalComplete);
  const maidenIsValid = !over.maiden || Number(over.runsConceded) === 0;

  const hasQuickScoringBallCount =
    over.legalBalls === undefined ||
    (Number.isInteger(Number(over.legalBalls)) && Number(over.legalBalls) >= 0);

  return (
    hasBowler &&
    hasRuns &&
    hasWicketsTaken &&
    hasCorrectDismissalCount &&
    hasDismissalDetails &&
    maidenIsValid &&
    hasQuickScoringBallCount
  );
}

export function isDismissalComplete(dismissal: DismissalEvent): boolean {
  const hasBatter = dismissal.dismissedBatterId.length > 0;
  const hasFielder =
    !["caught", "run_out", "stumped"].includes(dismissal.type) ||
    Boolean(dismissal.fielderId);
  const bowlerCreditIsValid =
    dismissal.type === "run_out"
      ? dismissal.creditedBowlerId === null
      : Boolean(dismissal.creditedBowlerId);

  return hasBatter && hasFielder && bowlerCreditIsValid;
}

export function calculateScoreFromBowlingFeed(
  bowlingOvers: BowlingOver[]
): BowlingFeedScore {
  const scorableOvers = bowlingOvers.filter(isBowlingOverComplete);

  return scorableOvers
    .reduce<BowlingFeedScore>(
      (score, over) => ({
        runs: score.runs + sanitizeRuns(over.runsConceded),
        wicketsLost: score.wicketsLost + over.dismissals.length,
        completedOvers:
          score.completedOvers +
          (typeof over.legalBalls === "number"
            ? sanitizeRuns(over.legalBalls) / 6
            : 1)
      }),
      {
        runs: 0,
        wicketsLost: 0,
        completedOvers: 0
      }
    );
}

export function calculateAllocatedBatterRuns(
  battingTeamId: TeamId,
  performances: PlayerMatchPerformance[]
): number {
  return performances
    .filter((record) => record.teamId === battingTeamId && record.didBat)
    .reduce((sum, record) => sum + sanitizeRuns(record.runs), 0);
}

export function calculateBattingAllocation(
  inningsRuns: number,
  battingPerformances: PlayerMatchPerformance[]
): BattingAllocation {
  const playerRunsTotal = battingPerformances
    .filter((record) => record.didBat)
    .reduce((total, record) => total + sanitizeRuns(record.runs), 0);
  const difference = sanitizeRuns(inningsRuns) - playerRunsTotal;

  return {
    playerRunsTotal,
    extras: Math.max(0, difference),
    isValid: difference >= 0,
    excessPlayerRuns: Math.max(0, -difference)
  };
}

export function getMaximumRunsForPlayer(
  currentPlayerId: string,
  inningsRuns: number,
  performances: PlayerMatchPerformance[],
  currentTeamId?: TeamId
): number {
  const currentKey = currentTeamId
    ? getPerformanceKey(currentPlayerId, currentTeamId)
    : currentPlayerId;
  const otherPlayerRuns = performances
    .filter(
      (record) =>
        (currentTeamId ? getPerformanceRecordKey(record) : record.playerId) !==
          currentKey && record.didBat
    )
    .reduce((total, record) => total + sanitizeRuns(record.runs), 0);

  return Math.max(0, sanitizeRuns(inningsRuns) - otherPlayerRuns);
}

export function getLiveInningsScore({
  battingTeamId,
  opposingBowlingOvers,
  playerPerformances
}: {
  battingTeamId: TeamId;
  opposingBowlingOvers: BowlingOver[];
  playerPerformances: PlayerMatchPerformance[];
  extras?: number;
}): LiveInningsScore {
  const overScore = calculateScoreFromBowlingFeed(opposingBowlingOvers);
  const allocatedBatterRuns = calculateAllocatedBatterRuns(
    battingTeamId,
    playerPerformances
  );
  const hasValidOverFeed = overScore.completedOvers > 0;
  const officialRuns = hasValidOverFeed ? overScore.runs : allocatedBatterRuns;
  const allocation = calculateBattingAllocation(officialRuns, playerPerformances);
  const battingAllocationTotal = allocation.playerRunsTotal + allocation.extras;

  return {
    runs: officialRuns,
    wicketsLost: overScore.wicketsLost,
    completedOvers: overScore.completedOvers,
    overFeedRuns: overScore.runs,
    allocatedBatterRuns,
    extras: allocation.extras,
    battingAllocationTotal,
    source: hasValidOverFeed ? "bowling_feed" : "player_records",
    isReconciled: allocation.isValid
  };
}

export function calculateRemainingWicketsForOver({
  overs,
  currentOverId,
  battingTeamPlayerCount
}: {
  overs: BowlingOver[];
  currentOverId: string;
  battingTeamPlayerCount: number;
}): number {
  const wicketsBeforeCurrentOver = overs
    .filter((over) => over.id !== currentOverId)
    .reduce((total, over) => total + over.dismissals.length, 0);

  return Math.max(0, battingTeamPlayerCount - wicketsBeforeCurrentOver);
}

export function calculateBowlerWickets(
  playerId: string,
  bowlingOvers: BowlingOver[]
): number {
  return bowlingOvers
    .flatMap((over) => over.dismissals)
    .filter((dismissal) => dismissal.creditedBowlerId === playerId).length;
}

export function calculatePlayerCatches(
  playerId: string,
  bowlingOvers: BowlingOver[]
): number {
  return bowlingOvers
    .flatMap((over) => over.dismissals)
    .filter(
      (dismissal) =>
        dismissal.type === "caught" && dismissal.fielderId === playerId
    ).length;
}

export function calculatePlayerRunOuts(
  playerId: string,
  bowlingOvers: BowlingOver[]
): number {
  return bowlingOvers
    .flatMap((over) => over.dismissals)
    .filter(
      (dismissal) =>
        dismissal.type === "run_out" && dismissal.fielderId === playerId
    ).length;
}

export function calculatePlayerStumpings(
  playerId: string,
  bowlingOvers: BowlingOver[]
): number {
  return bowlingOvers
    .flatMap((over) => over.dismissals)
    .filter(
      (dismissal) =>
        dismissal.type === "stumped" && dismissal.fielderId === playerId
    ).length;
}

export function overContainsHatTrick(over: BowlingOver): boolean {
  const creditedWicketsInOver = over.dismissals.filter(
    (dismissal) =>
      dismissal.type !== "run_out" &&
      dismissal.creditedBowlerId === over.bowlerId
  ).length;

  return creditedWicketsInOver >= 3;
}

export function calculatePlayerHatTricks(
  playerId: string,
  bowlingOvers: BowlingOver[]
): number {
  return bowlingOvers.filter(
    (over) => over.bowlerId === playerId && overContainsHatTrick(over)
  ).length;
}

export function getDismissedBatterIds(bowlingOvers: BowlingOver[]): string[] {
  return bowlingOvers
    .flatMap((over) => over.dismissals)
    .map((dismissal) => dismissal.dismissedBatterId)
    .filter(Boolean);
}

type LegacyBowlingOver = Omit<BowlingOver, "dismissals" | "wicketsTaken"> & {
  dismissals?: DismissalEvent[];
  wicketsTaken?: number | "";
  wicketsLost?: number | "";
};

function createEmptyDismissal(over: BowlingOver, index: number): DismissalEvent {
  return {
    id: `${over.id}-dismissal-${Date.now()}-${index}`,
    overId: over.id,
    battingTeamId: over.battingTeamId,
    bowlingTeamId: over.bowlingTeamId,
    dismissedBatterId: "",
    type: "bowled",
    creditedBowlerId: over.bowlerId || null,
    fielderId: null
  };
}

export function syncDismissalRows(
  over: BowlingOver,
  newWicketsTaken: number
): BowlingOver {
  const safeWicketsTaken = sanitizeRuns(newWicketsTaken);

  if (safeWicketsTaken > over.dismissals.length) {
    const rowsToAdd = safeWicketsTaken - over.dismissals.length;

    return {
      ...over,
      wicketsTaken: safeWicketsTaken,
      dismissals: [
        ...over.dismissals,
        ...Array.from({ length: rowsToAdd }, (_, index) =>
          createEmptyDismissal(over, over.dismissals.length + index + 1)
        )
      ]
    };
  }

  return {
    ...over,
    wicketsTaken: safeWicketsTaken,
    dismissals: over.dismissals.slice(0, safeWicketsTaken)
  };
}

export function migrateLegacyBowlingOvers(
  bowlingOvers: LegacyBowlingOver[]
): BowlingOver[] {
  return bowlingOvers.map((over) => {
    if (Array.isArray(over.dismissals)) {
      const { wicketsLost: _wicketsLost, ...currentOver } = over;
      void _wicketsLost;
      return {
        ...currentOver,
        wicketsTaken: currentOver.wicketsTaken ?? over.dismissals.length,
        dismissals: over.dismissals
      };
    }

    const legacyWicketsLost = sanitizeRuns(over.wicketsLost);
    const { wicketsLost: _wicketsLost, ...currentOver } = over;
    void _wicketsLost;

    return {
      ...currentOver,
      dismissals: Array.from({ length: legacyWicketsLost }, (_, index) => ({
        id: `${over.id}-legacy-dismissal-${index + 1}`,
        overId: over.id,
        battingTeamId: over.battingTeamId,
        bowlingTeamId: over.bowlingTeamId,
        dismissedBatterId: "",
        type: "bowled",
        creditedBowlerId: over.bowlerId || null,
        fielderId: null
      })),
      wicketsTaken: legacyWicketsLost
    };
  });
}

export function getInningsState({
  battingTeamId,
  bowlingTeamId,
  battingPlayerCount,
  bowlingOvers,
  scheduledOvers,
  runs,
  target
}: GetInningsStateArgs): InningsState {
  const wicketsLost = calculateWicketsLost(bowlingOvers);
  const completedOvers = calculateCompletedBowlingOvers(bowlingOvers);
  const safeScheduledOvers = sanitizeRuns(scheduledOvers);
  const maximumWickets = sanitizeRuns(battingPlayerCount);
  const isAllOut = maximumWickets > 0 && wicketsLost >= maximumWickets;
  const hasCompletedOvers =
    safeScheduledOvers > 0 && completedOvers >= safeScheduledOvers;
  const hasReachedTarget = typeof target === "number" && runs >= target;
  const endReason = isAllOut
    ? "all_out"
    : hasReachedTarget
      ? "target_reached"
      : hasCompletedOvers
        ? "overs_completed"
        : null;

  return {
    battingTeamId,
    bowlingTeamId,
    battingPlayerCount: maximumWickets,
    maximumWickets,
    wicketsLost,
    completedOvers,
    scheduledOvers: safeScheduledOvers,
    isAllOut,
    hasCompletedOvers,
    hasReachedTarget,
    isComplete: endReason !== null,
    endReason
  };
}

export function getInningsCompleteMessage(state: InningsState): string | null {
  if (state.endReason === "all_out") {
    return `INNINGS COMPLETE - ALL ${state.maximumWickets} WICKETS TAKEN`;
  }

  if (state.endReason === "overs_completed") {
    return `INNINGS COMPLETE - ${state.scheduledOvers} OVERS COMPLETED`;
  }

  if (state.endReason === "target_reached") {
    return "CHASE COMPLETE - TARGET REACHED";
  }

  return null;
}

export function getPlayerStatMaximums({
  currentPlayerId,
  currentTeamId,
  teamRecords,
  inningsWicketsLost
}: {
  currentPlayerId: string;
  currentTeamId?: TeamId;
  teamRecords: PlayerMatchPerformance[];
  inningsWicketsLost: number;
}): PlayerStatMaximums {
  const currentKey = currentTeamId
    ? getPerformanceKey(currentPlayerId, currentTeamId)
    : currentPlayerId;
  const currentPlayer = teamRecords.find(
    (record) =>
      (currentTeamId ? getPerformanceRecordKey(record) : record.playerId) === currentKey
  );
  const otherRecords = teamRecords.filter(
    (record) =>
      (currentTeamId ? getPerformanceRecordKey(record) : record.playerId) !== currentKey
  );
  const totalTeamBowlerWickets = teamRecords.reduce(
    (sum, record) => sum + sanitizeRuns(record.wickets),
    0
  );
  const totalTeamRunOuts = teamRecords.reduce(
    (sum, record) => sum + sanitizeRuns(record.runOuts),
    0
  );
  const otherPlayerWickets = otherRecords.reduce(
    (sum, record) => sum + sanitizeRuns(record.wickets),
    0
  );
  const otherPlayerRunOuts = otherRecords.reduce(
    (sum, record) => sum + sanitizeRuns(record.runOuts),
    0
  );
  const otherPlayerCatches = otherRecords.reduce(
    (sum, record) => sum + sanitizeRuns(record.catches),
    0
  );
  const otherPlayerHatTricks = otherRecords.reduce(
    (sum, record) => sum + sanitizeRuns(record.hatTricks),
    0
  );
  const currentPlayerWickets = sanitizeRuns(currentPlayer?.wickets ?? 0);
  const safeInningsWicketsLost = sanitizeRuns(inningsWicketsLost);

  return {
    wickets: Math.max(
      0,
      safeInningsWicketsLost - totalTeamRunOuts - otherPlayerWickets
    ),
    runOuts: Math.max(
      0,
      safeInningsWicketsLost - totalTeamBowlerWickets - otherPlayerRunOuts
    ),
    catches: Math.max(0, totalTeamBowlerWickets - otherPlayerCatches),
    hatTricks: Math.max(
      0,
      Math.min(
        Math.floor(currentPlayerWickets / 3),
        Math.floor(safeInningsWicketsLost / 3) - otherPlayerHatTricks
      )
    )
  };
}

export function calculateMatchResult(
  status: MatchStatus,
  battingFirstTeamId: TeamId,
  firstInnings: TeamInnings,
  secondInnings: TeamInnings
): MatchResult {
  const chasingTeamId = getChasingTeamId(battingFirstTeamId);
  const target = firstInnings.runs + 1;
  const runsRequired = Math.max(0, target - secondInnings.runs);

  if (status === "abandoned" || status === "cancelled") {
    return { type: "no_result" };
  }

  if (status !== "finalised") {
    return {
      type: "pending",
      chasingTeamId,
      target,
      runsRequired,
      targetReached: secondInnings.runs >= target,
      scoresLevel: secondInnings.runs === firstInnings.runs
    };
  }

  return calculateFinalMatchResult(status, battingFirstTeamId, firstInnings, secondInnings);
}

export function getLiveResultPreview({
  firstInnings,
  secondInnings,
  chasingTeamName,
  matchStatus,
  firstInningsIsComplete = false,
  secondInningsIsComplete = false
}: {
  firstInnings: TeamInnings;
  secondInnings: TeamInnings;
  chasingTeamName: string;
  matchStatus: MatchStatus;
  firstInningsIsComplete?: boolean;
  secondInningsIsComplete?: boolean;
}): LiveResultPreview {
  const target = firstInnings.runs + 1;

  if (matchStatus === "draft") {
    return {
      headline: "MATCH DATA IN PROGRESS",
      detail: "RESULT WILL BE CONFIRMED AFTER FINALISATION"
    };
  }

  if (!firstInningsIsComplete) {
    return {
      headline: "FIRST INNINGS IN PROGRESS",
      detail: "RESULT WILL BE CONFIRMED AFTER FINALISATION"
    };
  }

  if (secondInnings.runs >= target) {
    return {
      headline: "TARGET REACHED",
      detail: "FINALISE THE MATCH TO CONFIRM THE RESULT"
    };
  }

  if (secondInningsIsComplete) {
    return {
      headline: "MATCH DATA READY FOR REVIEW",
      detail: "FINALISE THE MATCH TO CONFIRM THE RESULT"
    };
  }

  const runsRequired = Math.max(0, target - secondInnings.runs);
  return {
    headline: `${chasingTeamName.toUpperCase()} NEEDS ${runsRequired} ${pluralise(runsRequired, "RUN", "RUNS")}`,
    detail: `TARGET: ${target}`
  };
}

export function getFinalResultHeadline(
  result: MatchResult,
  teamAName: string,
  teamBName: string
): string {
  if (result.type === "win_by_runs") {
    return `${getTeamDisplayName(result.winnerTeamId, teamAName, teamBName).toUpperCase()} WINS BY ${result.marginRuns} ${pluralise(result.marginRuns, "RUN", "RUNS")}`;
  }

  if (result.type === "win_by_wickets") {
    return `${getTeamDisplayName(result.winnerTeamId, teamAName, teamBName).toUpperCase()} WINS BY ${result.wicketsRemaining} ${pluralise(result.wicketsRemaining, "WICKET", "WICKETS")}`;
  }

  if (result.type === "tie") return "MATCH TIED";
  if (result.type === "no_result") return "NO RESULT";

  return "LIVE RESULT PREVIEW";
}

function getTeamDisplayName(teamId: TeamId, teamAName: string, teamBName: string) {
  return teamId === "teamA" ? teamAName || "Team A" : teamBName || "Team B";
}

export function calculateFinalMatchResult(
  matchStatus: MatchStatus,
  battingFirstTeamId: TeamId,
  firstInnings: TeamInnings,
  secondInnings: TeamInnings
): MatchResult {
  const chasingTeamId = getChasingTeamId(battingFirstTeamId);

  if (matchStatus === "abandoned" || matchStatus === "cancelled") {
    return { type: "no_result" };
  }

  if (matchStatus !== "finalised") {
    throw new Error("A final result can only be calculated for a finalised match.");
  }

  if (secondInnings.runs > firstInnings.runs) {
    const wicketsRemaining = Math.max(
      0,
      secondInnings.playerCount - secondInnings.wicketsLost
    );

    return {
      type: "win_by_wickets",
      winnerTeamId: chasingTeamId,
      loserTeamId: battingFirstTeamId,
      wicketsRemaining
    };
  }

  if (firstInnings.runs > secondInnings.runs) {
    return {
      type: "win_by_runs",
      winnerTeamId: battingFirstTeamId,
      loserTeamId: chasingTeamId,
      marginRuns: firstInnings.runs - secondInnings.runs
    };
  }

  return { type: "tie" };
}

export function getTeamPerformances(
  performances: PlayerMatchPerformance[],
  teamId: TeamId,
  playerIds: string[]
): PlayerMatchPerformance[] {
  return performances
    .filter(
      (record) => record.teamId === teamId && playerIds.includes(record.playerId)
    )
    .map((record) => ({
      ...record,
      played: true
    }));
}

export function buildTeamMatchData({
  teamId,
  teamName,
  playerIds,
  performances,
  bowlingOvers
}: {
  teamId: TeamId;
  teamName: string;
  playerIds: string[];
  performances: PlayerMatchPerformance[];
  bowlingOvers: BowlingOver[];
}): TeamMatchData {
  const playerPerformances = getTeamPerformances(performances, teamId, playerIds);

  return {
    teamId,
    teamName,
    playerIds,
    playerPerformances,
    bowlingOvers,
    totalRuns: calculateTeamTotal(teamId, playerPerformances),
    completedBowlingOvers: calculateCompletedBowlingOvers(bowlingOvers)
  };
}

export function buildTeamInnings({
  battingTeamId,
  battingPlayerIds,
  performances,
  bowlingOvers,
  extras = 0
}: {
  battingTeamId: TeamId;
  battingPlayerIds: string[];
  performances: PlayerMatchPerformance[];
  bowlingOvers: BowlingOver[];
  extras?: number;
}): TeamInnings {
  const bowlingTeamId = getChasingTeamId(battingTeamId);
  const battingPerformances = getTeamPerformances(
    performances,
    battingTeamId,
    battingPlayerIds
  );
  const liveScore = getLiveInningsScore({
    battingTeamId,
    opposingBowlingOvers: bowlingOvers,
    playerPerformances: battingPerformances,
    extras
  });
  const wicketsLost = Math.min(
    battingPlayerIds.length,
    liveScore.wicketsLost
  );

  return {
    battingTeamId,
    bowlingTeamId,
    runs: liveScore.runs,
    wicketsLost,
    extras: liveScore.extras,
    playerCount: battingPlayerIds.length,
    completedOvers: liveScore.completedOvers,
    battingPerformances,
    bowlingOvers
  };
}

export function getCrossTeamPlayerIds(rosters: TeamRosters): string[] {
  const teamBIds = new Set(rosters.teamBPlayerIds);
  return rosters.teamAPlayerIds.filter((playerId) => teamBIds.has(playerId));
}

export function toggleTeamSelection(
  state: TeamSelectionState,
  teamId: TeamId,
  playerId: string
): TeamSelectionState {
  if (!state.availablePlayerIds.includes(playerId)) {
    return state;
  }

  const sourceKey = teamId === "teamA" ? "teamAPlayerIds" : "teamBPlayerIds";
  const otherKey = teamId === "teamA" ? "teamBPlayerIds" : "teamAPlayerIds";
  const alreadySelected = state[sourceKey].includes(playerId);

  return {
    ...state,
    [sourceKey]: alreadySelected
      ? state[sourceKey].filter((id) => id !== playerId)
      : [...state[sourceKey], playerId],
    [otherKey]: state[otherKey].filter((id) => id !== playerId)
  };
}

export function setPlayerAvailability(
  state: TeamSelectionState,
  playerId: string,
  isAvailable: boolean
): TeamSelectionState {
  const availablePlayerIds = isAvailable
    ? Array.from(new Set([...state.availablePlayerIds, playerId]))
    : state.availablePlayerIds.filter((id) => id !== playerId);

  return {
    availablePlayerIds,
    teamAPlayerIds: state.teamAPlayerIds.filter((id) =>
      availablePlayerIds.includes(id)
    ),
    teamBPlayerIds: state.teamBPlayerIds.filter((id) =>
      availablePlayerIds.includes(id)
    )
  };
}

export function validateMatchRecordInput(input: MatchValidationInput): string[] {
  const errors: string[] = [];
  const stage = input.stage ?? "finalise";
  const availableIds = new Set(input.availablePlayerIds);
  const sharedPlayerId = getSharedPlayerId(input);
  const selectedIds = new Set([
    ...input.teamAPlayerIds,
    ...input.teamBPlayerIds
  ]);

  validateScheduleDetails(input, errors);

  if (stage === "schedule" || stage === "draft") {
    return errors;
  }

  validateReadyToStart(input, errors);

  if (stage === "start") {
    return errors;
  }

  if (!input.matchDate) {
    errors.push("Match date is required.");
  }

  for (const playerId of selectedIds) {
    if (!availableIds.has(playerId)) {
      errors.push("Every selected player must be marked available.");
      break;
    }
  }

  for (const playerId of input.availablePlayerIds) {
    const inTeamA = input.teamAPlayerIds.includes(playerId);
    const inTeamB = input.teamBPlayerIds.includes(playerId);

    if (playerId === sharedPlayerId) {
      if (!inTeamA || !inTeamB) {
        errors.push("Shared Player must be locked into both teams.");
        break;
      }
    } else if (inTeamA === inTeamB) {
      errors.push("Every non-shared available player must appear in exactly one team.");
      break;
    }
  }

  for (const performance of input.performances) {
    const inTeamA = input.teamAPlayerIds.includes(performance.playerId);
    const inTeamB = input.teamBPlayerIds.includes(performance.playerId);
    const representingTeamId = performance.representingTeamId ?? performance.teamId;

    if (!selectedIds.has(performance.playerId)) {
      errors.push("Every performance record must belong to a selected player.");
      break;
    }

    if (
      (representingTeamId === "teamA" && !inTeamA) ||
      (representingTeamId === "teamB" && !inTeamB)
    ) {
      errors.push("Every performance record must match the player's selected team.");
      break;
    }

    const performanceRuns = normalizeStoredRuns(performance.runs);

    if (performanceRuns === "" && performance.runs !== "") {
      errors.push("Runs must be non-negative integers.");
      break;
    }

    if (!performance.didBat && (sanitizeRuns(performanceRuns) > 0 || performance.wasOut)) {
      errors.push("A player who did not bat must have zero runs and cannot be marked Out.");
      break;
    }
  }

  if (
    input.status === "finalised" &&
    new Set(
      input.performances
        .filter((performance) => performance.played && performance.playerOfMatch)
        .map((performance) => performance.playerId)
    ).size > 1
  ) {
    errors.push("Select only one Player of the Match.");
  }

  const firstBattingTeamId = input.battingFirstTeamId;
  const firstBattingRuns = firstBattingTeamId
    ? calculateTeamTotal(
        firstBattingTeamId,
        getTeamPerformances(
          input.performances,
          firstBattingTeamId,
          firstBattingTeamId === "teamA" ? input.teamAPlayerIds : input.teamBPlayerIds
        )
      )
    : 0;
  const teamAChaseTarget =
    firstBattingTeamId === "teamB" ? firstBattingRuns + 1 : undefined;
  const teamBChaseTarget =
    firstBattingTeamId === "teamA" ? firstBattingRuns + 1 : undefined;

  validateBowlingOvers(
    input.bowlingOvers.teamA,
    "teamA",
    "teamB",
    input.teamAPlayerIds,
    input.teamBPlayerIds,
    input.teamBPlayerIds.length,
    input.scheduledOversPerInnings ?? 0,
    teamBChaseTarget,
    input.status,
    errors
  );
  validateBowlingOvers(
    input.bowlingOvers.teamB,
    "teamB",
    "teamA",
    input.teamBPlayerIds,
    input.teamAPlayerIds,
    input.teamAPlayerIds.length,
    input.scheduledOversPerInnings ?? 0,
    teamAChaseTarget,
    input.status,
    errors
  );

  validateInningsReconciliation({
    battingTeamId: "teamA",
    teamName: input.teamAName ?? "Team A",
    battingPlayerIds: input.teamAPlayerIds,
    performances: input.performances,
    opposingBowlingOvers: input.bowlingOvers.teamB,
    extras: input.inningsExtras?.teamA ?? 0,
    status: input.status,
    errors
  });
  validateInningsReconciliation({
    battingTeamId: "teamB",
    teamName: input.teamBName ?? "Team B",
    battingPlayerIds: input.teamBPlayerIds,
    performances: input.performances,
    opposingBowlingOvers: input.bowlingOvers.teamA,
    extras: input.inningsExtras?.teamB ?? 0,
    status: input.status,
    errors
  });

  return errors;
}

export function validateScheduleDetails(
  input: Pick<MatchValidationInput, "matchDate" | "matchName">,
  errors: string[] = []
): string[] {
  if (!input.matchDate) {
    errors.push("Match date is required.");
  }

  if (!input.matchName?.trim()) {
    errors.push("Match name is required.");
  }

  return errors;
}

export function validateReadyToStart(
  input: MatchValidationInput,
  errors: string[] = []
): string[] {
  const availableIds = new Set(input.availablePlayerIds);
  const sharedPlayerId = getSharedPlayerId(input);
  const selectedIds = new Set([
    ...input.teamAPlayerIds,
    ...input.teamBPlayerIds
  ]);

  if (input.availablePlayerIds.length === 0) {
    errors.push("Select at least one available player.");
  }

  if (
    !Number.isInteger(input.scheduledOversPerInnings) ||
    (input.scheduledOversPerInnings ?? 0) <= 0
  ) {
    errors.push("Scheduled overs per innings must be a positive integer.");
  }

  if (!input.battingFirstTeamId) {
    errors.push("SELECT THE BATTING-FIRST TEAM");
  }

  if (hasOddAvailablePlayers(input.availablePlayerIds) && !sharedPlayerId) {
    errors.push("Select one Shared Player to create equal teams.");
  }

  if (!hasOddAvailablePlayers(input.availablePlayerIds) && sharedPlayerId) {
    errors.push("Shared Player is only available for odd-player setup.");
  }

  if (sharedPlayerId && !availableIds.has(sharedPlayerId)) {
    errors.push("Shared Player must be marked Available Today.");
  }

  if (getOrdinaryCrossTeamPlayerIds(input).length > 0) {
    errors.push("A player cannot be selected for both teams.");
  }

  if (sharedPlayerId) {
    if (
      !input.teamAPlayerIds.includes(sharedPlayerId) ||
      !input.teamBPlayerIds.includes(sharedPlayerId)
    ) {
      errors.push("Shared Player must appear in both teams.");
    }
  }

  if (input.teamAPlayerIds.length === 0 || input.teamBPlayerIds.length === 0) {
    errors.push("Team A and Team B must each contain at least one player.");
  }

  if (input.teamAPlayerIds.length !== input.teamBPlayerIds.length) {
    errors.push("Team A and Team B must have equal playing sides.");
  }

  for (const playerId of selectedIds) {
    if (!availableIds.has(playerId)) {
      errors.push("Every selected player must be marked available.");
      break;
    }
  }

  for (const playerId of input.availablePlayerIds) {
    const inTeamA = input.teamAPlayerIds.includes(playerId);
    const inTeamB = input.teamBPlayerIds.includes(playerId);

    if (playerId === sharedPlayerId) {
      if (!inTeamA || !inTeamB) {
        errors.push("Shared Player must be locked into both teams.");
        break;
      }
    } else if (inTeamA === inTeamB) {
      errors.push("Every non-shared available player must appear in exactly one team.");
      break;
    }
  }

  return errors;
}

function validateBowlingOvers(
  overs: BowlingOver[],
  bowlingTeamId: TeamId,
  battingTeamId: TeamId,
  bowlingPlayerIds: string[],
  battingPlayerIds: string[],
  battingPlayerCount: number,
  scheduledOvers: number,
  chaseTarget: number | undefined,
  status: MatchStatus,
  errors: string[]
) {
  let wicketsBeforeCurrentOver = 0;
  let runsBeforeCurrentOver = 0;
  const dismissedBatterIds = new Set<string>();

  for (const over of overs) {
    const overIsComplete = isBowlingOverComplete(over);

    if (status === "finalised" && !overIsComplete) {
      errors.push("Complete every bowling over before finalising.");
      break;
    }

    if (over.overNumber > scheduledOvers) {
      errors.push("Completed overs cannot exceed the scheduled overs per innings.");
      break;
    }

    if (wicketsBeforeCurrentOver >= battingPlayerCount) {
      errors.push(`Delete over ${over.overNumber}; the innings was already all out.`);
      break;
    }

    if (typeof chaseTarget === "number" && runsBeforeCurrentOver >= chaseTarget) {
      errors.push(`Delete over ${over.overNumber}; the chase target was already reached.`);
      break;
    }

    if (over.bowlingTeamId !== bowlingTeamId || over.battingTeamId !== battingTeamId) {
      errors.push("Every bowling over must belong to the correct team.");
      break;
    }

    if (!bowlingPlayerIds.includes(over.bowlerId)) {
      if (over.bowlerId || status === "finalised") {
        errors.push("Every selected bowler must belong to that bowling team.");
        break;
      }
    }

    if (
      over.runsConceded !== "" &&
      (!Number.isInteger(Number(over.runsConceded)) || Number(over.runsConceded) < 0)
    ) {
      errors.push("Runs conceded must be non-negative integers.");
      break;
    }

    if (over.maiden && Number(over.runsConceded) > 0) {
      errors.push("A maiden over cannot contain positive runs.");
      break;
    }

    if (
      over.wicketsTaken !== "" &&
      (!Number.isInteger(Number(over.wicketsTaken)) || Number(over.wicketsTaken) < 0)
    ) {
      errors.push("Wickets taken must be a non-negative integer.");
      break;
    }

    if (over.wicketsTaken !== "" && over.dismissals.length !== Number(over.wicketsTaken)) {
      errors.push("Dismissal rows must match wickets taken for that over.");
      break;
    }

    if (over.dismissals.length > Math.max(0, battingPlayerCount - wicketsBeforeCurrentOver)) {
      errors.push("Total wickets cannot exceed the number of players in the batting team.");
      break;
    }

    const errorCountBeforeDismissals = errors.length;

    for (const dismissal of over.dismissals) {
      if (!battingPlayerIds.includes(dismissal.dismissedBatterId)) {
        errors.push("Every dismissed batter must belong to the batting team.");
        break;
      }

      if (dismissedBatterIds.has(dismissal.dismissedBatterId)) {
        errors.push("A batter cannot be dismissed twice in the same innings.");
        break;
      }

      if (dismissal.dismissedBatterId === dismissal.creditedBowlerId) {
        errors.push("A player cannot be credited with dismissing themselves.");
        break;
      }

      if (
        dismissal.fielderId &&
        dismissal.dismissedBatterId === dismissal.fielderId
      ) {
        errors.push("A player cannot field their own dismissal.");
        break;
      }

      if (
        dismissal.overId !== over.id ||
        dismissal.battingTeamId !== battingTeamId ||
        dismissal.bowlingTeamId !== bowlingTeamId
      ) {
        errors.push("Every dismissal must belong to the correct over and teams.");
        break;
      }

      if (dismissal.type === "run_out") {
        if (dismissal.creditedBowlerId !== null) {
          errors.push("Run-outs must not credit the bowler.");
          break;
        }

        if (!dismissal.fielderId || !bowlingPlayerIds.includes(dismissal.fielderId)) {
          errors.push("Every run-out fielder must belong to the bowling team.");
          break;
        }
      } else {
        if (dismissal.creditedBowlerId !== over.bowlerId) {
          errors.push("Bowler wickets must credit the over bowler.");
          break;
        }

        if (dismissal.type === "caught") {
          if (!dismissal.fielderId || !bowlingPlayerIds.includes(dismissal.fielderId)) {
            errors.push("Every catcher must belong to the bowling team.");
            break;
          }
        } else if (dismissal.type === "stumped") {
          if (!dismissal.fielderId) {
            errors.push("Select who completed the stumping.");
            break;
          }

          if (!bowlingPlayerIds.includes(dismissal.fielderId)) {
            errors.push("Every stumping fielder must belong to the bowling team.");
            break;
          }

          if (dismissal.fielderId === over.bowlerId) {
            errors.push("The bowler cannot also be selected as the stumper.");
            break;
          }
        } else if (dismissal.fielderId !== null) {
          errors.push("Bowler wickets must not include a fielder.");
          break;
        }
      }

      dismissedBatterIds.add(dismissal.dismissedBatterId);
    }

    if (errors.length > errorCountBeforeDismissals) break;

    if (overIsComplete) {
      wicketsBeforeCurrentOver += over.dismissals.length;
      runsBeforeCurrentOver += sanitizeRuns(over.runsConceded);
    }
  }
}

function validateInningsReconciliation({
  battingTeamId,
  teamName,
  battingPlayerIds,
  performances,
  opposingBowlingOvers,
  extras,
  status,
  errors
}: {
  battingTeamId: TeamId;
  teamName: string;
  battingPlayerIds: string[];
  performances: PlayerMatchPerformance[];
  opposingBowlingOvers: BowlingOver[];
  extras: number;
  status: MatchStatus;
  errors: string[];
}) {
  if (status !== "finalised") return;

  const battingPerformances = getTeamPerformances(
    performances,
    battingTeamId,
    battingPlayerIds
  );
  const score = getLiveInningsScore({
    battingTeamId,
    opposingBowlingOvers,
    playerPerformances: battingPerformances,
    extras
  });
  const allocation = calculateBattingAllocation(score.runs, battingPerformances);

  if (!allocation.isValid) {
    errors.push(
      `${teamName} player runs exceed the official total by ${allocation.excessPlayerRuns} runs.`
    );
  }
}
