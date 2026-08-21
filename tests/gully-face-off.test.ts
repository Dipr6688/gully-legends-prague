import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  buildGullyFaceOff,
  findFaceOffMetric,
  getOfficialGullyFaceOffMatches
} from "../lib/gully-face-off";
import { activePlayers } from "../lib/data/players";
import { createQuickScoringEvent } from "../lib/quick-scoring";
import type { PlayerCareerStats } from "../lib/career-store";
import type {
  FinalisedPlayerMatchRecord,
  MatchRecord,
  PlayerMatchXPBreakdown,
  QuickScoringEvent,
  QuickScoringMetadata,
  TeamId
} from "../lib/types/match";
import type { Player } from "../lib/types/player";

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
  played = true,
  didBat = true,
  runs = 0,
  wickets = 0,
  catches = 0,
  runOuts = 0,
  stumpings = 0,
  hatTricks = 0,
  playerOfMatch = false
}: {
  playerId?: string;
  teamId?: TeamId;
  played?: boolean;
  didBat?: boolean;
  runs?: number;
  wickets?: number;
  catches?: number;
  runOuts?: number;
  stumpings?: number;
  hatTricks?: number;
  playerOfMatch?: boolean;
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
    catches,
    runOuts,
    stumpings,
    hatTricks,
    xpBreakdown: xpBreakdown(),
    progressionAppliedAt: "2026-08-01T12:00:00.000Z"
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
    inningsAEvents: events.filter((item) => item.battingTeamId === "teamA"),
    inningsBEvents: events.filter((item) => item.battingTeamId === "teamB")
  };
}

function officialMatch({
  id = "face-off-match",
  matchDate = "2026-08-01",
  matchNumber = 1,
  status = "finalised",
  isDemo = false,
  isDemoTestMatch = false,
  deletedAt = null,
  records = [record()],
  events = [],
  result = { type: "tie" } as MatchRecord["result"]
}: {
  id?: string;
  matchDate?: string;
  matchNumber?: number | null;
  status?: MatchRecord["status"];
  isDemo?: boolean;
  isDemoTestMatch?: boolean;
  deletedAt?: string | null;
  records?: FinalisedPlayerMatchRecord[];
  events?: QuickScoringEvent[];
  result?: MatchRecord["result"];
} = {}): MatchRecord {
  const teamARecords = records.filter((item) => item.teamId === "teamA");
  const teamBRecords = records.filter((item) => item.teamId === "teamB");
  const firstEvents = events.filter((item) => item.battingTeamId === "teamA");
  const secondEvents = events.filter((item) => item.battingTeamId === "teamB");
  const firstLegalBalls = firstEvents.filter((item) => item.legalDelivery).length;
  const secondLegalBalls = secondEvents.filter((item) => item.legalDelivery).length;
  const teamARuns = teamARecords.reduce(
    (sum, item) => sum + (typeof item.runs === "number" ? item.runs : 0),
    0
  );
  const teamBRuns = teamBRecords.reduce(
    (sum, item) => sum + (typeof item.runs === "number" ? item.runs : 0),
    0
  );

  return {
    id,
    isDemo,
    isDemoTestMatch,
    matchDate,
    matchNumber,
    deletedAt,
    matchName: "Gully Face-Off Test",
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
        completedBowlingOvers: secondLegalBalls / 6
      },
      teamB: {
        teamId: "teamB",
        teamName: "Team B",
        playerIds: teamBRecords.map((item) => item.playerId),
        playerPerformances: teamBRecords,
        bowlingOvers: [],
        totalRuns: teamBRuns,
        completedBowlingOvers: firstLegalBalls / 6
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
        completedOvers: firstLegalBalls / 6,
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
        completedOvers: secondLegalBalls / 6,
        battingPerformances: teamBRecords,
        bowlingOvers: []
      }
    },
    result,
    finalisedPlayerRecords: records,
    progressionAppliedAt: `${matchDate}T12:00:00.000Z`,
    quickScoring: events.length > 0 ? quickScoring(events) : undefined
  };
}

