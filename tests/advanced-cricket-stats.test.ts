import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ADVANCED_CRICKET_STAT_RULES,
  calculateBattingStrikeRate,
  calculateBowlingEconomy,
  deriveAdvancedCareerStatsByPlayer,
  deriveAdvancedInningsStats,
  formatEconomy,
  formatStrikeRate
} from "../lib/advanced-cricket-stats";
import { activePlayers, getPlayerById } from "../lib/data/players";
import {
  getLeaderboardEntries,
  getLeaderboardSummary
} from "../lib/leaderboard";
import {
  buildPlayerPerformanceTrends,
  calculateTrackedBowlingStrikeRate,
  formatBowlingStrikeRate
} from "../lib/analytics/player-performance-trends";
import { buildScorecardInnings } from "../lib/match-scorecard";
import { createQuickScoringEvent, undoLastQuickScoringEvent } from "../lib/quick-scoring";
import type {
  MatchRecord,
  PlayerMatchPerformance,
  QuickScoringEvent,
  QuickScoringMetadata,
  TeamId
} from "../lib/types/match";

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
    timestamp: `2026-08-16T10:00:${String(sequence).padStart(2, "0")}.000Z`,
    ...overrides
  });
}

function eventsFor({
  batterId,
  bowlerId,
  count,
  runsPerBall = 0,
  startSequence = 1
}: {
  batterId: string;
  bowlerId: string;
  count: number;
  runsPerBall?: number;
  startSequence?: number;
}) {
  return Array.from({ length: count }, (_, index) =>
    event(startSequence + index, {
      strikerId: batterId,
      nonStrikerId: batterId === "aninda" ? "biplab" : "aninda",
      bowlerId,
      batterRuns: runsPerBall
    })
  );
}

function performance({
  playerId,
  teamId = "teamA",
  didBat = true,
  runs = 0,
  wasOut = false
}: {
  playerId: string;
  teamId?: TeamId;
  didBat?: boolean;
  runs?: number;
  wasOut?: boolean;
}): PlayerMatchPerformance {
  return {
    playerId,
    teamId,
    representingTeamId: teamId,
    played: true,
    playerOfMatch: false,
    didBat,
    runs,
    wasOut,
    wickets: 0,
    hatTricks: 0,
    catches: 0,
    runOuts: 0,
    stumpings: 0
  };
}

function quickScoringMetadata(events: QuickScoringEvent[]): QuickScoringMetadata {
  return {
    version: 2,
    setupLocked: true,
    battingMode: "two_batter",
    inningsPhase: "second_innings",
    inningsAEvents: events,
    inningsBEvents: []
  };
}

function matchRecord({
  id = "advanced-match",
  events = [],
  performances = [
    performance({ playerId: "aninda", runs: 0 }),
    performance({ playerId: "biplab", runs: 0 }),
    performance({ playerId: "arunabha", teamId: "teamB", didBat: false })
  ],
  status = "finalised"
}: {
  id?: string;
  events?: QuickScoringEvent[];
  performances?: PlayerMatchPerformance[];
  status?: MatchRecord["status"];
}): MatchRecord {
  const teamAPerformances = performances.filter((item) => item.teamId === "teamA");
  const teamBPerformances = performances.filter((item) => item.teamId === "teamB");
  const runs = events.reduce((total, item) => total + item.batterRuns + item.extras, 0);
  const legalBalls = events.filter((item) => item.legalDelivery).length;

  return {
    id,
    matchDate: "2026-08-16",
    matchName: "Advanced Stats Match",
    venue: "CZU Gully Arena",
    status,
    scheduledOversPerInnings: 4,
    battingFirstTeamId: "teamA",
    chasingTeamId: "teamB",
    teams: {
      teamA: {
        teamId: "teamA",
        teamName: "Team A",
        playerIds: teamAPerformances.map((item) => item.playerId),
        playerPerformances: teamAPerformances,
        bowlingOvers: [],
        totalRuns: runs,
        completedBowlingOvers: 0
      },
      teamB: {
        teamId: "teamB",
        teamName: "Team B",
        playerIds: teamBPerformances.map((item) => item.playerId),
        playerPerformances: teamBPerformances,
        bowlingOvers: [],
        totalRuns: 0,
        completedBowlingOvers: legalBalls / 6
      }
    },
    innings: {
      first: {
        battingTeamId: "teamA",
        bowlingTeamId: "teamB",
        runs,
        wicketsLost: performances.filter((item) => item.wasOut).length,
        extras: events.reduce((total, item) => total + item.extras, 0),
        playerCount: teamAPerformances.length,
        completedOvers: legalBalls / 6,
        battingPerformances: teamAPerformances,
        bowlingOvers: []
      },
      second: {
        battingTeamId: "teamB",
        bowlingTeamId: "teamA",
        runs: 0,
        wicketsLost: 0,
        extras: 0,
        playerCount: teamBPerformances.length,
        completedOvers: 0,
        battingPerformances: teamBPerformances,
        bowlingOvers: []
      }
    },
    result: { type: "tie" },
    finalisedPlayerRecords: performances.map((item) => ({
      ...item,
      xpBreakdown: {
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
        rawTotalXP: 0,
        awardedXP: 0
      }
    })),
    progressionAppliedAt: "2026-08-16T12:00:00.000Z",
    quickScoring: quickScoringMetadata(events)
  };
}

