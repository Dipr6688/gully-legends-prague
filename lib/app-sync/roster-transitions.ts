import type { AppSyncMatchPayload } from "@/lib/app-sync/types";
import type {
  MatchRosterTransition,
  QuickScoringEvent,
  TeamId
} from "@/lib/types/match";

export type ResolvedRosterTransition = MatchRosterTransition & {
  effectiveEventIndex: number;
};

export type RosterTransitionResolution = {
  hasTransitions: boolean;
  snapshots: ResolvedRosterTransition[];
  errors: string[];
  participantIds: string[];
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
  fieldingHelperIds: string[];
  everSharedPlayerIds: string[];
  getSnapshot(inningsIndex: 0 | 1, eventIndex: number): ResolvedRosterTransition;
  getTeamPlayerIds(snapshot: ResolvedRosterTransition, teamId: TeamId): string[];
};

function unique(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

function sameSet(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id) => right.includes(id));
}

function eventsForInnings(
  payload: AppSyncMatchPayload,
  inningsIndex: 0 | 1
): QuickScoringEvent[] {
  const firstKey =
    payload.battingFirstTeamId === "teamA" ? "inningsAEvents" : "inningsBEvents";
  const secondKey =
    payload.battingFirstTeamId === "teamA" ? "inningsBEvents" : "inningsAEvents";

  return [...payload[inningsIndex === 0 ? firstKey : secondKey]].sort(
    (left, right) => left.sequence - right.sequence
  );
}

function rawBoundaryPositions(
  events: QuickScoringEvent[],
  deliveryBoundary: number
): number[] {
  if (deliveryBoundary === 0) return [0, 1];

  let legalBalls = 0;
  let startedOvers = 0;

  for (const [index, event] of events.slice(0, deliveryBoundary).entries()) {
    if (index === 0 || (legalBalls > 0 && legalBalls % 6 === 0)) {
      startedOvers += 1;
    }

    if (event.legalDelivery) legalBalls += 1;
  }

  const positions = [deliveryBoundary + startedOvers];

  // The APK can record the next-over bowler marker before that over has a ball.
  if (legalBalls > 0 && legalBalls % 6 === 0) {
    positions.push(deliveryBoundary + startedOvers + 1);
  }

  return positions;
}

function timestampBoundary(
  events: QuickScoringEvent[],
  appliedAt: string | null
): number | null {
  if (!appliedAt) return null;

  const appliedTime = Date.parse(appliedAt);

  if (!Number.isFinite(appliedTime)) return null;

  let count = 0;

  for (const event of events) {
    const eventTime = Date.parse(event.timestamp);

    if (!Number.isFinite(eventTime) || eventTime > appliedTime) break;
    count += 1;
  }

  return count;
}

function resolveEventBoundary(
  transition: MatchRosterTransition,
  events: QuickScoringEvent[]
): number | null {
  const byTimestamp = timestampBoundary(events, transition.appliedAt);

  if (byTimestamp !== null) {
    const compatible = [
      byTimestamp,
      ...rawBoundaryPositions(events, byTimestamp)
    ];

    if (compatible.includes(transition.eventIndex)) return byTimestamp;
  }

  // Delivery-index histories remain supported for corrected review payloads and
  // forward-compatible clients. Current APK payloads normally use the raw index.
  if (transition.eventIndex <= events.length) return transition.eventIndex;

  for (let boundary = 0; boundary <= events.length; boundary += 1) {
    if (rawBoundaryPositions(events, boundary).includes(transition.eventIndex)) {
      return boundary;
    }
  }

  return null;
}

function finalSnapshot(payload: AppSyncMatchPayload): MatchRosterTransition {
  return {
    inningsIndex: 0,
    eventIndex: 0,
    teamAPlayerIds: [...payload.teamAPlayerIds],
    teamBPlayerIds: [...payload.teamBPlayerIds],
    sharedPlayerId: payload.sharedPlayerId ?? null,
    fieldingHelperIds: [...(payload.fieldingHelperIds ?? [])],
    appliedAt: payload.startedAt
  };
}

function teamPlayerIds(
  snapshot: Pick<
    MatchRosterTransition,
    "teamAPlayerIds" | "teamBPlayerIds" | "sharedPlayerId"
  >,
  teamId: TeamId
): string[] {
  return unique([
    ...(teamId === "teamA"
      ? snapshot.teamAPlayerIds
      : snapshot.teamBPlayerIds),
    ...(snapshot.sharedPlayerId ? [snapshot.sharedPlayerId] : [])
  ]);
}