function playersWithProgress(overrides: Record<string, Partial<Player>> = {}): Player[] {
  return activePlayers.map((player) => ({
    ...player,
    ...(overrides[player.id] ?? {})
  }));
}

function faceOff({
  matches,
  leftPlayerId = "aninda",
  rightPlayerId = "biplab",
  players = playersWithProgress(),
  careerStatsByPlayerId
}: {
  matches: MatchRecord[];
  leftPlayerId?: string;
  rightPlayerId?: string;
  players?: Player[];
  careerStatsByPlayerId?: Record<string, PlayerCareerStats | undefined>;
}) {
  return buildGullyFaceOff({
    players,
    matches,
    leftPlayerId,
    rightPlayerId,
    careerStatsByPlayerId
  });
}

function metricValue(matchup: ReturnType<typeof faceOff>, metricId: Parameters<typeof findFaceOffMetric>[1]) {
  const metric = findFaceOffMetric(matchup, metricId);

  assert.ok(metric, `Missing metric ${metricId}`);

  return metric;
}

function career(playerId: string, totalXP: number, level: number): PlayerCareerStats {
  return {
    playerId,
    matches: 0,
    inningsBatted: 0,
    runs: 0,
    fifties: 0,
    centuries: 0,
    dismissedDucks: 0,
    wickets: 0,
    catches: 0,
    runOuts: 0,
    stumpings: 0,
    hatTricks: 0,
    threeWicketHauls: 0,
    matchesBowled: 0,
    completedOvers: 0,
    totalRunsConceded: 0,
    totalXP,
    level
  };
}

test("Gully Face-Off compares career runs", () => {
  const matchup = faceOff({
    matches: [
      officialMatch({
        records: [
          record({ playerId: "aninda", runs: 42 }),
          record({ playerId: "biplab", runs: 27 })
        ]
      })
    ]
  });
  const runs = metricValue(matchup, "career-runs");

  assert.equal(runs.left.value, 42);
  assert.equal(runs.right.value, 27);
  assert.equal(runs.leader, "left");
});

test("Gully Face-Off keeps run ties as ties", () => {
  const matchup = faceOff({
    matches: [
      officialMatch({
        records: [
          record({ playerId: "aninda", runs: 31 }),
          record({ playerId: "biplab", runs: 31 })
        ]
      })
    ]
  });

  assert.equal(metricValue(matchup, "career-runs").leader, "tie");
});

test("Gully Face-Off exposes highest score from official innings", () => {
  const matchup = faceOff({
    matches: [
      officialMatch({ id: "m1", records: [record({ playerId: "aninda", runs: 22 })] }),
      officialMatch({ id: "m2", records: [record({ playerId: "aninda", runs: 61 })] }),
      officialMatch({ id: "m3", records: [record({ playerId: "biplab", runs: 45 })] })
    ]
  });

  assert.equal(metricValue(matchup, "highest-score").left.value, 61);
  assert.equal(metricValue(matchup, "highest-score").leader, "left");
});

test("Gully Face-Off compares wickets", () => {
  const matchup = faceOff({
    matches: [
      officialMatch({
        records: [
          record({ playerId: "aninda", wickets: 2 }),
          record({ playerId: "biplab", wickets: 4 })
        ]
      })
    ]
  });

  assert.equal(metricValue(matchup, "wickets").leader, "right");
});

test("Gully Face-Off compares catches", () => {
  const matchup = faceOff({
    matches: [
      officialMatch({
        records: [
          record({ playerId: "aninda", catches: 3 }),
          record({ playerId: "biplab", catches: 1 })
        ]
      })
    ]
  });

  assert.equal(metricValue(matchup, "catches").leader, "left");
});

test("Gully Face-Off compares run-outs", () => {
  const matchup = faceOff({
    matches: [
      officialMatch({
        records: [
          record({ playerId: "aninda", runOuts: 0 }),
          record({ playerId: "biplab", runOuts: 2 })
        ]
      })
    ]
  });

  assert.equal(metricValue(matchup, "run-outs").leader, "right");
});

