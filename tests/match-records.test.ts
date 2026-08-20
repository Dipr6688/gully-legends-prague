import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildTeamInnings,
  buildTeamMatchData,
  applySharedPlayerToRosters,
  calculateBattingAllocation,
  calculateBowlerWickets,
  calculateCompletedBowlingOvers,
  calculatePlayerCatches,
  calculatePlayerHatTricks,
  calculatePlayerRunOuts,
  calculatePlayerStumpings,
  calculateRemainingWicketsForOver,
  calculateMatchResult,
  calculateTeamTotal,
  calculateTeamTotals,
  formatInningsScore,
  calculateScoreFromBowlingFeed,
  canEditQuickScoring,
  getInningsCompleteMessage,
  getInningsState,
  getFinalResultHeadline,
  getEligibleFieldingPlayerIds,
  getFieldingHelperIds,
  getLiveInningsScore,
  getLiveResultPreview,
  getMaximumRunsForPlayer,
  getNextBattingPosition,
  getOrdinaryCrossTeamPlayerIds,
  getPlayerAssignment,
  getPerformanceKey,
  getRecordedActivityPlayerIds,
  isBowlingOverComplete,
  migrateLegacyBowlingOvers,
  normalizeBattingPosition,
  normalizeNonNegativeIntegerInput,
  normalizeStoredRuns,
  sanitizeRuns,
  setPlayerAvailability,
  sortBattingPerformances,
  syncDismissalRows,
  toggleTeamSelection,
  validateMatchRecordInput
} from "../lib/match-records";
import {
  buildBattingRows,
  formatCricketOversFromLegalBalls
} from "../lib/match-scorecard";
import { calculateMatchXP } from "../lib/progression";
import {
  createEmptyQuickScoringMetadata,
  createQuickScoringEvent,
  deriveQuickScoringInnings,
  replaceQuickScoringEvent,
  undoLastQuickScoringEvent
} from "../lib/quick-scoring";
import {
  applyFinalisedMatchToCareerStats,
  createEmptyCareerProgressionState
} from "../lib/career-store";
import type { BattingMode, BowlingOver, DismissalEvent, MatchRecord, MatchStatus, PlayerMatchPerformance, TeamId, TeamInnings } from "../lib/types/match";

test("manual Team A selection disables Team B selection by moving membership", () => {
  const state = toggleTeamSelection(baseState(), "teamA", "aninda");

  assert.deepEqual(state.teamAPlayerIds, ["aninda"]);
  assert.deepEqual(state.teamBPlayerIds, []);
});

test("manual Team B selection disables Team A selection by moving membership", () => {
  const first = toggleTeamSelection(baseState(), "teamA", "aninda");
  const second = toggleTeamSelection(first, "teamB", "aninda");

  assert.deepEqual(second.teamAPlayerIds, []);
  assert.deepEqual(second.teamBPlayerIds, ["aninda"]);
});

test("removing a player re-enables the opposite team checkbox", () => {
  const selected = toggleTeamSelection(baseState(), "teamA", "aninda");
  const removed = toggleTeamSelection(selected, "teamA", "aninda");
  const moved = toggleTeamSelection(removed, "teamB", "aninda");

  assert.deepEqual(moved.teamBPlayerIds, ["aninda"]);
});

test("making a player unavailable removes the player from both teams", () => {
  const selected = toggleTeamSelection(baseState(), "teamA", "aninda");
  const unavailable = setPlayerAvailability(selected, "aninda", false);

  assert.deepEqual(unavailable.availablePlayerIds, ["biplab"]);
  assert.deepEqual(unavailable.teamAPlayerIds, []);
  assert.deepEqual(unavailable.teamBPlayerIds, []);
});

test("seven-player odd setup uses one Shared Player for equal four-vs-four sides", () => {
  const availablePlayerIds = [
    "aninda",
    "arunabha",
    "atripan",
    "biplab",
    "dipanjan",
    "gaurav",
    "madhab"
  ];
  const rosters = applySharedPlayerToRosters({
    sharedPlayerId: "aninda",
    teamAPlayerIds: ["arunabha", "atripan", "biplab"],
    teamBPlayerIds: ["dipanjan", "gaurav", "madhab"]
  });
  const ordinaryPlayerIds = availablePlayerIds.filter((playerId) => playerId !== "aninda");

  assert.equal(rosters.teamAPlayerIds.length, 4);
  assert.equal(rosters.teamBPlayerIds.length, 4);
  assert.equal(rosters.teamAPlayerIds.includes("aninda"), true);
  assert.equal(rosters.teamBPlayerIds.includes("aninda"), true);
  assert.deepEqual(
    ordinaryPlayerIds
      .map(
        (playerId) =>
          Number(rosters.teamAPlayerIds.includes(playerId)) +
          Number(rosters.teamBPlayerIds.includes(playerId))
      )
      .sort(),
    [1, 1, 1, 1, 1, 1]
  );
});

test("nine-player odd setup uses one Shared Player for equal five-vs-five sides", () => {
  const rosters = applySharedPlayerToRosters({
    sharedPlayerId: "aninda",
    teamAPlayerIds: ["arunabha", "atripan", "biplab", "dipanjan"],
    teamBPlayerIds: ["gaurav", "madhab", "rohit", "soman"]
  });

  assert.equal(rosters.teamAPlayerIds.length, 5);
  assert.equal(rosters.teamBPlayerIds.length, 5);
  assert.equal(rosters.teamAPlayerIds.includes("aninda"), true);
  assert.equal(rosters.teamBPlayerIds.includes("aninda"), true);
});

test("manual teams allow only the selected Shared Player to appear in both teams", () => {
  assert.deepEqual(
    getOrdinaryCrossTeamPlayerIds({
      sharedPlayerId: "aninda",
      teamAPlayerIds: ["aninda", "arunabha"],
      teamBPlayerIds: ["aninda", "biplab"]
    }),
    []
  );
  assert.deepEqual(
    getOrdinaryCrossTeamPlayerIds({
      sharedPlayerId: "aninda",
      teamAPlayerIds: ["aninda", "arunabha"],
      teamBPlayerIds: ["aninda", "arunabha"]
    }),
    ["arunabha"]
  );
});

test("active player update assignment helper recognises Team A Team B Shared and Unassigned", () => {
  const rosters = {
    teamAPlayerIds: ["aninda", "biplab"],
    teamBPlayerIds: ["arunabha", "biplab"],
    sharedPlayerId: "biplab"
  };

  assert.equal(getPlayerAssignment("aninda", rosters), "teamA");
  assert.equal(getPlayerAssignment("arunabha", rosters), "teamB");
  assert.equal(getPlayerAssignment("biplab", rosters), "shared");
  assert.equal(getPlayerAssignment("atripan", rosters), "unassigned");
});

test("recorded activity locks batters bowlers fielders and manual records for active roster updates", () => {
  const quickScoring = {
    ...createEmptyQuickScoringMetadata(),
    inningsAEvents: [
      quickEvent(1, {
        strikerId: "aninda",
        nonStrikerId: "arunabha",
        bowlerId: "biplab",
        wicket: {
          type: "caught",
          dismissedPlayerId: "aninda",
          fielderId: "atripan",
          newBatterId: "dipanjan",
          completedRuns: 0
        }
      })
    ]
  };
  const activityIds = getRecordedActivityPlayerIds({
    quickScoring,
    bowlingOvers: {
      teamA: [],
      teamB: [
        {
          id: "manual-over",
          bowlingTeamId: "teamB",
          battingTeamId: "teamA",
          bowlerId: "gaurav",
          overNumber: 1,
          runsConceded: 4,
          wicketsTaken: 1,
          dismissals: [
            {
              id: "manual-dismissal",
              overId: "manual-over",
              battingTeamId: "teamA",
              bowlingTeamId: "teamB",
              dismissedBatterId: "soman",
              type: "run_out",
              creditedBowlerId: null,
              fielderId: "utpal"
            }
          ],
          maiden: false
        }
      ]
    },
    performances: [
      {
        ...performance("rohit", "teamA", 0),
        didBat: false,
        runs: "",
        catches: 1
      },
      {
        ...performance("madhab", "teamA", 0),
        didBat: false,
        played: true,
        runs: ""
      }
    ]
  });

  assert.deepEqual(
    activityIds,
    [
      "aninda",
      "arunabha",
      "atripan",
      "biplab",
      "dipanjan",
      "gaurav",
      "rohit",
      "soman",
      "utpal"
    ]
  );
  assert.equal(activityIds.includes("madhab"), false);
});

test("Team A players appear only in Team A records", () => {
  const teamData = buildTeamMatchData({
    teamId: "teamA",
    teamName: "Team A",
    playerIds: ["aninda"],
    performances: [
      performance("aninda", "teamA", 20),
      performance("biplab", "teamB", 15)
    ],
    bowlingOvers: []
  });

  assert.deepEqual(teamData.playerPerformances.map((record) => record.playerId), ["aninda"]);
});

test("Team B players appear only in Team B records", () => {
  const teamData = buildTeamMatchData({
    teamId: "teamB",
    teamName: "Team B",
    playerIds: ["biplab"],
    performances: [
      performance("aninda", "teamA", 20),
      performance("biplab", "teamB", 15)
    ],
    bowlingOvers: []
  });

  assert.deepEqual(teamData.playerPerformances.map((record) => record.playerId), ["biplab"]);
});

test("selected team player automatically has Played true", () => {
  const teamData = buildTeamMatchData({
    teamId: "teamA",
    teamName: "Team A",
    playerIds: ["aninda"],
    performances: [
      {
        ...performance("aninda", "teamA", 0),
        played: false,
        didBat: false,
        runs: ""
      }
    ],
    bowlingOvers: []
  });

  assert.equal(teamData.playerPerformances[0]?.played, true);
});

test("selected player with Did Bat false is still Played", () => {
  const teamData = buildTeamMatchData({
    teamId: "teamA",
    teamName: "Team A",
    playerIds: ["aninda"],
    performances: [
      {
        ...performance("aninda", "teamA", 0),
        played: false,
        didBat: false,
        runs: ""
      }
    ],
    bowlingOvers: []
  });
  const record = teamData.playerPerformances[0];

  assert.equal(record?.played, true);
  assert.equal(record?.didBat, false);
});

test("Did Not Bat player still receives normal Played career treatment", () => {
  const teamAData = buildTeamMatchData({
    teamId: "teamA",
    teamName: "Team A",
    playerIds: ["aninda"],
    performances: [
      {
        ...performance("aninda", "teamA", 0),
        played: false,
        didBat: false,
        runs: "",
        wasOut: false
      }
    ],
    bowlingOvers: []
  });
  const teamBData = buildTeamMatchData({
    teamId: "teamB",
    teamName: "Team B",
    playerIds: ["biplab"],
    performances: [
      {
        ...performance("biplab", "teamB", 0),
        didBat: false,
        runs: ""
      }
    ],
    bowlingOvers: []
  });
  const match: MatchRecord = {
    id: "dnb-played-match",
    matchDate: "2026-08-04",
    matchName: "DNB Participation Check",
    venue: "CZU Gully Arena",
    status: "finalised",
    scheduledOversPerInnings: 4,
    battingFirstTeamId: "teamA",
    chasingTeamId: "teamB",
    teams: {
      teamA: teamAData,
      teamB: teamBData
    },
    innings: {
      first: innings("teamA", 0, 0, 1),
      second: innings("teamB", 0, 0, 1)
    },
    result: { type: "tie" }
  };
  const state = applyFinalisedMatchToCareerStats(
    match,
    createEmptyCareerProgressionState(),
    "2026-08-10T10:00:00.000Z"
  );

  assert.equal(state.playerCareers.aninda.matches, 1);
  assert.equal(state.playerCareers.aninda.inningsBatted, 0);
  assert.equal(state.playerCareers.aninda.totalXP, 20);
});

test("player removed from team is not treated as Played", () => {
  const teamData = buildTeamMatchData({
    teamId: "teamA",
    teamName: "Team A",
    playerIds: ["aninda"],
    performances: [
      performance("aninda", "teamA", 10),
      performance("biplab", "teamA", 99)
    ],
    bowlingOvers: []
  });

  assert.deepEqual(
    teamData.playerPerformances.map((record) => record.playerId),
    ["aninda"]
  );
});

test("Shared Player still receives Played exactly once", () => {
  const performances: PlayerMatchPerformance[] = [
    { ...performance("aninda", "teamA", 0), played: false, didBat: false, runs: "" },
    { ...performance("aninda", "teamB", 0), played: false, didBat: false, runs: "" },
    { ...performance("biplab", "teamA", 0), didBat: false, runs: "" },
    { ...performance("atripan", "teamB", 0), didBat: false, runs: "" }
  ];
  const teamAData = buildTeamMatchData({
    teamId: "teamA",
    teamName: "Team A",
    playerIds: ["aninda", "biplab"],
    performances,
    bowlingOvers: []
  });
  const teamBData = buildTeamMatchData({
    teamId: "teamB",
    teamName: "Team B",
    playerIds: ["aninda", "atripan"],
    performances,
    bowlingOvers: []
  });
  const match: MatchRecord = {
    id: "shared-played-match",
    matchDate: "2026-08-04",
    matchName: "Shared Participation Check",
    venue: "CZU Gully Arena",
    status: "finalised",
    scheduledOversPerInnings: 4,
    battingFirstTeamId: "teamA",
    chasingTeamId: "teamB",
    sharedPlayerId: "aninda",
    teams: {
      teamA: teamAData,
      teamB: teamBData
    },
    innings: {
      first: innings("teamA", 0, 0, 2),
      second: innings("teamB", 0, 0, 2)
    },
    result: { type: "tie" }
  };
  const state = applyFinalisedMatchToCareerStats(
    match,
    createEmptyCareerProgressionState(),
    "2026-08-10T10:00:00.000Z"
  );

  assert.equal(teamAData.playerPerformances[0]?.played, true);
  assert.equal(teamBData.playerPerformances[0]?.played, true);
  assert.equal(state.playerCareers.aninda.matches, 1);
  assert.equal(state.playerCareers.aninda.totalXP, 20);
  assert.deepEqual(Object.keys(state.appliedProgressions).filter((key) => key.endsWith(":aninda")), [
    "shared-played-match:aninda"
  ]);
});

test("batting position metadata normalizes and assigns the next team position", () => {
  const records = [
    { ...performance("naim", "teamB", 70), battingPosition: 1 },
    { ...performance("saurav", "teamB", 3), battingPosition: 2 },
    { ...performance("soman", "teamB", 33), battingPosition: 3 },
    { ...performance("aninda", "teamA", 44), battingPosition: 1 }
  ];

  assert.equal(normalizeBattingPosition("04"), 4);
  assert.equal(normalizeBattingPosition(0), null);
  assert.equal(getNextBattingPosition(records, "teamB"), 4);
  assert.equal(getNextBattingPosition(records, "teamA"), 2);
});

test("scorecard batting rows sort by batting position and keep did-not-bat players last", () => {
  const performances: PlayerMatchPerformance[] = [
    { ...performance("rohit", "teamB", 7), battingPosition: 4, wasOut: false },
    { ...performance("soman", "teamB", 33), battingPosition: 3, wasOut: true },
    { ...performance("saurav", "teamB", 3), battingPosition: 2, wasOut: true },
    { ...performance("naim", "teamB", 70), battingPosition: 1, wasOut: false },
    {
      ...performance("amrit", "teamB", 0),
      didBat: false,
      battingPosition: null,
      runs: "",
      wasOut: false
    },
    {
      ...performance("suprateem", "teamB", 0),
      didBat: false,
      battingPosition: null,
      runs: "",
      wasOut: false
    }
  ];
  const rows = buildBattingRows(
    {
      battingTeamId: "teamB",
      bowlingTeamId: "teamA",
      runs: 113,
      wicketsLost: 2,
      extras: 0,
      playerCount: 6,
      completedOvers: 4,
      battingPerformances: performances,
      bowlingOvers: [
        over("teamA", "aninda", 1, {
          dismissals: [
            dismissal({
              id: "saurav-dismissal",
              overId: "teamA-1",
              battingTeamId: "teamB",
              bowlingTeamId: "teamA",
              dismissedBatterId: "saurav",
              creditedBowlerId: "aninda"
            })
          ]
        }),
        over("teamA", "utpal", 2, {
          dismissals: [
            dismissal({
              id: "soman-dismissal",
              overId: "teamA-2",
              battingTeamId: "teamB",
              bowlingTeamId: "teamA",
              dismissedBatterId: "soman",
              creditedBowlerId: "utpal"
            })
          ]
        })
      ]
    },
    (playerId) =>
      ({
        naim: "Naeem",
        saurav: "Saurav",
        soman: "Soman",
        rohit: "Rohit",
        amrit: "Amrit",
        suprateem: "Suprateem",
        aninda: "Aninda",
        utpal: "Utpal"
      })[playerId] ?? playerId
  );

  assert.deepEqual(
    rows.map((row) => row.batter),
    ["Naeem", "Saurav", "Soman", "Rohit", "Amrit", "Suprateem"]
  );
  assert.equal(rows[3]?.dismissal, "not out");
  assert.equal(rows[4]?.dismissal, "did not bat");
  assert.equal(rows[4]?.runs, "-");
});

test("legacy batting rows without batting positions keep existing deterministic order", () => {
  const performances: PlayerMatchPerformance[] = [
    performance("rohit", "teamB", 7),
    performance("soman", "teamB", 33),
    performance("saurav", "teamB", 3),
    {
      ...performance("amrit", "teamB", 0),
      didBat: false,
      runs: "",
      wasOut: false
    }
  ];

  assert.deepEqual(
    sortBattingPerformances(performances).map((record) => record.playerId),
    ["rohit", "soman", "saurav", "amrit"]
  );
});

test("batting order metadata does not affect XP totals", () => {
  const withoutPosition = performance("rohit", "teamB", 7);
  const withPosition = { ...withoutPosition, battingPosition: 4 };

  assert.deepEqual(
    calculateMatchXP(withPosition, {
      result: {
        type: "win_by_wickets",
        winnerTeamId: "teamB",
        loserTeamId: "teamA",
        wicketsRemaining: 2
      },
      teamWon: true,
      overs: []
    }),
    calculateMatchXP(withoutPosition, {
      result: {
        type: "win_by_wickets",
        winnerTeamId: "teamB",
        loserTeamId: "teamA",
        wicketsRemaining: 2
      },
      teamWon: true,
      overs: []
    })
  );
});

test("Quick Scoring derives normal runs strike rotation and over completion", () => {
  const events = [
    quickEvent(1, { batterRuns: 0 }),
    quickEvent(2, { strikerId: "naim", nonStrikerId: "saurav", batterRuns: 1 }),
    quickEvent(3, { strikerId: "saurav", nonStrikerId: "naim", batterRuns: 2 }),
    quickEvent(4, { strikerId: "saurav", nonStrikerId: "naim", batterRuns: 3 }),
    quickEvent(5, { strikerId: "naim", nonStrikerId: "saurav", batterRuns: 4 }),
    quickEvent(6, { strikerId: "naim", nonStrikerId: "saurav", batterRuns: 6 })
  ];
  const derived = deriveQuickScoringInnings(quickInput(events));

  assert.equal(derived.runs, 16);
  assert.equal(derived.legalBalls, 6);
  assert.equal(derived.completedOvers, 1);
  assert.equal(derived.currentBowlerId, null);
  assert.equal(derived.currentStrikerId, "saurav");
  assert.deepEqual(
    batterRunsById(derived.battingPerformances),
    { naim: 11, saurav: 5 }
  );
  assert.deepEqual(derived.bowlingOvers.map((over) => over.runsConceded), [16]);
});

test("Quick Scoring wides and no-balls add extras without legal deliveries", () => {
  const derived = deriveQuickScoringInnings(
    quickInput([
      quickEvent(1, { extraType: "wide", extras: 1 }),
      quickEvent(2, { extraType: "no_ball", extras: 1 }),
      quickEvent(3, { batterRuns: 4 })
    ])
  );

  assert.equal(derived.runs, 6);
  assert.equal(derived.extras, 2);
  assert.equal(derived.legalBalls, 1);
  assert.equal(derived.bowlingOvers[0]?.runsConceded, 6);
  assert.equal(derived.battingPerformances.find((row) => row.playerId === "naim")?.runs, 4);
});

test("Quick Scoring shows every first event of a new over immediately", () => {
  const firstOver = quickLegalOver(1, "aninda");
  const cases = [
    {
      name: "dot ball",
      event: quickEvent(7, { bowlerId: "dipanjan", batterRuns: 0 }),
      expectedLegalBalls: 7
    },
    {
      name: "single",
      event: quickEvent(7, { bowlerId: "dipanjan", batterRuns: 1 }),
      expectedLegalBalls: 7
    },
    {
      name: "four",
      event: quickEvent(7, { bowlerId: "dipanjan", batterRuns: 4 }),
      expectedLegalBalls: 7
    },
    {
      name: "six",
      event: quickEvent(7, { bowlerId: "dipanjan", batterRuns: 6 }),
      expectedLegalBalls: 7
    },
    {
      name: "wide",
      event: quickEvent(7, { bowlerId: "dipanjan", extraType: "wide", extras: 1 }),
      expectedLegalBalls: 6
    },
    {
      name: "no-ball",
      event: quickEvent(7, { bowlerId: "dipanjan", extraType: "no_ball", extras: 1 }),
      expectedLegalBalls: 6
    },
    {
      name: "wicket",
      event: quickEvent(7, {
        bowlerId: "dipanjan",
        wicket: {
          type: "bowled",
          dismissedPlayerId: "naim",
          fielderId: null,
          newBatterId: "soman",
          completedRuns: 0
        }
      }),
      expectedLegalBalls: 7
    }
  ];

  for (const { name, event, expectedLegalBalls } of cases) {
    const derived = deriveQuickScoringInnings(quickInput([...firstOver, event]));

    assert.equal(derived.legalBalls, expectedLegalBalls, name);
    assert.deepEqual(
      derived.currentOverEvents.map((candidate) => candidate.id),
      [event.id],
      name
    );
    assert.equal(derived.isBetweenOvers, false, name);
    assert.equal(derived.currentBowlerId, "dipanjan", name);
    if (expectedLegalBalls === 6) {
      assert.equal(derived.lastCompletedOverEvents.length, 6, name);
    }
  }
});

test("Quick Scoring keeps first wide and no-ball visible after later over transitions", () => {
  const completedOvers = [
    quickLegalOver(1, "aninda"),
    quickLegalOver(7, "dipanjan"),
    quickLegalOver(13, "utpal")
  ];
  const cases = [
    {
      name: "Over 2 first wide",
      eventsBefore: completedOvers.slice(0, 1).flat(),
      event: quickEvent(7, { bowlerId: "dipanjan", extraType: "wide", extras: 1 }),
      expectedLegalBalls: 6
    },
    {
      name: "Over 3 first wide",
      eventsBefore: completedOvers.slice(0, 2).flat(),
      event: quickEvent(13, { bowlerId: "utpal", extraType: "wide", extras: 1 }),
      expectedLegalBalls: 12
    },
    {
      name: "Over 4 first wide",
      eventsBefore: completedOvers.flat(),
      event: quickEvent(19, { bowlerId: "dheeraj", extraType: "wide", extras: 1 }),
      expectedLegalBalls: 18
    },
    {
      name: "Over 2 first no-ball",
      eventsBefore: completedOvers.slice(0, 1).flat(),
      event: quickEvent(7, { bowlerId: "dipanjan", extraType: "no_ball", extras: 1 }),
      expectedLegalBalls: 6
    },
    {
      name: "Over 3 first no-ball",
      eventsBefore: completedOvers.slice(0, 2).flat(),
      event: quickEvent(13, { bowlerId: "utpal", extraType: "no_ball", extras: 1 }),
      expectedLegalBalls: 12
    }
  ];

  for (const { name, eventsBefore, event, expectedLegalBalls } of cases) {
    const derived = deriveQuickScoringInnings(quickInput([...eventsBefore, event]));

    assert.equal(derived.legalBalls, expectedLegalBalls, name);
    assert.equal(derived.isBetweenOvers, false, name);
    assert.deepEqual(
      derived.currentOverEvents.map((candidate) => candidate.id),
      [event.id],
      name
    );
    assert.equal(derived.currentBowlerId, event.bowlerId, name);
  }
});

