export type MatchStatus =
  | "draft"
  | "in_progress"
  | "finalised"
  | "abandoned"
  | "cancelled";

export type TeamId = "teamA" | "teamB";

export type BattingMode = "two_batter" | "single_batter";

export type MatchTeams = {
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
  sharedPlayerId: string | null;
};

export type DismissalType =
  | "bowled"
  | "lbw"
  | "caught"
  | "stumped"
  | "run_out"
  | "other_bowler_wicket";

export type QuickScoringInningsKey = "inningsAEvents" | "inningsBEvents";

export type QuickScoringInningsPhase =
  | "first_innings"
  | "innings_break"
  | "second_innings";

export type QuickScoringExtraType = "wide" | "no_ball" | null;

export type QuickScoringDismissalType =
  | "bowled"
  | "caught"
  | "run_out"
  | "other_bowler_wicket";

export type QuickScoringWicket = {
  type: QuickScoringDismissalType;
  dismissedPlayerId: string;
  fielderId: string | null;
  assistingFielderId?: string | null;
  newBatterId: string | null;
  completedRuns: number;
  nextStrikerId?: string | null;
  nextNonStrikerId?: string | null;
};

export type QuickScoringEvent = {
  id: string;
  sequence: number;
  battingTeamId: TeamId;
  bowlingTeamId: TeamId;
  strikerId: string;
  nonStrikerId: string;
  bowlerId: string;
  batterRuns: number;
  extraType: QuickScoringExtraType;
  extras: number;
  legalDelivery: boolean;
  wicket: QuickScoringWicket | null;
  timestamp: string;
};

export type QuickScoringMetadata = {
  version: 1 | 2;
  setupLocked?: boolean;
  setupLockedAt?: string;
  battingMode?: BattingMode | null;
  inningsPhase?: QuickScoringInningsPhase;
  firstInningsCompletedAt?: string;
  secondInningsStartedAt?: string;
  inningsAEvents: QuickScoringEvent[];
  inningsBEvents: QuickScoringEvent[];
};

export type DismissalEvent = {
  id: string;
  overId: string;
  battingTeamId: TeamId;
  bowlingTeamId: TeamId;
  dismissedBatterId: string;
  type: DismissalType;
  creditedBowlerId: string | null;
  fielderId: string | null;
};

export type BowlingOver = {
  id: string;
  bowlingTeamId: TeamId;
  battingTeamId: TeamId;
  bowlerId: string;
  overNumber: number;
  legalBalls?: number;
  runsConceded: number | "";
  wicketsTaken: number | "";
  dismissals: DismissalEvent[];
  maiden: boolean;
};

export type PlayerMatchPerformance = {
  playerId: string;
  teamId: TeamId;
  representingTeamId?: TeamId;
  played: boolean;
  playerOfMatch: boolean;
  didBat: boolean;
  battingPosition?: number | null;
  runs: number | "";
  wasOut: boolean;
  wickets: number;
  hatTricks: number;
  catches: number;
  runOuts: number;
  stumpings?: number;
};

export type PlayerMatchXPBreakdown = {
  participationXP: number;
  winBonusXP: number;
  playerOfMatchXP: number;
  battingRunsXP: number;
  battingMilestoneXP: number;
  duckPenaltyXP: number;
  wicketXP: number;
  hatTrickXP: number;
  maidenXP: number;
  expensiveOverPenaltyXP: number;
  fieldingXP: number;
  rawTotalXP: number;
  awardedXP: number;
};

export type FinalisedPlayerMatchRecord = PlayerMatchPerformance & {
  xpBreakdown: PlayerMatchXPBreakdown;
  progressionAppliedAt?: string;
};

export type MatchResult =
  | {
      type: "pending";
      chasingTeamId: TeamId;
      target: number;
      runsRequired: number;
      targetReached: boolean;
      scoresLevel: boolean;
    }
  | {
      type: "win_by_runs";
      winnerTeamId: TeamId;
      loserTeamId: TeamId;
      marginRuns: number;
    }
  | {
      type: "win_by_wickets";
      winnerTeamId: TeamId;
      loserTeamId: TeamId;
      wicketsRemaining: number;
    }
  | {
      type: "tie";
    }
  | {
      type: "no_result";
      reason?: string;
    };

export type TeamInnings = {
  battingTeamId: TeamId;
  bowlingTeamId: TeamId;
  runs: number;
  wicketsLost: number;
  extras: number;
  playerCount: number;
  completedOvers: number;
  battingPerformances: PlayerMatchPerformance[];
  bowlingOvers: BowlingOver[];
};

export type InningsEndReason =
  | "all_out"
  | "overs_completed"
  | "target_reached"
  | null;

export type InningsState = {
  battingTeamId: TeamId;
  bowlingTeamId: TeamId;
  battingPlayerCount: number;
  maximumWickets: number;
  wicketsLost: number;
  completedOvers: number;
  scheduledOvers: number;
  isAllOut: boolean;
  hasCompletedOvers: boolean;
  hasReachedTarget: boolean;
  isComplete: boolean;
  endReason: InningsEndReason;
};

export type TeamMatchData = {
  teamId: TeamId;
  teamName: string;
  playerIds: string[];
  playerPerformances: Array<PlayerMatchPerformance | FinalisedPlayerMatchRecord>;
  bowlingOvers: BowlingOver[];
  totalRuns: number;
  completedBowlingOvers: number;
};

export type MatchRecord = {
  id: string;
  supabaseUpdatedAt?: string;
  isDemo?: boolean;
  isDemoTestMatch?: boolean;
  matchDate: string;
  matchNumber?: number | null;
  startTime?: string;
  deletedAt?: string | null;
  matchName: string;
  venue: string;
  status: MatchStatus;
  scheduledOversPerInnings: number | null;
  battingMode?: BattingMode | null;
  battingFirstTeamId: TeamId | null;
  chasingTeamId: TeamId | null;
  sharedPlayerId?: string | null;
  fieldingHelperIds?: string[];
  teams: {
    teamA: TeamMatchData;
    teamB: TeamMatchData;
  };
  innings: {
    first: TeamInnings;
    second: TeamInnings;
  };
  result: MatchResult;
  finalisedPlayerRecords?: FinalisedPlayerMatchRecord[];
  progressionAppliedAt?: string;
  appliedFinalisationVersion?: number;
  quickScoring?: QuickScoringMetadata;
};

export type MockMatchFormValues = {
  matchDate: string;
  matchNumber: number | "";
  startTime: string;
  matchName: string;
  teamAName: string;
  teamBName: string;
  teamATotal: number;
  teamBTotal: number;
  scheduledOversPerInnings: number | "";
  battingMode: BattingMode | "";
  notes: string;
};