test("Gully Face-Off compares stumpings", () => {
  const matchup = faceOff({
    matches: [
      officialMatch({
        records: [
          record({ playerId: "aninda", stumpings: 1 }),
          record({ playerId: "biplab", stumpings: 0 })
        ]
      })
    ]
  });

  assert.equal(metricValue(matchup, "stumpings").leader, "left");
});

test("Gully Face-Off counts official matches once per player", () => {
  const matchup = faceOff({
    matches: [
      officialMatch({ id: "m1", records: [record({ playerId: "aninda" })] }),
      officialMatch({ id: "m2", records: [record({ playerId: "aninda" })] }),
      officialMatch({ id: "m3", records: [record({ playerId: "biplab" })] })
    ]
  });

  assert.equal(metricValue(matchup, "matches").left.value, 2);
  assert.equal(metricValue(matchup, "matches").right.value, 1);
});

test("Gully Face-Off counts official Player of the Match awards only", () => {
  const matchup = faceOff({
    matches: [
      officialMatch({
        records: [
          record({ playerId: "aninda", playerOfMatch: true }),
          record({ playerId: "biplab" })
        ]
      })
    ]
  });

  assert.equal(metricValue(matchup, "pom-awards").left.value, 1);
  assert.equal(metricValue(matchup, "pom-awards").leader, "left");
});

test("Gully Face-Off reads authoritative XP without recalculating it", () => {
  const matchup = faceOff({
    players: playersWithProgress({
      aninda: { xp: 90 },
      biplab: { xp: 120 }
    }),
    matches: []
  });

  assert.equal(metricValue(matchup, "xp").right.value, 120);
  assert.equal(metricValue(matchup, "xp").leader, "right");
});

test("Gully Face-Off reads authoritative level from career state when supplied", () => {
  const matchup = faceOff({
    players: playersWithProgress({
      aninda: { level: 1, xp: 99 },
      biplab: { level: 1, xp: 99 }
    }),
    careerStatsByPlayerId: {
      aninda: career("aninda", 240, 2),
      biplab: career("biplab", 120, 1)
    },
    matches: []
  });

  assert.equal(matchup.left?.level, 2);
  assert.equal(metricValue(matchup, "level").leader, "left");
});

test("Gully Face-Off includes unlocked trophy count from the achievement engine", () => {
  const matchup = faceOff({
    matches: [
      officialMatch({
        records: [
          record({ playerId: "aninda", runs: 120 }),
          record({ playerId: "biplab", runs: 20 })
        ]
      })
    ]
  });
  const trophies = metricValue(matchup, "trophies");

  assert.equal((trophies.left.value ?? 0) > (trophies.right.value ?? 0), true);
  assert.equal(trophies.leader, "left");
});

test("Gully Face-Off compares tracked-only event-backed fours", () => {
  const legacy = officialMatch({
    id: "legacy-batting",
    records: [
      record({ playerId: "aninda", runs: 80 }),
      record({ playerId: "biplab", runs: 70 })
    ]
  });
  legacy.quickScoring = undefined;
  const matchup = faceOff({
    matches: [
      legacy,
      officialMatch({
        id: "tracked-batting",
        events: [
          event(1, { strikerId: "aninda", batterRuns: 4 }),
          event(2, { strikerId: "aninda", batterRuns: 4 }),
          event(3, { strikerId: "biplab", batterRuns: 4 })
        ],
        records: [
          record({ playerId: "aninda", runs: 8 }),
          record({ playerId: "biplab", runs: 4 })
        ]
      })
    ]
  });
  const fours = metricValue(matchup, "fours");

  assert.equal(fours.left.value, 2);
  assert.equal(fours.right.value, 1);
  assert.equal(fours.availability, "tracked-only");
  assert.equal(fours.leader, "left");
  assert.equal(fours.left.context?.trackedInnings, 1);
  assert.equal(fours.left.context?.innings, 2);
});