test("Balls faced follows legal, wide, no-ball, wicket, run-out and undo rules", () => {
  const deliveryEvents = [
    event(1),
    event(2, { batterRuns: 4 }),
    event(3, { extraType: "wide" }),
    event(4, { batterRuns: 1, extraType: "no_ball", extras: 1 }),
    event(5, {
      wicket: {
        type: "caught",
        dismissedPlayerId: "aninda",
        fielderId: "biplab",
        newBatterId: "atripan",
        completedRuns: 0
      }
    }),
    event(6, {
      strikerId: "atripan",
      nonStrikerId: "biplab",
      wicket: {
        type: "run_out",
        dismissedPlayerId: "biplab",
        fielderId: "arunabha",
        newBatterId: "dipanjan",
        completedRuns: 1
      }
    })
  ];
  const derived = deriveAdvancedInningsStats({
    battingTeamId: "teamA",
    bowlingTeamId: "teamB",
    events: deliveryEvents
  });
  const aninda = derived.battingByPlayer.get("aninda");
  const atripan = derived.battingByPlayer.get("atripan");
  const bowler = derived.bowlingByPlayer.get("arunabha");
  const undone = undoLastQuickScoringEvent(
    quickScoringMetadata(deliveryEvents),
    "teamA"
  );
  const afterUndo = deriveAdvancedInningsStats({
    battingTeamId: "teamA",
    bowlingTeamId: "teamB",
    events: undone.inningsAEvents
  });

  assert.equal(aninda?.ballsFaced, 4);
  assert.equal(aninda?.runs, 5);
  assert.equal(atripan?.ballsFaced, 1);
  assert.equal(bowler?.legalBalls, 4);
  assert.equal(afterUndo.battingByPlayer.get("atripan")?.ballsFaced ?? 0, 0);
  assert.equal(afterUndo.bowlingByPlayer.get("arunabha")?.legalBalls, 3);
});

test("Boundary counts come from batter runs including no-ball boundaries", () => {
  const deliveryEvents = [
    event(1, { batterRuns: 4 }),
    event(2, { batterRuns: 6 }),
    event(3, { extraType: "wide", extras: 5, batterRuns: 0 }),
    event(4, { extraType: "no_ball", extras: 1, batterRuns: 0 }),
    event(5, { extraType: "no_ball", extras: 1, batterRuns: 4 }),
    event(6, { extraType: "no_ball", extras: 1, batterRuns: 6 })
  ];
  const derived = deriveAdvancedInningsStats({
    battingTeamId: "teamA",
    bowlingTeamId: "teamB",
    events: deliveryEvents
  });
  const batter = derived.battingByPlayer.get("aninda");
  const undoFour = deriveAdvancedInningsStats({
    battingTeamId: "teamA",
    bowlingTeamId: "teamB",
    events: undoLastQuickScoringEvent(
      quickScoringMetadata([event(1, { batterRuns: 4 })]),
      "teamA"
    ).inningsAEvents
  });
  const undoSix = deriveAdvancedInningsStats({
    battingTeamId: "teamA",
    bowlingTeamId: "teamB",
    events: undoLastQuickScoringEvent(
      quickScoringMetadata([event(1, { batterRuns: 6 })]),
      "teamA"
    ).inningsAEvents
  });

  assert.equal(batter?.fours, 2);
  assert.equal(batter?.sixes, 2);
  assert.equal(undoFour.battingByPlayer.get("aninda")?.fours ?? 0, 0);
  assert.equal(undoSix.battingByPlayer.get("aninda")?.sixes ?? 0, 0);
});

test("Strike rate and economy formatting use shared exact formulas", () => {
  assert.equal(calculateBattingStrikeRate({ runs: 31, ballsFaced: 17 }), 3100 / 17);
  assert.equal(formatStrikeRate(3100 / 17), "182.4");
  assert.equal(formatStrikeRate(calculateBattingStrikeRate({ runs: 0, ballsFaced: 5 })), "0.0");
  assert.equal(calculateBattingStrikeRate({ runs: 6, ballsFaced: 0 }), null);
  assert.equal(formatStrikeRate(null), "-");
  assert.equal(calculateBowlingEconomy({ runsConceded: 15, legalBalls: 11 }), 90 / 11);
  assert.equal(formatEconomy(90 / 11), "8.18");
  assert.notEqual(formatEconomy(90 / 11), "10.00");
  assert.equal(formatEconomy(calculateBowlingEconomy({ runsConceded: 0, legalBalls: 0 })), "-");
});

test("Tracked bowling strike rate uses legal balls per credited wicket", () => {
  assert.equal(calculateTrackedBowlingStrikeRate({ legalBalls: 18, wickets: 3 }), 6);
  assert.equal(calculateTrackedBowlingStrikeRate({ legalBalls: 18, wickets: 0 }), null);
  assert.equal(formatBowlingStrikeRate(6), "6.00");
  assert.equal(formatBowlingStrikeRate(null), "-");
});

