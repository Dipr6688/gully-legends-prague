import {
  assemblePendingImportMatch,
  type AppSyncAssemblyResult
} from "@/lib/app-sync/assemble-pending-import";
import type { ApkMatchImport, AppSyncMatchPayload } from "@/lib/app-sync/types";
import type {
  QuickScoringDismissalType,
  QuickScoringEvent
} from "@/lib/types/match";

export type ApkReviewEventRow = {
  inningsKey: "inningsAEvents" | "inningsBEvents";
  event: QuickScoringEvent;
  eventIndex: number;
  overNumber: number;
  legalBallInOver: number | null;
  label: string;
};

export function getApkReviewPayload(importRecord: ApkMatchImport): AppSyncMatchPayload {
  return importRecord.reviewPayload ?? importRecord.rawPayload;
}

export function getApkReviewDerivedMatch(importRecord: ApkMatchImport) {
  return importRecord.reviewDerivedMatch ?? importRecord.derivedMatch;
}

export function getApkReviewValidationResult(importRecord: ApkMatchImport) {
  return importRecord.reviewValidationResult ?? importRecord.validationResult;
}

export function isApkReviewWorkingCopyStale(importRecord: ApkMatchImport): boolean {
  return Boolean(
    importRecord.reviewPayload &&
      importRecord.reviewSourceSyncVersion !== null &&
      importRecord.reviewSourceSyncVersion !== undefined &&
      importRecord.syncVersion > importRecord.reviewSourceSyncVersion
  ) || importRecord.reviewIsStale === true;
}

export function assembleApkReviewWorkingCopy({
  importRecord,
  payload = getApkReviewPayload(importRecord),
  matchDate = importRecord.matchDate,
  playerOfMatchId = null,
  matchId
}: {
  importRecord: ApkMatchImport;
  payload?: AppSyncMatchPayload;
  matchDate?: string | null;
  playerOfMatchId?: string | null;
  matchId?: string;
}): AppSyncAssemblyResult {
  return assemblePendingImportMatch({
    payload,
    matchId,
    matchDate: matchDate ?? undefined,
    matchNumber: null,
    playerOfMatchId
  });
}

export function groupApkReviewEventsByOver(
  inningsKey: "inningsAEvents" | "inningsBEvents",
  events: QuickScoringEvent[]
): ApkReviewEventRow[] {
  let legalBalls = 0;

  return [...events]
    .map((event, eventIndex) => ({ event, eventIndex }))
    .sort((left, right) => left.event.sequence - right.event.sequence)
    .map(({ event, eventIndex }) => {
      const overNumber = Math.floor(legalBalls / 6) + 1;
      const legalBallInOver = event.legalDelivery ? (legalBalls % 6) + 1 : null;

      if (event.legalDelivery) {
        legalBalls += 1;
      }

      return {
        inningsKey,
        event,
        eventIndex,
        overNumber,
        legalBallInOver,
        label: formatApkReviewEventLabel(event)
      };
    });
}

export function formatApkReviewEventLabel(event: QuickScoringEvent): string {
  if (event.wicket) return "W";
  if (event.extraType === "wide") return "WD";
  if (event.extraType === "no_ball") {
    return event.batterRuns > 0 ? `NB+${event.batterRuns}` : "NB";
  }
  return String(event.batterRuns);
}

export function updateApkReviewEvent(
  payload: AppSyncMatchPayload,
  inningsKey: "inningsAEvents" | "inningsBEvents",
  eventId: string,
  nextEvent: QuickScoringEvent
): AppSyncMatchPayload {
  return {
    ...payload,
    [inningsKey]: payload[inningsKey].map((event) =>
      event.id === eventId ? nextEvent : event
    )
  };
}

export function deleteApkReviewEvent(
  payload: AppSyncMatchPayload,
  inningsKey: "inningsAEvents" | "inningsBEvents",
  eventId: string
): AppSyncMatchPayload {
  return {
    ...payload,
    [inningsKey]: resequenceQuickEvents(
      payload[inningsKey].filter((event) => event.id !== eventId)
    )
  };
}

