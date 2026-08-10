"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
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
  Users
} from "lucide-react";
import { activePlayers } from "@/lib/data/players";
import {
  buildTeamInnings,
  buildTeamMatchData,
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
  getPerformanceKey,
  getPerformanceRecordKey,
  hasOddAvailablePlayers,
  syncDismissalRows,
  toggleTeamSelection
} from "@/lib/match-records";
import type { LiveInningsScore, MatchValidationStage } from "@/lib/match-records";
import {
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
import {
  getLiveMatchConflict,
  getNextAvailableMatchNumber,
  hasDuplicateMatchNumber
} from "@/lib/next-match";
import {
  calculateMatchXP,
  calculatePlayerMatchXP,
  calculateSharedPlayerMatchXP
} from "@/lib/progression";
import { getPlayerOfMatchRecommendation } from "@/lib/player-of-match";
import type {
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
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ReopenMonthlyBeastsDialog } from "@/components/monthly-beasts/MonthlyBeastsFeature";
import {
  formatMonthLabel,
  formatMonthTitle,
  getMatchMonthKey
} from "@/lib/monthly-beasts";
import { monthlyBeastCrownRepository } from "@/lib/monthly-beasts-store";

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

const initialValues: MockMatchFormValues = {
  matchDate: "",
  matchNumber: "",
  startTime: "",
  matchName: "Gully Premier League",
  teamAName: "Team A",
  teamBName: "Team B",
  teamATotal: 0,
  teamBTotal: 0,
  scheduledOversPerInnings: "",
  notes: ""
};

const allPlayerIds = activePlayers.map((player) => player.id);

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
    teamAName: match.teams.teamA.teamName,
    teamBName: match.teams.teamB.teamName,
    teamATotal: match.teams.teamA.totalRuns,
    teamBTotal: match.teams.teamB.totalRuns,
    scheduledOversPerInnings: match.scheduledOversPerInnings ?? "",
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

export function MockMatchEntryForm({
  initialMatch = null,
  matches: suppliedMatches
}: {
  initialMatch?: MatchRecord | null;
  matches?: MatchRecord[];
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
    initialMatch ? getFormValuesFromMatch(initialMatch) : initialValues
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
  const [battingFirstTeamId, setBattingFirstTeamId] = useState<TeamId | "">(
    () => initialMatch?.battingFirstTeamId ?? ""
  );
  const [quickScoring, setQuickScoring] = useState(
    () => initialMatch?.quickScoring ?? createEmptyQuickScoringMetadata()
  );
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
    completedRuns: number;
    nextStrikerId: string;
    nextNonStrikerId: string;
  }>({
    open: false,
    type: "bowled",
    dismissedPlayerId: "",
    fielderId: "",
    newBatterId: "",
    completedRuns: 0,
    nextStrikerId: "",
    nextNonStrikerId: ""
  });
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
  const [message, setMessage] = useState(
    "Match workflow ready. Enter team, innings and player records."
  );
  const [isSavingMatch, setIsSavingMatch] = useState(false);
  const [liveConflictMatchId, setLiveConflictMatchId] = useState<string | null>(null);
  const [blockedCrownMonthKey, setBlockedCrownMonthKey] = useState<string | null>(
    null
  );
  const [reopenCrownMonthKey, setReopenCrownMonthKey] = useState<string | null>(
    null
  );

  const isLocked = status === "finalised";
  const isFinalised = status === "finalised";
  const canSafelyReopenFinalisedMatch = false;
  const isDemoMatch = initialMatch?.isDemo === true;
  const isDemoTestMatch = initialMatch?.isDemoTestMatch === true;
  const isNewMatch =
    status === "draft" &&
    values.matchDate === "" &&
    battingFirstTeamId === "" &&
    availablePlayerIds.length === 0 &&
    teamA.length === 0 &&
    teamB.length === 0 &&
    sharedPlayerId === null &&
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
  const isRosterLocked = status !== "draft";

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
    setBattingFirstTeamId(initialMatch.battingFirstTeamId ?? "");
    setQuickScoring(initialMatch.quickScoring ?? createEmptyQuickScoringMetadata());
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

  const availablePlayers = useMemo(
    () => activePlayers.filter((player) => availablePlayerIds.includes(player.id)),
    [availablePlayerIds]
  );
  const teamAPlayers = useMemo(
    () => activePlayers.filter((player) => teamA.includes(player.id)),
    [teamA]
  );
  const teamBPlayers = useMemo(
    () => activePlayers.filter((player) => teamB.includes(player.id)),
    [teamB]
  );
  const quickTeamADerived = useMemo(
    () =>
      deriveQuickScoringInnings({
        battingTeamId: "teamA",
        bowlingTeamId: "teamB",
        battingPlayerIds: teamA,
        bowlingPlayerIds: teamB,
        events: quickScoring.inningsAEvents
      }),
    [quickScoring.inningsAEvents, teamA, teamB]
  );
  const quickTeamBDerived = useMemo(
    () =>
      deriveQuickScoringInnings({
        battingTeamId: "teamB",
        bowlingTeamId: "teamA",
        battingPlayerIds: teamB,
        bowlingPlayerIds: teamA,
        events: quickScoring.inningsBEvents
      }),
    [quickScoring.inningsBEvents, teamA, teamB]
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

  const teamAPerformances = useMemo(
    () =>
      buildPerformanceList(
        teamAPlayers,
        "teamA",
        performances,
        bowlingOvers.teamA,
        bowlingOvers.teamB
      ),
    [bowlingOvers.teamA, bowlingOvers.teamB, performances, teamAPlayers]
  );
  const teamBPerformances = useMemo(
    () =>
      buildPerformanceList(
        teamBPlayers,
        "teamB",
        performances,
        bowlingOvers.teamB,
        bowlingOvers.teamA
      ),
    [bowlingOvers.teamA, bowlingOvers.teamB, performances, teamBPlayers]
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
  const quickActiveBattingTeamId: TeamId = firstInningsIsComplete
    ? chasingTeamId
    : effectiveBattingFirstTeamId;
  const quickActiveBowlingTeamId = getChasingTeamId(quickActiveBattingTeamId);
  const quickActiveBattingPlayers =
    quickActiveBattingTeamId === "teamA" ? teamAPlayers : teamBPlayers;
  const quickActiveBowlingPlayers =
    quickActiveBowlingTeamId === "teamA" ? teamAPlayers : teamBPlayers;
  const quickActiveDerived =
    quickActiveBattingTeamId === "teamA" ? quickTeamADerived : quickTeamBDerived;

  useEffect(() => {
    if (!hasQuickScoringEvents) return;

    let isCurrent = true;

    queueMicrotask(() => {
      if (!isCurrent) return;

      setQuickSelection((current) => ({
        strikerId: quickActiveDerived.currentStrikerId ?? current.strikerId,
        nonStrikerId:
          quickActiveDerived.currentNonStrikerId ?? current.nonStrikerId,
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
    quickActiveDerived.currentStrikerId
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
    const hasDraftData =
      Object.keys(performances).length > 0 ||
      bowlingOvers.teamA.length > 0 ||
      bowlingOvers.teamB.length > 0 ||
      teamA.length > 0 ||
      teamB.length > 0;

    if (
      hasDraftData &&
      sharedPlayerId !== nextSharedPlayerId &&
      !window.confirm(
        "Changing the Shared Player will rebuild both team rosters and may remove draft batting, bowling and dismissal records associated with the current shared player. Continue?"
      )
    ) {
      return;
    }

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

    const saved = await persistNonFinalisedMatch({
      ...buildCurrentMatchRecord(status, liveResult, new Date().toISOString()),
      quickScoring: nextQuickScoring
    });

    setQuickSaveStatus(saved ? "Saved" : "Save needed");
  }

  function updateQuickScoring(nextQuickScoring: typeof quickScoring) {
    setQuickScoring(nextQuickScoring);
    void autosaveQuickScoring(nextQuickScoring);
  }

  function getQuickDismissedPlayerIds(derived: QuickScoringDerivedInnings) {
    return new Set(
      derived.battingPerformances
        .filter((performance) => performance.wasOut)
        .map((performance) => performance.playerId)
    );
  }

  function validateQuickScoringAction() {
    const dismissedPlayerIds = getQuickDismissedPlayerIds(quickActiveDerived);
    const battingPlayerIds = new Set(
      quickActiveBattingPlayers.map((player) => player.id)
    );
    const bowlingPlayerIds = new Set(
      quickActiveBowlingPlayers.map((player) => player.id)
    );

    if (
      isLocked ||
      !quickSelection.strikerId ||
      !quickSelection.nonStrikerId ||
      !quickSelection.bowlerId
    ) {
      setMessage("Select striker, non-striker and bowler before quick scoring.");
      return false;
    }

    if (quickSelection.strikerId === quickSelection.nonStrikerId) {
      setMessage("Striker and non-striker must be different players.");
      return false;
    }

    if (
      !battingPlayerIds.has(quickSelection.strikerId) ||
      !battingPlayerIds.has(quickSelection.nonStrikerId)
    ) {
      setMessage("Select batters from the batting team.");
      return false;
    }

    if (
      dismissedPlayerIds.has(quickSelection.strikerId) ||
      dismissedPlayerIds.has(quickSelection.nonStrikerId)
    ) {
      setMessage("A dismissed batter cannot face the next ball.");
      return false;
    }

    if (!bowlingPlayerIds.has(quickSelection.bowlerId)) {
      setMessage("Select a bowler from the bowling team.");
      return false;
    }

    if (
      quickActiveDerived.legalBalls > 0 &&
      quickActiveDerived.legalBalls % 6 === 0 &&
      quickActiveDerived.previousOverBowlerId === quickSelection.bowlerId
    ) {
      setMessage("Select a different bowler for the next over.");
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
    if (!validateQuickScoringAction()) return;

    const key = getQuickScoringInningsKey(quickActiveBattingTeamId);
    const events = getQuickScoringEventsForTeam(quickScoring, quickActiveBattingTeamId);
    const event = createQuickScoringEvent({
      battingTeamId: quickActiveBattingTeamId,
      strikerId: quickSelection.strikerId,
      nonStrikerId: quickSelection.nonStrikerId,
      bowlerId: quickSelection.bowlerId,
      batterRuns,
      extraType,
      extras,
      wicket,
      sequence: nextQuickScoringSequence(events)
    });

    updateQuickScoring({
      ...quickScoring,
      [key]: [...events, event]
    });
    setMessage("Quick scoring event recorded.");
  }

  function undoQuickScoringEvent() {
    if (isLocked) return;

    updateQuickScoring(
      undoLastQuickScoringEvent(quickScoring, quickActiveBattingTeamId)
    );
    setMessage("Last quick scoring event undone.");
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
    const dismissedPlayerId =
      quickWicketDraft.dismissedPlayerId || quickSelection.strikerId;
    const survivorId =
      dismissedPlayerId === quickSelection.strikerId
        ? quickSelection.nonStrikerId
        : quickSelection.strikerId;
    const dismissedPlayerIds = getQuickDismissedPlayerIds(quickActiveDerived);
    const battingPlayerIds = new Set(
      quickActiveBattingPlayers.map((player) => player.id)
    );
    const wicketWouldLeaveAvailableBatter =
      dismissedPlayerIds.size + 1 < quickActiveBattingPlayers.length;

    if (!dismissedPlayerId) {
      setMessage("Select who was dismissed.");
      return;
    }

    if (
      dismissedPlayerId !== quickSelection.strikerId &&
      dismissedPlayerId !== quickSelection.nonStrikerId
    ) {
      setMessage("The dismissed batter must be one of the active batters.");
      return;
    }

    if (
      (quickWicketDraft.type === "caught" || quickWicketDraft.type === "run_out") &&
      !quickWicketDraft.fielderId
    ) {
      setMessage(
        quickWicketDraft.type === "caught"
          ? "Select the catcher."
          : "Select the run-out fielder."
      );
      return;
    }

    if (
      quickWicketDraft.type === "run_out" &&
      (!quickWicketDraft.nextStrikerId ||
        !quickWicketDraft.nextNonStrikerId ||
        quickWicketDraft.nextStrikerId === quickWicketDraft.nextNonStrikerId)
    ) {
      setMessage("Confirm distinct next-ball striker and non-striker for the run-out.");
      return;
    }

    if (
      quickWicketDraft.newBatterId &&
      (quickWicketDraft.newBatterId === survivorId ||
        quickWicketDraft.newBatterId === dismissedPlayerId ||
        !battingPlayerIds.has(quickWicketDraft.newBatterId) ||
        dismissedPlayerIds.has(quickWicketDraft.newBatterId))
    ) {
      setMessage("Select an eligible new batter.");
      return;
    }

    if (wicketWouldLeaveAvailableBatter && !quickWicketDraft.newBatterId) {
      setMessage("Select the new batter before recording this wicket.");
      return;
    }

    if (
      quickWicketDraft.type === "run_out" &&
      (!battingPlayerIds.has(quickWicketDraft.nextStrikerId) ||
        !battingPlayerIds.has(quickWicketDraft.nextNonStrikerId) ||
        quickWicketDraft.nextStrikerId === dismissedPlayerId ||
        quickWicketDraft.nextNonStrikerId === dismissedPlayerId ||
        dismissedPlayerIds.has(quickWicketDraft.nextStrikerId) ||
        dismissedPlayerIds.has(quickWicketDraft.nextNonStrikerId))
    ) {
      setMessage("Confirm eligible next-ball batters for the run-out.");
      return;
    }

    appendQuickScoringEvent({
      batterRuns: quickWicketDraft.completedRuns,
      extraType: null,
      wicket: {
        type: quickWicketDraft.type,
        dismissedPlayerId,
        fielderId: quickWicketDraft.fielderId || null,
        newBatterId: quickWicketDraft.newBatterId || null,
        completedRuns: quickWicketDraft.completedRuns,
        nextStrikerId: quickWicketDraft.nextStrikerId || null,
        nextNonStrikerId: quickWicketDraft.nextNonStrikerId || null
      }
    });
    setQuickWicketDraft({
      open: false,
      type: "bowled",
      dismissedPlayerId: "",
      fielderId: "",
      newBatterId: "",
      completedRuns: 0,
      nextStrikerId: "",
      nextNonStrikerId: ""
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
    appliedAt: string
  ): MatchRecord {
    const allBowlingOvers = [...bowlingOvers.teamA, ...bowlingOvers.teamB];
    const teamContextFinalisedRecords: FinalisedPlayerMatchRecord[] = performanceList.map(
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
      performances: performanceList,
      allBowlingOvers,
      result,
      sharedPlayerId,
      appliedAt,
      finalStatus
    });
    const teamAMatchData = buildTeamMatchData({
      teamId: "teamA",
      teamName: values.teamAName,
      playerIds: teamA,
      performances: performanceList,
      bowlingOvers: bowlingOvers.teamA
    });
    const teamBMatchData = buildTeamMatchData({
      teamId: "teamB",
      teamName: values.teamBName,
      playerIds: teamB,
      performances: performanceList,
      bowlingOvers: bowlingOvers.teamB
    });

    return {
      id: matchId,
      isDemo: isDemoMatch,
      isDemoTestMatch,
      matchDate: values.matchDate,
      matchNumber: getMatchNumberValue(values.matchNumber),
      startTime: values.startTime || undefined,
      matchName: values.matchName,
      venue: "CZU Gully Arena",
      status: finalStatus,
      scheduledOversPerInnings: getScheduledOversValue(
        values.scheduledOversPerInnings
      ),
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
      sharedPlayerId,
      quickScoring,
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
        first: firstInnings,
        second: secondInnings
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

  async function persistNonFinalisedMatch(match: MatchRecord) {
    if (!supabaseWriteMode) {
      localMatchRepository.saveMatch(match);
      return true;
    }

    const result = await saveSupabaseAdminMatch({
      match,
      expectedUpdatedAt: supabaseUpdatedAt
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

  async function validateAndSetStatus(
    nextStatus: MatchStatus,
    stage: MatchValidationStage,
    options: ValidateAndSetStatusOptions = {}
  ): Promise<boolean> {
    setIsSavingMatch(true);

    try {
      setLiveConflictMatchId(null);
      setBlockedCrownMonthKey(null);

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
          `Game ${matchNumber} already exists for this date. Choose another game number.`
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
          setMessage(quickIssues[0] ?? "Resolve quick scoring details before finalising.");
          return false;
        }

        if (!secondInningsIsComplete) {
          setMessage("Finish the match or innings review before finalising.");
          return false;
        }
      }

      if (nextStatus === "finalised" && !options.skipMonthlyCrownGuard) {
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
          battingFirstTeamId: battingFirstTeamId || null,
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
        setMessage(result.errors[0] ?? "Please check the match record.");
        return false;
      }

      if (nextStatus === "finalised") {
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

        const appliedAt = new Date().toISOString();
        const finalisedMatch = buildCurrentMatchRecord(
          nextStatus,
          result.result,
          appliedAt
        );

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
        const saved = await persistNonFinalisedMatch(
          buildCurrentMatchRecord(nextStatus, result.result, new Date().toISOString())
        );

        if (!saved) return false;

        setFinalisedXPBreakdowns({});
      }

      setStatus(nextStatus);
      setMessage(getStatusMessage(nextStatus, result.result));
      if (nextStatus === "finalised" && supabaseWriteMode) {
        window.location.href = `/matches/${matchId}`;
      }
      return true;
    } catch {
      setMessage("COULD NOT SAVE MATCH. Your changes were not saved. Please try again.");
      return false;
    } finally {
      setIsSavingMatch(false);
    }
  }

  async function continueToTeamSetup() {
    const saved = await validateAndSetStatus("draft", "draft");

    if (saved) {
      window.location.href = `/matches/${matchId}`;
    }
  }

  function openReopenCrownDialog(monthKey: string) {
    setBlockedCrownMonthKey(null);
    setReopenCrownMonthKey(monthKey);
  }

  async function confirmMonthlyBeastReopenFromMatch() {
    if (!reopenCrownMonthKey) return;

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

  function resetForm() {
    setMatchId(createLocalMatchId());
    setSupabaseUpdatedAt(null);
    setValues(initialValues);
    setAvailablePlayerIds([]);
    setTeamA([]);
    setTeamB([]);
    setSharedPlayerId(null);
    setBattingFirstTeamId("");
    setInningsExtras({ teamA: 0, teamB: 0 });
    setPerformances({});
    setPlayerOfMatchSelectionMode("auto");
    setBowlingOvers({ teamA: [], teamB: [] });
    setStatus("draft");
    setFinalisedXPBreakdowns({});
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
      {isDemoTestMatch ? (
        <div className="mt-4 inline-flex w-fit rounded-md border border-neon-yellow/45 bg-neon-yellow/10 px-3 py-2 text-xs font-black uppercase text-neon-yellow">
          Demo Test - Will Be Removed By Demo Reset
        </div>
      ) : null}

      <form
        aria-label={matchPageTitle}
        className="mt-5 grid gap-5"
        onSubmit={(event) => event.preventDefault()}
      >
        <ResultBanner
          result={liveResult}
          status={status}
          teamAName={values.teamAName}
          teamBName={values.teamBName}
          firstInnings={firstInnings}
          secondInnings={secondInnings}
          firstInningsIsComplete={firstInningsIsComplete}
          secondInningsIsComplete={secondInningsIsComplete}
        />

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
          <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-bold text-stone-200">
            Match date
            <input
              type="date"
              value={values.matchDate}
              disabled={isLocked}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  matchDate: event.target.value,
                  matchNumber:
                    initialMatch || current.matchNumber !== "" || !event.target.value
                      ? current.matchNumber
                      : getNextAvailableMatchNumber(savedMatches, event.target.value)
                }))
              }
              className="rounded-md border border-white/15 bg-black/35 px-3 py-3 text-stone-100 outline-none focus:ring-2 focus:ring-neon-cyan disabled:opacity-60"
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-stone-200">
            Game number
            <input
              min={1}
              step={1}
              type="number"
              value={values.matchNumber}
              disabled={isLocked}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  matchNumber:
                    event.target.value === ""
                      ? ""
                      : Math.max(1, sanitizeRuns(event.target.value))
                }))
              }
              className="rounded-md border border-white/15 bg-black/35 px-3 py-3 text-stone-100 outline-none focus:ring-2 focus:ring-neon-cyan disabled:opacity-60"
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-stone-200">
            Start time
            <input
              type="time"
              value={values.startTime}
              disabled={isLocked}
              onChange={(event) =>
                setValues((current) => ({ ...current, startTime: event.target.value }))
              }
              className="rounded-md border border-white/15 bg-black/35 px-3 py-3 text-stone-100 outline-none focus:ring-2 focus:ring-neon-cyan disabled:opacity-60"
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-stone-200">
            Match name
            <input
              value={values.matchName}
              disabled={isLocked}
              onChange={(event) =>
                setValues((current) => ({ ...current, matchName: event.target.value }))
              }
              className="rounded-md border border-white/15 bg-black/35 px-3 py-3 text-stone-100 outline-none focus:ring-2 focus:ring-neon-cyan disabled:opacity-60"
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-stone-200">
            Team A name
            <input
              value={values.teamAName}
              disabled={isLocked}
              onChange={(event) =>
                setValues((current) => ({ ...current, teamAName: event.target.value }))
              }
              className="rounded-md border border-white/15 bg-black/35 px-3 py-3 text-stone-100 outline-none focus:ring-2 focus:ring-neon-cyan disabled:opacity-60"
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-stone-200">
            Team B name
            <input
              value={values.teamBName}
              disabled={isLocked}
              onChange={(event) =>
                setValues((current) => ({ ...current, teamBName: event.target.value }))
              }
              className="rounded-md border border-white/15 bg-black/35 px-3 py-3 text-stone-100 outline-none focus:ring-2 focus:ring-neon-cyan disabled:opacity-60"
            />
          </label>
          <div className="grid gap-2 text-sm font-bold text-stone-200">
            Scoring flow
            <output className="rounded-md border border-white/15 bg-black/35 px-3 py-3 text-stone-100">
              {getFriendlyWorkflowStatus(status, quickSaveStatus)}
            </output>
          </div>
          <label className="grid gap-2 text-sm font-bold text-stone-200">
            Scheduled overs per innings
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
              className="rounded-md border border-white/15 bg-black/35 px-3 py-3 text-stone-100 outline-none focus:ring-2 focus:ring-neon-cyan disabled:opacity-60"
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-stone-200">
            Who bats first?
            <select
              value={battingFirstTeamId}
              disabled={isRosterLocked}
              onChange={(event) => setBattingFirstTeamId(event.target.value as TeamId | "")}
              className="rounded-md border border-white/15 bg-black/35 px-3 py-3 text-stone-100 outline-none focus:ring-2 focus:ring-neon-cyan disabled:opacity-60"
            >
              <option value="">Select innings order</option>
              <option value="teamA">{values.teamAName || "Team A"}</option>
              <option value="teamB">{values.teamBName || "Team B"}</option>
            </select>
          </label>
          <div className="grid gap-2 text-sm font-bold text-stone-200">
            Live innings scores
            <div className="grid grid-cols-2 gap-3">
              <output className="rounded-md border border-white/15 bg-black/35 px-3 py-3 text-2xl font-black text-neon-yellow">
                {formatInningsScore(teamAInningsScore.runs, teamAInningsScore.wicketsLost)}
              </output>
              <output className="rounded-md border border-white/15 bg-black/35 px-3 py-3 text-2xl font-black text-neon-yellow">
                {formatInningsScore(teamBInningsScore.runs, teamBInningsScore.wicketsLost)}
              </output>
            </div>
          </div>
        </div>

          <div className="grid gap-4 md:grid-cols-2">
          <InningsAllocationPanel
            teamName={values.teamAName || "Team A"}
            score={teamAInningsScore}
          />
          <InningsAllocationPanel
            teamName={values.teamBName || "Team B"}
            score={teamBInningsScore}
          />
        </div>

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
            derived={quickActiveDerived}
            maximumOvers={scheduledOversForCalculations}
            selection={quickSelection}
            wicketDraft={quickWicketDraft}
            noBallOpen={quickNoBallOpen}
            saveStatus={quickSaveStatus}
            disabled={isLocked || !battingFirstTeamId || !canUseTeamControls}
            onSelectionChange={setQuickSelection}
            onWicketDraftChange={setQuickWicketDraft}
            onNoBallOpenChange={setQuickNoBallOpen}
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

          <section className="rounded-lg border border-neon-green/30 bg-black/25 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-black uppercase text-stone-50">
                <Users className="h-5 w-5 text-neon-green" aria-hidden="true" />
                Available Today
              </h2>
              <p className="text-sm text-stone-400">
                Select the players available today, then generate two balanced teams or choose them manually.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={selectAllAvailable} disabled={isRosterLocked}>
                Select All
              </Button>
              <Button type="button" variant="ghost" onClick={clearAvailability} disabled={isRosterLocked}>
                Clear All
              </Button>
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
                Auto-Balance Teams
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
                Shuffle Again
              </Button>
              <Button type="button" variant="ghost" onClick={clearTeams} disabled={isRosterLocked}>
                Clear Teams
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-md border border-neon-cyan/25 bg-black/25 p-3 text-sm font-black uppercase text-stone-100">
              {availableSummary.uniquePlayers} unique players available
            </div>
            <div className="rounded-md border border-neon-yellow/25 bg-black/25 p-3 text-sm font-black uppercase text-neon-yellow">
              {availableSummary.teamASize} vs {availableSummary.teamBSize}
            </div>
            <div className="rounded-md border border-neon-green/25 bg-black/25 p-3 text-sm font-black uppercase text-neon-green">
              {availableSummary.sharedSlots} shared player
            </div>
          </div>

          {hasOddAttendance ? (
            <div className="mt-4 rounded-lg border border-neon-yellow/35 bg-neon-yellow/10 p-4">
              <label className="grid gap-2 text-sm font-black uppercase text-yellow-100">
                Shared Player - Plays for Both Teams
                <select
                  value={sharedPlayerId ?? ""}
                  disabled={isRosterLocked}
                  onChange={(event) => changeSharedPlayer(event.target.value)}
                  className="rounded-md border border-white/15 bg-black/45 px-3 py-3 text-stone-100 outline-none focus:ring-2 focus:ring-neon-cyan disabled:opacity-60"
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
              {!sharedPlayerId ? (
                <p className="mt-2 rounded-md border border-neon-red/40 bg-neon-red/10 p-3 text-sm font-black uppercase text-red-100">
                  Select one Shared Player to create equal teams.
                </p>
              ) : null}
            </div>
          ) : null}
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            {renderTeamSelector("A", teamA, teamB)}
            {renderTeamSelector("B", teamB, teamA)}
          </div>
        </>
        )}

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

        {!isFinalised ? (
        <ResultBanner
          result={liveResult}
          status={status}
          teamAName={values.teamAName}
          teamBName={values.teamBName}
          firstInnings={firstInnings}
          secondInnings={secondInnings}
          firstInningsIsComplete={firstInningsIsComplete}
          secondInningsIsComplete={secondInningsIsComplete}
        />
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
          {status === "draft" ? (
            <Button
              type="button"
              variant="ghost"
              onClick={continueToTeamSetup}
              disabled={isSavingMatch}
            >
              Continue to Team Setup
            </Button>
          ) : null}
          {status === "draft" ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => validateAndSetStatus("in_progress", "start")}
              disabled={isLocked || !canUseTeamControls || isSavingMatch}
            >
              <Swords className="h-4 w-4" aria-hidden="true" />
              Start Quick Scoring
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            onClick={() => validateAndSetStatus("finalised", "finalise")}
            disabled={isLocked || !canUseTeamControls || isSavingMatch}
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Finalise Match
          </Button>
          <Button type="button" variant="ghost" onClick={resetForm} disabled={isSavingMatch}>
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
    </>
  );

  function renderTeamSelector(team: TeamKey, source: string[], other: string[]) {
    return (
      <fieldset className="rounded-lg border border-white/12 bg-black/20 p-4">
        <legend className="px-1 text-sm font-black uppercase text-neon-yellow">
          Team {team} players
        </legend>
        <div className="mt-3 grid gap-2">
          {availablePlayers.length === 0 ? (
            <p className="rounded-md border border-white/10 bg-white/5 p-3 text-sm font-bold text-stone-300">
              Mark players Available Today before choosing teams.
            </p>
          ) : null}

          {availablePlayers.map((player) => {
            const selected = source.includes(player.id);
            const isShared = player.id === sharedPlayerId;
            const disabled = isRosterLocked || isShared || other.includes(player.id);

            return (
              <label
                key={`${team}-${player.id}`}
                className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-stone-100 hover:bg-white/10 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-45"
              >
                <span className="flex flex-wrap items-center gap-2">
                  {player.name}
                  {isShared ? (
                    <b className="rounded border border-neon-yellow/35 bg-neon-yellow/10 px-2 py-0.5 text-[10px] font-black uppercase text-neon-yellow">
                      Shared Player
                    </b>
                  ) : null}
                </span>
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={disabled}
                  onChange={() => togglePlayer(team, player.id)}
                  className="h-5 w-5 accent-neon-yellow"
                />
              </label>
            );
          })}
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
  opposingBowlingOvers: BowlingOver[]
): PlayerMatchPerformance[] {
  const dismissedBatterIds = new Set(getDismissedBatterIds(opposingBowlingOvers));

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
      catches: calculatePlayerCatches(player.id, ownBowlingOvers),
      runOuts: calculatePlayerRunOuts(player.id, ownBowlingOvers),
      stumpings: calculatePlayerStumpings(player.id, ownBowlingOvers)
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

  return `${score.completedOvers} overs - ${score.wicketsLost} wickets - ${score.runs} runs conceded`;
}

function getPlayerRecordsDisclosureSummary(
  inningsScore: LiveInningsScore,
  performances: PlayerMatchPerformance[]
) {
  const allocation = calculateBattingAllocation(inningsScore.runs, performances);

  return `${formatInningsScore(inningsScore.runs, inningsScore.wicketsLost)} - Player runs ${allocation.playerRunsTotal} - Extras ${allocation.extras}`;
}

function formatQuickOvers(legalBalls: number): string {
  const safeLegalBalls = sanitizeRuns(legalBalls);

  return `${Math.floor(safeLegalBalls / 6)}.${safeLegalBalls % 6}`;
}

function formatQuickOverBalls(legalBalls: number): string {
  return `${sanitizeRuns(legalBalls) % 6}/6`;
}

function getPlayerDisplayName(players: Player[], playerId: string): string {
  return players.find((player) => player.id === playerId)?.name ?? "Select player";
}

function getFriendlyWorkflowStatus(status: MatchStatus, saveStatus: string): string {
  if (status === "finalised") return "Match Scorecard";
  if (status === "abandoned" || status === "cancelled") return "No Result";
  if (status === "in_progress") return `Live - ${saveStatus}`;

  return `Draft - ${saveStatus}`;
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
            {score.completedOvers} overs - source: {score.source.replace("_", " ")}
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

function QuickScoringPanel({
  battingTeamName,
  bowlingTeamName,
  battingPlayers,
  bowlingPlayers,
  derived,
  maximumOvers,
  selection,
  wicketDraft,
  noBallOpen,
  saveStatus,
  disabled,
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
  derived: QuickScoringDerivedInnings;
  maximumOvers: number;
  selection: { strikerId: string; nonStrikerId: string; bowlerId: string };
  wicketDraft: {
    open: boolean;
    type: QuickScoringDismissalType;
    dismissedPlayerId: string;
    fielderId: string;
    newBatterId: string;
    completedRuns: number;
    nextStrikerId: string;
    nextNonStrikerId: string;
  };
  noBallOpen: boolean;
  saveStatus: string;
  disabled: boolean;
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
    completedRuns: number;
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
      player.id !== selection.nonStrikerId &&
      player.id !== wicketDraft.dismissedPlayerId &&
      !derived.battingOrder.includes(player.id) &&
      !derived.battingPerformances.some(
        (performance) => performance.playerId === player.id && performance.wasOut
      )
  );
  const maxOversLabel = maximumOvers > 0 ? maximumOvers : "-";
  const overLimitReached =
    maximumOvers > 0 && derived.legalBalls >= maximumOvers * 6;
  const overJustEnded = derived.legalBalls > 0 && derived.legalBalls % 6 === 0;
  const scoringDisabled = disabled || overLimitReached;
  const dismissedPlayerIds = new Set(
    derived.battingPerformances
      .filter((performance) => performance.wasOut)
      .map((performance) => performance.playerId)
  );
  const strikerOptions = battingPlayers.filter(
    (player) =>
      !dismissedPlayerIds.has(player.id) && player.id !== selection.nonStrikerId
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
  ].filter((option) => option.id);
  const nextBatterOptions = battingPlayers.filter(
    (player) =>
      !dismissedPlayerIds.has(player.id) &&
      player.id !== wicketDraft.dismissedPlayerId
  );

  return (
    <section className="quick-scoring-panel rounded-lg border border-neon-cyan/35 bg-black/30 p-4">
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

      <div className="quick-player-selectors">
        <label>
          Striker
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
            <option value="">Select striker</option>
            {strikerOptions.map((player) => (
              <option key={`quick-striker-${player.id}`} value={player.id}>
                {player.name}
              </option>
            ))}
          </select>
        </label>
        <label>
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
        </label>
        <label>
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
              onChange={(event) =>
                onWicketDraftChange({
                  ...wicketDraft,
                  type: event.target.value as QuickScoringDismissalType,
                  fielderId: "",
                  dismissedPlayerId:
                    event.target.value === "run_out"
                      ? wicketDraft.dismissedPlayerId || selection.strikerId
                      : selection.strikerId
                })
              }
            >
              <option value="bowled">Bowled</option>
              <option value="caught">Caught</option>
              <option value="run_out">Run Out</option>
              <option value="other_bowler_wicket">Other</option>
            </select>
          </label>

          {wicketDraft.type === "run_out" ? (
            <div className="quick-run-out-guide">
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

              <p>Step 2 - runs completed before the wicket</p>
              <div>
                {[0, 1, 2, 3].map((runs) => (
                  <button
                    key={`quick-runout-runs-${runs}`}
                    type="button"
                    className={
                      wicketDraft.completedRuns === runs ? "is-selected" : ""
                    }
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
            </div>
          ) : null}

          {wicketDraft.type === "caught" || wicketDraft.type === "run_out" ? (
            <label>
              {wicketDraft.type === "caught" ? "Catcher" : "Primary fielder"}
              <select
                value={wicketDraft.fielderId}
                onChange={(event) =>
                  onWicketDraftChange({
                    ...wicketDraft,
                    fielderId: event.target.value
                  })
                }
              >
                <option value="">Select fielder</option>
                {bowlingPlayers.map((player) => (
                  <option key={`quick-fielder-${player.id}`} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            New batter
            <select
              value={wicketDraft.newBatterId}
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
          </label>
          {wicketDraft.type === "run_out" ? (
            <div className="quick-next-pair">
              <p>Step 5 - next ball batters</p>
              <label>
                Striker
                <select
                  value={wicketDraft.nextStrikerId}
                  onChange={(event) =>
                    onWicketDraftChange({
                      ...wicketDraft,
                      nextStrikerId: event.target.value,
                      nextNonStrikerId:
                        event.target.value === wicketDraft.nextNonStrikerId
                          ? ""
                          : wicketDraft.nextNonStrikerId
                    })
                  }
                >
                  <option value="">Select striker</option>
                  {nextBatterOptions
                    .filter((player) => player.id !== wicketDraft.nextNonStrikerId)
                    .map((player) => (
                    <option key={`quick-next-striker-${player.id}`} value={player.id}>
                      {player.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Non-striker
                <select
                  value={wicketDraft.nextNonStrikerId}
                  onChange={(event) =>
                    onWicketDraftChange({
                      ...wicketDraft,
                      nextNonStrikerId: event.target.value,
                      nextStrikerId:
                        event.target.value === wicketDraft.nextStrikerId
                          ? ""
                          : wicketDraft.nextStrikerId
                    })
                  }
                >
                  <option value="">Select non-striker</option>
                  {nextBatterOptions
                    .filter((player) => player.id !== wicketDraft.nextStrikerId)
                    .map((player) => (
                    <option key={`quick-next-nonstriker-${player.id}`} value={player.id}>
                      {player.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
          <div className="quick-wicket-actions">
            <button type="button" onClick={onSubmitWicket}>
              Record wicket
            </button>
            <button
              type="button"
              onClick={() => onWicketDraftChange({ ...wicketDraft, open: false })}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="quick-correction-row">
        <button type="button" disabled={disabled} onClick={onSwapStrikers}>
          Swap Strikers
        </button>
        <button
          type="button"
          disabled={disabled}
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
      ? bowlingPlayers.filter((player) => player.id !== over.bowlerId)
      : bowlingPlayers;
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