test("Player performance trends derive official score, average, tracked rate, economy and bowling strike rate", () => {
  const matchA = matchRecord({
    id: "trend-a",
    events: [
      ...eventsFor({
        batterId: "aninda",
        bowlerId: "arunabha",
        count: 5,
        runsPerBall: 2
      }),
      ...Array.from({ length: 6 }, (_, index) =>
        event(6 + index, {
          battingTeamId: "teamB",
          strikerId: "arunabha",
          nonStrikerId: "biplab",
          bowlerId: "aninda",
          wicket:
            index === 5
              ? {
                  type: "bowled",
                  dismissedPlayerId: "arunabha",
                  fielderId: null,
                  newBatterId: "biplab",
                  completedRuns: 0
                }
              : null
        })
      )
    ],
    performances: [
      performance({ playerId: "aninda", runs: 10, wasOut: true }),
      performance({ playerId: "arunabha", teamId: "teamB", didBat: true, runs: 0, wasOut: true })
    ]
  });
  const matchB = matchRecord({
    id: "trend-b",
    events: [
      ...eventsFor({
        batterId: "aninda",
        bowlerId: "arunabha",
        count: 4,
        runsPerBall: 3
      }),
      ...Array.from({ length: 6 }, (_, index) =>
        event(20 + index, {
          battingTeamId: "teamB",
          strikerId: "arunabha",
          nonStrikerId: "biplab",
          bowlerId: "aninda"
        })
      )
    ],
    performances: [
      performance({ playerId: "aninda", runs: 12, wasOut: false }),
      performance({ playerId: "arunabha", teamId: "teamB", didBat: true, runs: 0 })
    ]
  });
  const runOutOnly = matchRecord({
    id: "trend-run-out",
    events: [
      event(1, {
        battingTeamId: "teamB",
        strikerId: "arunabha",
        nonStrikerId: "biplab",
        bowlerId: "aninda",
        wicket: {
          type: "run_out",
          dismissedPlayerId: "biplab",
          fielderId: "aninda",
          newBatterId: "atripan",
          completedRuns: 1
        }
      })
    ],
    performances: [
      performance({ playerId: "aninda", didBat: false }),
      performance({ playerId: "arunabha", teamId: "teamB", didBat: true, runs: 1 })
    ]
  });
  matchA.matchNumber = 1;
  matchB.matchNumber = 2;
  runOutOnly.matchNumber = 3;

  const trends = buildPlayerPerformanceTrends({
    matches: [matchB, runOutOnly, matchA],
    playerId: "aninda"
  });

  assert.deepEqual(
    trends.series.score.points.map((point) => point.displayValue),
    ["10", "12*"]
  );
  assert.deepEqual(
    trends.series.score.points.map((point) => point.label),
    ["G1", "G2"]
  );
  assert.equal(trends.series.score.axisLabel, "Runs");
  assert.equal(trends.series.battingAverage.axisLabel, "Batting Average");
  assert.equal(trends.series.battingStrikeRate.axisLabel, "Strike Rate");
  assert.equal(trends.series.economy.axisLabel, "Economy");
  assert.equal(trends.series.bowlingStrikeRate.axisLabel, "Bowling Strike Rate");
  assert.equal(trends.series.score.points[0].gameLabel, "G1");
  assert.equal(trends.series.score.points[0].shortDateLabel, "16 Aug");
  assert.equal(trends.series.score.points[0].fullDateLabel, "16 Aug 2026");
  assert.equal(
    trends.series.score.points[0].detailRows.some((row) => row.label === "Balls"),
    true
  );
  assert.equal(trends.battingAverageDisplay, "22.00");
  assert.deepEqual(
    trends.series.battingStrikeRate.points.map((point) => point.displayValue),
    ["200.0", "244.4"]
  );
  assert.equal(
    trends.series.battingStrikeRate.points.at(-1)?.detailRows.find(
      (row) => row.label === "Innings SR"
    )?.value,
    "300.0"
  );
  assert.equal(
    trends.series.battingStrikeRate.points.at(-1)?.detailRows.find(
      (row) => row.label === "Tracked career SR after match"
    )?.value,
    "244.4"
  );
  assert.equal(trends.series.economy.points.at(-1)?.displayValue, "0.00");
  assert.equal(trends.trackedBowlingStrikeRateDisplay, "13.00");
  assert.equal(
    trends.series.bowlingStrikeRate.points.at(-1)?.detail,
    "Tracked career bowling SR after match: 13.00"
  );
});

test("Player performance trends use official game labels without ordinary suffixes", () => {
  const first = matchRecord({
    id: "same-number-first",
    performances: [
      performance({ playerId: "aninda", runs: 8, wasOut: true }),
      performance({ playerId: "arunabha", teamId: "teamB", didBat: false })
    ]
  });
  const second = matchRecord({
    id: "same-number-second",
    performances: [
      performance({ playerId: "aninda", runs: 18, wasOut: true }),
      performance({ playerId: "arunabha", teamId: "teamB", didBat: false })
    ]
  });

  first.matchDate = "2026-08-17";
  first.matchNumber = 3;
  second.matchDate = "2026-08-24";
  second.matchNumber = 3;

  const trends = buildPlayerPerformanceTrends({
    matches: [second, first],
    playerId: "aninda"
  });

  assert.deepEqual(
    trends.series.score.points.map((point) => point.label),
    ["G3", "G3"]
  );
  assert.deepEqual(
    trends.series.score.points.map((point) => point.shortDateLabel),
    ["17 Aug", "24 Aug"]
  );
  assert.equal(
    trends.series.score.points.some((point) => /-[A-Z]$/.test(point.label)),
    false
  );
});

test("Player performance trends exclude demos, legacy tracked gaps and keep last ten points", () => {
  const matches = Array.from({ length: 12 }, (_, index) => {
    const match = matchRecord({
      id: `trend-many-${index + 1}`,
      events: eventsFor({
        batterId: "aninda",
        bowlerId: "arunabha",
        count: 1,
        runsPerBall: index + 1
      }),
      performances: [
        performance({
          playerId: "aninda",
          runs: index + 1,
          wasOut: index % 2 === 0
        }),
        performance({ playerId: "arunabha", teamId: "teamB", didBat: false })
      ]
    });

    match.matchNumber = index + 1;

    return match;
  });
  const demo = matchRecord({
    id: "trend-demo",
    events: eventsFor({
      batterId: "aninda",
      bowlerId: "arunabha",
      count: 1,
      runsPerBall: 99
    }),
    performances: [performance({ playerId: "aninda", runs: 99 })]
  });
  const legacy = matchRecord({
    id: "trend-legacy",
    events: [],
    performances: [performance({ playerId: "aninda", runs: 40 })]
  });
  demo.isDemo = true;
  legacy.quickScoring = undefined;

  const trends = buildPlayerPerformanceTrends({
    matches: [...matches, demo, legacy],
    playerId: "aninda"
  });

  assert.equal(trends.series.score.points.length, 10);
  assert.equal(trends.series.score.points[0].label, "G3");
  assert.equal(trends.series.score.points.at(-1)?.label, "G12");
  assert.equal(
    trends.series.battingStrikeRate.points.some((point) => point.displayValue === "9900.0"),
    false
  );
  assert.equal(
    trends.series.battingStrikeRate.points.some((point) => point.displayValue === "4000.0"),
    false
  );
});

