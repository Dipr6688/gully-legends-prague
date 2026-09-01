import assert from "node:assert/strict";
import test from "node:test";
import {
  assemblePendingImportMatch,
  isAppSyncMatchPayload
} from "../lib/app-sync/assemble-pending-import";
import {
  deleteApkReviewEvent,
  insertApkReviewEventAfter,
  updateApkReviewEvent
} from "../lib/app-sync/review-working-copy";
import { resolveRosterTransitions } from "../lib/app-sync/roster-transitions";
import type { AppSyncMatchPayload } from "../lib/app-sync/types";
import { activePlayers } from "../lib/data/players";
import { deriveQuickScoringInnings } from "../lib/quick-scoring";
import { buildFinalisationPlan } from "../lib/supabase/match-finalisation-plan";
import type { SupabaseCareerStatsRow } from "../lib/supabase/read-repositories";
import type {
  FinalisedPlayerMatchRecord,
  MatchRosterTransition,
  QuickScoringEvent,
  TeamId
} from "../lib/types/match";

const baseTime = Date.parse("2026-09-02T10:00:00.000Z");
const knownPlayerIds = new Set(activePlayers.map((player) => player.id));
const teamA = ["aninda", "arunabha", "dipanjan", "gaurav", "madhab"];
const teamB = ["atripan", "biplab", "soman", "utpal", "jogindar"];

function timestamp(second: number): string {
  return new Date(baseTime + second * 1000).toISOString();
}

function inningsEvents({
  battingTeamId,
  batters,
  bowlers,
  runs = [],
  timeOffset = 0
}: {
  battingTeamId: TeamId;
  batters: [string, string];
  bowlers: [string, string, string];
  runs?: number[];
  timeOffset?: number;
}): QuickScoringEvent[] {
  const bowlingTeamId = battingTeamId === "teamA" ? "teamB" : "teamA";

  return Array.from({ length: 18 }, (_, index) => ({
    id: `${battingTeamId}-event-${index + 1}`,
    sequence: index + 1,
    battingTeamId,
    bowlingTeamId,
    strikerId: batters[0],
    nonStrikerId: batters[1],
    bowlerId: bowlers[Math.floor(index / 6)],
    batterRuns: runs[index] ?? 0,
    extraType: null,
    extras: 0,
    legalDelivery: true,
    wicket: null,
    timestamp: timestamp(timeOffset + index + 1)
  }));
}

function transition(
  overrides: Partial<MatchRosterTransition> = {}
): MatchRosterTransition {
  return {
    inningsIndex: 0,
    eventIndex: 0,
    teamAPlayerIds: [...teamA],
    teamBPlayerIds: [...teamB],
    sharedPlayerId: "rohit",
    fieldingHelperIds: [],
    appliedAt: timestamp(0),
    ...overrides
  };
}

function transitionedPayload(
  overrides: Partial<AppSyncMatchPayload> = {}
): AppSyncMatchPayload {
  const inningsAEvents = inningsEvents({
    battingTeamId: "teamA",
    batters: ["aninda", "arunabha"],
    bowlers: ["rohit", "atripan", "biplab"],
    runs: [6, 6, 2]
  });
  const inningsBEvents = inningsEvents({
    battingTeamId: "teamB",
    batters: ["atripan", "biplab"],
    bowlers: ["aninda", "dipanjan", "gaurav"],
    timeOffset: 100
  });

  return {
    offlineMatchId: "apk-transition-match",
    syncVersion: 2,
    isDemo: false,
    matchDate: "2026-09-02",
    pomRecommendationPlayerId: "aninda",
    startedAt: timestamp(0),
    completedAt: timestamp(200),
    matchName: "Late arrival match",
    venue: "CZU Gully Arena",
    scheduledOversPerInnings: 3,
    battingMode: "two_batter",
    battingFirstTeamId: "teamA",
    teamAName: "Team A",
    teamBName: "Team B",
    teamAPlayerIds: [...teamA, "rohit"],
    teamBPlayerIds: [...teamB, "naim"],
    sharedPlayerId: null,
    fieldingHelperIds: [],
    rosterTransitions: [
      transition(),
      transition({
        // Current APK raw boundary: 13 deliveries + 3 bowler markers.
        eventIndex: 16,
        teamAPlayerIds: [...teamA, "rohit"],
        teamBPlayerIds: [...teamB, "naim"],
        sharedPlayerId: null,
        appliedAt: new Date(baseTime + 13_500).toISOString()
      })
    ],
    inningsAEvents,
    inningsBEvents,
    ...overrides
  };
}

