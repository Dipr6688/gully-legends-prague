import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildPostMatchCelebrationSummary,
  getPostMatchCelebrationBaselineMatches,
  isOfficialCelebrationMatch
} from "../lib/post-match-celebration";
import { cumulativeXPForLevel, XP_RULES } from "../lib/progression";
import { createQuickScoringEvent } from "../lib/quick-scoring";
import type {
  FinalisedPlayerMatchRecord,
  MatchRecord,
  PlayerMatchXPBreakdown,
  QuickScoringEvent,
  QuickScoringMetadata,
  TeamId
} from "../lib/types/match";

function xpBreakdown(awardedXP: number): PlayerMatchXPBreakdown {
  return {
    participationXP: 0,
    winBonusXP: 0,
    playerOfMatchXP: 0,
    battingRunsXP: 0,
    battingMilestoneXP: 0,
    duckPenaltyXP: 0,
    wicketXP: 0,
    hatTrickXP: 0,
    maidenXP: 0,
    expensiveOverPenaltyXP: 0,
    fieldingXP: 0,
    rawTotalXP: awardedXP,
    awardedXP
  };
}

function record({
  playerId,
  teamId = "teamA",
  runs = 0,
  didBat = true,
  wickets = 0,
  catches = 0,
  runOuts = 0,
  stumpings = 0,
  playerOfMatch = false,
  awardedXP = 20
}: {
  playerId: string;
  teamId?: TeamId;
  runs?: number;
  didBat?: boolean;
  wickets?: number;
  catches?: number;
  runOuts?: number;
  stumpings?: number;
  playerOfMatch?: boolean;
  awardedXP?: number;
}): FinalisedPlayerMatchRecord {
  return {
    playerId,
    teamId,
    representingTeamId: teamId,
    played: true,
    playerOfMatch,
    didBat,
    battingPosition: didBat ? 1 : null,
    runs: didBat ? runs : "",
    wasOut: false,
    wickets,
    hatTricks: 0,
    catches,
    runOuts,
    stumpings,
    xpBreakdown: xpBreakdown(awardedXP),
    progressionAppliedAt: "2026-08-10T10:00:00.000Z"
  };
}

function event(
  sequence: number,
  overrides: Partial<Parameters<typeof createQuickScoringEvent>[0]> = {}
): QuickScoringEvent {
  const input: Parameters<typeof createQuickScoringEvent>[0] = {
    sequence,
    battingTeamId: "teamA",
    strikerId: "aninda",
    nonStrikerId: "biplab",
    bowlerId: "arunabha",
    batterRuns: 0,
    extraType: null,
    wicket: null,
    timestamp: `2026-08-10T10:00:${String(sequence).padStart(2, "0")}.000Z`,
    ...overrides
  };

  return createQuickScoringEvent({
    ...input,
    extraType: input.extraType ?? null,
    wicket: input.wicket ?? null
  });
}

function quickScoring(events: QuickScoringEvent[]): QuickScoringMetadata {
  return {
    version: 2,
    setupLocked: true,
    battingMode: "two_batter",
    inningsPhase: "second_innings",
    inningsAEvents: events,
    inningsBEvents: []
  };
}