test("Player performance trends preserve shared-player innings separately", () => {
  const sharedMatch = matchRecord({
    id: "shared-trend",
    events: [],
    performances: [
      performance({ playerId: "aninda", teamId: "teamA", runs: 8, wasOut: true }),
      performance({ playerId: "aninda", teamId: "teamB", runs: 6, wasOut: true })
    ]
  });
  sharedMatch.matchNumber = 12;

  const trends = buildPlayerPerformanceTrends({
    matches: [sharedMatch],
    playerId: "aninda"
  });

  assert.deepEqual(
    trends.series.score.points.map((point) => point.label),
    ["G12-A", "G12-B"]
  );
  assert.deepEqual(
    trends.series.score.points.map((point) => point.gameLabel),
    ["G12", "G12"]
  );
  assert.deepEqual(
    trends.series.score.points.map((point) => point.inningsLabel),
    ["First batting innings", "Second batting innings"]
  );
  assert.deepEqual(
    trends.series.score.points.map((point) => point.displayValue),
    ["8", "6"]
  );
});

test("Player performance trends keep DNB separate from a genuine duck", () => {
  const dnb = matchRecord({
    id: "trend-dnb",
    performances: [
      performance({ playerId: "aninda", didBat: false, runs: 0 }),
      performance({ playerId: "arunabha", teamId: "teamB", didBat: false })
    ]
  });
  const duck = matchRecord({
    id: "trend-duck",
    performances: [
      performance({ playerId: "aninda", didBat: true, runs: 0, wasOut: true }),
      performance({ playerId: "arunabha", teamId: "teamB", didBat: false })
    ]
  });

  dnb.matchNumber = 4;
  duck.matchNumber = 5;

  const trends = buildPlayerPerformanceTrends({
    matches: [duck, dnb],
    playerId: "aninda"
  });

  assert.deepEqual(
    trends.series.score.points.map((point) => point.label),
    ["G5"]
  );
  assert.equal(trends.series.score.points[0].value, 0);
  assert.equal(trends.series.score.points[0].displayValue, "0");
  assert.equal(trends.series.score.points[0].detail, "Out");
});

test("Player performance Bat SR is cumulative tracked career progression", () => {
  const matches = Array.from({ length: 12 }, (_, index) => {
    const runs = index < 2 ? 6 : 0;
    const match = matchRecord({
      id: `cumulative-bat-sr-${index + 1}`,
      events: eventsFor({
        batterId: "aninda",
        bowlerId: "arunabha",
        count: 1,
        runsPerBall: runs
      }),
      performances: [
        performance({ playerId: "aninda", runs, wasOut: index >= 2 }),
        performance({ playerId: "arunabha", teamId: "teamB", didBat: false })
      ]
    });

    match.matchDate = `2026-08-${String(index + 1).padStart(2, "0")}`;
    match.matchNumber = index + 1;

    return match;
  });
  const dnb = matchRecord({
    id: "cumulative-bat-sr-dnb",
    performances: [
      performance({ playerId: "aninda", didBat: false, runs: 0 }),
      performance({ playerId: "arunabha", teamId: "teamB", didBat: false })
    ]
  });
  dnb.matchDate = "2026-08-13";
  dnb.matchNumber = 13;

  const trends = buildPlayerPerformanceTrends({
    matches: [...matches, dnb],
    playerId: "aninda"
  });
  const strikeRatePoints = trends.series.battingStrikeRate.points;

  assert.equal(strikeRatePoints.length, 10);
  assert.equal(strikeRatePoints[0].label, "G3");
  assert.equal(strikeRatePoints[0].displayValue, "400.0");
  assert.equal(strikeRatePoints[0].detailRows.find((row) => row.label === "Innings SR")?.value, "0.0");
  assert.equal(
    strikeRatePoints[0].detailRows.find((row) => row.label === "Tracked career SR after match")?.value,
    "400.0"
  );
  assert.equal(strikeRatePoints.at(-1)?.label, "G12");
  assert.equal(strikeRatePoints.at(-1)?.displayValue, "100.0");
  assert.equal(strikeRatePoints.some((point) => point.label === "G13"), false);
  assert.equal(
    strikeRatePoints.some((point) =>
      [point.value, Number(point.displayValue)].some((value) => Number.isNaN(value) || !Number.isFinite(value))
    ),
    false
  );
});

test("Player performance batting average progression is cumulative with not-outs", () => {
  const notOut = matchRecord({
    id: "cumulative-average-not-out",
    performances: [
      performance({ playerId: "aninda", runs: 20, wasOut: false }),
      performance({ playerId: "arunabha", teamId: "teamB", didBat: false })
    ]
  });
  const dismissed = matchRecord({
    id: "cumulative-average-out",
    performances: [
      performance({ playerId: "aninda", runs: 10, wasOut: true }),
      performance({ playerId: "arunabha", teamId: "teamB", didBat: false })
    ]
  });
  notOut.matchDate = "2026-08-01";
  notOut.matchNumber = 1;
  dismissed.matchDate = "2026-08-02";
  dismissed.matchNumber = 2;

  const trends = buildPlayerPerformanceTrends({
    matches: [dismissed, notOut],
    playerId: "aninda"
  });

  assert.deepEqual(
    trends.series.battingAverage.points.map((point) => point.label),
    ["G2"]
  );
  assert.equal(trends.series.battingAverage.points[0].displayValue, "30.00");
  assert.equal(
    trends.series.battingAverage.points[0].detailRows.find(
      (row) => row.label === "Career average after innings"
    )?.value,
    "30.00"
  );
});