function legacyPayload(): AppSyncMatchPayload {
  return {
    ...transitionedPayload(),
    offlineMatchId: "legacy-no-history",
    scheduledOversPerInnings: 1,
    teamAPlayerIds: ["aninda", "arunabha"],
    teamBPlayerIds: ["atripan", "biplab"],
    sharedPlayerId: null,
    inningsAEvents: inningsEvents({
      battingTeamId: "teamA",
      batters: ["aninda", "arunabha"],
      bowlers: ["atripan", "biplab", "atripan"]
    }).slice(0, 6),
    inningsBEvents: inningsEvents({
      battingTeamId: "teamB",
      batters: ["atripan", "biplab"],
      bowlers: ["aninda", "arunabha", "aninda"],
      timeOffset: 100
    }).slice(0, 6),
    rosterTransitions: undefined
  };
}

function noSharedToSharedPayload(): AppSyncMatchPayload {
  const payload = transitionedPayload();

  payload.inningsAEvents = inningsEvents({
    battingTeamId: "teamA",
    batters: ["aninda", "arunabha"],
    bowlers: ["atripan", "biplab", "soman"],
    runs: [6, 6, 2]
  });
  payload.teamAPlayerIds = ["aninda", "arunabha", "dipanjan", "gaurav", "naim"];
  payload.teamBPlayerIds = [...teamB];
  payload.sharedPlayerId = "madhab";
  payload.rosterTransitions = [
    transition({ sharedPlayerId: null }),
    transition({
      eventIndex: 16,
      teamAPlayerIds: [...payload.teamAPlayerIds],
      teamBPlayerIds: [...payload.teamBPlayerIds],
      sharedPlayerId: "madhab",
      appliedAt: new Date(baseTime + 13_500).toISOString()
    })
  ];

  return payload;
}

function differentSharedPlayersPayload(): AppSyncMatchPayload {
  const payload = transitionedPayload();

  payload.teamAPlayerIds = [...teamA, "rohit"];
  payload.teamBPlayerIds = [...teamB, "naim"];
  payload.sharedPlayerId = "saurav";
  payload.rosterTransitions = [
    transition(),
    transition({
      eventIndex: 16,
      teamAPlayerIds: [...teamA, "rohit"],
      teamBPlayerIds: [...teamB, "naim"],
      sharedPlayerId: null,
      appliedAt: new Date(baseTime + 13_500).toISOString()
    }),
    transition({
      eventIndex: 17,
      teamAPlayerIds: [...teamA, "rohit"],
      teamBPlayerIds: [...teamB, "naim"],
      sharedPlayerId: "saurav",
      appliedAt: new Date(baseTime + 14_500).toISOString()
    })
  ];

  return payload;
}

function assemble(payload: AppSyncMatchPayload) {
  return assemblePendingImportMatch({
    payload,
    appliedAt: timestamp(300)
  });
}

function careerRow(playerId: string): SupabaseCareerStatsRow {
  return {
    player_id: playerId,
    matches: 0,
    innings_batted: 0,
    runs: 0,
    fifties: 0,
    centuries: 0,
    dismissed_ducks: 0,
    wickets: 0,
    catches: 0,
    run_outs: 0,
    stumpings: 0,
    hat_tricks: 0,
    three_wicket_hauls: 0,
    matches_bowled: 0,
    completed_overs: 0,
    total_runs_conceded: 0,
    total_xp: 0,
    level: 0,
    stats_payload: {},
    updated_at: timestamp(250)
  };
}

test("legacy APK payload without rosterTransitions keeps existing assembly behavior", () => {
  const payload = legacyPayload();

  assert.equal(isAppSyncMatchPayload(payload), true);
  const result = assemble(payload);
  assert.equal(result.ok, true, result.ok ? "" : result.errors.join(" | "));
  assert.equal(result.derivedMatch?.rosterTransitions, undefined);
  assert.deepEqual(result.derivedMatch?.everSharedPlayerIds, []);
});