function match({
  id,
  matchDate = "2026-08-10",
  matchNumber = 1,
  status = "finalised",
  isDemo = false,
  isDemoTestMatch = false,
  deletedAt = null,
  records = [record({ playerId: "aninda", runs: 10 })],
  events = []
}: {
  id: string;
  matchDate?: string;
  matchNumber?: number | null;
  status?: MatchRecord["status"];
  isDemo?: boolean;
  isDemoTestMatch?: boolean;
  deletedAt?: string | null;
  records?: FinalisedPlayerMatchRecord[];
  events?: QuickScoringEvent[];
}): MatchRecord {
  const teamARecords = records.filter((item) => item.teamId === "teamA");
  const teamBRecords = records.filter((item) => item.teamId === "teamB");
  const teamARuns = teamARecords.reduce(
    (total, item) => total + (typeof item.runs === "number" ? item.runs : 0),
    0
  );
  const teamBRuns = teamBRecords.reduce(
    (total, item) => total + (typeof item.runs === "number" ? item.runs : 0),
    0
  );

  return {
    id,
    isDemo,
    isDemoTestMatch,
    matchDate,
    matchNumber,
    deletedAt,
    matchName: "Celebration Test",
    venue: "CZU Gully Arena",
    status,
    scheduledOversPerInnings: 6,
    battingFirstTeamId: "teamA",
    chasingTeamId: "teamB",
    teams: {
      teamA: {
        teamId: "teamA",
        teamName: "Team A",
        playerIds: teamARecords.map((item) => item.playerId),
        playerPerformances: teamARecords,
        bowlingOvers: [],
        totalRuns: teamARuns,
        completedBowlingOvers: 0
      },
      teamB: {
        teamId: "teamB",
        teamName: "Team B",
        playerIds: teamBRecords.map((item) => item.playerId),
        playerPerformances: teamBRecords,
        bowlingOvers: [],
        totalRuns: teamBRuns,
        completedBowlingOvers: 0
      }
    },
    innings: {
      first: {
        battingTeamId: "teamA",
        bowlingTeamId: "teamB",
        runs: teamARuns,
        wicketsLost: 0,
        extras: 0,
        playerCount: teamARecords.length,
        completedOvers: events.filter((item) => item.legalDelivery).length / 6,
        battingPerformances: teamARecords,
        bowlingOvers: []
      },
      second: {
        battingTeamId: "teamB",
        bowlingTeamId: "teamA",
        runs: teamBRuns,
        wicketsLost: 0,
        extras: 0,
        playerCount: teamBRecords.length,
        completedOvers: 0,
        battingPerformances: teamBRecords,
        bowlingOvers: []
      }
    },
    result: {
      type: "win_by_runs",
      winnerTeamId: "teamA",
      loserTeamId: "teamB",
      marginRuns: Math.max(0, teamARuns - teamBRuns)
    },
    finalisedPlayerRecords: records,
    progressionAppliedAt: `${matchDate}T12:00:00.000Z`,
    quickScoring: quickScoring(events)
  };
}

function metrics<T extends { metric: string }>(items: T[]): string[] {
  return items.map((item) => item.metric).sort();
}

test("official celebration match filtering excludes non-official match states and previews", () => {
  assert.equal(isOfficialCelebrationMatch(match({ id: "official" })), true);
  assert.equal(isOfficialCelebrationMatch(match({ id: "demo", isDemo: true })), false);
  assert.equal(
    isOfficialCelebrationMatch(match({ id: "demo-test", isDemoTestMatch: true })),
    false
  );
  assert.equal(
    isOfficialCelebrationMatch(match({ id: "deleted", deletedAt: "2026-08-12" })),
    false
  );
  assert.equal(
    isOfficialCelebrationMatch(match({ id: "in-progress", status: "in_progress" })),
    false
  );
  assert.equal(
    isOfficialCelebrationMatch(match({ id: "cancelled", status: "cancelled" })),
    false
  );
  assert.equal(isOfficialCelebrationMatch(match({ id: "apk-pending-1" })), false);

  const current = match({ id: "current", matchDate: "2026-08-10", matchNumber: 3 });
  const baseline = getPostMatchCelebrationBaselineMatches({
    match: current,
    historicalMatches: [
      match({ id: "previous", matchDate: "2026-08-10", matchNumber: 2 }),
      current,
      match({ id: "future", matchDate: "2026-08-11", matchNumber: 1 }),
      match({ id: "demo-history", matchDate: "2026-08-09", isDemo: true }),
      match({ id: "pending-history", matchDate: "2026-08-09", status: "in_progress" })
    ]
  });

  assert.deepEqual(
    baseline.map((item) => item.id),
    ["previous"]
  );
});