export function isRosterTransitionShape(value: unknown): value is MatchRosterTransition {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const transition = value as Record<string, unknown>;

  return (
    (transition.inningsIndex === 0 || transition.inningsIndex === 1) &&
    typeof transition.eventIndex === "number" &&
    Number.isInteger(transition.eventIndex) &&
    transition.eventIndex >= 0 &&
    Array.isArray(transition.teamAPlayerIds) &&
    transition.teamAPlayerIds.every((id) => typeof id === "string") &&
    Array.isArray(transition.teamBPlayerIds) &&
    transition.teamBPlayerIds.every((id) => typeof id === "string") &&
    (transition.sharedPlayerId === null ||
      typeof transition.sharedPlayerId === "string") &&
    Array.isArray(transition.fieldingHelperIds) &&
    transition.fieldingHelperIds.every((id) => typeof id === "string") &&
    (transition.appliedAt === null || typeof transition.appliedAt === "string")
  );
}

export function resolveRosterTransitions(
  payload: AppSyncMatchPayload,
  knownPlayerIds: Set<string>
): RosterTransitionResolution {
  const hasTransitions = Array.isArray(payload.rosterTransitions);
  const source = hasTransitions ? payload.rosterTransitions ?? [] : [finalSnapshot(payload)];
  const errors: string[] = [];
  const snapshots: ResolvedRosterTransition[] = [];

  if (hasTransitions && source.length === 0) {
    errors.push("Roster history must include the starting teams.");
  }

  for (const [index, transition] of source.entries()) {
    const label = `Roster update ${index + 1}`;
    const allIds = [
      ...transition.teamAPlayerIds,
      ...transition.teamBPlayerIds,
      ...(transition.sharedPlayerId ? [transition.sharedPlayerId] : []),
      ...transition.fieldingHelperIds
    ];
    const unknownId = allIds.find((id) => !knownPlayerIds.has(id));
    const duplicateA = unique(transition.teamAPlayerIds).length !== transition.teamAPlayerIds.length;
    const duplicateB = unique(transition.teamBPlayerIds).length !== transition.teamBPlayerIds.length;
    const duplicateHelpers =
      unique(transition.fieldingHelperIds).length !==
      transition.fieldingHelperIds.length;
    const crossTeamId = transition.teamAPlayerIds.find((id) =>
      transition.teamBPlayerIds.includes(id)
    );

    if (unknownId) errors.push(`${label} contains an unknown player: ${unknownId}.`);
    if (duplicateA || duplicateB) {
      errors.push(`${label} contains a duplicate team assignment.`);
    }
    if (crossTeamId) {
      errors.push(`${label} assigns ${crossTeamId} exclusively to both teams.`);
    }
    if (
      transition.sharedPlayerId &&
      (transition.teamAPlayerIds.includes(transition.sharedPlayerId) ||
        transition.teamBPlayerIds.includes(transition.sharedPlayerId))
    ) {
      errors.push(`${label} also lists the Shared player as team-only.`);
    }
    if (duplicateHelpers) errors.push(`${label} contains a duplicate Fielding Helper.`);
    if (
      transition.fieldingHelperIds.some(
        (id) =>
          id === transition.sharedPlayerId ||
          (!transition.teamAPlayerIds.includes(id) &&
            !transition.teamBPlayerIds.includes(id))
      )
    ) {
      errors.push(`${label} has a Fielding Helper who is not a team-only player.`);
    }
    if (transition.teamAPlayerIds.length !== transition.teamBPlayerIds.length) {
      errors.push(`${label} must keep Team A and Team B equal.`);
    }

    const uniquePlayers = unique([
      ...transition.teamAPlayerIds,
      ...transition.teamBPlayerIds,
      ...(transition.sharedPlayerId ? [transition.sharedPlayerId] : [])
    ]);

    if (uniquePlayers.length === 0) errors.push(`${label} has no match players.`);
    if (uniquePlayers.length % 2 === 0 && transition.sharedPlayerId) {
      errors.push(`${label} cannot use a Shared player with an even roster.`);
    }
    if (uniquePlayers.length % 2 === 1 && !transition.sharedPlayerId) {
      errors.push(`${label} needs one Shared player for its odd roster.`);
    }

    if (transition.appliedAt && !Number.isFinite(Date.parse(transition.appliedAt))) {
      errors.push(`${label} has an invalid applied time.`);
    }

    const events = eventsForInnings(payload, transition.inningsIndex);
    const effectiveEventIndex = resolveEventBoundary(transition, events);

    if (effectiveEventIndex === null) {
      errors.push(`${label} points beyond the recorded innings.`);
      continue;
    }

    snapshots.push({ ...transition, effectiveEventIndex });
  }

  if (hasTransitions && snapshots.length > 0) {
    const first = snapshots[0];

    if (first.inningsIndex !== 0 || first.effectiveEventIndex !== 0) {
      errors.push("Roster history must start before the first recorded event.");
    }

    for (let index = 1; index < snapshots.length; index += 1) {
      const previous = snapshots[index - 1];
      const current = snapshots[index];
      const isBeforePrevious =
        current.inningsIndex < previous.inningsIndex ||
        (current.inningsIndex === previous.inningsIndex &&
          current.effectiveEventIndex < previous.effectiveEventIndex);

      if (isBeforePrevious) {
        errors.push(`Roster update ${index + 1} is earlier than the previous update.`);
      }
    }

    const last = snapshots.at(-1);
    const finalShared = payload.sharedPlayerId ?? null;

    if (
      last &&
      (!sameSet(last.teamAPlayerIds, payload.teamAPlayerIds) ||
        !sameSet(last.teamBPlayerIds, payload.teamBPlayerIds) ||
        last.sharedPlayerId !== finalShared ||
        !sameSet(last.fieldingHelperIds, payload.fieldingHelperIds ?? []))
    ) {
      errors.push("The final roster update does not match the uploaded final teams.");
    }
  }

  const safeSnapshots = snapshots.length
    ? snapshots
    : [{ ...finalSnapshot(payload), effectiveEventIndex: 0 }];
  const participantIds = unique(
    safeSnapshots.flatMap((snapshot) => [
      ...snapshot.teamAPlayerIds,
      ...snapshot.teamBPlayerIds,
      ...(snapshot.sharedPlayerId ? [snapshot.sharedPlayerId] : [])
    ])
  );
  const teamAPlayerIds = unique(
    safeSnapshots.flatMap((snapshot) => teamPlayerIds(snapshot, "teamA"))
  );
  const teamBPlayerIds = unique(
    safeSnapshots.flatMap((snapshot) => teamPlayerIds(snapshot, "teamB"))
  );
  const fieldingHelperIds = unique(
    safeSnapshots.flatMap((snapshot) => snapshot.fieldingHelperIds)
  );
  const everSharedPlayerIds = unique(
    safeSnapshots
      .map((snapshot) => snapshot.sharedPlayerId)
      .filter((id): id is string => Boolean(id))
  );

  function getSnapshot(
    inningsIndex: 0 | 1,
    eventIndex: number
  ): ResolvedRosterTransition {
    let current = safeSnapshots[0];

    for (const snapshot of safeSnapshots) {
      if (
        snapshot.inningsIndex < inningsIndex ||
        (snapshot.inningsIndex === inningsIndex &&
          snapshot.effectiveEventIndex <= eventIndex)
      ) {
        current = snapshot;
      }
    }

    return current;
  }

  return {
    hasTransitions,
    snapshots: safeSnapshots,
    errors,
    participantIds,
    teamAPlayerIds,
    teamBPlayerIds,
    fieldingHelperIds,
    everSharedPlayerIds,
    getSnapshot,
    getTeamPlayerIds: teamPlayerIds
  };
}

export function inningsIndexForTeam(
  payload: Pick<AppSyncMatchPayload, "battingFirstTeamId">,
  teamId: TeamId
): 0 | 1 {
  return payload.battingFirstTeamId === teamId ? 0 : 1;
}

export function normalizeReviewRosterBoundaries(
  payload: AppSyncMatchPayload,
  knownPlayerIds: Set<string>
): AppSyncMatchPayload {
  if (!payload.rosterTransitions) return payload;

  const resolution = resolveRosterTransitions(payload, knownPlayerIds);

  if (resolution.errors.length > 0) return payload;

  return {
    ...payload,
    rosterTransitions: resolution.snapshots.map(
      ({ effectiveEventIndex, ...snapshot }) => ({
        ...snapshot,
        eventIndex: effectiveEventIndex,
        appliedAt: null
      })
    )
  };
}