test("Player performance economy is cumulative tracked career progression", () => {
  const matches = Array.from({ length: 12 }, (_, index) => {
    const runsPerBall = index < 2 ? 1 : index === 2 ? 5 : 0;
    const match = matchRecord({
      id: `cumulative-economy-${index + 1}`,
      events: eventsFor({
        batterId: "arunabha",
        bowlerId: "aninda",
        count: 6,
        runsPerBall
      }),
      performances: [
        performance({ playerId: "aninda", didBat: false }),
        performance({ playerId: "arunabha", teamId: "teamB", didBat: true, runs: runsPerBall * 6 })
      ]
    });

    match.matchDate = `2026-08-${String(index + 1).padStart(2, "0")}`;
    match.matchNumber = index + 1;

    return match;
  });
  const didNotBowl = matchRecord({
    id: "cumulative-economy-dnbowl",
    events: [],
    performances: [
      performance({ playerId: "aninda", didBat: false }),
      performance({ playerId: "arunabha", teamId: "teamB", didBat: false })
    ]
  });
  didNotBowl.matchDate = "2026-08-13";
  didNotBowl.matchNumber = 13;

  const trends = buildPlayerPerformanceTrends({
    matches: [...matches, didNotBowl],
    playerId: "aninda"
  });
  const economyPoints = trends.series.economy.points;

  assert.equal(economyPoints.length, 10);
  assert.equal(economyPoints[0].label, "G3");
  assert.equal(economyPoints[0].displayValue, "14.00");
  assert.equal(economyPoints[0].detailRows.find((row) => row.label === "Match economy")?.value, "30.00");
  assert.equal(
    economyPoints[0].detailRows.find((row) => row.label === "Tracked career economy after match")?.value,
    "14.00"
  );
  assert.equal(economyPoints.at(-1)?.label, "G12");
  assert.equal(economyPoints.some((point) => point.label === "G13"), false);
  assert.equal(economyPoints[0].detailRows.some((row) => row.label === "Context"), false);
});

test("Player performance bowling SR is cumulative and excludes run-outs", () => {
  const runOutOnly = matchRecord({
    id: "cumulative-bowl-sr-run-out",
    events: eventsFor({
      batterId: "arunabha",
      bowlerId: "aninda",
      count: 6,
      runsPerBall: 0
    }).map((item, index) =>
      index === 5
        ? {
            ...item,
            wicket: {
              type: "run_out" as const,
              dismissedPlayerId: "arunabha",
              fielderId: "aninda",
              newBatterId: "biplab",
              completedRuns: 0
            }
          }
        : item
    ),
    performances: [
      performance({ playerId: "aninda", didBat: false }),
      performance({ playerId: "arunabha", teamId: "teamB", didBat: true, runs: 0, wasOut: true })
    ]
  });
  const bowledWicket = matchRecord({
    id: "cumulative-bowl-sr-wicket",
    events: eventsFor({
      batterId: "arunabha",
      bowlerId: "aninda",
      count: 6,
      runsPerBall: 1
    }).map((item, index) =>
      index === 5
        ? {
            ...item,
            wicket: {
              type: "bowled" as const,
              dismissedPlayerId: "arunabha",
              fielderId: null,
              newBatterId: "biplab",
              completedRuns: 0
            }
          }
        : item
    ),
    performances: [
      performance({ playerId: "aninda", didBat: false }),
      performance({ playerId: "arunabha", teamId: "teamB", didBat: true, runs: 6, wasOut: true })
    ]
  });
  runOutOnly.matchDate = "2026-08-01";
  runOutOnly.matchNumber = 1;
  bowledWicket.matchDate = "2026-08-02";
  bowledWicket.matchNumber = 2;

  const trends = buildPlayerPerformanceTrends({
    matches: [bowledWicket, runOutOnly],
    playerId: "aninda"
  });
  const bowlingStrikeRatePoints = trends.series.bowlingStrikeRate.points;

  assert.equal(trends.series.bowlingStrikeRate.points.length, 1);
  assert.equal(bowlingStrikeRatePoints[0].label, "G2");
  assert.equal(bowlingStrikeRatePoints[0].displayValue, "12.00");
  assert.equal(
    bowlingStrikeRatePoints[0].detailRows.find(
      (row) => row.label === "Tracked career bowling SR after match"
    )?.value,
    "12.00"
  );
  assert.equal(
    bowlingStrikeRatePoints[0].detailRows.some((row) => row.label === "Context"),
    false
  );
});

test("Player performance tracked Shared Player innings accumulate sequentially", () => {
  const sharedMatch = matchRecord({
    id: "cumulative-shared-tracked",
    events: [],
    performances: [
      performance({ playerId: "aninda", teamId: "teamA", runs: 6, wasOut: true }),
      performance({ playerId: "aninda", teamId: "teamB", runs: 0, wasOut: true })
    ]
  });
  sharedMatch.matchNumber = 24;
  sharedMatch.quickScoring = {
    ...quickScoringMetadata([]),
    inningsAEvents: [
      event(1, {
        battingTeamId: "teamA",
        strikerId: "aninda",
        bowlerId: "arunabha",
        batterRuns: 6
      })
    ],
    inningsBEvents: [
      event(2, {
        battingTeamId: "teamB",
        strikerId: "aninda",
        bowlerId: "arunabha",
        batterRuns: 0
      }),
      event(3, {
        battingTeamId: "teamB",
        strikerId: "aninda",
        bowlerId: "arunabha",
        batterRuns: 0
      })
    ]
  };

  const trends = buildPlayerPerformanceTrends({
    matches: [sharedMatch],
    playerId: "aninda"
  });

  assert.deepEqual(
    trends.series.battingStrikeRate.points.map((point) => point.label),
    ["G24-A", "G24-B"]
  );
  assert.deepEqual(
    trends.series.battingStrikeRate.points.map((point) => point.displayValue),
    ["600.0", "200.0"]
  );
  assert.equal(
    trends.series.battingStrikeRate.points[1].detailRows.find(
      (row) => row.label === "Innings SR"
    )?.value,
    "0.0"
  );
});

