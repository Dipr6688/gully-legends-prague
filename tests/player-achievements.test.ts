import assert from "node:assert/strict";
import test from "node:test";
import {
  ACHIEVEMENT_DEFINITIONS,
  getAchievementsUnlockedByMatch,
  getPlayerAchievements
} from "../lib/player-achievements";
import { createQuickScoringEvent } from "../lib/quick-scoring";
import type {
  FinalisedPlayerMatchRecord,
  MatchRecord,
  PlayerMatchXPBreakdown,
  QuickScoringEvent,
  QuickScoringMetadata,
  TeamId
} from "../lib/types/match";

function xpBreakdown(awardedXP = 20): PlayerMatchXPBreakdown {
  return {
    participationXP: 20,
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
  playerId = "aninda",
  teamId = "teamA",
  runs = 0,
  didBat = true,
  wickets = 0,
  catches = 0,
  runOuts = 0,
  stumpings = 0,
  hatTricks = 0,
  playerOfMatch = false,
  played = true,
  awardedXP = 20
}: {
  playerId?: string;
  teamId?: TeamId;
  runs?: number;
  didBat?: boolean;
  wickets?: number;
  catches?: number;
  runOuts?: number;
  stumpings?: number;
  hatTricks?: number;
  playerOfMatch?: boolean;
  played?: boolean;
  awardedXP?: number;
} = {}): FinalisedPlayerMatchRecord {
  return {
    playerId,
    teamId,
    representingTeamId: teamId,
    played,
    playerOfMatch,
    didBat,
    battingPosition: didBat ? 1 : null,
    runs: didBat ? runs : "",
    wasOut: false,
    wickets,
    hatTricks,
    catches,
    runOuts,
    stumpings,
    xpBreakdown: xpBreakdown(awardedXP),
    progressionAppliedAt: "2026-08-01T10:00:00.000Z"
  };
}

