"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
  type ReactNode
} from "react";
import {
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Plus,
  RotateCcw,
  Save,
  Shuffle,
  Swords,
  Trash2,
  Trophy,
  UserPlus,
  Users
} from "lucide-react";
import { activePlayers } from "@/lib/data/players";
import {
  buildTeamInnings,
  buildTeamMatchData,
  canEditQuickScoring,
  calculateBattingAllocation,
  calculateBowlerWickets,
  calculateScoreFromBowlingFeed,
  calculateWicketsLost,
  calculatePlayerCatches,
  calculatePlayerHatTricks,
  calculatePlayerRunOuts,
  calculatePlayerStumpings,
  applySharedPlayerToRosters,
  getFinalResultHeadline,
  getEligibleFieldingPlayerIds,
  getFieldingHelperIds,
  calculateMatchResult,
  formatInningsScore,
  getDismissedBatterIds,
  getInningsCompleteMessage,
  getInningsState,
  getLiveResultPreview,
  getChasingTeamId,
  getLiveInningsScore,
  getMaximumRunsForPlayer,
  getNextBattingPosition,
  isDismissalComplete,
  isBowlingOverComplete,
  normalizeBattingPosition,
  normalizeNonNegativeIntegerInput,
  normalizeStoredRuns,
  sanitizeRuns,
  setPlayerAvailability,
  sortBattingPerformances,
  getOrdinaryCrossTeamPlayerIds,
  getPlayerAssignment,
  getPerformanceKey,
  getPerformanceRecordKey,
  getRecordedActivityPlayerIds,
  hasOddAvailablePlayers,
  syncDismissalRows,
  toggleTeamSelection,
  validateReadyToStart
} from "@/lib/match-records";
import type {
  LiveInningsScore,
  MatchValidationStage,
  PlayerAssignment
} from "@/lib/match-records";
import {
  DEFAULT_BATTING_MODE,
  createEmptyQuickScoringMetadata,
  createQuickScoringEvent,
  deriveQuickScoringInnings,
  getQuickScoringEventsForTeam,
  getQuickScoringInningsKey,
  nextQuickScoringSequence,
  replaceQuickScoringEvent,
  undoLastQuickScoringEvent,
  type QuickScoringDerivedInnings
} from "@/lib/quick-scoring";
import { applyFinalisedMatchToLocalCareerStats } from "@/lib/career-store";
import {
  finalizeSupabaseAdminMatch,
  saveSupabaseAdminMatch
} from "@/lib/admin-match-write-client";
import { reopenSupabaseMonthlyBeasts } from "@/lib/admin-monthly-beasts-client";
import { isSupabaseDataSource } from "@/lib/data-source";
import { localMatchRepository } from "@/lib/match-repository";
import { useMatchRepository } from "@/components/matches/useMatchRepository";
import { PostMatchCelebration } from "@/components/matches/PostMatchCelebration";
import {
  getLiveMatchConflict,
  getNextAvailableMatchNumber,
  getPragueMatchDate,
  hasDuplicateMatchNumber
} from "@/lib/next-match";
import {
  calculateMatchXP,
  calculatePlayerMatchXP,
  calculateSharedPlayerMatchXP
} from "@/lib/progression";
import { getPlayerOfMatchRecommendation } from "@/lib/player-of-match";
import type {
  BattingMode,
  BowlingOver,
  DismissalEvent,
  DismissalType,
  FinalisedPlayerMatchRecord,
  InningsState,
  MatchRecord,
  MatchResult,
  MatchStatus,
  MockMatchFormValues,
  PlayerMatchPerformance,
  PlayerMatchXPBreakdown,
  QuickScoringDismissalType,
  TeamInnings,
  TeamId
} from "@/lib/types/match";
import type { Player } from "@/lib/types/player";
import type { PostMatchCelebrationSummary } from "@/lib/post-match-celebration";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ReopenMonthlyBeastsDialog } from "@/components/monthly-beasts/MonthlyBeastsFeature";
import {
  formatMonthLabel,
  formatMonthTitle,
  getMatchMonthKey
} from "@/lib/monthly-beasts";
import { monthlyBeastCrownRepository } from "@/lib/monthly-beasts-store";
import {
  formatCompletedOvers,
  formatCricketOversFromLegalBalls
} from "@/lib/match-scorecard";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type TeamKey = "A" | "B";
type TeamBowlingState = Record<TeamId, BowlingOver[]>;

type ValidationResponse = {
  ok: boolean;
  errors: string[];
  totals: {
    teamATotal: number;
    teamBTotal: number;
  };
  completedOvers: Record<TeamId, number>;
  result: MatchResult;
};

type ValidateAndSetStatusOptions = {
  skipMonthlyCrownGuard?: boolean;
};

type SetupValidationErrors = Partial<
  Record<
    | "matchDate"
    | "matchName"
    | "overs"
    | "battingFirst"
    | "battingMode"
    | "availability"
    | "sharedPlayer"
    | "teamAssignment",
    string
  >
>;

type QuickSelectionErrors = Partial<
  Record<"striker" | "nonStriker" | "bowler", string>
>;

type QuickWicketErrors = Partial<
  Record<"dismissedPlayer" | "completedRuns" | "fielder" | "newBatter", string>
>;

const FIXED_TEAM_A_NAME = "Team A";
const FIXED_TEAM_B_NAME = "Team B";

const initialValues: MockMatchFormValues = {
  matchDate: "",
  matchNumber: "",
  startTime: "",
  matchName: "Gully Premier League",
  teamAName: FIXED_TEAM_A_NAME,
  teamBName: FIXED_TEAM_B_NAME,
  teamATotal: 0,
  teamBTotal: 0,
  scheduledOversPerInnings: "",
  battingMode: "",
  notes: ""
};

const allPlayerIds = activePlayers.map((player) => player.id);

function createInitialFormValues(matches: MatchRecord[] = []): MockMatchFormValues {
  const matchDate = getPragueMatchDate();

  return {
    ...initialValues,
    matchDate,
    matchNumber: getNextAvailableMatchNumber(matches, matchDate),
    startTime: ""
  };
}

const initialQuickWicketDraft = {
  open: false,
  type: "bowled" as QuickScoringDismissalType,
  dismissedPlayerId: "",
  fielderId: "",
  newBatterId: "",
  completedRuns: "" as number | "",
  nextStrikerId: "",
  nextNonStrikerId: ""
};