test("personal bests use strict improvement and support first official performances", () => {
  const previous = match({
    id: "previous",
    matchDate: "2026-08-01",
    records: [
      record({ playerId: "aninda", runs: 42, wickets: 2, awardedXP: 41 }),
      record({ playerId: "soman", runs: 20 })
    ]
  });
  const current = match({
    id: "current",
    matchDate: "2026-08-02",
    records: [
      record({ playerId: "aninda", runs: 43, wickets: 2, awardedXP: 41 }),
      record({ playerId: "soman", runs: 12 }),
      record({ playerId: "naim", runs: 18, wickets: 1, catches: 1, awardedXP: 36 })
    ]
  });
  const summary = buildPostMatchCelebrationSummary({
    match: current,
    historicalMatches: [previous]
  });

  const anindaRunBest = summary.personalBests.find(
    (item) => item.playerId === "aninda" && item.metric === "runs"
  );
  assert.equal(anindaRunBest?.kind, "personal_best");
  assert.equal(anindaRunBest?.previousBest, 42);
  assert.equal(anindaRunBest?.improvement, 1);
  assert.equal(
    summary.personalBests.some(
      (item) => item.playerId === "aninda" && item.metric === "wickets"
    ),
    false
  );
  assert.equal(
    summary.personalBests.some(
      (item) => item.playerId === "soman" && item.metric === "runs"
    ),
    false
  );

  const naimMetrics = metrics(
    summary.personalBests.filter((item) => item.playerId === "naim")
  );
  assert.deepEqual(naimMetrics, ["catches", "matchXP", "runs", "wickets"]);
  assert.equal(summary.personalBests[0]?.playerId === "naeem", false);
});

test("legacy matches without event history skip fours and sixes instead of inventing values", () => {
  const legacy = match({
    id: "legacy",
    matchDate: "2026-08-01",
    records: [record({ playerId: "aninda", runs: 44 })],
    events: []
  });
  const currentWithoutEvents = match({
    id: "current-no-events",
    matchDate: "2026-08-02",
    records: [record({ playerId: "aninda", runs: 45 })],
    events: []
  });

  const noEventSummary = buildPostMatchCelebrationSummary({
    match: currentWithoutEvents,
    historicalMatches: [legacy]
  });

  assert.equal(
    noEventSummary.personalBests.some(
      (item) => item.metric === "fours" || item.metric === "sixes"
    ),
    false
  );
  assert.equal(
    noEventSummary.recordsBroken.some(
      (item) => item.metric === "fours" || item.metric === "sixes"
    ),
    false
  );

  const eventBackedCurrent = match({
    id: "current-events",
    matchDate: "2026-08-03",
    records: [record({ playerId: "aninda", runs: 14 })],
    events: [
      event(1, { batterRuns: 4 }),
      event(2, { batterRuns: 4 }),
      event(3, { batterRuns: 6 })
    ]
  });
  const eventSummary = buildPostMatchCelebrationSummary({
    match: eventBackedCurrent,
    historicalMatches: [legacy]
  });

  assert.equal(
    eventSummary.personalBests.some(
      (item) =>
        item.playerId === "aninda" &&
        item.metric === "fours" &&
        item.kind === "first_personal_best"
    ),
    true
  );
  assert.equal(
    eventSummary.recordsBroken.some(
      (item) => item.metric === "sixes" && item.status === "firstRecord"
    ),
    true
  );
});

test("records require strict all-player improvement and model first records explicitly", () => {
  const previous = match({
    id: "previous",
    matchDate: "2026-08-01",
    records: [
      record({ playerId: "rohit", runs: 61, wickets: 3, catches: 2 }),
      record({ playerId: "biplab", runs: 30, wickets: 1, runOuts: 1, stumpings: 1 })
    ]
  });
  const current = match({
    id: "current",
    matchDate: "2026-08-02",
    records: [
      record({
        playerId: "dipanjan",
        runs: 67,
        wickets: 4,
        catches: 3,
        runOuts: 2,
        stumpings: 2
      }),
      record({ playerId: "soman", runs: 61, wickets: 3, catches: 2 })
    ]
  });

  const summary = buildPostMatchCelebrationSummary({
    match: current,
    historicalMatches: [previous]
  });
  const brokenMetrics = metrics(summary.recordsBroken);

  assert.deepEqual(brokenMetrics, [
    "catches",
    "runOuts",
    "runs",
    "stumpings",
    "wickets"
  ]);
  assert.equal(
    summary.recordsBroken.find((item) => item.metric === "runs")?.previousRecord
      ?.holderPlayerIds[0],
    "rohit"
  );
  assert.equal(
    summary.recordsBroken.some(
      (item) => item.playerId === "soman" && item.metric === "runs"
    ),
    false
  );

  const firstSummary = buildPostMatchCelebrationSummary({
    match: current,
    historicalMatches: []
  });

  assert.equal(firstSummary.recordsBroken.every((item) => item.status === "firstRecord"), true);
});