test("Quick Scoring keeps first wide in the new over before the next legal ball", () => {
  const firstOver = quickLegalOver(1, "aninda");
  const wide = quickEvent(7, {
    bowlerId: "dipanjan",
    extraType: "wide",
    extras: 1
  });
  const single = quickEvent(8, {
    bowlerId: "dipanjan",
    batterRuns: 1
  });
  const afterWide = deriveQuickScoringInnings(quickInput([...firstOver, wide]));
  const afterSingle = deriveQuickScoringInnings(
    quickInput([...firstOver, wide, single])
  );

  assert.equal(afterWide.legalBalls, 6);
  assert.equal(afterWide.isBetweenOvers, false);
  assert.deepEqual(afterWide.currentOverEvents.map((event) => event.extraType), ["wide"]);
  assert.equal(afterSingle.legalBalls, 7);
  assert.deepEqual(
    afterSingle.currentOverEvents.map((event) => event.id),
    [wide.id, single.id]
  );
});

test("Quick Scoring keeps first no-ball in the new over before the next boundary", () => {
  const firstOver = quickLegalOver(1, "aninda");
  const noBall = quickEvent(7, {
    bowlerId: "dipanjan",
    extraType: "no_ball",
    extras: 1
  });
  const four = quickEvent(8, {
    bowlerId: "dipanjan",
    batterRuns: 4
  });
  const afterNoBall = deriveQuickScoringInnings(quickInput([...firstOver, noBall]));
  const afterFour = deriveQuickScoringInnings(
    quickInput([...firstOver, noBall, four])
  );

  assert.equal(afterNoBall.legalBalls, 6);
  assert.equal(afterNoBall.isBetweenOvers, false);
  assert.deepEqual(afterNoBall.currentOverEvents.map((event) => event.extraType), ["no_ball"]);
  assert.equal(afterFour.legalBalls, 7);
  assert.deepEqual(
    afterFour.currentOverEvents.map((event) => event.id),
    [noBall.id, four.id]
  );
});

test("Quick Scoring undo removes a first wide or no-ball from the new over immediately", () => {
  for (const extraType of ["wide", "no_ball"] as const) {
    const quickScoring = {
      ...createEmptyQuickScoringMetadata(),
      inningsBEvents: [
        ...quickLegalOver(1, "aninda"),
        quickEvent(7, { bowlerId: "dipanjan", extraType, extras: 1 })
      ]
    };
    const withExtra = deriveQuickScoringInnings(quickInput(quickScoring.inningsBEvents));
    const undone = undoLastQuickScoringEvent(quickScoring, "teamB");
    const afterUndo = deriveQuickScoringInnings(quickInput(undone.inningsBEvents));

    assert.equal(withExtra.currentOverEvents.length, 1, extraType);
    assert.equal(withExtra.legalBalls, 6, extraType);
    assert.equal(withExtra.isBetweenOvers, false, extraType);
    assert.equal(afterUndo.currentOverEvents.length, 0, extraType);
    assert.equal(afterUndo.lastCompletedOverEvents.length, 6, extraType);
    assert.equal(afterUndo.legalBalls, 6, extraType);
    assert.equal(afterUndo.isBetweenOvers, true, extraType);
  }
});

test("Quick Scoring groups mixed first-event wides and no-balls across four overs", () => {
  const overOne = quickLegalOver(1, "aninda");
  const overTwoWide = quickEvent(7, {
    bowlerId: "dipanjan",
    extraType: "wide",
    extras: 1
  });
  const overTwoLegalBalls = quickLegalOver(8, "dipanjan");
  const overThreeNoBall = quickEvent(14, {
    bowlerId: "utpal",
    extraType: "no_ball",
    extras: 1
  });
  const overThreeLegalBalls = quickLegalOver(15, "utpal");
  const overFourWide = quickEvent(21, {
    bowlerId: "dheeraj",
    extraType: "wide",
    extras: 1
  });
  const overFourSingle = quickEvent(22, {
    bowlerId: "dheeraj",
    batterRuns: 1
  });
  const derived = deriveQuickScoringInnings(
    quickInput([
      ...overOne,
      overTwoWide,
      ...overTwoLegalBalls,
      overThreeNoBall,
      ...overThreeLegalBalls,
      overFourWide,
      overFourSingle
    ])
  );

  assert.equal(derived.legalBalls, 19);
  assert.equal(derived.isBetweenOvers, false);
  assert.equal(derived.bowlingOvers[0]?.overNumber, 1);
  assert.equal(derived.bowlingOvers[1]?.overNumber, 2);
  assert.equal(derived.bowlingOvers[2]?.overNumber, 3);
  assert.equal(derived.bowlingOvers[3]?.overNumber, 4);
  assert.equal(derived.bowlingOvers[1]?.legalBalls, 6);
  assert.equal(derived.bowlingOvers[1]?.runsConceded, 1);
  assert.equal(derived.bowlingOvers[2]?.legalBalls, 6);
  assert.equal(derived.bowlingOvers[2]?.runsConceded, 1);
  assert.deepEqual(
    derived.currentOverEvents.map((event) => event.id),
    [overFourWide.id, overFourSingle.id]
  );
});

test("Quick Scoring derives bowled caught and run-out wickets with correct credits", () => {
  const derived = deriveQuickScoringInnings(
    quickInput([
      quickEvent(1, {
        wicket: {
          type: "bowled",
          dismissedPlayerId: "naim",
          fielderId: null,
          newBatterId: "soman",
          completedRuns: 0
        }
      }),
      quickEvent(2, {
        strikerId: "soman",
        nonStrikerId: "saurav",
        wicket: {
          type: "caught",
          dismissedPlayerId: "soman",
          fielderId: "aninda",
          newBatterId: "rohit",
          completedRuns: 0
        }
      }),
      quickEvent(3, {
        strikerId: "rohit",
        nonStrikerId: "saurav",
        batterRuns: 1,
        wicket: {
          type: "run_out",
          dismissedPlayerId: "saurav",
          fielderId: "dipanjan",
          newBatterId: "amrit",
          completedRuns: 1
        }
      })
    ])
  );
  const dismissals = derived.bowlingOvers.flatMap((over) => over.dismissals);

  assert.equal(derived.wicketsLost, 3);
  assert.deepEqual(derived.battingOrder, ["naim", "saurav", "soman", "rohit", "amrit"]);
  assert.equal(dismissals[0]?.creditedBowlerId, "aninda");
  assert.equal(dismissals[1]?.fielderId, "aninda");
  assert.equal(dismissals[2]?.type, "run_out");
  assert.equal(dismissals[2]?.creditedBowlerId, null);
  assert.equal(dismissals[2]?.fielderId, "dipanjan");
});

test("Quick Scoring undo and current-over correction replay event history", () => {
  const quickScoring = createEmptyQuickScoringMetadata();
  const first = quickEvent(1, { batterRuns: 4 });
  const second = quickEvent(2, { strikerId: "naim", nonStrikerId: "saurav", batterRuns: 6 });
  const withEvents = {
    ...quickScoring,
    inningsBEvents: [first, second]
  };
  const corrected = replaceQuickScoringEvent(withEvents, "teamB", {
    ...second,
    batterRuns: 0
  });
  const afterCorrection = deriveQuickScoringInnings(
    quickInput(corrected.inningsBEvents)
  );
  const undone = undoLastQuickScoringEvent(corrected, "teamB");
  const afterUndo = deriveQuickScoringInnings(quickInput(undone.inningsBEvents));

  assert.equal(afterCorrection.runs, 4);
  assert.equal(afterUndo.runs, 4);
  assert.equal(afterUndo.legalBalls, 1);
});

test("Quick Scoring output remains compatible with validation and XP calculation", () => {
  const derived = deriveQuickScoringInnings(
    quickInput([
      quickEvent(1, { batterRuns: 4 }),
      quickEvent(2, { strikerId: "naim", nonStrikerId: "saurav", batterRuns: 1 }),
      quickEvent(3, { strikerId: "saurav", nonStrikerId: "naim", batterRuns: 0 })
    ])
  );
  const errors = validateMatchRecordInput(
    validationInput({
      status: "finalised",
      availablePlayerIds: [
        "naim",
        "saurav",
        "soman",
        "rohit",
        "amrit",
        "suprateem",
        "aninda",
        "dipanjan",
        "utpal",
        "dheeraj",
        "chaitanya",
        "biplab"
      ],
      battingFirstTeamId: "teamB",
      teamAPlayerIds: ["aninda", "dipanjan", "utpal", "dheeraj", "chaitanya", "biplab"],
      teamBPlayerIds: ["naim", "saurav", "soman", "rohit", "amrit", "suprateem"],
      performances: [
        ...derived.battingPerformances,
        performance("aninda", "teamA", 0),
        performance("dipanjan", "teamA", 0),
        performance("utpal", "teamA", 0),
        performance("dheeraj", "teamA", 0),
        performance("chaitanya", "teamA", 0),
        performance("biplab", "teamA", 0)
      ],
      bowlingOvers: {
        teamA: derived.bowlingOvers,
        teamB: []
      }
    })
  );
  const xp = calculateMatchXP(derived.battingPerformances[0], {
    result: {
      type: "win_by_runs",
      winnerTeamId: "teamB",
      loserTeamId: "teamA",
      marginRuns: 5
    },
    teamWon: true,
    overs: []
  });

  assert.equal(errors.length, 0);
  assert.ok(xp > 0);
});

test("Quick Scoring rejects identical striker and non-striker pairs", () => {
  const derived = deriveQuickScoringInnings(
    quickInput([
      quickEvent(1, {
        strikerId: "naim",
        nonStrikerId: "naim",
        batterRuns: 4
      })
    ])
  );

  assert.equal(derived.runs, 0);
  assert.match(derived.missingInformation.join(" "), /same striker and non-striker/);
});

test("Quick Scoring keeps DNB players false until they enter the innings", () => {
  const derived = deriveQuickScoringInnings(
    quickInput([quickEvent(1, { batterRuns: 1 })])
  );

  assert.equal(
    derived.battingPerformances.find((row) => row.playerId === "soman")?.didBat,
    false
  );
  assert.equal(
    derived.battingPerformances.find((row) => row.playerId === "naim")?.didBat,
    true
  );
  assert.equal(
    derived.battingPerformances.find((row) => row.playerId === "saurav")?.didBat,
    true
  );
});

test("Quick Scoring rejects a dismissed batter returning as active batter", () => {
  const derived = deriveQuickScoringInnings(
    quickInput([
      quickEvent(1, {
        wicket: {
          type: "bowled",
          dismissedPlayerId: "naim",
          fielderId: null,
          newBatterId: "soman",
          completedRuns: 0
        }
      }),
      quickEvent(2, {
        strikerId: "naim",
        nonStrikerId: "saurav",
        batterRuns: 4
      })
    ])
  );

  assert.equal(derived.runs, 0);
  assert.match(derived.missingInformation.join(" "), /already out/);
});

test("Quick Scoring excludes only the immediately previous over bowler", () => {
  const events = [
    ...quickLegalOver(1, "aninda"),
    ...quickLegalOver(7, "dipanjan", {
      strikerId: "saurav",
      nonStrikerId: "naim"
    }),
    quickEvent(13, {
      strikerId: "naim",
      nonStrikerId: "saurav",
      bowlerId: "aninda",
      batterRuns: 2
    })
  ];
  const derived = deriveQuickScoringInnings(quickInput(events));

  assert.equal(derived.bowlingOvers[0]?.bowlerId, "aninda");
  assert.equal(derived.bowlingOvers[1]?.bowlerId, "dipanjan");
  assert.equal(derived.bowlingOvers[2]?.bowlerId, "aninda");
  assert.deepEqual(derived.missingInformation, []);
});

test("Quick Scoring rejects the same bowler for consecutive overs", () => {
  const derived = deriveQuickScoringInnings(
    quickInput([
      ...quickLegalOver(1, "aninda"),
      quickEvent(7, {
        strikerId: "saurav",
        nonStrikerId: "naim",
        bowlerId: "aninda",
        batterRuns: 1
      })
    ])
  );

  assert.equal(derived.legalBalls, 7);
  assert.equal(derived.bowlingOvers[0]?.bowlerId, "aninda");
  assert.equal(derived.bowlingOvers[1]?.bowlerId, "aninda");
  assert.match(derived.missingInformation.join(" "), /Over 2 uses the same bowler as Over 1/);
});

test("Quick Scoring keeps invalid repeated-bowler overs counted and reports once per over", () => {
  const derived = deriveQuickScoringInnings(
    quickInput([
      ...quickLegalOver(1, "aninda"),
      ...quickLegalOver(7, "aninda")
    ])
  );

  assert.equal(derived.legalBalls, 12);
  assert.equal(derived.completedOvers, 2);
  assert.equal(derived.bowlingOvers.length, 2);
  assert.deepEqual(derived.bowlingOvers.map((over) => over.legalBalls), [6, 6]);
  assert.deepEqual(derived.missingInformation, [
    "Over 2 uses the same bowler as Over 1."
  ]);
});

test("Quick Scoring reports separate repeated-bowler violations for separate overs", () => {
  const derived = deriveQuickScoringInnings(
    quickInput([
      ...quickLegalOver(1, "aninda"),
      ...quickLegalOver(7, "aninda"),
      ...quickLegalOver(13, "dipanjan"),
      ...quickLegalOver(19, "dipanjan")
    ])
  );

  assert.equal(derived.legalBalls, 24);
  assert.deepEqual(derived.missingInformation, [
    "Over 2 uses the same bowler as Over 1.",
    "Over 4 uses the same bowler as Over 3."
  ]);
});

test("Quick Scoring sixth-ball undo reopens the over", () => {
  const quickScoring = {
    ...createEmptyQuickScoringMetadata(),
    inningsBEvents: quickLegalOver(1, "aninda")
  };
  const undone = undoLastQuickScoringEvent(quickScoring, "teamB");
  const derived = deriveQuickScoringInnings(quickInput(undone.inningsBEvents));

  assert.equal(derived.legalBalls, 5);
  assert.equal(formatInningsScore(derived.runs, derived.wicketsLost), "0/0");
  assert.equal(derived.currentOverEvents.length, 5);
  assert.equal(derived.previousOverBowlerId, null);
  assert.equal(derived.currentBowlerId, "aninda");
});

test("Quick Scoring final-over sixth-ball undo restores editable over state", () => {
  const quickScoring = {
    ...createEmptyQuickScoringMetadata(),
    inningsBEvents: quickLegalOver(1, "aninda", { batterRuns: 1 })
  };
  const complete = deriveQuickScoringInnings(quickInput(quickScoring.inningsBEvents));
  const undone = undoLastQuickScoringEvent(quickScoring, "teamB");
  const reopened = deriveQuickScoringInnings(quickInput(undone.inningsBEvents));

  assert.equal(complete.legalBalls, 6);
  assert.equal(reopened.legalBalls, 5);
  assert.equal(reopened.runs, 5);
  assert.equal(reopened.currentOverEvents.length, 5);
});

test("Quick Scoring run-out of striker calculates next pair and gives no bowler wicket", () => {
  const derived = deriveQuickScoringInnings(
    quickInput([
      quickEvent(1, {
        batterRuns: 1,
        wicket: {
          type: "run_out",
          dismissedPlayerId: "naim",
          fielderId: "aninda",
          newBatterId: "soman",
          completedRuns: 1
        }
      })
    ])
  );
  const dismissal = derived.bowlingOvers[0]?.dismissals[0];

  assert.equal(derived.runs, 1);
  assert.equal(dismissal?.type, "run_out");
  assert.equal(dismissal?.creditedBowlerId, null);
  assert.equal(derived.currentStrikerId, "saurav");
  assert.equal(derived.currentNonStrikerId, "soman");
  assert.equal(
    derived.battingPerformances.find((row) => row.playerId === "soman")?.battingPosition,
    3
  );
  assert.deepEqual(derived.missingInformation, []);
});

test("Quick Scoring run-out of non-striker marks exactly that batter out", () => {
  const derived = deriveQuickScoringInnings(
    quickInput([
      quickEvent(1, {
        batterRuns: 0,
        wicket: {
          type: "run_out",
          dismissedPlayerId: "saurav",
          fielderId: "dipanjan",
          newBatterId: "soman",
          completedRuns: 0
        }
      })
    ])
  );

  assert.equal(
    derived.battingPerformances.find((row) => row.playerId === "saurav")?.wasOut,
    true
  );
  assert.equal(
    derived.battingPerformances.find((row) => row.playerId === "naim")?.wasOut,
    false
  );
  assert.equal(derived.currentStrikerId, "naim");
  assert.equal(derived.currentNonStrikerId, "soman");
});

test("Quick Scoring run-out parity automatically resolves active batters", () => {
  const cases = [
    {
      name: "striker 0",
      dismissedPlayerId: "naim",
      completedRuns: 0,
      expectedStrikerId: "soman",
      expectedNonStrikerId: "saurav"
    },
    {
      name: "striker 1",
      dismissedPlayerId: "naim",
      completedRuns: 1,
      expectedStrikerId: "saurav",
      expectedNonStrikerId: "soman"
    },
    {
      name: "striker 2",
      dismissedPlayerId: "naim",
      completedRuns: 2,
      expectedStrikerId: "soman",
      expectedNonStrikerId: "saurav"
    },
    {
      name: "non-striker 0",
      dismissedPlayerId: "saurav",
      completedRuns: 0,
      expectedStrikerId: "naim",
      expectedNonStrikerId: "soman"
    },
    {
      name: "non-striker 1",
      dismissedPlayerId: "saurav",
      completedRuns: 1,
      expectedStrikerId: "soman",
      expectedNonStrikerId: "naim"
    },
    {
      name: "non-striker 2",
      dismissedPlayerId: "saurav",
      completedRuns: 2,
      expectedStrikerId: "naim",
      expectedNonStrikerId: "soman"
    }
  ];

  for (const testCase of cases) {
    const derived = deriveQuickScoringInnings(
      quickInput([
        quickEvent(1, {
          batterRuns: testCase.completedRuns,
          wicket: {
            type: "run_out",
            dismissedPlayerId: testCase.dismissedPlayerId,
            fielderId: "aninda",
            newBatterId: "soman",
            completedRuns: testCase.completedRuns
          }
        })
      ])
    );

    assert.equal(derived.currentStrikerId, testCase.expectedStrikerId, testCase.name);
    assert.equal(derived.currentNonStrikerId, testCase.expectedNonStrikerId, testCase.name);
    assert.deepEqual(derived.missingInformation, [], testCase.name);
  }
});

test("Quick Scoring sixth-ball run-out applies end-of-over swap and undo replays cleanly", () => {
  const runOutEvent = quickEvent(6, {
    batterRuns: 1,
    wicket: {
      type: "run_out",
      dismissedPlayerId: "naim",
      fielderId: "dipanjan",
      newBatterId: "soman",
      completedRuns: 1
    }
  });
  const quickScoring = {
    ...createEmptyQuickScoringMetadata(),
    inningsBEvents: [
      ...quickLegalOver(1, "aninda").slice(0, 5),
      runOutEvent
    ]
  };
  const complete = deriveQuickScoringInnings(quickInput(quickScoring.inningsBEvents));
  const undone = undoLastQuickScoringEvent(quickScoring, "teamB");
  const replayed = deriveQuickScoringInnings(quickInput(quickScoring.inningsBEvents));
  const reopened = deriveQuickScoringInnings(quickInput(undone.inningsBEvents));
  const dismissal = complete.bowlingOvers[0]?.dismissals[0];

  assert.equal(complete.legalBalls, 6);
  assert.equal(complete.currentBowlerId, null);
  assert.equal(complete.previousOverBowlerId, "aninda");
  assert.equal(complete.currentStrikerId, "soman");
  assert.equal(complete.currentNonStrikerId, "saurav");
  assert.equal(complete.wicketsLost, 1);
  assert.equal(dismissal?.creditedBowlerId, null);
  assert.equal(dismissal?.fielderId, "dipanjan");
  assert.equal(
    complete.battingPerformances.find((row) => row.playerId === "soman")?.battingPosition,
    3
  );
  assert.deepEqual(replayed, complete);
  assert.equal(reopened.legalBalls, 5);
  assert.equal(reopened.wicketsLost, 0);
  assert.equal(reopened.currentOverEvents.length, 5);
  assert.equal(reopened.currentStrikerId, "naim");
  assert.equal(reopened.currentNonStrikerId, "saurav");
});

test("Quick Scoring no-ball supports batter runs without legal delivery", () => {
  const derived = deriveQuickScoringInnings(
    quickInput([
      quickEvent(1, {
        batterRuns: 4,
        extraType: "no_ball",
        extras: 1
      })
    ])
  );

  assert.equal(derived.runs, 5);
  assert.equal(derived.extras, 1);
  assert.equal(derived.legalBalls, 0);
  assert.equal(derived.bowlingOvers[0]?.runsConceded, 5);
  assert.equal(
    derived.battingPerformances.find((row) => row.playerId === "naim")?.runs,
    4
  );
});

test("Quick Scoring reducer rejects an opposite-team bowler", () => {
  const derived = deriveQuickScoringInnings(
    quickInput([
      quickEvent(1, {
        bowlerId: "naim",
        batterRuns: 4
      })
    ])
  );

  assert.equal(derived.runs, 0);
  assert.match(derived.missingInformation.join(" "), /ineligible bowler/);
});

test("Quick Scoring reducer reports an opposite-team run-out fielder", () => {
  const derived = deriveQuickScoringInnings(
    quickInput([
      quickEvent(1, {
        wicket: {
          type: "run_out",
          dismissedPlayerId: "naim",
          fielderId: "saurav",
          newBatterId: "soman",
          completedRuns: 0,
          nextStrikerId: "soman",
          nextNonStrikerId: "saurav"
        }
      })
    ])
  );

  assert.match(derived.missingInformation.join(" "), /ineligible fielder/);
});

test("Quick Scoring reducer accepts Fielding Helper catches and run-outs without making them bowlers", () => {
  const helperRunOut = deriveQuickScoringInnings(
    quickInput(
      [
        quickEvent(1, {
          wicket: {
            type: "run_out",
            dismissedPlayerId: "naim",
            fielderId: "rohit",
            newBatterId: "soman",
            completedRuns: 0,
            nextStrikerId: "soman",
            nextNonStrikerId: "saurav"
          }
        })
      ],
      {
        fieldingPlayerIds: [
          "aninda",
          "dipanjan",
          "utpal",
          "dheeraj",
          "chaitanya",
          "biplab",
          "rohit"
        ]
      }
    )
  );
  const helperBowler = deriveQuickScoringInnings(
    quickInput(
      [
        quickEvent(1, {
          bowlerId: "saurav",
          batterRuns: 1
        })
      ],
      {
        fieldingPlayerIds: [
          "aninda",
          "dipanjan",
          "utpal",
          "dheeraj",
          "chaitanya",
          "biplab",
          "saurav"
        ]
      }
    )
  );

  assert.deepEqual(helperRunOut.missingInformation, []);
  assert.equal(helperRunOut.bowlingOvers[0]?.dismissals[0]?.fielderId, "rohit");
  assert.match(helperBowler.missingInformation.join(" "), /ineligible bowler/);
});

test("Quick Scoring reducer requires a new batter before all-out", () => {
  const derived = deriveQuickScoringInnings(
    quickInput([
      quickEvent(1, {
        wicket: {
          type: "bowled",
          dismissedPlayerId: "naim",
          fielderId: null,
          newBatterId: null,
          completedRuns: 0
        }
      })
    ])
  );

  assert.match(derived.missingInformation.join(" "), /Missing new batter/);
});

