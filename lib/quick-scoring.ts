import {
  getChasingTeamId,
  getPerformanceKey,
  sanitizeRuns
} from "./match-records";
import type {
  BowlingOver,
  DismissalEvent,
  PlayerMatchPerformance,
  QuickScoringEvent,
  QuickScoringInningsKey,
  QuickScoringMetadata,
  TeamId
} from "./types/match";

export type QuickScoringInningsInput = {
  battingTeamId: TeamId;
  bowlingTeamId: TeamId;
  battingPlayerIds: string[];
  bowlingPlayerIds?: string[];
  events: QuickScoringEvent[];
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
  currentOverEvents: QuickScoringEvent[];
  lastCompletedOverEvents: QuickScoringEvent[];
  previousOverBowlerId: string | null;
  missingInformation: string[];
};

type MutablePerformance = PlayerMatchPerformance & {
  battingPosition: number | null;
};

export function createEmptyQuickScoringMetadata(): QuickScoringMetadata {
  return {
    version: 1,
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
  strikerId,
  nonStrikerId,
  overEnded
}: {
  event: QuickScoringEvent;
  strikerId: string | null;
  nonStrikerId: string | null;
  overEnded: boolean;
}) {
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

  let nextStrikerId = strikerId;
  let nextNonStrikerId = nonStrikerId;
  const dismissedPlayerId = event.wicket?.dismissedPlayerId ?? null;
  const newBatterId = event.wicket?.newBatterId ?? null;

  if (dismissedPlayerId && newBatterId) {
    if (dismissedPlayerId === nextStrikerId) {
      nextStrikerId = newBatterId;
    } else if (dismissedPlayerId === nextNonStrikerId) {
      nextNonStrikerId = newBatterId;
    }
  }

  const rotationRuns =
    event.wicket?.type === "run_out" && sanitizeRuns(event.batterRuns) === 0
      ? sanitizeRuns(event.wicket.completedRuns)
      : sanitizeRuns(event.batterRuns);

  if (rotationRuns % 2 === 1) {
    [nextStrikerId, nextNonStrikerId] = [nextNonStrikerId, nextStrikerId];
  }

  if (overEnded) {
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
  events
}: QuickScoringInningsInput): QuickScoringDerivedInnings {
  const records = new Map<string, MutablePerformance>();
  const battingOrder: string[] = [];
  const oversByNumber = new Map<number, BowlingOver>();
  const eventsByOverNumber = new Map<number, QuickScoringEvent[]>();
  const missingInformation: string[] = [];
  const dismissedPlayerIds = new Set<string>();
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
    if (!event.strikerId || !event.nonStrikerId || !event.bowlerId) {
      missingInformation.push(`Event ${event.sequence} is missing striker, non-striker or bowler.`);
      continue;
    }

    const overNumber = Math.floor(legalBalls / 6) + 1;

    if (event.strikerId === event.nonStrikerId) {
      missingInformation.push(`Event ${event.sequence} has the same striker and non-striker.`);
      continue;
    }

    if (
      !battingPlayerIds.includes(event.strikerId) ||
      !battingPlayerIds.includes(event.nonStrikerId)
    ) {
      missingInformation.push(`Event ${event.sequence} has an ineligible batter.`);
      continue;
    }

    if (
      dismissedPlayerIds.has(event.strikerId) ||
      dismissedPlayerIds.has(event.nonStrikerId)
    ) {
      missingInformation.push(`Event ${event.sequence} uses a batter who is already out.`);
      continue;
    }

    if (bowlingPlayerIds && !bowlingPlayerIds.includes(event.bowlerId)) {
      missingInformation.push(`Event ${event.sequence} has an ineligible bowler.`);
      continue;
    }

    if (
      legalBalls > 0 &&
      legalBalls % 6 === 0 &&
      previousOverBowlerId === event.bowlerId
    ) {
      missingInformation.push(`Event ${event.sequence} repeats the previous over bowler.`);
      continue;
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

    ensureBatter({
      records,
      battingOrder,
      playerId: event.nonStrikerId,
      teamId: battingTeamId
    });

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

      if (event.wicket.type === "run_out" && !event.wicket.fielderId) {
        missingInformation.push(`Run-out fielder missing for event ${event.sequence}.`);
      }

      if (
        bowlingPlayerIds &&
        event.wicket.fielderId &&
        !bowlingPlayerIds.includes(event.wicket.fielderId)
      ) {
        missingInformation.push(`Event ${event.sequence} has an ineligible fielder.`);
      }

      if (event.wicket.newBatterId) {
        if (
          !battingPlayerIds.includes(event.wicket.newBatterId) ||
          event.wicket.newBatterId === event.wicket.dismissedPlayerId ||
          event.wicket.newBatterId === event.strikerId ||
          event.wicket.newBatterId === event.nonStrikerId ||
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

      if (
        !event.wicket.newBatterId &&
        wicketsLost < battingPlayerIds.length
      ) {
        missingInformation.push(`Missing new batter for event ${event.sequence}.`);
      }

      if (
        event.wicket.type === "run_out" &&
        (!event.wicket.nextStrikerId || !event.wicket.nextNonStrikerId)
      ) {
        missingInformation.push(`Missing next-ball batters for event ${event.sequence}.`);
      }

      if (
        event.wicket.nextStrikerId &&
        event.wicket.nextNonStrikerId &&
        event.wicket.nextStrikerId === event.wicket.nextNonStrikerId
      ) {
        missingInformation.push(`Event ${event.sequence} has the same next striker and non-striker.`);
      }

      if (
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
      strikerId: event.strikerId,
      nonStrikerId: event.nonStrikerId,
      overEnded
    });

    strikerId = nextStrike.strikerId;
    nonStrikerId = nextStrike.nonStrikerId;
    currentBowlerId = overEnded ? null : event.bowlerId;

    if (overEnded) {
      previousOverBowlerId = event.bowlerId;
    }
  }

  const currentOverNumber =
    legalBalls > 0 && legalBalls % 6 === 0
      ? Math.floor(legalBalls / 6) + 1
      : Math.floor(legalBalls / 6) + 1;

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
    currentOverEvents:
      legalBalls > 0 && legalBalls % 6 === 0
        ? []
        : eventsByOverNumber.get(currentOverNumber) ?? [],
    lastCompletedOverEvents:
      legalBalls > 0 && legalBalls % 6 === 0
        ? eventsByOverNumber.get(Math.floor(legalBalls / 6)) ?? []
        : [],
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