test("fours and sixes records use only event-backed match history", () => {
  const previous = match({
    id: "previous",
    matchDate: "2026-08-01",
    records: [record({ playerId: "aninda", runs: 16 })],
    events: [
      event(1, { batterRuns: 4 }),
      event(2, { batterRuns: 4 }),
      event(3, { batterRuns: 6 })
    ]
  });
  const current = match({
    id: "current",
    matchDate: "2026-08-02",
    records: [record({ playerId: "soman", runs: 28 })],
    events: [
      event(1, { strikerId: "soman", batterRuns: 4 }),
      event(2, { strikerId: "soman", batterRuns: 4 }),
      event(3, { strikerId: "soman", batterRuns: 4 }),
      event(4, { strikerId: "soman", batterRuns: 6 }),
      event(5, { strikerId: "soman", batterRuns: 6 })
    ]
  });

  const summary = buildPostMatchCelebrationSummary({
    match: current,
    historicalMatches: [previous]
  });

  assert.equal(summary.recordsBroken.find((item) => item.metric === "fours")?.status, "broken");
  assert.equal(summary.recordsBroken.find((item) => item.metric === "sixes")?.status, "broken");
  assert.equal(
    summary.recordsBroken.find((item) => item.metric === "sixes")?.previousRecord
      ?.value,
    1
  );
});

test("official POM comes from finalised player records, not preview recommendations", () => {
  const current = {
    ...match({
      id: "current",
      records: [
        record({ playerId: "aninda", runs: 10, awardedXP: 30 }),
        record({
          playerId: "biplab",
          runs: 8,
          playerOfMatch: true,
          awardedXP: XP_RULES.participation + XP_RULES.playerOfMatch
        })
      ]
    }),
    apkPreviewPlayerOfMatchId: "aninda"
  } satisfies MatchRecord & { apkPreviewPlayerOfMatchId: string };

  const summary = buildPostMatchCelebrationSummary({
    match: current,
    historicalMatches: []
  });

  assert.deepEqual(summary.playerOfMatch, {
    playerId: "biplab",
    matchXP: XP_RULES.participation + XP_RULES.playerOfMatch
  });
  assert.equal(
    summary.highlights.some(
      (item) => item.type === "player_of_match" && item.playerId === "biplab"
    ),
    true
  );
});

test("progression and level-ups are derived from authoritative before and after values", () => {
  const levelOne = cumulativeXPForLevel(1);
  const levelThree = cumulativeXPForLevel(3);
  const current = match({ id: "current" });
  const summary = buildPostMatchCelebrationSummary({
    match: current,
    historicalMatches: [],
    progressionSnapshots: [
      {
        playerId: "aninda",
        beforeTotalXP: levelOne - 10,
        afterTotalXP: levelOne + 5,
        awardedXP: 15
      },
      {
        playerId: "biplab",
        beforeTotalXP: levelOne + 20,
        afterTotalXP: levelOne + 40,
        awardedXP: 20,
        beforeLevel: 1,
        afterLevel: 1
      },
      {
        playerId: "soman",
        beforeTotalXP: levelOne - 1,
        afterTotalXP: levelThree + 5,
        awardedXP: levelThree - levelOne + 6
      }
    ]
  });

  assert.deepEqual(
    summary.levelUps.map((item) => ({
      playerId: item.playerId,
      fromLevel: item.fromLevel,
      toLevel: item.toLevel
    })),
    [
      { playerId: "aninda", fromLevel: 0, toLevel: 1 },
      { playerId: "soman", fromLevel: 0, toLevel: 3 }
    ]
  );
  assert.equal(
    summary.progressionChanges.find((item) => item.playerId === "biplab")?.xpGained,
    20
  );
  assert.equal(summary.levelUps.find((item) => item.playerId === "soman")?.levelsGained, 3);
});