test("Quick Scoring two-batter mode lets the last undismissed batter continue solo", () => {
  const derived = deriveQuickScoringInnings(
    quickInput(
      [
        quickEvent(1, {
          wicket: {
            type: "bowled",
            dismissedPlayerId: "naim",
            fielderId: null,
            newBatterId: "soman",
            completedRuns: 0
          }
        }),
        quickEvent(2, {
          strikerId: "soman",
          nonStrikerId: "saurav",
          wicket: {
            type: "caught",
            dismissedPlayerId: "soman",
            fielderId: "aninda",
            newBatterId: null,
            completedRuns: 0
          }
        }),
        quickEvent(3, {
          strikerId: "saurav",
          nonStrikerId: "",
          batterRuns: 4
        })
      ],
      {
        battingPlayerIds: ["naim", "saurav", "soman"],
        battingMode: "two_batter"
      }
    )
  );

  assert.equal(derived.currentStrikerId, "saurav");
  assert.equal(derived.currentNonStrikerId, null);
  assert.equal(derived.isLastBatterSolo, true);
  assert.equal(
    derived.battingPerformances.find((row) => row.playerId === "saurav")?.runs,
    4
  );
  assert.deepEqual(derived.missingInformation, []);
});

test("late batter added to active two-batter innings exits Last Batter Solo without changing old events", () => {
  const events = [
    quickEvent(1, {
      wicket: {
        type: "bowled",
        dismissedPlayerId: "naim",
        fielderId: null,
        newBatterId: "soman",
        completedRuns: 0
      }
    }),
    quickEvent(2, {
      strikerId: "soman",
      nonStrikerId: "saurav",
      wicket: {
        type: "caught",
        dismissedPlayerId: "soman",
        fielderId: "aninda",
        newBatterId: null,
        completedRuns: 0
      }
    })
  ];
  const beforeLateArrival = deriveQuickScoringInnings(
    quickInput(events, {
      battingPlayerIds: ["naim", "saurav", "soman"],
      battingMode: "two_batter"
    })
  );
  const afterLateArrival = deriveQuickScoringInnings(
    quickInput(events, {
      battingPlayerIds: ["naim", "saurav", "soman", "rohit"],
      battingMode: "two_batter"
    })
  );

  assert.equal(beforeLateArrival.isLastBatterSolo, true);
  assert.equal(afterLateArrival.isLastBatterSolo, false);
  assert.equal(afterLateArrival.activeBatterCount, 1);
  assert.equal(afterLateArrival.currentStrikerId, "saurav");
  assert.equal(afterLateArrival.currentNonStrikerId, null);
  assert.equal(afterLateArrival.battingOrder.includes("rohit"), false);
});

test("late player after stored first-innings break does not require reopening old batting events", () => {
  const quickScoring = {
    ...createEmptyQuickScoringMetadata(),
    inningsPhase: "innings_break" as const,
    firstInningsCompletedAt: "2026-08-17T10:00:00.000Z",
    inningsBEvents: [
      quickEvent(1, {
        wicket: {
          type: "bowled",
          dismissedPlayerId: "naim",
          fielderId: null,
          newBatterId: "saurav",
          completedRuns: 0
        }
      }),
      quickEvent(2, {
        strikerId: "saurav",
        nonStrikerId: "",
        wicket: {
          type: "caught",
          dismissedPlayerId: "saurav",
          fielderId: "aninda",
          newBatterId: null,
          completedRuns: 0
        }
      })
    ]
  };
  const afterLateArrival = deriveQuickScoringInnings(
    quickInput(quickScoring.inningsBEvents, {
      battingPlayerIds: ["naim", "saurav", "soman"],
      battingMode: "two_batter"
    })
  );

  assert.equal(quickScoring.inningsPhase, "innings_break");
  assert.equal(Boolean(quickScoring.firstInningsCompletedAt), true);
  assert.equal(afterLateArrival.battingOrder.includes("soman"), false);
  assert.equal(afterLateArrival.wicketsLost, 2);
});

test("Quick Scoring reducer allows innings-ending wicket without a new batter", () => {
  const derived = deriveQuickScoringInnings({
    battingTeamId: "teamB",
    bowlingTeamId: "teamA",
    battingPlayerIds: ["naim", "saurav"],
    bowlingPlayerIds: ["aninda"],
    events: [
      quickEvent(1, {
        wicket: {
          type: "bowled",
          dismissedPlayerId: "naim",
          fielderId: null,
          newBatterId: null,
          completedRuns: 0
        }
      })
    ]
  });

  assert.equal(derived.wicketsLost, 1);
  assert.deepEqual(derived.missingInformation, []);
});

test("Quick Scoring single-batter mode does not require a non-striker or strike swaps", () => {
  const derived = deriveQuickScoringInnings(
    quickInput(
      [
        quickEvent(1, {
          nonStrikerId: "",
          batterRuns: 1
        }),
        quickEvent(2, {
          nonStrikerId: "",
          batterRuns: 2
        })
      ],
      { battingMode: "single_batter" }
    )
  );

  assert.equal(derived.battingMode, "single_batter");
  assert.equal(derived.currentStrikerId, "naim");
  assert.equal(derived.currentNonStrikerId, null);
  assert.equal(derived.isLastBatterSolo, false);
  assert.equal(
    derived.battingPerformances.find((row) => row.playerId === "naim")?.runs,
    3
  );
  assert.deepEqual(derived.missingInformation, []);
});

test("Quick Scoring single-batter mode brings the next batter after a wicket", () => {
  const derived = deriveQuickScoringInnings(
    quickInput(
      [
        quickEvent(1, {
          nonStrikerId: "",
          wicket: {
            type: "bowled",
            dismissedPlayerId: "naim",
            fielderId: null,
            newBatterId: "saurav",
            completedRuns: 0
          }
        }),
        quickEvent(2, {
          strikerId: "saurav",
          nonStrikerId: "",
          batterRuns: 6
        })
      ],
      { battingMode: "single_batter" }
    )
  );

  assert.equal(derived.currentStrikerId, "saurav");
  assert.equal(derived.currentNonStrikerId, null);
  assert.equal(
    derived.battingPerformances.find((row) => row.playerId === "saurav")?.battingPosition,
    2
  );
  assert.equal(
    derived.battingPerformances.find((row) => row.playerId === "saurav")?.runs,
    6
  );
  assert.deepEqual(derived.missingInformation, []);
});

test("Quick Scoring two-batter mode keeps a four-player innings alive after three wickets", () => {
  const derived = deriveQuickScoringInnings(
    quickInput(
      [
        quickEvent(1, {
          wicket: {
            type: "bowled",
            dismissedPlayerId: "naim",
            fielderId: null,
            newBatterId: "soman",
            completedRuns: 0
          }
        }),
        quickEvent(2, {
          strikerId: "soman",
          nonStrikerId: "saurav",
          wicket: {
            type: "caught",
            dismissedPlayerId: "soman",
            fielderId: "aninda",
            newBatterId: "rohit",
            completedRuns: 0
          }
        }),
        quickEvent(3, {
          strikerId: "rohit",
          nonStrikerId: "saurav",
          wicket: {
            type: "bowled",
            dismissedPlayerId: "rohit",
            fielderId: null,
            newBatterId: null,
            completedRuns: 0
          }
        })
      ],
      {
        battingPlayerIds: ["naim", "saurav", "soman", "rohit"],
        battingMode: "two_batter"
      }
    )
  );
  const state = getInningsState({
    battingTeamId: "teamB",
    bowlingTeamId: "teamA",
    battingPlayerCount: 4,
    bowlingOvers: derived.bowlingOvers,
    scheduledOvers: 2,
    runs: derived.runs
  });

  assert.equal(derived.wicketsLost, 3);
  assert.equal(derived.isLastBatterSolo, true);
  assert.equal(state.isComplete, false);
});

test("Quick Scoring two-batter mode ends a four-player innings on the fourth wicket", () => {
  const derived = deriveQuickScoringInnings(
    quickInput(
      [
        quickEvent(1, {
          wicket: {
            type: "bowled",
            dismissedPlayerId: "naim",
            fielderId: null,
            newBatterId: "soman",
            completedRuns: 0
          }
        }),
        quickEvent(2, {
          strikerId: "soman",
          nonStrikerId: "saurav",
          wicket: {
            type: "caught",
            dismissedPlayerId: "soman",
            fielderId: "aninda",
            newBatterId: "rohit",
            completedRuns: 0
          }
        }),
        quickEvent(3, {
          strikerId: "rohit",
          nonStrikerId: "saurav",
          wicket: {
            type: "bowled",
            dismissedPlayerId: "rohit",
            fielderId: null,
            newBatterId: null,
            completedRuns: 0
          }
        }),
        quickEvent(4, {
          strikerId: "saurav",
          nonStrikerId: "",
          wicket: {
            type: "run_out",
            dismissedPlayerId: "saurav",
            fielderId: "aninda",
            newBatterId: null,
            completedRuns: 0
          }
        })
      ],
      {
        battingPlayerIds: ["naim", "saurav", "soman", "rohit"],
        battingMode: "two_batter"
      }
    )
  );
  const state = getInningsState({
    battingTeamId: "teamB",
    bowlingTeamId: "teamA",
    battingPlayerCount: 4,
    bowlingOvers: derived.bowlingOvers,
    scheduledOvers: 2,
    runs: derived.runs
  });

  assert.equal(derived.wicketsLost, 4);
  assert.equal(state.isAllOut, true);
  assert.equal(state.isComplete, true);
  assert.equal(state.endReason, "all_out");
});

test("Quick Scoring single-batter mode ends a four-player innings only after four wickets", () => {
  const firstThree = [
    quickEvent(1, {
      nonStrikerId: "",
      wicket: {
        type: "bowled",
        dismissedPlayerId: "naim",
        fielderId: null,
        newBatterId: "saurav",
        completedRuns: 0
      }
    }),
    quickEvent(2, {
      strikerId: "saurav",
      nonStrikerId: "",
      wicket: {
        type: "bowled",
        dismissedPlayerId: "saurav",
        fielderId: null,
        newBatterId: "soman",
        completedRuns: 0
      }
    }),
    quickEvent(3, {
      strikerId: "soman",
      nonStrikerId: "",
      wicket: {
        type: "bowled",
        dismissedPlayerId: "soman",
        fielderId: null,
        newBatterId: "rohit",
        completedRuns: 0
      }
    })
  ];
  const input = {
    battingPlayerIds: ["naim", "saurav", "soman", "rohit"],
    battingMode: "single_batter" as const
  };
  const afterThree = deriveQuickScoringInnings(quickInput(firstThree, input));
  const allOut = deriveQuickScoringInnings(
    quickInput(
      [
        ...firstThree,
        quickEvent(4, {
          strikerId: "rohit",
          nonStrikerId: "",
          wicket: {
            type: "run_out",
            dismissedPlayerId: "rohit",
            fielderId: "aninda",
            newBatterId: null,
            completedRuns: 1
          }
        })
      ],
      input
    )
  );

  assert.equal(getInningsState({
    battingTeamId: "teamB",
    bowlingTeamId: "teamA",
    battingPlayerCount: 4,
    bowlingOvers: afterThree.bowlingOvers,
    scheduledOvers: 2,
    runs: afterThree.runs
  }).isComplete, false);
  assert.equal(getInningsState({
    battingTeamId: "teamB",
    bowlingTeamId: "teamA",
    battingPlayerCount: 4,
    bowlingOvers: allOut.bowlingOvers,
    scheduledOvers: 2,
    runs: allOut.runs
  }).endReason, "all_out");
});

test("Quick Scoring rejects duplicate dismissed-player events without inflating wickets", () => {
  const derived = deriveQuickScoringInnings(
    quickInput([
      quickEvent(1, {
        wicket: {
          type: "bowled",
          dismissedPlayerId: "naim",
          fielderId: null,
          newBatterId: "soman",
          completedRuns: 0
        }
      }),
      quickEvent(2, {
        strikerId: "soman",
        nonStrikerId: "saurav",
        wicket: {
          type: "run_out",
          dismissedPlayerId: "naim",
          fielderId: "aninda",
          newBatterId: "rohit",
          completedRuns: 0
        }
      })
    ])
  );

  assert.equal(derived.wicketsLost, 1);
  assert.match(derived.missingInformation.join(" "), /already out|not active/);
});

test("three-player innings ends only after three unique dismissals", () => {
  const derived = deriveQuickScoringInnings(
    quickInput(
      [
        quickEvent(1, {
          wicket: {
            type: "bowled",
            dismissedPlayerId: "naim",
            fielderId: null,
            newBatterId: "soman",
            completedRuns: 0
          }
        }),
        quickEvent(2, {
          strikerId: "soman",
          nonStrikerId: "saurav",
          wicket: {
            type: "caught",
            dismissedPlayerId: "soman",
            fielderId: "aninda",
            newBatterId: null,
            completedRuns: 0
          }
        }),
        quickEvent(3, {
          strikerId: "saurav",
          nonStrikerId: "",
          wicket: {
            type: "bowled",
            dismissedPlayerId: "saurav",
            fielderId: null,
            newBatterId: null,
            completedRuns: 0
          }
        })
      ],
      {
        battingPlayerIds: ["naim", "saurav", "soman"],
        battingMode: "two_batter"
      }
    )
  );

  assert.equal(getInningsState({
    battingTeamId: "teamB",
    bowlingTeamId: "teamA",
    battingPlayerCount: 3,
    bowlingOvers: derived.bowlingOvers,
    scheduledOvers: 2,
    runs: derived.runs
  }).endReason, "all_out");
});

test("second innings two-batter final wicket undo reopens all-out innings", () => {
  const events = [
    quickEvent(1, {
      wicket: {
        type: "bowled",
        dismissedPlayerId: "naim",
        fielderId: null,
        newBatterId: "soman",
        completedRuns: 0
      }
    }),
    quickEvent(2, {
      strikerId: "soman",
      nonStrikerId: "saurav",
      wicket: {
        type: "caught",
        dismissedPlayerId: "soman",
        fielderId: "aninda",
        newBatterId: "rohit",
        completedRuns: 0
      }
    }),
    quickEvent(3, {
      strikerId: "rohit",
      nonStrikerId: "saurav",
      wicket: {
        type: "bowled",
        dismissedPlayerId: "rohit",
        fielderId: null,
        newBatterId: null,
        completedRuns: 0
      }
    }),
    quickEvent(4, {
      strikerId: "saurav",
      nonStrikerId: "",
      wicket: {
        type: "caught",
        dismissedPlayerId: "saurav",
        fielderId: "aninda",
        newBatterId: null,
        completedRuns: 0
      }
    })
  ];
  const quickScoring = {
    ...createEmptyQuickScoringMetadata(),
    inningsPhase: "second_innings" as const,
    inningsBEvents: events
  };
  const complete = deriveQuickScoringInnings(
    quickInput(quickScoring.inningsBEvents, {
      battingPlayerIds: ["naim", "saurav", "soman", "rohit"],
      battingMode: "two_batter"
    })
  );
  const reopenedMetadata = undoLastQuickScoringEvent(quickScoring, "teamB");
  const reopened = deriveQuickScoringInnings(
    quickInput(reopenedMetadata.inningsBEvents, {
      battingPlayerIds: ["naim", "saurav", "soman", "rohit"],
      battingMode: "two_batter"
    })
  );

  assert.equal(getInningsState({
    battingTeamId: "teamB",
    bowlingTeamId: "teamA",
    battingPlayerCount: 4,
    bowlingOvers: complete.bowlingOvers,
    scheduledOvers: 2,
    runs: complete.runs
  }).endReason, "all_out");
  assert.equal(reopenedMetadata.inningsPhase, "second_innings");
  assert.equal(reopened.wicketsLost, 3);
  assert.equal(reopened.currentStrikerId, "saurav");
  assert.equal(reopened.currentNonStrikerId, null);
  assert.equal(reopened.isLastBatterSolo, true);
  assert.equal(getInningsState({
    battingTeamId: "teamB",
    bowlingTeamId: "teamA",
    battingPlayerCount: 4,
    bowlingOvers: reopened.bowlingOvers,
    scheduledOvers: 2,
    runs: reopened.runs
  }).isComplete, false);
});

test("second innings single-batter final wicket undo restores the active batter", () => {
  const input = {
    battingPlayerIds: ["naim", "saurav", "soman", "rohit"],
    battingMode: "single_batter" as const
  };
  const events = [
    quickEvent(1, {
      nonStrikerId: "",
      wicket: {
        type: "bowled",
        dismissedPlayerId: "naim",
        fielderId: null,
        newBatterId: "saurav",
        completedRuns: 0
      }
    }),
    quickEvent(2, {
      strikerId: "saurav",
      nonStrikerId: "",
      wicket: {
        type: "bowled",
        dismissedPlayerId: "saurav",
        fielderId: null,
        newBatterId: "soman",
        completedRuns: 0
      }
    }),
    quickEvent(3, {
      strikerId: "soman",
      nonStrikerId: "",
      wicket: {
        type: "bowled",
        dismissedPlayerId: "soman",
        fielderId: null,
        newBatterId: "rohit",
        completedRuns: 0
      }
    }),
    quickEvent(4, {
      strikerId: "rohit",
      nonStrikerId: "",
      wicket: {
        type: "run_out",
        dismissedPlayerId: "rohit",
        fielderId: "aninda",
        newBatterId: null,
        completedRuns: 0
      }
    })
  ];
  const quickScoring = {
    ...createEmptyQuickScoringMetadata(),
    inningsPhase: "second_innings" as const,
    battingMode: "single_batter" as const,
    inningsBEvents: events
  };
  const reopened = deriveQuickScoringInnings(
    quickInput(undoLastQuickScoringEvent(quickScoring, "teamB").inningsBEvents, input)
  );

  assert.equal(reopened.wicketsLost, 3);
  assert.equal(reopened.currentStrikerId, "rohit");
  assert.equal(reopened.currentNonStrikerId, null);
  assert.equal(reopened.battingMode, "single_batter");
  assert.equal(getInningsState({
    battingTeamId: "teamB",
    bowlingTeamId: "teamA",
    battingPlayerCount: 4,
    bowlingOvers: reopened.bowlingOvers,
    scheduledOvers: 2,
    runs: reopened.runs
  }).isComplete, false);
});

test("second innings final scheduled legal ball undo reopens the over", () => {
  const quickScoring = {
    ...createEmptyQuickScoringMetadata(),
    inningsPhase: "second_innings" as const,
    inningsBEvents: [
      ...quickLegalOver(1, "aninda"),
      ...quickLegalOver(7, "dipanjan").slice(0, 5),
      quickEvent(12, {
        strikerId: "saurav",
        nonStrikerId: "naim",
        bowlerId: "dipanjan",
        batterRuns: 0
      })
    ]
  };
  const complete = deriveQuickScoringInnings(quickInput(quickScoring.inningsBEvents));
  const reopened = deriveQuickScoringInnings(
    quickInput(undoLastQuickScoringEvent(quickScoring, "teamB").inningsBEvents)
  );

  assert.equal(getInningsState({
    battingTeamId: "teamB",
    bowlingTeamId: "teamA",
    battingPlayerCount: 4,
    bowlingOvers: complete.bowlingOvers,
    scheduledOvers: 2,
    runs: complete.runs
  }).endReason, "overs_completed");
  assert.equal(reopened.legalBalls, 11);
  assert.equal(formatCricketOversFromLegalBalls(reopened.legalBalls), "1.5");
  assert.equal(reopened.currentBowlerId, "dipanjan");
  assert.equal(getInningsState({
    battingTeamId: "teamB",
    bowlingTeamId: "teamA",
    battingPlayerCount: 4,
    bowlingOvers: reopened.bowlingOvers,
    scheduledOvers: 2,
    runs: reopened.runs
  }).isComplete, false);
});

test("second innings target-reaching delivery undo restores chase below target", () => {
  const quickScoring = {
    ...createEmptyQuickScoringMetadata(),
    inningsPhase: "second_innings" as const,
    inningsBEvents: [
      quickEvent(1, { batterRuns: 4 }),
      quickEvent(2, { strikerId: "naim", nonStrikerId: "saurav", batterRuns: 3 }),
      quickEvent(3, { strikerId: "saurav", nonStrikerId: "naim", batterRuns: 4 }),
      quickEvent(4, { strikerId: "saurav", nonStrikerId: "naim", batterRuns: 1 })
    ]
  };
  const complete = deriveQuickScoringInnings(quickInput(quickScoring.inningsBEvents));
  const reopened = deriveQuickScoringInnings(
    quickInput(undoLastQuickScoringEvent(quickScoring, "teamB").inningsBEvents)
  );

  assert.equal(complete.runs, 12);
  assert.equal(getInningsState({
    battingTeamId: "teamB",
    bowlingTeamId: "teamA",
    battingPlayerCount: 4,
    bowlingOvers: complete.bowlingOvers,
    scheduledOvers: 2,
    runs: complete.runs,
    target: 12
  }).endReason, "target_reached");
  assert.equal(reopened.runs, 11);
  assert.equal(getInningsState({
    battingTeamId: "teamB",
    bowlingTeamId: "teamA",
    battingPlayerCount: 4,
    bowlingOvers: reopened.bowlingOvers,
    scheduledOvers: 2,
    runs: reopened.runs,
    target: 12
  }).isComplete, false);
  assert.equal(getLiveResultPreview({
    firstInnings: innings("teamA", 11, 3, 4),
    secondInnings: innings("teamB", reopened.runs, reopened.wicketsLost, 4),
    chasingTeamName: "Team B",
    matchStatus: "in_progress",
    firstInningsIsComplete: true
  }).headline, "TEAM B NEEDS 1 RUN");
});

test("undoing the final wicket reverses bowler catcher run-out and score credits", () => {
  const caughtEvents = [
    quickEvent(1, { batterRuns: 2 }),
    quickEvent(2, {
      strikerId: "naim",
      nonStrikerId: "saurav",
      wicket: {
        type: "caught",
        dismissedPlayerId: "naim",
        fielderId: "aninda",
        newBatterId: "soman",
        completedRuns: 0
      }
    })
  ];
  const caughtComplete = deriveQuickScoringInnings(quickInput(caughtEvents));
  const caughtReopened = deriveQuickScoringInnings(
    quickInput(
      undoLastQuickScoringEvent({
        ...createEmptyQuickScoringMetadata(),
        inningsPhase: "second_innings",
        inningsBEvents: caughtEvents
      }, "teamB").inningsBEvents
    )
  );
  const runOutEvents = [
    quickEvent(1, { batterRuns: 2 }),
    quickEvent(2, {
      strikerId: "naim",
      nonStrikerId: "saurav",
      batterRuns: 1,
      wicket: {
        type: "run_out",
        dismissedPlayerId: "saurav",
        fielderId: "aninda",
        newBatterId: "soman",
        completedRuns: 1
      }
    })
  ];
  const runOutComplete = deriveQuickScoringInnings(quickInput(runOutEvents));
  const runOutReopened = deriveQuickScoringInnings(
    quickInput(
      undoLastQuickScoringEvent({
        ...createEmptyQuickScoringMetadata(),
        inningsPhase: "second_innings",
        inningsBEvents: runOutEvents
      }, "teamB").inningsBEvents
    )
  );

  assert.equal(caughtComplete.runs, 2);
  assert.equal(caughtComplete.wicketsLost, 1);
  assert.equal(calculateBowlerWickets("aninda", caughtComplete.bowlingOvers), 1);
  assert.equal(calculatePlayerCatches("aninda", caughtComplete.bowlingOvers), 1);
  assert.equal(caughtReopened.runs, 2);
  assert.equal(caughtReopened.wicketsLost, 0);
  assert.equal(calculateBowlerWickets("aninda", caughtReopened.bowlingOvers), 0);
  assert.equal(calculatePlayerCatches("aninda", caughtReopened.bowlingOvers), 0);
  assert.equal(runOutComplete.runs, 3);
  assert.equal(runOutComplete.wicketsLost, 1);
  assert.equal(calculatePlayerRunOuts("aninda", runOutComplete.bowlingOvers), 1);
  assert.equal(calculateBowlerWickets("aninda", runOutComplete.bowlingOvers), 0);
  assert.equal(runOutReopened.runs, 2);
  assert.equal(runOutReopened.wicketsLost, 0);
  assert.equal(calculatePlayerRunOuts("aninda", runOutReopened.bowlingOvers), 0);
});