test("website accepts the exact optional rosterTransitions shape emitted by APK v1.4", () => {
  const payload = transitionedPayload();

  assert.equal(isAppSyncMatchPayload(payload), true);
  assert.equal(payload.rosterTransitions?.[1]?.eventIndex, 16);
  const resolution = resolveRosterTransitions(payload, knownPlayerIds);
  assert.deepEqual(resolution.errors, []);
  assert.equal(resolution.snapshots[1]?.effectiveEventIndex, 13);
});

test("5v5 plus Shared to 6v6 preserves 14 runs at the 2.1-over boundary", () => {
  const payload = transitionedPayload();
  const resolution = resolveRosterTransitions(payload, knownPlayerIds);
  const firstThirteen = deriveQuickScoringInnings({
    battingTeamId: "teamA",
    bowlingTeamId: "teamB",
    battingPlayerIds: resolution.teamAPlayerIds,
    bowlingPlayerIds: resolution.teamBPlayerIds,
    events: payload.inningsAEvents.slice(0, 13),
    battingMode: payload.battingMode,
    eventEligibility: (_event, eventIndex) => {
      const snapshot = resolution.getSnapshot(0, eventIndex);
      const bowlingPlayerIds = resolution.getTeamPlayerIds(snapshot, "teamB");
      return {
        battingPlayerIds: resolution.getTeamPlayerIds(snapshot, "teamA"),
        bowlingPlayerIds,
        fieldingPlayerIds: bowlingPlayerIds
      };
    }
  });

  assert.equal(firstThirteen.runs, 14);
  assert.equal(firstThirteen.legalBalls, 13);
  assert.equal(resolution.getSnapshot(0, 12).sharedPlayerId, "rohit");
  assert.equal(resolution.getSnapshot(0, 13).sharedPlayerId, null);

  const result = assemble(payload);
  assert.equal(result.ok, true, result.ok ? "" : result.errors.join(" | "));
  assert.equal(result.derivedMatch?.innings.first.runs, 14);
  assert.equal(result.derivedMatch?.innings.first.completedOvers, 3);
});

test("early Shared bowler remains valid after becoming Team A exclusive", () => {
  const result = assemble(transitionedPayload());
  assert.equal(result.ok, true, result.ok ? "" : result.errors.join(" | "));
  assert.equal(
    result.derivedMatch?.teams.teamB.bowlingOvers[0]?.bowlerId,
    "rohit"
  );
  assert.equal(result.derivedMatch?.sharedPlayerId, null);
  assert.deepEqual(result.derivedMatch?.everSharedPlayerIds, ["rohit"]);
});

test("an existing team player may become Shared after a no-Shared start", () => {
  const result = assemble(noSharedToSharedPayload());
  assert.equal(result.ok, true, result.ok ? "" : result.errors.join(" | "));
  assert.equal(result.derivedMatch?.sharedPlayerId, "madhab");
  assert.deepEqual(result.derivedMatch?.everSharedPlayerIds, ["madhab"]);
});

test("different historical Shared players are both valid and progression-protected", () => {
  const result = assemble(differentSharedPlayersPayload());
  assert.equal(result.ok, true, result.ok ? "" : result.errors.join(" | "));
  assert.deepEqual(
    new Set(result.derivedMatch?.everSharedPlayerIds),
    new Set(["rohit", "saurav"])
  );

  for (const playerId of ["rohit", "saurav"]) {
    const record: FinalisedPlayerMatchRecord | undefined =
      result.derivedMatch?.finalisedPlayerRecords?.find(
      (candidate) => candidate.playerId === playerId
    );
    assert.equal(record?.xpBreakdown.winBonusXP, 0);
  }
});

test("late participant has no retroactive stats and is included exactly once", () => {
  const result = assemble(transitionedPayload());
  assert.equal(result.ok, true, result.ok ? "" : result.errors.join(" | "));
  const records = result.derivedMatch?.finalisedPlayerRecords ?? [];
  const naimRecords = records.filter((record) => record.playerId === "naim");

  assert.equal(naimRecords.length, 1);
  assert.equal(naimRecords[0]?.played, true);
  assert.equal(naimRecords[0]?.didBat, false);
  assert.equal(naimRecords[0]?.runs, 0);
});