test("non-official current matches produce no celebration effects", () => {
  const demo = match({
    id: "demo-current",
    isDemo: true,
    records: [record({ playerId: "aninda", runs: 80, playerOfMatch: true })]
  });
  const summary = buildPostMatchCelebrationSummary({
    match: demo,
    historicalMatches: [],
    progressionSnapshots: [
      {
        playerId: "aninda",
        beforeTotalXP: 0,
        afterTotalXP: 300,
        awardedXP: 300
      }
    ]
  });

  assert.equal(summary.isEligibleOfficialMatch, false);
  assert.equal(summary.playerOfMatch, null);
  assert.deepEqual(summary.personalBests, []);
  assert.deepEqual(summary.recordsBroken, []);
  assert.deepEqual(summary.progressionChanges, []);
  assert.deepEqual(summary.levelUps, []);
  assert.deepEqual(summary.highlights, []);
});

test("progression snapshots preserve official awarded XP separately from after-before movement", () => {
  const current = match({ id: "current" });
  const summary = buildPostMatchCelebrationSummary({
    match: current,
    historicalMatches: [],
    progressionSnapshots: [
      {
        playerId: "aninda",
        beforeTotalXP: 100,
        afterTotalXP: 95,
        awardedXP: -15,
        beforeLevel: 1,
        afterLevel: 1
      }
    ]
  });
  const progression = summary.progressionChanges[0];

  assert.equal(progression?.awardedXP, -15);
  assert.equal(progression?.xpGained, -5);
  assert.equal(summary.levelUps.length, 0);
});

test("match XP is skipped when legacy finalised records lack an authoritative XP breakdown", () => {
  const legacyRecord = {
    ...record({ playerId: "aninda", runs: 10, awardedXP: 44 }),
    xpBreakdown: undefined
  } as unknown as FinalisedPlayerMatchRecord;
  const legacy = match({
    id: "legacy",
    matchDate: "2026-08-01",
    records: [legacyRecord]
  });
  const current = match({
    id: "current",
    matchDate: "2026-08-02",
    records: [record({ playerId: "aninda", runs: 11, awardedXP: 45 })]
  });
  const summary = buildPostMatchCelebrationSummary({
    match: current,
    historicalMatches: [legacy]
  });

  assert.equal(
    summary.personalBests.find(
      (item) => item.playerId === "aninda" && item.metric === "matchXP"
    )?.kind,
    "first_personal_best"
  );
  assert.equal(
    summary.recordsBroken.find((item) => item.metric === "matchXP")?.status,
    "firstRecord"
  );
});

test("Admin finalisation route builds celebration only after atomic finalisation succeeds", () => {
  const finaliseRoute = readFileSync(
    "app/api/admin/matches/finalize/route.ts",
    "utf8"
  );
  const apiClient = readFileSync("lib/admin-match-write-client.ts", "utf8");
  const repository = readFileSync(
    "lib/supabase/match-finalisation-repository.ts",
    "utf8"
  );
  const finalizeIndex = finaliseRoute.indexOf("finalizeAtomically(plan)");
  const celebrationIndex = finaliseRoute.indexOf(
    "const celebration = await buildCelebrationAfterSuccessfulFinalisation"
  );

  assert.match(finaliseRoute, /buildPostMatchCelebrationSummary/);
  assert.match(finaliseRoute, /buildProgressionSnapshotsFromPlan/);
  assert.match(finaliseRoute, /awardedXP:\s*application\.progression\.xpBreakdown\.awardedXP/);
  assert.match(finaliseRoute, /includeProgression:\s*!alreadyApplied/);
  assert.ok(finalizeIndex >= 0);
  assert.ok(celebrationIndex > finalizeIndex);
  assert.match(finaliseRoute, /celebration/);
  assert.match(apiClient, /PostMatchCelebrationSummary/);
  assert.match(repository, /getMatchRows/);
});

test("Post-match celebration UI renders official summary sections and actions", () => {
  const component = readFileSync(
    "components/matches/PostMatchCelebration.tsx",
    "utf8"
  );

  assert.match(component, /role="dialog"/);
  assert.match(component, /aria-modal="true"/);
  assert.match(component, /getMatchResultHeadline\(match\)/);
  assert.match(component, /getMatchScoreRowsInInningsOrder\(match\)/);
  assert.match(component, /getMatchScheduledOversLabel\(match\)/);
  assert.match(component, /Player of the Match/);
  assert.match(component, /Gully Record Broken!/);
  assert.match(component, /First Gully Record!/);
  assert.match(component, /New Personal Best!/);
  assert.match(component, /First Personal Mark!/);
  assert.match(component, /Level Up!/);
  assert.match(component, /XP Earned/);
  assert.match(component, /View Scorecard/);
  assert.match(component, /Home/);
  assert.match(component, /Keep Reviewing/);
  assert.match(component, /standalonePersonalBests/);
});