test("first delivery can be recorded after selecting required two-batter players", () => {
  const derived = deriveQuickScoringInnings(
    quickInput(
      [
        quickEvent(1, {
          strikerId: "naim",
          nonStrikerId: "saurav",
          bowlerId: "aninda",
          batterRuns: 0
        })
      ],
      {
        battingPlayerIds: ["naim", "saurav", "soman", "rohit"],
        bowlingPlayerIds: ["aninda", "dipanjan", "utpal", "dheeraj"],
        battingMode: "two_batter"
      }
    )
  );

  assert.equal(derived.runs, 0);
  assert.equal(derived.legalBalls, 1);
  assert.equal(derived.currentStrikerId, "naim");
  assert.equal(derived.currentNonStrikerId, "saurav");
  assert.equal(derived.currentBowlerId, "aninda");
  assert.deepEqual(derived.missingInformation, []);
});

test("first delivery can be recorded after selecting required single-batter players", () => {
  const derived = deriveQuickScoringInnings(
    quickInput(
      [
        quickEvent(1, {
          strikerId: "naim",
          nonStrikerId: "",
          bowlerId: "aninda",
          batterRuns: 0
        })
      ],
      {
        battingPlayerIds: ["naim", "saurav", "soman", "rohit"],
        bowlingPlayerIds: ["aninda", "dipanjan", "utpal", "dheeraj"],
        battingMode: "single_batter"
      }
    )
  );

  assert.equal(derived.runs, 0);
  assert.equal(derived.legalBalls, 1);
  assert.equal(derived.currentStrikerId, "naim");
  assert.equal(derived.currentNonStrikerId, null);
  assert.equal(derived.currentBowlerId, "aninda");
  assert.deepEqual(derived.missingInformation, []);
});

test("Quick Scoring reducer rejects invalid run-out next-ball pair", () => {
  const derived = deriveQuickScoringInnings(
    quickInput([
      quickEvent(1, {
        wicket: {
          type: "run_out",
          dismissedPlayerId: "naim",
          fielderId: "aninda",
          newBatterId: "soman",
          completedRuns: 0,
          nextStrikerId: "naim",
          nextNonStrikerId: "soman"
        }
      })
    ])
  );

  assert.match(derived.missingInformation.join(" "), /ineligible next-ball batter/);
});

test("Quick Scoring active UI keeps one POM selector and removes LBW and assisting fielder", () => {
  const source = readFileSync(
    "components/matches/MockMatchEntryForm.tsx",
    "utf8"
  );

  assert.equal(source.match(/value=\{playerOfMatchId\}/g)?.length, 1);
  assert.doesNotMatch(source, /type="checkbox"[\s\S]{0,500}playerOfMatch/);
  assert.doesNotMatch(source, /value="lbw"/);
  assert.doesNotMatch(source, /Assisting fielder/);
  assert.doesNotMatch(source, /assistingFielderId: quickWicketDraft/);
  assert.doesNotMatch(source, /Step 5 - next ball batters/);
  assert.doesNotMatch(source, /quick-next-pair/);
  assert.match(source, /Please select the new batter\./);
  assert.match(source, /Please select the completed runs before the run out\./);
  assert.match(source, /Quick Scoring/);
  assert.match(source, /Suggested using match XP before the POM bonus/);
});

test("Team Player Records UI has no Played checkbox", () => {
  const source = readFileSync(
    "components/matches/MockMatchEntryForm.tsx",
    "utf8"
  );
  const teamPlayerRecordsSection =
    source.match(/function TeamPlayerRecordsSection[\s\S]+function ResultBanner/)?.[0] ?? "";

  assert.doesNotMatch(teamPlayerRecordsSection, /checked=\{performance\.played\}/);
  assert.doesNotMatch(teamPlayerRecordsSection, />\s*Played\s*</);
  assert.doesNotMatch(teamPlayerRecordsSection, /played:\s*event\.target\.checked/);
});

test("POM correction migration is admin-only atomic preparation", () => {
  const sql = readFileSync(
    "supabase/migrations/20260807113000_player_of_match_correction.sql",
    "utf8"
  );

  assert.match(sql, /create or replace function public\.correct_player_of_match_atomic/);
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = ''/);
  assert.match(sql, /if not public\.is_admin\(\) then/);
  assert.match(sql, /from public\.matches[\s\S]+for update/);
  assert.match(sql, /from public\.player_career_stats[\s\S]+for update/);
  assert.match(sql, /expectedPlayerOfMatchId/);
  assert.match(sql, /stale_player_of_match/);
  assert.match(sql, /from public\.match_stat_applications[\s\S]+for update/);
  assert.match(sql, /expectedXpBreakdown/);
  assert.match(sql, /stale_application/);
  assert.match(sql, /invalid_xp_component_change/);
  assert.match(sql, /invalid_player_of_match_xp_delta/);
  assert.match(sql, /invalid_awarded_xp_delta/);
  assert.match(sql, /update public\.match_stat_applications[\s\S]+xp_breakdown/);
  assert.match(sql, /revoke all on function public\.correct_player_of_match_atomic\(jsonb\) from anon/);
  assert.match(sql, /grant execute on function public\.correct_player_of_match_atomic\(jsonb\) to authenticated/);
  assert.doesNotMatch(sql, /delete from|truncate|drop table/i);
  assert.doesNotMatch(sql, /runs =|wickets =|catches =|run_outs =/);
});

test("unselected players do not appear in team data", () => {
  const teamData = buildTeamMatchData({
    teamId: "teamA",
    teamName: "Team A",
    playerIds: ["aninda"],
    performances: [
      performance("aninda", "teamA", 20),
      performance("atripan", "teamA", 99)
    ],
    bowlingOvers: []
  });

  assert.equal(teamData.totalRuns, 20);
});

test("moving a player moves the associated record and preserves entered values", () => {
  const saved = performance("aninda", "teamA", 42);
  const moved = { ...saved, teamId: "teamB" as const };
  const teamBData = buildTeamMatchData({
    teamId: "teamB",
    teamName: "Team B",
    playerIds: ["aninda"],
    performances: [moved],
    bowlingOvers: []
  });

  assert.equal(teamBData.playerPerformances[0]?.runs, 42);
});

test("Team A Bowling accepts only Team A players", () => {
  const errors = validateMatchRecordInput(validationInput({
    bowlingOvers: {
      teamA: [over("teamA", "biplab", 1)],
      teamB: []
    }
  }));

  assert.equal(errors.includes("Every selected bowler must belong to that bowling team."), true);
});

test("Team B Bowling accepts only Team B players", () => {
  const errors = validateMatchRecordInput(validationInput({
    bowlingOvers: {
      teamA: [],
      teamB: [over("teamB", "aninda", 1)]
    }
  }));

  assert.equal(errors.includes("Every selected bowler must belong to that bowling team."), true);
});

test("server validation allows Fielding Helper catch and run-out credits only for selected helpers", () => {
  const helperCatchErrors = validateMatchRecordInput(
    validationInput({
      status: "finalised",
      stage: "finalise",
      availablePlayerIds: ["aninda", "dipanjan", "biplab", "saurav"],
      teamAPlayerIds: ["aninda", "dipanjan"],
      teamBPlayerIds: ["biplab", "saurav"],
      fieldingHelperIds: ["biplab"],
      performances: [
        performance("aninda", "teamA", 0),
        performance("dipanjan", "teamA", 0),
        performance("biplab", "teamB", 0),
        performance("saurav", "teamB", 0)
      ],
      bowlingOvers: {
        teamA: [
          over("teamA", "aninda", 1, {
            dismissals: [
              dismissal({
                overId: "teamA-1",
                battingTeamId: "teamB",
                bowlingTeamId: "teamA",
                dismissedBatterId: "saurav",
                type: "caught",
                creditedBowlerId: "aninda",
                fielderId: "biplab"
              })
            ]
          })
        ],
        teamB: []
      }
    })
  );
  const nonHelperCatchErrors = validateMatchRecordInput(
    validationInput({
      status: "finalised",
      stage: "finalise",
      availablePlayerIds: ["aninda", "dipanjan", "biplab", "saurav"],
      teamAPlayerIds: ["aninda", "dipanjan"],
      teamBPlayerIds: ["biplab", "saurav"],
      fieldingHelperIds: [],
      performances: [
        performance("aninda", "teamA", 0),
        performance("dipanjan", "teamA", 0),
        performance("biplab", "teamB", 0),
        performance("saurav", "teamB", 0)
      ],
      bowlingOvers: {
        teamA: [
          over("teamA", "aninda", 1, {
            dismissals: [
              dismissal({
                overId: "teamA-1",
                battingTeamId: "teamB",
                bowlingTeamId: "teamA",
                dismissedBatterId: "saurav",
                type: "caught",
                creditedBowlerId: "aninda",
                fielderId: "biplab"
              })
            ]
          })
        ],
        teamB: []
      }
    })
  );
  const helperRunOutErrors = validateMatchRecordInput(
    validationInput({
      status: "finalised",
      stage: "finalise",
      availablePlayerIds: ["aninda", "dipanjan", "biplab", "saurav"],
      teamAPlayerIds: ["aninda", "dipanjan"],
      teamBPlayerIds: ["biplab", "saurav"],
      fieldingHelperIds: ["biplab"],
      performances: [
        performance("aninda", "teamA", 0),
        performance("dipanjan", "teamA", 0),
        performance("biplab", "teamB", 0),
        performance("saurav", "teamB", 0)
      ],
      bowlingOvers: {
        teamA: [
          over("teamA", "aninda", 1, {
            dismissals: [
              dismissal({
                overId: "teamA-1",
                battingTeamId: "teamB",
                bowlingTeamId: "teamA",
                dismissedBatterId: "saurav",
                type: "run_out",
                creditedBowlerId: null,
                fielderId: "biplab"
              })
            ]
          })
        ],
        teamB: []
      }
    })
  );

  assert.equal(
    helperCatchErrors.includes("Every catcher must belong to the bowling team or Fielding Helpers."),
    false
  );
  assert.equal(
    nonHelperCatchErrors.includes("Every catcher must belong to the bowling team or Fielding Helpers."),
    true
  );
  assert.equal(
    helperRunOutErrors.includes("Every run-out fielder must belong to the bowling team or Fielding Helpers."),
    false
  );
});

test("Fielding Helper IDs normalise from legacy records and require Available Today membership", () => {
  assert.deepEqual(
    getFieldingHelperIds({
      availablePlayerIds: ["aninda", "biplab"],
      sharedPlayerId: "aninda"
    }),
    []
  );
  assert.deepEqual(
    getFieldingHelperIds({
      availablePlayerIds: ["aninda", "biplab", "saurav"],
      sharedPlayerId: "aninda",
      fieldingHelperIds: ["aninda", "biplab", "biplab", "missing"]
    }),
    ["biplab"]
  );
  assert.deepEqual(
    getEligibleFieldingPlayerIds({
      bowlingPlayerIds: ["aninda"],
      fieldingHelperIds: ["biplab", "aninda"]
    }),
    ["aninda", "biplab"]
  );
});

test("completed overs are calculated separately", () => {
  assert.equal(calculateCompletedBowlingOvers([over("teamA", "aninda", 1)]), 1);
  assert.equal(calculateCompletedBowlingOvers([over("teamB", "biplab", 1), over("teamB", "biplab", 2)]), 2);
});

test("server rejects duplicate cross-team membership", () => {
  const errors = validateMatchRecordInput(validationInput({
    teamAPlayerIds: ["aninda"],
    teamBPlayerIds: ["aninda", "biplab"]
  }));

  assert.equal(errors.includes("A player cannot be selected for both teams."), true);
});

test("Team A total equals Team A player runs", () => {
  assert.equal(
    calculateTeamTotals([
      performance("aninda", "teamA", 20),
      performance("biplab", "teamB", 15)
    ]).teamATotal,
    20
  );
});

test("Team B total equals Team B player runs", () => {
  assert.equal(
    calculateTeamTotals([
      performance("aninda", "teamA", 20),
      performance("biplab", "teamB", 15)
    ]).teamBTotal,
    15
  );
});

test("changing a player's runs updates only that player's team", () => {
  const before = calculateTeamTotals([
    performance("aninda", "teamA", 8),
    performance("biplab", "teamB", 12)
  ]);
  const after = calculateTeamTotals([
    performance("aninda", "teamA", 18),
    performance("biplab", "teamB", 12)
  ]);

  assert.equal(before.teamBTotal, after.teamBTotal);
  assert.equal(after.teamATotal, 18);
});

test("moving a player transfers their runs to the new team", () => {
  const totals = calculateTeamTotals([performance("aninda", "teamB", 20)]);

  assert.deepEqual(totals, { teamATotal: 0, teamBTotal: 20 });
});

test("negative or invalid run values are handled safely", () => {
  assert.equal(sanitizeRuns(-4), 0);
  assert.equal(sanitizeRuns("not a score"), 0);
});