for (const dismissalType of ["caught", "run_out", "stumped"] as const) {
  test(`event-time Shared ${dismissalType} fielding remains valid`, () => {
    const payload = transitionedPayload();
    const events = payload.inningsAEvents.map((quickEvent) => ({ ...quickEvent }));
    const wicketEvent = events[12];

    assert.ok(wicketEvent);
    wicketEvent.wicket = {
      type: dismissalType,
      dismissedPlayerId: "aninda",
      fielderId: "rohit",
      newBatterId: "dipanjan",
      completedRuns: 0,
      nextStrikerId: "dipanjan",
      nextNonStrikerId: "arunabha"
    };
    for (const laterEvent of events.slice(13)) {
      laterEvent.strikerId = "dipanjan";
      laterEvent.nonStrikerId = "arunabha";
    }
    payload.inningsAEvents = events;

    const result = assemble(payload);
    assert.equal(result.ok, true, result.ok ? "" : result.errors.join(" | "));
    const rohit = result.derivedMatch?.finalisedPlayerRecords?.find(
      (record) => record.playerId === "rohit"
    );
    assert.equal(rohit?.[dismissalType === "caught" ? "catches" : dismissalType === "run_out" ? "runOuts" : "stumpings"], 1);
  });
}

test("Fielding Helper eligibility is resolved from the historical snapshot", () => {
  const payload = transitionedPayload();
  payload.rosterTransitions = payload.rosterTransitions?.map((snapshot, index) => ({
    ...snapshot,
    fieldingHelperIds: index === 0 ? ["madhab"] : []
  }));
  const wicketEvent = payload.inningsAEvents[12];
  assert.ok(wicketEvent);
  wicketEvent.wicket = {
    type: "caught",
    dismissedPlayerId: "aninda",
    fielderId: "madhab",
    newBatterId: "dipanjan",
    completedRuns: 0,
    nextStrikerId: "dipanjan",
    nextNonStrikerId: "arunabha"
  };
  for (const laterEvent of payload.inningsAEvents.slice(13)) {
    laterEvent.strikerId = "dipanjan";
    laterEvent.nonStrikerId = "arunabha";
  }

  const result = assemble(payload);
  assert.equal(result.ok, true, result.ok ? "" : result.errors.join(" | "));
  const madhab = result.derivedMatch?.finalisedPlayerRecords?.find(
    (record) => record.playerId === "madhab"
  );
  assert.equal(madhab?.catches, 1);
});

test("ever-Shared XP keeps V1/V2 date selection without changing formulas", () => {
  const v2 = assemble(transitionedPayload());
  const v1 = assemble(transitionedPayload({ matchDate: "2026-08-31" }));
  assert.equal(v1.ok, true, v1.ok ? "" : v1.errors.join(" | "));
  assert.equal(v2.ok, true, v2.ok ? "" : v2.errors.join(" | "));

  const v1Rohit = v1.derivedMatch?.finalisedPlayerRecords?.find(
    (record) => record.playerId === "rohit"
  );
  const v2Rohit = v2.derivedMatch?.finalisedPlayerRecords?.find(
    (record) => record.playerId === "rohit"
  );
  assert.equal(v1Rohit?.xpBreakdown.xpRuleVersion, "v1");
  assert.equal(v2Rohit?.xpBreakdown.xpRuleVersion, "v2");
  assert.equal(v1Rohit?.xpBreakdown.winBonusXP, 0);
  assert.equal(v2Rohit?.xpBreakdown.winBonusXP, 0);
});

test("server POM recommendation uses aggregated transitioned performance", () => {
  const result = assemble(transitionedPayload());
  assert.equal(result.ok, true, result.ok ? "" : result.errors.join(" | "));
  assert.equal(result.pomRecommendation.recommendedPlayerId, "aninda");
  assert.equal(result.pomRecommendation.leaders[0]?.prePomXP > 20, true);
});