test("Gully Face-Off compares tracked-only event-backed sixes", () => {
  const matchup = faceOff({
    matches: [
      officialMatch({
        id: "legacy-six-history",
        records: [
          record({ playerId: "aninda", runs: 60 }),
          record({ playerId: "biplab", runs: 60 })
        ]
      }),
      officialMatch({
        id: "tracked-six-history",
        events: [
          event(1, { strikerId: "aninda", batterRuns: 6 }),
          event(2, { strikerId: "aninda", batterRuns: 6 }),
          event(3, { strikerId: "biplab", batterRuns: 6 })
        ],
        records: [
          record({ playerId: "aninda", runs: 12 }),
          record({ playerId: "biplab", runs: 6 })
        ]
      })
    ]
  });

  assert.equal(metricValue(matchup, "sixes").left.value, 2);
  assert.equal(metricValue(matchup, "sixes").availability, "tracked-only");
  assert.equal(metricValue(matchup, "sixes").leader, "left");
});

test("Gully Face-Off keeps event-backed metrics unavailable when a player has zero tracked data", () => {
  const legacy = officialMatch({
    records: [
      record({ playerId: "aninda", runs: 36 }),
      record({ playerId: "biplab", runs: 18 })
    ]
  });
  legacy.quickScoring = undefined;
  const matchup = faceOff({ matches: [legacy] });
  const sixes = metricValue(matchup, "sixes");

  assert.equal(sixes.availability, "unavailable");
  assert.equal(sixes.leader, "unavailable");
});

test("Gully Face-Off does not treat legacy event-backed gaps as zero", () => {
  const legacy = officialMatch({
    id: "legacy-not-zero",
    records: [
      record({ playerId: "aninda", runs: 66 }),
      record({ playerId: "biplab", runs: 6 })
    ]
  });
  legacy.quickScoring = undefined;
  const matchup = faceOff({
    matches: [
      legacy,
      officialMatch({
        id: "tracked-right-only",
        events: [
          event(1, { strikerId: "biplab", batterRuns: 6 }),
          event(2, { strikerId: "biplab", batterRuns: 6 })
        ],
        records: [
          record({ playerId: "aninda", didBat: false }),
          record({ playerId: "biplab", runs: 12 })
        ]
      })
    ]
  });
  const sixes = metricValue(matchup, "sixes");

  assert.equal(sixes.left.value, null);
  assert.equal(sixes.right.value, 2);
  assert.equal(sixes.leader, "unavailable");
});

test("Gully Face-Off compares tracked-only strike rate", () => {
  const events = [
    ...Array.from({ length: 20 }, (_, index) =>
      event(index + 1, {
        strikerId: "aninda",
        batterRuns: 2
      })
    ),
    ...Array.from({ length: 20 }, (_, index) =>
      event(index + 30, {
        strikerId: "biplab",
        batterRuns: 1
      })
    )
  ];
  const matchup = faceOff({
    matches: [
      officialMatch({
        id: "legacy-strike-rate",
        records: [
          record({ playerId: "aninda", runs: 100 }),
          record({ playerId: "biplab", runs: 100 })
        ]
      }),
      officialMatch({
        id: "tracked-strike-rate",
        events,
        records: [
          record({ playerId: "aninda", runs: 40 }),
          record({ playerId: "biplab", runs: 20 })
        ]
      })
    ]
  });

  assert.equal(metricValue(matchup, "strike-rate").availability, "tracked-only");
  assert.equal(metricValue(matchup, "strike-rate").leader, "left");
});

