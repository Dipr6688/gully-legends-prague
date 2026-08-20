import {
  getChasingTeamId,
  getPerformanceKey,
  sanitizeRuns
} from "./match-records";
import type {
  BattingMode,
  BowlingOver,
  DismissalEvent,
  PlayerMatchPerformance,
  QuickScoringEvent,
  QuickScoringInningsKey,
  QuickScoringMetadata,
  TeamId
} from "./types/match";

export const DEFAULT_BATTING_MODE: BattingMode = "two_batter";

export function normalizeBattingMode(value: unknown): BattingMode {
  return value === "single_batter" ? "single_batter" : DEFAULT_BATTING_MODE;
}

export type QuickScoringInningsInput = {
  battingTeamId: TeamId;
  bowlingTeamId: TeamId;
  battingPlayerIds: string[];
  bowlingPlayerIds?: string[];
  fieldingPlayerIds?: string[];
  events: QuickScoringEvent[];
  battingMode?: BattingMode | null;
};

export type QuickScoringDerivedInnings = {
  battingTeamId: TeamId;
  bowlingTeamId: TeamId;
  runs: number;
  wicketsLost: number;
  legalBalls: number;
  completedOvers: number;
  extras: number;
  battingPerformances: PlayerMatchPerformance[];
  bowlingOvers: BowlingOver[];
  currentStrikerId: string | null;
  currentNonStrikerId: string | null;
  currentBowlerId: string | null;
  battingOrder: string[];
  battingMode: BattingMode;
  isLastBatterSolo: boolean;
  activeBatterCount: number;
  currentOverEvents: QuickScoringEvent[];
  lastCompletedOverEvents: QuickScoringEvent[];
  isBetweenOvers: boolean;
  previousOverBowlerId: string | null;
  missingInformation: string[];
};

type MutablePerformance = PlayerMatchPerformance & {
  battingPosition: number | null;
};

export function createEmptyQuickScoringMetadata(): QuickScoringMetadata {
  return {
    version: 2,
    setupLocked: false,
    battingMode: null,
    inningsPhase: "first_innings",
    inningsAEvents: [],
    inningsBEvents: []
  };
}

export function getQuickScoringInningsKey(
  battingTeamId: TeamId
): QuickScoringInningsKey {
  return battingTeamId === "teamA" ? "inningsAEvents" : "inningsBEvents";
}

export function getQuickScoringEventsForTeam(
  quickScoring: QuickScoringMetadata | undefined,
  battingTeamId: TeamId
): QuickScoringEvent[] {
  return quickScoring?.[getQuickScoringInningsKey(battingTeamId)] ?? [];
}

export function nextQuickScoringSequence(events: QuickScoringEvent[]): number {
  return events.reduce((maximum, event) => Math.max(maximum, event.sequence), 0) + 1;
}