test("review edits preserve transition history and shift delivery boundaries safely", () => {
  const payload = transitionedPayload();
  const updated = updateApkReviewEvent(
    payload,
    "inningsAEvents",
    "teamA-event-1",
    { ...payload.inningsAEvents[0]!, batterRuns: 4 }
  );
  assert.deepEqual(updated.rosterTransitions, payload.rosterTransitions);

  const inserted = insertApkReviewEventAfter(
    payload,
    "inningsAEvents",
    "teamA-event-1"
  );
  assert.equal(inserted.rosterTransitions?.[1]?.eventIndex, 14);

  const deleted = deleteApkReviewEvent(
    payload,
    "inningsAEvents",
    "teamA-event-1"
  );
  assert.equal(deleted.rosterTransitions?.[1]?.eventIndex, 12);
  assert.deepEqual(resolveRosterTransitions(deleted, knownPlayerIds).errors, []);
  const incomplete = assemble(deleted);
  assert.equal(incomplete.ok, false);
  if (!incomplete.ok) assert.match(incomplete.errors.join(" | "), /not complete/);

  const malformed = transitionedPayload();
  const malformedBoundary = malformed.rosterTransitions?.[1];
  assert.ok(malformedBoundary);
  malformedBoundary.eventIndex = 999;
  malformedBoundary.appliedAt = null;
  const editedMalformed = insertApkReviewEventAfter(
    malformed,
    "inningsAEvents",
    "teamA-event-1"
  );
  assert.equal(editedMalformed.rosterTransitions?.[1]?.eventIndex, 999);
});

test("authoritative finalisation retains roster history and creates one application per participant", () => {
  const assembled = assemble(differentSharedPlayersPayload());
  assert.equal(assembled.ok, true, assembled.ok ? "" : assembled.errors.join(" | "));
  if (!assembled.ok) return;

  const playerIds = assembled.derivedMatch.finalisedPlayerRecords?.map(
    (record) => record.playerId
  ) ?? [];
  const plan = buildFinalisationPlan({
    finalMatch: assembled.derivedMatch,
    careerRows: playerIds.map(careerRow),
    existingApplications: [],
    appliedAt: timestamp(400)
  });

  assert.deepEqual(
    plan.finalMatch.rosterTransitions,
    differentSharedPlayersPayload().rosterTransitions
  );
  assert.deepEqual(
    new Set(plan.finalMatch.everSharedPlayerIds),
    new Set(["rohit", "saurav"])
  );
  assert.equal(plan.applications.length, new Set(playerIds).size);
  for (const playerId of ["rohit", "saurav"]) {
    assert.equal(
      plan.applications.find((application) => application.playerId === playerId)
        ?.progression.xpBreakdown.winBonusXP,
      0
    );
  }
});

test("malformed roster histories return human-readable review errors", () => {
  const cases: Array<[string, (payload: AppSyncMatchPayload) => void, RegExp]> = [
    [
      "unknown player",
      (payload) => payload.rosterTransitions?.[0]?.teamAPlayerIds.push("unknown-player"),
      /unknown player/
    ],
    [
      "duplicate membership",
      (payload) => payload.rosterTransitions?.[0]?.teamAPlayerIds.push("aninda"),
      /duplicate team assignment/
    ],
    [
      "invalid Shared parity",
      (payload) => {
        const snapshot = payload.rosterTransitions?.[0];
        if (!snapshot) return;
        snapshot.teamBPlayerIds.pop();
      },
      /even roster|keep Team A and Team B equal/
    ],
    [
      "non-monotonic boundary",
      (payload) => {
        const snapshot = payload.rosterTransitions?.[1];
        if (!snapshot) return;
        snapshot.eventIndex = 10;
        snapshot.appliedAt = null;
        payload.rosterTransitions?.push({ ...snapshot, eventIndex: 9 });
      },
      /earlier than the previous update/
    ],
    [
      "boundary beyond event count",
      (payload) => {
        const snapshot = payload.rosterTransitions?.[1];
        if (!snapshot) return;
        snapshot.eventIndex = 999;
        snapshot.appliedAt = null;
      },
      /beyond the recorded innings/
    ]
  ];

  for (const [label, mutate, expected] of cases) {
    const payload = transitionedPayload();
    mutate(payload);
    const result = assemble(payload);
    assert.equal(result.ok, false, label);
    if (result.ok) continue;
    assert.match(result.errors.join(" | "), expected, label);
  }
});