test("Gully Face-Off allows tracked-only comparison with unequal coverage", () => {
  const matchup = faceOff({
    matches: [
      officialMatch({
        id: "tracked-aninda-extra",
        events: [
          event(1, { strikerId: "aninda", batterRuns: 4 }),
          event(2, { strikerId: "aninda", batterRuns: 4 })
        ],
        records: [
          record({ playerId: "aninda", runs: 8 }),
          record({ playerId: "biplab", didBat: false })
        ]
      }),
      officialMatch({
        id: "tracked-both",
        events: [
          event(10, { strikerId: "aninda", batterRuns: 4 }),
          event(11, { strikerId: "biplab", batterRuns: 4 }),
          event(12, { strikerId: "biplab", batterRuns: 4 })
        ],
        records: [
          record({ playerId: "aninda", runs: 4 }),
          record({ playerId: "biplab", runs: 8 })
        ]
      })
    ]
  });
  const fours = metricValue(matchup, "fours");

  assert.equal(fours.left.context?.trackedInnings, 2);
  assert.equal(fours.right.context?.trackedInnings, 1);
  assert.equal(fours.leader, "left");
});

test("Gully Face-Off keeps strike rate unavailable below the existing threshold", () => {
  const matchup = faceOff({
    matches: [
      officialMatch({
        events: [
          event(1, { strikerId: "aninda", batterRuns: 6 }),
          event(2, { strikerId: "biplab", batterRuns: 4 })
        ],
        records: [
          record({ playerId: "aninda", runs: 6 }),
          record({ playerId: "biplab", runs: 4 })
        ]
      })
    ]
  });

  assert.equal(metricValue(matchup, "strike-rate").leader, "unavailable");
});

test("Gully Face-Off treats lower tracked-only bowling economy as better", () => {
  const anindaEvents = Array.from({ length: 18 }, (_, index) =>
    event(index + 1, {
      battingTeamId: "teamB",
      strikerId: "atripan",
      nonStrikerId: "arunabha",
      bowlerId: "aninda",
      batterRuns: 1
    })
  );
  const biplabEvents = Array.from({ length: 18 }, (_, index) =>
    event(index + 30, {
      battingTeamId: "teamB",
      strikerId: "atripan",
      nonStrikerId: "arunabha",
      bowlerId: "biplab",
      batterRuns: 2
    })
  );
  const matchup = faceOff({
    matches: [
      officialMatch({
        events: [...anindaEvents, ...biplabEvents],
        records: [
          record({ playerId: "aninda" }),
          record({ playerId: "biplab" })
        ]
      })
    ]
  });
  const economy = metricValue(matchup, "economy");

  assert.equal(economy.direction, "lower");
  assert.equal(economy.availability, "tracked-only");
  assert.equal(economy.leader, "left");
});

test("Gully Face-Off does not award economy edge when economy is unavailable", () => {
  const matchup = faceOff({
    matches: [
      officialMatch({
        events: [
          event(1, {
            battingTeamId: "teamB",
            strikerId: "atripan",
            nonStrikerId: "arunabha",
            bowlerId: "aninda",
            batterRuns: 0
          })
        ],
        records: [
          record({ playerId: "aninda" }),
          record({ playerId: "biplab" })
        ]
      })
    ]
  });

  assert.equal(metricValue(matchup, "economy").leader, "unavailable");
});

test("Gully Face-Off does not duplicate Shared Player match identity", () => {
  const matchup = faceOff({
    matches: [
      officialMatch({
        records: [
          record({ playerId: "aninda", teamId: "teamA", runs: 12 }),
          record({ playerId: "aninda", teamId: "teamB", runs: 8 }),
          record({ playerId: "biplab", runs: 5 })
        ]
      })
    ]
  });

  assert.equal(metricValue(matchup, "matches").left.value, 1);
  assert.equal(metricValue(matchup, "career-runs").left.value, 20);
});

test("Gully Face-Off excludes Demo matches", () => {
  const matchup = faceOff({
    matches: [
      officialMatch({
        isDemo: true,
        records: [record({ playerId: "aninda", runs: 99 })]
      })
    ]
  });

  assert.equal(metricValue(matchup, "career-runs").left.value, 0);
});

test("Gully Face-Off excludes cancelled and unfinished matches", () => {
  const matchup = faceOff({
    matches: [
      officialMatch({
        id: "cancelled",
        status: "cancelled",
        records: [record({ playerId: "aninda", runs: 99 })]
      }),
      officialMatch({
        id: "draft",
        status: "draft",
        records: [record({ playerId: "aninda", runs: 99 })]
      })
    ]
  });

  assert.equal(metricValue(matchup, "career-runs").left.value, 0);
});