function createLocalMatchId() {
  return `local-match-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createPerformance(
  playerId: string,
  teamId: TeamId
): PlayerMatchPerformance {
  return {
    playerId,
    teamId,
    representingTeamId: teamId,
    played: true,
    playerOfMatch: false,
    didBat: false,
    battingPosition: null,
    runs: "",
    wasOut: false,
    wickets: 0,
    hatTricks: 0,
    catches: 0,
    runOuts: 0,
    stumpings: 0
  };
}

function createBowlingEntry(
  teamId: TeamId,
  overNumber: number
): BowlingOver {
  const battingTeamId = getChasingTeamId(teamId);

  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    bowlingTeamId: teamId,
    battingTeamId,
    bowlerId: "",
    overNumber,
    runsConceded: "",
    wicketsTaken: "",
    dismissals: [],
    maiden: false
  };
}

function getFormValuesFromMatch(match: MatchRecord): MockMatchFormValues {
  return {
    matchDate: match.matchDate,
    matchNumber: match.matchNumber ?? "",
    startTime: match.startTime ?? "",
    matchName: match.matchName,
    teamAName: FIXED_TEAM_A_NAME,
    teamBName: FIXED_TEAM_B_NAME,
    teamATotal: match.teams.teamA.totalRuns,
    teamBTotal: match.teams.teamB.totalRuns,
    scheduledOversPerInnings: match.scheduledOversPerInnings ?? "",
    battingMode:
      match.battingMode ??
      match.quickScoring?.battingMode ??
      DEFAULT_BATTING_MODE,
    notes: ""
  };
}

function getAvailablePlayerIdsFromMatch(match: MatchRecord): string[] {
  return Array.from(
    new Set([
      ...match.teams.teamA.playerIds,
      ...match.teams.teamB.playerIds
    ])
  );
}

function getPerformanceStateFromMatch(
  match: MatchRecord
): Record<string, PlayerMatchPerformance> {
  return Object.fromEntries(
    [
      ...match.teams.teamA.playerPerformances,
      ...match.teams.teamB.playerPerformances
    ].map((performance) => [
      getPerformanceRecordKey(performance),
      {
        ...performance,
        battingPosition: normalizeBattingPosition(performance.battingPosition),
        runs: normalizeStoredRuns(performance.runs)
      }
    ])
  );
}

function getScheduledOversValue(value: number | ""): number | null {
  return value === "" ? null : sanitizeRuns(value);
}

function getMatchNumberValue(value: number | ""): number | null {
  return value === "" ? null : sanitizeRuns(value);
}

function formatAutomaticMatchDate(matchDate: string): string {
  if (!matchDate) return "Today";

  const [year, month, day] = matchDate.split("-").map(Number);

  if (!year || !month || !day) return matchDate;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Prague"
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function getSetupValidationMessage(error: string) {
  if (error === "Scheduled overs per innings must be a positive integer.") {
    return "Please select the number of overs.";
  }

  if (error === "SELECT THE BATTING-FIRST TEAM") {
    return "Please select which team will bat first.";
  }

  if (error === "Every non-shared available player must appear in exactly one team.") {
    return "Please assign all available players to Team A or Team B.";
  }

  return error;
}

function getRequiredSummary(count: number) {
  return count === 1
    ? "Please complete 1 required field."
    : `Please complete ${count} required fields.`;
}

function getInputClass(hasError?: boolean) {
  return [
    "rounded-md border bg-black/35 px-3 py-3 text-stone-100 outline-none disabled:opacity-60",
    hasError
      ? "border-neon-red ring-2 ring-neon-red/45 focus:ring-neon-red"
      : "border-white/15 focus:ring-2 focus:ring-neon-cyan"
  ].join(" ");
}

function ErrorText({ children }: { children?: string }) {
  if (!children) return null;

  return (
    <p className="rounded-md border border-neon-red/40 bg-neon-red/10 px-3 py-2 text-xs font-black uppercase text-red-100">
      {children}
    </p>
  );
}

function FieldingHelperControls({
  players,
  sharedPlayerId,
  selectedHelperIds,
  disabled,
  onToggle,
  onSelectAll,
  onClear
}: {
  players: Player[];
  sharedPlayerId: string | null;
  selectedHelperIds: string[];
  disabled: boolean;
  onToggle: (playerId: string, selected: boolean) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const selectedIds = new Set(selectedHelperIds);
  const selectablePlayers = players.filter((player) => player.id !== sharedPlayerId);

  return (
    <section className="mt-4 rounded-lg border border-neon-green/30 bg-neon-green/10 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="text-lg font-black uppercase text-neon-green">
            Fielding Helpers - Optional
          </h4>
          <p className="text-sm font-bold text-green-100/85">
            Select players who may help field for either side. Fielding helpers can take catches and run-outs for either team, but cannot bowl for the opposite side.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || selectablePlayers.length === 0}
            onClick={onSelectAll}
          >
            SELECT ALL
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={disabled || selectedHelperIds.length === 0}
            onClick={onClear}
          >
            CLEAR HELPERS
          </Button>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {players.length === 0 ? (
          <p className="rounded-md border border-white/10 bg-black/25 p-3 text-sm font-bold text-stone-300 sm:col-span-2 lg:col-span-4">
            Mark players Available Today before choosing helpers.
          </p>
        ) : null}
        {players.map((player) => {
          const isShared = player.id === sharedPlayerId;

          return (
            <label
              key={`fielding-helper-${player.id}`}
              className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-stone-100 hover:bg-white/10 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
            >
              <span className="flex flex-wrap items-center gap-2">
                {player.name}
                {isShared ? (
                  <b className="rounded border border-neon-yellow/35 bg-neon-yellow/10 px-2 py-0.5 text-[10px] font-black uppercase text-neon-yellow">
                    Auto eligible
                  </b>
                ) : null}
              </span>
              <input
                type="checkbox"
                checked={isShared || selectedIds.has(player.id)}
                disabled={disabled || isShared}
                onChange={(event) => onToggle(player.id, event.target.checked)}
                className="h-5 w-5 accent-neon-green"
              />
            </label>
          );
        })}
      </div>
    </section>
  );
}

export function MockMatchEntryForm({
  initialMatch = null,
  matches: suppliedMatches,
  isAdmin = true
}: {
  initialMatch?: MatchRecord | null;
  matches?: MatchRecord[];
  isAdmin?: boolean;
} = {}) {
  const router = useRouter();
  const supabaseWriteMode = isSupabaseDataSource();
  const { matches: localSavedMatches } = useMatchRepository();
  const savedMatches = suppliedMatches ?? localSavedMatches;
  const loadedMatchIdRef = useRef<string | null>(null);
  const [matchId, setMatchId] = useState(() => initialMatch?.id ?? createLocalMatchId());
  const [supabaseUpdatedAt, setSupabaseUpdatedAt] = useState<string | null>(
    () => initialMatch?.supabaseUpdatedAt ?? null
  );
  const [values, setValues] = useState<MockMatchFormValues>(() =>
    initialMatch ? getFormValuesFromMatch(initialMatch) : createInitialFormValues(savedMatches)
  );
  const [availablePlayerIds, setAvailablePlayerIds] = useState<string[]>(() =>
    initialMatch ? getAvailablePlayerIdsFromMatch(initialMatch) : []
  );
  const [teamA, setTeamA] = useState<string[]>(
    () => initialMatch?.teams.teamA.playerIds ?? []
  );
  const [teamB, setTeamB] = useState<string[]>(
    () => initialMatch?.teams.teamB.playerIds ?? []
  );
  const [sharedPlayerId, setSharedPlayerId] = useState<string | null>(
    () => initialMatch?.sharedPlayerId ?? null
  );
  const [fieldingHelperIds, setFieldingHelperIds] = useState<string[]>(() =>
    getFieldingHelperIds({
      availablePlayerIds: initialMatch ? getAvailablePlayerIdsFromMatch(initialMatch) : [],
      sharedPlayerId: initialMatch?.sharedPlayerId ?? null,
      fieldingHelperIds: initialMatch?.fieldingHelperIds
    })
  );
  const [battingFirstTeamId, setBattingFirstTeamId] = useState<TeamId | "">(
    () => initialMatch?.battingFirstTeamId ?? ""
  );
  const [quickScoring, setQuickScoring] = useState(
    () => initialMatch?.quickScoring ?? createEmptyQuickScoringMetadata()
  );
  const [setupExpanded, setSetupExpanded] = useState(
    () =>
      !(
        initialMatch?.quickScoring?.setupLocked === true ||
        initialMatch?.status === "in_progress" ||
        initialMatch?.status === "finalised"
      )
  );
  const [setupValidationAttempted, setSetupValidationAttempted] = useState(false);
  const [quickValidationAttempted, setQuickValidationAttempted] = useState(false);
  const [wicketValidationAttempted, setWicketValidationAttempted] = useState(false);
  const [detailedRecordsExpanded, setDetailedRecordsExpanded] = useState(false);
  const setupSectionRef = useRef<HTMLElement | null>(null);
  const quickSectionRef = useRef<HTMLElement | null>(null);
  const [quickSelection, setQuickSelection] = useState({
    strikerId: "",
    nonStrikerId: "",
    bowlerId: ""
  });
  const [quickWicketDraft, setQuickWicketDraft] = useState<{
    open: boolean;
    type: QuickScoringDismissalType;
    dismissedPlayerId: string;
    fielderId: string;
    newBatterId: string;
    completedRuns: number | "";
    nextStrikerId: string;
    nextNonStrikerId: string;
  }>(initialQuickWicketDraft);
  const [quickNoBallOpen, setQuickNoBallOpen] = useState(false);
  const [playerOfMatchSelectionMode, setPlayerOfMatchSelectionMode] = useState<
    "auto" | "manual"
  >(() => (initialMatch?.finalisedPlayerRecords?.some((record) => record.playerOfMatch) ? "manual" : "auto"));
  const [quickSaveStatus, setQuickSaveStatus] = useState("Saved");
  const [performances, setPerformances] = useState<
    Record<string, PlayerMatchPerformance>
  >(() => (initialMatch ? getPerformanceStateFromMatch(initialMatch) : {}));
  const [inningsExtras, setInningsExtras] = useState<Record<TeamId, number>>({
    teamA: 0,
    teamB: 0
  });
  const [bowlingOvers, setBowlingOvers] = useState<TeamBowlingState>(() => ({
    teamA: initialMatch?.teams.teamA.bowlingOvers ?? [],
    teamB: initialMatch?.teams.teamB.bowlingOvers ?? []
  }));
  const [status, setStatus] = useState<MatchStatus>(
    () => initialMatch?.status ?? "draft"
  );
  const [isBalancing, setIsBalancing] = useState(false);
  const [finalisedXPBreakdowns, setFinalisedXPBreakdowns] = useState<
    Record<string, PlayerMatchXPBreakdown>
  >({});
  const [postMatchCelebration, setPostMatchCelebration] = useState<{
    summary: PostMatchCelebrationSummary;
    match: MatchRecord;
  } | null>(null);
  const [message, setMessage] = useState(
    "Match workflow ready. Enter team, innings and player records."
  );
  const [isSavingMatch, setIsSavingMatch] = useState(false);
  const [isCreatingDemoTestMatch, setIsCreatingDemoTestMatch] = useState(false);
  const [playerUpdateOpen, setPlayerUpdateOpen] = useState(false);
  const [playerUpdateAssignments, setPlayerUpdateAssignments] = useState<
    Record<string, PlayerAssignment>
  >({});
  const [playerUpdateFieldingHelperIds, setPlayerUpdateFieldingHelperIds] =
    useState<string[]>([]);
  const [playerUpdateErrors, setPlayerUpdateErrors] = useState<string[]>([]);
  const [cancelConfirmationOpen, setCancelConfirmationOpen] = useState(false);
  const [restartSetupNoticeOpen, setRestartSetupNoticeOpen] = useState(false);
  const [liveConflictMatchId, setLiveConflictMatchId] = useState<string | null>(null);
  const [blockedCrownMonthKey, setBlockedCrownMonthKey] = useState<string | null>(
    null
  );
  const [reopenCrownMonthKey, setReopenCrownMonthKey] = useState<string | null>(
    null
  );
  const [hasAdminWriteAccess, setHasAdminWriteAccess] = useState(
    () => !supabaseWriteMode || isAdmin
  );

  const canEditMatch = !supabaseWriteMode || hasAdminWriteAccess;
  const isLocked = status === "finalised" || !canEditMatch;
  const isFinalised = status === "finalised";
  const canSafelyReopenFinalisedMatch = false;
  const isDemoMatch = initialMatch?.isDemo === true;
  const isDemoTestMatch = initialMatch?.isDemoTestMatch === true;
  const isNewMatch =
    !initialMatch &&
    status === "draft" &&
    battingFirstTeamId === "" &&
    availablePlayerIds.length === 0 &&
    teamA.length === 0 &&
    teamB.length === 0 &&
    sharedPlayerId === null &&
    fieldingHelperIds.length === 0 &&
    bowlingOvers.teamA.length === 0 &&
    bowlingOvers.teamB.length === 0 &&
    Object.keys(performances).length === 0;
  const matchPageTitle = isNewMatch
    ? "CREATE MATCH"
    : status === "draft"
      ? "EDIT MATCH"
      : status === "in_progress"
        ? "LIVE MATCH ENTRY"
        : "MATCH SCORECARD";
  const setupIsLocked = status !== "draft" || quickScoring.setupLocked === true;
  const setupIsCollapsed = setupIsLocked && !setupExpanded;
  const isRosterLocked = setupIsLocked || !canEditMatch;

  useEffect(() => {
    if (!supabaseWriteMode) {
      return;
    }

    let isCurrent = true;
    const supabase = createSupabaseBrowserClient();

    async function refreshAdminWriteAccess({ preserveServerAdmin = false } = {}) {
      const { data, error } = await supabase.auth.getUser();

      if (!isCurrent) return;

      if (error || !data.user) {
        if (!preserveServerAdmin) {
          setHasAdminWriteAccess(false);
          setIsSavingMatch(false);
          setQuickSaveStatus("Login required");
          setMessage("Admin login required to continue scoring.");
        }
        return;
      }

      const { data: isVerifiedAdmin, error: adminError } =
        await supabase.rpc("is_admin");

      if (!isCurrent) return;

      if (adminError) {
        if (!preserveServerAdmin) {
          setHasAdminWriteAccess(false);
        }
        return;
      }

      setHasAdminWriteAccess(isVerifiedAdmin === true);
    }

    void refreshAdminWriteAccess({ preserveServerAdmin: isAdmin });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        void refreshAdminWriteAccess();
      } else {
        setHasAdminWriteAccess(false);
        setIsSavingMatch(false);
        setQuickSaveStatus("Login required");
        setMessage("Admin login required to continue scoring.");
      }
    });

    return () => {
      isCurrent = false;
      subscription.unsubscribe();
    };
  }, [isAdmin, supabaseWriteMode]);

  useEffect(() => {
    if (!initialMatch || loadedMatchIdRef.current === initialMatch.id) return;

    loadedMatchIdRef.current = initialMatch.id;
    setMatchId(initialMatch.id);
    setSupabaseUpdatedAt(initialMatch.supabaseUpdatedAt ?? null);
    setValues(getFormValuesFromMatch(initialMatch));
    setAvailablePlayerIds(getAvailablePlayerIdsFromMatch(initialMatch));
    setTeamA(initialMatch.teams.teamA.playerIds);
    setTeamB(initialMatch.teams.teamB.playerIds);
    setSharedPlayerId(initialMatch.sharedPlayerId ?? null);
    setFieldingHelperIds(
      getFieldingHelperIds({
        availablePlayerIds: getAvailablePlayerIdsFromMatch(initialMatch),
        sharedPlayerId: initialMatch.sharedPlayerId ?? null,
        fieldingHelperIds: initialMatch.fieldingHelperIds
      })
    );
    setBattingFirstTeamId(initialMatch.battingFirstTeamId ?? "");
    setQuickScoring(initialMatch.quickScoring ?? createEmptyQuickScoringMetadata());
    setSetupExpanded(
      !(
        initialMatch.quickScoring?.setupLocked === true ||
        initialMatch.status === "in_progress" ||
        initialMatch.status === "finalised"
      )
    );
    setPerformances(getPerformanceStateFromMatch(initialMatch));
    setPlayerOfMatchSelectionMode(
      initialMatch.finalisedPlayerRecords?.some((record) => record.playerOfMatch)
        ? "manual"
        : "auto"
    );
    setBowlingOvers({
      teamA: initialMatch.teams.teamA.bowlingOvers,
      teamB: initialMatch.teams.teamB.bowlingOvers
    });
    setStatus(initialMatch.status);
    setMessage("Saved match loaded.");
  }, [initialMatch]);

  useEffect(() => {
    document.title = `${matchPageTitle} | Gully Legends Prague`;
  }, [matchPageTitle]);

  useEffect(() => {
    if (!isNewMatch) return;

    const refreshAutomaticSchedule = window.setTimeout(() => {
      setValues((current) => {
        const matchDate = current.matchDate || getPragueMatchDate();
        const nextMatchNumber = getNextAvailableMatchNumber(
          savedMatches,
          matchDate
        );

        if (
          current.matchDate === matchDate &&
          current.matchNumber === nextMatchNumber
        ) {
          return current;
        }

        return {
          ...current,
          matchDate,
          matchNumber: nextMatchNumber
        };
      });
    }, 0);

    return () => window.clearTimeout(refreshAutomaticSchedule);
  }, [isNewMatch, savedMatches]);

  const availablePlayers = useMemo(
    () => activePlayers.filter((player) => availablePlayerIds.includes(player.id)),
    [availablePlayerIds]
  );
  const normalisedFieldingHelperIds = useMemo(
    () =>
      getFieldingHelperIds({
        availablePlayerIds,
        sharedPlayerId,
        fieldingHelperIds
      }),
    [availablePlayerIds, fieldingHelperIds, sharedPlayerId]
  );
  const fieldingHelperPlayers = useMemo(
    () =>
      activePlayers.filter((player) =>
        normalisedFieldingHelperIds.includes(player.id)
      ),
    [normalisedFieldingHelperIds]
  );
  const allAvailablePlayersCanFieldBothWays =
    availablePlayerIds.length > 0 &&
    availablePlayerIds.every(
      (playerId) =>
        playerId === sharedPlayerId || normalisedFieldingHelperIds.includes(playerId)
    );
  const fieldingHelperSummary = allAvailablePlayersCanFieldBothWays
    ? "ALL AVAILABLE PLAYERS"
    : fieldingHelperPlayers.length > 0
      ? fieldingHelperPlayers.map((player) => player.name).join(", ")
      : sharedPlayerId
        ? `${getPlayerDisplayName(activePlayers, sharedPlayerId)} auto eligible`
        : "No extra helpers";
  const unassignedPlayers = useMemo(
    () =>
      availablePlayers.filter(
        (player) =>
          player.id !== sharedPlayerId &&
          !teamA.includes(player.id) &&
          !teamB.includes(player.id)
      ),
    [availablePlayers, sharedPlayerId, teamA, teamB]
  );
  const teamAPlayers = useMemo(
    () => activePlayers.filter((player) => teamA.includes(player.id)),
    [teamA]
  );
  const teamBPlayers = useMemo(
    () => activePlayers.filter((player) => teamB.includes(player.id)),
    [teamB]
  );
  const teamAFieldingPlayers = getPlayerOptionsByIds(
    getEligibleFieldingPlayerIds({
      bowlingPlayerIds: teamA,
      fieldingHelperIds: normalisedFieldingHelperIds
    })
  );
  const teamBFieldingPlayers = getPlayerOptionsByIds(
    getEligibleFieldingPlayerIds({
      bowlingPlayerIds: teamB,
      fieldingHelperIds: normalisedFieldingHelperIds
    })
  );
  const activeBattingMode: BattingMode =
    values.battingMode || quickScoring.battingMode || DEFAULT_BATTING_MODE;
  const validationBattingMode =
    status === "draft" ? values.battingMode || null : activeBattingMode;
  const quickTeamADerived = useMemo(
    () =>
      deriveQuickScoringInnings({
        battingTeamId: "teamA",
        bowlingTeamId: "teamB",
        battingPlayerIds: teamA,
        bowlingPlayerIds: teamB,
        fieldingPlayerIds: getEligibleFieldingPlayerIds({
          bowlingPlayerIds: teamB,
          fieldingHelperIds: normalisedFieldingHelperIds
        }),
        events: quickScoring.inningsAEvents,
        battingMode: activeBattingMode
      }),
    [activeBattingMode, normalisedFieldingHelperIds, quickScoring.inningsAEvents, teamA, teamB]
  );
  const quickTeamBDerived = useMemo(
    () =>
      deriveQuickScoringInnings({
        battingTeamId: "teamB",
        bowlingTeamId: "teamA",
        battingPlayerIds: teamB,
        bowlingPlayerIds: teamA,
        fieldingPlayerIds: getEligibleFieldingPlayerIds({
          bowlingPlayerIds: teamA,
          fieldingHelperIds: normalisedFieldingHelperIds
        }),
        events: quickScoring.inningsBEvents,
        battingMode: activeBattingMode
      }),
    [activeBattingMode, normalisedFieldingHelperIds, quickScoring.inningsBEvents, teamA, teamB]
  );
  const hasQuickScoringEvents =
    quickScoring.inningsAEvents.length + quickScoring.inningsBEvents.length > 0;

  useEffect(() => {
    if (!hasQuickScoringEvents || isLocked) return;

    let isCurrent = true;

    queueMicrotask(() => {
      if (!isCurrent) return;

      setPerformances((current) => {
        const next = { ...current };

        for (const performance of [
          ...quickTeamADerived.battingPerformances,
          ...quickTeamBDerived.battingPerformances
        ]) {
          const key = getPerformanceRecordKey(performance);
          const existing = next[key];

          next[key] = {
            ...(existing ?? performance),
            ...performance,
            playerOfMatch: existing?.playerOfMatch ?? false
          };
        }

        return next;
      });

      setBowlingOvers({
        teamA: quickTeamBDerived.bowlingOvers,
        teamB: quickTeamADerived.bowlingOvers
      });
    });

    return () => {
      isCurrent = false;
    };
  }, [
    hasQuickScoringEvents,
    isLocked,
    quickTeamADerived.battingPerformances,
    quickTeamADerived.bowlingOvers,
    quickTeamBDerived.battingPerformances,
    quickTeamBDerived.bowlingOvers
  ]);

  const hasOddAttendance = hasOddAvailablePlayers(availablePlayerIds);
  const ordinaryDuplicatePlayers = useMemo(
    () =>
      getOrdinaryCrossTeamPlayerIds({
        teamAPlayerIds: teamA,
        teamBPlayerIds: teamB,
        sharedPlayerId
      }),
    [sharedPlayerId, teamA, teamB]
  );
  const canUseTeamControls =
    !hasOddAttendance || Boolean(sharedPlayerId);
  const availableSummary = {
    uniquePlayers: availablePlayerIds.length,
    teamASize: teamA.length,
    teamBSize: teamB.length,
    sharedSlots: sharedPlayerId ? 1 : 0
  };

  const canEditLockedSetup =
    setupIsLocked && !isFinalised && !hasQuickScoringEvents;
  const setupErrors = useMemo<SetupValidationErrors>(() => {
    if (setupIsLocked) return {};

    const errors: SetupValidationErrors = {};
    const selectedIds = new Set([...teamA, ...teamB]);

    if (!values.matchDate) {
      errors.matchDate = "Please select the match date.";
    }

    if (!values.matchName.trim()) {
      errors.matchName = "Please enter the match name.";
    }

    if (availablePlayerIds.length === 0) {
      errors.availability = "Please select the available players.";
    }

    if (
      !Number.isInteger(values.scheduledOversPerInnings) ||
      sanitizeRuns(values.scheduledOversPerInnings) <= 0
    ) {
      errors.overs = "Please select overs per innings.";
    }

    if (!battingFirstTeamId) {
      errors.battingFirst = "Please select which team will bat first.";
    }

    if (!values.battingMode) {
      errors.battingMode = "Please select a batting mode.";
    }

    if (hasOddAttendance && !sharedPlayerId) {
      errors.sharedPlayer = "Please select one Shared Player.";
    }

    const hasIncompleteTeamAssignment = availablePlayerIds.some((playerId) => {
      const inTeamA = teamA.includes(playerId);
      const inTeamB = teamB.includes(playerId);

      if (playerId === sharedPlayerId) {
        return !inTeamA || !inTeamB;
      }

      return inTeamA === inTeamB;
    });

    if (
      availablePlayerIds.length > 0 &&
      (teamA.length === 0 ||
        teamB.length === 0 ||
        teamA.length !== teamB.length ||
        hasIncompleteTeamAssignment ||
        [...selectedIds].some((playerId) => !availablePlayerIds.includes(playerId)) ||
        ordinaryDuplicatePlayers.length > 0)
    ) {
      errors.teamAssignment =
        "Please assign all available players to Team A or Team B.";
    }

    return errors;
  }, [
    availablePlayerIds,
    battingFirstTeamId,
    hasOddAttendance,
    ordinaryDuplicatePlayers.length,
    setupIsLocked,
    sharedPlayerId,
    teamA,
    teamB,
    values.matchDate,
    values.matchName,
    values.battingMode,
    values.scheduledOversPerInnings
  ]);
  const setupErrorCount = Object.keys(setupErrors).length;
  const visibleSetupErrors = setupValidationAttempted ? setupErrors : {};

  const teamAPerformances = useMemo(
    () =>
      buildPerformanceList(
        teamAPlayers,
        "teamA",
        performances,
        bowlingOvers.teamA,
        bowlingOvers.teamB,
        normalisedFieldingHelperIds
      ),
    [bowlingOvers.teamA, bowlingOvers.teamB, normalisedFieldingHelperIds, performances, teamAPlayers]
  );
  const teamBPerformances = useMemo(
    () =>
      buildPerformanceList(
        teamBPlayers,
        "teamB",
        performances,
        bowlingOvers.teamB,
        bowlingOvers.teamA,
        normalisedFieldingHelperIds
      ),
    [bowlingOvers.teamA, bowlingOvers.teamB, normalisedFieldingHelperIds, performances, teamBPlayers]
  );
  const performanceList = useMemo(
    () => [...teamAPerformances, ...teamBPerformances],
    [teamAPerformances, teamBPerformances]
  );
  const playerOfMatchId =
    performanceList.find((performance) => performance.playerOfMatch)?.playerId ?? "";
  const playedPlayers = activePlayers.filter((player) =>
    performanceList.some(
      (performance) => performance.playerId === player.id && performance.played
    )
  );
  const teamAInningsScore = useMemo(
    () =>
      getLiveInningsScore({
        battingTeamId: "teamA",
        opposingBowlingOvers: bowlingOvers.teamB,
        playerPerformances: teamAPerformances,
        extras: inningsExtras.teamA
      }),
    [bowlingOvers.teamB, inningsExtras.teamA, teamAPerformances]
  );
  const teamBInningsScore = useMemo(
    () =>
      getLiveInningsScore({
        battingTeamId: "teamB",
        opposingBowlingOvers: bowlingOvers.teamA,
        playerPerformances: teamBPerformances,
        extras: inningsExtras.teamB
      }),
    [bowlingOvers.teamA, inningsExtras.teamB, teamBPerformances]
  );
  const teamTotals = useMemo(
    () => ({
      teamATotal: teamAInningsScore.runs,
      teamBTotal: teamBInningsScore.runs
    }),
    [teamAInningsScore.runs, teamBInningsScore.runs]
  );
  const effectiveBattingFirstTeamId: TeamId = battingFirstTeamId || "teamA";
  const chasingTeamId = getChasingTeamId(effectiveBattingFirstTeamId);
  const scheduledOversForCalculations = sanitizeRuns(
    values.scheduledOversPerInnings
  );
  const firstInnings = useMemo(
    () =>
      buildTeamInnings({
        battingTeamId: effectiveBattingFirstTeamId,
        battingPlayerIds:
          effectiveBattingFirstTeamId === "teamA" ? teamA : teamB,
        performances: performanceList,
        bowlingOvers:
          effectiveBattingFirstTeamId === "teamA"
            ? bowlingOvers.teamB
            : bowlingOvers.teamA,
        extras: inningsExtras[effectiveBattingFirstTeamId]
      }),
    [bowlingOvers.teamA, bowlingOvers.teamB, effectiveBattingFirstTeamId, inningsExtras, performanceList, teamA, teamB]
  );
  const secondInnings = useMemo(
    () =>
      buildTeamInnings({
        battingTeamId: chasingTeamId,
        battingPlayerIds: chasingTeamId === "teamA" ? teamA : teamB,
        performances: performanceList,
        bowlingOvers:
          chasingTeamId === "teamA" ? bowlingOvers.teamB : bowlingOvers.teamA,
        extras: inningsExtras[chasingTeamId]
      }),
    [bowlingOvers.teamA, bowlingOvers.teamB, chasingTeamId, inningsExtras, performanceList, teamA, teamB]
  );
  const liveResult = useMemo(
    () =>
      calculateMatchResult(
        status,
        effectiveBattingFirstTeamId,
        firstInnings,
        secondInnings
      ),
    [effectiveBattingFirstTeamId, firstInnings, secondInnings, status]
  );
  const allBowlingOvers = useMemo(
    () => [...bowlingOvers.teamA, ...bowlingOvers.teamB],
    [bowlingOvers.teamA, bowlingOvers.teamB]
  );
  const playerOfMatchRecommendation = useMemo(
    () =>
      getPlayerOfMatchRecommendation({
        performances: performanceList,
        allBowlingOvers,
        result: liveResult,
        sharedPlayerId
      }),
    [allBowlingOvers, liveResult, performanceList, sharedPlayerId]
  );
  const recordedActivityPlayerIds = useMemo(
    () =>
      new Set(
        getRecordedActivityPlayerIds({
          performances: performanceList,
          bowlingOvers,
          quickScoring
        })
      ),
    [bowlingOvers, performanceList, quickScoring]
  );
  const playerUpdateSharedPlayerId =
    activePlayers.find(
      (player) => playerUpdateAssignments[player.id] === "shared"
    )?.id ?? null;
  const playerUpdateAvailablePlayers = activePlayers.filter(
    (player) => (playerUpdateAssignments[player.id] ?? "unassigned") !== "unassigned"
  );
  const normalisedPlayerUpdateFieldingHelperIds = getFieldingHelperIds({
    availablePlayerIds: playerUpdateAvailablePlayers.map((player) => player.id),
    sharedPlayerId: playerUpdateSharedPlayerId,
    fieldingHelperIds: playerUpdateFieldingHelperIds
  });
  const target = firstInnings.runs + 1;
  const teamABowlingInningsState = useMemo(
    () =>
      getInningsState({
        battingTeamId: "teamB",
        bowlingTeamId: "teamA",
        battingPlayerCount: teamB.length,
        bowlingOvers: bowlingOvers.teamA,
        scheduledOvers: scheduledOversForCalculations,
        runs: teamTotals.teamBTotal,
        target: chasingTeamId === "teamB" ? target : undefined
      }),
    [
      bowlingOvers.teamA,
      chasingTeamId,
      target,
      teamB.length,
      teamTotals.teamBTotal,
      scheduledOversForCalculations
    ]
  );
  const teamBBowlingInningsState = useMemo(
    () =>
      getInningsState({
        battingTeamId: "teamA",
        bowlingTeamId: "teamB",
        battingPlayerCount: teamA.length,
        bowlingOvers: bowlingOvers.teamB,
        scheduledOvers: scheduledOversForCalculations,
        runs: teamTotals.teamATotal,
        target: chasingTeamId === "teamA" ? target : undefined
      }),
    [
      bowlingOvers.teamB,
      chasingTeamId,
      target,
      teamA.length,
      teamTotals.teamATotal,
      scheduledOversForCalculations
    ]
  );
  const secondInningsIsComplete =
    chasingTeamId === "teamA"
      ? teamBBowlingInningsState.isComplete
      : teamABowlingInningsState.isComplete;
  const firstInningsIsComplete =
    effectiveBattingFirstTeamId === "teamA"
      ? teamBBowlingInningsState.isComplete
      : teamABowlingInningsState.isComplete;
  const firstInningsWasCompleted =
    Boolean(quickScoring.firstInningsCompletedAt) || firstInningsIsComplete;
  const secondInningsEvents = getQuickScoringEventsForTeam(
    quickScoring,
    chasingTeamId
  );
  const storedQuickInningsPhase = quickScoring.inningsPhase ?? null;
  const quickInningsPhase =
    storedQuickInningsPhase === "first_innings" && firstInningsWasCompleted
      ? "innings_break"
      : storedQuickInningsPhase ??
        (secondInningsEvents.length > 0
          ? "second_innings"
          : firstInningsWasCompleted
            ? "innings_break"
            : "first_innings");
  const isFirstInningsBreak =
    status === "in_progress" &&
    quickInningsPhase === "innings_break" &&
    firstInningsWasCompleted;
  const quickScoringBaseCanBeEdited = canEditQuickScoring({
    canEditMatch,
    status,
    setupIsLocked,
    inningsPhase: quickInningsPhase,
    battingFirstTeamId
  });
  const quickActiveBattingTeamId: TeamId =
    quickInningsPhase === "second_innings"
      ? chasingTeamId
      : effectiveBattingFirstTeamId;
  const quickActiveBowlingTeamId = getChasingTeamId(quickActiveBattingTeamId);
  const quickActiveBattingPlayers =
    quickActiveBattingTeamId === "teamA" ? teamAPlayers : teamBPlayers;
  const quickActiveBowlingPlayers =
    quickActiveBowlingTeamId === "teamA" ? teamAPlayers : teamBPlayers;
  const quickActiveFieldingPlayers = getPlayerOptionsByIds(
    getEligibleFieldingPlayerIds({
      bowlingPlayerIds:
        quickActiveBowlingTeamId === "teamA" ? teamA : teamB,
      fieldingHelperIds: normalisedFieldingHelperIds
    })
  );
  const quickActiveDerived =
    quickActiveBattingTeamId === "teamA" ? quickTeamADerived : quickTeamBDerived;
  const quickActiveEvents = getQuickScoringEventsForTeam(
    quickScoring,
    quickActiveBattingTeamId
  );
  const quickActiveInningsState = useMemo(
    () =>
      getInningsState({
        battingTeamId: quickActiveBattingTeamId,
        bowlingTeamId: quickActiveBowlingTeamId,
        battingPlayerCount: quickActiveBattingPlayers.length,
        bowlingOvers: quickActiveDerived.bowlingOvers,
        scheduledOvers: scheduledOversForCalculations,
        runs: quickActiveDerived.runs,
        target: quickInningsPhase === "second_innings" ? target : undefined
      }),
    [
      quickActiveBattingPlayers.length,
      quickActiveBattingTeamId,
      quickActiveBowlingTeamId,
      quickActiveDerived.bowlingOvers,
      quickActiveDerived.runs,
      quickInningsPhase,
      scheduledOversForCalculations,
      target
    ]
  );
  const quickActiveInningsCompleteMessage =
    getInningsCompleteMessage(quickActiveInningsState);
  const quickScoringCanBeEdited =
    quickScoringBaseCanBeEdited &&
    !quickActiveInningsState.isComplete &&
    !playerUpdateOpen;
  const canUndoQuickScoring =
    !isLocked &&
    !playerUpdateOpen &&
    status === "in_progress" &&
    quickActiveEvents.length > 0;
  const quickDismissedPlayerIdsForState = getQuickDismissedPlayerIds(quickActiveDerived);
  const quickUndismissedBattingPlayers = quickActiveBattingPlayers.filter(
    (player) => !quickDismissedPlayerIdsForState.has(player.id)
  );
  const quickRequiresNonStriker =
    activeBattingMode === "two_batter" &&
    !quickActiveDerived.isLastBatterSolo &&
    quickUndismissedBattingPlayers.length >= 2;
  const quickSelectionErrors = useMemo<QuickSelectionErrors>(() => {
    const errors: QuickSelectionErrors = {};
    const dismissedPlayerIds = getQuickDismissedPlayerIds(quickActiveDerived);
    const battingPlayerIds = new Set(
      quickActiveBattingPlayers.map((player) => player.id)
    );
    const bowlingPlayerIds = new Set(
      quickActiveBowlingPlayers.map((player) => player.id)
    );

    if (!setupIsLocked || isLocked) {
      return errors;
    }

    if (!quickSelection.strikerId) {
      errors.striker = "Please select the striker.";
    } else if (!battingPlayerIds.has(quickSelection.strikerId)) {
      errors.striker = "Select a striker from the batting team.";
    } else if (dismissedPlayerIds.has(quickSelection.strikerId)) {
      errors.striker = "A dismissed batter cannot face the next ball.";
    }

    if (quickRequiresNonStriker && !quickSelection.nonStrikerId) {
      errors.nonStriker = "Please select the non-striker.";
    } else if (
      quickRequiresNonStriker &&
      !battingPlayerIds.has(quickSelection.nonStrikerId)
    ) {
      errors.nonStriker = "Select a non-striker from the batting team.";
    } else if (
      quickRequiresNonStriker &&
      dismissedPlayerIds.has(quickSelection.nonStrikerId)
    ) {
      errors.nonStriker = "A dismissed batter cannot face the next ball.";
    }

    if (
      quickRequiresNonStriker &&
      quickSelection.strikerId &&
      quickSelection.nonStrikerId &&
      quickSelection.strikerId === quickSelection.nonStrikerId
    ) {
      errors.striker = "Striker and non-striker must be different players.";
      errors.nonStriker = "Striker and non-striker must be different players.";
    }

    if (!quickSelection.bowlerId) {
      errors.bowler =
        quickActiveDerived.isBetweenOvers
          ? "Please select the next bowler."
          : "Please select the bowler.";
    } else if (!bowlingPlayerIds.has(quickSelection.bowlerId)) {
      errors.bowler = "Select a bowler from the bowling team.";
    } else if (
      quickActiveDerived.isBetweenOvers &&
      quickActiveDerived.previousOverBowlerId === quickSelection.bowlerId
    ) {
      errors.bowler = "Select a different bowler for the next over.";
    }

    return errors;
  }, [
    isLocked,
    quickActiveBattingPlayers,
    quickActiveBowlingPlayers,
    quickActiveDerived,
    quickRequiresNonStriker,
    quickSelection.bowlerId,
    quickSelection.nonStrikerId,
    quickSelection.strikerId,
    setupIsLocked
  ]);
  const visibleQuickSelectionErrors = quickValidationAttempted
    ? quickSelectionErrors
    : {};
  const quickWicketErrors = useMemo<QuickWicketErrors>(() => {
    const errors: QuickWicketErrors = {};

    if (!quickWicketDraft.open) {
      return errors;
    }

    const dismissedPlayerId =
      quickWicketDraft.type === "run_out"
        ? quickRequiresNonStriker
          ? quickWicketDraft.dismissedPlayerId
          : quickSelection.strikerId
        : quickWicketDraft.dismissedPlayerId || quickSelection.strikerId;
    const survivorId =
      quickRequiresNonStriker && dismissedPlayerId === quickSelection.strikerId
        ? quickSelection.nonStrikerId
        : quickSelection.strikerId;
    const dismissedPlayerIds = getQuickDismissedPlayerIds(quickActiveDerived);
    const battingPlayerIds = new Set(
      quickActiveBattingPlayers.map((player) => player.id)
    );
    const fieldingPlayerIds = new Set(
      quickActiveFieldingPlayers.map((player) => player.id)
    );
    const activeBatterIds = [
      quickSelection.strikerId,
      quickRequiresNonStriker ? quickSelection.nonStrikerId : ""
    ].filter(Boolean);
    const hasAvailableReplacement = quickActiveBattingPlayers.some(
      (player) =>
        !activeBatterIds.includes(player.id) &&
        player.id !== dismissedPlayerId &&
        !dismissedPlayerIds.has(player.id)
    );

    if (!dismissedPlayerId) {
      errors.dismissedPlayer =
        quickWicketDraft.type === "run_out"
          ? "Please select who was run out."
          : "Please select the dismissed batter.";
    } else if (
      !activeBatterIds.includes(dismissedPlayerId)
    ) {
      errors.dismissedPlayer =
        "The dismissed batter must be one of the active batters.";
    }

    if (
      quickWicketDraft.type === "run_out" &&
      quickWicketDraft.completedRuns === ""
    ) {
      errors.completedRuns =
        "Please select the completed runs before the run out.";
    }

    if (
      (quickWicketDraft.type === "caught" ||
        quickWicketDraft.type === "stumped" ||
        quickWicketDraft.type === "run_out") &&
      !quickWicketDraft.fielderId
    ) {
      errors.fielder =
        quickWicketDraft.type === "caught"
          ? "Please select the catcher."
          : quickWicketDraft.type === "stumped"
            ? "Please select the stumper."
          : "Please select the run-out fielder.";
    } else if (
      (quickWicketDraft.type === "caught" ||
        quickWicketDraft.type === "stumped" ||
        quickWicketDraft.type === "run_out") &&
      !fieldingPlayerIds.has(quickWicketDraft.fielderId)
    ) {
      errors.fielder = "Select a player from the fielding side or Fielding Helpers.";
    } else if (
      quickWicketDraft.type === "stumped" &&
      quickWicketDraft.fielderId === quickSelection.bowlerId
    ) {
      errors.fielder = "The bowler cannot also be selected as the stumper.";
    }

    if (
      quickWicketDraft.newBatterId &&
      (quickWicketDraft.newBatterId === survivorId ||
        quickWicketDraft.newBatterId === dismissedPlayerId ||
        !battingPlayerIds.has(quickWicketDraft.newBatterId) ||
        dismissedPlayerIds.has(quickWicketDraft.newBatterId))
    ) {
      errors.newBatter = "Select an eligible new batter.";
    } else if (hasAvailableReplacement && !quickWicketDraft.newBatterId) {
      errors.newBatter = "Please select the new batter.";
    }

    return errors;
  }, [
    quickActiveBattingPlayers,
    quickActiveDerived,
    quickActiveFieldingPlayers,
    quickRequiresNonStriker,
    quickSelection.bowlerId,
    quickSelection.nonStrikerId,
    quickSelection.strikerId,
    quickWicketDraft
  ]);
  const visibleQuickWicketErrors = wicketValidationAttempted
    ? quickWicketErrors
    : {};

  useEffect(() => {
    if (!hasQuickScoringEvents) return;

    let isCurrent = true;

    queueMicrotask(() => {
      if (!isCurrent) return;

      setQuickSelection((current) => ({
        strikerId: quickActiveDerived.currentStrikerId ?? current.strikerId,
        nonStrikerId: quickRequiresNonStriker
          ? quickActiveDerived.currentNonStrikerId ?? current.nonStrikerId
          : "",
        bowlerId: quickActiveDerived.currentBowlerId ?? ""
      }));
    });

    return () => {
      isCurrent = false;
    };
  }, [
    hasQuickScoringEvents,
    quickActiveDerived.currentBowlerId,
    quickActiveDerived.currentNonStrikerId,
    quickActiveDerived.currentStrikerId,
    quickRequiresNonStriker
  ]);

  useEffect(() => {
    if (isLocked || playerOfMatchSelectionMode !== "auto") return;

    let isCurrent = true;

    queueMicrotask(() => {
      if (!isCurrent) return;

      setPerformances((current) => {
        const recommendedPlayerId =
          playerOfMatchRecommendation.recommendedPlayerId;
        const alreadyMatches = Object.values(current).every((performance) =>
          Boolean(recommendedPlayerId) && performance.playerId === recommendedPlayerId
            ? performance.playerOfMatch
            : !performance.playerOfMatch
        );

        if (alreadyMatches) return current;

        return Object.fromEntries(
          Object.entries(current).map(([key, performance]) => [
            key,
            {
              ...performance,
              playerOfMatch:
                Boolean(recommendedPlayerId) &&
                performance.playerId === recommendedPlayerId
            }
          ])
        );
      });
    });

    return () => {
      isCurrent = false;
    };
  }, [
    isLocked,
    playerOfMatchRecommendation.recommendedPlayerId,
    playerOfMatchSelectionMode
  ]);

  function applyRosters(
    nextAvailable: string[],
    nextTeamA: string[],
    nextTeamB: string[],
    nextSharedPlayerId = sharedPlayerId
  ) {
    if (isRosterLocked) return;

    const validSharedPlayerId =
      nextSharedPlayerId && nextAvailable.includes(nextSharedPlayerId)
        ? nextSharedPlayerId
        : null;
    const nextRosters = applySharedPlayerToRosters({
      teamAPlayerIds: nextTeamA,
      teamBPlayerIds: nextTeamB,
      sharedPlayerId: validSharedPlayerId
    });
    const nextTeamAIds = new Set(nextRosters.teamAPlayerIds);
    const nextTeamBIds = new Set(nextRosters.teamBPlayerIds);
    const nextSelectedContextKeys = new Set([
      ...nextRosters.teamAPlayerIds.map((playerId) => getPerformanceKey(playerId, "teamA")),
      ...nextRosters.teamBPlayerIds.map((playerId) => getPerformanceKey(playerId, "teamB"))
    ]);
    setAvailablePlayerIds(nextAvailable);
    setSharedPlayerId(validSharedPlayerId);
    setTeamA(nextRosters.teamAPlayerIds);
    setTeamB(nextRosters.teamBPlayerIds);
    setPerformances((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key, performance]) =>
          nextSelectedContextKeys.has(
            key.includes(":") ? key : getPerformanceRecordKey(performance)
          )
        )
      )
    );
    setBowlingOvers((current) => ({
      teamA: current.teamA.map((over) =>
        nextTeamAIds.has(over.bowlerId) ? over : { ...over, bowlerId: "" }
      ),
      teamB: current.teamB.map((over) =>
        nextTeamBIds.has(over.bowlerId) ? over : { ...over, bowlerId: "" }
      )
    }));
  }

  function createAssignmentStateFromCurrentRosters() {
    return Object.fromEntries(
      activePlayers.map((player) => [
        player.id,
        getPlayerAssignment(player.id, {
          teamAPlayerIds: teamA,
          teamBPlayerIds: teamB,
          sharedPlayerId
        })
      ])
    ) as Record<string, PlayerAssignment>;
  }

  function openPlayerUpdatePanel() {
    if (status !== "in_progress" || isFinalised || !canEditMatch) return;

    resetQuickDeliveryEditors();
    setCancelConfirmationOpen(false);
    setSetupExpanded(false);
    setPlayerUpdateAssignments(createAssignmentStateFromCurrentRosters());
    setPlayerUpdateFieldingHelperIds(normalisedFieldingHelperIds);
    setPlayerUpdateErrors([]);
    setPlayerUpdateOpen(true);
    setMessage("Quick Scoring paused. Update players, then save or discard.");
  }

  function openActiveSetupPanel() {
    setCancelConfirmationOpen(false);
    setPlayerUpdateOpen(false);
    setPlayerUpdateErrors([]);
    setPlayerUpdateAssignments({});
    setPlayerUpdateFieldingHelperIds([]);
    setSetupExpanded(true);
  }

  function toggleActiveSetupPanel() {
    if (setupExpanded) {
      setSetupExpanded(false);
      return;
    }

    openActiveSetupPanel();
  }

  function openRestartConfirmation() {
    setPlayerUpdateOpen(false);
    setPlayerUpdateErrors([]);
    setPlayerUpdateAssignments({});
    setPlayerUpdateFieldingHelperIds([]);
    setSetupExpanded(false);
    setCancelConfirmationOpen(true);
  }

  function closePlayerUpdatePanel() {
    setPlayerUpdateOpen(false);
    setPlayerUpdateErrors([]);
    setPlayerUpdateAssignments({});
    setPlayerUpdateFieldingHelperIds([]);
    setMessage("Player update discarded. Quick Scoring is unchanged.");
  }

  function getLockedPlayerUpdateMessage(
    playerId: string,
    assignment: PlayerAssignment
  ) {
    const playerName = getPlayerDisplayName(activePlayers, playerId);

    if (assignment === "shared") {
      return `${playerName} has already participated as the Shared player. To change the Shared player safely, restart this match.`;
    }

    return `${playerName} has already participated in the match and cannot be reassigned.`;
  }

  function hasHelperOnlyFieldingActivity(playerId: string) {
    const currentAssignment = getPlayerAssignment(playerId, {
      teamAPlayerIds: teamA,
      teamBPlayerIds: teamB,
      sharedPlayerId
    });

    if (currentAssignment === "shared" || currentAssignment === "unassigned") {
      return false;
    }

    const helperOnlyQuickEvent = [
      ...quickScoring.inningsAEvents,
      ...quickScoring.inningsBEvents
    ].some(
      (event) =>
        event.wicket &&
        (event.wicket.type === "caught" || event.wicket.type === "run_out") &&
        event.wicket.fielderId === playerId &&
        event.bowlingTeamId !== currentAssignment
    );

    if (helperOnlyQuickEvent) return true;

    return allBowlingOvers.some(
      (over) =>
        over.bowlingTeamId !== currentAssignment &&
        over.dismissals.some(
          (dismissal) =>
            (dismissal.type === "caught" || dismissal.type === "run_out") &&
            dismissal.fielderId === playerId
        )
    );
  }

  function getLockedFieldingHelperMessage(playerId: string) {
    const playerName = getPlayerDisplayName(activePlayers, playerId);

    return `${playerName} has already helped in the field. To change that helper safely, restart this match.`;
  }

  function changePlayerUpdateAssignment(
    playerId: string,
    assignment: PlayerAssignment
  ) {
    const currentAssignment = getPlayerAssignment(playerId, {
      teamAPlayerIds: teamA,
      teamBPlayerIds: teamB,
      sharedPlayerId
    });

    if (
      recordedActivityPlayerIds.has(playerId) &&
      assignment !== currentAssignment
    ) {
      setPlayerUpdateErrors([
        getLockedPlayerUpdateMessage(playerId, currentAssignment)
      ]);
      return;
    }

    setPlayerUpdateErrors([]);
    setPlayerUpdateAssignments((current) => {
      const next = { ...current, [playerId]: assignment };

      if (assignment === "shared") {
        for (const [candidateId, candidateAssignment] of Object.entries(next)) {
          if (candidateId === playerId || candidateAssignment !== "shared") continue;

          if (recordedActivityPlayerIds.has(candidateId)) {
            setPlayerUpdateErrors([
              getLockedPlayerUpdateMessage(candidateId, "shared")
            ]);
            return current;
          }

          next[candidateId] = "unassigned";
        }
      }

      return next;
    });
  }

  function changePlayerUpdateFieldingHelper(
    playerId: string,
    selected: boolean
  ) {
    if (playerId === playerUpdateSharedPlayerId) return;

    if (
      !selected &&
      playerUpdateFieldingHelperIds.includes(playerId) &&
      hasHelperOnlyFieldingActivity(playerId)
    ) {
      setPlayerUpdateErrors([getLockedFieldingHelperMessage(playerId)]);
      return;
    }

    setPlayerUpdateErrors([]);
    setPlayerUpdateFieldingHelperIds((current) =>
      selected
        ? Array.from(new Set([...current, playerId]))
        : current.filter((id) => id !== playerId)
    );
  }

  function selectAllPlayerUpdateFieldingHelpers() {
    const assignedPlayerIds = activePlayers
      .filter(
        (player) =>
          (playerUpdateAssignments[player.id] ?? "unassigned") !== "unassigned" &&
          player.id !== playerUpdateSharedPlayerId
      )
      .map((player) => player.id);

    setPlayerUpdateErrors([]);
    setPlayerUpdateFieldingHelperIds(assignedPlayerIds);
  }

  function clearPlayerUpdateFieldingHelpers() {
    const lockedHelperIds = playerUpdateFieldingHelperIds.filter((playerId) =>
      hasHelperOnlyFieldingActivity(playerId)
    );

    if (lockedHelperIds.length > 0) {
      setPlayerUpdateErrors([
        getLockedFieldingHelperMessage(lockedHelperIds[0])
      ]);
      setPlayerUpdateFieldingHelperIds(lockedHelperIds);
      return;
    }

    setPlayerUpdateErrors([]);
    setPlayerUpdateFieldingHelperIds([]);
  }

  function getRostersFromAssignments(assignments: Record<string, PlayerAssignment>) {
    const nextAvailable = activePlayers
      .filter((player) => assignments[player.id] !== "unassigned")
      .map((player) => player.id);
    const nextSharedPlayerId =
      activePlayers.find((player) => assignments[player.id] === "shared")?.id ?? null;
    const assignedTeamA = activePlayers
      .filter((player) => assignments[player.id] === "teamA")
      .map((player) => player.id);
    const assignedTeamB = activePlayers
      .filter((player) => assignments[player.id] === "teamB")
      .map((player) => player.id);
    const nextRosters = applySharedPlayerToRosters({
      teamAPlayerIds: assignedTeamA,
      teamBPlayerIds: assignedTeamB,
      sharedPlayerId: nextSharedPlayerId
    });

    return {
      availablePlayerIds: nextAvailable,
      teamAPlayerIds: nextRosters.teamAPlayerIds,
      teamBPlayerIds: nextRosters.teamBPlayerIds,
      sharedPlayerId: nextRosters.sharedPlayerId
    };
  }

  function buildPerformanceStateForRosters(
    nextTeamA: string[],
    nextTeamB: string[]
  ) {
    const selectedContextKeys = new Set([
      ...nextTeamA.map((playerId) => getPerformanceKey(playerId, "teamA")),
      ...nextTeamB.map((playerId) => getPerformanceKey(playerId, "teamB"))
    ]);
    const next: Record<string, PlayerMatchPerformance> = {};

    for (const playerId of nextTeamA) {
      const key = getPerformanceKey(playerId, "teamA");
      next[key] = {
        ...(performances[key] ?? createPerformance(playerId, "teamA")),
        teamId: "teamA",
        representingTeamId: "teamA",
        played: true
      };
    }

    for (const playerId of nextTeamB) {
      const key = getPerformanceKey(playerId, "teamB");
      next[key] = {
        ...(performances[key] ?? createPerformance(playerId, "teamB")),
        teamId: "teamB",
        representingTeamId: "teamB",
        played: true
      };
    }

    for (const [key, performance] of Object.entries(performances)) {
      const recordKey = key.includes(":") ? key : getPerformanceRecordKey(performance);

      if (selectedContextKeys.has(recordKey)) {
        next[recordKey] = {
          ...next[recordKey],
          ...performance
        };
      }
    }

    return next;
  }

  function validatePlayerUpdateAssignments(
    assignments: Record<string, PlayerAssignment>,
    helperIds: string[]
  ) {
    const errors: string[] = [];
    const next = getRostersFromAssignments(assignments);
    const nextFieldingHelperIds = getFieldingHelperIds({
      availablePlayerIds: next.availablePlayerIds,
      sharedPlayerId: next.sharedPlayerId,
      fieldingHelperIds: helperIds
    });
    const nextAssignmentByPlayer = new Map(
      activePlayers.map((player) => [
        player.id,
        getPlayerAssignment(player.id, {
          teamAPlayerIds: next.teamAPlayerIds,
          teamBPlayerIds: next.teamBPlayerIds,
          sharedPlayerId: next.sharedPlayerId
        })
      ])
    );

    for (const playerId of recordedActivityPlayerIds) {
      const currentAssignment = getPlayerAssignment(playerId, {
        teamAPlayerIds: teamA,
        teamBPlayerIds: teamB,
        sharedPlayerId
      });

      if ((nextAssignmentByPlayer.get(playerId) ?? "unassigned") !== currentAssignment) {
        errors.push(
          getLockedPlayerUpdateMessage(playerId, currentAssignment)
        );
      }
    }

    for (const playerId of normalisedFieldingHelperIds) {
      if (
        !nextFieldingHelperIds.includes(playerId) &&
        hasHelperOnlyFieldingActivity(playerId)
      ) {
        errors.push(getLockedFieldingHelperMessage(playerId));
      }
    }

    const validationErrors = validateReadyToStart({
      matchDate: values.matchDate,
      matchNumber: getMatchNumberValue(values.matchNumber),
      startTime: values.startTime || undefined,
      matchName: values.matchName,
      teamAName: values.teamAName,
      teamBName: values.teamBName,
      status,
      stage: "start",
      scheduledOversPerInnings: getScheduledOversValue(
        values.scheduledOversPerInnings
      ),
      battingMode: activeBattingMode,
      battingFirstTeamId: effectiveBattingFirstTeamId,
      fieldingHelperIds: nextFieldingHelperIds,
      inningsExtras,
      availablePlayerIds: next.availablePlayerIds,
      teamAPlayerIds: next.teamAPlayerIds,
      teamBPlayerIds: next.teamBPlayerIds,
      sharedPlayerId: next.sharedPlayerId,
      performances: Object.values(
        buildPerformanceStateForRosters(next.teamAPlayerIds, next.teamBPlayerIds)
      ),
      bowlingOvers
    });

    return {
      ...next,
      fieldingHelperIds: nextFieldingHelperIds,
      errors: [...new Set([...errors, ...validationErrors])]
    };
  }

  async function savePlayerUpdates() {
    if (!canEditMatch || status !== "in_progress") return;

    const validation = validatePlayerUpdateAssignments(
      playerUpdateAssignments,
      playerUpdateFieldingHelperIds
    );

    if (validation.errors.length > 0) {
      setPlayerUpdateErrors(validation.errors);
      return;
    }

    const nextPerformances = buildPerformanceStateForRosters(
      validation.teamAPlayerIds,
      validation.teamBPlayerIds
    );
    const nextTeamAIds = new Set(validation.teamAPlayerIds);
    const nextTeamBIds = new Set(validation.teamBPlayerIds);
    const nextBowlingOvers = {
      teamA: bowlingOvers.teamA.map((over) =>
        !over.bowlerId || nextTeamAIds.has(over.bowlerId)
          ? over
          : { ...over, bowlerId: "" }
      ),
      teamB: bowlingOvers.teamB.map((over) =>
        !over.bowlerId || nextTeamBIds.has(over.bowlerId)
          ? over
          : { ...over, bowlerId: "" }
      )
    };
    const nextMatch = buildCurrentMatchRecord(
      "in_progress",
      liveResult,
      new Date().toISOString(),
      quickScoring,
      {
        teamAPlayerIds: validation.teamAPlayerIds,
        teamBPlayerIds: validation.teamBPlayerIds,
        sharedPlayerId: validation.sharedPlayerId,
        availablePlayerIds: validation.availablePlayerIds,
        fieldingHelperIds: validation.fieldingHelperIds,
        performances: nextPerformances,
        bowlingOvers: nextBowlingOvers
      }
    );

    setIsSavingMatch(true);

    try {
      const saved = await persistNonFinalisedMatch(nextMatch);

      if (!saved) return;

      setAvailablePlayerIds(validation.availablePlayerIds);
      setTeamA(validation.teamAPlayerIds);
      setTeamB(validation.teamBPlayerIds);
      setSharedPlayerId(validation.sharedPlayerId);
      setFieldingHelperIds(validation.fieldingHelperIds);
      setPerformances(nextPerformances);
      setBowlingOvers(nextBowlingOvers);
      setQuickSelection((current) => {
        const battingIds = new Set(
          quickActiveBattingTeamId === "teamA"
            ? validation.teamAPlayerIds
            : validation.teamBPlayerIds
        );
        const bowlingIds = new Set(
          quickActiveBowlingTeamId === "teamA"
            ? validation.teamAPlayerIds
            : validation.teamBPlayerIds
        );

        return {
          strikerId: battingIds.has(current.strikerId) ? current.strikerId : "",
          nonStrikerId: battingIds.has(current.nonStrikerId)
            ? current.nonStrikerId
            : "",
          bowlerId: bowlingIds.has(current.bowlerId) ? current.bowlerId : ""
        };
      });
      setPlayerUpdateOpen(false);
      setPlayerUpdateAssignments({});
      setPlayerUpdateFieldingHelperIds([]);
      setPlayerUpdateErrors([]);
      setQuickValidationAttempted(false);
      setWicketValidationAttempted(false);
      setMessage("Player changes saved. Quick Scoring can continue.");
    } finally {
      setIsSavingMatch(false);
    }
  }

  function selectAllAvailable() {
    if (isRosterLocked) return;
    applyRosters(allPlayerIds, teamA, teamB, null);
    setMessage("All players marked available for this match.");
  }

  function clearAvailability() {
    if (isRosterLocked) return;
    if (
      Object.keys(performances).length > 0 &&
      !window.confirm("Removing this player will also remove their draft match data. Continue?")
    ) {
      return;
    }

    applyRosters([], [], [], null);
    setMessage("Availability cleared. Team selections were also cleared.");
  }

  function clearTeams() {
    if (isRosterLocked) return;
    applyRosters(availablePlayerIds, [], [], sharedPlayerId);
    setMessage("Teams cleared. Available players are unchanged.");
  }

  function toggleFieldingHelper(playerId: string, selected: boolean) {
    if (isRosterLocked || playerId === sharedPlayerId) return;

    setFieldingHelperIds((current) =>
      selected
        ? Array.from(new Set([...current, playerId]))
        : current.filter((id) => id !== playerId)
    );
  }

  function selectAllFieldingHelpers() {
    if (isRosterLocked) return;

    setFieldingHelperIds(
      availablePlayerIds.filter((playerId) => playerId !== sharedPlayerId)
    );
  }

  function clearFieldingHelpers() {
    if (isRosterLocked) return;

    setFieldingHelperIds([]);
  }

  function toggleAvailability(playerId: string, isAvailable: boolean) {
    if (isRosterLocked) return;
    const hasPlayerPerformance = Object.values(performances).some(
      (performance) => performance.playerId === playerId
    );

    if (
      !isAvailable &&
      hasPlayerPerformance &&
      !window.confirm("Removing this player will also remove their draft match data. Continue?")
    ) {
      return;
    }

    const next = setPlayerAvailability(
      {
        availablePlayerIds,
        teamAPlayerIds: teamA,
        teamBPlayerIds: teamB,
        sharedPlayerId
      },
      playerId,
      isAvailable
    );
    const nextSharedPlayerId =
      hasOddAvailablePlayers(next.availablePlayerIds) &&
      playerId !== sharedPlayerId
        ? sharedPlayerId
        : null;
    applyRosters(
      next.availablePlayerIds,
      next.teamAPlayerIds,
      next.teamBPlayerIds,
      nextSharedPlayerId
    );

    if (playerId === sharedPlayerId && !isAvailable) {
      setMessage("Shared Player was removed from availability. Select one Shared Player to create equal teams.");
    }
  }

  function changeSharedPlayer(playerId: string) {
    if (isRosterLocked) return;

    const nextSharedPlayerId = playerId || null;
    const ordinaryTeamA = teamA.filter((id) => id !== sharedPlayerId && id !== nextSharedPlayerId);
    const ordinaryTeamB = teamB.filter((id) => id !== sharedPlayerId && id !== nextSharedPlayerId);

    applyRosters(availablePlayerIds, ordinaryTeamA, ordinaryTeamB, nextSharedPlayerId);
    setMessage(
      nextSharedPlayerId
        ? "Shared Player selected. They will play for both teams."
        : "Select one Shared Player to create equal teams."
    );
  }

  function togglePlayer(team: TeamKey, playerId: string) {
    if (isRosterLocked) return;
    if (playerId === sharedPlayerId) {
      setMessage("Shared Player is locked in both teams. Change them from the Shared Player selector.");
      return;
    }
    const teamId: TeamId = team === "A" ? "teamA" : "teamB";
    const next = toggleTeamSelection(
      {
        availablePlayerIds,
        teamAPlayerIds: teamA,
        teamBPlayerIds: teamB,
        sharedPlayerId
      },
      teamId,
      playerId
    );
    applyRosters(
      next.availablePlayerIds,
      next.teamAPlayerIds,
      next.teamBPlayerIds,
      sharedPlayerId
    );

    if (
      next.teamAPlayerIds.includes(playerId) ||
      next.teamBPlayerIds.includes(playerId)
    ) {
      updatePerformance(playerId, teamId, { teamId, representingTeamId: teamId });
    }
  }

  async function autoBalanceTeams() {
    if (isRosterLocked) return;

    if (availablePlayerIds.length < 2) {
      setMessage("Select at least two available players before balancing teams.");
      return;
    }

    if (hasOddAttendance && !sharedPlayerId) {
      setMessage("Select one Shared Player to create equal teams.");
      return;
    }

    setIsBalancing(true);

    try {
      const response = await fetch("/api/team-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ availablePlayerIds, sharedPlayerId })
      });
      const result = (await response.json()) as {
        teamAPlayerIds?: string[];
        teamBPlayerIds?: string[];
        error?: string;
      };

      if (!response.ok || !result.teamAPlayerIds || !result.teamBPlayerIds) {
        setMessage(result.error ?? "Could not balance teams. Please try again.");
        return;
      }

      applyRosters(
        availablePlayerIds,
        result.teamAPlayerIds,
        result.teamBPlayerIds,
        sharedPlayerId
      );
      setPerformances((current) => {
        const next = { ...current };

        for (const playerId of result.teamAPlayerIds ?? []) {
          const key = getPerformanceKey(playerId, "teamA");
          next[key] = {
            ...(next[key] ?? createPerformance(playerId, "teamA")),
            teamId: "teamA",
            representingTeamId: "teamA",
            played: true
          };
        }

        for (const playerId of result.teamBPlayerIds ?? []) {
          const key = getPerformanceKey(playerId, "teamB");
          next[key] = {
            ...(next[key] ?? createPerformance(playerId, "teamB")),
            teamId: "teamB",
            representingTeamId: "teamB",
            played: true
          };
        }

        return next;
      });
      setMessage("Teams generated. You can still adjust them manually.");
    } finally {
      setIsBalancing(false);
    }
  }

  function updatePerformance(
    playerId: string,
    representingTeamId: TeamId,
    updates: Partial<PlayerMatchPerformance>
  ) {
    if (isLocked) return;
    const key = getPerformanceKey(playerId, representingTeamId);
    setPerformances((current) => ({
      ...Object.fromEntries(
        Object.entries(current).map(([currentKey, performance]) => [
          currentKey,
          updates.playerOfMatch === true
            ? { ...performance, playerOfMatch: performance.playerId === playerId }
            : updates.playerOfMatch === false && performance.playerId === playerId
              ? { ...performance, playerOfMatch: false }
              : performance
        ])
      ),
      [key]: {
        ...(current[key] ?? createPerformance(playerId, representingTeamId)),
        teamId: representingTeamId,
        representingTeamId,
        ...updates,
        playerOfMatch:
          updates.playerOfMatch === undefined
            ? (current[key]?.playerOfMatch ?? false)
            : updates.playerOfMatch
      }
    }));
  }

  function handleDidBatChange(
    playerId: string,
    representingTeamId: TeamId,
    didBat: boolean
  ) {
    if (isLocked) return;
    const key = getPerformanceKey(playerId, representingTeamId);
    const current =
      performances[key] ??
      createPerformance(playerId, representingTeamId);

    if (
      !didBat &&
      (sanitizeRuns(current.runs) > 0 || current.wasOut) &&
      !window.confirm("Turning off Did Bat will clear this player's runs and Out status.")
    ) {
      return;
    }

    updatePerformance(playerId, representingTeamId, {
      didBat,
      battingPosition: didBat
        ? normalizeBattingPosition(current.battingPosition) ??
          getNextBattingPosition(Object.values(performances), representingTeamId)
        : null,
      runs: didBat ? normalizeStoredRuns(current.runs) : "",
      wasOut: didBat ? current.wasOut : false
    });
  }

  function moveBattingPosition(
    playerId: string,
    representingTeamId: TeamId,
    direction: "up" | "down"
  ) {
    if (isLocked) return;
    const key = getPerformanceKey(playerId, representingTeamId);
    const teamBatters = sortBattingPerformances(
      Object.values(performances).filter(
        (performance) =>
          (performance.representingTeamId ?? performance.teamId) === representingTeamId &&
          performance.didBat
      )
    );
    const currentIndex = teamBatters.findIndex(
      (performance) => getPerformanceRecordKey(performance) === key
    );
    const swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (
      currentIndex < 0 ||
      swapIndex < 0 ||
      swapIndex >= teamBatters.length
    ) {
      return;
    }

    const currentPerformance = teamBatters[currentIndex];
    const swapPerformance = teamBatters[swapIndex];
    const currentPosition =
      normalizeBattingPosition(currentPerformance.battingPosition) ??
      currentIndex + 1;
    const swapPosition =
      normalizeBattingPosition(swapPerformance.battingPosition) ?? swapIndex + 1;
    const swapKey = getPerformanceRecordKey(swapPerformance);

    setPerformances((current) => ({
      ...current,
      [key]: {
        ...(current[key] ?? currentPerformance),
        battingPosition: swapPosition
      },
      [swapKey]: {
        ...(current[swapKey] ?? swapPerformance),
        battingPosition: currentPosition
      }
    }));
  }

  function updateBowlingOver(
    teamId: TeamId,
    id: string,
    updates: Partial<BowlingOver>
  ) {
    if (isLocked) return;
    setBowlingOvers((current) => ({
      ...current,
      [teamId]: current[teamId].map((over) =>
        over.id === id
          ? {
              ...over,
              ...updates,
              dismissals:
                typeof updates.bowlerId === "string"
                  ? over.dismissals.map((dismissal) =>
                      dismissal.type === "run_out"
                        ? dismissal
                        : { ...dismissal, creditedBowlerId: updates.bowlerId || null }
                    )
                  : over.dismissals
            }
          : over
      )
    }));
  }

  function updateWicketsTaken(teamId: TeamId, overId: string, wicketsTaken: number) {
    if (isLocked) return;
    const currentOver = bowlingOvers[teamId].find((over) => over.id === overId);

    if (!currentOver) return;

    if (
      wicketsTaken < currentOver.dismissals.length &&
      currentOver.dismissals
        .slice(wicketsTaken)
        .some((dismissal) => isDismissalComplete(dismissal)) &&
      !window.confirm(
        "Reducing Wickets Taken will remove completed dismissal details from this over. Continue?"
      )
    ) {
      return;
    }

    setBowlingOvers((current) => ({
      ...current,
      [teamId]: current[teamId].map((over) =>
        over.id === overId ? syncDismissalRows(over, wicketsTaken) : over
      )
    }));
  }

  function updateDismissal(
    teamId: TeamId,
    overId: string,
    dismissalId: string,
    updates: Partial<DismissalEvent>
  ) {
    if (isLocked) return;
    const dismissedBatterId = updates.dismissedBatterId;

    setBowlingOvers((current) => ({
      ...current,
      [teamId]: current[teamId].map((over) =>
        over.id === overId
          ? {
              ...over,
              dismissals: over.dismissals.map((dismissal) => {
                if (dismissal.id !== dismissalId) return dismissal;

                const nextType = updates.type ?? dismissal.type;
                const fielderIsRequired =
                  nextType === "caught" ||
                  nextType === "run_out" ||
                  nextType === "stumped";
                const next: DismissalEvent = {
                  ...dismissal,
                  ...updates,
                  type: nextType,
                  creditedBowlerId:
                    nextType === "run_out" ? null : over.bowlerId || null,
                  fielderId:
                    fielderIsRequired && updates.fielderId !== undefined
                        ? updates.fielderId
                        : fielderIsRequired
                          ? dismissal.fielderId
                          : null
                };

                return next;
              })
            }
          : over
      )
    }));

    if (dismissedBatterId) {
      const currentOver = bowlingOvers[teamId].find((over) => over.id === overId);
      const battingTeamId = currentOver?.battingTeamId;

      if (battingTeamId) {
        const key = getPerformanceKey(dismissedBatterId, battingTeamId);

        setPerformances((current) => {
          const existing = current[key] ?? createPerformance(dismissedBatterId, battingTeamId);
          const battingPosition =
            normalizeBattingPosition(existing.battingPosition) ??
            getNextBattingPosition(Object.values(current), battingTeamId);

          return {
            ...current,
            [key]: {
              ...existing,
              teamId: battingTeamId,
              representingTeamId: battingTeamId,
              didBat: true,
              battingPosition,
              runs: normalizeStoredRuns(existing.runs),
              wasOut: true
            }
          };
        });
      }
    }
  }

  function removeDismissal(teamId: TeamId, overId: string, dismissalId: string) {
    if (isLocked) return;
    setBowlingOvers((current) => ({
      ...current,
      [teamId]: current[teamId].map((over) =>
        over.id === overId
            ? {
                ...over,
                dismissals: over.dismissals.filter(
                  (dismissal) => dismissal.id !== dismissalId
                ),
                wicketsTaken: Math.max(0, over.dismissals.length - 1)
              }
          : over
      )
    }));
  }

  function addBowlingOver(teamId: TeamId) {
    if (isLocked) return;
    const currentOvers = bowlingOvers[teamId];
    const inningsState =
      teamId === "teamA" ? teamABowlingInningsState : teamBBowlingInningsState;

    if (inningsState.isComplete) {
      setMessage(getInningsCompleteMessage(inningsState) ?? "This innings is complete.");
      return;
    }

    if (currentOvers.some((over) => !isBowlingOverComplete(over))) {
      setMessage("Complete the dismissal details for the wickets taken in this over.");
      return;
    }

    setBowlingOvers((current) => ({
      ...current,
      [teamId]: [
        ...current[teamId],
        createBowlingEntry(teamId, current[teamId].length + 1)
      ]
    }));
  }

  function removeBowlingOver(teamId: TeamId, id: string) {
    if (isLocked) return;
    setBowlingOvers((current) => ({
      ...current,
      [teamId]: current[teamId]
        .filter((over) => over.id !== id)
        .map((over, index) => ({ ...over, overNumber: index + 1 }))
    }));
  }

  async function autosaveQuickScoring(nextQuickScoring = quickScoring) {
    if (isLocked) return;

    setQuickSaveStatus("Saving...");

    const saved = await persistNonFinalisedMatch(
      buildCurrentMatchRecord(
        status,
        liveResult,
        new Date().toISOString(),
        nextQuickScoring
      )
    );

    setQuickSaveStatus(saved ? "Saved" : "Save needed");
  }

  function updateQuickScoring(nextQuickScoring: typeof quickScoring) {
    if (isLocked) return;

    setQuickScoring(nextQuickScoring);
    void autosaveQuickScoring(nextQuickScoring);
  }

  function resetQuickDeliveryEditors() {
    setQuickNoBallOpen(false);
    setQuickWicketDraft({ ...initialQuickWicketDraft });
    setWicketValidationAttempted(false);
  }

  function updateQuickWicketDraft(draft: typeof quickWicketDraft) {
    if (!draft.open) {
      resetQuickDeliveryEditors();
      return;
    }

    setQuickNoBallOpen(false);
    setQuickWicketDraft(draft);
  }

  function updateQuickNoBallOpen(open: boolean) {
    setQuickNoBallOpen(open);

    if (open) {
      setQuickWicketDraft({ ...initialQuickWicketDraft });
      setWicketValidationAttempted(false);
    }
  }

  function getQuickDismissedPlayerIds(derived: QuickScoringDerivedInnings) {
    return new Set(
      derived.battingPerformances
        .filter((performance) => performance.wasOut)
        .map((performance) => performance.playerId)
    );
  }

  function validateQuickScoringAction() {
    setQuickValidationAttempted(true);

    const errorCount = Object.keys(quickSelectionErrors).length;

    if (!quickScoringCanBeEdited || errorCount > 0) {
      setMessage(
        errorCount > 0
          ? getRequiredSummary(errorCount)
          : "Quick scoring is locked."
      );
      quickSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
      return false;
    }

    return true;
  }

  function appendQuickScoringEvent({
    batterRuns,
    extraType = null,
    extras,
    wicket = null
  }: {
    batterRuns: number;
    extraType?: Parameters<typeof createQuickScoringEvent>[0]["extraType"];
    extras?: number;
    wicket?: Parameters<typeof createQuickScoringEvent>[0]["wicket"];
  }) {
    if (!validateQuickScoringAction()) return false;

    const key = getQuickScoringInningsKey(quickActiveBattingTeamId);
    const events = getQuickScoringEventsForTeam(quickScoring, quickActiveBattingTeamId);
    const event = createQuickScoringEvent({
      battingTeamId: quickActiveBattingTeamId,
      strikerId: quickSelection.strikerId,
      nonStrikerId: quickRequiresNonStriker ? quickSelection.nonStrikerId : "",
      bowlerId: quickSelection.bowlerId,
      batterRuns,
      extraType,
      extras,
      wicket,
      sequence: nextQuickScoringSequence(events)
    });
    const nextEvents = [...events, event];
    let nextQuickScoring = {
      ...quickScoring,
      [key]: nextEvents
    };

    if (
      status === "in_progress" &&
      quickInningsPhase === "first_innings" &&
      quickActiveBattingTeamId === effectiveBattingFirstTeamId
    ) {
      const nextDerived = deriveQuickScoringInnings({
        battingTeamId: quickActiveBattingTeamId,
        bowlingTeamId: quickActiveBowlingTeamId,
        battingPlayerIds:
          quickActiveBattingTeamId === "teamA" ? teamA : teamB,
        bowlingPlayerIds:
          quickActiveBowlingTeamId === "teamA" ? teamA : teamB,
        fieldingPlayerIds: getEligibleFieldingPlayerIds({
          bowlingPlayerIds:
            quickActiveBowlingTeamId === "teamA" ? teamA : teamB,
          fieldingHelperIds: normalisedFieldingHelperIds
        }),
        events: nextEvents,
        battingMode: activeBattingMode
      });
      const nextInningsState = getInningsState({
        battingTeamId: quickActiveBattingTeamId,
        bowlingTeamId: quickActiveBowlingTeamId,
        battingPlayerCount: quickActiveBattingPlayers.length,
        bowlingOvers: nextDerived.bowlingOvers,
        scheduledOvers: scheduledOversForCalculations,
        runs: nextDerived.runs
      });

      if (nextInningsState.isComplete) {
        nextQuickScoring = {
          ...nextQuickScoring,
          inningsPhase: "innings_break",
          firstInningsCompletedAt: new Date().toISOString()
        };
      }
    }

    updateQuickScoring(nextQuickScoring);
    resetQuickDeliveryEditors();
    setQuickValidationAttempted(false);
    setWicketValidationAttempted(false);
    setMessage("Quick scoring event recorded.");
    return true;
  }

  function undoQuickScoringEvent() {
    if (isLocked) return;

    const nextQuickScoring = undoLastQuickScoringEvent(
      quickScoring,
      quickActiveBattingTeamId
    );

    updateQuickScoring(
      isFirstInningsBreak
        ? {
            ...nextQuickScoring,
            inningsPhase: "first_innings",
            firstInningsCompletedAt: undefined
          }
        : nextQuickScoring
    );
    resetQuickDeliveryEditors();
    setQuickValidationAttempted(false);
    setMessage("Last quick scoring event undone.");
  }

  async function startSecondInnings() {
    if (isLocked || !isFirstInningsBreak) return;

    const nextQuickScoring = {
      ...quickScoring,
      inningsPhase: "second_innings" as const,
      secondInningsStartedAt: new Date().toISOString()
    };

    setIsSavingMatch(true);

    try {
      const saved = await persistNonFinalisedMatch(
        buildCurrentMatchRecord(
          "in_progress",
          liveResult,
          new Date().toISOString(),
          nextQuickScoring
        )
      );

      if (!saved) return;

      setQuickScoring(nextQuickScoring);
      setQuickSelection({
        strikerId: "",
        nonStrikerId: "",
        bowlerId: ""
      });
      setQuickValidationAttempted(false);
      setWicketValidationAttempted(false);
      setMessage("Second innings started. Select the next batter and bowler.");
    } finally {
      setIsSavingMatch(false);
    }
  }

  function correctQuickScoringEventToDot(eventId: string) {
    if (isLocked) return;

    const event = getQuickScoringEventsForTeam(
      quickScoring,
      quickActiveBattingTeamId
    ).find((candidate) => candidate.id === eventId);

    if (!event) return;

    updateQuickScoring(
      replaceQuickScoringEvent(quickScoring, quickActiveBattingTeamId, {
        ...event,
        batterRuns: 0,
        extras: 0,
        extraType: null,
        legalDelivery: true,
        wicket: null
      })
    );
    setMessage("Current-over event corrected to dot ball.");
  }

  function submitQuickWicket() {
    setQuickValidationAttempted(true);
    setWicketValidationAttempted(true);

    const selectionErrorCount = Object.keys(quickSelectionErrors).length;
    const wicketErrorCount = Object.keys(quickWicketErrors).length;

    if (selectionErrorCount + wicketErrorCount > 0) {
      setMessage(getRequiredSummary(selectionErrorCount + wicketErrorCount));
      quickSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
      return;
    }

    const dismissedPlayerId =
      quickWicketDraft.type === "run_out"
        ? quickRequiresNonStriker
          ? quickWicketDraft.dismissedPlayerId
          : quickSelection.strikerId
        : quickWicketDraft.dismissedPlayerId || quickSelection.strikerId;

    appendQuickScoringEvent({
      batterRuns: sanitizeRuns(quickWicketDraft.completedRuns),
      extraType: null,
      wicket: {
        type: quickWicketDraft.type,
        dismissedPlayerId,
        fielderId: quickWicketDraft.fielderId || null,
        newBatterId: quickWicketDraft.newBatterId || null,
        completedRuns: sanitizeRuns(quickWicketDraft.completedRuns),
        nextStrikerId: null,
        nextNonStrikerId: null
      }
    });
  }

  function selectPlayerOfMatch(playerId: string) {
    if (isLocked) return;

    setPlayerOfMatchSelectionMode("manual");
    setPerformances((current) =>
      Object.fromEntries(
        Object.entries(current).map(([key, performance]) => [
          key,
          {
            ...performance,
            playerOfMatch: Boolean(playerId) && performance.playerId === playerId
          }
        ])
      )
    );
  }

  function buildCurrentMatchRecord(
    finalStatus: MatchStatus,
    result: MatchResult,
    appliedAt: string,
    quickScoringOverride = quickScoring,
    overrides: {
      matchId?: string;
      formValues?: MockMatchFormValues;
      availablePlayerIds?: string[];
      teamAPlayerIds?: string[];
      teamBPlayerIds?: string[];
      sharedPlayerId?: string | null;
      fieldingHelperIds?: string[];
      performances?: Record<string, PlayerMatchPerformance>;
      bowlingOvers?: TeamBowlingState;
      inningsExtras?: Record<TeamId, number>;
    } = {}
  ): MatchRecord {
    const recordValues = overrides.formValues ?? values;
    const recordAvailablePlayerIds = overrides.availablePlayerIds ?? availablePlayerIds;
    const recordTeamA = overrides.teamAPlayerIds ?? teamA;
    const recordTeamB = overrides.teamBPlayerIds ?? teamB;
    const recordSharedPlayerId =
      overrides.sharedPlayerId === undefined
        ? sharedPlayerId
        : overrides.sharedPlayerId;
    const recordFieldingHelperIds = getFieldingHelperIds({
      availablePlayerIds: recordAvailablePlayerIds,
      sharedPlayerId: recordSharedPlayerId,
      fieldingHelperIds: overrides.fieldingHelperIds ?? fieldingHelperIds
    });
    const recordPerformancesState = overrides.performances ?? performances;
    const recordBowlingOvers = overrides.bowlingOvers ?? bowlingOvers;
    const recordInningsExtras = overrides.inningsExtras ?? inningsExtras;
    const recordTeamAPlayers = activePlayers.filter((player) =>
      recordTeamA.includes(player.id)
    );
    const recordTeamBPlayers = activePlayers.filter((player) =>
      recordTeamB.includes(player.id)
    );
    const recordTeamAPerformances = buildPerformanceList(
      recordTeamAPlayers,
      "teamA",
      recordPerformancesState,
      recordBowlingOvers.teamA,
      recordBowlingOvers.teamB,
      recordFieldingHelperIds
    );
    const recordTeamBPerformances = buildPerformanceList(
      recordTeamBPlayers,
      "teamB",
      recordPerformancesState,
      recordBowlingOvers.teamB,
      recordBowlingOvers.teamA,
      recordFieldingHelperIds
    );
    const recordPerformanceList = [
      ...recordTeamAPerformances,
      ...recordTeamBPerformances
    ];
    const recordFirstInnings = buildTeamInnings({
      battingTeamId: effectiveBattingFirstTeamId,
      battingPlayerIds:
        effectiveBattingFirstTeamId === "teamA" ? recordTeamA : recordTeamB,
      performances: recordPerformanceList,
      bowlingOvers:
        effectiveBattingFirstTeamId === "teamA"
          ? recordBowlingOvers.teamB
          : recordBowlingOvers.teamA,
      extras: recordInningsExtras[effectiveBattingFirstTeamId]
    });
    const recordSecondInnings = buildTeamInnings({
      battingTeamId: chasingTeamId,
      battingPlayerIds: chasingTeamId === "teamA" ? recordTeamA : recordTeamB,
      performances: recordPerformanceList,
      bowlingOvers:
        chasingTeamId === "teamA"
          ? recordBowlingOvers.teamB
          : recordBowlingOvers.teamA,
      extras: recordInningsExtras[chasingTeamId]
    });
    const persistedBattingMode =
      recordValues.battingMode ||
      quickScoringOverride.battingMode ||
      (finalStatus === "draft" ? null : activeBattingMode);
    const persistedQuickScoring = {
      ...quickScoringOverride,
      version: 2 as const,
      battingMode: persistedBattingMode
    };
    const allBowlingOvers = [
      ...recordBowlingOvers.teamA,
      ...recordBowlingOvers.teamB
    ];
    const teamContextFinalisedRecords: FinalisedPlayerMatchRecord[] = recordPerformanceList.map(
      (performance) => ({
        ...performance,
        xpBreakdown: calculatePlayerMatchXP(performance, {
          result,
          overs: allBowlingOvers.filter(
            (over) => over.bowlerId === performance.playerId
          )
        }),
        progressionAppliedAt:
          finalStatus === "finalised" && result.type !== "no_result"
            ? appliedAt
            : undefined
      })
    );
    const finalisedRecordsByContextKey = new Map(
      teamContextFinalisedRecords.map((record) => [getPerformanceRecordKey(record), record])
    );
    const finalisedPlayerRecords = aggregateFinalisedPlayerRecords({
      performances: recordPerformanceList,
      allBowlingOvers,
      result,
      sharedPlayerId: recordSharedPlayerId,
      appliedAt,
      finalStatus
    });
    const teamAMatchData = buildTeamMatchData({
      teamId: "teamA",
      teamName: FIXED_TEAM_A_NAME,
      playerIds: recordTeamA,
      performances: recordPerformanceList,
      bowlingOvers: recordBowlingOvers.teamA
    });
    const teamBMatchData = buildTeamMatchData({
      teamId: "teamB",
      teamName: FIXED_TEAM_B_NAME,
      playerIds: recordTeamB,
      performances: recordPerformanceList,
      bowlingOvers: recordBowlingOvers.teamB
    });

    return {
      id: overrides.matchId ?? matchId,
      isDemo: isDemoMatch,
      isDemoTestMatch,
      matchDate: recordValues.matchDate,
      matchNumber: getMatchNumberValue(recordValues.matchNumber),
      startTime: recordValues.startTime || undefined,
      matchName: recordValues.matchName,
      venue: "CZU Gully Arena",
      status: finalStatus,
      scheduledOversPerInnings: getScheduledOversValue(
        recordValues.scheduledOversPerInnings
      ),
      battingMode: persistedBattingMode,
      battingFirstTeamId:
        finalStatus === "draft" ||
        finalStatus === "abandoned" ||
        finalStatus === "cancelled"
          ? battingFirstTeamId || null
          : effectiveBattingFirstTeamId,
      chasingTeamId:
        finalStatus === "draft" ||
        finalStatus === "abandoned" ||
        finalStatus === "cancelled"
          ? battingFirstTeamId
            ? getChasingTeamId(battingFirstTeamId)
            : null
          : chasingTeamId,
      sharedPlayerId: recordSharedPlayerId,
      fieldingHelperIds: recordFieldingHelperIds,
      quickScoring: persistedQuickScoring,
      teams: {
        teamA: {
          ...teamAMatchData,
          playerPerformances: teamAMatchData.playerPerformances.map(
            (record) => finalisedRecordsByContextKey.get(getPerformanceRecordKey(record)) ?? record
          )
        },
        teamB: {
          ...teamBMatchData,
          playerPerformances: teamBMatchData.playerPerformances.map(
            (record) => finalisedRecordsByContextKey.get(getPerformanceRecordKey(record)) ?? record
          )
        }
      },
      innings: {
        first: recordFirstInnings,
        second: recordSecondInnings
      },
      result,
      finalisedPlayerRecords,
      progressionAppliedAt:
        finalStatus === "finalised" && result.type !== "no_result"
          ? appliedAt
          : undefined,
      appliedFinalisationVersion:
        finalStatus === "finalised" && result.type !== "no_result" ? 1 : undefined
    };
  }

  async function persistNonFinalisedMatch(
    match: MatchRecord,
    expectedUpdatedAt = supabaseUpdatedAt
  ) {
    if (!canEditMatch) {
      setQuickSaveStatus("Login required");
      setMessage("Admin login required to continue scoring.");
      return false;
    }

    if (!supabaseWriteMode) {
      localMatchRepository.saveMatch(match);
      return true;
    }

    const result = await saveSupabaseAdminMatch({
      match,
      expectedUpdatedAt
    });

    if (!result.ok) {
      if (result.code === "live_match_conflict") {
        setLiveConflictMatchId(result.conflictMatchId ?? null);
        setMessage("ANOTHER MATCH IS ALREADY IN PROGRESS");
      } else if (result.code === "stale_record") {
        setMessage("COULD NOT SAVE MATCH. This match changed in another tab. Refresh and try again.");
      } else {
        setMessage(`${result.message}. Your changes were not saved. Please try again.`);
      }

      return false;
    }

    setSupabaseUpdatedAt(result.updatedAt ?? null);
    router.refresh();
    return true;
  }

  async function createDemoTestMatch() {
    if (!supabaseWriteMode || !hasAdminWriteAccess || !isNewMatch) return;

    setIsCreatingDemoTestMatch(true);
    setMessage("Creating Demo Test Match...");

    try {
      const response = await fetch("/api/admin/matches/demo-test", {
        method: "POST"
      });
      const result = (await response.json().catch(() => null)) as
        | { ok?: boolean; matchId?: string; message?: string }
        | null;

      if (!response.ok || !result?.ok || !result.matchId) {
        setMessage(result?.message ?? "COULD NOT CREATE DEMO TEST MATCH");
        return;
      }

      router.push(`/matches/${result.matchId}`);
      router.refresh();
    } finally {
      setIsCreatingDemoTestMatch(false);
    }
  }

  async function editLockedSetupBeforeScoring() {
    if (!canEditLockedSetup || !canEditMatch) return;

    const confirmed = window.confirm(
      "EDIT MATCH SETUP?\n\nNo deliveries have been recorded yet. Quick Scoring will be paused until you Start Match again."
    );

    if (!confirmed) return;

    const nextQuickScoring = {
      ...quickScoring,
      setupLocked: false,
      setupLockedAt: undefined
    };

    setIsSavingMatch(true);

    try {
      const saved = await persistNonFinalisedMatch(
        buildCurrentMatchRecord(
          "draft",
          liveResult,
          new Date().toISOString(),
          nextQuickScoring
        )
      );

      if (!saved) return;

      setQuickScoring(nextQuickScoring);
      setStatus("draft");
      setSetupExpanded(true);
      setSetupValidationAttempted(false);
      setQuickValidationAttempted(false);
      setWicketValidationAttempted(false);
      setMessage("Match setup is editable again. Start Match after corrections.");
    } finally {
      setIsSavingMatch(false);
    }
  }

  async function validateAndSetStatus(
    nextStatus: MatchStatus,
    stage: MatchValidationStage,
    options: ValidateAndSetStatusOptions = {}
  ): Promise<boolean> {
    if (!canEditMatch) {
      setQuickSaveStatus("Login required");
      setMessage("Admin login required to continue scoring.");
      return false;
    }

    setIsSavingMatch(true);

    try {
      setLiveConflictMatchId(null);
      setBlockedCrownMonthKey(null);

      if (stage === "start") {
        setSetupValidationAttempted(true);

        if (setupErrorCount > 0) {
          setMessage(getRequiredSummary(setupErrorCount));
          setupSectionRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
          return false;
        }
      }

      const matchNumber = getMatchNumberValue(values.matchNumber);

      if (
        hasDuplicateMatchNumber({
          matches: savedMatches,
          matchDate: values.matchDate,
          matchNumber,
          currentMatchId: matchId
        })
      ) {
        setMessage(
          `Game ${matchNumber} is already in use for this date. Refresh and try again.`
        );
        return false;
      }

      if (stage === "start") {
        const liveConflict = getLiveMatchConflict(savedMatches, matchId);

        if (liveConflict) {
          setLiveConflictMatchId(liveConflict.id);
          setMessage("ANOTHER MATCH IS ALREADY IN PROGRESS");
          return false;
        }
      }

      if (nextStatus === "finalised" && hasQuickScoringEvents) {
        const quickIssues = [
          ...quickTeamADerived.missingInformation,
          ...quickTeamBDerived.missingInformation
        ];

        if (quickIssues.length > 0) {
          setMessage(
            isDemoMatch
              ? `DEMO VALIDATION FAILED - ${quickIssues[0] ?? "Resolve quick scoring details before completing the demo."}`
              : quickIssues[0] ?? "Resolve quick scoring details before finalising."
          );
          return false;
        }

        if (!secondInningsIsComplete) {
          setMessage(
            isDemoMatch
              ? "DEMO VALIDATION FAILED - Finish the match or innings review before completing the demo."
              : "Finish the match or innings review before finalising."
          );
          return false;
        }
      }

      if (nextStatus === "finalised" && !isDemoMatch && !options.skipMonthlyCrownGuard) {
        if (!supabaseWriteMode) {
          const matchMonthKey = getMatchMonthKey(values.matchDate);
          const activeCrown = matchMonthKey
            ? monthlyBeastCrownRepository.getActiveCrown(matchMonthKey)
            : null;

          if (matchMonthKey && activeCrown) {
            setBlockedCrownMonthKey(matchMonthKey);
            setMessage(
              `${formatMonthLabel(matchMonthKey)} has already been crowned. Reopen the month before finalising this match.`
            );
            return false;
          }
        }
      }

      const response = await fetch("/api/matches/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchDate: values.matchDate,
          matchNumber,
          startTime: values.startTime || undefined,
          matchName: values.matchName,
          teamAName: values.teamAName,
          teamBName: values.teamBName,
          status: nextStatus,
          stage,
          scheduledOversPerInnings: getScheduledOversValue(
            values.scheduledOversPerInnings
          ),
          battingMode: validationBattingMode,
          battingFirstTeamId: battingFirstTeamId || null,
          fieldingHelperIds: normalisedFieldingHelperIds,
          inningsExtras,
          availablePlayerIds,
          teamAPlayerIds: teamA,
          teamBPlayerIds: teamB,
          sharedPlayerId,
          performances: performanceList,
          bowlingOvers
        })
      });
      const result = (await response.json()) as ValidationResponse;

      setValues((current) => ({ ...current, ...result.totals }));

      if (!response.ok || !result.ok) {
        setMessage(
          isDemoMatch && nextStatus === "finalised"
            ? `DEMO VALIDATION FAILED - ${result.errors[0] ?? "Please check the match record."}`
            : stage === "start"
            ? getSetupValidationMessage(
                result.errors[0] ?? "Please check the match setup."
              )
            : result.errors[0] ?? "Please check the match record."
        );
        return false;
      }

      if (nextStatus === "finalised") {
        const appliedAt = new Date().toISOString();
        const finalisedMatch = buildCurrentMatchRecord(
          nextStatus,
          result.result,
          appliedAt
        );

        if (isDemoMatch) {
          setFinalisedXPBreakdowns(
            Object.fromEntries(
              [
                ...finalisedMatch.teams.teamA.playerPerformances,
                ...finalisedMatch.teams.teamB.playerPerformances
              ]
                .filter((record): record is FinalisedPlayerMatchRecord => "xpBreakdown" in record)
                .map((record) => [getPerformanceRecordKey(record), record.xpBreakdown])
            )
          );
          setMessage(
            "DEMO TEST COMPLETED - Validation passed. No official records were changed."
          );
          return true;
        }

        const finalScore = `${values.teamAName} ${formatInningsScore(
          result.totals.teamATotal,
          teamAInningsScore.wicketsLost
        )} vs ${values.teamBName} ${formatInningsScore(
          result.totals.teamBTotal,
          teamBInningsScore.wicketsLost
        )}`;
        const resultHeadline = getFinalResultHeadline(
          result.result,
          values.teamAName,
          values.teamBName
        );
        const selectedPlayerOfMatchLabel = playerOfMatchId
          ? getPlayerDisplayName(activePlayers, playerOfMatchId)
          : "None";
        const confirmed = window.confirm(
          `FINALISE MATCH?\n\n${finalScore}\n${resultHeadline}\n\nPlayer of the Match: ${selectedPlayerOfMatchLabel}\n\nFinalisation updates career statistics, XP, Hall of Legends and Monthly Beasts.`
        );

        if (!confirmed) return false;

        if (supabaseWriteMode) {
          const finaliseResult = await finalizeSupabaseAdminMatch({
            match: finalisedMatch,
            expectedUpdatedAt: supabaseUpdatedAt
          });

          if (!finaliseResult.ok) {
            if (finaliseResult.code === "active_crown") {
              const matchMonthKey = getMatchMonthKey(values.matchDate);

              setMessage(
                `${matchMonthKey ? formatMonthLabel(matchMonthKey) : "This month"} HAS ALREADY BEEN CROWNED. Finalising this match could change the Monthly Beast results. Reopen the month before finalising this match.`
              );
            } else if (finaliseResult.code === "stale_match") {
              setMessage("COULD NOT FINALISE MATCH. This match changed in another tab. Refresh and try again.");
            } else if (finaliseResult.code === "stale_career") {
              setMessage("COULD NOT FINALISE MATCH. Player career data changed. Refresh and try again.");
            } else {
              setMessage(`${finaliseResult.message}. Your changes were not saved. Please try again.`);
            }

            return false;
          }

          if (
            !finaliseResult.alreadyApplied &&
            finaliseResult.celebration?.isEligibleOfficialMatch
          ) {
            setPostMatchCelebration({
              summary: finaliseResult.celebration,
              match: finalisedMatch
            });
          }

          router.refresh();
        } else {
          applyFinalisedMatchToLocalCareerStats(finalisedMatch);
          localMatchRepository.saveMatch(finalisedMatch);
        }

        setFinalisedXPBreakdowns(
          Object.fromEntries(
            [
              ...finalisedMatch.teams.teamA.playerPerformances,
              ...finalisedMatch.teams.teamB.playerPerformances
            ]
              .filter((record): record is FinalisedPlayerMatchRecord => "xpBreakdown" in record)
              .map((record) => [getPerformanceRecordKey(record), record.xpBreakdown])
          )
        );
      } else {
        const nextQuickScoring =
          nextStatus === "in_progress"
            ? {
                ...quickScoring,
                version: 2 as const,
                battingMode: values.battingMode || DEFAULT_BATTING_MODE,
                inningsPhase: quickScoring.inningsPhase ?? "first_innings",
                setupLocked: true,
                setupLockedAt:
                  quickScoring.setupLockedAt ?? new Date().toISOString()
              }
            : quickScoring;
        const saved = await persistNonFinalisedMatch(
          buildCurrentMatchRecord(
            nextStatus,
            result.result,
            new Date().toISOString(),
            nextQuickScoring
          )
        );

        if (!saved) return false;

        if (nextStatus === "in_progress") {
          setQuickScoring(nextQuickScoring);
          setSetupExpanded(false);
          setSetupValidationAttempted(false);
          setRestartSetupNoticeOpen(false);
        }
        setFinalisedXPBreakdowns({});
        setPostMatchCelebration(null);
      }

      setStatus(nextStatus);
      setMessage(getStatusMessage(nextStatus, result.result));
      return true;
    } catch {
      setMessage(
        isDemoMatch && nextStatus === "finalised"
          ? "DEMO VALIDATION FAILED - Your demo was not completed. Please check the match record."
          : "COULD NOT SAVE MATCH. Your changes were not saved. Please try again."
      );
      return false;
    } finally {
      setIsSavingMatch(false);
    }
  }

  function openReopenCrownDialog(monthKey: string) {
    setBlockedCrownMonthKey(null);
    setReopenCrownMonthKey(monthKey);
  }

  async function confirmMonthlyBeastReopenFromMatch() {
    if (!reopenCrownMonthKey || !canEditMatch) return;

    if (supabaseWriteMode) {
      setIsSavingMatch(true);
      const result = await reopenSupabaseMonthlyBeasts(reopenCrownMonthKey);
      setIsSavingMatch(false);

      if (!result.ok) {
        setMessage(result.message);
        return;
      }
    } else {
      monthlyBeastCrownRepository.reopenMonth(reopenCrownMonthKey, "local-admin");
    }

    setReopenCrownMonthKey(null);
    setMessage(
      `${formatMonthLabel(reopenCrownMonthKey)} reopened. Finalising this match again now.`
    );
    void validateAndSetStatus("finalised", "finalise", {
      skipMonthlyCrownGuard: true
    });
  }

  function buildFreshPerformanceStateForRosters(
    nextTeamA: string[],
    nextTeamB: string[]
  ) {
    return Object.fromEntries([
      ...nextTeamA.map((playerId) => [
        getPerformanceKey(playerId, "teamA"),
        createPerformance(playerId, "teamA")
      ]),
      ...nextTeamB.map((playerId) => [
        getPerformanceKey(playerId, "teamB"),
        createPerformance(playerId, "teamB")
      ])
    ]) as Record<string, PlayerMatchPerformance>;
  }

  async function cancelAndRestartActiveMatch() {
    if (!canEditMatch || status !== "in_progress") return;

    const cancelledResult: MatchResult = {
      type: "no_result",
      reason: "cancelled"
    };
    const cancelledMatch = buildCurrentMatchRecord(
      "cancelled",
      cancelledResult,
      new Date().toISOString(),
      {
        ...quickScoring,
        setupLocked: true
      }
    );
    const restartMatchId = createLocalMatchId();
    const matchesForRestartNumber = [
      ...savedMatches.filter((match) => match.id !== matchId),
      cancelledMatch
    ];
    const restartValues: MockMatchFormValues = {
      ...values,
      matchNumber: getNextAvailableMatchNumber(
        matchesForRestartNumber,
        values.matchDate
      ),
      startTime: "",
      teamAName: FIXED_TEAM_A_NAME,
      teamBName: FIXED_TEAM_B_NAME,
      teamATotal: 0,
      teamBTotal: 0
    };
    const restartQuickScoring = createEmptyQuickScoringMetadata();
    const restartBowlingOvers = { teamA: [], teamB: [] };
    const restartPerformances = buildFreshPerformanceStateForRosters(teamA, teamB);
    const restartMatch = buildCurrentMatchRecord(
      "draft",
      { type: "no_result" },
      new Date().toISOString(),
      restartQuickScoring,
      {
        matchId: restartMatchId,
        formValues: restartValues,
        teamAPlayerIds: teamA,
        teamBPlayerIds: teamB,
        sharedPlayerId,
        fieldingHelperIds: normalisedFieldingHelperIds,
        performances: restartPerformances,
        bowlingOvers: restartBowlingOvers,
        inningsExtras: { teamA: 0, teamB: 0 }
      }
    );

    setIsSavingMatch(true);

    try {
      const cancelledSaved = await persistNonFinalisedMatch(
        cancelledMatch,
        supabaseUpdatedAt
      );

      if (!cancelledSaved) return;

      const restartSaved = await persistNonFinalisedMatch(restartMatch, null);

      if (!restartSaved) {
        setStatus("cancelled");
        setCancelConfirmationOpen(false);
        setPlayerUpdateOpen(false);
        setMessage(
          "The previous attempt was cancelled, but the restart draft could not be created. Create a new match manually."
        );
        return;
      }

      setMatchId(restartMatchId);
      setValues(restartValues);
      setAvailablePlayerIds(availablePlayerIds);
      setTeamA(teamA);
      setTeamB(teamB);
      setSharedPlayerId(sharedPlayerId);
      setFieldingHelperIds(normalisedFieldingHelperIds);
      setBattingFirstTeamId(battingFirstTeamId);
      setQuickScoring(restartQuickScoring);
      setSetupExpanded(true);
      setInningsExtras({ teamA: 0, teamB: 0 });
      setPerformances(restartPerformances);
      setPlayerOfMatchSelectionMode("auto");
      setBowlingOvers(restartBowlingOvers);
      setStatus("draft");
      setCancelConfirmationOpen(false);
      setPlayerUpdateOpen(false);
      setRestartSetupNoticeOpen(true);
      setQuickSaveStatus("Saved");
      setFinalisedXPBreakdowns({});
      setSetupValidationAttempted(false);
      setQuickValidationAttempted(false);
      setWicketValidationAttempted(false);
      setDetailedRecordsExpanded(false);
      setMessage("Match restart setup created. Update players or teams, then start the new match.");
    } finally {
      setIsSavingMatch(false);
    }
  }

  function resetForm() {
    if (!canEditMatch) {
      setMessage("Admin login required to continue scoring.");
      return;
    }

    setMatchId(createLocalMatchId());
    setSupabaseUpdatedAt(null);
    setValues(createInitialFormValues(savedMatches));
    setAvailablePlayerIds([]);
    setTeamA([]);
    setTeamB([]);
    setSharedPlayerId(null);
    setFieldingHelperIds([]);
    setBattingFirstTeamId("");
    setQuickScoring(createEmptyQuickScoringMetadata());
    setSetupExpanded(true);
    setInningsExtras({ teamA: 0, teamB: 0 });
    setPerformances({});
    setPlayerOfMatchSelectionMode("auto");
    setBowlingOvers({ teamA: [], teamB: [] });
    setStatus("draft");
    setFinalisedXPBreakdowns({});
    setPostMatchCelebration(null);
    setSetupValidationAttempted(false);
    setQuickValidationAttempted(false);
    setWicketValidationAttempted(false);
    setDetailedRecordsExpanded(false);
    setRestartSetupNoticeOpen(false);
    setMessage("Match entry reset.");
  }

  return (
    <>
    <Card className={`border-neon-cyan/45 ${isFinalised ? "finalised-match" : ""}`}>
      <div className="flex flex-col justify-between gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-black uppercase text-neon-cyan">
            Fixed venue: CZU Gully Arena - Open Field, Prague
          </p>
          <h1 className="mt-1 text-3xl font-black uppercase">{matchPageTitle}</h1>
        </div>
        <span className="rounded-md border border-neon-yellow/40 bg-neon-yellow/10 px-3 py-2 text-xs font-black uppercase text-neon-yellow">
          {getFriendlyWorkflowStatus(status, quickSaveStatus)}
        </span>
      </div>
      {!canEditMatch && !isFinalised ? (
        <div className="mt-4 rounded-md border border-neon-red/50 bg-neon-red/10 px-3 py-2 text-sm font-black uppercase text-red-100">
          Admin login required to continue scoring.
        </div>
      ) : null}
      {isDemoTestMatch ? (
        <div className="mt-4 inline-flex w-fit rounded-md border border-neon-yellow/45 bg-neon-yellow/10 px-3 py-2 text-xs font-black uppercase text-neon-yellow">
          Demo Test - Will Be Removed By Demo Reset
        </div>
      ) : null}
      {isDemoMatch && !isFinalised ? (
        <div className="mt-4 rounded-md border border-neon-cyan/35 bg-neon-cyan/10 px-3 py-2 text-sm font-black uppercase text-neon-cyan">
          DEMO TEST MATCH - Nothing from this match will affect official records.
        </div>
      ) : null}

      <form
        aria-label={matchPageTitle}
        className="match-management-form mt-5 grid gap-5"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className={status === "in_progress" ? "live-result-full-preview" : ""}>
          <ResultBanner
            result={liveResult}
            status={status}
            teamAName={values.teamAName}
            teamBName={values.teamBName}
            firstInnings={firstInnings}
            secondInnings={secondInnings}
            firstInningsIsComplete={firstInningsWasCompleted}
            secondInningsIsComplete={secondInningsIsComplete}
          />
        </div>
        {status === "in_progress" ? (
          <CompactLiveScoreBanner
            battingTeamName={
              quickActiveBattingTeamId === "teamA"
                ? values.teamAName || "Team A"
                : values.teamBName || "Team B"
            }
            bowlingTeamName={
              quickActiveBowlingTeamId === "teamA"
                ? values.teamAName || "Team A"
                : values.teamBName || "Team B"
            }
            score={quickActiveDerived}
            maximumOvers={scheduledOversForCalculations}
            battingMode={activeBattingMode}
          />
        ) : null}

        {status === "in_progress" && !isFinalised ? (
          <section className="match-controls-panel rounded-lg border border-neon-cyan/35 bg-black/35 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase text-neon-cyan">
                  Match Controls
                </p>
                <h2 className="text-2xl font-black uppercase text-stone-50">
                  Active Match Tools
                </h2>
                <p className="text-sm font-bold text-stone-400">
                  View setup, update late arrivals, or restart safely when attendance changes too much.
                </p>
              </div>
              <div className="match-controls-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={openActiveSetupPanel}
                >
                  <Users className="h-4 w-4" aria-hidden="true" />
                  View Setup
                </Button>
                <button
                  type="button"
                  className="match-control-action match-control-action-update"
                  disabled={!canEditMatch || isSavingMatch}
                  onClick={openPlayerUpdatePanel}
                >
                  <UserPlus className="h-5 w-5" aria-hidden="true" />
                  UPDATE PLAYERS
                </button>
                <button
                  type="button"
                  className="match-control-action match-control-action-cancel"
                  disabled={!canEditMatch || isSavingMatch}
                  onClick={openRestartConfirmation}
                >
                  <RotateCcw className="h-5 w-5" aria-hidden="true" />
                  CANCEL & RESTART MATCH
                </button>
              </div>
            </div>

            {playerUpdateOpen ? (
              <div className="active-player-update-panel mt-4 rounded-lg border border-neon-cyan/30 bg-black/30 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-xl font-black uppercase text-stone-50">
                      Update Players
                    </h3>
                    <p className="text-sm font-bold text-stone-400">
                      Quick Scoring is paused. Players with recorded activity are locked to their current assignment.
                    </p>
                  </div>
                  <span className="rounded border border-neon-yellow/40 bg-neon-yellow/10 px-3 py-2 text-xs font-black uppercase text-neon-yellow">
                    No balls will be reset
                  </span>
                </div>

                {playerUpdateErrors.length > 0 ? (
                  <div className="mt-3 grid gap-2">
                    {playerUpdateErrors.map((error) => (
                      <p
                        key={error}
                        className="rounded-md border border-neon-red/45 bg-neon-red/10 p-3 text-sm font-black uppercase text-red-100"
                      >
                        {error}
                      </p>
                    ))}
                    {playerUpdateErrors.some((error) =>
                      error.toLowerCase().includes("restart this match")
                    ) ? (
                      <button
                        type="button"
                        className="match-control-action match-control-action-cancel w-fit"
                        disabled={isSavingMatch}
                        onClick={openRestartConfirmation}
                      >
                        <RotateCcw className="h-5 w-5" aria-hidden="true" />
                        CANCEL & RESTART MATCH
                      </button>
                    ) : null}
                  </div>
                ) : null}

                <div className="active-player-update-grid mt-4">
                  {activePlayers.map((player) => {
                    const assignment =
                      playerUpdateAssignments[player.id] ?? "unassigned";
                    const lockedByActivity = recordedActivityPlayerIds.has(player.id);

                    return (
                      <label
                        key={`active-update-${player.id}`}
                        className="active-player-update-row"
                      >
                        <span>
                          <strong>{player.name}</strong>
                          {lockedByActivity ? (
                            <em>
                              This player has already participated in the match and cannot be reassigned.
                            </em>
                          ) : (
                            <em>Can be assigned safely.</em>
                          )}
                        </span>
                        <select
                          value={assignment}
                          disabled={lockedByActivity || isSavingMatch}
                          onChange={(event) =>
                            changePlayerUpdateAssignment(
                              player.id,
                              event.target.value as PlayerAssignment
                            )
                          }
                        >
                          <option value="unassigned">Unassigned</option>
                          <option value="teamA">Team A</option>
                          <option value="teamB">Team B</option>
                          <option value="shared">Shared</option>
                        </select>
                      </label>
                    );
                  })}
                </div>

                <FieldingHelperControls
                  players={playerUpdateAvailablePlayers}
                  sharedPlayerId={playerUpdateSharedPlayerId}
                  selectedHelperIds={normalisedPlayerUpdateFieldingHelperIds}
                  disabled={isSavingMatch}
                  onToggle={changePlayerUpdateFieldingHelper}
                  onSelectAll={selectAllPlayerUpdateFieldingHelpers}
                  onClear={clearPlayerUpdateFieldingHelpers}
                />

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="match-control-action match-control-action-update"
                    disabled={isSavingMatch}
                    onClick={savePlayerUpdates}
                  >
                    <Save className="h-5 w-5" aria-hidden="true" />
                    SAVE PLAYER CHANGES
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={isSavingMatch}
                    onClick={closePlayerUpdatePanel}
                  >
                    Discard / Close
                  </Button>
                </div>
              </div>
            ) : null}

            {cancelConfirmationOpen ? (
              <div className="cancel-match-confirmation mt-4 rounded-lg border border-neon-red/50 bg-neon-red/10 p-4">
                <h3 className="text-xl font-black uppercase text-red-100">
                  Cancel & Restart This Match?
                </h3>
                <p className="mt-2 text-sm font-bold text-red-100/90">
                  The current scoring attempt will be cancelled. Recorded balls will not affect career stats or XP.
                  Your current setup will be copied into a new draft match so you can update the players and start again.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-md border border-neon-red/35 bg-black/35 p-3">
                    <span className="block text-xs font-black uppercase text-red-200/80">
                      Team A
                    </span>
                    <strong className="text-2xl font-black text-red-100">
                      {formatInningsScore(teamAInningsScore.runs, teamAInningsScore.wicketsLost)}
                    </strong>
                  </div>
                  <div className="rounded-md border border-neon-red/35 bg-black/35 p-3">
                    <span className="block text-xs font-black uppercase text-red-200/80">
                      Team B
                    </span>
                    <strong className="text-2xl font-black text-red-100">
                      {formatInningsScore(teamBInningsScore.runs, teamBInningsScore.wicketsLost)}
                    </strong>
                  </div>
                </div>
                {hasQuickScoringEvents ? (
                  <p className="mt-2 text-sm font-black uppercase text-neon-yellow">
                    Scoring data has already been recorded.
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isSavingMatch}
                    onClick={() => setCancelConfirmationOpen(false)}
                  >
                    Keep Playing
                  </Button>
                  <button
                    type="button"
                    className="match-control-action match-control-action-cancel"
                    disabled={isSavingMatch}
                    onClick={cancelAndRestartActiveMatch}
                  >
                    <RotateCcw className="h-5 w-5" aria-hidden="true" />
                    CANCEL & RESTART
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {isFinalised ? (
          <FinalisedMatchOverview
            matchName={values.matchName}
            matchDate={values.matchDate}
            teamAName={values.teamAName}
            teamBName={values.teamBName}
            teamAInningsScore={teamAInningsScore}
            teamBInningsScore={teamBInningsScore}
            teamAXP={calculateTeamMatchXP(teamAPerformances, liveResult, bowlingOvers.teamA)}
            teamBXP={calculateTeamMatchXP(teamBPerformances, liveResult, bowlingOvers.teamB)}
            canReopen={canSafelyReopenFinalisedMatch}
          />
        ) : (
        <>
          {restartSetupNoticeOpen && status === "draft" ? (
            <div className="match-restart-setup-banner rounded-lg border border-neon-yellow/45 bg-neon-yellow/10 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase text-neon-yellow">
                    Match Restart Setup
                  </p>
                  <h2 className="text-2xl font-black uppercase text-stone-50">
                    Previous Attempt Cancelled
                  </h2>
                  <p className="mt-1 text-sm font-bold text-yellow-100/90">
                    Your setup has been copied. Update today&apos;s players or teams, then start the new match from 0/0.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setRestartSetupNoticeOpen(false)}
                >
                  Hide
                </Button>
              </div>
            </div>
          ) : null}
          <section
            ref={setupSectionRef}
            className="match-setup-panel rounded-lg border border-neon-green/30 bg-black/25 p-4"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase text-neon-green">
                  Phase 1
                </p>
                <h2 className="text-2xl font-black uppercase text-stone-50">
                  Match Setup {setupIsLocked ? "- Locked" : ""}
                </h2>
                <p className="text-sm text-stone-400">
                  {setupIsLocked
                    ? "Teams and match settings are locked for this match."
                    : "Pick the available players, assign teams, then start Quick Scoring."}
                </p>
              </div>
              {setupIsLocked ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={toggleActiveSetupPanel}
                  >
                    {setupIsCollapsed ? "View Setup" : "Hide Setup"}
                  </Button>
                  {canEditLockedSetup ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={editLockedSetupBeforeScoring}
                      disabled={!canEditMatch || isSavingMatch}
                    >
                      Edit Setup
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {setupIsCollapsed ? (
              <>
              <p className="mobile-locked-setup-title">
                Match Setup Locked
              </p>
              <div className="locked-setup-summary mt-4 grid gap-3 md:grid-cols-4">
                <div className="locked-setup-item rounded-md border border-neon-cyan/25 bg-black/25 p-3 text-sm font-black uppercase text-stone-100">
                  Team A: {teamA.length} players
                </div>
                <div className="locked-setup-item rounded-md border border-neon-yellow/25 bg-black/25 p-3 text-sm font-black uppercase text-neon-yellow">
                  Team B: {teamB.length} players
                </div>
                <div className="locked-setup-item rounded-md border border-neon-green/25 bg-black/25 p-3 text-sm font-black uppercase text-neon-green">
                  {scheduledOversForCalculations || "-"} overs
                </div>
                <div className="locked-setup-item rounded-md border border-white/15 bg-black/25 p-3 text-sm font-black uppercase text-stone-100">
                  {battingFirstTeamId === "teamB" ? FIXED_TEAM_B_NAME : FIXED_TEAM_A_NAME} batting first
                </div>
                <div className="locked-setup-item rounded-md border border-neon-yellow/25 bg-black/25 p-3 text-sm font-black uppercase text-neon-yellow">
                  {getBattingModeLabel(activeBattingMode)}
                </div>
                <div className="locked-setup-item rounded-md border border-neon-green/25 bg-black/25 p-3 text-sm font-black uppercase text-neon-green md:col-span-2">
                  Fielding Helpers: {fieldingHelperSummary}
                </div>
              </div>
              </>
            ) : (
              <div className="mt-4 grid gap-5">
                <section
                  className={[
                    "rounded-lg border bg-black/20 p-4",
                    visibleSetupErrors.availability
                      ? "border-neon-red/60"
                      : "border-white/12"
                  ].join(" ")}
                >
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                      <h3 className="flex items-center gap-2 text-xl font-black uppercase text-stone-50">
                        <Users className="h-5 w-5 text-neon-green" aria-hidden="true" />
                        1. Who&apos;s Playing?
                      </h3>
                      <p className="text-sm text-stone-400">
                        Select everyone who is available for this match.
                      </p>
                      <p className="mt-1 text-xs font-black uppercase text-neon-yellow">
                        {availablePlayerIds.length} players selected
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="secondary" onClick={selectAllAvailable} disabled={isRosterLocked}>
                        Select All
                      </Button>
                      <Button type="button" variant="ghost" onClick={clearAvailability} disabled={isRosterLocked}>
                        Clear All
                      </Button>
                    </div>
                  </div>

                  <div className="available-today-grid mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {activePlayers.map((player) => {
                      const isAvailable = availablePlayerIds.includes(player.id);

                      return (
                        <label
                          key={`available-${player.id}`}
                          className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-stone-100 hover:bg-white/10 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-45"
                        >
                          <span>{player.name}</span>
                          <input
                            type="checkbox"
                            checked={isAvailable}
                            disabled={isRosterLocked}
                            onChange={(event) =>
                              toggleAvailability(player.id, event.target.checked)
                            }
                            className="h-5 w-5 accent-neon-yellow"
                          />
                        </label>
                      );
                    })}
                  </div>
                  <ErrorText>{visibleSetupErrors.availability}</ErrorText>
                </section>

                <section
                  className={[
                    "rounded-lg border bg-black/20 p-4",
                    visibleSetupErrors.teamAssignment ||
                    visibleSetupErrors.sharedPlayer
                      ? "border-neon-red/60"
                      : "border-white/12"
                  ].join(" ")}
                >
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                      <h3 className="text-xl font-black uppercase text-stone-50">
                        2. Build the Teams
                      </h3>
                      <p className="text-sm text-stone-400">
                        Assign selected players to Team A, Shared, or Team B.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        onClick={autoBalanceTeams}
                        disabled={
                          isRosterLocked ||
                          isBalancing ||
                          availablePlayerIds.length < 2 ||
                          !canUseTeamControls
                        }
                      >
                        <Shuffle className="h-4 w-4" aria-hidden="true" />
                        Balance Teams
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={autoBalanceTeams}
                        disabled={
                          isRosterLocked ||
                          isBalancing ||
                          availablePlayerIds.length < 2 ||
                          !canUseTeamControls
                        }
                      >
                        Shuffle
                      </Button>
                      <Button type="button" variant="ghost" onClick={clearTeams} disabled={isRosterLocked}>
                        Clear Teams
                      </Button>
                    </div>
                  </div>

                  <div className="team-assignment-summary mt-4 grid gap-3 md:grid-cols-3">
                    <div className="team-assignment-summary-item rounded-md border border-neon-cyan/25 bg-black/25 p-3 text-sm font-black uppercase text-stone-100">
                      Team A - {availableSummary.teamASize}
                    </div>
                    <div className="team-assignment-summary-item rounded-md border border-neon-yellow/25 bg-black/25 p-3 text-sm font-black uppercase text-neon-yellow">
                      Shared - {availableSummary.sharedSlots}
                    </div>
                    <div className="team-assignment-summary-item rounded-md border border-neon-green/25 bg-black/25 p-3 text-sm font-black uppercase text-neon-green">
                      Team B - {availableSummary.teamBSize}
                    </div>
                  </div>
                  <ErrorText>{visibleSetupErrors.teamAssignment}</ErrorText>

                  {hasOddAttendance ? (
                    <div className="mt-4 rounded-lg border border-neon-yellow/35 bg-neon-yellow/10 p-4">
                      <label className="grid gap-2 text-sm font-black uppercase text-yellow-100">
                        Shared Player - Plays for Both Teams
                        <select
                          value={sharedPlayerId ?? ""}
                          disabled={isRosterLocked}
                          onChange={(event) => changeSharedPlayer(event.target.value)}
                          className={getInputClass(Boolean(visibleSetupErrors.sharedPlayer))}
                        >
                          <option value="">Select shared player</option>
                          {availablePlayers.map((player) => (
                            <option key={`shared-${player.id}`} value={player.id}>
                              {player.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="mt-2 text-sm font-bold text-yellow-100">
                        Choose one available player to represent both teams so the playing sides remain equal.
                      </p>
                      <ErrorText>{visibleSetupErrors.sharedPlayer}</ErrorText>
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)_minmax(0,1fr)]">
                    {renderAssignedTeam("A", teamA)}
                    {renderUnassignedPlayers()}
                    {renderAssignedTeam("B", teamB)}
                  </div>
                  <FieldingHelperControls
                    players={availablePlayers}
                    sharedPlayerId={sharedPlayerId}
                    selectedHelperIds={normalisedFieldingHelperIds}
                    disabled={isRosterLocked}
                    onToggle={toggleFieldingHelper}
                    onSelectAll={selectAllFieldingHelpers}
                    onClear={clearFieldingHelpers}
                  />
                </section>

                <section className="rounded-lg border border-white/12 bg-black/20 p-4">
                  <h3 className="text-xl font-black uppercase text-stone-50">
                    3. Match Settings
                  </h3>
                  <p className="text-sm text-stone-400">
                    Pick only the scoring choices needed before the first ball.
                  </p>
          <div className="match-auto-metadata mt-4">
            <div>
              <span>Today</span>
              <strong>{formatAutomaticMatchDate(values.matchDate)}</strong>
            </div>
            <div>
              <span>Automatic game</span>
              <strong>Game {values.matchNumber || "-"}</strong>
            </div>
            <div>
              <span>Venue</span>
              <strong>CZU Gully Arena</strong>
            </div>
          </div>
          <details className="match-more-options">
            <summary>More Options</summary>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-bold text-stone-200">
                Change match date
                <input
                  type="date"
                  value={values.matchDate}
                  disabled={isRosterLocked}
                  onChange={(event) =>
                    setValues((current) => {
                      const matchDate = event.target.value || getPragueMatchDate();

                      return {
                        ...current,
                        matchDate,
                        matchNumber: getNextAvailableMatchNumber(
                          savedMatches,
                          matchDate
                        )
                      };
                    })
                  }
                  className={getInputClass(Boolean(visibleSetupErrors.matchDate))}
                />
                <ErrorText>{visibleSetupErrors.matchDate}</ErrorText>
              </label>
              <label className="grid gap-2 text-sm font-bold text-stone-200">
                Match name
                <input
                  value={values.matchName}
                  disabled={isLocked}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, matchName: event.target.value }))
                  }
                  className={getInputClass(Boolean(visibleSetupErrors.matchName))}
                />
                <ErrorText>{visibleSetupErrors.matchName}</ErrorText>
              </label>
              <div className="grid gap-2 text-sm font-bold text-stone-200">
                Game number
                <output className="rounded-md border border-white/15 bg-black/35 px-3 py-3 text-stone-100">
                  Automatically assigned as Game {values.matchNumber || "-"}.
                </output>
              </div>
              {isNewMatch && supabaseWriteMode && hasAdminWriteAccess ? (
                <div className="grid gap-2 text-sm font-bold text-stone-200 md:col-span-2">
                  Demo Test Match
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={createDemoTestMatch}
                    disabled={isCreatingDemoTestMatch}
                    className="w-fit"
                  >
                    {isCreatingDemoTestMatch
                      ? "CREATING DEMO..."
                      : "CREATE DEMO TEST MATCH"}
                  </Button>
                  <p className="text-xs font-bold uppercase text-neon-yellow">
                    Demo scoring is isolated from official career stats, XP,
                    Hall of Legends and Monthly Beasts.
                  </p>
                </div>
              ) : null}
            </div>
          </details>
          <div className="grid gap-4 md:grid-cols-3">
          <label className="grid gap-2 text-sm font-bold text-stone-200">
            Overs
            <input
              min={1}
              type="number"
              value={values.scheduledOversPerInnings}
              disabled={isRosterLocked}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  scheduledOversPerInnings:
                    event.target.value === ""
                      ? ""
                      : Math.max(1, sanitizeRuns(event.target.value))
                }))
              }
              className={getInputClass(Boolean(visibleSetupErrors.overs))}
            />
            <ErrorText>{visibleSetupErrors.overs}</ErrorText>
          </label>
          <label className="grid gap-2 text-sm font-bold text-stone-200">
            Batting Mode
                <select
                  name="battingMode"
                  value={values.battingMode}
                  disabled={isRosterLocked}
                  onChange={(event) =>
                    setValues((current) => ({
                  ...current,
                  battingMode: event.target.value as BattingMode | ""
                }))
              }
              className={getInputClass(Boolean(visibleSetupErrors.battingMode))}
            >
              <option value="">Select batting mode</option>
              <option value="two_batter">Two Batters - Striker + Non-striker</option>
              <option value="single_batter">Single Batter - One active batter</option>
            </select>
            <ErrorText>{visibleSetupErrors.battingMode}</ErrorText>
          </label>
          <label className="grid gap-2 text-sm font-bold text-stone-200">
            Batting First
            <select
              value={battingFirstTeamId}
              disabled={isRosterLocked}
              onChange={(event) => setBattingFirstTeamId(event.target.value as TeamId | "")}
              className={getInputClass(Boolean(visibleSetupErrors.battingFirst))}
            >
              <option value="">Select innings order</option>
              <option value="teamA">{values.teamAName || "Team A"}</option>
              <option value="teamB">{values.teamBName || "Team B"}</option>
            </select>
            <ErrorText>{visibleSetupErrors.battingFirst}</ErrorText>
          </label>
          </div>
          {status === "draft" ? (
            <div className="mt-5 grid gap-4">
              <div className="match-start-summary">
                <span>{availablePlayerIds.length} players</span>
                <span>
                  Team A {availableSummary.teamASize} - Shared {availableSummary.sharedSlots} - Team B {availableSummary.teamBSize}
                </span>
                <span>{values.scheduledOversPerInnings || "-"} overs</span>
                <span>
                  {battingFirstTeamId === "teamB" ? "Team B" : battingFirstTeamId === "teamA" ? "Team A" : "Choose batting first"}
                </span>
                <span>{values.battingMode ? getBattingModeLabel(values.battingMode) : "Choose batting mode"}</span>
              </div>
              <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                className="start-match-primary"
                onClick={() => validateAndSetStatus("in_progress", "start")}
                disabled={isSavingMatch || isRosterLocked}
              >
                <Swords className="h-4 w-4" aria-hidden="true" />
                START MATCH
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => validateAndSetStatus("draft", "draft")}
                disabled={isSavingMatch || isRosterLocked}
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                Save Draft
              </Button>
              {setupValidationAttempted && setupErrorCount > 0 ? (
                <div className="basis-full">
                  <ErrorText>{getRequiredSummary(setupErrorCount)}</ErrorText>
                </div>
              ) : null}
              </div>
            </div>
          ) : null}
                </section>
              </div>
            )}
          </section>

          <div className={`innings-allocation-primary grid gap-4 md:grid-cols-2 ${status === "in_progress" ? "is-live-scoring" : ""}`}>
          <InningsAllocationPanel
            teamName={values.teamAName || "Team A"}
            score={teamAInningsScore}
          />
          <InningsAllocationPanel
            teamName={values.teamBName || "Team B"}
            score={teamBInningsScore}
          />
        </div>

          {isFirstInningsBreak ? (
            <InningsBreakPanel
              firstTeamName={
                effectiveBattingFirstTeamId === "teamA"
                  ? values.teamAName || "Team A"
                  : values.teamBName || "Team B"
              }
              chasingTeamName={
                chasingTeamId === "teamA"
                  ? values.teamAName || "Team A"
                  : values.teamBName || "Team B"
              }
              firstInnings={firstInnings}
              target={target}
              disabled={isLocked || isSavingMatch}
              onStartSecondInnings={startSecondInnings}
              canUndo={canUndoQuickScoring}
              onUndo={undoQuickScoringEvent}
            />
          ) : (
          <QuickScoringPanel
            battingTeamName={
              quickActiveBattingTeamId === "teamA"
                ? values.teamAName || "Team A"
                : values.teamBName || "Team B"
            }
            bowlingTeamName={
              quickActiveBowlingTeamId === "teamA"
                ? values.teamAName || "Team A"
                : values.teamBName || "Team B"
            }
            battingPlayers={quickActiveBattingPlayers}
            bowlingPlayers={quickActiveBowlingPlayers}
            fieldingPlayers={quickActiveFieldingPlayers}
            battingMode={activeBattingMode}
            requiresNonStriker={quickRequiresNonStriker}
            isLastBatterSolo={quickActiveDerived.isLastBatterSolo}
            derived={quickActiveDerived}
            inningsState={quickActiveInningsState}
            inningsCompleteMessage={quickActiveInningsCompleteMessage}
            maximumOvers={scheduledOversForCalculations}
            selection={quickSelection}
            selectionErrors={visibleQuickSelectionErrors}
            wicketDraft={quickWicketDraft}
            wicketErrors={visibleQuickWicketErrors}
            noBallOpen={quickNoBallOpen}
            saveStatus={quickSaveStatus}
            disabled={!quickScoringCanBeEdited}
            canUndo={canUndoQuickScoring}
            sectionRef={quickSectionRef}
            onSelectionChange={setQuickSelection}
            onWicketDraftChange={updateQuickWicketDraft}
            onNoBallOpenChange={updateQuickNoBallOpen}
            onScoreRun={(runs) => appendQuickScoringEvent({ batterRuns: runs })}
            onWide={() =>
              appendQuickScoringEvent({
                batterRuns: 0,
                extraType: "wide",
                extras: 1
              })
            }
            onNoBall={(batterRuns) =>
              appendQuickScoringEvent({
                batterRuns,
                extraType: "no_ball",
                extras: 1
              })
            }
            onUndo={undoQuickScoringEvent}
            onSwapStrikers={() =>
              setQuickSelection((current) => ({
                ...current,
                strikerId: current.nonStrikerId,
                nonStrikerId: current.strikerId
              }))
            }
            onCorrectEventToDot={correctQuickScoringEventToDot}
            onSubmitWicket={submitQuickWicket}
          />
          )}

        </>
        )}

        <section className="detailed-records-panel rounded-lg border border-white/12 bg-black/25 p-4">
          <div className="detailed-records-header">
            <div>
              <p className="text-xs font-black uppercase text-neon-cyan">
                Detailed Records
              </p>
              <h2 className="text-2xl font-black uppercase text-stone-50">
                Bowling & Player Records
              </h2>
              <p className="text-sm font-bold text-stone-400">
                Bowling and player records are automatically updated from Quick Scoring.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              aria-expanded={detailedRecordsExpanded}
              aria-controls="detailed-records-content"
              onClick={() => setDetailedRecordsExpanded((current) => !current)}
            >
              {detailedRecordsExpanded ? "Hide Records" : "View Records"}
            </Button>
          </div>
          <div
            id="detailed-records-content"
            hidden={!detailedRecordsExpanded}
            className="detailed-records-content"
          >
            <div className="innings-allocation-mobile-details grid gap-4 md:hidden">
              <InningsAllocationPanel
                teamName={values.teamAName || "Team A"}
                score={teamAInningsScore}
              />
              <InningsAllocationPanel
                teamName={values.teamBName || "Team B"}
                score={teamBInningsScore}
              />
            </div>

        <div className="bowling-teams-grid">
          {isFinalised ? (
            <MatchDetailsDisclosure
              id="team-a-bowling"
              title={`${values.teamAName} Bowling Details`}
              teamId="teamA"
              summary={getBowlingDisclosureSummary(bowlingOvers.teamA)}
            >
              <TeamBowlingSection
                teamId="teamA"
                teamName={values.teamAName}
                players={teamAPlayers}
                fieldingPlayers={teamAFieldingPlayers}
                battingPlayers={teamBPlayers}
                battingTeamPlayerCount={teamB.length}
                overs={bowlingOvers.teamA}
                inningsState={teamABowlingInningsState}
                isLocked={isLocked}
                onWicketLimit={(wicketsStillAvailable) =>
                  setMessage(`Only ${wicketsStillAvailable} wickets remain in this innings.`)
                }
                onAddOver={addBowlingOver}
                onWicketsTakenChange={updateWicketsTaken}
                onUpdateDismissal={updateDismissal}
                onRemoveDismissal={removeDismissal}
                onRemoveOver={removeBowlingOver}
                onUpdateOver={updateBowlingOver}
              />
            </MatchDetailsDisclosure>
          ) : (
            <TeamBowlingSection
            teamId="teamA"
            teamName={values.teamAName}
            players={teamAPlayers}
            fieldingPlayers={teamAFieldingPlayers}
            battingPlayers={teamBPlayers}
            battingTeamPlayerCount={teamB.length}
            overs={bowlingOvers.teamA}
            inningsState={teamABowlingInningsState}
            isLocked={isLocked}
            onWicketLimit={(wicketsStillAvailable) =>
              setMessage(`Only ${wicketsStillAvailable} wickets remain in this innings.`)
            }
            onAddOver={addBowlingOver}
            onWicketsTakenChange={updateWicketsTaken}
            onUpdateDismissal={updateDismissal}
            onRemoveDismissal={removeDismissal}
            onRemoveOver={removeBowlingOver}
            onUpdateOver={updateBowlingOver}
          />
          )}
          {isFinalised ? (
            <MatchDetailsDisclosure
              id="team-b-bowling"
              title={`${values.teamBName} Bowling Details`}
              teamId="teamB"
              summary={getBowlingDisclosureSummary(bowlingOvers.teamB)}
            >
              <TeamBowlingSection
                teamId="teamB"
                teamName={values.teamBName}
                players={teamBPlayers}
                fieldingPlayers={teamBFieldingPlayers}
                battingPlayers={teamAPlayers}
                battingTeamPlayerCount={teamA.length}
                overs={bowlingOvers.teamB}
                inningsState={teamBBowlingInningsState}
                isLocked={isLocked}
                onWicketLimit={(wicketsStillAvailable) =>
                  setMessage(`Only ${wicketsStillAvailable} wickets remain in this innings.`)
                }
                onAddOver={addBowlingOver}
                onWicketsTakenChange={updateWicketsTaken}
                onUpdateDismissal={updateDismissal}
                onRemoveDismissal={removeDismissal}
                onRemoveOver={removeBowlingOver}
                onUpdateOver={updateBowlingOver}
              />
            </MatchDetailsDisclosure>
          ) : (
            <TeamBowlingSection
            teamId="teamB"
            teamName={values.teamBName}
            players={teamBPlayers}
            fieldingPlayers={teamBFieldingPlayers}
            battingPlayers={teamAPlayers}
            battingTeamPlayerCount={teamA.length}
            overs={bowlingOvers.teamB}
            inningsState={teamBBowlingInningsState}
            isLocked={isLocked}
            onWicketLimit={(wicketsStillAvailable) =>
              setMessage(`Only ${wicketsStillAvailable} wickets remain in this innings.`)
            }
            onAddOver={addBowlingOver}
            onWicketsTakenChange={updateWicketsTaken}
            onUpdateDismissal={updateDismissal}
            onRemoveDismissal={removeDismissal}
            onRemoveOver={removeBowlingOver}
            onUpdateOver={updateBowlingOver}
          />
          )}
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {isFinalised ? (
            <MatchDetailsDisclosure
              id="team-a-player-records"
              title={`${values.teamAName} Player Records`}
              teamId="teamA"
              summary={getPlayerRecordsDisclosureSummary(teamAInningsScore, teamAPerformances)}
            >
              <TeamPlayerRecordsSection
                title="Team A Player Records"
                teamId="teamA"
                teamName={values.teamAName}
                teamTotal={teamTotals.teamATotal}
                inningsScore={teamAInningsScore}
                players={teamAPlayers}
                performances={teamAPerformances}
                result={liveResult}
                bowlingOvers={bowlingOvers.teamA}
                inningsWicketsLost={calculateWicketsLost(bowlingOvers.teamA)}
                maxDismissals={teamB.length}
                isLocked={isLocked}
                isFinalised={isFinalised}
                finalisedXPBreakdowns={finalisedXPBreakdowns}
                onDidBatChange={handleDidBatChange}
                onMoveBattingPosition={moveBattingPosition}
                onUpdatePerformance={updatePerformance}
              />
            </MatchDetailsDisclosure>
          ) : (
            <TeamPlayerRecordsSection
            title="Team A Player Records"
            teamId="teamA"
            teamName={values.teamAName}
            teamTotal={teamTotals.teamATotal}
            inningsScore={teamAInningsScore}
            players={teamAPlayers}
            performances={teamAPerformances}
            result={liveResult}
            bowlingOvers={bowlingOvers.teamA}
            inningsWicketsLost={calculateWicketsLost(bowlingOvers.teamA)}
            maxDismissals={teamB.length}
            isLocked={isLocked}
            isFinalised={isFinalised}
            finalisedXPBreakdowns={finalisedXPBreakdowns}
            onDidBatChange={handleDidBatChange}
            onMoveBattingPosition={moveBattingPosition}
            onUpdatePerformance={updatePerformance}
          />
          )}
          {isFinalised ? (
            <MatchDetailsDisclosure
              id="team-b-player-records"
              title={`${values.teamBName} Player Records`}
              teamId="teamB"
              summary={getPlayerRecordsDisclosureSummary(teamBInningsScore, teamBPerformances)}
            >
              <TeamPlayerRecordsSection
                title="Team B Player Records"
                teamId="teamB"
                teamName={values.teamBName}
                teamTotal={teamTotals.teamBTotal}
                inningsScore={teamBInningsScore}
                players={teamBPlayers}
                performances={teamBPerformances}
                result={liveResult}
                bowlingOvers={bowlingOvers.teamB}
                inningsWicketsLost={calculateWicketsLost(bowlingOvers.teamB)}
                maxDismissals={teamA.length}
                isLocked={isLocked}
                isFinalised={isFinalised}
                finalisedXPBreakdowns={finalisedXPBreakdowns}
                onDidBatChange={handleDidBatChange}
                onMoveBattingPosition={moveBattingPosition}
                onUpdatePerformance={updatePerformance}
              />
            </MatchDetailsDisclosure>
          ) : (
            <TeamPlayerRecordsSection
            title="Team B Player Records"
            teamId="teamB"
            teamName={values.teamBName}
            teamTotal={teamTotals.teamBTotal}
            inningsScore={teamBInningsScore}
            players={teamBPlayers}
            performances={teamBPerformances}
            result={liveResult}
            bowlingOvers={bowlingOvers.teamB}
            inningsWicketsLost={calculateWicketsLost(bowlingOvers.teamB)}
            maxDismissals={teamA.length}
            isLocked={isLocked}
            isFinalised={isFinalised}
            finalisedXPBreakdowns={finalisedXPBreakdowns}
            onDidBatChange={handleDidBatChange}
            onMoveBattingPosition={moveBattingPosition}
            onUpdatePerformance={updatePerformance}
          />
          )}
        </div>
          </div>
        </section>

        {!isFinalised ? (
          <section className="pom-review-panel rounded-lg border border-neon-yellow/30 bg-black/25 p-4">
            <div>
              <p className="text-xs font-black uppercase text-neon-yellow">
                Player of the Match
              </p>
              {playerOfMatchRecommendation.leaders.length === 0 ? (
                <p className="text-sm font-bold text-stone-400">
                  No played players available yet.
                </p>
              ) : playerOfMatchRecommendation.isTie ? (
                <div className="pom-suggestion">
                  <strong>Joint highest match XP</strong>
                  {playerOfMatchRecommendation.leaders.map((leader) => (
                    <span key={`pom-leader-${leader.playerId}`}>
                      {getPlayerDisplayName(activePlayers, leader.playerId)} - {leader.prePomXP} XP
                    </span>
                  ))}
                </div>
              ) : (
                <div className="pom-suggestion">
                  <strong>Suggested by match performance</strong>
                  <span>
                    {getPlayerDisplayName(
                      activePlayers,
                      playerOfMatchRecommendation.recommendedPlayerId ?? ""
                    )}{" "}
                    - {playerOfMatchRecommendation.leaders[0]?.prePomXP ?? 0} XP
                  </span>
                </div>
              )}
              <p className="mt-2 text-xs font-bold text-stone-400">
                Suggested using match XP before the POM bonus. You can change this selection.
              </p>
            </div>
            <label className="grid gap-2 text-sm font-black uppercase text-stone-200">
              Player of the Match
              <select
                value={playerOfMatchId}
                disabled={isLocked}
                onChange={(event) => selectPlayerOfMatch(event.target.value)}
                className="rounded-md border border-white/15 bg-black/35 px-3 py-3 text-stone-100 outline-none focus:ring-2 focus:ring-neon-cyan disabled:opacity-60"
              >
                <option value="">Select after review</option>
                {playedPlayers.map((player) => (
                  <option key={`pom-${player.id}`} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </label>
          </section>
        ) : null}

        {!isFinalised ? (
        <label className="grid gap-2 text-sm font-bold text-stone-200">
          Notes
          <textarea
            rows={4}
            value={values.notes}
            disabled={isLocked}
            onChange={(event) =>
              setValues((current) => ({ ...current, notes: event.target.value }))
            }
            className="rounded-md border border-white/15 bg-black/35 px-3 py-3 text-stone-100 outline-none focus:ring-2 focus:ring-neon-cyan disabled:opacity-60"
          />
        </label>
        ) : null}

        {ordinaryDuplicatePlayers.length > 0 ? (
          <div className="rounded-md border border-neon-red/50 bg-neon-red/10 p-3 text-sm font-bold text-red-100">
            A player cannot be selected for both teams.
          </div>
        ) : null}

        <div className="rounded-md border border-white/12 bg-white/5 p-3 text-sm text-stone-300">
          {message}
          {liveConflictMatchId ? (
            <Link
              href={`/matches/${liveConflictMatchId}`}
              className="ml-2 font-black uppercase text-neon-cyan underline"
            >
              Continue Current Match
            </Link>
          ) : null}
        </div>

        {!isFinalised ? (
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            onClick={() =>
              validateAndSetStatus(
                status,
                status === "in_progress" ? "start" : "draft"
              )
            }
            disabled={isLocked || isSavingMatch}
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            {isSavingMatch
              ? "Saving Match"
              : status === "in_progress"
                ? "Save Live Match"
                : "Save Draft"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => validateAndSetStatus("finalised", "finalise")}
            disabled={isLocked || status !== "in_progress" || !canUseTeamControls || isSavingMatch}
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {isDemoMatch ? "Complete Demo Test" : "Finalise Match"}
          </Button>
          <Button type="button" variant="ghost" onClick={resetForm} disabled={isLocked || isSavingMatch}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Reset
          </Button>
        </div>
        ) : null}
      </form>
    </Card>
    {blockedCrownMonthKey ? (
      <MonthlyCrownFinalisationWarning
        monthKey={blockedCrownMonthKey}
        onCancel={() => setBlockedCrownMonthKey(null)}
        onReopen={() => openReopenCrownDialog(blockedCrownMonthKey)}
      />
    ) : null}
    {reopenCrownMonthKey ? (
      <ReopenMonthlyBeastsDialog
        monthKey={reopenCrownMonthKey}
        onCancel={() => setReopenCrownMonthKey(null)}
        onConfirm={confirmMonthlyBeastReopenFromMatch}
      />
    ) : null}
    {postMatchCelebration ? (
      <PostMatchCelebration
        summary={postMatchCelebration.summary}
        match={postMatchCelebration.match}
        onDismiss={() => setPostMatchCelebration(null)}
      />
    ) : null}
    </>
  );

  function getAssignmentPlayers(source: string[]) {
    return source
      .map((playerId) =>
        availablePlayers.find((player) => player.id === playerId)
      )
      .filter((player): player is Player => Boolean(player));
  }

  function renderAssignedTeam(team: TeamKey, source: string[]) {
    const players = getAssignmentPlayers(source);

    return (
      <fieldset className="team-assignment-column rounded-lg border border-white/12 bg-black/20 p-4">
        <legend className="px-1 text-sm font-black uppercase text-neon-yellow">
          Team {team} players
        </legend>
        <div className="mt-3 grid gap-2">
          {players.length === 0 ? (
            <p className="rounded-md border border-white/10 bg-white/5 p-3 text-sm font-bold text-stone-300">
              No players assigned yet.
            </p>
          ) : null}

          {players.map((player) => {
            const isShared = player.id === sharedPlayerId;

            return (
              <div
                key={`${team}-${player.id}`}
                className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-stone-100"
              >
                <span className="flex flex-wrap items-center gap-2">
                  {player.name}
                  {isShared ? (
                    <b className="rounded border border-neon-yellow/35 bg-neon-yellow/10 px-2 py-0.5 text-[10px] font-black uppercase text-neon-yellow">
                      Shared Player
                    </b>
                  ) : null}
                </span>
                <button
                  type="button"
                  disabled={isRosterLocked || isShared}
                  onClick={() => togglePlayer(team, player.id)}
                  className="rounded border border-neon-red/35 bg-neon-red/10 px-2 py-1 text-[11px] font-black uppercase text-red-100 disabled:cursor-not-allowed disabled:opacity-45"
                  title={
                    isShared
                      ? "Change Shared Player from the Shared Player selector"
                      : "Remove player from this team"
                  }
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      </fieldset>
    );
  }

  function renderUnassignedPlayers() {
    return (
      <fieldset className="team-assignment-column rounded-lg border border-neon-cyan/25 bg-black/20 p-4">
        <legend className="px-1 text-sm font-black uppercase text-neon-cyan">
          Unassigned
        </legend>
        <div className="mt-3 grid gap-2">
          {availablePlayers.length === 0 ? (
            <p className="rounded-md border border-white/10 bg-white/5 p-3 text-sm font-bold text-stone-300">
              Mark players Available Today before choosing teams.
            </p>
          ) : null}
          {availablePlayers.length > 0 && unassignedPlayers.length === 0 ? (
            <p className="rounded-md border border-neon-green/25 bg-neon-green/10 p-3 text-sm font-black uppercase text-neon-green">
              All available players are assigned.
            </p>
          ) : null}

          {unassignedPlayers.map((player) => (
            <div
              key={`unassigned-${player.id}`}
              className="grid min-h-11 gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-stone-100"
            >
              <span>{player.name}</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isRosterLocked}
                  onClick={() => togglePlayer("A", player.id)}
                  className="rounded border border-neon-cyan/35 bg-neon-cyan/10 px-2 py-1 text-[11px] font-black uppercase text-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Team A
                </button>
                <button
                  type="button"
                  disabled={isRosterLocked}
                  onClick={() => togglePlayer("B", player.id)}
                  className="rounded border border-neon-yellow/35 bg-neon-yellow/10 px-2 py-1 text-[11px] font-black uppercase text-yellow-100 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Team B
                </button>
              </div>
            </div>
          ))}
        </div>
      </fieldset>
    );
  }
}

function MonthlyCrownFinalisationWarning({
  monthKey,
  onCancel,
  onReopen
}: {
  monthKey: string;
  onCancel: () => void;
  onReopen: () => void;
}) {
  return (
    <div className="monthly-beasts-dialog-backdrop">
      <section
        className="monthly-beasts-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="match-monthly-crown-warning-title"
      >
        <p className="formula-eyebrow">Monthly Beast crown active</p>
        <h2 id="match-monthly-crown-warning-title">
          {formatMonthLabel(monthKey)} has already been crowned
        </h2>
        <p className="monthly-beasts-dialog-summary">
          Finalising this match could change the Monthly Beast results.
          <br />
          Reopen {formatMonthTitle(monthKey)} before finalising this match.
        </p>
        <div className="monthly-beasts-dialog-actions">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Go Back
          </Button>
          <Button type="button" variant="secondary" onClick={onReopen}>
            Reopen {formatMonthLabel(monthKey)}
          </Button>
        </div>
      </section>
    </div>
  );
}

function buildPerformanceList(
  teamPlayers: Player[],
  teamId: TeamId,
  performances: Record<string, PlayerMatchPerformance>,
  ownBowlingOvers: BowlingOver[],
  opposingBowlingOvers: BowlingOver[],
  fieldingHelperIds: string[]
): PlayerMatchPerformance[] {
  const dismissedBatterIds = new Set(getDismissedBatterIds(opposingBowlingOvers));
  const helperIdSet = new Set(fieldingHelperIds);

  return teamPlayers.map((player) => {
    const key = getPerformanceKey(player.id, teamId);
    const base =
      performances[key] ??
      performances[player.id] ??
      createPerformance(player.id, teamId);
    const wasDismissed = dismissedBatterIds.has(player.id);

    return {
      ...base,
      teamId,
      representingTeamId: teamId,
      played: true,
      didBat: base.didBat || wasDismissed,
      runs: normalizeStoredRuns(base.runs),
      wasOut: wasDismissed,
      wickets: calculateBowlerWickets(player.id, ownBowlingOvers),
      hatTricks: calculatePlayerHatTricks(player.id, ownBowlingOvers),
      catches: calculatePlayerCatches(player.id, ownBowlingOvers) +
        (helperIdSet.has(player.id)
          ? calculatePlayerCatches(player.id, opposingBowlingOvers)
          : 0),
      runOuts: calculatePlayerRunOuts(player.id, ownBowlingOvers) +
        (helperIdSet.has(player.id)
          ? calculatePlayerRunOuts(player.id, opposingBowlingOvers)
          : 0),
      stumpings: calculatePlayerStumpings(player.id, ownBowlingOvers) +
        (helperIdSet.has(player.id)
          ? calculatePlayerStumpings(player.id, opposingBowlingOvers)
          : 0)
    };
  });
}

function aggregateFinalisedPlayerRecords({
  performances,
  allBowlingOvers,
  result,
  sharedPlayerId,
  appliedAt,
  finalStatus
}: {
  performances: PlayerMatchPerformance[];
  allBowlingOvers: BowlingOver[];
  result: MatchResult;
  sharedPlayerId: string | null;
  appliedAt: string;
  finalStatus: MatchStatus;
}): FinalisedPlayerMatchRecord[] {
  const groupedByPlayerId = new Map<string, PlayerMatchPerformance[]>();

  for (const performance of performances) {
    groupedByPlayerId.set(performance.playerId, [
      ...(groupedByPlayerId.get(performance.playerId) ?? []),
      performance
    ]);
  }

  return [...groupedByPlayerId.entries()].map(([playerId, playerPerformances]) => {
    const playerOvers = allBowlingOvers.filter((over) => over.bowlerId === playerId);
    const isSharedPlayerRecord =
      sharedPlayerId === playerId && playerPerformances.length > 1;
    const basePerformance = playerPerformances[0];
    const aggregatePerformance: PlayerMatchPerformance = {
      ...basePerformance,
      teamId: basePerformance.teamId,
      representingTeamId: basePerformance.teamId,
      played: playerPerformances.some((performance) => performance.played),
      playerOfMatch: playerPerformances.some(
        (performance) => performance.playerOfMatch
      ),
      didBat: playerPerformances.some((performance) => performance.didBat),
      runs: playerPerformances.reduce(
        (sum, performance) =>
          sum + (performance.didBat ? sanitizeRuns(performance.runs) : 0),
        0
      ),
      wasOut: playerPerformances.some((performance) => performance.wasOut),
      wickets: playerPerformances.reduce(
        (sum, performance) => sum + sanitizeRuns(performance.wickets),
        0
      ),
      hatTricks: playerPerformances.reduce(
        (sum, performance) => sum + sanitizeRuns(performance.hatTricks),
        0
      ),
      catches: playerPerformances.reduce(
        (sum, performance) => sum + sanitizeRuns(performance.catches),
        0
      ),
      runOuts: playerPerformances.reduce(
        (sum, performance) => sum + sanitizeRuns(performance.runOuts),
        0
      ),
      stumpings: playerPerformances.reduce(
        (sum, performance) => sum + sanitizeRuns(performance.stumpings ?? 0),
        0
      )
    };

    return {
      ...aggregatePerformance,
      xpBreakdown: isSharedPlayerRecord
        ? calculateSharedPlayerMatchXP(playerPerformances, {
            result,
            overs: playerOvers
          })
        : calculatePlayerMatchXP(aggregatePerformance, {
            result,
            overs: playerOvers
          }),
      progressionAppliedAt:
        finalStatus === "finalised" && result.type !== "no_result"
          ? appliedAt
          : undefined
    };
  });
}

function calculateTeamMatchXP(
  performances: PlayerMatchPerformance[],
  result: MatchResult,
  bowlingOvers: BowlingOver[]
) {
  return performances.reduce((total, performance) => {
    const playerOvers = bowlingOvers.filter(
      (over) => over.bowlerId === performance.playerId
    );

    return (
      total +
      calculateMatchXP(performance, {
        result,
        teamWon: isWinningTeam(performance.teamId, result),
        overs: playerOvers
      })
    );
  }, 0);
}

function getBowlingDisclosureSummary(overs: BowlingOver[]) {
  const score = calculateScoreFromBowlingFeed(overs);

  return `${formatCompletedOvers(score.completedOvers)} overs - ${score.wicketsLost} wickets - ${score.runs} runs conceded`;
}

function getPlayerRecordsDisclosureSummary(
  inningsScore: LiveInningsScore,
  performances: PlayerMatchPerformance[]
) {
  const allocation = calculateBattingAllocation(inningsScore.runs, performances);

  return `${formatInningsScore(inningsScore.runs, inningsScore.wicketsLost)} - Player runs ${allocation.playerRunsTotal} - Extras ${allocation.extras}`;
}

function formatQuickOvers(legalBalls: number): string {
  return formatCricketOversFromLegalBalls(sanitizeRuns(legalBalls));
}

function formatQuickOverBalls(legalBalls: number): string {
  return `${sanitizeRuns(legalBalls) % 6}/6`;
}

function getPlayerDisplayName(players: Player[], playerId: string): string {
  return players.find((player) => player.id === playerId)?.name ?? "Select player";
}

function getPlayerOptionsByIds(playerIds: string[]): Player[] {
  const idSet = new Set(playerIds);

  return activePlayers.filter((player) => idSet.has(player.id));
}

function getFriendlyWorkflowStatus(status: MatchStatus, saveStatus: string): string {
  if (status === "finalised") return "Match Scorecard";
  if (status === "abandoned" || status === "cancelled") return "No Result";
  if (status === "in_progress") return `Live - ${saveStatus}`;

  return `Draft - ${saveStatus}`;
}

function getBattingModeLabel(mode: BattingMode): string {
  return mode === "single_batter" ? "Single Batter Mode" : "Two Batter Mode";
}

function getTeamAccentStyle(teamId: TeamId): CSSProperties {
  return {
    "--team-accent": teamId === "teamA" ? "#2fd4ff" : "#ff9d2f"
  } as CSSProperties;
}

function MatchDetailsDisclosure({
  id,
  title,
  summary,
  defaultOpen = false,
  teamId,
  children
}: {
  id: string;
  title: string;
  summary: ReactNode;
  defaultOpen?: boolean;
  teamId: TeamId;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentId = `${id}-content`;

  return (
    <section
      className={`match-details-disclosure team-section ${teamId === "teamA" ? "team-section-a" : "team-section-b"}`}
      style={getTeamAccentStyle(teamId)}
    >
      <div className="match-details-disclosure-header">
        <div>
          <h2 className="team-section-title">{title}</h2>
          <p>{summary}</p>
        </div>
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={contentId}
          onClick={() => setIsOpen((current) => !current)}
          className="match-details-disclosure-button"
        >
          {isOpen ? "Hide Details" : "View Details"}
        </button>
      </div>
      <div id={contentId} hidden={!isOpen} className="match-details-disclosure-content">
        {children}
      </div>
    </section>
  );
}

function FinalisedMatchOverview({
  matchName,
  matchDate,
  teamAName,
  teamBName,
  teamAInningsScore,
  teamBInningsScore,
  teamAXP,
  teamBXP,
  canReopen
}: {
  matchName: string;
  matchDate: string;
  teamAName: string;
  teamBName: string;
  teamAInningsScore: LiveInningsScore;
  teamBInningsScore: LiveInningsScore;
  teamAXP: number;
  teamBXP: number;
  canReopen: boolean;
}) {
  return (
    <section className="finalised-match-overview rounded-lg border border-white/12 bg-black/25 p-4">
      <div>
        <p className="text-xs font-black uppercase text-neon-cyan">
          Finalised match summary
        </p>
        <h2 className="mt-1 text-2xl font-black uppercase text-stone-50">
          {matchName || "Gully Premier League"}
        </h2>
        <p className="text-sm font-bold text-stone-400">
          {matchDate || "Match date not set"} - CZU Gully Arena
        </p>
      </div>
      <div className="finalised-score-grid">
        <div className="team-section team-section-a" style={getTeamAccentStyle("teamA")}>
          <span className="text-xs font-black uppercase text-stone-400">
            {teamAName || "Team A"}
          </span>
          <strong className="team-score-badge">
            {formatInningsScore(teamAInningsScore.runs, teamAInningsScore.wicketsLost)}
          </strong>
        </div>
        <div className="team-section team-section-b" style={getTeamAccentStyle("teamB")}>
          <span className="text-xs font-black uppercase text-stone-400">
            {teamBName || "Team B"}
          </span>
          <strong className="team-score-badge">
            {formatInningsScore(teamBInningsScore.runs, teamBInningsScore.wicketsLost)}
          </strong>
        </div>
      </div>
      <div className="finalised-xp-summary">
        <span>XP Awarded</span>
        <strong>{teamAName || "Team A"}: {teamAXP}</strong>
        <strong>{teamBName || "Team B"}: {teamBXP}</strong>
      </div>
      <FinalisedMatchActions canReopen={canReopen} />
    </section>
  );
}

function FinalisedMatchActions({ canReopen }: { canReopen: boolean }) {
  return (
    <div className="finalised-match-actions">
      <Link href="/matches" className="finalised-match-action">
        View Match Summary
      </Link>
      <Link href="/matches" className="finalised-match-action">
        Back to Matches
      </Link>
      {canReopen ? (
        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            window.confirm(
              "REOPEN FINALISED MATCH?\n\nReopening this match will unlock team selection, bowling records and player records."
            )
          }
        >
          Reopen Match
        </Button>
      ) : null}
    </div>
  );
}

function InningsAllocationPanel({
  teamName,
  score
}: {
  teamName: string;
  score: LiveInningsScore;
}) {
  const reconciliationMessage = score.isReconciled
    ? "Score allocated"
    : `Player runs exceed ${teamName}'s official innings total by ${Math.max(0, score.allocatedBatterRuns - score.runs)} runs`;

  return (
    <section className="rounded-lg border border-white/12 bg-black/25 p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-black uppercase text-neon-cyan">{teamName}</p>
          <p className="text-3xl font-black text-neon-yellow">
            {formatInningsScore(score.runs, score.wicketsLost)}
          </p>
          <p className="text-xs font-black uppercase text-stone-400">
            {formatCompletedOvers(score.completedOvers)} overs - source: {score.source.replace("_", " ")}
          </p>
        </div>
        <div className="grid gap-1 rounded-md border border-white/15 bg-black/35 px-3 py-2 text-right text-xs font-black uppercase text-stone-300">
          Extras
          <strong className="text-2xl text-neon-yellow">{score.extras}</strong>
        </div>
      </div>
      <p
        className={`mt-3 rounded-md border p-3 text-xs font-black uppercase ${
          score.isReconciled
            ? "border-neon-green/35 bg-neon-green/10 text-neon-green"
            : "border-neon-yellow/35 bg-neon-yellow/10 text-neon-yellow"
        }`}
      >
        {reconciliationMessage}
      </p>
    </section>
  );
}