test("Post-match celebration uses custom public artwork assets", () => {
  const component = readFileSync(
    "components/matches/PostMatchCelebration.tsx",
    "utf8"
  );
  const css = readFileSync("app/globals.css", "utf8");
  const assets = [
    "winner-trophy.svg",
    "pom-star.svg",
    "record-broken.svg",
    "personal-best.svg",
    "level-up.svg",
    "xp-bolt.svg"
  ];

  for (const asset of assets) {
    const path = `public/ui/post-match-celebration/${asset}`;
    const source = readFileSync(path, "utf8");

    assert.match(component, new RegExp(`/ui/post-match-celebration/${asset}`));
    assert.match(source, /<svg/);
    assert.doesNotMatch(source, /<rect[^>]+width="100%"/);
  }

  assert.match(css, /post-match-confetti-fall/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /max-width:\s*760px/);
});

test("Match form opens celebration only for new successful official finalisation", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");
  const client = readFileSync("lib/admin-match-write-client.ts", "utf8");
  const successIndex = form.indexOf("if (!finaliseResult.ok)");
  const celebrationIndex = form.indexOf("setPostMatchCelebration({");
  const refreshIndex = form.indexOf("router.refresh();", celebrationIndex);

  assert.match(form, /PostMatchCelebration/);
  assert.match(form, /postMatchCelebration/);
  assert.match(form, /!finaliseResult\.alreadyApplied/);
  assert.match(form, /finaliseResult\.celebration\?\.isEligibleOfficialMatch/);
  assert.match(form, /onDismiss=\{\(\) => setPostMatchCelebration\(null\)\}/);
  assert.ok(successIndex >= 0);
  assert.ok(celebrationIndex > successIndex);
  assert.ok(refreshIndex > celebrationIndex);
  assert.doesNotMatch(form, /window\.location\.href = `\/matches\/\$\{matchId\}`/);
  assert.match(client, /celebration\?: PostMatchCelebrationSummary/);
});

test("Celebration UI omits fake XP when progression snapshots are unavailable", () => {
  const component = readFileSync(
    "components/matches/PostMatchCelebration.tsx",
    "utf8"
  );

  assert.match(component, /const hasProgression = summary\.progressionChanges\.length > 0/);
  assert.match(component, /\{hasProgression \? \(/);
  assert.match(component, /\{hasProgression \? <b>\{formatSignedXP\(pom\.matchXP\)\}<\/b> : null\}/);
  assert.doesNotMatch(component, /\+0 XP/);
});

test("shared players and renamed display labels stay stable by player ID", () => {
  const current = match({
    id: "current",
    records: [
      record({ playerId: "jogindar", teamId: "teamA", runs: 7, awardedXP: 22 }),
      record({
        playerId: "jogindar",
        teamId: "teamB",
        runs: 3,
        playerOfMatch: true,
        awardedXP: 22
      })
    ]
  });
  const summary = buildPostMatchCelebrationSummary({
    match: current,
    historicalMatches: []
  });

  assert.equal(summary.playerOfMatch?.playerId, "jogindar");
  assert.equal(
    summary.personalBests.filter(
      (item) => item.playerId === "jogindar" && item.metric === "runs"
    ).length,
    1
  );
  assert.equal(
    summary.personalBests.find(
      (item) => item.playerId === "jogindar" && item.metric === "matchXP"
    )?.currentValue,
    22
  );
  assert.equal(summary.personalBests.some((item) => item.playerId === "jogi"), false);
});

test("current match is never included in its own historical record baseline", () => {
  const current = match({
    id: "current",
    matchDate: "2026-08-02",
    records: [record({ playerId: "aninda", runs: 30 })]
  });
  const summary = buildPostMatchCelebrationSummary({
    match: current,
    historicalMatches: [current]
  });

  assert.equal(summary.recordsBroken.find((item) => item.metric === "runs")?.status, "firstRecord");
  assert.equal(summary.personalBests.find((item) => item.metric === "runs")?.previousBest, null);
});
