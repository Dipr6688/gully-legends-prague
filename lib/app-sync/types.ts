import type {
  BattingMode,
  MatchRecord,
  QuickScoringEvent,
  TeamId
} from "@/lib/types/match";

export type ApkImportReviewStatus =
  | "pending_review"
  | "correction_pending"
  | "finalised"
  | "rejected";

export type AppSyncMatchPayload = {
  offlineMatchId: string;
  syncVersion: number;
  isDemo: boolean;
  startedAt: string;
  completedAt?: string | null;
  matchName: string;
  venue?: string;
  scheduledOversPerInnings: number;
  battingMode: BattingMode;
  battingFirstTeamId: TeamId;
  teamAName?: string;
  teamBName?: string;
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
  sharedPlayerId?: string | null;
  fieldingHelperIds?: string[];
  inningsAEvents: QuickScoringEvent[];
  inningsBEvents: QuickScoringEvent[];
  selectedPlayerOfMatchId?: string | null;
};

export type ApkMatchImport = {
  id: string;
  offlineMatchId: string;
  source: string;
  isDemo: boolean;
  syncVersion: number;
  reviewStatus: ApkImportReviewStatus;
  startedAt: string | null;
  completedAt: string | null;
  matchDate: string | null;
  importedAt: string;
  updatedAt: string;
  rawPayload: AppSyncMatchPayload;
  derivedMatch: MatchRecord | null;
  validationResult: Record<string, unknown> | null;
  finalisedMatchId: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
};