function InningsBreakPanel({
  firstTeamName,
  chasingTeamName,
  firstInnings,
  target,
  disabled,
  onStartSecondInnings,
  canUndo,
  onUndo
}: {
  firstTeamName: string;
  chasingTeamName: string;
  firstInnings: TeamInnings;
  target: number;
  disabled: boolean;
  onStartSecondInnings: () => void;
  canUndo: boolean;
  onUndo: () => void;
}) {
  return (
    <section className="rounded-lg border border-neon-yellow/40 bg-neon-yellow/10 p-4">
      <p className="text-xs font-black uppercase text-neon-yellow">
        First Innings Complete
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-white/15 bg-black/35 px-3 py-3">
          <span className="text-xs font-black uppercase text-stone-400">
            {firstTeamName}
          </span>
          <strong className="block text-3xl font-black text-neon-yellow">
            {formatInningsScore(firstInnings.runs, firstInnings.wicketsLost)}
          </strong>
          <span className="text-xs font-bold text-stone-300">
            {formatCompletedOvers(firstInnings.completedOvers)} overs
          </span>
        </div>
        <div className="rounded-md border border-neon-cyan/25 bg-black/35 px-3 py-3">
          <span className="text-xs font-black uppercase text-stone-400">
            Target
          </span>
          <strong className="block text-3xl font-black text-neon-cyan">
            {target}
          </strong>
        </div>
        <div className="rounded-md border border-neon-green/25 bg-black/35 px-3 py-3">
          <span className="text-xs font-black uppercase text-stone-400">
            {chasingTeamName}
          </span>
          <strong className="block text-xl font-black uppercase text-neon-green">
            Needs {target} to win
          </strong>
        </div>
      </div>
      <Button
        type="button"
        className="mt-4"
        disabled={disabled}
        onClick={onStartSecondInnings}
      >
        START SECOND INNINGS
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="quick-completion-undo"
        disabled={!canUndo}
        onClick={onUndo}
      >
        UNDO LAST BALL
      </Button>
    </section>
  );
}