test("Gully Face-Off excludes APK pending imports", () => {
  const matchup = faceOff({
    matches: [
      officialMatch({
        id: "apk-pending-123",
        records: [record({ playerId: "aninda", runs: 99 })]
      })
    ]
  });

  assert.equal(metricValue(matchup, "career-runs").left.value, 0);
});

test("Gully Face-Off excludes rejected-like deleted APK imports", () => {
  const matchup = faceOff({
    matches: [
      officialMatch({
        id: "apk-rejected-123",
        deletedAt: "2026-08-02T10:00:00.000Z",
        records: [record({ playerId: "aninda", runs: 99 })]
      })
    ]
  });

  assert.equal(metricValue(matchup, "career-runs").left.value, 0);
});

test("Gully Face-Off counts final official POM only", () => {
  const matchup = faceOff({
    matches: [
      officialMatch({
        id: "official",
        records: [record({ playerId: "aninda", playerOfMatch: true })]
      }),
      officialMatch({
        id: "apk-pending-pom",
        records: [record({ playerId: "biplab", playerOfMatch: true })]
      })
    ]
  });

  assert.equal(metricValue(matchup, "pom-awards").left.value, 1);
  assert.equal(metricValue(matchup, "pom-awards").right.value, 0);
});

test("Gully Face-Off rejects same-player matchups", () => {
  const matchup = faceOff({
    matches: [],
    leftPlayerId: "dipanjan",
    rightPlayerId: "dipanjan"
  });

  assert.deepEqual(matchup.availability, {
    status: "invalid",
    reason: "same_player",
    playerIds: ["dipanjan", "dipanjan"]
  });
  assert.deepEqual(matchup.sections, []);
});

test("Gully Face-Off preserves stable player IDs in presentation data", () => {
  const matchup = faceOff({
    matches: [],
    leftPlayerId: "jogindar",
    rightPlayerId: "naim"
  });

  assert.equal(matchup.left?.id, "jogindar");
  assert.equal(matchup.left?.name, "Jogi");
  assert.equal(matchup.right?.id, "naim");
  assert.equal(matchup.right?.name, "Naeem");
});

test("Gully Face-Off exposes no overall weighted winner", () => {
  const matchup = faceOff({
    matches: [
      officialMatch({
        records: [
          record({ playerId: "aninda", runs: 50, catches: 1 }),
          record({ playerId: "biplab", runs: 10, wickets: 3 })
        ]
      })
    ]
  });

  assert.equal(matchup.hasOverallWinner, false);
  assert.equal("overallScore" in matchup, false);
});

test("Gully Face-Off has zero dependency on private Team Balance inputs", () => {
  const source = readFileSync("lib/gully-face-off.ts", "utf8");

  assert.doesNotMatch(source, /team-balance/i);
  assert.doesNotMatch(source, /private-team-balance/i);
  assert.doesNotMatch(source, /balanceWeights|pairRules|strength/i);
});

test("Gully Face-Off domain performs no Supabase or browser writes", () => {
  const source = readFileSync("lib/gully-face-off.ts", "utf8");

  assert.doesNotMatch(source, /supabase/i);
  assert.doesNotMatch(source, /localStorage/i);
  assert.doesNotMatch(source, /\bfetch\b/);
  assert.doesNotMatch(source, /\bsave[A-Z]/);
});

test("Gully Face-Off is read-only for supplied match data", () => {
  const matches = [
    officialMatch({
      records: [
        record({ playerId: "aninda", runs: 42 }),
        record({ playerId: "biplab", runs: 27 })
      ]
    })
  ];
  const before = JSON.stringify(matches);

  buildGullyFaceOff({
    players: activePlayers,
    matches,
    leftPlayerId: "aninda",
    rightPlayerId: "biplab"
  });

  assert.equal(JSON.stringify(matches), before);
});