function event(
  sequence: number,
  overrides: Partial<Parameters<typeof createQuickScoringEvent>[0]> = {}
): QuickScoringEvent {
  return createQuickScoringEvent({
    sequence,
    battingTeamId: "teamA",
    strikerId: "aninda",
    nonStrikerId: "biplab",
    bowlerId: "arunabha",
    batterRuns: 0,
    extraType: null,
    wicket: null,
    timestamp: `2026-08-01T10:00:${String(sequence).padStart(2, "0")}.000Z`,
    ...overrides
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

function officialMatch({
  id,
  matchDate = "2026-08-01",
  matchNumber = 1,
  status = "finalised",
  isDemo = false,
  isDemoTestMatch = false,
  deletedAt = null,
  records = [record()],
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
    matchName: "Achievement Test",
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
      marginRuns: Math.max(1, teamARuns - teamBRuns)
    },
    finalisedPlayerRecords: records,
    progressionAppliedAt: `${matchDate}T12:00:00.000Z`,
    quickScoring: events.length > 0 ? quickScoring(events) : undefined
  };
}

function ids(unlocks: { definition: { id: string } }[]) {
  return unlocks.map((unlock) => unlock.definition.id);
}

function playerAchievements(matches: MatchRecord[], playerId = "aninda") {
  return getPlayerAchievements({
    player: { id: playerId },
    officialMatches: matches
  });
}

test("achievement registry exposes stable positive Phase 1 definitions", () => {
  assert.equal(ACHIEVEMENT_DEFINITIONS.some((item) => item.id === "career-runs-500"), true);
  assert.equal(ACHIEVEMENT_DEFINITIONS.some((item) => item.id === "special-half-century"), true);
  assert.equal(ACHIEVEMENT_DEFINITIONS.some((item) => item.title.includes("Duck")), false);
});

test("runs below threshold remain locked with progress", () => {
  const achievements = playerAchievements([
    officialMatch({ id: "m1", records: [record({ runs: 99 })] })
  ]);
  const runs100 = achievements.locked.find(
    (item) => item.definition.id === "career-runs-100"
  );

  assert.equal(ids(achievements.unlocked).includes("career-runs-100"), false);
  assert.equal(runs100?.currentValue, 99);
  assert.equal(runs100?.targetValue, 100);
});

test("exact career run threshold unlocks", () => {
  const achievements = playerAchievements([
    officialMatch({ id: "m1", records: [record({ runs: 100 })] })
  ]);

  assert.equal(ids(achievements.unlocked).includes("career-runs-100"), true);
});

test("multiple career run thresholds can unlock in one match", () => {
  const achievements = playerAchievements([
    officialMatch({ id: "m1", records: [record({ runs: 300 })] })
  ]);

  assert.equal(ids(achievements.unlocked).includes("career-runs-100"), true);
  assert.equal(ids(achievements.unlocked).includes("career-runs-250"), true);
});

test("wicket milestone unlocks from official bowler wickets", () => {
  const achievements = playerAchievements([
    officialMatch({ id: "m1", records: [record({ wickets: 10 })] })
  ]);

  assert.equal(ids(achievements.unlocked).includes("career-wickets-10"), true);
});

test("match milestone counts one official match per player", () => {
  const matches = Array.from({ length: 5 }, (_, index) =>
    officialMatch({
      id: `m${index + 1}`,
      matchDate: `2026-08-${String(index + 1).padStart(2, "0")}`,
      matchNumber: index + 1
    })
  );

  assert.equal(ids(playerAchievements(matches).unlocked).includes("career-matches-5"), true);
});

test("catch milestone unlocks from official catches", () => {
  const achievements = playerAchievements([
    officialMatch({ id: "m1", records: [record({ catches: 10 })] })
  ]);

  assert.equal(ids(achievements.unlocked).includes("career-catches-10"), true);
});

test("run-out milestone unlocks from official run-outs", () => {
  const achievements = playerAchievements([
    officialMatch({ id: "m1", records: [record({ runOuts: 5 })] })
  ]);

  assert.equal(ids(achievements.unlocked).includes("career-runOuts-5"), true);
});

test("stumping milestone unlocks when official career stumpings are stored", () => {
  const achievements = playerAchievements([
    officialMatch({ id: "m1", records: [record({ stumpings: 5 })] })
  ]);

  assert.equal(ids(achievements.unlocked).includes("career-stumpings-5"), true);
});

test("six milestone unlocks only from event-backed sixes", () => {
  const events = Array.from({ length: 10 }, (_, index) =>
    event(index + 1, { batterRuns: 6 })
  );
  const achievements = playerAchievements([
    officialMatch({ id: "m1", records: [record({ runs: 60 })], events })
  ]);

  assert.equal(ids(achievements.unlocked).includes("career-sixes-10"), true);
});

test("POM milestone counts only final official Player of the Match", () => {
  const achievements = playerAchievements([
    officialMatch({ id: "m1", records: [record({ playerOfMatch: true })] })
  ]);

  assert.equal(ids(achievements.unlocked).includes("career-pomAwards-1"), true);
});

test("highest unlocked milestone still exposes the next target progress", () => {
  const achievements = playerAchievements([
    officialMatch({ id: "m1", records: [record({ runs: 427 })] })
  ]);
  const nextRuns = achievements.nextMilestones.find(
    (item) => item.definition.metric === "runs"
  );

  assert.equal(ids(achievements.unlocked).includes("career-runs-250"), true);
  assert.equal(nextRuns?.definition.id, "career-runs-500");
  assert.equal(nextRuns?.currentValue, 427);
  assert.equal(nextRuns?.targetValue, 500);
});

test("half-century special achievement uses one official innings", () => {
  const achievements = playerAchievements([
    officialMatch({ id: "m1", records: [record({ runs: 50 })] })
  ]);

  assert.equal(ids(achievements.unlocked).includes("special-half-century"), true);
});

test("century special achievement uses one official innings", () => {
  const achievements = playerAchievements([
    officialMatch({ id: "m1", records: [record({ runs: 100 })] })
  ]);

  assert.equal(ids(achievements.unlocked).includes("special-century"), true);
});

test("hat-trick special achievement requires stored hat-trick evidence", () => {
  const achievements = playerAchievements([
    officialMatch({ id: "m1", records: [record({ wickets: 3, hatTricks: 1 })] })
  ]);

  assert.equal(ids(achievements.unlocked).includes("special-hat-trick"), true);
});

test("three-wicket match special achievement uses one-match wicket performance", () => {
  const achievements = playerAchievements([
    officialMatch({ id: "m1", records: [record({ wickets: 3 })] })
  ]);

  assert.equal(ids(achievements.unlocked).includes("special-three-wicket-match"), true);
});

test("five-wicket match special achievement uses one-match wicket performance", () => {
  const achievements = playerAchievements([
    officialMatch({ id: "m1", records: [record({ wickets: 5 })] })
  ]);

  assert.equal(ids(achievements.unlocked).includes("special-five-wicket-match"), true);
});

test("target match reports only newly crossed achievement thresholds", () => {
  const before = officialMatch({
    id: "before",
    matchDate: "2026-08-01",
    matchNumber: 1,
    records: [record({ runs: 90 })]
  });
  const target = officialMatch({
    id: "target",
    matchDate: "2026-08-02",
    matchNumber: 2,
    records: [record({ runs: 10 })]
  });

  assert.deepEqual(ids(getAchievementsUnlockedByMatch({ match: target, officialMatches: [before, target] })), [
    "career-runs-100"
  ]);
});

test("already unlocked achievement before target is not reported again", () => {
  const before = officialMatch({
    id: "before",
    matchDate: "2026-08-01",
    matchNumber: 1,
    records: [record({ runs: 100 })]
  });
  const target = officialMatch({
    id: "target",
    matchDate: "2026-08-02",
    matchNumber: 2,
    records: [record({ runs: 25 })]
  });

  assert.equal(
    ids(getAchievementsUnlockedByMatch({ match: target, officialMatches: [before, target] }))
      .includes("career-runs-100"),
    false
  );
});

test("multiple milestones can unlock in the same target match", () => {
  const target = officialMatch({
    id: "target",
    records: [record({ runs: 300, wickets: 10 })]
  });
  const unlocked = ids(getAchievementsUnlockedByMatch({ match: target, officialMatches: [target] }));

  assert.equal(unlocked.includes("career-runs-100"), true);
  assert.equal(unlocked.includes("career-runs-250"), true);
  assert.equal(unlocked.includes("career-wickets-10"), true);
});

test("historical target chronology uses same-day game number", () => {
  const target = officialMatch({
    id: "target",
    matchDate: "2026-08-03",
    matchNumber: 2,
    records: [record({ runs: 10 })]
  });
  const earlierSameDay = officialMatch({
    id: "earlier",
    matchDate: "2026-08-03",
    matchNumber: 1,
    records: [record({ runs: 90 })]
  });

  assert.equal(
    ids(getAchievementsUnlockedByMatch({
      match: target,
      officialMatches: [target, earlierSameDay]
    })).includes("career-runs-100"),
    true
  );
});

test("later matches never affect an earlier historical achievement replay", () => {
  const target = officialMatch({
    id: "target",
    matchDate: "2026-08-03",
    matchNumber: 1,
    records: [record({ runs: 10 })]
  });
  const later = officialMatch({
    id: "later",
    matchDate: "2026-08-03",
    matchNumber: 2,
    records: [record({ runs: 90 })]
  });

  assert.equal(
    ids(getAchievementsUnlockedByMatch({ match: target, officialMatches: [target, later] }))
      .includes("career-runs-100"),
    false
  );
});

test("Demo matches are excluded from achievement earning", () => {
  const demo = officialMatch({
    id: "demo",
    isDemo: true,
    records: [record({ runs: 100 })]
  });

  assert.equal(ids(playerAchievements([demo]).unlocked).includes("career-runs-100"), false);
});

test("cancelled matches are excluded from achievement earning", () => {
  const cancelled = officialMatch({
    id: "cancelled",
    status: "cancelled",
    records: [record({ runs: 100 })]
  });

  assert.equal(ids(playerAchievements([cancelled]).unlocked).includes("career-runs-100"), false);
});

test("draft and in-progress matches are excluded from achievement earning", () => {
  const draft = officialMatch({ id: "draft", status: "draft", records: [record({ runs: 100 })] });
  const live = officialMatch({
    id: "live",
    status: "in_progress",
    records: [record({ runs: 100 })]
  });

  assert.equal(ids(playerAchievements([draft, live]).unlocked).includes("career-runs-100"), false);
});

test("pending APK imports are excluded even if payload shape is finalised", () => {
  const pending = officialMatch({
    id: "apk-pending-review-1",
    records: [record({ runs: 100 })]
  });

  assert.equal(ids(playerAchievements([pending]).unlocked).includes("career-runs-100"), false);
});

test("deleted or rejected-like non-official matches are excluded", () => {
  const deleted = officialMatch({
    id: "deleted",
    deletedAt: "2026-08-01T12:00:00.000Z",
    records: [record({ runs: 100 })]
  });
  const noResult = {
    ...officialMatch({ id: "no-result", records: [record({ runs: 100 })] }),
    result: { type: "no_result" as const, reason: "Rejected import" }
  };

  assert.equal(ids(playerAchievements([deleted, noResult]).unlocked).includes("career-runs-100"), false);
});

test("POM None does not unlock POM achievement", () => {
  const achievements = playerAchievements([
    officialMatch({ id: "m1", records: [record({ playerOfMatch: false })] })
  ]);

  assert.equal(ids(achievements.unlocked).includes("career-pomAwards-1"), false);
});

test("APK preview POM is ignored until it becomes an official finalised record", () => {
  const pending = officialMatch({
    id: "apk-pending-preview",
    records: [record({ playerOfMatch: true })]
  });

  assert.equal(ids(playerAchievements([pending]).unlocked).includes("career-pomAwards-1"), false);
});

test("Shared Player is de-duplicated to one match and one POM award", () => {
  const matches = [
    ...Array.from({ length: 4 }, (_, index) =>
      officialMatch({
        id: `before-${index}`,
        matchDate: `2026-08-0${index + 1}`,
        matchNumber: index + 1,
        records: [record()]
      })
    ),
    officialMatch({
      id: "shared-target",
      matchDate: "2026-08-05",
      matchNumber: 5,
      records: [
        record({ playerId: "aninda", teamId: "teamA", runs: 12, playerOfMatch: true }),
        record({ playerId: "aninda", teamId: "teamB", runs: 8, playerOfMatch: true })
      ]
    })
  ];
  const achievements = playerAchievements(matches);

  assert.equal(ids(achievements.unlocked).includes("career-matches-5"), true);
  assert.equal(ids(achievements.unlocked).includes("career-pomAwards-1"), true);
  assert.equal(achievements.unlocked.filter((unlock) => unlock.playerId === "aninda").length > 0, true);
});

test("stable player IDs are preserved in unlock results", () => {
  const target = officialMatch({ id: "target", records: [record({ playerId: "jogindar", runs: 100 })] });
  const unlocks = getAchievementsUnlockedByMatch({
    match: target,
    officialMatches: [target]
  });

  assert.equal(unlocks.every((unlock) => unlock.playerId === "jogindar"), true);
});

test("missing legacy advanced data is unknown, not zero, for six milestones", () => {
  const achievements = playerAchievements([
    officialMatch({ id: "legacy", records: [record({ runs: 24 })] })
  ]);
  const sixProgress = achievements.locked.find(
    (item) => item.definition.id === "career-sixes-10"
  );

  assert.equal(ids(achievements.unlocked).includes("career-sixes-10"), false);
  assert.equal(sixProgress?.currentValue, null);
  assert.equal(sixProgress?.isReliable, false);
});

test("achievement calculation does not modify XP or progression data", () => {
  const sourceRecord = record({ runs: 100, awardedXP: 77 });
  const sourceMatch = officialMatch({ id: "m1", records: [sourceRecord] });
  const beforeXP = sourceRecord.xpBreakdown.awardedXP;

  playerAchievements([sourceMatch]);
  getAchievementsUnlockedByMatch({ match: sourceMatch, officialMatches: [sourceMatch] });

  assert.equal(sourceRecord.xpBreakdown.awardedXP, beforeXP);
  assert.equal(sourceMatch.progressionAppliedAt, "2026-08-01T12:00:00.000Z");
});