function QuickScoringPanel({
  battingTeamName,
  bowlingTeamName,
  battingPlayers,
  bowlingPlayers,
  fieldingPlayers,
  battingMode,
  requiresNonStriker,
  isLastBatterSolo,
  derived,
  inningsState,
  inningsCompleteMessage,
  maximumOvers,
  selection,
  selectionErrors,
  wicketDraft,
  wicketErrors,
  noBallOpen,
  saveStatus,
  disabled,
  canUndo,
  sectionRef,
  onSelectionChange,
  onWicketDraftChange,
  onNoBallOpenChange,
  onScoreRun,
  onWide,
  onNoBall,
  onUndo,
  onSwapStrikers,
  onCorrectEventToDot,
  onSubmitWicket
}: {
  battingTeamName: string;
  bowlingTeamName: string;
  battingPlayers: Player[];
  bowlingPlayers: Player[];
  fieldingPlayers: Player[];
  battingMode: BattingMode;
  requiresNonStriker: boolean;
  isLastBatterSolo: boolean;
  derived: QuickScoringDerivedInnings;
  inningsState: InningsState;
  inningsCompleteMessage: string | null;
  maximumOvers: number;
  selection: { strikerId: string; nonStrikerId: string; bowlerId: string };
  selectionErrors: QuickSelectionErrors;
  wicketDraft: {
    open: boolean;
    type: QuickScoringDismissalType;
    dismissedPlayerId: string;
    fielderId: string;
    newBatterId: string;
    completedRuns: number | "";
    nextStrikerId: string;
    nextNonStrikerId: string;
  };
  wicketErrors: QuickWicketErrors;
  noBallOpen: boolean;
  saveStatus: string;
  disabled: boolean;
  canUndo: boolean;
  sectionRef?: RefObject<HTMLElement | null>;
  onSelectionChange: (selection: {
    strikerId: string;
    nonStrikerId: string;
    bowlerId: string;
  }) => void;
  onWicketDraftChange: (draft: {
    open: boolean;
    type: QuickScoringDismissalType;
    dismissedPlayerId: string;
    fielderId: string;
    newBatterId: string;
    completedRuns: number | "";
    nextStrikerId: string;
    nextNonStrikerId: string;
  }) => void;
  onNoBallOpenChange: (open: boolean) => void;
  onScoreRun: (runs: number) => void;
  onWide: () => void;
  onNoBall: (batterRuns: number) => void;
  onUndo: () => void;
  onSwapStrikers: () => void;
  onCorrectEventToDot: (eventId: string) => void;
  onSubmitWicket: () => void;
}) {
  const availableNewBatters = battingPlayers.filter(
    (player) => player.id !== selection.strikerId &&
      (!requiresNonStriker || player.id !== selection.nonStrikerId) &&
      player.id !== wicketDraft.dismissedPlayerId &&
      !derived.battingOrder.includes(player.id) &&
      !derived.battingPerformances.some(
        (performance) => performance.playerId === player.id && performance.wasOut
      )
  );
  const maxOversLabel = maximumOvers > 0 ? maximumOvers : "-";
  const dismissedPlayerIds = new Set(
    derived.battingPerformances
      .filter((performance) => performance.wasOut)
      .map((performance) => performance.playerId)
  );
  const overLimitReached = inningsState.hasCompletedOvers;
  const inningsIsComplete = inningsState.isComplete;
  const overJustEnded = !inningsIsComplete && derived.isBetweenOvers;
  const scoringDisabled = disabled || inningsIsComplete;
  const effectiveRunOutDismissedPlayerId = requiresNonStriker
    ? wicketDraft.dismissedPlayerId
    : selection.strikerId;
  const pendingDismissedPlayerId =
    wicketDraft.type === "run_out"
      ? effectiveRunOutDismissedPlayerId
      : wicketDraft.dismissedPlayerId || selection.strikerId;
  const wicketWouldEndInnings =
    new Set([
      ...dismissedPlayerIds,
      ...(pendingDismissedPlayerId ? [pendingDismissedPlayerId] : [])
    ]).size >= battingPlayers.length;
  const strikerOptions = battingPlayers.filter(
    (player) =>
      !dismissedPlayerIds.has(player.id) &&
      (!requiresNonStriker || player.id !== selection.nonStrikerId)
  );
  const nonStrikerOptions = battingPlayers.filter(
    (player) =>
      !dismissedPlayerIds.has(player.id) && player.id !== selection.strikerId
  );
  const bowlerOptions = bowlingPlayers.filter(
    (player) =>
      !(overJustEnded && derived.previousOverBowlerId === player.id)
  );
  const previousBowler = bowlingPlayers.find(
    (player) => player.id === derived.previousOverBowlerId
  );
  const batterLabel =
    battingMode === "single_batter" || isLastBatterSolo ? "Batter" : "Striker";
  const wicketLeavesSoloBatter =
    battingMode === "two_batter" &&
    requiresNonStriker &&
    availableNewBatters.length === 0 &&
    !wicketWouldEndInnings;
  const correctionEvents =
    derived.currentOverEvents.length > 0
      ? derived.currentOverEvents
      : overJustEnded
        ? derived.lastCompletedOverEvents
        : [];
  const correctionLabels = correctionEvents.map((event) => {
    if (event.wicket) return "W";
    if (event.extraType === "wide") return "WD";
    if (event.extraType === "no_ball") return `NB+${event.batterRuns}`;
    return String(event.batterRuns);
  });
  const activeBatterOptions = [
    {
      id: selection.strikerId,
      label: `Striker: ${getPlayerDisplayName(battingPlayers, selection.strikerId)}`
    },
    {
      id: selection.nonStrikerId,
      label: `Non-striker: ${getPlayerDisplayName(battingPlayers, selection.nonStrikerId)}`
    }
  ].filter((option) => option.id && (requiresNonStriker || option.id === selection.strikerId));
  const effectiveRunOutBatterName = getPlayerDisplayName(
    battingPlayers,
    effectiveRunOutDismissedPlayerId
  );
  return (
    <section
      ref={sectionRef}
      className="quick-scoring-panel rounded-lg border border-neon-cyan/35 bg-black/30 p-4"
    >
      <div className="quick-scoring-header">
        <div>
          <p className="text-xs font-black uppercase text-neon-cyan">
            Quick Scoring
          </p>
          <h2 className="text-2xl font-black uppercase text-stone-50">
            {battingTeamName} Batting
          </h2>
          <span className="text-sm font-bold text-stone-400">
            Bowling: {bowlingTeamName}
          </span>
          {battingMode === "single_batter" || isLastBatterSolo ? (
            <span className="mt-2 inline-flex rounded border border-neon-yellow/40 bg-neon-yellow/10 px-2 py-1 text-xs font-black uppercase text-neon-yellow">
              {battingMode === "single_batter" ? "Single Batter" : "Last Batter Solo"}
            </span>
          ) : null}
        </div>
        <div className="quick-save-status">{saveStatus}</div>
      </div>

      <div className="quick-score-strip">
        <div>
          <span>Score</span>
          <strong>
            {derived.runs}/{derived.wicketsLost}
          </strong>
        </div>
        <div>
          <span>Overs</span>
          <strong>
            {formatQuickOvers(derived.legalBalls)} / {maxOversLabel}
          </strong>
        </div>
        <div>
          <span>Current over</span>
          <strong>{formatQuickOverBalls(derived.legalBalls)}</strong>
        </div>
      </div>

      {inningsIsComplete ? (
        <div className="quick-end-over-note">
          <strong>{inningsCompleteMessage ?? "Innings Complete"}</strong>
          <span>
            {derived.runs}/{derived.wicketsLost} after {formatQuickOvers(derived.legalBalls)}
          </span>
          <span>Review the innings before continuing.</span>
          {derived.legalBalls > 0 || derived.wicketsLost > 0 ? (
            <button
              type="button"
              className="quick-completion-undo"
              disabled={!canUndo}
              onClick={onUndo}
            >
              UNDO LAST BALL
            </button>
          ) : null}
        </div>
      ) : null}

      {!inningsIsComplete ? (
      <>

      <div className="quick-player-selectors">
        <label className={selectionErrors.striker ? "quick-field-error" : undefined}>
          {batterLabel}
          <select
            value={selection.strikerId}
            disabled={disabled}
            onChange={(event) =>
              onSelectionChange({
                ...selection,
                strikerId: event.target.value,
                nonStrikerId:
                  event.target.value === selection.nonStrikerId
                    ? ""
                    : selection.nonStrikerId
              })
            }
          >
            <option value="">Select {batterLabel.toLowerCase()}</option>
            {strikerOptions.map((player) => (
              <option key={`quick-striker-${player.id}`} value={player.id}>
                {player.name}
              </option>
            ))}
          </select>
          <ErrorText>{selectionErrors.striker}</ErrorText>
        </label>
        {requiresNonStriker ? (
        <label className={selectionErrors.nonStriker ? "quick-field-error" : undefined}>
          Non-striker
          <select
            value={selection.nonStrikerId}
            disabled={disabled}
            onChange={(event) =>
              onSelectionChange({
                ...selection,
                nonStrikerId: event.target.value,
                strikerId:
                  event.target.value === selection.strikerId
                    ? ""
                    : selection.strikerId
              })
            }
          >
            <option value="">Select non-striker</option>
            {nonStrikerOptions.map((player) => (
              <option key={`quick-nonstriker-${player.id}`} value={player.id}>
                {player.name}
              </option>
            ))}
          </select>
          <ErrorText>{selectionErrors.nonStriker}</ErrorText>
        </label>
        ) : null}
        <label className={selectionErrors.bowler ? "quick-field-error" : undefined}>
          Bowler
          <select
            value={selection.bowlerId}
            disabled={disabled}
            onChange={(event) =>
              onSelectionChange({ ...selection, bowlerId: event.target.value })
            }
          >
            <option value="">Select bowler</option>
            {bowlerOptions.map((player) => (
              <option key={`quick-bowler-${player.id}`} value={player.id}>
                {player.name}
              </option>
            ))}
          </select>
          <ErrorText>{selectionErrors.bowler}</ErrorText>
        </label>
      </div>

      <div className="quick-scoring-buttons" aria-label="Quick run buttons">
        {[0, 1, 2, 3, 4, 6].map((runs) => (
          <button
            key={`quick-run-${runs}`}
            type="button"
            disabled={scoringDisabled}
            onClick={() => onScoreRun(runs)}
          >
            {runs}
          </button>
        ))}
      </div>

      <div className="quick-special-buttons">
        <button type="button" disabled={scoringDisabled} onClick={onWide}>
          WD
        </button>
        <button
          type="button"
          disabled={scoringDisabled}
          onClick={() => onNoBallOpenChange(!noBallOpen)}
        >
          NB
        </button>
        <button
          type="button"
          disabled={scoringDisabled}
          onClick={() =>
            onWicketDraftChange({
              ...wicketDraft,
              open: true,
              dismissedPlayerId: selection.strikerId,
              completedRuns: "",
              nextStrikerId: selection.strikerId,
              nextNonStrikerId: selection.nonStrikerId
            })
          }
        >
          Wicket
        </button>
      </div>

      {noBallOpen ? (
        <div className="quick-no-ball-panel">
          <p>No Ball - batter runs</p>
          <div>
            {[0, 1, 2, 3, 4, 6].map((runs) => (
              <button
                key={`quick-nb-${runs}`}
                type="button"
                disabled={scoringDisabled}
                onClick={() => {
                  onNoBall(runs);
                  onNoBallOpenChange(false);
                }}
              >
                {runs}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {wicketDraft.open ? (
        <div className="quick-wicket-panel">
          <label>
            Dismissal
            <select
              value={wicketDraft.type}
              disabled={disabled}
              onChange={(event) =>
                onWicketDraftChange({
                  ...wicketDraft,
                  type: event.target.value as QuickScoringDismissalType,
                  fielderId: "",
                  dismissedPlayerId:
                    event.target.value === "run_out"
                      ? requiresNonStriker
                        ? ""
                        : selection.strikerId
                      : selection.strikerId
                })
              }
            >
              <option value="bowled">Bowled</option>
              <option value="caught">Caught</option>
              <option value="stumped">Stumped</option>
              <option value="run_out">Run Out</option>
              <option value="other_bowler_wicket">Other</option>
            </select>
          </label>

          {wicketDraft.type === "stumped" ? (
            <label>
              Stumped by
              <select
                value={wicketDraft.fielderId}
                disabled={disabled}
                onChange={(event) =>
                  onWicketDraftChange({
                    ...wicketDraft,
                    fielderId: event.target.value
                  })
                }
              >
                <option value="">Select stumper</option>
                {fieldingPlayers
                  .filter(
                    (player) =>
                      player.id !== selection.bowlerId &&
                      player.id !== pendingDismissedPlayerId
                  )
                  .map((player) => (
                    <option key={`quick-stumper-${player.id}`} value={player.id}>
                      {player.name}
                    </option>
                  ))}
              </select>
              <ErrorText>{wicketErrors.fielder}</ErrorText>
            </label>
          ) : wicketDraft.type === "run_out" ? (
            <div className="quick-run-out-guide">
              {requiresNonStriker ? (
                <>
                  <p>Step 1 - who was run out?</p>
                  <div>
                    {activeBatterOptions.map((option) => (
                      <button
                        key={`quick-runout-dismissed-${option.id}`}
                        type="button"
                        className={
                          wicketDraft.dismissedPlayerId === option.id
                            ? "is-selected"
                            : ""
                        }
                        disabled={disabled}
                        onClick={() =>
                          onWicketDraftChange({
                            ...wicketDraft,
                            dismissedPlayerId: option.id,
                            nextStrikerId:
                              wicketDraft.nextStrikerId === option.id
                                ? ""
                                : wicketDraft.nextStrikerId,
                            nextNonStrikerId:
                              wicketDraft.nextNonStrikerId === option.id
                                ? ""
                                : wicketDraft.nextNonStrikerId
                          })
                        }
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p>
                  Batter being run out: <strong>{effectiveRunOutBatterName}</strong>
                </p>
              )}
              <ErrorText>{wicketErrors.dismissedPlayer}</ErrorText>

              <p>Step 2 - runs completed before the wicket</p>
              <div>
                {[0, 1, 2, 3].map((runs) => (
                  <button
                    key={`quick-runout-runs-${runs}`}
                    type="button"
                    className={
                      wicketDraft.completedRuns === runs ? "is-selected" : ""
                    }
                    disabled={disabled}
                    onClick={() =>
                      onWicketDraftChange({
                        ...wicketDraft,
                        completedRuns: runs
                      })
                    }
                  >
                    {runs}
                  </button>
                ))}
              </div>
              <ErrorText>{wicketErrors.completedRuns}</ErrorText>
            </div>
          ) : null}

          {wicketDraft.type === "caught" || wicketDraft.type === "run_out" ? (
            <label className={wicketErrors.fielder ? "quick-field-error" : undefined}>
              {wicketDraft.type === "caught" ? "Catcher" : "Primary fielder"}
              <select
                value={wicketDraft.fielderId}
                disabled={disabled}
                onChange={(event) =>
                  onWicketDraftChange({
                    ...wicketDraft,
                    fielderId: event.target.value
                  })
                }
              >
                <option value="">Select fielder</option>
                {fieldingPlayers.map((player) => (
                  <option key={`quick-fielder-${player.id}`} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
              <ErrorText>{wicketErrors.fielder}</ErrorText>
            </label>
          ) : null}
          {wicketWouldEndInnings || wicketLeavesSoloBatter ? (
            <p className="rounded-md border border-white/10 bg-white/5 p-3 text-sm font-bold text-stone-300">
              {wicketWouldEndInnings
                ? "No new batter needed if this wicket ends the innings."
                : "No new batter available. The surviving player continues as Last Batter Solo."}
            </p>
          ) : (
            <label className={wicketErrors.newBatter ? "quick-field-error" : undefined}>
              New batter
              <select
                value={wicketDraft.newBatterId}
                disabled={disabled}
                onChange={(event) =>
                  onWicketDraftChange({
                    ...wicketDraft,
                    newBatterId: event.target.value
                  })
                }
              >
                <option value="">Select new batter</option>
                {availableNewBatters.map((player) => (
                  <option key={`quick-new-batter-${player.id}`} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
              <ErrorText>{wicketErrors.newBatter}</ErrorText>
            </label>
          )}
          <div className="quick-wicket-actions">
            <button type="button" disabled={disabled} onClick={onSubmitWicket}>
              Record wicket
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onWicketDraftChange({ ...wicketDraft, open: false })}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="quick-correction-row">
        {requiresNonStriker ? (
        <button type="button" disabled={disabled} onClick={onSwapStrikers}>
          Swap Strikers
        </button>
        ) : null}
        <button
          type="button"
          disabled={!canUndo}
          onClick={onUndo}
        >
          Undo Last Ball
        </button>
      </div>

      <div className="quick-over-strip" aria-label="Current over events">
        {correctionLabels.length > 0 ? (
          correctionEvents.map((event, index) => (
            <button
              key={event.id}
              type="button"
              disabled={disabled}
              onClick={() => onCorrectEventToDot(event.id)}
              title="Correct this current-over event to dot ball"
            >
              {correctionLabels[index]}
            </button>
          ))
        ) : (
          <span>No balls in current over yet</span>
        )}
      </div>

      {overJustEnded && !overLimitReached ? (
        <div className="quick-end-over-note">
          <strong>End of Over</strong>
          <span>
            {derived.runs}/{derived.wicketsLost} after {formatQuickOvers(derived.legalBalls)}
          </span>
          <span>
            Previous bowler: {previousBowler?.name ?? "Unknown"}
          </span>
          <span>
            Over: {correctionLabels.join(" ") || "-"}
          </span>
          <b>Select next bowler before scoring again.</b>
        </div>
      ) : null}
      {overLimitReached ? (
        <div className="quick-end-over-note">
          <strong>Scheduled Over Limit Reached</strong>
          <span>Review and finalise when the innings is complete.</span>
        </div>
      ) : null}
      </>
      ) : null}

      {derived.missingInformation.length > 0 ? (
        <div className="quick-missing-info">
          {derived.missingInformation.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function TeamBowlingSection({
  teamId,
  teamName,
  players: teamPlayers,
  fieldingPlayers,
  battingPlayers,
  battingTeamPlayerCount,
  overs,
  inningsState,
  isLocked,
  onWicketLimit,
  onAddOver,
  onWicketsTakenChange,
  onUpdateDismissal,
  onRemoveDismissal,
  onRemoveOver,
  onUpdateOver
}: {
  teamId: TeamId;
  teamName: string;
  players: Player[];
  fieldingPlayers: Player[];
  battingPlayers: Player[];
  battingTeamPlayerCount: number;
  overs: BowlingOver[];
  inningsState: InningsState;
  isLocked: boolean;
  onWicketLimit: (wicketsStillAvailable: number) => void;
  onAddOver: (teamId: TeamId) => void;
  onWicketsTakenChange: (teamId: TeamId, overId: string, wicketsTaken: number) => void;
  onUpdateDismissal: (
    teamId: TeamId,
    overId: string,
    dismissalId: string,
    updates: Partial<DismissalEvent>
  ) => void;
  onRemoveDismissal: (teamId: TeamId, overId: string, dismissalId: string) => void;
  onRemoveOver: (teamId: TeamId, id: string) => void;
  onUpdateOver: (teamId: TeamId, id: string, updates: Partial<BowlingOver>) => void;
}) {
  const inningsCompleteMessage = getInningsCompleteMessage(inningsState);
  const hasIncompleteOver = overs.some((over) => !isBowlingOverComplete(over));
  const canAddOver = !inningsState.isComplete && !hasIncompleteOver;
  return (
    <section
      className={`team-bowling-panel team-section ${teamId === "teamA" ? "team-section-a" : "team-section-b"} rounded-lg bg-black/25 p-4`}
      style={getTeamAccentStyle(teamId)}
    >
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-black uppercase text-stone-50">
            {teamName} Bowling
          </h2>
          <p className="text-sm text-stone-400">
            Completed overs: {overs.length}
          </p>
        </div>
        {!isLocked ? (
        <Button
          type="button"
          variant="secondary"
          onClick={() => onAddOver(teamId)}
          disabled={isLocked || teamPlayers.length === 0 || !canAddOver}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add Over
        </Button>
        ) : null}
      </div>

      {inningsCompleteMessage ? (
        <p className="mt-3 rounded-md border border-neon-yellow/35 bg-neon-yellow/10 p-3 text-sm font-black uppercase text-neon-yellow">
          {inningsCompleteMessage}
        </p>
      ) : null}
      {!inningsCompleteMessage && hasIncompleteOver ? (
        <p className="mt-3 rounded-md border border-neon-yellow/35 bg-neon-yellow/10 p-3 text-sm font-black uppercase text-neon-yellow">
          Complete the dismissal details for the wickets taken in this over.
        </p>
      ) : null}

      <div className="mt-4 grid gap-3">
        {overs.length === 0 ? (
          <p className="rounded-md border border-white/10 bg-white/5 p-3 text-sm font-bold text-stone-300">
            No bowling overs entered for this team yet.
          </p>
        ) : null}

        {overs.map((over) => {
          const dismissedBatterIdsInOtherOvers = new Set(
            overs
              .flatMap((candidate) => candidate.dismissals)
              .filter((dismissal) => dismissal.overId !== over.id)
              .map((dismissal) => dismissal.dismissedBatterId)
          );
          const wicketsInOtherOvers = overs
            .filter((candidate) => candidate.id !== over.id)
            .reduce((total, candidate) => total + candidate.dismissals.length, 0);
          const remainingWicketsForCurrentOver = Math.max(
            0,
            battingTeamPlayerCount - wicketsInOtherOvers
          );

          return (
          <div key={over.id} className="bowling-over-card rounded-md border border-white/10 bg-white/5 p-3">
            <div className="bowling-over-row">
            <div className="over-number-field grid gap-1 text-xs font-black uppercase text-stone-300">
              <label>Over</label>
              <output className="rounded-md border border-white/15 bg-black/35 px-3 py-2 text-sm text-stone-100">
                {over.overNumber}
              </output>
            </div>
            <label className="bowler-field grid gap-1 text-xs font-black uppercase text-stone-300">
              Bowler
              <select
                value={over.bowlerId}
                disabled={isLocked}
                onChange={(event) =>
                  onUpdateOver(teamId, over.id, { bowlerId: event.target.value })
                }
                className="rounded-md border border-white/15 bg-black/35 px-3 py-2 text-sm text-stone-100 outline-none focus:ring-2 focus:ring-neon-cyan disabled:opacity-60"
              >
                <option value="">Select bowler</option>
                {teamPlayers.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="runs-field grid gap-1 text-xs font-black uppercase text-stone-300">
              Runs
              <input
                min={0}
                type="number"
                value={over.runsConceded}
                disabled={isLocked}
                onChange={(event) => {
                  const runsValue = event.target.value;

                  if (runsValue === "") {
                    onUpdateOver(teamId, over.id, {
                      runsConceded: "",
                      maiden: false
                    });
                    return;
                  }

                  const runsConceded = sanitizeRuns(runsValue);

                  onUpdateOver(teamId, over.id, {
                    runsConceded,
                    maiden: runsConceded === 0
                  });
                }}
                className="rounded-md border border-white/15 bg-black/35 px-3 py-2 text-sm text-stone-100 outline-none focus:ring-2 focus:ring-neon-cyan disabled:opacity-60"
              />
            </label>
            <label className="wickets-field grid gap-1 text-xs font-black uppercase text-stone-300">
              <span title="Total dismissals in this over, including run-outs.">
                Wkts taken
              </span>
              <input
                min={0}
                max={remainingWicketsForCurrentOver}
                type="number"
                value={over.wicketsTaken}
                disabled={isLocked || inningsState.hasReachedTarget}
                onChange={(event) => {
                  const wicketsValue = event.target.value;

                  if (wicketsValue === "") {
                    onUpdateOver(teamId, over.id, {
                      wicketsTaken: "",
                      dismissals: []
                    });
                    return;
                  }

                  const wicketsTaken = Math.min(
                    remainingWicketsForCurrentOver,
                    sanitizeRuns(wicketsValue)
                  );

                  if (sanitizeRuns(wicketsValue) > remainingWicketsForCurrentOver) {
                    onWicketLimit(remainingWicketsForCurrentOver);
                  }

                  onWicketsTakenChange(teamId, over.id, wicketsTaken);
                }}
                className="rounded-md border border-white/15 bg-black/35 px-3 py-2 text-sm text-stone-100 outline-none focus:ring-2 focus:ring-neon-cyan disabled:opacity-60"
              />
            </label>
            <div className="bowling-over-actions">
              {isLocked ? (
                over.maiden ? (
                  <span className="maiden-badge">MAIDEN</span>
                ) : (
                  <span className="maiden-empty">-</span>
                )
              ) : (
                <label className="maiden-control rounded-md border border-white/10 bg-black/30 px-3 py-2 text-xs font-black uppercase text-stone-200">
                  <input
                    type="checkbox"
                    checked={over.maiden}
                    onChange={(event) =>
                      onUpdateOver(teamId, over.id, {
                        maiden: event.target.checked,
                        runsConceded: event.target.checked ? 0 : over.runsConceded
                      })
                    }
                    className="h-4 w-4 accent-neon-yellow"
                  />
                  <span>MAIDEN</span>
                </label>
              )}
              {!isLocked ? (
              <Button
                type="button"
                variant="ghost"
                className="delete-over-button px-3"
                aria-label={`Delete over ${over.overNumber}`}
                disabled={isLocked}
                onClick={() => onRemoveOver(teamId, over.id)}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
              ) : null}
            </div>
          </div>
            <div className="over-dismissals mt-3 rounded-md border border-white/10 bg-black/20 p-3">
              <div className="over-dismissals-header flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <span className="text-xs font-black uppercase text-neon-cyan">
                  Dismissals ({over.dismissals.length})
                </span>
                <span className="text-xs font-bold text-stone-400">
                  Rows match Wkts Taken
                </span>
              </div>
              {over.dismissals.length === 0 ? (
                <p className="mt-2 text-xs font-bold text-stone-400">
                  No dismissals recorded in this over.
                </p>
              ) : null}
              <div className="mt-3 grid gap-2">
                {over.dismissals.map((dismissal, index) => (
                  <DismissalEditor
                    key={dismissal.id}
                    dismissal={dismissal}
                    dismissalNumber={index + 1}
                    over={over}
                    battingPlayers={battingPlayers}
                    bowlingPlayers={teamPlayers}
                    fieldingPlayers={fieldingPlayers}
                    dismissedBatterIds={
                      new Set([
                        ...dismissedBatterIdsInOtherOvers,
                        ...over.dismissals
                          .filter((candidate) => candidate.id !== dismissal.id)
                          .map((candidate) => candidate.dismissedBatterId)
                      ])
                    }
                    isLocked={isLocked}
                    onUpdate={(updates) =>
                      onUpdateDismissal(teamId, over.id, dismissal.id, updates)
                    }
                    onRemove={() => onRemoveDismissal(teamId, over.id, dismissal.id)}
                  />
                ))}
              </div>
            </div>
          </div>
          );
        })}
      </div>
    </section>
  );
}

function DismissalEditor({
  dismissal,
  dismissalNumber,
  over,
  battingPlayers,
  bowlingPlayers,
  fieldingPlayers,
  dismissedBatterIds,
  isLocked,
  onUpdate,
  onRemove
}: {
  dismissal: DismissalEvent;
  dismissalNumber: number;
  over: BowlingOver;
  battingPlayers: Player[];
  bowlingPlayers: Player[];
  fieldingPlayers: Player[];
  dismissedBatterIds: Set<string>;
  isLocked: boolean;
  onUpdate: (updates: Partial<DismissalEvent>) => void;
  onRemove: () => void;
}) {
  const bowlerName =
    bowlingPlayers.find((player) => player.id === over.bowlerId)?.name ??
    "selected bowler";
  const batterOptions = battingPlayers.filter(
    (player) =>
      (player.id === dismissal.dismissedBatterId ||
        !dismissedBatterIds.has(player.id)) &&
      player.id !== over.bowlerId
  );

  function handleTypeChange(type: DismissalType) {
    const needsFielder =
      type === "caught" || type === "run_out" || type === "stumped";

    onUpdate({
      type,
      creditedBowlerId: type === "run_out" ? null : over.bowlerId || null,
      fielderId: needsFielder ? dismissal.fielderId : null
    });
  }

  const needsFielder =
    dismissal.type === "caught" ||
    dismissal.type === "run_out" ||
    dismissal.type === "stumped";
  const fielderLabel =
    dismissal.type === "caught"
      ? "Caught by"
      : dismissal.type === "stumped"
        ? "Stumped by"
        : "Run-out by";
  const fielderOptions =
    dismissal.type === "stumped"
      ? fieldingPlayers.filter((player) => player.id !== over.bowlerId)
      : fieldingPlayers;
  const safeFielderOptions = fielderOptions.filter(
    (player) => player.id !== dismissal.dismissedBatterId
  );

  return (
    <div className="dismissal-row rounded-md border border-white/10 bg-white/5 p-2">
      <label className="grid gap-1 text-xs font-black uppercase text-stone-300">
        Dismissed batter {dismissalNumber}
        <select
          value={dismissal.dismissedBatterId}
          disabled={isLocked}
          onChange={(event) => onUpdate({ dismissedBatterId: event.target.value })}
          className="rounded-md border border-white/15 bg-black/35 px-3 py-2 text-sm text-stone-100 outline-none focus:ring-2 focus:ring-neon-cyan disabled:opacity-60"
        >
          <option value="">Select batter</option>
          {batterOptions.map((player) => (
            <option key={player.id} value={player.id}>
              {player.name}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-black uppercase text-stone-300">
        How out?
        <select
          value={dismissal.type}
          disabled={isLocked}
          onChange={(event) => handleTypeChange(event.target.value as DismissalType)}
          className="rounded-md border border-white/15 bg-black/35 px-3 py-2 text-sm text-stone-100 outline-none focus:ring-2 focus:ring-neon-cyan disabled:opacity-60"
        >
          <option value="bowled">Bowled</option>
          <option value="caught">Caught</option>
          <option value="stumped">Stumped</option>
          <option value="run_out">Run-out</option>
          <option value="other_bowler_wicket">Other bowler wicket</option>
        </select>
      </label>
      {needsFielder ? (
        <label className="grid gap-1 text-xs font-black uppercase text-stone-300">
          {fielderLabel}
          <select
            value={dismissal.fielderId ?? ""}
            disabled={isLocked}
            onChange={(event) => onUpdate({ fielderId: event.target.value || null })}
            className="rounded-md border border-white/15 bg-black/35 px-3 py-2 text-sm text-stone-100 outline-none focus:ring-2 focus:ring-neon-cyan disabled:opacity-60"
          >
            <option value="">Select fielder</option>
            {safeFielderOptions.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name}
              </option>
            ))}
          </select>
          {dismissal.type !== "run_out" ? (
            <span className="text-[11px] text-stone-400">
              Wicket credited to {bowlerName}
            </span>
          ) : null}
        </label>
      ) : (
        <p className="rounded-md border border-white/10 bg-black/25 px-3 py-2 text-xs font-black uppercase text-stone-300">
          Wicket credited to {bowlerName}
        </p>
      )}
      {!isLocked ? (
      <Button
        type="button"
        variant="ghost"
        className="delete-over-button px-3"
        aria-label="Remove dismissal"
        disabled={isLocked}
        onClick={onRemove}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </Button>
      ) : null}
    </div>
  );
}

function DerivedPlayerStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="derived-player-stat rounded-md border border-white/10 bg-black/25 px-3 py-2">
      <span className="block text-xs font-black uppercase text-stone-300">
        {label}
      </span>
      <strong className="text-2xl font-black text-neon-yellow">{value}</strong>
    </div>
  );
}

function getDismissalReviewMessage(
  performances: PlayerMatchPerformance[],
  inningsWicketsLost: number,
  maxDismissals: number
) {
  const totalBowlerWickets = performances.reduce(
    (sum, record) => sum + sanitizeRuns(record.wickets),
    0
  );
  const totalRunOuts = performances.reduce(
    (sum, record) => sum + sanitizeRuns(record.runOuts),
    0
  );
  const totalCatches = performances.reduce(
    (sum, record) => sum + sanitizeRuns(record.catches),
    0
  );
  const totalHatTricks = performances.reduce(
    (sum, record) => sum + sanitizeRuns(record.hatTricks),
    0
  );

  if (totalBowlerWickets + totalRunOuts > inningsWicketsLost) {
    return `player wicket and run-out credits exceed the ${inningsWicketsLost} dismissals recorded for this innings.`;
  }

  if (totalCatches > totalBowlerWickets) {
    return "catches cannot exceed bowler wickets.";
  }

  if (totalHatTricks > Math.floor(totalBowlerWickets / 3)) {
    return "team hat-tricks cannot exceed one per three bowler wickets.";
  }

  if (
    totalBowlerWickets > maxDismissals ||
    totalRunOuts > maxDismissals ||
    totalCatches > maxDismissals ||
    totalHatTricks > Math.floor(maxDismissals / 3)
  ) {
    return `dismissal credits cannot exceed the ${maxDismissals} available wickets.`;
  }

  return null;
}

function TeamPlayerRecordsSection({
  title,
  teamId,
  teamName,
  teamTotal,
  inningsScore,
  players: teamPlayers,
  performances,
  result,
  bowlingOvers,
  inningsWicketsLost,
  maxDismissals,
  isLocked,
  isFinalised,
  finalisedXPBreakdowns,
  onDidBatChange,
  onMoveBattingPosition,
  onUpdatePerformance
}: {
  title: string;
  teamId: TeamId;
  teamName: string;
  teamTotal: number;
  inningsScore: LiveInningsScore;
  players: Player[];
  performances: PlayerMatchPerformance[];
  result: MatchResult;
  bowlingOvers: BowlingOver[];
  inningsWicketsLost: number;
  maxDismissals: number;
  isLocked: boolean;
  isFinalised: boolean;
  finalisedXPBreakdowns: Record<string, PlayerMatchXPBreakdown>;
  onDidBatChange: (
    playerId: string,
    representingTeamId: TeamId,
    didBat: boolean
  ) => void;
  onMoveBattingPosition: (
    playerId: string,
    representingTeamId: TeamId,
    direction: "up" | "down"
  ) => void;
  onUpdatePerformance: (
    playerId: string,
    representingTeamId: TeamId,
    updates: Partial<PlayerMatchPerformance>
  ) => void;
}) {
  const reviewMessage = getDismissalReviewMessage(
    performances,
    inningsWicketsLost,
    maxDismissals
  );
  const allocation = calculateBattingAllocation(
    inningsScore.runs,
    performances
  );
  const orderedPerformances = sortBattingPerformances(performances);
  const orderedBattingKeys = orderedPerformances
    .filter((performance) => performance.didBat)
    .map(getPerformanceRecordKey);

  return (
    <section
      className={`team-player-records team-section ${teamId === "teamA" ? "team-section-a" : "team-section-b"} rounded-lg bg-black/25 p-4`}
      style={getTeamAccentStyle(teamId)}
    >
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-black uppercase text-stone-50">{title}</h2>
          <p className="text-sm text-stone-400">{teamName}</p>
        </div>
        <span className="rounded-md border border-neon-yellow/40 bg-neon-yellow/10 px-3 py-2 text-sm font-black uppercase text-neon-yellow">
          Total {teamTotal}
        </span>
      </div>

      {reviewMessage ? (
        <p className="mt-3 rounded-md border border-neon-red/45 bg-neon-red/10 p-3 text-sm font-black uppercase text-red-100">
          Needs review: {reviewMessage}
        </p>
      ) : null}

      <div className="mt-3 grid gap-2 rounded-md border border-neon-cyan/25 bg-black/25 p-3 text-xs font-black uppercase text-stone-300 sm:grid-cols-4">
        <div>
          <span className="block text-stone-500">Official score</span>
          <strong className="text-lg text-neon-yellow">
            {formatInningsScore(inningsScore.runs, inningsScore.wicketsLost)}
          </strong>
        </div>
        <div>
          <span className="block text-stone-500">Player runs</span>
          <strong className="text-lg text-stone-50">{allocation.playerRunsTotal}</strong>
        </div>
        <div>
          <span className="block text-stone-500">
            {allocation.isValid ? "Extras" : "Excess player runs"}
          </span>
          <strong className={allocation.isValid ? "text-lg text-neon-green" : "text-lg text-neon-red"}>
            {allocation.isValid ? allocation.extras : allocation.excessPlayerRuns}
          </strong>
        </div>
        <div>
          <span className="block text-stone-500">Status</span>
          <strong className={allocation.isValid ? "text-lg text-neon-green" : "text-lg text-neon-red"}>
            {allocation.isValid ? "Score allocated" : "Needs correction"}
          </strong>
        </div>
      </div>

      <div className="mt-4 grid gap-4">
        {teamPlayers.length === 0 ? (
          <p className="rounded-md border border-white/10 bg-white/5 p-3 text-sm font-bold text-stone-300">
            Select players for this team to enter records.
          </p>
        ) : null}

        {orderedPerformances.map((performance) => {
          const player = teamPlayers.find((candidate) => candidate.id === performance.playerId);
          const performanceTeamId = performance.representingTeamId ?? performance.teamId;
          const performanceKey = getPerformanceRecordKey(performance);
          const battingOrderIndex = orderedBattingKeys.indexOf(performanceKey);
          const playerOvers = bowlingOvers.filter(
            (over) => over.bowlerId === performance.playerId
          );
          const maximumRunsForPlayer =
            inningsScore.source === "bowling_feed" && !isFinalised
              ? getMaximumRunsForPlayer(
                  performance.playerId,
                  inningsScore.runs,
                  performances,
                  performanceTeamId
                )
              : undefined;
          if (!player) return null;
          const calculatedPlayerMatchXP = calculateMatchXP(performance, {
            result,
            teamWon: isWinningTeam(performance.teamId, result),
            overs: playerOvers
          });
          const playerMatchXP =
            isFinalised && finalisedXPBreakdowns[getPerformanceRecordKey(performance)]
              ? finalisedXPBreakdowns[getPerformanceRecordKey(performance)].awardedXP
              : calculatedPlayerMatchXP;
          const isSharedContext =
            performances.filter((record) => record.playerId === performance.playerId)
              .length > 1;

          return (
            <div
              key={performanceKey}
              className="player-match-record grid gap-4 rounded-lg border border-white/10 bg-white/5 p-4"
            >
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <div>
                  <h3 className="text-lg font-black uppercase text-stone-50">
                    {player.name}
                  </h3>
                  {isSharedContext ? (
                    <p className="text-xs font-black uppercase text-neon-yellow">
                      Shared Player - {performanceTeamId === "teamA" ? "Team A" : "Team B"} Performance
                    </p>
                  ) : null}
                  <p className={`player-match-xp text-xs font-bold uppercase ${isFinalised ? "is-awarded" : "text-stone-400"}`}>
                    {teamName} - {isFinalised ? "XP Awarded" : "Projected match XP"}:{" "}
                    {playerMatchXP}
                  </p>
                </div>
              </div>

              <div className="player-batting-grid grid gap-3">
                <label className="flex items-center gap-2 rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm font-bold text-stone-200">
                  <input
                    type="checkbox"
                    checked={performance.didBat}
                    disabled={isLocked}
                    onChange={(event) =>
                      onDidBatChange(
                        performance.playerId,
                        performanceTeamId,
                        event.target.checked
                      )
                    }
                    className="h-4 w-4 accent-neon-yellow"
                  />
                  Did bat
                </label>
                <div className="player-batting-field player-batting-order-field grid gap-1 rounded-md border border-white/10 bg-black/25 px-3 py-2 text-xs font-black uppercase text-stone-300">
                  Batting order
                  {performance.didBat ? (
                    <div className="batting-order-controls">
                      <span className="batting-order-position">
                        #{normalizeBattingPosition(performance.battingPosition) ?? battingOrderIndex + 1}
                      </span>
                      <button
                        type="button"
                        disabled={isLocked || battingOrderIndex <= 0}
                        onClick={() =>
                          onMoveBattingPosition(
                            performance.playerId,
                            performanceTeamId,
                            "up"
                          )
                        }
                        className="batting-order-button"
                        aria-label="Move batter up"
                        title="Move batter up"
                      >
                        <ChevronUp className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        disabled={
                          isLocked ||
                          battingOrderIndex < 0 ||
                          battingOrderIndex >= orderedBattingKeys.length - 1
                        }
                        onClick={() =>
                          onMoveBattingPosition(
                            performance.playerId,
                            performanceTeamId,
                            "down"
                          )
                        }
                        className="batting-order-button"
                        aria-label="Move batter down"
                        title="Move batter down"
                      >
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <span className="py-1 text-sm text-stone-500">Did not bat</span>
                  )}
                </div>
                <label className="player-batting-field grid gap-1 text-xs font-black uppercase text-stone-300">
                  Runs
                  <input
                    min={0}
                    max={maximumRunsForPlayer}
                    step={1}
                    inputMode="numeric"
                    type="number"
                    value={performance.runs}
                    disabled={isLocked || !performance.didBat}
                    onChange={(event) => {
                      const normalizedRuns = normalizeNonNegativeIntegerInput(
                        event.target.value
                      );

                      onUpdatePerformance(
                        performance.playerId,
                        performanceTeamId,
                        {
                          runs:
                            normalizedRuns === "" || maximumRunsForPlayer === undefined
                              ? normalizedRuns
                              : Math.min(maximumRunsForPlayer, normalizedRuns)
                        }
                      );
                    }}
                    onFocus={(event) => event.currentTarget.select()}
                    className="rounded-md border border-white/15 bg-black/35 px-3 py-2 text-sm text-stone-100 outline-none focus:ring-2 focus:ring-neon-cyan disabled:opacity-60"
                  />
                  {maximumRunsForPlayer !== undefined ? (
                    <span className="text-[11px] font-bold normal-case text-stone-400">
                      Maximum available: {maximumRunsForPlayer}
                    </span>
                  ) : null}
                </label>
                <label className="player-batting-field flex items-center gap-2 rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm font-bold text-stone-200">
                  <input
                    type="checkbox"
                    checked={performance.wasOut}
                    disabled
                    className="h-4 w-4 accent-neon-yellow"
                  />
                  Out
                </label>
              </div>

              <div className="player-stat-inputs">
                <DerivedPlayerStat label="Wickets" value={performance.wickets} />
                <DerivedPlayerStat label="Hat-tricks" value={performance.hatTricks} />
                <DerivedPlayerStat label="Catches" value={performance.catches} />
                <DerivedPlayerStat label="Run-outs" value={performance.runOuts} />
                <DerivedPlayerStat label="Stumpings" value={performance.stumpings ?? 0} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CompactLiveScoreBanner({
  battingTeamName,
  bowlingTeamName,
  score,
  maximumOvers,
  battingMode
}: {
  battingTeamName: string;
  bowlingTeamName: string;
  score: QuickScoringDerivedInnings;
  maximumOvers: number;
  battingMode: BattingMode;
}) {
  const strikerName = score.currentStrikerId
    ? getPlayerDisplayName(activePlayers, score.currentStrikerId)
    : battingMode === "single_batter"
      ? "Select batter"
      : "Select striker";
  const maxOversLabel = maximumOvers > 0 ? maximumOvers : "-";

  return (
    <section className="mobile-live-score" aria-label="Compact live score">
      <div>
        <span>{battingTeamName}</span>
        <strong>
          {score.runs}/{score.wicketsLost}
        </strong>
      </div>
      <p>
        {formatQuickOvers(score.legalBalls)} / {maxOversLabel} overs
      </p>
      <p>
        {battingTeamName} batting - {bowlingTeamName} bowling - {strikerName}*
        {score.isLastBatterSolo ? " - Solo Batter" : ""}
      </p>
    </section>
  );
}

function ResultBanner({
  result,
  status,
  teamAName,
  teamBName,
  firstInnings,
  secondInnings,
  firstInningsIsComplete,
  secondInningsIsComplete
}: {
  result: MatchResult;
  status: MatchStatus;
  teamAName: string;
  teamBName: string;
  firstInnings: TeamInnings;
  secondInnings: TeamInnings;
  firstInningsIsComplete: boolean;
  secondInningsIsComplete: boolean;
}) {
  const isFinal = status === "finalised" || result.type === "no_result";
  const firstTeamName = getTeamName(firstInnings.battingTeamId, teamAName, teamBName);
  const secondTeamName = getTeamName(secondInnings.battingTeamId, teamAName, teamBName);
  const preview = getLiveResultPreview({
    firstInnings,
    secondInnings,
    chasingTeamName: secondTeamName,
    matchStatus: status,
    firstInningsIsComplete,
    secondInningsIsComplete
  });
  const headline = isFinal
    ? getFinalResultHeadline(result, teamAName, teamBName)
    : preview.headline;
  const description = isFinal ? getFinalResultDescription(result) : preview.detail;
  const resultClassName = isFinal ? result.type : "pending";

  return (
    <section
      className={`match-result-banner match-result-${resultClassName} ${isFinal ? "match-result-final" : ""}`}
      aria-live="polite"
    >
      <div className="match-result-icon" aria-hidden="true">
        {isFinal && (result.type === "win_by_runs" || result.type === "win_by_wickets") ? (
          <Trophy className="h-10 w-10" />
        ) : null}
        {isFinal && result.type === "tie" ? <Swords className="h-10 w-10" /> : null}
        {result.type === "no_result" ? <Ban className="h-10 w-10" /> : null}
        {!isFinal ? <Swords className="h-10 w-10" /> : null}
      </div>

      <div className="match-result-content">
        <p className="match-result-kicker">
          {isFinal ? "Final Result" : "Live Result Preview"}
        </p>
        <h2>{headline}</h2>
        <div className="result-innings">
          <div className="result-innings-row">
            <span>{firstTeamName}</span>
            <strong>{formatInningsScore(firstInnings.runs, firstInnings.wicketsLost)}</strong>
          </div>
          <div className="result-innings-row">
            <span>{secondTeamName}</span>
            <strong>{formatInningsScore(secondInnings.runs, secondInnings.wicketsLost)}</strong>
          </div>
        </div>
        <p>{description}</p>
      </div>
    </section>
  );
}

function getFinalResultDescription(result: MatchResult) {
  if (result.type === "tie") return "Equal runs after both innings";
  if (result.type === "no_result") return "Match abandoned or cancelled";
  if (result.type === "win_by_runs" || result.type === "win_by_wickets") {
    return "Result confirmed from official innings scores";
  }

  return "Finalise the match to confirm the result";
}

function getTeamName(teamId: TeamId, teamAName: string, teamBName: string) {
  return teamId === "teamA" ? teamAName || "Team A" : teamBName || "Team B";
}

function isWinningTeam(teamId: TeamId, result: MatchResult) {
  return (
    (result.type === "win_by_runs" || result.type === "win_by_wickets") &&
    result.winnerTeamId === teamId
  );
}

function getStatusMessage(status: MatchStatus, result: MatchResult) {
  if (status === "draft") return "Draft checked locally. Team data is grouped and totals were recalculated.";
  if (status === "in_progress") return "Match marked in progress.";
  if (status === "abandoned" || status === "cancelled") return "Match marked as No Result.";
  if (result.type === "win_by_runs" || result.type === "win_by_wickets") {
    return "Match finalised. Result was calculated from innings scores.";
  }
  if (result.type === "tie") return "Match finalised as a tie.";
  return "Match status updated.";
}