test("Gully Face-Off official history uses approved chronology and filters", () => {
  const matches = [
    officialMatch({ id: "late", matchDate: "2026-08-02", matchNumber: 2 }),
    officialMatch({ id: "demo", matchDate: "2026-08-01", isDemoTestMatch: true }),
    officialMatch({ id: "early", matchDate: "2026-08-01", matchNumber: 1 })
  ];
  const official = getOfficialGullyFaceOffMatches(matches);

  assert.deepEqual(official.map((match) => match.id), ["early", "late"]);
});

test("/face-off page exists and loads public read-only data", () => {
  const pageSource = readFileSync("app/face-off/page.tsx", "utf8");

  assert.match(pageSource, /GullyFaceOffArena/);
  assert.match(pageSource, /loadPublicSupabaseReadData/);
  assert.match(pageSource, /activePlayers/);
  assert.match(pageSource, /dynamic = "force-dynamic"/);
});

test("Gully Face-Off is added to shared navigation without renaming route state", () => {
  const navigationSource = readFileSync("lib/data/navigation.ts", "utf8");

  assert.match(navigationSource, /label: "FACE-OFF"/);
  assert.match(navigationSource, /href: "\/face-off"/);
  assert.match(navigationSource, /activePrefixes: \["\/face-off"\]/);
});

test("Gully Face-Off UI uses branding selectors and an empty arena state", () => {
  const source = readFileSync("components/face-off/GullyFaceOffArena.tsx", "utf8");

  assert.match(source, /GULLY FACE-OFF/);
  assert.match(source, /TWO PLAYERS\. ONE STAT BATTLE\./);
  assert.match(source, /Player A/);
  assert.match(source, /Player B/);
  assert.match(source, /<select/);
  assert.match(source, /Choose warrior/);
  assert.match(source, /Choose your contenders/);
});

test("Gully Face-Off UI prevents same-player display and supports URL state", () => {
  const source = readFileSync("components/face-off/GullyFaceOffArena.tsx", "utf8");

  assert.match(source, /useSearchParams/);
  assert.match(source, /params\.set\(side, playerId\)/);
  assert.match(source, /hasSamePlayer/);
  assert.match(source, /Choose two different warriors/);
  assert.match(source, /player cannot face themselves/i);
});

test("Gully Face-Off hero renders player artwork title name role and level", () => {
  const source = readFileSync("components/face-off/GullyFaceOffArena.tsx", "utf8");

  assert.match(source, /player\.cardImage/);
  assert.match(source, /player\.cardTitle/);
  assert.match(source, /player\.name/);
  assert.match(source, /player\.role/);
  assert.match(source, /Level \{player\.level\}/);
  assert.match(source, /face-off-vs-emblem/);
});

test("Gully Face-Off UI renders the four authoritative battle sections", () => {
  const domainSource = readFileSync("lib/gully-face-off.ts", "utf8");
  const componentSource = readFileSync("components/face-off/GullyFaceOffArena.tsx", "utf8");

  assert.match(domainSource, /Batting Battle/);
  assert.match(domainSource, /Bowling Battle/);
  assert.match(domainSource, /Fielding Battle/);
  assert.match(domainSource, /Career & Glory/);
  assert.match(componentSource, /readyFaceOff\.sections\.map/);
  assert.match(componentSource, /FaceOffSectionCard/);
});

test("Gully Face-Off UI treats metric leaders ties and unavailable data distinctly", () => {
  const source = readFileSync("components/face-off/GullyFaceOffArena.tsx", "utf8");
  const css = readFileSync("app/globals.css", "utf8");

  assert.match(source, /data-leader=\{metric\.leader\}/);
  assert.match(source, /← \$\{leftName\} leads/);
  assert.match(source, /\$\{rightName\} leads →/);
  assert.match(source, /⚡ \$\{leftName\} edge/);
  assert.match(source, /⚡ \$\{rightName\} edge/);
  assert.match(source, /Even battle/);
  assert.doesNotMatch(source, /No fair comparison/);
  assert.match(source, /Full tracking required/);
  assert.match(css, /data-leader="left"/);
  assert.match(css, /data-leader="right"/);
  assert.match(css, /data-leader="tie"/);
  assert.match(css, /data-availability="tracked-only"/);
  assert.match(css, /data-availability="unavailable"/);
  assert.match(css, /face-off-metric-row\[data-leader="left"\] \.face-off-metric-center span/);
  assert.match(css, /face-off-battle-section\[data-edge="tie"\] \.face-off-section-heading strong/);
});