export function createQuickScoringEvent({
  battingTeamId,
  strikerId,
  nonStrikerId,
  bowlerId,
  batterRuns,
  extraType = null,
  extras,
  wicket = null,
  sequence,
  timestamp = new Date().toISOString()
}: Omit<
  QuickScoringEvent,
  "id" | "bowlingTeamId" | "legalDelivery" | "timestamp" | "extras"
> & {
  extras?: number;
  timestamp?: string;
}): QuickScoringEvent {
  const safeBatterRuns = sanitizeRuns(batterRuns);
  const safeExtras = extras ?? (extraType ? 1 : 0);

  return {
    id: `quick-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    sequence,
    battingTeamId,
    bowlingTeamId: getChasingTeamId(battingTeamId),
    strikerId,
    nonStrikerId,
    bowlerId,
    batterRuns: safeBatterRuns,
    extraType,
    extras: sanitizeRuns(safeExtras),
    legalDelivery: extraType === null,
    wicket,
    timestamp
  };
}

function createPerformance(
  playerId: string,
  teamId: TeamId
): MutablePerformance {
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

function ensureBatter({
  records,
  battingOrder,
  playerId,
  teamId
}: {
  records: Map<string, MutablePerformance>;
  battingOrder: string[];
  playerId: string;
  teamId: TeamId;
}): MutablePerformance {
  const key = getPerformanceKey(playerId, teamId);
  const existing = records.get(key) ?? createPerformance(playerId, teamId);

  if (!existing.didBat) {
    existing.didBat = true;
    existing.runs = 0;
  }

  if (!existing.battingPosition) {
    battingOrder.push(playerId);
    existing.battingPosition = battingOrder.length;
  }

  records.set(key, existing);

  return existing;
}

function eventTotalRuns(event: QuickScoringEvent): number {
  return sanitizeRuns(event.batterRuns) + sanitizeRuns(event.extras);
}

function mapDismissal(event: QuickScoringEvent, overId: string): DismissalEvent | null {
  if (!event.wicket) return null;

  return {
    id: `${event.id}-dismissal`,
    overId,
    battingTeamId: event.battingTeamId,
    bowlingTeamId: event.bowlingTeamId,
    dismissedBatterId: event.wicket.dismissedPlayerId,
    type: event.wicket.type,
    creditedBowlerId:
      event.wicket.type === "run_out" ? null : event.bowlerId || null,
    fielderId: event.wicket.fielderId
  };
}

function updateStrikeAfterEvent({
  event,
  battingMode,
  overEnded,
  pairRequired
}: {
  event: QuickScoringEvent;
  battingMode: BattingMode;
  overEnded: boolean;
  pairRequired: boolean;
}) {
  if (battingMode === "single_batter" || !pairRequired) {
    return {
      strikerId: event.wicket?.dismissedPlayerId === event.strikerId
        ? event.wicket.newBatterId ?? null
        : event.strikerId,
      nonStrikerId: null
    };
  }

  if (
    event.wicket?.nextStrikerId &&
    event.wicket.nextNonStrikerId &&
    event.wicket.nextStrikerId !== event.wicket.nextNonStrikerId
  ) {
    return {
      strikerId: event.wicket.nextStrikerId,
      nonStrikerId: event.wicket.nextNonStrikerId
    };
  }

  let nextStrikerId: string | null = event.strikerId;
  let nextNonStrikerId: string | null = event.nonStrikerId || null;
  const dismissedPlayerId = event.wicket?.dismissedPlayerId ?? null;
  const newBatterId = event.wicket?.newBatterId ?? null;
  const rotationRuns =
    event.wicket?.type === "run_out"
      ? sanitizeRuns(event.wicket.completedRuns)
      : sanitizeRuns(event.batterRuns);

  if (rotationRuns % 2 === 1) {
    [nextStrikerId, nextNonStrikerId] = [nextNonStrikerId, nextStrikerId];
  }

  if (dismissedPlayerId && newBatterId) {
    if (dismissedPlayerId === nextStrikerId) {
      nextStrikerId = newBatterId;
    } else if (dismissedPlayerId === nextNonStrikerId) {
      nextNonStrikerId = newBatterId;
    }
  } else if (dismissedPlayerId) {
    if (dismissedPlayerId === nextStrikerId) {
      nextStrikerId = nextNonStrikerId;
      nextNonStrikerId = null;
    } else if (dismissedPlayerId === nextNonStrikerId) {
      nextNonStrikerId = null;
    }
  }

  if (overEnded && nextNonStrikerId) {
    [nextStrikerId, nextNonStrikerId] = [nextNonStrikerId, nextStrikerId];
  }

  return {
    strikerId: nextStrikerId,
    nonStrikerId: nextNonStrikerId
  };
}

export function deriveQuickScoringInnings({
  battingTeamId,
  bowlingTeamId,
  battingPlayerIds,
  bowlingPlayerIds,
  fieldingPlayerIds,
  events,
  battingMode: inputBattingMode
}: QuickScoringInningsInput): QuickScoringDerivedInnings {
  const battingMode = normalizeBattingMode(inputBattingMode);
  const records = new Map<string, MutablePerformance>();
  const battingOrder: string[] = [];
  const oversByNumber = new Map<number, BowlingOver>();
  const eventsByOverNumber = new Map<number, QuickScoringEvent[]>();
  const missingInformation: string[] = [];
  const eligibleFieldingPlayerIds = fieldingPlayerIds ?? bowlingPlayerIds ?? [];
  const dismissedPlayerIds = new Set<string>();
  const reportedRepeatedBowlerOverNumbers = new Set<number>();
  let runs = 0;
  let extras = 0;
  let wicketsLost = 0;
  let legalBalls = 0;
  let strikerId: string | null = null;
  let nonStrikerId: string | null = null;
  let currentBowlerId: string | null = null;
  let previousOverBowlerId: string | null = null;

  for (const playerId of battingPlayerIds) {
    records.set(getPerformanceKey(playerId, battingTeamId), createPerformance(playerId, battingTeamId));
  }

  for (const event of [...events].sort((left, right) => left.sequence - right.sequence)) {
    const knownBatterIdsBeforeEvent = new Set(
      battingOrder.length === 0 ? battingPlayerIds : battingOrder
    );
    if (event.strikerId) knownBatterIdsBeforeEvent.add(event.strikerId);
    if (event.nonStrikerId) knownBatterIdsBeforeEvent.add(event.nonStrikerId);

    const eligibleBatterIdsBeforeEvent = battingPlayerIds.filter((playerId) =>
      knownBatterIdsBeforeEvent.has(playerId)
    );
    const undismissedBeforeEvent = eligibleBatterIdsBeforeEvent.filter(
      (playerId) => !dismissedPlayerIds.has(playerId)
    );
    const pairRequired =
      battingMode === "two_batter" && undismissedBeforeEvent.length >= 2;

    if (!event.strikerId || (pairRequired && !event.nonStrikerId) || !event.bowlerId) {
      missingInformation.push(
        pairRequired
          ? `Event ${event.sequence} is missing striker, non-striker or bowler.`
          : `Event ${event.sequence} is missing batter or bowler.`
      );
      continue;
    }

    const overNumber = Math.floor(legalBalls / 6) + 1;

    if (pairRequired && event.strikerId === event.nonStrikerId) {
      missingInformation.push(`Event ${event.sequence} has the same striker and non-striker.`);
      continue;
    }

    if (
      !battingPlayerIds.includes(event.strikerId) ||
      (pairRequired && !battingPlayerIds.includes(event.nonStrikerId))
    ) {
      missingInformation.push(`Event ${event.sequence} has an ineligible batter.`);
      continue;
    }

    if (
      dismissedPlayerIds.has(event.strikerId) ||
      (pairRequired && dismissedPlayerIds.has(event.nonStrikerId))
    ) {
      missingInformation.push(`Event ${event.sequence} uses a batter who is already out.`);
      continue;
    }

    if (bowlingPlayerIds && !bowlingPlayerIds.includes(event.bowlerId)) {
      missingInformation.push(`Event ${event.sequence} has an ineligible bowler.`);
      continue;
    }

    if (event.wicket) {
      const activeBatterIds = [
        event.strikerId,
        pairRequired ? event.nonStrikerId : ""
      ].filter(Boolean);

      if (!event.wicket.dismissedPlayerId) {
        missingInformation.push(`Missing dismissed batter for event ${event.sequence}.`);
        continue;
      }

      if (!battingPlayerIds.includes(event.wicket.dismissedPlayerId)) {
        missingInformation.push(`Event ${event.sequence} has an ineligible dismissed batter.`);
        continue;
      }

      if (dismissedPlayerIds.has(event.wicket.dismissedPlayerId)) {
        missingInformation.push(`Event ${event.sequence} dismisses a batter who is already out.`);
        continue;
      }

      if (!activeBatterIds.includes(event.wicket.dismissedPlayerId)) {
        missingInformation.push(`Event ${event.sequence} dismisses a batter who is not active.`);
        continue;
      }
    }

    if (
      legalBalls > 0 &&
      legalBalls % 6 === 0 &&
      previousOverBowlerId === event.bowlerId
    ) {
      if (!reportedRepeatedBowlerOverNumbers.has(overNumber)) {
        missingInformation.push(
          `Over ${overNumber} uses the same bowler as Over ${overNumber - 1}.`
        );
        reportedRepeatedBowlerOverNumbers.add(overNumber);
      }
    }

    const overId = `${event.bowlingTeamId}-quick-over-${overNumber}`;
    const over =
      oversByNumber.get(overNumber) ?? {
        id: overId,
        bowlingTeamId: event.bowlingTeamId,
        battingTeamId: event.battingTeamId,
        bowlerId: event.bowlerId,
        overNumber,
        legalBalls: 0,
        runsConceded: 0,
        wicketsTaken: 0,
        dismissals: [],
        maiden: true
      };
    const striker = ensureBatter({
      records,
      battingOrder,
      playerId: event.strikerId,
      teamId: battingTeamId
    });

    eventsByOverNumber.set(overNumber, [
      ...(eventsByOverNumber.get(overNumber) ?? []),
      event
    ]);

    if (pairRequired) {
      ensureBatter({
        records,
        battingOrder,
        playerId: event.nonStrikerId,
        teamId: battingTeamId
      });
    }

    striker.runs = sanitizeRuns(striker.runs) + sanitizeRuns(event.batterRuns);
    runs += eventTotalRuns(event);
    extras += sanitizeRuns(event.extras);
    over.runsConceded = sanitizeRuns(over.runsConceded) + eventTotalRuns(event);

    if (event.legalDelivery) {
      legalBalls += 1;
      over.legalBalls = sanitizeRuns(over.legalBalls) + 1;
    }

    const dismissal = mapDismissal(event, over.id);

    if (event.wicket) {
      if (!event.wicket.dismissedPlayerId) {
        missingInformation.push(`Missing dismissed batter for event ${event.sequence}.`);
      } else {
        const dismissed = ensureBatter({
          records,
          battingOrder,
          playerId: event.wicket.dismissedPlayerId,
          teamId: battingTeamId
        });
        dismissed.wasOut = true;
        wicketsLost += 1;
      }

      if (event.wicket.type === "caught" && !event.wicket.fielderId) {
        missingInformation.push(`Missing catcher for event ${event.sequence}.`);
      }

      if (event.wicket.type === "stumped" && !event.wicket.fielderId) {
        missingInformation.push(`Missing stumper for event ${event.sequence}.`);
      }

      if (event.wicket.type === "run_out" && !event.wicket.fielderId) {
        missingInformation.push(`Run-out fielder missing for event ${event.sequence}.`);
      }

      if (
        (fieldingPlayerIds || bowlingPlayerIds) &&
        event.wicket.fielderId &&
        !eligibleFieldingPlayerIds.includes(event.wicket.fielderId)
      ) {
        missingInformation.push(`Event ${event.sequence} has an ineligible fielder.`);
      }

      if (
        event.wicket.type === "stumped" &&
        event.wicket.fielderId === event.bowlerId
      ) {
        missingInformation.push(`Event ${event.sequence} uses the bowler as the stumper.`);
      }

      if (event.wicket.newBatterId) {
        if (
          !battingPlayerIds.includes(event.wicket.newBatterId) ||
          event.wicket.newBatterId === event.wicket.dismissedPlayerId ||
          event.wicket.newBatterId === event.strikerId ||
          (pairRequired && event.wicket.newBatterId === event.nonStrikerId) ||
          dismissedPlayerIds.has(event.wicket.newBatterId)
        ) {
          missingInformation.push(`Event ${event.sequence} has an ineligible new batter.`);
        }

        ensureBatter({
          records,
          battingOrder,
          playerId: event.wicket.newBatterId,
          teamId: battingTeamId
        });
      }

      const hasEligibleReplacementBatter = eligibleBatterIdsBeforeEvent.some(
        (playerId) =>
          playerId !== event.strikerId &&
          (!pairRequired || playerId !== event.nonStrikerId) &&
          playerId !== event.wicket?.dismissedPlayerId &&
          !dismissedPlayerIds.has(playerId)
      );

      if (!event.wicket.newBatterId && hasEligibleReplacementBatter) {
        missingInformation.push(`Missing new batter for event ${event.sequence}.`);
      }

      if (
        pairRequired &&
        event.wicket.nextStrikerId &&
        event.wicket.nextNonStrikerId &&
        event.wicket.nextStrikerId === event.wicket.nextNonStrikerId
      ) {
        missingInformation.push(`Event ${event.sequence} has the same next striker and non-striker.`);
      }

      if (
        pairRequired &&
        event.wicket.nextStrikerId &&
        event.wicket.nextNonStrikerId &&
        (!battingPlayerIds.includes(event.wicket.nextStrikerId) ||
          !battingPlayerIds.includes(event.wicket.nextNonStrikerId) ||
          event.wicket.nextStrikerId === event.wicket.dismissedPlayerId ||
          event.wicket.nextNonStrikerId === event.wicket.dismissedPlayerId ||
          dismissedPlayerIds.has(event.wicket.nextStrikerId) ||
          dismissedPlayerIds.has(event.wicket.nextNonStrikerId))
      ) {
        missingInformation.push(`Event ${event.sequence} has an ineligible next-ball batter.`);
      }

      dismissedPlayerIds.add(event.wicket.dismissedPlayerId);
    }

    if (dismissal) {
      over.dismissals = [...over.dismissals, dismissal];
      over.wicketsTaken = over.dismissals.length;
    }

    over.maiden = sanitizeRuns(over.runsConceded) === 0;
    oversByNumber.set(overNumber, over);

    const overEnded = event.legalDelivery && legalBalls % 6 === 0;
    const nextStrike = updateStrikeAfterEvent({
      event,
      battingMode,
      overEnded,
      pairRequired
    });

    strikerId = nextStrike.strikerId;
    nonStrikerId = nextStrike.nonStrikerId;
    currentBowlerId = overEnded ? null : event.bowlerId;

    if (overEnded) {
      previousOverBowlerId = event.bowlerId;
    }
  }

  const currentOverNumber = Math.floor(legalBalls / 6) + 1;
  const currentOverEvents = eventsByOverNumber.get(currentOverNumber) ?? [];
  const isBetweenOvers =
    legalBalls > 0 &&
    legalBalls % 6 === 0 &&
    currentOverEvents.length === 0;

  return {
    battingTeamId,
    bowlingTeamId,
    runs,
    wicketsLost,
    legalBalls,
    completedOvers: legalBalls / 6,
    extras,
    battingPerformances: [...records.values()],
    bowlingOvers: [...oversByNumber.values()],
    currentStrikerId: strikerId,
    currentNonStrikerId: nonStrikerId,
    currentBowlerId,
    battingOrder,
    battingMode,
    isLastBatterSolo:
      battingMode === "two_batter" &&
      Boolean(strikerId) &&
      !nonStrikerId &&
      battingPlayerIds.filter((playerId) => !dismissedPlayerIds.has(playerId))
        .length === 1,
    activeBatterCount: [strikerId, nonStrikerId].filter(Boolean).length,
    currentOverEvents: isBetweenOvers ? [] : currentOverEvents,
    lastCompletedOverEvents:
      legalBalls > 0 && legalBalls % 6 === 0
        ? eventsByOverNumber.get(Math.floor(legalBalls / 6)) ?? []
        : [],
    isBetweenOvers,
    previousOverBowlerId,
    missingInformation
  };
}

export function undoLastQuickScoringEvent(
  quickScoring: QuickScoringMetadata,
  battingTeamId: TeamId
): QuickScoringMetadata {
  const key = getQuickScoringInningsKey(battingTeamId);

  return {
    ...quickScoring,
    [key]: quickScoring[key].slice(0, -1)
  };
}

export function replaceQuickScoringEvent(
  quickScoring: QuickScoringMetadata,
  battingTeamId: TeamId,
  event: QuickScoringEvent
): QuickScoringMetadata {
  const key = getQuickScoringInningsKey(battingTeamId);

  return {
    ...quickScoring,
    [key]: quickScoring[key].map((candidate) =>
      candidate.id === event.id ? event : candidate
    )
  };
}