export function insertApkReviewEventAfter(
  payload: AppSyncMatchPayload,
  inningsKey: "inningsAEvents" | "inningsBEvents",
  eventId: string
): AppSyncMatchPayload {
  const events = payload[inningsKey];
  const index = events.findIndex((event) => event.id === eventId);
  const anchor = index >= 0 ? events[index] : events[events.length - 1];
  const inserted: QuickScoringEvent = anchor
    ? {
        ...anchor,
        id: `review-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        sequence: anchor.sequence + 0.5,
        batterRuns: 0,
        extraType: null,
        extras: 0,
        legalDelivery: true,
        wicket: null,
        timestamp: new Date().toISOString()
      }
    : {
        id: `review-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        sequence: 1,
        battingTeamId: inningsKey === "inningsAEvents" ? "teamA" : "teamB",
        bowlingTeamId: inningsKey === "inningsAEvents" ? "teamB" : "teamA",
        strikerId: "",
        nonStrikerId: "",
        bowlerId: "",
        batterRuns: 0,
        extraType: null,
        extras: 0,
        legalDelivery: true,
        wicket: null,
        timestamp: new Date().toISOString()
      };
  const nextEvents =
    index >= 0
      ? [...events.slice(0, index + 1), inserted, ...events.slice(index + 1)]
      : [...events, inserted];

  return {
    ...payload,
    [inningsKey]: resequenceQuickEvents(nextEvents)
  };
}

export function updateApkReviewOverBowler(
  payload: AppSyncMatchPayload,
  inningsKey: "inningsAEvents" | "inningsBEvents",
  overNumber: number,
  bowlerId: string
): AppSyncMatchPayload {
  const rows = groupApkReviewEventsByOver(inningsKey, payload[inningsKey]);
  const idsInOver = new Set(
    rows.filter((row) => row.overNumber === overNumber).map((row) => row.event.id)
  );

  return {
    ...payload,
    [inningsKey]: payload[inningsKey].map((event) =>
      idsInOver.has(event.id) ? { ...event, bowlerId } : event
    )
  };
}

export function applyApkReviewEventForm(
  event: QuickScoringEvent,
  form: FormData
): QuickScoringEvent {
  const eventType = String(form.get("eventType") ?? "runs");
  const batterRuns = sanitizeEventRuns(form.get("batterRuns"));
  const noBallRuns = sanitizeEventRuns(form.get("noBallRuns"));
  const wicketType = String(form.get("wicketType") ?? "") as QuickScoringDismissalType;
  const dismissedPlayerId = String(form.get("dismissedPlayerId") ?? event.strikerId);
  const fielderId = String(form.get("fielderId") ?? "").trim() || null;
  const newBatterId = String(form.get("newBatterId") ?? "").trim() || null;

  if (eventType === "wide") {
    return {
      ...event,
      batterRuns: 0,
      extraType: "wide",
      extras: 1,
      legalDelivery: false,
      wicket: null
    };
  }

  if (eventType === "no_ball") {
    return {
      ...event,
      batterRuns: noBallRuns,
      extraType: "no_ball",
      extras: 1,
      legalDelivery: false,
      wicket: null
    };
  }

  if (eventType === "wicket") {
    const type: QuickScoringDismissalType =
      wicketType === "caught" ||
      wicketType === "stumped" ||
      wicketType === "run_out" ||
      wicketType === "other_bowler_wicket"
        ? wicketType
        : "bowled";

    return {
      ...event,
      batterRuns: 0,
      extraType: null,
      extras: 0,
      legalDelivery: true,
      wicket: {
        type,
        dismissedPlayerId,
        fielderId:
          type === "caught" || type === "stumped" || type === "run_out"
            ? fielderId
            : null,
        assistingFielderId: null,
        newBatterId,
        completedRuns: 0,
        nextStrikerId: event.wicket?.nextStrikerId ?? null,
        nextNonStrikerId: event.wicket?.nextNonStrikerId ?? null
      }
    };
  }

  return {
    ...event,
    batterRuns,
    extraType: null,
    extras: 0,
    legalDelivery: true,
    wicket: null
  };
}

function resequenceQuickEvents(events: QuickScoringEvent[]): QuickScoringEvent[] {
  return [...events]
    .sort((left, right) => left.sequence - right.sequence)
    .map((event, index) => ({ ...event, sequence: index + 1 }));
}

function sanitizeEventRuns(value: FormDataEntryValue | null): number {
  const parsed = Number.parseInt(String(value ?? "0"), 10);

  if (!Number.isFinite(parsed)) return 0;

  return Math.max(0, Math.min(6, parsed));
}