test("Career advanced stats use weighted event totals rather than average economies", () => {
  const matchA = matchRecord({
    id: "economy-a",
    events: eventsFor({
      batterId: "aninda",
      bowlerId: "arunabha",
      count: 6,
      runsPerBall: 2
    })
  });
  const matchB = matchRecord({
    id: "economy-b",
    events: eventsFor({
      batterId: "biplab",
      bowlerId: "arunabha",
      count: 12,
      runsPerBall: 0
    }).map((item, index) => (index < 10 ? { ...item, batterRuns: 1 } : item))
  });
  const career = deriveAdvancedCareerStatsByPlayer({
    matches: [matchA, matchB]
  }).get("arunabha");

  assert.equal(career?.trackedRunsConceded, 22);
  assert.equal(career?.legalBallsBowled, 18);
  assert.equal(career?.economy, 22 * 6 / 18);
  assert.notEqual(career?.economy, (12 + 5) / 2);
});

test("Career advanced stats aggregate event-backed fours and sixes only", () => {
  const matchA = matchRecord({
    id: "boundaries-a",
    events: [
      event(1, { batterRuns: 4 }),
      event(2, { batterRuns: 6 }),
      event(3, { extraType: "wide", extras: 5, batterRuns: 0 })
    ],
    performances: [performance({ playerId: "aninda", runs: 10 })]
  });
  const matchB = matchRecord({
    id: "boundaries-b",
    events: [
      event(1, { batterRuns: 4 }),
      event(2, { extraType: "no_ball", extras: 1, batterRuns: 6 })
    ],
    performances: [performance({ playerId: "aninda", runs: 10 })]
  });
  const legacyMatch = matchRecord({
    id: "legacy-boundaries",
    events: [],
    performances: [performance({ playerId: "aninda", runs: 99 })]
  });
  legacyMatch.quickScoring = undefined;
  const career = deriveAdvancedCareerStatsByPlayer({
    matches: [matchA, matchB, legacyMatch]
  }).get("aninda");

  assert.equal(career?.fours, 2);
  assert.equal(career?.sixes, 2);
  assert.equal(career?.boundaries, 4);
  assert.equal(career?.legacyFinalisedMatchesWithoutEvents, 1);
});

test("Mixed legacy and tracked batting stats keep career totals separate from tracked rates", () => {
  const trackedEvents = [
    event(1, { batterRuns: 4 }),
    event(2, { batterRuns: 6 }),
    event(3, { batterRuns: 4 }),
    event(4, { batterRuns: 6 }),
    event(5, { batterRuns: 4 }),
    event(6, { batterRuns: 6 }),
    event(7, { batterRuns: 2 }),
    event(8, { batterRuns: 1 }),
    event(9, { batterRuns: 1 }),
    event(10, { batterRuns: 1 }),
    event(11, { batterRuns: 1 }),
    event(12, { batterRuns: 1 })
  ];
  const trackedMatch = matchRecord({
    id: "tracked-career-innings",
    events: trackedEvents,
    performances: [
      performance({ playerId: "aninda", runs: 37 }),
      performance({ playerId: "arunabha", teamId: "teamB", didBat: false })
    ]
  });
  const legacyMatches = [30, 20, 20].map((runs, index) => {
    const legacyMatch = matchRecord({
      id: `legacy-career-innings-${index + 1}`,
      performances: [
        performance({ playerId: "aninda", runs }),
        performance({ playerId: "arunabha", teamId: "teamB", didBat: false })
      ]
    });

    legacyMatch.quickScoring = undefined;

    return legacyMatch;
  });
  const career = deriveAdvancedCareerStatsByPlayer({
    matches: [trackedMatch, ...legacyMatches]
  }).get("aninda");
  const bowlerCareer = deriveAdvancedCareerStatsByPlayer({
    matches: [trackedMatch, ...legacyMatches]
  }).get("arunabha");

  assert.equal(career?.inningsBatted, 4);
  assert.equal(career?.trackedBattingInnings, 1);
  assert.equal(career?.trackedBattingRuns, 37);
  assert.equal(career?.ballsFaced, 12);
  assert.equal(formatStrikeRate(career?.strikeRate), "308.3");
  assert.notEqual(career?.strikeRate, 107 * 100 / 12);
  assert.equal(career?.fours, 3);
  assert.equal(career?.sixes, 3);
  assert.equal(career?.boundaries, 6);
  assert.equal(career?.matchesWithEventHistory, 1);
  assert.equal(career?.legacyFinalisedMatchesWithoutEvents, 3);
  assert.equal(bowlerCareer?.trackedBowlingMatches, 1);
  assert.equal(bowlerCareer?.trackedRunsConceded, 37);
  assert.equal(bowlerCareer?.legalBallsBowled, 12);
  assert.equal(formatEconomy(bowlerCareer?.economy), "18.50");
});