test("Gully Face-Off UI explains advanced data reliability without fabricating zeros", () => {
  const source = readFileSync("components/face-off/GullyFaceOffArena.tsx", "utf8");

  assert.match(source, /Tracked only/);
  assert.match(source, /\$\{tracked\} \/ \$\{innings\} innings/);
  assert.match(source, /Tracked innings only/);
  assert.match(source, /No usable tracked data/);
  assert.match(source, /Minimum/);
  assert.match(source, /tracked balls/);
  assert.match(source, /legal balls/);
  assert.match(source, /value\.availability === "reliable"/);
  assert.match(source, /value\.availability === "tracked-only"/);
  assert.doesNotMatch(source, /"PARTIAL"/);
});

test("Gully Face-Off VS emblem uses the dedicated artwork asset", () => {
  const source = readFileSync("components/face-off/GullyFaceOffArena.tsx", "utf8");
  const css = readFileSync("app/globals.css", "utf8");

  assert.equal(existsSync("public/ui/face-off/gully-face-off-vs.png"), true);
  assert.match(source, /\/ui\/face-off\/gully-face-off-vs\.png/);
  assert.match(source, /face-off-vs-image/);
  assert.doesNotMatch(source, /<span>VS<\/span>/);
  assert.doesNotMatch(css, /vs-optical/);
  assert.doesNotMatch(css, /face-off-vs-emblem::before/);
  assert.doesNotMatch(css, /face-off-vs-emblem::after/);
  assert.doesNotMatch(css, /face-off-vs-pulse/);
});

test("Gully Face-Off UI exposes POM XP Level and trophy metrics without an overall winner", () => {
  const domainSource = readFileSync("lib/gully-face-off.ts", "utf8");
  const componentSource = readFileSync("components/face-off/GullyFaceOffArena.tsx", "utf8");

  assert.match(domainSource, /Official POM Awards/);
  assert.match(domainSource, /label: "XP"/);
  assert.match(domainSource, /label: "Level"/);
  assert.match(domainSource, /label: "Trophies"/);
  assert.doesNotMatch(componentSource, /Better Player/);
  assert.doesNotMatch(componentSource, /Overall Winner/);
  assert.doesNotMatch(componentSource, /Final Score/);
});

test("Gully Face-Off page remains isolated from private balance and write APIs", () => {
  const componentSource = readFileSync("components/face-off/GullyFaceOffArena.tsx", "utf8");
  const pageSource = readFileSync("app/face-off/page.tsx", "utf8");

  assert.doesNotMatch(componentSource, /team-balance/i);
  assert.doesNotMatch(componentSource, /private-team-balance/i);
  assert.doesNotMatch(componentSource, /balanceWeights|pairRules|strength/i);
  assert.doesNotMatch(componentSource, /\bfetch\b/);
  assert.doesNotMatch(pageSource, /api\/admin|finalize|insert|update|delete/i);
});

test("Gully Face-Off CSS includes mobile responsive arena rules", () => {
  const css = readFileSync("app/globals.css", "utf8");

  assert.match(css, /face-off-page/);
  assert.match(css, /face-off-matchup-hero/);
  assert.match(css, /face-off-metric-row/);
  assert.match(css, /face-off-battle-grid \{\r?\n  display: grid;\r?\n  grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);\r?\n  align-items: start;/);
  assert.match(css, /face-off-battle-section \{\r?\n  display: grid;\r?\n  align-content: start;\r?\n  align-self: start;/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /grid-template-columns: 1fr/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /prefers-reduced-motion/);
});