test("bowling layout uses non-overlapping responsive grids", () => {
  const css = readFileSync("app/globals.css", "utf8");

  assert.match(css, /\.bowling-teams-grid\s*{/);
  assert.match(css, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.bowling-teams-grid > \*/);
  assert.match(css, /\.team-bowling-panel\s*{[\s\S]*?min-width:\s*0/);
  assert.match(css, /\.team-bowling-panel\s*{[\s\S]*?container-type:\s*inline-size/);
  assert.match(css, /@media \(max-width:\s*1050px\)[\s\S]*?\.bowling-teams-grid/);
});

test("bowling row inputs stay inside their own panel and use compact container layout", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(css, /\.bowling-over-row\s*{/);
  assert.match(css, /64px\s+minmax\(130px,\s*1fr\)\s+94px\s+104px\s+minmax\(92px,\s*auto\)/);
  assert.match(css, /\.bowling-over-actions\s*{[\s\S]*?width:\s*100%/);
  assert.match(css, /\.bowling-over-actions\s*{[\s\S]*?justify-content:\s*flex-end/);
  assert.match(css, /\.maiden-control,\s*\n\.maiden-badge,\s*\n\.maiden-empty\s*{[\s\S]*?white-space:\s*nowrap/);
  assert.match(css, /\.delete-over-button\s*{[\s\S]*?flex:\s*0 0 34px/);
  assert.match(css, /@container \(max-width:\s*660px\)[\s\S]*?\.bowling-over-row/);
  assert.match(css, /@container \(max-width:\s*660px\)[\s\S]*?grid-column:\s*2 \/ 5/);
  assert.match(form, /className="bowling-over-actions"/);
  assert.match(form, /className="maiden-control/);
  assert.match(form, /className="delete-over-button/);
  assert.match(form, /<span>MAIDEN<\/span>/);
  assert.doesNotMatch(form, />MAID</);
});

test("finalised bowling rows use read-only Maiden badges while drafts stay editable", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(form, /isLocked \? \(/);
  assert.match(form, /className="maiden-badge">MAIDEN<\/span>/);
  assert.match(form, /className="maiden-empty">-/);
  assert.match(form, /!isLocked \? \([\s\S]*className="maiden-control/);
  assert.match(form, /!isLocked \? \([\s\S]*aria-label=\{`Delete over/);
  assert.match(css, /\.maiden-badge,\s*\n\.maiden-empty\s*{[\s\S]*?white-space:\s*nowrap/);
  assert.match(css, /\.maiden-empty\s*{/);
});

test("dismissal rows stay contained inside bowling over cards", () => {
  const css = readFileSync("app/globals.css", "utf8");

  assert.match(css, /\.dismissal-row\s*{[\s\S]*?grid-template-columns:\s*[\s\S]*minmax\(130px,\s*1fr\)[\s\S]*minmax\(120px,\s*0\.9fr\)[\s\S]*minmax\(130px,\s*1fr\)/);
  assert.match(css, /\.dismissal-row > \*\s*{[\s\S]*?min-width:\s*0/);
  assert.match(css, /\.dismissal-row select\s*{[\s\S]*?max-width:\s*100%/);
  assert.match(css, /@container \(max-width:\s*660px\)[\s\S]*?\.dismissal-row\s*{[\s\S]*?grid-template-columns:\s*1fr/);
});

test("player stat inputs stay contained and wrap responsively", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(css, /\.player-match-record\s*{[\s\S]*?overflow:\s*hidden/);
  assert.match(css, /\.player-stat-inputs\s*{[\s\S]*?repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.player-stat-field input,\s*\.player-batting-field input\[type="number"\]\s*{[\s\S]*?max-width:\s*100%/);
  assert.match(css, /@media \(max-width:\s*700px\)[\s\S]*?repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media \(max-width:\s*430px\)[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(form, /className="player-match-record/);
  assert.match(form, /className="player-stat-inputs"/);
  assert.match(form, /Run-outs/);
});

test("batting order controls stay compact inside player record cards", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(form, /className="player-batting-grid grid gap-3"/);
  assert.match(form, /className="batting-order-controls"/);
  assert.match(form, /className="batting-order-position"/);
  assert.match(form, /className="batting-order-button"/);
  assert.match(form, /aria-label="Move batter up"/);
  assert.match(form, /aria-label="Move batter down"/);
  assert.doesNotMatch(form, />Up<\/button>/);
  assert.doesNotMatch(form, />Down<\/button>/);
  assert.match(css, /\.player-batting-grid\s*{[\s\S]*?minmax\(148px,\s*1\.1fr\)/);
  assert.match(css, /\.batting-order-controls\s*{[\s\S]*?display:\s*flex/);
  assert.match(css, /\.batting-order-position,\s*\n\.batting-order-button\s*{[\s\S]*?flex:\s*0 0 auto/);
  assert.match(css, /\.batting-order-button\s*{[\s\S]*?width:\s*30px/);
  assert.match(css, /@media \(max-width:\s*700px\)[\s\S]*?\.player-batting-grid\s*{[\s\S]*?repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media \(max-width:\s*430px\)[\s\S]*?\.player-batting-grid\s*{[\s\S]*?grid-template-columns:\s*1fr/);
});

test("bowling over UI uses WKTS TAKEN and dismissal editors", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(form, /Wkts taken/);
  assert.match(form, /Total dismissals in this over, including run-outs\./);
  assert.doesNotMatch(form, /\+ Add Wicket/);
  assert.match(form, /Dismissed batter/);
  assert.match(form, /Caught by/);
  assert.match(form, /Run-out by/);
  assert.match(form, /Complete the dismissal details for the wickets taken in this over\./);
  assert.match(form, /dismissedBatterIdsInOtherOvers/);
  assert.match(form, /candidate\.id !== dismissal\.id/);
  assert.match(css, /\.dismissal-row\s*{/);
  assert.match(css, /@media \(max-width:\s*720px\)[\s\S]*?\.dismissal-row/);
});

test("player record bowling and fielding stats are derived displays", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");
  const playerStatsBlock =
    form.match(/<div className="player-stat-inputs">[\s\S]*?<\/div>/)?.[0] ?? "";

  assert.match(form, /DerivedPlayerStat label="Wickets"/);
  assert.match(form, /DerivedPlayerStat label="Hat-tricks"/);
  assert.match(form, /DerivedPlayerStat label="Catches"/);
  assert.match(form, /DerivedPlayerStat label="Run-outs"/);
  assert.doesNotMatch(playerStatsBlock, /onUpdatePerformance/);
  assert.doesNotMatch(playerStatsBlock, /<input/);
});

test("player run inputs use blank draft state and normalized numeric changes", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(form, /runs:\s*""/);
  assert.match(form, /runs:\s*didBat \? normalizeStoredRuns\(current\.runs\) : ""/);
  assert.match(form, /normalizeNonNegativeIntegerInput\(\s*event\.target\.value\s*\)/);
  assert.doesNotMatch(form, /runs:\s*event\.target\.value/);
});

test("match page uses status-aware production titles", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");
  const page = readFileSync("app/matches/new/page.tsx", "utf8");

  assert.match(form, /const matchPageTitle = isNewMatch/);
  assert.match(form, /"CREATE MATCH"/);
  assert.match(form, /"EDIT MATCH"/);
  assert.match(form, /"LIVE MATCH ENTRY"/);
  assert.match(form, /"MATCH SCORECARD"/);
  assert.match(form, /document\.title = `\$\{matchPageTitle\} \| Gully Legends Prague`/);
  assert.match(form, /aria-label=\{matchPageTitle\}/);
  assert.match(page, /title: "Create Match \| Gully Legends Prague"/);
  assert.doesNotMatch(
    form,
    /Mock Match Entry|Mock Match|Demo Match|Test Match Entry|Sample Match/
  );
});

test("Draft validation allows schedule-only and partially prepared matches", () => {
  const scheduleOnly = validateMatchRecordInput(validationInput({
    stage: "draft",
    matchName: "Gully Premier League",
    battingFirstTeamId: null,
    scheduledOversPerInnings: null,
    availablePlayerIds: [],
    teamAPlayerIds: [],
    teamBPlayerIds: [],
    performances: []
  }));
  const playersOnly = validateMatchRecordInput(validationInput({
    stage: "draft",
    matchName: "Gully Premier League",
    battingFirstTeamId: null,
    scheduledOversPerInnings: null,
    availablePlayerIds: ["aninda", "biplab"],
    teamAPlayerIds: [],
    teamBPlayerIds: [],
    performances: []
  }));
  const teamsWithoutBattingFirst = validateMatchRecordInput(validationInput({
    stage: "draft",
    matchName: "Gully Premier League",
    battingFirstTeamId: null,
    teamAPlayerIds: ["aninda"],
    teamBPlayerIds: ["biplab"]
  }));
  const teamsWithoutOvers = validateMatchRecordInput(validationInput({
    stage: "draft",
    matchName: "Gully Premier League",
    battingFirstTeamId: "teamA",
    scheduledOversPerInnings: null
  }));

  assert.deepEqual(scheduleOnly, []);
  assert.deepEqual(playersOnly, []);
  assert.deepEqual(teamsWithoutBattingFirst, []);
  assert.deepEqual(teamsWithoutOvers, []);
});

test("Schedule validation is independent from batting-first teams and overs", () => {
  assert.deepEqual(
    validateMatchRecordInput(validationInput({
      stage: "schedule",
      matchName: "Rescheduled Gully Premier League",
      battingFirstTeamId: null,
      scheduledOversPerInnings: null,
      availablePlayerIds: [],
      teamAPlayerIds: [],
      teamBPlayerIds: [],
      performances: []
    })),
    []
  );
});

test("Start Scoring validation blocks missing batting-first team and invalid teams", () => {
  const noBattingFirstErrors = validateMatchRecordInput(validationInput({
    stage: "start",
    matchName: "Gully Premier League",
    battingFirstTeamId: null
  }));
  const noTeamsErrors = validateMatchRecordInput(validationInput({
    stage: "start",
    matchName: "Gully Premier League",
    battingFirstTeamId: "teamA",
    availablePlayerIds: [],
    teamAPlayerIds: [],
    teamBPlayerIds: [],
    performances: []
  }));

  assert.equal(noBattingFirstErrors.includes("SELECT THE BATTING-FIRST TEAM"), true);
  assert.equal(noTeamsErrors.includes("Select at least one available player."), true);
  assert.equal(noTeamsErrors.includes("Team A and Team B must each contain at least one player."), true);
});

test("Start Scoring works when required setup is complete", () => {
  assert.deepEqual(
    validateMatchRecordInput(validationInput({
      stage: "start",
      matchName: "Gully Premier League",
      battingFirstTeamId: "teamA",
      scheduledOversPerInnings: 8
    })),
    []
  );
});

test("cricket over display uses legal-ball notation instead of decimal overs", () => {
  const expected = new Map([
    [0, "0.0"],
    [1, "0.1"],
    [5, "0.5"],
    [6, "1.0"],
    [11, "1.5"],
    [12, "2.0"],
    [17, "2.5"]
  ]);

  for (const [legalBalls, overs] of expected) {
    assert.equal(formatCricketOversFromLegalBalls(legalBalls), overs);
  }

  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(form, /formatQuickOvers\(legalBalls: number\)[\s\S]*formatCricketOversFromLegalBalls/);
  assert.match(form, /formatCompletedOvers\(score\.completedOvers\)\} overs - source/);
  assert.doesNotMatch(form, /\{score\.completedOvers\} overs - source/);
});

test("Draft saving does not trigger finalisation side effects", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");
  const nonFinalisedSaveSection =
    form.match(/async function persistNonFinalisedMatch[\s\S]*?async function validateAndSetStatus/)?.[0] ?? "";

  assert.match(form, /stage,\s*\n\s*scheduledOversPerInnings/);
  assert.match(form, /validateAndSetStatus\(\s*status,[\s\S]*?"draft"/);
  assert.match(form, /persistNonFinalisedMatch\(\s*buildCurrentMatchRecord/);
  assert.match(nonFinalisedSaveSection, /saveSupabaseAdminMatch/);
  assert.match(nonFinalisedSaveSection, /localMatchRepository\.saveMatch\(match\)/);
  assert.doesNotMatch(nonFinalisedSaveSection, /applyFinalisedMatchToLocalCareerStats/);
  assert.match(form, /if \(nextStatus === "finalised"\)[\s\S]*finalizeSupabaseAdminMatch/);
  assert.match(form, /applyFinalisedMatchToLocalCareerStats\(finalisedMatch\)/);
});

test("Demo Test Match completion is a dry-run validation action", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");
  const finaliseStart = form.indexOf('if (nextStatus === "finalised") {');
  const finaliseEnd = form.indexOf("const nextQuickScoring =", finaliseStart);
  const finaliseBranch =
    finaliseStart >= 0 && finaliseEnd > finaliseStart
      ? form.slice(finaliseStart, finaliseEnd)
      : "";
  const demoStart = finaliseBranch.indexOf("if (isDemoMatch) {");
  const demoEnd = finaliseBranch.indexOf("const finalScore", demoStart);
  const demoBranch =
    demoStart >= 0 && demoEnd > demoStart
      ? finaliseBranch.slice(demoStart, demoEnd)
      : "";
  const afterDemoBranch =
    demoStart >= 0 && demoEnd > demoStart
      ? finaliseBranch.slice(demoStart, demoEnd)
      : "";

  assert.match(form, /DEMO TEST MATCH - Nothing from this match will affect official records\./);
  assert.match(form, /isDemoMatch \? "Complete Demo Test" : "Finalise Match"/);
  assert.match(form, /DEMO TEST COMPLETED - Validation passed\. No official records were changed\./);
  assert.match(form, /DEMO VALIDATION FAILED -/);
  assert.match(finaliseBranch, /const finalisedMatch = buildCurrentMatchRecord/);
  assert.match(demoBranch, /setFinalisedXPBreakdowns/);
  assert.match(demoBranch, /return true/);
  assert.doesNotMatch(demoBranch, /finalizeSupabaseAdminMatch/);
  assert.doesNotMatch(demoBranch, /applyFinalisedMatchToLocalCareerStats/);
  assert.doesNotMatch(demoBranch, /localMatchRepository\.saveMatch/);
  assert.doesNotMatch(demoBranch, /setStatus\(nextStatus\)/);
  assert.doesNotMatch(afterDemoBranch, /window\.confirm/);
  assert.doesNotMatch(afterDemoBranch, /Finalisation updates career statistics/);
});

test("Normal match finalisation remains official while Demo save stays non-finalised", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");
  const nonFinalisedSaveSection =
    form.match(/async function persistNonFinalisedMatch[\s\S]*?async function createDemoTestMatch/)?.[0] ?? "";

  assert.match(form, /isDemoMatch \? "Complete Demo Test" : "Finalise Match"/);
  assert.match(form, /FINALISE MATCH\?/);
  assert.match(form, /Finalisation updates career statistics, XP, Hall of Legends and Monthly Beasts/);
  assert.match(form, /finalizeSupabaseAdminMatch\(\{/);
  assert.match(form, /applyFinalisedMatchToLocalCareerStats\(finalisedMatch\)/);
  assert.match(nonFinalisedSaveSection, /saveSupabaseAdminMatch/);
  assert.doesNotMatch(nonFinalisedSaveSection, /finalizeSupabaseAdminMatch/);
  assert.doesNotMatch(nonFinalisedSaveSection, /applyFinalisedMatchToLocalCareerStats/);
});

test("Create Match form supports quick fixture creation fields", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(form, /matchNumber:\s*""/);
  assert.match(form, /startTime:\s*""/);
  assert.match(form, /Automatic game/);
  assert.match(form, /More Options/);
  assert.match(form, /1\. Who&apos;s Playing\?/);
  assert.match(form, /2\. Build the Teams/);
  assert.match(form, /3\. Match Settings/);
  assert.doesNotMatch(form, /Start time/);
  assert.match(form, /getNextAvailableMatchNumber\(\s*savedMatches,\s*matchDate\s*\)/);
  assert.match(form, /START MATCH/);
  assert.match(form, /validateAndSetStatus\("in_progress", "start"\)/);
  assert.doesNotMatch(form, /Continue to Team Setup/);
});

test("Draft Shared Player changes do not use native technical confirmation", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");
  const changeSharedPlayerBlock =
    form.match(/function changeSharedPlayer\(playerId: string\) \{[\s\S]*?\n  \}/)?.[0] ?? "";

  assert.match(changeSharedPlayerBlock, /if \(isRosterLocked\) return/);
  assert.match(changeSharedPlayerBlock, /const nextSharedPlayerId = playerId \|\| null/);
  assert.match(changeSharedPlayerBlock, /ordinaryTeamA/);
  assert.match(changeSharedPlayerBlock, /ordinaryTeamB/);
  assert.match(changeSharedPlayerBlock, /applyRosters\(availablePlayerIds, ordinaryTeamA, ordinaryTeamB, nextSharedPlayerId\)/);
  assert.doesNotMatch(changeSharedPlayerBlock, /window\.confirm/);
  assert.doesNotMatch(changeSharedPlayerBlock, /Changing the Shared Player will rebuild/);
  assert.match(form, /has already participated as the Shared player\. To change the Shared player safely, restart this match\./);
  assert.match(form, /CANCEL & RESTART MATCH/);
});

test("Create Match form rejects duplicate same-day game numbers and blocks second live match", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(form, /hasDuplicateMatchNumber\(\{/);
  assert.match(form, /Game \$\{matchNumber\} is already in use for this date/);
  assert.match(form, /getLiveMatchConflict\(savedMatches, matchId\)/);
  assert.match(
    form,
    /ANOTHER MATCH IS ALREADY IN PROGRESS/
  );
  assert.match(form, /Continue Current Match/);
});

test("Cancel and Restart cancels old attempt and creates a clean copied draft", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");
  const updatePanelBlock =
    form.match(/function openPlayerUpdatePanel\(\) \{[\s\S]*?setMessage\("Quick Scoring paused/)?.[0] ?? "";
  const setupPanelBlock =
    form.match(/function openActiveSetupPanel\(\) \{[\s\S]*?\n  \}/)?.[0] ?? "";
  const restartPanelBlock =
    form.match(/function openRestartConfirmation\(\) \{[\s\S]*?\n  \}/)?.[0] ?? "";

  assert.match(form, /async function cancelAndRestartActiveMatch/);
  assert.match(form, /buildCurrentMatchRecord\(\s*"cancelled"/);
  assert.match(form, /const restartMatchId = createLocalMatchId\(\)/);
  assert.match(form, /const restartValues: MockMatchFormValues =/);
  assert.match(form, /matchNumber: getNextAvailableMatchNumber/);
  assert.match(form, /const restartQuickScoring = createEmptyQuickScoringMetadata\(\)/);
  assert.match(form, /const restartBowlingOvers = \{ teamA: \[\], teamB: \[\] \}/);
  assert.match(form, /const restartPerformances = buildFreshPerformanceStateForRosters\(teamA, teamB\)/);
  assert.match(form, /buildCurrentMatchRecord\(\s*"draft"/);
  assert.match(form, /setStatus\("draft"\)/);
  assert.match(form, /setRestartSetupNoticeOpen\(true\)/);
  assert.match(form, /CANCEL & RESTART MATCH/);
  assert.match(form, /CANCEL & RESTART THIS MATCH\?/i);
  assert.match(form, /Your setup has been copied/);
  assert.match(form, /has already participated as the Shared player\. To change the Shared player safely, restart this match\./);
  assert.match(updatePanelBlock, /setCancelConfirmationOpen\(false\)/);
  assert.match(updatePanelBlock, /setSetupExpanded\(false\)/);
  assert.match(setupPanelBlock, /setCancelConfirmationOpen\(false\)/);
  assert.match(setupPanelBlock, /setPlayerUpdateOpen\(false\)/);
  assert.match(setupPanelBlock, /setSetupExpanded\(true\)/);
  assert.match(restartPanelBlock, /setPlayerUpdateOpen\(false\)/);
  assert.match(restartPanelBlock, /setSetupExpanded\(false\)/);
  assert.match(restartPanelBlock, /setCancelConfirmationOpen\(true\)/);
  assert.match(form, /onClick=\{openRestartConfirmation\}/);
  assert.match(form, /onClick=\{openActiveSetupPanel\}/);
});

test("Supabase mode sends match writes and finalisation to protected admin APIs", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");
  const apiClient = readFileSync("lib/admin-match-write-client.ts", "utf8");
  const apiRoute = readFileSync("app/api/admin/matches/route.ts", "utf8");
  const finaliseRoute = readFileSync("app/api/admin/matches/finalize/route.ts", "utf8");
  const writeRepository = readFileSync("lib/supabase/match-write-repository.ts", "utf8");
  const finalisationPlan = readFileSync("lib/supabase/match-finalisation-plan.ts", "utf8");
  const finalisationRepository = readFileSync("lib/supabase/match-finalisation-repository.ts", "utf8");
  const atomicFinalisationSql = readFileSync(
    "supabase/migrations/20260807103000_atomic_match_finalisation.sql",
    "utf8"
  );

  assert.match(form, /const supabaseWriteMode = isSupabaseDataSource\(\)/);
  assert.match(form, /saveSupabaseAdminMatch\(\{/);
  assert.match(form, /finalizeSupabaseAdminMatch\(\{/);
  assert.match(form, /expectedUpdatedAt: supabaseUpdatedAt/);
  assert.match(form, /active_crown/);
  assert.match(form, /stale_match/);
  assert.match(form, /stale_career/);
  assert.match(form, /localMatchRepository\.saveMatch\(finalisedMatch\)/);
  assert.doesNotMatch(form, /setShowSupabaseFinaliseWarning/);
  assert.match(apiClient, /\/api\/admin\/matches/);
  assert.match(apiClient, /\/api\/admin\/matches\/finalize/);
  assert.match(apiRoute, /isAdminWithClient/);
  assert.match(apiRoute, /validateMatchOnServer/);
  assert.match(apiRoute, /battingMode:\s*match\.battingMode \?\? match\.quickScoring\?\.battingMode \?\? "two_batter"/);
  assert.match(finaliseRoute, /battingMode:\s*match\.battingMode \?\? match\.quickScoring\?\.battingMode \?\? "two_batter"/);
  assert.match(apiRoute, /revalidatePath\("\/"\)/);
  assert.match(finaliseRoute, /ADMIN LOGIN REQUIRED/);
  assert.match(finaliseRoute, /ADMIN ACCESS REQUIRED/);
  assert.match(finaliseRoute, /validateMatchOnServer/);
  assert.match(finaliseRoute, /validateSupabaseMatchPayload/);
  assert.match(finaliseRoute, /hasActiveCrown/);
  assert.match(finaliseRoute, /getCareerRows/);
  assert.match(finaliseRoute, /getMatchApplications/);
  assert.match(finaliseRoute, /buildFinalisationPlan/);
  assert.match(finaliseRoute, /finalizeAtomically/);
  assert.match(writeRepository, /is_demo: forceDemo \|\| \(existing\?\.is_demo \?\? false\)/);
  assert.match(writeRepository, /assertNoOtherLiveMatch/);
  assert.match(writeRepository, /deleted_at: deletedAt/);
  assert.match(writeRepository, /expectedUpdatedAt/);
  assert.match(finalisationPlan, /applyFinalisedMatchToCareerStats/);
  assert.match(finalisationPlan, /createEmptyCareerProgressionState/);
  assert.match(finalisationPlan, /existingApplications/);
  assert.match(finalisationRepository, /client\.rpc\("finalize_match_atomic"/);
  assert.match(finalisationRepository, /stale_match/);
  assert.match(finalisationRepository, /stale_career/);
  assert.match(atomicFinalisationSql, /create or replace function public\.finalize_match_atomic/);
  assert.match(atomicFinalisationSql, /if not public\.is_admin\(\)/);
  assert.match(atomicFinalisationSql, /set search_path = ''/);
  assert.match(atomicFinalisationSql, /for update/);
  assert.match(atomicFinalisationSql, /v_match\.status <> 'in_progress'/);
  assert.match(atomicFinalisationSql, /gully-legends-reset-demo-data/);
  assert.match(atomicFinalisationSql, /pg_advisory_xact_lock/);
  assert.match(atomicFinalisationSql, /month_already_crowned/);
  assert.match(atomicFinalisationSql, /update public\.player_career_stats/);
  assert.match(atomicFinalisationSql, /insert into public\.match_stat_applications/);
  assert.match(atomicFinalisationSql, /update public\.matches/);
  assert.match(atomicFinalisationSql, /already_applied/);
  assert.doesNotMatch(apiClient, /localStorage|MATCH_HISTORY_STORAGE_KEY/);
});

test("finalised match uses XP Awarded while drafts use Projected Match XP", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(form, /isFinalised \? "XP Awarded" : "Projected match XP"/);
  assert.match(form, /className=\{`player-match-xp/);
});

test("finalised match actions replace editing controls and unsafe reopen is hidden", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(form, /!isFinalised \? \(/);
  assert.match(form, /Save Draft/);
  assert.match(form, /Finalise Match/);
  assert.match(form, /Reset/);
  assert.match(form, /View Match Summary/);
  assert.match(form, /Back to Matches/);
  assert.match(form, /const canSafelyReopenFinalisedMatch = false/);
  assert.match(form, /\{canReopen \? \(/);
});

test("finalised match details use accessible collapsed disclosures", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(form, /function MatchDetailsDisclosure/);
  assert.match(form, /defaultOpen = false/);
  assert.match(form, /aria-expanded=\{isOpen\}/);
  assert.match(form, /aria-controls=\{contentId\}/);
  assert.match(form, /hidden=\{!isOpen\}/);
  assert.match(form, /isFinalised \? \(\s*<MatchDetailsDisclosure[\s\S]*?: \(\s*<TeamBowlingSection/);
  assert.match(form, /isFinalised \? \(\s*<MatchDetailsDisclosure[\s\S]*?: \(\s*<TeamPlayerRecordsSection/);
});

test("finalised polish adds team accents and removes repeated over-level all-out notice", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");
  const css = readFileSync("app/globals.css", "utf8");

  assert.match(form, /team-section-a/);
  assert.match(form, /team-section-b/);
  assert.match(css, /--team-accent/);
  assert.match(css, /\.team-score-badge/);
  assert.match(css, /\.finalised-match input:disabled/);
  assert.doesNotMatch(form, /All available batting players have been dismissed\./);
});

test("run input normalizer removes leading zeroes and permits blank editing", () => {
  assert.equal(normalizeNonNegativeIntegerInput("13"), 13);
  assert.equal(normalizeNonNegativeIntegerInput("013"), 13);
  assert.equal(normalizeNonNegativeIntegerInput("001"), 1);
  assert.equal(normalizeNonNegativeIntegerInput("0"), 0);
  assert.equal(normalizeNonNegativeIntegerInput(""), "");
});

test("stored draft run values are normalised before display", () => {
  assert.equal(normalizeStoredRuns("013"), 13);
  assert.equal(normalizeStoredRuns("001"), 1);
  assert.equal(normalizeStoredRuns(0), 0);
  assert.equal(normalizeStoredRuns(null), "");
  assert.equal(normalizeStoredRuns(undefined), "");
  assert.equal(normalizeStoredRuns(""), "");
});

test("legacy draft wickets migrate into placeholder dismissal rows", () => {
  const { dismissals: _dismissals, ...legacyOver } = over("teamA", "aninda", 1, {
    dismissals: []
  });
  void _dismissals;
  const migrated = migrateLegacyBowlingOvers([
    {
      ...legacyOver,
      wicketsLost: 2
    }
  ]);

  assert.equal(migrated[0].dismissals.length, 2);
  assert.equal(migrated[0].dismissals[0].dismissedBatterId, "");
  assert.equal(migrated[0].dismissals[0].creditedBowlerId, "aninda");
  assert.equal(isBowlingOverComplete(migrated[0]), false);
});

test("wickets taken syncs only the required dismissal rows for the current over", () => {
  const baseOver = over("teamA", "aninda", 1, { dismissals: [] });
  const zeroWicketOver = syncDismissalRows(baseOver, 0);
  const oneWicketOver = syncDismissalRows(baseOver, 1);
  const twoWicketOver = syncDismissalRows(baseOver, 2);

  assert.equal(zeroWicketOver.wicketsTaken, 0);
  assert.equal(zeroWicketOver.dismissals.length, 0);
  assert.equal(isBowlingOverComplete(zeroWicketOver), true);

  assert.equal(oneWicketOver.wicketsTaken, 1);
  assert.equal(oneWicketOver.dismissals.length, 1);
  assert.equal(isBowlingOverComplete(oneWicketOver), false);

  assert.equal(twoWicketOver.wicketsTaken, 2);
  assert.equal(twoWicketOver.dismissals.length, 2);
});

test("one completed dismissal in over one permits the next over without remaining innings wickets", () => {
  const completedOver = over("teamA", "aninda", 1, {
    runsConceded: 10,
    dismissals: [
      dismissal({
        overId: "teamA-1",
        battingTeamId: "teamB",
        bowlingTeamId: "teamA",
        dismissedBatterId: "biplab",
        type: "bowled",
        creditedBowlerId: "aninda"
      })
    ]
  });
  const inningsState = getInningsState({
    battingTeamId: "teamB",
    bowlingTeamId: "teamA",
    battingPlayerCount: 4,
    bowlingOvers: [completedOver],
    scheduledOvers: 8,
    runs: 10
  });

  assert.equal(isBowlingOverComplete(completedOver), true);
  assert.equal(inningsState.isComplete, false);
  assert.equal(inningsState.isAllOut, false);
  assert.equal(calculateScoreFromBowlingFeed([completedOver]).wicketsLost, 1);
});

test("team assignment renders Available Today players through one unassigned pool", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(form, /const availablePlayers = useMemo/);
  assert.match(form, /const unassignedPlayers = useMemo/);
  assert.match(form, /renderUnassignedPlayers\(\)/);
  assert.match(form, /unassignedPlayers\.map\(\(player\) =>/);
  assert.match(form, /renderAssignedTeam\("A", teamA\)/);
  assert.match(form, /renderAssignedTeam\("B", teamB\)/);
  assert.doesNotMatch(form, /function renderTeamSelector/);
});

test("manual team assignment avoids duplicated disabled player rows", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(form, /function getAssignmentPlayers\(source: string\[\]\)/);
  assert.match(form, /player\.id !== sharedPlayerId/);
  assert.match(form, /!teamA\.includes\(player\.id\)/);
  assert.match(form, /!teamB\.includes\(player\.id\)/);
  assert.match(form, />\s*Remove\s*</);
  assert.match(form, />\s*Team A\s*</);
  assert.match(form, />\s*Team B\s*</);
  assert.doesNotMatch(form, /other\.includes\(player\.id\)/);
  assert.doesNotMatch(form, /checked=\{selected\}/);
});

test("bowler selectors and player record sections use selected team players only", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(form, /players=\{teamAPlayers\}/);
  assert.match(form, /players=\{teamBPlayers\}/);
  assert.match(form, /teamPlayers\.map\(\(player\) =>\s*\(\s*<option/);
  assert.match(form, /const orderedPerformances = sortBattingPerformances\(performances\)/);
  assert.match(form, /orderedPerformances\.map\(\(performance\) =>/);
});

test("match setup uses fixed team names and appears before Quick Scoring", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(form, /const FIXED_TEAM_A_NAME = "Team A"/);
  assert.match(form, /const FIXED_TEAM_B_NAME = "Team B"/);
  assert.doesNotMatch(form, />\s*Team A name\s*</);
  assert.doesNotMatch(form, />\s*Team B name\s*</);
  assert.ok(form.indexOf("1. Who&apos;s Playing?") < form.indexOf("<QuickScoringPanel"));
  assert.ok(form.indexOf("2. Build the Teams") < form.indexOf("<QuickScoringPanel"));
  assert.ok(form.indexOf("3. Match Settings") < form.indexOf("<QuickScoringPanel"));
});

test("match setup requires and persists batting mode for Start Match", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");
  const types = readFileSync("lib/types/match.ts", "utf8");
  const quickScoring = readFileSync("lib/quick-scoring.ts", "utf8");
  const errors = validateMatchRecordInput(
    validationInput({
      stage: "start",
      battingMode: null
    })
  );

  assert.match(types, /export type BattingMode = "two_batter" \| "single_batter"/);
  assert.match(quickScoring, /export const DEFAULT_BATTING_MODE/);
  assert.match(form, /name="battingMode"/);
  assert.match(form, /value="two_batter"/);
  assert.match(form, /value="single_batter"/);
  assert.match(form, /battingMode:\s*values\.battingMode \|\| DEFAULT_BATTING_MODE/);
  assert.deepEqual(errors, ["Please select a batting mode."]);
});

test("batting mode persists through Quick Scoring saves undo innings break and finalisation", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");
  const saveRoute = readFileSync("app/api/admin/matches/route.ts", "utf8");
  const finaliseRoute = readFileSync("app/api/admin/matches/finalize/route.ts", "utf8");
  const twoBatterErrors = validateMatchRecordInput(
    validationInput({
      status: "finalised",
      stage: "finalise",
      battingMode: "two_batter"
    })
  );
  const singleBatterErrors = validateMatchRecordInput(
    validationInput({
      status: "finalised",
      stage: "finalise",
      battingMode: "single_batter"
    })
  );
  const legacyDefaultErrors = validateMatchRecordInput(
    validationInput({
      status: "finalised",
      stage: "finalise",
      battingMode: "two_batter"
    })
  );

  assert.doesNotMatch(twoBatterErrors.join("\n"), /batting mode/i);
  assert.doesNotMatch(singleBatterErrors.join("\n"), /batting mode/i);
  assert.doesNotMatch(legacyDefaultErrors.join("\n"), /batting mode/i);
  assert.match(form, /const activeBattingMode: BattingMode =\s*values\.battingMode \|\| quickScoring\.battingMode \|\| DEFAULT_BATTING_MODE/);
  assert.match(form, /const validationBattingMode =\s*status === "draft" \? values\.battingMode \|\| null : activeBattingMode/);
  assert.match(form, /const persistedBattingMode =\s*recordValues\.battingMode \|\|[\s\S]*quickScoringOverride\.battingMode \|\|[\s\S]*\(finalStatus === "draft" \? null : activeBattingMode\)/);
  assert.match(form, /battingMode:\s*persistedBattingMode/);
  assert.match(form, /quickScoring:\s*persistedQuickScoring/);
  assert.match(form, /battingMode:\s*validationBattingMode/);
  assert.match(form, /battingMode:\s*values\.battingMode \|\| DEFAULT_BATTING_MODE/);
  assert.match(form, /function startSecondInnings\(\)[\s\S]*buildCurrentMatchRecord\(\s*"in_progress"[\s\S]*nextQuickScoring/);
  assert.match(form, /function undoQuickScoringEvent\(\)[\s\S]*updateQuickScoring/);
  assert.match(saveRoute, /battingMode:\s*match\.battingMode \?\? match\.quickScoring\?\.battingMode \?\? "two_batter"/);
  assert.match(finaliseRoute, /battingMode:\s*match\.battingMode \?\? match\.quickScoring\?\.battingMode \?\? "two_batter"/);
});

test("Fielding Helpers persist through setup save active updates restart and API validation", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");
  const saveRoute = readFileSync("app/api/admin/matches/route.ts", "utf8");
  const finaliseRoute = readFileSync("app/api/admin/matches/finalize/route.ts", "utf8");

  assert.match(form, /Fielding Helpers - Optional/);
  assert.match(form, /selectedHelperIds=\{normalisedFieldingHelperIds\}/);
  assert.match(form, /fieldingHelperIds:\s*recordFieldingHelperIds/);
  assert.match(form, /fieldingHelperIds:\s*normalisedFieldingHelperIds/);
  assert.match(form, /setPlayerUpdateFieldingHelperIds\(normalisedFieldingHelperIds\)/);
  assert.match(form, /fieldingHelperIds:\s*validation\.fieldingHelperIds/);
  assert.match(form, /setFieldingHelperIds\(validation\.fieldingHelperIds\)/);
  assert.match(form, /fieldingHelperIds:\s*normalisedFieldingHelperIds,[\s\S]*performances:\s*restartPerformances/);
  assert.match(saveRoute, /fieldingHelperIds:\s*match\.fieldingHelperIds \?\? \[\]/);
  assert.match(finaliseRoute, /fieldingHelperIds:\s*match\.fieldingHelperIds \?\? \[\]/);
});

test("Fielding Helpers use separate fielder options and do not expand bowler eligibility", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");
  const quickScoring = readFileSync("lib/quick-scoring.ts", "utf8");

  assert.match(form, /bowlingPlayers=\{quickActiveBowlingPlayers\}/);
  assert.match(form, /fieldingPlayers=\{quickActiveFieldingPlayers\}/);
  assert.match(form, /const bowlerOptions = bowlingPlayers\.filter/);
  assert.match(form, /fieldingPlayers\.map\(\(player\) => \(/);
  assert.match(form, /const fielderOptions =[\s\S]*\? fieldingPlayers\.filter[\s\S]*: fieldingPlayers/);
  assert.match(quickScoring, /bowlingPlayerIds && !bowlingPlayerIds\.includes\(event\.bowlerId\)/);
  assert.match(quickScoring, /const eligibleFieldingPlayerIds = fieldingPlayerIds \?\? bowlingPlayerIds \?\? \[\]/);
});

test("Fielding Helper fielding credits are counted without changing Shared Player behavior", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(form, /const helperIdSet = new Set\(fieldingHelperIds\)/);
  assert.match(form, /calculatePlayerCatches\(player\.id, ownBowlingOvers\) \+/);
  assert.match(form, /calculatePlayerCatches\(player\.id, opposingBowlingOvers\)/);
  assert.match(form, /calculatePlayerRunOuts\(player\.id, ownBowlingOvers\) \+/);
  assert.match(form, /calculatePlayerRunOuts\(player\.id, opposingBowlingOvers\)/);
  assert.match(form, /xpBreakdown: isSharedPlayerRecord\s*\?\s*calculateSharedPlayerMatchXP/);
});

test("Quick Scoring undo and cancel reset transient wicket and no-ball editors", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(form, /const initialQuickWicketDraft =/);
  assert.match(form, /function resetQuickDeliveryEditors\(\)/);
  assert.match(form, /setQuickNoBallOpen\(false\)/);
  assert.match(form, /setQuickWicketDraft\(\{ \.\.\.initialQuickWicketDraft \}\)/);
  assert.match(form, /function updateQuickWicketDraft\(draft: typeof quickWicketDraft\)/);
  assert.match(form, /if \(!draft\.open\)[\s\S]*resetQuickDeliveryEditors\(\)/);
  assert.match(form, /function updateQuickNoBallOpen\(open: boolean\)/);
  assert.match(form, /if \(open\)[\s\S]*setQuickWicketDraft\(\{ \.\.\.initialQuickWicketDraft \}\)/);
  assert.match(form, /function appendQuickScoringEvent[\s\S]*resetQuickDeliveryEditors\(\)/);
  assert.match(form, /function undoQuickScoringEvent\(\)[\s\S]*resetQuickDeliveryEditors\(\)/);
  assert.match(form, /onWicketDraftChange=\{updateQuickWicketDraft\}/);
  assert.match(form, /onNoBallOpenChange=\{updateQuickNoBallOpen\}/);
});

test("Quick Scoring remains editable for admin after Start Match locks setup", () => {
  const startMatchState = {
    canEditMatch: true,
    status: "in_progress" as const,
    setupIsLocked: true,
    inningsPhase: "first_innings" as const,
    battingFirstTeamId: "teamA" as const
  };

  assert.equal(canEditQuickScoring(startMatchState), true);
  assert.equal(
    canEditQuickScoring({
      ...startMatchState,
      inningsPhase: "second_innings"
    }),
    true
  );
  assert.equal(
    canEditQuickScoring({
      ...startMatchState,
      setupIsLocked: false
    }),
    false
  );
  assert.equal(
    canEditQuickScoring({
      ...startMatchState,
      inningsPhase: "innings_break"
    }),
    false
  );
  assert.equal(
    canEditQuickScoring({
      ...startMatchState,
      canEditMatch: false
    }),
    false
  );
  assert.equal(
    canEditQuickScoring({
      ...startMatchState,
      status: "draft"
    }),
    false
  );
});

test("Quick Scoring editability does not depend on setup team-control state", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");
  const quickScoringEditableBlock =
    form.match(/const quickScoringBaseCanBeEdited = canEditQuickScoring\(\{[\s\S]*?\}\);/)?.[0] ?? "";

  assert.equal(
    canEditQuickScoring({
      canEditMatch: true,
      status: "in_progress",
      setupIsLocked: true,
      inningsPhase: "first_innings",
      battingFirstTeamId: "teamA"
    }),
    true
  );
  assert.match(form, /const canUseTeamControls =/);
  assert.match(form, /const quickScoringBaseCanBeEdited = canEditQuickScoring/);
  assert.match(
    form,
    /quickScoringBaseCanBeEdited &&\s*!quickActiveInningsState\.isComplete &&\s*!playerUpdateOpen/
  );
  assert.doesNotMatch(quickScoringEditableBlock, /canUseTeamControls/);
});

test("Quick Scoring selector disabled state uses scoring editability not roster lock", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(form, /const quickScoringBaseCanBeEdited = canEditQuickScoring/);
  assert.match(form, /disabled=\{!quickScoringCanBeEdited\}/);
  assert.match(form, /if \(!quickScoringCanBeEdited \|\| errorCount > 0\)/);
  assert.doesNotMatch(
    form,
    /disabled=\{isLocked \|\| !setupIsLocked \|\| !battingFirstTeamId \|\| !canUseTeamControls\}/
  );
});

test("Start Match persists scoreable quick-scoring state for reload", () => {
  const quickScoring = {
    ...createEmptyQuickScoringMetadata(),
    version: 2 as const,
    setupLocked: true,
    setupLockedAt: "2026-08-10T10:00:00.000Z",
    battingMode: "two_batter" as const,
    inningsPhase: "first_innings" as const
  };

  assert.equal(quickScoring.setupLocked, true);
  assert.equal(quickScoring.battingMode, "two_batter");
  assert.equal(quickScoring.inningsPhase, "first_innings");
  assert.equal(
    canEditQuickScoring({
      canEditMatch: true,
      status: "in_progress",
      setupIsLocked: quickScoring.setupLocked === true,
      inningsPhase: quickScoring.inningsPhase,
      battingFirstTeamId: "teamA"
    }),
    true
  );
});

test("setup lock is persisted in Quick Scoring metadata and collapses read-only", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");
  const types = readFileSync("lib/types/match.ts", "utf8");
  const quickScoring = readFileSync("lib/quick-scoring.ts", "utf8");

  assert.match(types, /setupLocked\?\: boolean/);
  assert.match(types, /setupLockedAt\?\: string/);
  assert.match(quickScoring, /setupLocked:\s*false/);
  assert.match(form, /setupLocked:\s*true/);
  assert.match(form, /setupLockedAt/);
  assert.match(form, /const setupIsLocked = status !== "draft" \|\| quickScoring\.setupLocked === true/);
  assert.match(form, /const setupIsCollapsed = setupIsLocked && !setupExpanded/);
  assert.match(form, /View Setup/);
  assert.match(form, /Hide Setup/);
  assert.match(form, /Team A: \{teamA\.length\} players/);
});

test("availability and roster controls lock once setup starts", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(form, /const isRosterLocked = setupIsLocked \|\| !canEditMatch/);
  assert.match(form, /if \(isRosterLocked\) return/);
  assert.match(
    form,
    /isRosterLocked \|\|\s*isBalancing \|\|\s*availablePlayerIds\.length < 2 \|\|\s*!canUseTeamControls/
  );
});

test("setup start action validates required setup before locking", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(form, /Start Match/);
  assert.match(form, /validateAndSetStatus\("in_progress", "start"\)/);
  assert.match(form, /Please select the number of overs\./);
  assert.match(form, /Please select the match date\./);
  assert.match(form, /Please enter the match name\./);
  assert.match(form, /Please select the available players\./);
  assert.match(form, /Please select which team will bat first\./);
  assert.match(form, /Please assign all available players to Team A or Team B\./);
  assert.match(form, /const visibleSetupErrors = setupValidationAttempted \? setupErrors : \{\}/);
  assert.match(form, /disabled=\{isSavingMatch \|\| isRosterLocked\}/);
  assert.doesNotMatch(form, /disabled=\{isSavingMatch \|\| isRosterLocked \|\| !canUseTeamControls\}/);
});

test("setup can be edited before first quick scoring event only", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(
    form,
    /const hasQuickScoringEvents =\s*quickScoring\.inningsAEvents\.length \+ quickScoring\.inningsBEvents\.length > 0/
  );
  assert.match(form, /const canEditLockedSetup =\s*setupIsLocked && !isFinalised && !hasQuickScoringEvents/);
  assert.match(form, /function editLockedSetupBeforeScoring\(\)/);
  assert.match(form, /setupLocked:\s*false/);
  assert.match(form, /setStatus\("draft"\)/);
  assert.match(form, /Edit Setup/);
});

test("detailed bowling and player records are collapsed by default but remain mounted", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(form, /const \[detailedRecordsExpanded, setDetailedRecordsExpanded\] = useState\(false\)/);
  assert.match(form, /Detailed Records/);
  assert.match(form, /Bowling and player records are automatically updated from Quick Scoring\./);
  assert.match(form, /aria-expanded=\{detailedRecordsExpanded\}/);
  assert.match(form, /hidden=\{!detailedRecordsExpanded\}/);
  assert.match(form, /detailedRecordsExpanded \? "Hide Records" : "View Records"/);
  assert.match(form, /<TeamBowlingSection/);
  assert.match(form, /<TeamPlayerRecordsSection/);
});

test("player of the match uses automatic recommendation until manually overridden", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");
  const playerOfMatch = readFileSync("lib/player-of-match.ts", "utf8");

  assert.match(form, /const \[playerOfMatchSelectionMode, setPlayerOfMatchSelectionMode\] = useState/);
  assert.match(form, /playerOfMatchSelectionMode !== "auto"/);
  assert.match(form, /playerOfMatchRecommendation\.recommendedPlayerId/);
  assert.match(form, /performance\.playerId === recommendedPlayerId/);
  assert.match(form, /performance\.playerOfMatch/);
  assert.match(form, /setPlayerOfMatchSelectionMode\("manual"\)/);
  assert.match(playerOfMatch, /calculatePrePomPlayerMatchXP/);
  assert.match(playerOfMatch, /calculatePrePomSharedPlayerMatchXP/);
  assert.match(playerOfMatch, /playerOfMatch:\s*false/);
  assert.match(playerOfMatch, /const isTie = leaders\.length > 1/);
  assert.match(playerOfMatch, /recommendedPlayerId: isTie \? null : leaders\[0\]\?\.playerId \?\? null/);
});

test("completed quick-scoring innings locks scoring controls but keeps undo available", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");
  const css = readFileSync("app/globals.css", "utf8");

  assert.match(
    form,
    /quickScoringBaseCanBeEdited &&\s*!quickActiveInningsState\.isComplete &&\s*!playerUpdateOpen/
  );
  assert.match(
    form,
    /const canUndoQuickScoring =\s*!isLocked &&\s*!playerUpdateOpen &&\s*status === "in_progress" &&\s*quickActiveEvents\.length > 0/
  );
  assert.match(form, /canUndo=\{canUndoQuickScoring\}/);
  assert.match(form, /const inningsIsComplete = inningsState\.isComplete/);
  assert.match(form, /const scoringDisabled = disabled \|\| inningsIsComplete/);
  assert.match(form, /inningsCompleteMessage \?\? "Innings Complete"/);
  assert.match(form, /Review the innings before continuing\./);
  assert.match(form, /onClick=\{onUndo\}/);
  assert.match(form, /disabled=\{!canUndo\}/);
  assert.match(form, /\{!inningsIsComplete \? \(/);
  assert.match(form, /className="quick-completion-undo"/);
  assert.match(css, /\.quick-completion-undo\s*{[\s\S]*?min-height:\s*48px;/);
  assert.match(css, /\.quick-completion-undo\s*{[\s\S]*?width:\s*min\(100%, 280px\);/);
  assert.match(css, /\.quick-completion-undo\s*{[\s\S]*?border:\s*2px solid/);
  assert.doesNotMatch(form, /Undo Last Ball[\s\S]{0,120}disabled=\{disabled\}/);
});

test("first-innings break exposes protected Undo without enabling normal scoring", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");
  const inningsBreakBlock = form.slice(
    form.indexOf("function InningsBreakPanel"),
    form.indexOf("function QuickScoringPanel")
  );

  assert.match(inningsBreakBlock, /onStartSecondInnings/);
  assert.match(inningsBreakBlock, /canUndo: boolean/);
  assert.match(inningsBreakBlock, /onUndo: \(\) => void/);
  assert.match(inningsBreakBlock, /START SECOND INNINGS/);
  assert.match(inningsBreakBlock, /UNDO LAST BALL/);
  assert.match(inningsBreakBlock, /disabled=\{!canUndo\}/);
});

test("single-batter and last-batter-solo run outs dismiss the active batter automatically", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(form, /const effectiveRunOutDismissedPlayerId =\s*requiresNonStriker\s*\?\s*wicketDraft\.dismissedPlayerId\s*:\s*selection\.strikerId/);
  assert.match(form, /event\.target\.value === "run_out"[\s\S]*?\? requiresNonStriker[\s\S]*?\? ""[\s\S]*?: selection\.strikerId/);
  assert.match(form, /Batter being run out: <strong>\{effectiveRunOutBatterName\}<\/strong>/);
  assert.match(form, /quickWicketDraft\.type === "run_out"[\s\S]*?quickRequiresNonStriker[\s\S]*?\? quickWicketDraft\.dismissedPlayerId[\s\S]*?: quickSelection\.strikerId/);
});

test("quick scoring autosave remains immediate and records every quick-scoring state update", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");
  const autosaveBlock = form.slice(
    form.indexOf("async function autosaveQuickScoring"),
    form.indexOf("function resetQuickDeliveryEditors")
  );
  const updateBlock = form.slice(
    form.indexOf("function updateQuickScoring"),
    form.indexOf("function resetQuickDeliveryEditors")
  );

  assert.match(autosaveBlock, /setQuickSaveStatus\("Saving\.\.\."\)/);
  assert.match(autosaveBlock, /persistNonFinalisedMatch/);
  assert.match(autosaveBlock, /buildCurrentMatchRecord\([\s\S]*?nextQuickScoring/);
  assert.match(autosaveBlock, /setQuickSaveStatus\(saved \? "Saved" : "Save needed"\)/);
  assert.match(updateBlock, /setQuickScoring\(nextQuickScoring\)/);
  assert.match(updateBlock, /void autosaveQuickScoring\(nextQuickScoring\)/);
  assert.doesNotMatch(autosaveBlock, /setTimeout|setInterval/);
  assert.doesNotMatch(updateBlock, /setTimeout|setInterval/);
});

test("mobile live scoring uses compact score and keeps detailed score cards secondary", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");
  const css = readFileSync("app/globals.css", "utf8");

  assert.match(form, /function CompactLiveScoreBanner/);
  assert.match(form, /className=\{status === "in_progress" \? "live-result-full-preview" : ""\}/);
  assert.match(form, /<CompactLiveScoreBanner/);
  assert.match(form, /innings-allocation-primary/);
  assert.match(form, /innings-allocation-mobile-details/);
  assert.match(css, /@media \(max-width:\s*700px\)[\s\S]*?\.live-result-full-preview\s*{\s*display:\s*none;/);
  assert.match(css, /@media \(max-width:\s*700px\)[\s\S]*?\.mobile-live-score\s*{\s*display:\s*grid;/);
  assert.match(css, /@media \(max-width:\s*700px\)[\s\S]*?\.innings-allocation-primary\.is-live-scoring\s*{\s*display:\s*none;/);
});

test("live result preview appears once near the top before Quick Scoring", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.equal(form.match(/<ResultBanner/g)?.length, 1);
  assert.ok(form.indexOf("<ResultBanner") < form.indexOf("<CompactLiveScoreBanner"));
  assert.ok(form.indexOf("<ResultBanner") < form.indexOf("<QuickScoringPanel"));
  assert.ok(form.indexOf("<ResultBanner") < form.indexOf("Match Setup"));
});

test("first innings completion persists an innings break until Start Second Innings", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");
  const types = readFileSync("lib/types/match.ts", "utf8");

  assert.match(types, /export type QuickScoringInningsPhase =/);
  assert.match(types, /"innings_break"/);
  assert.match(form, /const isFirstInningsBreak =/);
  assert.match(form, /inningsPhase:\s*"innings_break"/);
  assert.match(form, /firstInningsCompletedAt/);
  assert.match(form, /function startSecondInnings\(\)/);
  assert.match(form, /inningsPhase:\s*"second_innings"/);
  assert.match(form, /START SECOND INNINGS/);
  assert.match(form, /undoQuickScoringEvent[\s\S]*inningsPhase:\s*"first_innings"/);
  assert.match(form, /isFirstInningsBreak \?/);
});

test("mobile setup and team assignment use compact responsive markers", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");
  const css = readFileSync("app/globals.css", "utf8");

  assert.match(form, /available-today-grid/);
  assert.match(form, /team-assignment-summary/);
  assert.match(form, /team-assignment-column/);
  assert.match(form, /locked-setup-summary/);
  assert.match(form, /mobile-locked-setup-title/);
  assert.match(css, /@media \(max-width:\s*700px\)[\s\S]*?\.available-today-grid\s*{\s*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /@media \(max-width:\s*360px\)[\s\S]*?\.available-today-grid\s*{\s*grid-template-columns:\s*1fr;/);
  assert.match(css, /@media \(max-width:\s*700px\)[\s\S]*?\.team-assignment-summary\s*{\s*display:\s*flex;/);
  assert.match(css, /@media \(max-width:\s*700px\)[\s\S]*?\.quick-correction-row\s*{\s*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
});

test("quick scoring displays inline selection and wicket validation before appending events", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.match(form, /type QuickSelectionErrors/);
  assert.match(form, /type QuickWicketErrors/);
  assert.match(form, /Please select the striker\./);
  assert.match(form, /Please select the non-striker\./);
  assert.match(form, /Please select the bowler\./);
  assert.match(form, /Please select who was run out\./);
  assert.match(form, /Please select the catcher\./);
  assert.match(form, /Please select the run-out fielder\./);
  assert.match(form, /Please select the completed runs before the run out\./);
  assert.match(form, /Please select the new batter\./);
  assert.match(form, /const errorCount = Object\.keys\(quickSelectionErrors\)\.length/);
  assert.match(form, /const wicketErrorCount = Object\.keys\(quickWicketErrors\)\.length/);
  const submitBlock = form.slice(form.indexOf("function submitQuickWicket()"));
  assert.ok(
    submitBlock.indexOf("if (selectionErrorCount + wicketErrorCount > 0)") <
      submitBlock.indexOf("appendQuickScoringEvent({")
  );
});

test("over sequencing treats blank fields as incomplete and zero values as complete", () => {
  assert.equal(
    isBowlingOverComplete({
      ...over("teamA", "", 1),
      runsConceded: "",
      dismissals: []
    }),
    false
  );
  assert.equal(
    isBowlingOverComplete({
      ...over("teamA", "aninda", 1),
      runsConceded: "",
      dismissals: []
    }),
    false
  );
  assert.equal(
    isBowlingOverComplete({
      ...over("teamA", "aninda", 1),
      runsConceded: 0,
      dismissals: []
    }),
    true
  );
});

test("maiden overs require zero runs", () => {
  assert.equal(
    isBowlingOverComplete({
      ...over("teamA", "aninda", 1, { runsConceded: 5 }),
      maiden: true
    }),
    false
  );
  assert.equal(
    isBowlingOverComplete({
      ...over("teamA", "aninda", 1, { runsConceded: 0 }),
      maiden: true
    }),
    true
  );
});

test("four-player batting team permits at most four wickets", () => {
  const errors = validateMatchRecordInput(validationInput({
    availablePlayerIds: ["aninda", "arunabha", "atripan", "biplab", "dipanjan"],
    teamAPlayerIds: ["aninda"],
    teamBPlayerIds: ["arunabha", "atripan", "biplab", "dipanjan"],
    performances: [performance("aninda", "teamA", 10)],
    bowlingOvers: {
      teamA: [over("teamA", "aninda", 1, { wicketsLost: 4 })],
      teamB: []
    }
  }));

  assert.equal(errors.includes("Total wickets cannot exceed the number of players in the batting team."), false);
});

test("cumulative wickets across overs cannot exceed the batting team size", () => {
  const errors = validateMatchRecordInput(validationInput({
    availablePlayerIds: ["aninda", "arunabha", "atripan", "biplab", "dipanjan"],
    teamAPlayerIds: ["aninda"],
    teamBPlayerIds: ["arunabha", "atripan", "biplab", "dipanjan"],
    performances: [performance("aninda", "teamA", 10)],
    bowlingOvers: {
      teamA: [
        over("teamA", "aninda", 1, { wicketsLost: 2 }),
        over("teamA", "aninda", 2, { wicketsLost: 3 })
      ],
      teamB: []
    }
  }));

  assert.equal(errors.includes("Total wickets cannot exceed the number of players in the batting team."), true);
});

test("changing one over recalculates the remaining dismissal maximum", () => {
  const overs = [
    over("teamA", "aninda", 1, { wicketsLost: 1 }),
    over("teamA", "aninda", 2, { wicketsLost: 2 })
  ];

  assert.equal(
    calculateRemainingWicketsForOver({
      overs,
      currentOverId: "teamA-2",
      battingTeamPlayerCount: 4
    }),
    3
  );
});

test("Team A and Team B wicket caps use their own opposing player counts", () => {
  const errors = validateMatchRecordInput(validationInput({
    availablePlayerIds: ["aninda", "arunabha", "atripan", "biplab", "dipanjan"],
    teamAPlayerIds: ["aninda", "arunabha", "atripan"],
    teamBPlayerIds: ["biplab", "dipanjan"],
    performances: [],
    bowlingOvers: {
      teamA: [over("teamA", "aninda", 1, { wicketsLost: 3 })],
      teamB: [over("teamB", "biplab", 1, { wicketsLost: 3 })]
    }
  }));

  assert.equal(errors.includes("Total wickets cannot exceed the number of players in the batting team."), true);
});

test("innings state marks a four-player batting team all out at four wickets", () => {
  const state = getInningsState({
    battingTeamId: "teamB",
    bowlingTeamId: "teamA",
    battingPlayerCount: 4,
    bowlingOvers: [over("teamA", "aninda", 1, { wicketsLost: 2 }), over("teamA", "aninda", 2, { wicketsLost: 2 })],
    scheduledOvers: 8,
    runs: 24
  });

  assert.equal(state.isAllOut, true);
  assert.equal(state.isComplete, true);
  assert.equal(state.endReason, "all_out");
  assert.equal(getInningsCompleteMessage(state), "INNINGS COMPLETE - ALL 4 WICKETS TAKEN");
});

test("existing overs after the all-out point produce validation errors", () => {
  const errors = validateMatchRecordInput(validationInput({
    availablePlayerIds: ["aninda", "arunabha", "atripan", "biplab", "dipanjan"],
    teamAPlayerIds: ["aninda"],
    teamBPlayerIds: ["arunabha", "atripan", "biplab", "dipanjan"],
    performances: [performance("aninda", "teamA", 10)],
    bowlingOvers: {
      teamA: [
        over("teamA", "aninda", 1, { wicketsLost: 1 }),
        over("teamA", "aninda", 2, { wicketsLost: 1 }),
        over("teamA", "aninda", 3, { wicketsLost: 1 }),
        over("teamA", "aninda", 4, { wicketsLost: 1 }),
        over("teamA", "aninda", 5, { wicketsLost: 0 })
      ],
      teamB: []
    }
  }));

  assert.equal(errors.includes("Delete over 5; the innings was already all out."), true);
});

test("Add Over disables at the scheduled-over limit", () => {
  const state = getInningsState({
    battingTeamId: "teamB",
    bowlingTeamId: "teamA",
    battingPlayerCount: 4,
    bowlingOvers: [
      over("teamA", "aninda", 1),
      over("teamA", "aninda", 2)
    ],
    scheduledOvers: 2,
    runs: 15
  });

  assert.equal(state.isComplete, true);
  assert.equal(state.endReason, "overs_completed");
  assert.equal(getInningsCompleteMessage(state), "INNINGS COMPLETE - 2 OVERS COMPLETED");
});

test("server rejects completed overs beyond the scheduled-over limit", () => {
  const errors = validateMatchRecordInput(validationInput({
    scheduledOversPerInnings: 1,
    bowlingOvers: {
      teamA: [
        over("teamA", "aninda", 1),
        over("teamA", "aninda", 2)
      ],
      teamB: []
    }
  }));

  assert.equal(errors.includes("Completed overs cannot exceed the scheduled overs per innings."), true);
});

test("chase disables Add Over after target is reached", () => {
  const state = getInningsState({
    battingTeamId: "teamB",
    bowlingTeamId: "teamA",
    battingPlayerCount: 4,
    bowlingOvers: [over("teamA", "aninda", 1, { runsConceded: 12 })],
    scheduledOvers: 8,
    runs: 26,
    target: 26
  });

  assert.equal(state.isComplete, true);
  assert.equal(state.endReason, "target_reached");
  assert.equal(getInningsCompleteMessage(state), "CHASE COMPLETE - TARGET REACHED");
});

test("Team B Bowling updates Team A live score from complete overs", () => {
  const teamBBowling = [
    over("teamB", "biplab", 1, { runsConceded: 8, wicketsLost: 0 }),
    over("teamB", "biplab", 2, { runsConceded: 10, wicketsLost: 1 }),
    over("teamB", "biplab", 3, { runsConceded: 12, wicketsLost: 1 }),
    over("teamB", "biplab", 4, { runsConceded: 5, wicketsLost: 0 })
  ];
  const score = getLiveInningsScore({
    battingTeamId: "teamA",
    opposingBowlingOvers: teamBBowling,
    playerPerformances: [
      { ...performance("aninda", "teamA", 20), didBat: true },
      { ...performance("arunabha", "teamA", 13), didBat: true }
    ],
    extras: 2
  });

  assert.deepEqual(calculateScoreFromBowlingFeed(teamBBowling), {
    runs: 35,
    wicketsLost: 2,
    completedOvers: 4
  });
  assert.equal(formatInningsScore(score.runs, score.wicketsLost), "35/2");
  assert.equal(score.source, "bowling_feed");
  assert.equal(score.isReconciled, true);
});

test("Team A Bowling updates Team B live score and player runs are not added twice", () => {
  const score = getLiveInningsScore({
    battingTeamId: "teamB",
    opposingBowlingOvers: [
      over("teamA", "aninda", 1, { runsConceded: 8, wicketsLost: 0 }),
      over("teamA", "aninda", 2, { runsConceded: 10, wicketsLost: 1 })
    ],
    playerPerformances: [{ ...performance("biplab", "teamB", 99), didBat: true }],
    extras: 0
  });

  assert.equal(score.runs, 18);
  assert.equal(score.allocatedBatterRuns, 99);
  assert.equal(score.isReconciled, false);
});

test("before a complete over exists player records plus extras provide provisional score", () => {
  const score = getLiveInningsScore({
    battingTeamId: "teamA",
    opposingBowlingOvers: [
      {
        ...over("teamB", "", 1),
        runsConceded: "",
        dismissals: []
      }
    ],
    playerPerformances: [{ ...performance("aninda", "teamA", 11), didBat: true }],
    extras: 2
  });

  assert.equal(score.runs, 11);
  assert.equal(score.source, "player_records");
  assert.equal(score.isReconciled, true);
});

test("official bowling total derives automatic extras from player-run allocation", () => {
  const exactAllocation = calculateBattingAllocation(20, [
    performance("aninda", "teamA", 8),
    performance("atripan", "teamA", 2),
    performance("soman", "teamA", 10)
  ]);
  const allocationWithExtras = calculateBattingAllocation(20, [
    performance("aninda", "teamA", 8),
    performance("atripan", "teamA", 2),
    performance("soman", "teamA", 7)
  ]);

  assert.deepEqual(exactAllocation, {
    playerRunsTotal: 20,
    extras: 0,
    isValid: true,
    excessPlayerRuns: 0
  });
  assert.deepEqual(allocationWithExtras, {
    playerRunsTotal: 17,
    extras: 3,
    isValid: true,
    excessPlayerRuns: 0
  });
});

test("empty player runs are treated as zero in allocation calculations", () => {
  const allocation = calculateBattingAllocation(20, [
    { ...performance("aninda", "teamA", 8), runs: "" },
    performance("atripan", "teamA", 2)
  ]);

  assert.equal(allocation.playerRunsTotal, 2);
  assert.equal(allocation.extras, 18);
  assert.equal(allocation.isValid, true);
});

test("player totals use numeric addition instead of string concatenation", () => {
  const total = calculateTeamTotal("teamA", [
    { ...performance("aninda", "teamA", 0), runs: "013" as unknown as number },
    { ...performance("atripan", "teamA", 0), runs: "2" as unknown as number }
  ]);

  assert.equal(total, 15);
  assert.notEqual(total, "0132");
});

test("player-run total cannot exceed official bowling total", () => {
  const allocation = calculateBattingAllocation(20, [
    performance("aninda", "teamA", 8),
    performance("atripan", "teamA", 2),
    performance("soman", "teamA", 11)
  ]);

  assert.deepEqual(allocation, {
    playerRunsTotal: 21,
    extras: 0,
    isValid: false,
    excessPlayerRuns: 1
  });
});

test("dynamic player run maximum is calculated from other batter allocations", () => {
  const maximum = getMaximumRunsForPlayer("soman", 20, [
    performance("aninda", "teamA", 8),
    performance("atripan", "teamA", 2),
    performance("soman", "teamA", 0)
  ]);

  assert.equal(maximum, 10);
});

test("official result and score use bowling-feed totals without adding player runs again", () => {
  const score = getLiveInningsScore({
    battingTeamId: "teamA",
    opposingBowlingOvers: [
      over("teamB", "biplab", 1, { runsConceded: 8 }),
      over("teamB", "biplab", 2, { runsConceded: 6 }),
      over("teamB", "biplab", 3, { runsConceded: 4 }),
      over("teamB", "biplab", 4, { runsConceded: 2 })
    ],
    playerPerformances: [
      performance("aninda", "teamA", 8),
      performance("atripan", "teamA", 2),
      performance("soman", "teamA", 7)
    ],
    extras: 0
  });

  assert.equal(score.runs, 20);
  assert.equal(score.allocatedBatterRuns, 17);
  assert.equal(score.extras, 3);
  assert.equal(score.battingAllocationTotal, 20);
});

test("server rejects overs after the chase target was already reached", () => {
  const errors = validateMatchRecordInput(validationInput({
    availablePlayerIds: ["aninda", "arunabha"],
    teamAPlayerIds: ["aninda"],
    teamBPlayerIds: ["arunabha"],
    battingFirstTeamId: "teamB",
    performances: [
      performance("aninda", "teamA", 12),
      performance("arunabha", "teamB", 10)
    ],
    bowlingOvers: {
      teamA: [],
      teamB: [
        over("teamB", "arunabha", 1, { runsConceded: 11 }),
        over("teamB", "arunabha", 2, { runsConceded: 0 })
      ]
    }
  }));

  assert.equal(errors.includes("Delete over 2; the chase target was already reached."), true);
});

test("caught dismissal derives innings wicket, bowler wicket and catcher catch", () => {
  const caughtOver = over("teamA", "aninda", 1, {
    dismissals: [
      dismissal({
        overId: "teamA-1",
        battingTeamId: "teamB",
        bowlingTeamId: "teamA",
        dismissedBatterId: "biplab",
        type: "caught",
        creditedBowlerId: "aninda",
        fielderId: "arunabha"
      })
    ]
  });

  assert.equal(calculateScoreFromBowlingFeed([caughtOver]).wicketsLost, 1);
  assert.equal(calculateBowlerWickets("aninda", [caughtOver]), 1);
  assert.equal(calculatePlayerCatches("arunabha", [caughtOver]), 1);
  assert.equal(calculatePlayerRunOuts("arunabha", [caughtOver]), 0);
});

test("run-out dismissal derives innings wicket and fielder run-out only", () => {
  const runOutOver = over("teamA", "aninda", 1, {
    dismissals: [
      dismissal({
        overId: "teamA-1",
        battingTeamId: "teamB",
        bowlingTeamId: "teamA",
        dismissedBatterId: "biplab",
        type: "run_out",
        creditedBowlerId: null,
        fielderId: "arunabha"
      })
    ]
  });

  assert.equal(calculateScoreFromBowlingFeed([runOutOver]).wicketsLost, 1);
  assert.equal(calculateBowlerWickets("aninda", [runOutOver]), 0);
  assert.equal(calculatePlayerRunOuts("arunabha", [runOutOver]), 1);
});

test("bowler wicket derives innings wicket and bowler wicket only", () => {
  const bowlerWicketOver = over("teamA", "aninda", 1, { wicketsLost: 1 });

  assert.equal(calculateScoreFromBowlingFeed([bowlerWicketOver]).wicketsLost, 1);
  assert.equal(calculateBowlerWickets("aninda", [bowlerWicketOver]), 1);
  assert.equal(calculatePlayerCatches("aninda", [bowlerWicketOver]), 0);
  assert.equal(calculatePlayerRunOuts("aninda", [bowlerWicketOver]), 0);
});

test("three bowler-credited wickets in one over create one hat-trick", () => {
  const hatTrickOver = over("teamA", "aninda", 1, {
    dismissals: [
      dismissal({
        overId: "teamA-1",
        battingTeamId: "teamB",
        bowlingTeamId: "teamA",
        dismissedBatterId: "biplab",
        creditedBowlerId: "aninda"
      }),
      dismissal({
        overId: "teamA-1",
        battingTeamId: "teamB",
        bowlingTeamId: "teamA",
        dismissedBatterId: "dipanjan",
        type: "caught",
        creditedBowlerId: "aninda",
        fielderId: "arunabha"
      }),
      dismissal({
        overId: "teamA-1",
        battingTeamId: "teamB",
        bowlingTeamId: "teamA",
        dismissedBatterId: "gaurav",
        creditedBowlerId: "aninda"
      })
    ]
  });

  assert.equal(calculatePlayerHatTricks("aninda", [hatTrickOver]), 1);
});

test("two bowler wickets plus one run-out do not create a hat-trick", () => {
  const mixedOver = over("teamA", "aninda", 1, {
    dismissals: [
      dismissal({
        overId: "teamA-1",
        battingTeamId: "teamB",
        bowlingTeamId: "teamA",
        dismissedBatterId: "biplab",
        creditedBowlerId: "aninda"
      }),
      dismissal({
        overId: "teamA-1",
        battingTeamId: "teamB",
        bowlingTeamId: "teamA",
        dismissedBatterId: "dipanjan",
        creditedBowlerId: "aninda"
      }),
      dismissal({
        overId: "teamA-1",
        battingTeamId: "teamB",
        bowlingTeamId: "teamA",
        dismissedBatterId: "gaurav",
        type: "run_out",
        creditedBowlerId: null,
        fielderId: "arunabha"
      })
    ]
  });

  assert.equal(calculatePlayerHatTricks("aninda", [mixedOver]), 0);
});

test("four-over dismissal example derives per-player wickets catches and run-outs", () => {
  const bowlingOvers = [
    over("teamA", "aninda", 1, {
      runsConceded: 10,
      dismissals: [
        dismissal({
          overId: "teamA-1",
          battingTeamId: "teamB",
          bowlingTeamId: "teamA",
          dismissedBatterId: "biplab",
          type: "bowled",
          creditedBowlerId: "aninda"
        })
      ]
    }),
    over("teamA", "atripan", 2, {
      runsConceded: 15,
      dismissals: [
        dismissal({
          overId: "teamA-2",
          battingTeamId: "teamB",
          bowlingTeamId: "teamA",
          dismissedBatterId: "dipanjan",
          type: "run_out",
          creditedBowlerId: null,
          fielderId: "soman"
        })
      ]
    }),
    over("teamA", "aninda", 3, {
      runsConceded: 11,
      dismissals: [
        dismissal({
          overId: "teamA-3",
          battingTeamId: "teamB",
          bowlingTeamId: "teamA",
          dismissedBatterId: "gaurav",
          type: "caught",
          creditedBowlerId: "aninda",
          fielderId: "aninda"
        })
      ]
    }),
    over("teamA", "atripan", 4, {
      runsConceded: 5,
      dismissals: [
        dismissal({
          overId: "teamA-4",
          battingTeamId: "teamB",
          bowlingTeamId: "teamA",
          dismissedBatterId: "rohit",
          type: "caught",
          creditedBowlerId: "atripan",
          fielderId: "soman"
        })
      ]
    })
  ];
  const afterThreeOvers = getInningsState({
    battingTeamId: "teamB",
    bowlingTeamId: "teamA",
    battingPlayerCount: 4,
    bowlingOvers: bowlingOvers.slice(0, 3),
    scheduledOvers: 8,
    runs: 36
  });
  const allOut = getInningsState({
    battingTeamId: "teamB",
    bowlingTeamId: "teamA",
    battingPlayerCount: 4,
    bowlingOvers,
    scheduledOvers: 8,
    runs: 41
  });
  const bowlerCreditedWickets =
    calculateBowlerWickets("aninda", bowlingOvers) +
    calculateBowlerWickets("atripan", bowlingOvers);
  const runOuts = calculatePlayerRunOuts("soman", bowlingOvers);

  assert.equal(calculateBowlerWickets("aninda", bowlingOvers), 2);
  assert.equal(calculatePlayerCatches("aninda", bowlingOvers), 1);
  assert.equal(calculateBowlerWickets("atripan", bowlingOvers), 1);
  assert.equal(calculatePlayerCatches("soman", bowlingOvers), 1);
  assert.equal(calculatePlayerRunOuts("soman", bowlingOvers), 1);
  assert.equal(calculateBowlerWickets("atripan", [bowlingOvers[1]]), 0);
  assert.equal(calculateScoreFromBowlingFeed(bowlingOvers).wicketsLost, 4);
  assert.equal(bowlerCreditedWickets + runOuts, 4);
  assert.equal(afterThreeOvers.isComplete, false);
  assert.equal(allOut.isAllOut, true);
  assert.equal(allOut.isComplete, true);
});

test("stumped dismissal credits bowler and selected non-bowler stumper only", () => {
  const stumpedOver = over("teamA", "aninda", 1, {
    dismissals: [
      dismissal({
        overId: "teamA-1",
        battingTeamId: "teamB",
        bowlingTeamId: "teamA",
        dismissedBatterId: "biplab",
        type: "stumped",
        creditedBowlerId: "aninda",
        fielderId: "arunabha"
      })
    ]
  });

  assert.equal(calculateScoreFromBowlingFeed([stumpedOver]).wicketsLost, 1);
  assert.equal(calculateBowlerWickets("aninda", [stumpedOver]), 1);
  assert.equal(calculatePlayerStumpings("arunabha", [stumpedOver]), 1);
  assert.equal(calculatePlayerCatches("arunabha", [stumpedOver]), 0);
  assert.equal(calculatePlayerRunOuts("arunabha", [stumpedOver]), 0);
});

test("server rejects stumping when stumper is the bowler", () => {
  const errors = validateMatchRecordInput(validationInput({
    availablePlayerIds: ["aninda", "arunabha", "biplab"],
    teamAPlayerIds: ["aninda", "arunabha"],
    teamBPlayerIds: ["biplab"],
    bowlingOvers: {
      teamA: [
        over("teamA", "aninda", 1, {
          dismissals: [
            dismissal({
              overId: "teamA-1",
              battingTeamId: "teamB",
              bowlingTeamId: "teamA",
              dismissedBatterId: "biplab",
              type: "stumped",
              creditedBowlerId: "aninda",
              fielderId: "aninda"
            })
          ]
        })
      ],
      teamB: []
    }
  }));

  assert.equal(errors.includes("The bowler cannot also be selected as the stumper."), true);
});

test("server rejects stumping when stumper is not from bowling team", () => {
  const errors = validateMatchRecordInput(validationInput({
    availablePlayerIds: ["aninda", "arunabha", "biplab", "dipanjan"],
    teamAPlayerIds: ["aninda", "arunabha"],
    teamBPlayerIds: ["biplab", "dipanjan"],
    bowlingOvers: {
      teamA: [
        over("teamA", "aninda", 1, {
          dismissals: [
            dismissal({
              overId: "teamA-1",
              battingTeamId: "teamB",
              bowlingTeamId: "teamA",
              dismissedBatterId: "biplab",
              type: "stumped",
              creditedBowlerId: "aninda",
              fielderId: "dipanjan"
            })
          ]
        })
      ],
      teamB: []
    }
  }));

  assert.equal(errors.includes("Every stumping fielder must belong to the bowling team or Fielding Helpers."), true);
});

test("server rejects duplicate dismissed batters in an innings", () => {
  const errors = validateMatchRecordInput(validationInput({
    availablePlayerIds: ["aninda", "arunabha", "biplab", "dipanjan"],
    teamAPlayerIds: ["aninda", "arunabha"],
    teamBPlayerIds: ["biplab", "dipanjan"],
    bowlingOvers: {
      teamA: [
        over("teamA", "aninda", 1, {
          dismissals: [
            dismissal({
              id: "dup-1",
              overId: "teamA-1",
              battingTeamId: "teamB",
              bowlingTeamId: "teamA",
              dismissedBatterId: "biplab",
              creditedBowlerId: "aninda"
            }),
            dismissal({
              id: "dup-2",
              overId: "teamA-1",
              battingTeamId: "teamB",
              bowlingTeamId: "teamA",
              dismissedBatterId: "biplab",
              creditedBowlerId: "aninda"
            })
          ]
        })
      ],
      teamB: []
    }
  }));

  assert.equal(errors.includes("A batter cannot be dismissed twice in the same innings."), true);
});

test("server rejects caught dismissals when catcher is not from bowling team or Fielding Helpers", () => {
  const errors = validateMatchRecordInput(validationInput({
    availablePlayerIds: ["aninda", "arunabha", "biplab", "dipanjan"],
    teamAPlayerIds: ["aninda", "arunabha"],
    teamBPlayerIds: ["biplab", "dipanjan"],
    bowlingOvers: {
      teamA: [
        over("teamA", "aninda", 1, {
          dismissals: [
            dismissal({
              overId: "teamA-1",
              battingTeamId: "teamB",
              bowlingTeamId: "teamA",
              dismissedBatterId: "biplab",
              type: "caught",
              creditedBowlerId: "aninda",
              fielderId: "dipanjan"
            })
          ]
        })
      ],
      teamB: []
    }
  }));

  assert.equal(
    errors.includes("Every catcher must belong to the bowling team or Fielding Helpers."),
    true
  );
});

test("server rejects run-outs when fielder is not from bowling team or Fielding Helpers", () => {
  const errors = validateMatchRecordInput(validationInput({
    availablePlayerIds: ["aninda", "arunabha", "biplab", "dipanjan"],
    teamAPlayerIds: ["aninda", "arunabha"],
    teamBPlayerIds: ["biplab", "dipanjan"],
    bowlingOvers: {
      teamA: [
        over("teamA", "aninda", 1, {
          dismissals: [
            dismissal({
              overId: "teamA-1",
              battingTeamId: "teamB",
              bowlingTeamId: "teamA",
              dismissedBatterId: "biplab",
              type: "run_out",
              creditedBowlerId: null,
              fielderId: "dipanjan"
            })
          ]
        })
      ],
      teamB: []
    }
  }));

  assert.equal(
    errors.includes("Every run-out fielder must belong to the bowling team or Fielding Helpers."),
    true
  );
});

test("server rejects incomplete dismissal rows when finalising", () => {
  const errors = validateMatchRecordInput(validationInput({
    status: "finalised",
    bowlingOvers: {
      teamA: [
        over("teamA", "aninda", 1, {
          dismissals: [
            dismissal({
              overId: "teamA-1",
              battingTeamId: "teamB",
              bowlingTeamId: "teamA",
              dismissedBatterId: "",
              creditedBowlerId: "aninda"
            })
          ]
        })
      ],
      teamB: []
    }
  }));

  assert.equal(errors.includes("Complete every bowling over before finalising."), true);
});

test("server rejects a fifth dismissal after a four-player team is all out", () => {
  const errors = validateMatchRecordInput(validationInput({
    availablePlayerIds: ["aninda", "arunabha", "atripan", "biplab", "dipanjan"],
    teamAPlayerIds: ["aninda"],
    teamBPlayerIds: ["arunabha", "atripan", "biplab", "dipanjan"],
    performances: [performance("aninda", "teamA", 10)],
    bowlingOvers: {
      teamA: [
        over("teamA", "aninda", 1, {
          dismissals: [
            dismissal({
              id: "all-out-1",
              overId: "teamA-1",
              battingTeamId: "teamB",
              bowlingTeamId: "teamA",
              dismissedBatterId: "arunabha",
              creditedBowlerId: "aninda"
            }),
            dismissal({
              id: "all-out-2",
              overId: "teamA-1",
              battingTeamId: "teamB",
              bowlingTeamId: "teamA",
              dismissedBatterId: "atripan",
              creditedBowlerId: "aninda"
            }),
            dismissal({
              id: "all-out-3",
              overId: "teamA-1",
              battingTeamId: "teamB",
              bowlingTeamId: "teamA",
              dismissedBatterId: "biplab",
              type: "run_out",
              creditedBowlerId: null,
              fielderId: "aninda"
            }),
            dismissal({
              id: "all-out-4",
              overId: "teamA-1",
              battingTeamId: "teamB",
              bowlingTeamId: "teamA",
              dismissedBatterId: "dipanjan",
              type: "run_out",
              creditedBowlerId: null,
              fielderId: "aninda"
            }),
            dismissal({
              id: "all-out-5",
              overId: "teamA-1",
              battingTeamId: "teamB",
              bowlingTeamId: "teamA",
              dismissedBatterId: "dipanjan",
              creditedBowlerId: "aninda"
            })
          ]
        })
      ],
      teamB: []
    }
  }));

  assert.equal(errors.includes("Total wickets cannot exceed the number of players in the batting team."), true);
});

test("server rejects runs or Out status for a player who did not bat", () => {
  const errors = validateMatchRecordInput(validationInput({
    performances: [
      { ...performance("aninda", "teamA", 12), didBat: false, wasOut: true },
      performance("biplab", "teamB", 0)
    ]
  }));

  assert.equal(errors.includes("A player who did not bat must have zero runs and cannot be marked Out."), true);
});

test("finalisation derives extras when player runs are below official total", () => {
  const errors = validateMatchRecordInput(validationInput({
    status: "finalised",
    availablePlayerIds: ["aninda", "arunabha", "biplab", "dipanjan"],
    teamAPlayerIds: ["aninda", "arunabha"],
    teamBPlayerIds: ["biplab", "dipanjan"],
    performances: [
      { ...performance("aninda", "teamA", 33), didBat: true },
      performance("arunabha", "teamA", 0),
      performance("biplab", "teamB", 0),
      performance("dipanjan", "teamB", 0)
    ],
    inningsExtras: {
      teamA: 0,
      teamB: 0
    },
    bowlingOvers: {
      teamA: [],
      teamB: [
        over("teamB", "biplab", 1, { runsConceded: 8, wicketsLost: 0 }),
        over("teamB", "biplab", 2, { runsConceded: 10, wicketsLost: 0 }),
        over("teamB", "biplab", 3, { runsConceded: 12, wicketsLost: 0 }),
        over("teamB", "biplab", 4, { runsConceded: 5, wicketsLost: 0 })
      ]
    }
  }));

  assert.equal(errors.length, 0);
});

test("finalisation fails when player runs exceed official total", () => {
  const errors = validateMatchRecordInput(validationInput({
    status: "finalised",
    availablePlayerIds: ["aninda", "arunabha", "atripan", "biplab"],
    teamAPlayerIds: ["aninda", "arunabha", "atripan"],
    teamBPlayerIds: ["biplab"],
    performances: [
      { ...performance("aninda", "teamA", 36), didBat: true },
      performance("arunabha", "teamA", 0),
      performance("atripan", "teamA", 0),
      performance("biplab", "teamB", 0)
    ],
    inningsExtras: {
      teamA: 2,
      teamB: 0
    },
    bowlingOvers: {
      teamA: [],
      teamB: [
        over("teamB", "biplab", 1, { runsConceded: 8, wicketsLost: 0 }),
        over("teamB", "biplab", 2, { runsConceded: 10, wicketsLost: 1 }),
        over("teamB", "biplab", 3, { runsConceded: 12, wicketsLost: 1 }),
        over("teamB", "biplab", 4, { runsConceded: 5, wicketsLost: 0 })
      ]
    }
  }));

  assert.equal(
    errors.includes("Team A player runs exceed the official total by 1 runs."),
    true
  );
});

test("Team A batting first and defending produces a run-margin victory", () => {
  const result = calculateMatchResult(
    "finalised",
    "teamA",
    innings("teamA", 25, 2, 4),
    innings("teamB", 23, 3, 4)
  );

  assert.deepEqual(result, {
    type: "win_by_runs",
    winnerTeamId: "teamA",
    loserTeamId: "teamB",
    marginRuns: 2
  });
});

test("chasing team wins by wickets using the chasing team's player count", () => {
  const result = calculateMatchResult(
    "finalised",
    "teamB",
    innings("teamB", 35, 3, 4),
    innings("teamA", 37, 1, 4)
  );

  assert.deepEqual(result, {
    type: "win_by_wickets",
    winnerTeamId: "teamA",
    loserTeamId: "teamB",
    wicketsRemaining: 3
  });
});

test("draft live preview never announces a winner or margin", () => {
  const preview = getLiveResultPreview({
    firstInnings: innings("teamA", 0, 0, 4),
    secondInnings: innings("teamB", 9, 0, 4),
    chasingTeamName: "Team B",
    matchStatus: "draft"
  });

  assert.deepEqual(preview, {
    headline: "MATCH DATA IN PROGRESS",
    detail: "RESULT WILL BE CONFIRMED AFTER FINALISATION"
  });
  assert.doesNotMatch(preview.headline, /WINS|BY \d+ WICKETS|BY \d+ RUNS|MATCH TIED/);
});

test("live result preview uses target minus chasing score for runs needed", () => {
  const first = innings("teamA", 11, 3, 4);

  assert.equal(getLiveResultPreview({
    firstInnings: first,
    secondInnings: innings("teamB", 0, 0, 4),
    chasingTeamName: "Team B",
    matchStatus: "in_progress",
    firstInningsIsComplete: true
  }).headline, "TEAM B NEEDS 12 RUNS");
  assert.equal(getLiveResultPreview({
    firstInnings: first,
    secondInnings: innings("teamB", 7, 0, 4),
    chasingTeamName: "Team B",
    matchStatus: "in_progress",
    firstInningsIsComplete: true
  }).headline, "TEAM B NEEDS 5 RUNS");
  assert.equal(getLiveResultPreview({
    firstInnings: first,
    secondInnings: innings("teamB", 11, 0, 4),
    chasingTeamName: "Team B",
    matchStatus: "in_progress",
    firstInningsIsComplete: true
  }).headline, "TEAM B NEEDS 1 RUN");
  assert.deepEqual(getLiveResultPreview({
    firstInnings: first,
    secondInnings: innings("teamB", 12, 0, 4),
    chasingTeamName: "Team B",
    matchStatus: "in_progress",
    firstInningsIsComplete: true
  }), {
    headline: "TARGET REACHED",
    detail: "FINALISE THE MATCH TO CONFIRM THE RESULT"
  });
});

test("target reached before finalisation stays neutral", () => {
  const first = innings("teamA", 12, 4, 4);
  const second = innings("teamB", 14, 1, 4);
  const preview = getLiveResultPreview({
    firstInnings: first,
    secondInnings: second,
    chasingTeamName: "Team B",
    matchStatus: "in_progress",
    firstInningsIsComplete: true
  });
  const finalResult = calculateMatchResult("finalised", "teamA", first, second);

  assert.deepEqual(preview, {
    headline: "TARGET REACHED",
    detail: "FINALISE THE MATCH TO CONFIRM THE RESULT"
  });
  assert.doesNotMatch(preview.headline, /BY \d+ WICKETS|WINS/);
  assert.equal(getFinalResultHeadline(finalResult, "Team A", "Team B"), "TEAM B WINS BY 3 WICKETS");
});

test("in-progress completed innings asks for review without announcing run margin", () => {
  const preview = getLiveResultPreview({
    firstInnings: innings("teamA", 14, 2, 4),
    secondInnings: innings("teamB", 12, 3, 4),
    chasingTeamName: "Team B",
    matchStatus: "in_progress",
    firstInningsIsComplete: true,
    secondInningsIsComplete: true
  });

  assert.deepEqual(preview, {
    headline: "MATCH DATA READY FOR REVIEW",
    detail: "FINALISE THE MATCH TO CONFIRM THE RESULT"
  });
  assert.doesNotMatch(preview.headline, /BY \d+ RUNS|WINS|MATCH TIED/);
});

test("tie is shown only after finalisation", () => {
  const first = innings("teamA", 14, 2, 4);
  const second = innings("teamB", 14, 3, 4);
  const preview = getLiveResultPreview({
    firstInnings: first,
    secondInnings: second,
    chasingTeamName: "Team B",
    matchStatus: "in_progress",
    firstInningsIsComplete: true,
    secondInningsIsComplete: true
  });
  const finalResult = calculateMatchResult("finalised", "teamA", first, second);

  assert.equal(preview.headline, "MATCH DATA READY FOR REVIEW");
  assert.equal(getFinalResultHeadline(finalResult, "Team A", "Team B"), "MATCH TIED");
});

test("live result wording never renders has reached the target", () => {
  const form = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");

  assert.doesNotMatch(form.toLowerCase(), /has reached the target/);
  assert.doesNotMatch(form.toLowerCase(), /currently leads by wickets/);
  assert.doesNotMatch(form, /TEAM B BY 4 WICKETS/);
  assert.match(form, /const resultClassName = isFinal \? result\.type : "pending"/);
  assert.match(form, /isFinal && \(result\.type === "win_by_runs" \|\| result\.type === "win_by_wickets"\)/);
  assert.match(form, /!isFinal \? <Swords/);
});

test("equal final runs produce a tie regardless of wickets lost", () => {
  assert.deepEqual(
    calculateMatchResult(
      "finalised",
      "teamA",
      innings("teamA", 25, 2, 4),
      innings("teamB", 25, 4, 4)
    ),
    { type: "tie" }
  );
});

test("abandoned and cancelled statuses produce No Result only", () => {
  const first = innings("teamA", 25, 2, 4);
  const second = innings("teamB", 25, 4, 4);

  assert.deepEqual(calculateMatchResult("abandoned", "teamA", first, second), {
    type: "no_result"
  });
  assert.deepEqual(calculateMatchResult("cancelled", "teamA", first, second), {
    type: "no_result"
  });
});

test("draft status produces a chase preview only", () => {
  assert.deepEqual(
    calculateMatchResult(
      "draft",
      "teamA",
      innings("teamA", 25, 2, 4),
      innings("teamB", 23, 3, 4)
    ),
    {
      type: "pending",
      chasingTeamId: "teamB",
      target: 26,
      runsRequired: 3,
      targetReached: false,
      scoresLevel: false
    }
  );
});

test("in-progress status reports target reached before finalisation", () => {
  assert.deepEqual(
    calculateMatchResult(
      "in_progress",
      "teamB",
      innings("teamB", 35, 3, 4),
      innings("teamA", 37, 1, 4)
    ),
    {
      type: "pending",
      chasingTeamId: "teamA",
      target: 36,
      runsRequired: 0,
      targetReached: true,
      scoresLevel: false
    }
  );
});

test("scores level preview is explicit before finalisation", () => {
  assert.deepEqual(
    calculateMatchResult(
      "in_progress",
      "teamA",
      innings("teamA", 25, 2, 4),
      innings("teamB", 25, 3, 4)
    ),
    {
      type: "pending",
      chasingTeamId: "teamB",
      target: 26,
      runsRequired: 1,
      targetReached: false,
      scoresLevel: true
    }
  );
});

test("innings order can put Team B first and cricket score format is retained", () => {
  const first = innings("teamB", 35, 3, 4);
  const second = innings("teamA", 37, 1, 4);

  assert.equal(first.battingTeamId, "teamB");
  assert.equal(second.battingTeamId, "teamA");
  assert.equal(formatInningsScore(first.runs, first.wicketsLost), "35/3");
  assert.equal(formatInningsScore(second.runs, second.wicketsLost), "37/1");
});

test("invalid cross-team records prevent finalisation", () => {
  const errors = validateMatchRecordInput(validationInput({
    performances: [performance("aninda", "teamB", 12)]
  }));

  assert.equal(errors.includes("Every performance record must match the player's selected team."), true);
});

test("server validation requires an explicit batting-first team", () => {
  const errors = validateMatchRecordInput(validationInput({
    battingFirstTeamId: undefined
  }));

  assert.equal(errors.includes("SELECT THE BATTING-FIRST TEAM"), true);
});

test("team innings stores runs, wickets and overs under the batting side", () => {
  const built = buildTeamInnings({
    battingTeamId: "teamA",
    battingPlayerIds: ["aninda", "arunabha"],
    performances: [
      performance("aninda", "teamA", 11),
      performance("arunabha", "teamA", 14),
      performance("biplab", "teamB", 99)
    ],
    bowlingOvers: [
      over("teamB", "biplab", 1, { runsConceded: 15, wicketsLost: 1 }),
      over("teamB", "biplab", 2, { runsConceded: 10, wicketsLost: 1 })
    ]
  });

  assert.equal(built.battingTeamId, "teamA");
  assert.equal(built.bowlingTeamId, "teamB");
  assert.equal(built.runs, 25);
  assert.equal(built.wicketsLost, 2);
  assert.equal(built.completedOvers, 2);
  assert.deepEqual(built.battingPerformances.map((record) => record.playerId), [
    "aninda",
    "arunabha"
  ]);
});

test("odd attendance without Shared Player blocks finalisation", () => {
  const errors = validateMatchRecordInput(
    validationInput({
      status: "finalised",
      availablePlayerIds: ["aninda", "arunabha", "atripan"],
      teamAPlayerIds: ["aninda", "arunabha"],
      teamBPlayerIds: ["atripan"],
      performances: [
        performance("aninda", "teamA", 10),
        performance("arunabha", "teamA", 8),
        performance("atripan", "teamB", 9)
      ]
    })
  );

  assert.equal(errors.includes("Select one Shared Player to create equal teams."), true);
});

test("valid Shared Player duplication is accepted and ordinary duplication is rejected", () => {
  const validErrors = validateMatchRecordInput(
    validationInput({
      status: "draft",
      availablePlayerIds: ["aninda", "arunabha", "atripan"],
      teamAPlayerIds: ["aninda", "arunabha"],
      teamBPlayerIds: ["aninda", "atripan"],
      sharedPlayerId: "aninda",
      performances: [
        { ...performance("aninda", "teamA", 12), representingTeamId: "teamA" as const },
        { ...performance("aninda", "teamB", 7), representingTeamId: "teamB" as const },
        performance("arunabha", "teamA", 8),
        performance("atripan", "teamB", 9)
      ]
    })
  );
  const invalidErrors = validateMatchRecordInput(
    validationInput({
      status: "draft",
      availablePlayerIds: ["aninda", "arunabha", "atripan"],
      teamAPlayerIds: ["aninda", "arunabha"],
      teamBPlayerIds: ["aninda", "arunabha", "atripan"],
      sharedPlayerId: "aninda",
      performances: [
        { ...performance("aninda", "teamA", 12), representingTeamId: "teamA" as const },
        { ...performance("aninda", "teamB", 7), representingTeamId: "teamB" as const },
        performance("arunabha", "teamA", 8),
        performance("atripan", "teamB", 9)
      ]
    })
  );

  assert.equal(validErrors.includes("A player cannot be selected for both teams."), false);
  assert.equal(invalidErrors.includes("A player cannot be selected for both teams."), true);
});

test("Shared Player has separate Team A and Team B batting records", () => {
  const performances = [
    { ...performance("aninda", "teamA", 12), representingTeamId: "teamA" as const },
    { ...performance("aninda", "teamB", 7), representingTeamId: "teamB" as const },
    performance("arunabha", "teamA", 8),
    performance("atripan", "teamB", 9)
  ];

  assert.equal(getPerformanceKey("aninda", "teamA"), "aninda:teamA");
  assert.equal(calculateTeamTotal("teamA", performances), 20);
  assert.equal(calculateTeamTotal("teamB", performances), 16);
});

test("Shared Player counts as one batting slot for wicket limits", () => {
  const sevenPlayerState = getInningsState({
    battingTeamId: "teamA",
    bowlingTeamId: "teamB",
    battingPlayerCount: 4,
    bowlingOvers: [],
    scheduledOvers: 4,
    runs: 0
  });
  const ninePlayerState = getInningsState({
    battingTeamId: "teamA",
    bowlingTeamId: "teamB",
    battingPlayerCount: 5,
    bowlingOvers: [],
    scheduledOvers: 4,
    runs: 0
  });

  assert.equal(sevenPlayerState.maximumWickets, 4);
  assert.equal(ninePlayerState.maximumWickets, 5);
});

test("dismissals reject impossible self-dismissals", () => {
  const selfBowledErrors = validateMatchRecordInput(
    validationInput({
      status: "finalised",
      availablePlayerIds: ["aninda", "arunabha", "biplab"],
      teamAPlayerIds: ["aninda", "arunabha"],
      teamBPlayerIds: ["aninda", "biplab"],
      sharedPlayerId: "aninda",
      performances: [
        { ...performance("aninda", "teamA", 10), representingTeamId: "teamA" as const },
        { ...performance("aninda", "teamB", 8), representingTeamId: "teamB" as const },
        performance("arunabha", "teamA", 6),
        performance("biplab", "teamB", 5)
      ],
      bowlingOvers: {
        teamA: [
          over("teamA", "aninda", 1, {
            dismissals: [
              dismissal({
                overId: "teamA-1",
                battingTeamId: "teamB",
                bowlingTeamId: "teamA",
                dismissedBatterId: "aninda",
                creditedBowlerId: "aninda"
              })
            ]
          })
        ],
        teamB: []
      }
    })
  );
  const selfCaughtErrors = validateMatchRecordInput(
    validationInput({
      status: "finalised",
      availablePlayerIds: ["aninda", "arunabha", "biplab"],
      teamAPlayerIds: ["aninda", "arunabha"],
      teamBPlayerIds: ["aninda", "biplab"],
      sharedPlayerId: "aninda",
      performances: [
        { ...performance("aninda", "teamA", 10), representingTeamId: "teamA" as const },
        { ...performance("aninda", "teamB", 8), representingTeamId: "teamB" as const },
        performance("arunabha", "teamA", 6),
        performance("biplab", "teamB", 5)
      ],
      bowlingOvers: {
        teamA: [
          over("teamA", "aninda", 1, {
            dismissals: [
              dismissal({
                overId: "teamA-1",
                battingTeamId: "teamB",
                bowlingTeamId: "teamA",
                dismissedBatterId: "biplab",
                type: "caught",
                creditedBowlerId: "aninda",
                fielderId: "biplab"
              })
            ]
          })
        ],
        teamB: []
      }
    })
  );

  assert.equal(
    selfBowledErrors.includes("A player cannot be credited with dismissing themselves."),
    true
  );
  assert.equal(
    selfCaughtErrors.includes("A player cannot field their own dismissal."),
    true
  );
});

function baseState() {
  return {
    availablePlayerIds: ["aninda", "biplab"],
    teamAPlayerIds: [],
    teamBPlayerIds: []
  };
}

function validationInput(
  overrides: Partial<{
    matchDate: string;
    matchName: string;
    status: MatchStatus;
    stage: "schedule" | "draft" | "start" | "finalise";
    scheduledOversPerInnings: number | null;
    battingMode?: BattingMode | null;
    battingFirstTeamId?: TeamId | null;
    availablePlayerIds: string[];
    teamAPlayerIds: string[];
    teamBPlayerIds: string[];
    sharedPlayerId: string | null;
    fieldingHelperIds: string[];
    inningsExtras: Record<TeamId, number>;
    performances: PlayerMatchPerformance[];
    bowlingOvers: {
      teamA: BowlingOver[];
      teamB: BowlingOver[];
    };
  }> = {}
) {
  return {
    matchDate: "2026-08-04",
    matchName: "Gully Premier League",
    status: "draft" as const,
    scheduledOversPerInnings: 8,
    battingMode: "two_batter" as const,
    battingFirstTeamId: "teamA" as const,
    availablePlayerIds: ["aninda", "biplab"],
    teamAPlayerIds: ["aninda"],
    teamBPlayerIds: ["biplab"],
    sharedPlayerId: null,
    fieldingHelperIds: [],
    inningsExtras: {
      teamA: 0,
      teamB: 0
    },
    performances: [
      performance("aninda", "teamA", 10),
      performance("biplab", "teamB", 12)
    ],
    bowlingOvers: {
      teamA: [],
      teamB: []
    },
    ...overrides
  };
}

function performance(
  playerId: string,
  teamId: TeamId,
  runs: number
): PlayerMatchPerformance {
  return {
    playerId,
    teamId,
    played: true,
    playerOfMatch: false,
    didBat: true,
    runs,
    wasOut: false,
    wickets: 0,
    hatTricks: 0,
    catches: 0,
    runOuts: 0,
    stumpings: 0
  };
}

function quickEvent(
  sequence: number,
  overrides: Partial<Parameters<typeof createQuickScoringEvent>[0]> = {}
) {
  return createQuickScoringEvent({
    sequence,
    battingTeamId: "teamB",
    strikerId: "naim",
    nonStrikerId: "saurav",
    bowlerId: "aninda",
    batterRuns: 0,
    extraType: null,
    wicket: null,
    timestamp: `2026-08-10T10:00:${String(sequence).padStart(2, "0")}.000Z`,
    ...overrides
  });
}

function quickLegalOver(
  firstSequence: number,
  bowlerId: string,
  overrides: Partial<Parameters<typeof createQuickScoringEvent>[0]> = {}
) {
  return Array.from({ length: 6 }, (_, index) =>
    quickEvent(firstSequence + index, {
      bowlerId,
      ...overrides
    })
  );
}

function quickInput(
  events: ReturnType<typeof quickEvent>[],
  overrides: Partial<{
    battingPlayerIds: string[];
    bowlingPlayerIds: string[];
    fieldingPlayerIds: string[];
    battingMode: BattingMode;
  }> = {}
) {
  return {
    battingTeamId: "teamB" as const,
    bowlingTeamId: "teamA" as const,
    battingPlayerIds: ["naim", "saurav", "soman", "rohit", "amrit", "suprateem"],
    bowlingPlayerIds: ["aninda", "dipanjan", "utpal", "dheeraj", "chaitanya", "biplab"],
    events,
    ...overrides
  };
}

function batterRunsById(performances: PlayerMatchPerformance[]) {
  return Object.fromEntries(
    performances
      .filter((performance) => performance.didBat)
      .map((performance) => [performance.playerId, sanitizeRuns(performance.runs)])
  );
}

function innings(
  battingTeamId: TeamId,
  runs: number,
  wicketsLost: number,
  playerCount: number
): TeamInnings {
  return {
    battingTeamId,
    bowlingTeamId: battingTeamId === "teamA" ? "teamB" : "teamA",
    runs,
    wicketsLost,
    extras: 0,
    playerCount,
    completedOvers: 0,
    battingPerformances: [],
    bowlingOvers: []
  };
}

function over(
  teamId: TeamId,
  bowlerId: string,
  overNumber: number,
  overrides: Partial<Pick<BowlingOver, "runsConceded" | "dismissals">> & {
    wicketsLost?: number;
  } = {}
): BowlingOver {
  const id = `${teamId}-${overNumber}`;
  const battingTeamId = teamId === "teamA" ? "teamB" : "teamA";
  const dismissals =
    overrides.dismissals ??
    Array.from({ length: overrides.wicketsLost ?? 0 }, (_, index) =>
      dismissal({
        id: `${id}-dismissal-${index + 1}`,
        overId: id,
        battingTeamId,
        bowlingTeamId: teamId,
        dismissedBatterId:
          battingTeamId === "teamA"
            ? ["aninda", "arunabha", "atripan", "dipanjan"][
                overNumber - 1 + index
              ] ?? "aninda"
            : ["biplab", "dipanjan", "arunabha", "atripan"][
                overNumber - 1 + index
              ] ?? "biplab",
        creditedBowlerId: bowlerId || null
      })
    );

  return {
    id,
    bowlingTeamId: teamId,
    battingTeamId,
    bowlerId,
    overNumber,
    runsConceded: overrides.runsConceded ?? 0,
    wicketsTaken: dismissals.length,
    dismissals,
    maiden: false
  };
}

function dismissal(
  overrides: Partial<DismissalEvent> & Pick<
    DismissalEvent,
    "overId" | "battingTeamId" | "bowlingTeamId" | "dismissedBatterId"
  >
): DismissalEvent {
  return {
    id: overrides.id ?? `${overrides.overId}-dismissal`,
    overId: overrides.overId,
    battingTeamId: overrides.battingTeamId,
    bowlingTeamId: overrides.bowlingTeamId,
    dismissedBatterId: overrides.dismissedBatterId,
    type: overrides.type ?? "bowled",
    creditedBowlerId:
      "creditedBowlerId" in overrides ? overrides.creditedBowlerId! : "aninda",
    fielderId: "fielderId" in overrides ? overrides.fielderId! : null
  };
}