test("Hall advanced categories enforce qualification, ranking direction and ties", () => {
  const players = activePlayers.map((player) => ({
    ...player,
    level: 0,
    xp: 0,
    stats: { matches: 0, runs: 0, wickets: 0, catches: 0, runOuts: 0, hatTricks: 0 },
    ratings: { batting: 0, bowling: 0, fielding: 0 }
  }));
  const match = matchRecord({
    events: [
      ...eventsFor({
        batterId: "aninda",
        bowlerId: "arunabha",
        count: ADVANCED_CRICKET_STAT_RULES.minimumBallsFacedForStrikeRate - 1,
        runsPerBall: 6
      }),
      ...eventsFor({
        batterId: "biplab",
        bowlerId: "dheeraj",
        count: ADVANCED_CRICKET_STAT_RULES.minimumBallsFacedForStrikeRate,
        runsPerBall: 2,
        startSequence: 30
      }),
      ...eventsFor({
        batterId: "atripan",
        bowlerId: "soman",
        count: ADVANCED_CRICKET_STAT_RULES.minimumLegalBallsForEconomy,
        runsPerBall: 1,
        startSequence: 70
      })
    ],
    performances: [
      performance({ playerId: "aninda", runs: 114 }),
      performance({ playerId: "biplab", runs: 40 }),
      performance({ playerId: "atripan", runs: 18 }),
      performance({ playerId: "arunabha", teamId: "teamB", didBat: false }),
      performance({ playerId: "dheeraj", teamId: "teamB", didBat: false }),
      performance({ playerId: "soman", teamId: "teamB", didBat: false })
    ]
  });
  const strikeRateEntries = getLeaderboardEntries({
    players,
    matches: [match],
    category: "strikeRate",
    period: "all-time"
  });
  const economyEntries = getLeaderboardEntries({
    players,
    matches: [match],
    category: "economy",
    period: "all-time"
  });

  assert.equal(strikeRateEntries[0].player.id, "biplab");
  assert.equal(strikeRateEntries.find((entry) => entry.player.id === "aninda")?.rankable, false);
  assert.equal(economyEntries[0].player.id, "soman");
  assert.equal(economyEntries[0].primaryValue, 6);
  assert.equal(getLeaderboardSummary({ category: "economy", entries: economyEntries }).status, "single-leader");
});

test("Hall tracked categories do not qualify players from legacy-only career totals", () => {
  const players = activePlayers.map((player) => ({
    ...player,
    level: 0,
    xp: 0,
    stats: {
      matches: player.id === "aninda" ? 4 : player.id === "biplab" ? 3 : 0,
      runs: player.id === "aninda" ? 107 : player.id === "biplab" ? 120 : 0,
      wickets: 0,
      catches: 0,
      runOuts: 0,
      hatTricks: 0
    },
    ratings: { batting: 0, bowling: 0, fielding: 0 }
  }));
  const trackedMatch = matchRecord({
    id: "tracked-subset-hall",
    events: eventsFor({
      batterId: "aninda",
      bowlerId: "arunabha",
      count: 12,
      runsPerBall: 3
    }),
    performances: [
      performance({ playerId: "aninda", runs: 36 }),
      performance({ playerId: "arunabha", teamId: "teamB", didBat: false })
    ]
  });
  const legacyOnlyMatch = matchRecord({
    id: "legacy-only-boundary-player",
    performances: [performance({ playerId: "biplab", runs: 120 })]
  });
  legacyOnlyMatch.quickScoring = undefined;
  const strikeRateEntries = getLeaderboardEntries({
    players,
    matches: [trackedMatch, legacyOnlyMatch],
    category: "strikeRate",
    period: "all-time"
  });
  const boundaryEntries = getLeaderboardEntries({
    players,
    matches: [trackedMatch, legacyOnlyMatch],
    category: "boundaries",
    period: "all-time"
  });

  assert.equal(strikeRateEntries.find((entry) => entry.player.id === "aninda")?.rankable, false);
  assert.equal(strikeRateEntries.find((entry) => entry.player.id === "biplab")?.rankable, false);
  assert.equal(boundaryEntries.find((entry) => entry.player.id === "biplab")?.rankable, false);
  assert.equal(boundaryEntries.find((entry) => entry.player.id === "biplab")?.supporting.boundaries, 0);
});

test("Hall Six Machine and Boundary Bandit rank cumulative event-backed boundaries", () => {
  const players = activePlayers.map((player) => ({
    ...player,
    level: 0,
    xp: 0,
    stats: { matches: 0, runs: 0, wickets: 0, catches: 0, runOuts: 0, hatTricks: 0 },
    ratings: { batting: 0, bowling: 0, fielding: 0 }
  }));
  const match = matchRecord({
    events: [
      event(1, { strikerId: "aninda", batterRuns: 6 }),
      event(2, { strikerId: "aninda", batterRuns: 6 }),
      event(3, { strikerId: "biplab", batterRuns: 4 }),
      event(4, { strikerId: "biplab", batterRuns: 4 }),
      event(5, { strikerId: "biplab", batterRuns: 6 }),
      event(6, { strikerId: "atripan", batterRuns: 4 }),
      event(7, { strikerId: "atripan", batterRuns: 4 }),
      event(8, { strikerId: "atripan", batterRuns: 4 })
    ],
    performances: [
      performance({ playerId: "aninda", runs: 12 }),
      performance({ playerId: "biplab", runs: 14 }),
      performance({ playerId: "atripan", runs: 12 })
    ]
  });
  const sixEntries = getLeaderboardEntries({
    players,
    matches: [match],
    category: "sixes",
    period: "all-time"
  });
  const boundaryEntries = getLeaderboardEntries({
    players,
    matches: [match],
    category: "boundaries",
    period: "all-time"
  });
  const boundarySummary = getLeaderboardSummary({
    category: "boundaries",
    entries: boundaryEntries
  });

  assert.equal(sixEntries[0].player.id, "aninda");
  assert.equal(sixEntries[0].primaryValue, 2);
  assert.equal(boundarySummary.status, "joint-leaders");
  assert.deepEqual(
    boundarySummary.leaders.map((entry) => [entry.player.id, entry.primaryValue, entry.rank]),
    [
      ["atripan", 3, 1],
      ["biplab", 3, 1]
    ]
  );
});

test("Duck Collector counts dismissed-zero innings only and preserves joint ranks", () => {
  const duckMatch = matchRecord({
    performances: [
      performance({ playerId: "aninda", runs: 0, wasOut: true }),
      performance({ playerId: "biplab", runs: 0, wasOut: true }),
      performance({ playerId: "atripan", runs: 0, wasOut: false }),
      performance({ playerId: "dipanjan", didBat: false, runs: 0, wasOut: false })
    ]
  });
  const draftDuck = matchRecord({
    id: "draft-duck",
    status: "draft",
    performances: [performance({ playerId: "soman", runs: 0, wasOut: true })]
  });
  const entries = getLeaderboardEntries({
    players: activePlayers,
    matches: [duckMatch, draftDuck],
    category: "ducks",
    period: "all-time"
  });
  const summary = getLeaderboardSummary({ category: "ducks", entries });

  assert.equal(entries.find((entry) => entry.player.id === "aninda")?.primaryValue, 1);
  assert.equal(entries.find((entry) => entry.player.id === "biplab")?.primaryValue, 1);
  assert.equal(entries.find((entry) => entry.player.id === "atripan")?.primaryValue, 0);
  assert.equal(entries.find((entry) => entry.player.id === "dipanjan")?.primaryValue, 0);
  assert.equal(entries.find((entry) => entry.player.id === "soman")?.primaryValue, 0);
  assert.equal(summary.status, "joint-leaders");
  assert.deepEqual(summary.leaders.map((entry) => entry.rank), [1, 1]);
});

test("Scorecards render R/B/SR from tracked events and leave legacy balls unavailable", () => {
  const match = matchRecord({
    events: [
      ...eventsFor({ batterId: "aninda", bowlerId: "arunabha", count: 5, runsPerBall: 1 }),
      event(6, { bowlerId: "arunabha", extraType: "wide", extras: 1 })
    ],
    performances: [
      performance({ playerId: "aninda", runs: 5 }),
      performance({ playerId: "biplab", didBat: false }),
      performance({ playerId: "arunabha", teamId: "teamB", didBat: false })
    ]
  });
  match.innings.first.bowlingOvers = [
    {
      id: "over-1",
      bowlingTeamId: "teamB",
      battingTeamId: "teamA",
      bowlerId: "arunabha",
      overNumber: 1,
      legalBalls: 5,
      runsConceded: 6,
      wicketsTaken: 0,
      dismissals: [],
      maiden: false
    }
  ];
  const scorecard = buildScorecardInnings(
    match,
    match.innings.first,
    (playerId) => getPlayerById(playerId)?.name ?? playerId
  );
  const legacyMatch = { ...match, quickScoring: undefined };
  const legacyScorecard = buildScorecardInnings(
    legacyMatch,
    legacyMatch.innings.first,
    (playerId) => getPlayerById(playerId)?.name ?? playerId
  );

  assert.equal(scorecard.battingRows[0].runs, "5");
  assert.equal(scorecard.battingRows[0].balls, "5");
  assert.equal(scorecard.battingRows[0].fours, "0");
  assert.equal(scorecard.battingRows[0].sixes, "0");
  assert.equal(scorecard.battingRows[0].strikeRate, "100.0");
  assert.equal(scorecard.bowlingFigures[0].overs, "0.5");
  assert.equal(scorecard.bowlingFigures[0].economy, "7.20");
  assert.equal(legacyScorecard.battingRows[0].balls, "-");
  assert.equal(legacyScorecard.battingRows[0].fours, "-");
  assert.equal(legacyScorecard.battingRows[0].sixes, "-");
  assert.equal(legacyScorecard.battingRows[0].strikeRate, "-");
});

test("Profile and Formula Room surfaces reference the shared advanced-stat engine", () => {
  const profile = readFileSync("components/players/PlayerProfile.tsx", "utf8");
  const formulaRoom = readFileSync("components/stats/FormulaRoom.tsx", "utf8");
  const scorecard = readFileSync("components/matches/MatchScorecard.tsx", "utf8");

  assert.match(profile, /formatStrikeRate\(exactStats\.strikeRate\)/);
  assert.match(profile, /formatEconomy\(exactStats\.economy\)/);
  assert.match(profile, /Career Batting Totals/);
  assert.match(profile, /Ball-by-ball tracked/);
  assert.match(profile, /Tracked Innings/);
  assert.match(profile, /Tracked Runs/);
  assert.match(profile, /Balls Faced/);
  assert.match(profile, /Tracked Strike Rate/);
  assert.match(profile, /label="Fours"/);
  assert.match(profile, /label="Sixes"/);
  assert.match(profile, /Career Bowling Totals/);
  assert.match(profile, /Tracked Bowling Matches/);
  assert.match(profile, /Tracked Economy/);
  assert.match(profile, /Batting Average/);
  assert.match(profile, /Tracked Bowling Strike Rate/);
  assert.match(profile, /Performance Trend/);
  assert.match(profile, /role="tablist"/);
  assert.match(profile, /Ball-by-ball coverage/);
  assert.match(formulaRoom, /ADVANCED_CRICKET_STAT_RULES/);
  assert.match(formulaRoom, /calculateBattingStrikeRate/);
  assert.match(formulaRoom, /calculateBowlingEconomy/);
  assert.match(scorecard, /<th>B<\/th>/);
  assert.match(scorecard, /<th>4s<\/th>/);
  assert.match(scorecard, /<th>6s<\/th>/);
  assert.match(scorecard, /<th>SR<\/th>/);
});
