import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregatePlayerPerformances,
  applyMatchXP,
  applyMatchXPWithLevelProtection,
  calculateDisplayedRating,
  calculateCareerBattingXP,
  calculateCareerBowlingXP,
  calculateCareerFieldingXP,
  calculateExpensiveOverPenalty,
  calculateMatchXP,
  calculateOverQualityPoints,
  calculatePlayerMatchXP,
  calculateRawBattingPoints,
  calculateRawBowlingPoints,
  calculateRawFieldingPoints,
  calculateRawOverQualityPoints,
  calculateSharedPlayerMatchXP,
  calculateV2RawRegularBattingPoints,
  calculatePlayerRatingSnapshots,
  clampAwardedMatchXP,
  cumulativeXPForLevel,
  cumulativeXPThresholdForLevel,
  formatPercentage,
  getStoredXPRuleVersion,
  getLevelProgress,
  getOverPenalty,
  getXPRuleVersionForMatchDate,
  XP_RULES,
  XP_V2_RULES,
  withAuthoritativeXPBreakdowns,
  xpNeededToAdvance
} from "../lib/progression";
import {
  applyFinalisedMatchToCareerStats,
  createEmptyCareerProgressionState,
  createEmptyPlayerCareerStats,
  mergeCareerStateWithRoster,
  mergePlayersWithCareerState
} from "../lib/career-store";
import {
  applyPlayerOfMatchCorrectionToFinalisedMatch,
  calculatePrePomPlayerMatchXP,
  getPlayerOfMatchRecommendation
} from "../lib/player-of-match";
import type {
  BowlingOver,
  MatchRecord,
  MatchResult,
  PlayerMatchPerformance,
  TeamId,
  TeamInnings
} from "../lib/types/match";
import type { Player } from "../lib/types/player";
import { activePlayers } from "../lib/data/players";

function performance(
  overrides: Partial<PlayerMatchPerformance> & {
    overs?: BowlingOver[];
    teamWon?: boolean;
  } = {}
): PlayerMatchPerformance & { overs?: BowlingOver[]; teamWon?: boolean } {
  return {
    playerId: "aninda",
    teamId: "teamA",
    played: true,
    playerOfMatch: false,
    didBat: false,
    runs: 0,
    wasOut: false,
    wickets: 0,
    hatTricks: 0,
    catches: 0,
    runOuts: 0,
    stumpings: 0,
    ...overrides
  };
}

function result(
  overrides: MatchResult = {
    type: "win_by_runs",
    winnerTeamId: "teamA",
    loserTeamId: "teamB",
    marginRuns: 10
  }
): MatchResult {
  return overrides;
}

function over(
  bowlingTeamId: TeamId,
  overNumber: number,
  runsConceded: number,
  overrides: Partial<BowlingOver> = {}
): BowlingOver {
  return {
    id: `${bowlingTeamId}-${overNumber}`,
    bowlingTeamId,
    battingTeamId: bowlingTeamId === "teamA" ? "teamB" : "teamA",
    bowlerId: "aninda",
    overNumber,
    runsConceded,
    wicketsTaken: 0,
    dismissals: [],
    maiden: false,
    ...overrides
  };
}

function innings(battingTeamId: TeamId, runs: number): TeamInnings {
  return {
    battingTeamId,
    bowlingTeamId: battingTeamId === "teamA" ? "teamB" : "teamA",
    runs,
    wicketsLost: 0,
    extras: 0,
    playerCount: 1,
    completedOvers: 1,
    battingPerformances: [],
    bowlingOvers: []
  };
}

function finalisedMatch(
  performances: PlayerMatchPerformance[],
  matchResult: MatchResult = result()
): MatchRecord {
  return {
    id: "match-1",
    matchDate: "2026-08-05",
    matchName: "Gully Premier League",
    venue: "CZU Gully Arena",
    status: "finalised",
    scheduledOversPerInnings: 4,
    battingFirstTeamId: "teamA",
    chasingTeamId: "teamB",
    teams: {
      teamA: {
        teamId: "teamA",
        teamName: "Team A",
        playerIds: performances
          .filter((record) => record.teamId === "teamA")
          .map((record) => record.playerId),
        playerPerformances: performances.filter((record) => record.teamId === "teamA"),
        bowlingOvers: [over("teamA", 1, 8)],
        totalRuns: 0,
        completedBowlingOvers: 1
      },
      teamB: {
        teamId: "teamB",
        teamName: "Team B",
        playerIds: performances
          .filter((record) => record.teamId === "teamB")
          .map((record) => record.playerId),
        playerPerformances: performances.filter((record) => record.teamId === "teamB"),
        bowlingOvers: [],
        totalRuns: 0,
        completedBowlingOvers: 0
      }
    },
    innings: {
      first: innings("teamA", 25),
      second: innings("teamB", 15)
    },
    result: matchResult
  };
}

test("participation and non-played XP rules are explicit", () => {
  assert.equal(calculatePlayerMatchXP(performance()).participationXP, 20);
  assert.equal(calculateMatchXP(performance({ played: false })), 0);
});

test("win bonus applies only to played winning-team players", () => {
  assert.equal(
    calculatePlayerMatchXP(performance({ teamId: "teamA" }), {
      result: result()
    }).winBonusXP,
    5
  );
  assert.equal(
    calculatePlayerMatchXP(performance({ teamId: "teamB" }), {
      result: result()
    }).winBonusXP,
    0
  );
  assert.equal(
    calculatePlayerMatchXP(performance(), { result: { type: "tie" } }).winBonusXP,
    0
  );
  assert.equal(
    calculateMatchXP(performance(), { result: { type: "no_result" } }),
    0
  );
});

test("player of the match gives 15 XP only when the player played", () => {
  assert.equal(
    calculatePlayerMatchXP(performance({ playerOfMatch: true })).playerOfMatchXP,
    15
  );
  assert.equal(
    calculateMatchXP(performance({ played: false, playerOfMatch: true })),
    0
  );
});

test("unique highest pre-POM XP becomes recommended Player of the Match", () => {
  const performances = [
    performance({ playerId: "naim", runs: 74, didBat: true, teamId: "teamA" }),
    performance({ playerId: "dipanjan", runs: 42, didBat: true, teamId: "teamB" })
  ];
  const recommendation = getPlayerOfMatchRecommendation({
    performances,
    allBowlingOvers: [],
    result: result(),
    sharedPlayerId: null
  });

  assert.equal(recommendation.recommendedPlayerId, "naim");
  assert.equal(recommendation.isTie, false);
});

test("POM recommendation excludes POM bonus and avoids circular selection", () => {
  const naim = performance({
    playerId: "naim",
    runs: 10,
    didBat: true,
    playerOfMatch: true
  });
  const dipanjan = performance({
    playerId: "dipanjan",
    runs: 60,
    didBat: true,
    teamId: "teamB"
  });
  const recommendation = getPlayerOfMatchRecommendation({
    performances: [naim, dipanjan],
    allBowlingOvers: [],
    result: result(),
    sharedPlayerId: null
  });

  assert.equal(calculatePrePomPlayerMatchXP(naim).playerOfMatchXP, 0);
  assert.equal(recommendation.recommendedPlayerId, "dipanjan");
});

test("manual POM override receives +15 instead of the recommendation", () => {
  const recommendationWinner = performance({
    playerId: "naim",
    runs: 60,
    didBat: true
  });
  const manualOverride = performance({
    playerId: "rohit",
    runs: 10,
    didBat: true,
    teamId: "teamB",
    playerOfMatch: true
  });
  const recommendation = getPlayerOfMatchRecommendation({
    performances: [recommendationWinner, manualOverride],
    allBowlingOvers: [],
    result: result(),
    sharedPlayerId: null
  });

  assert.equal(recommendation.recommendedPlayerId, "naim");
  assert.equal(
    calculatePlayerMatchXP(recommendationWinner, { result: result() }).playerOfMatchXP,
    0
  );
  assert.equal(
    calculatePlayerMatchXP(manualOverride, { result: result() }).playerOfMatchXP,
    15
  );
});

test("None Player of the Match adds no POM XP", () => {
  assert.equal(
    calculatePlayerMatchXP(
      performance({ playerId: "naim", playerOfMatch: false }),
      { result: result() }
    ).playerOfMatchXP,
    0
  );
});

test("exact pre-POM XP tie exposes joint leaders and selects nobody", () => {
  const performances = [
    performance({ playerId: "naim", runs: 40, didBat: true }),
    performance({ playerId: "dipanjan", runs: 40, didBat: true, teamId: "teamB" })
  ];
  const recommendation = getPlayerOfMatchRecommendation({
    performances,
    allBowlingOvers: [],
    result: result({ type: "tie" }),
    sharedPlayerId: null
  });

  assert.equal(recommendation.recommendedPlayerId, null);
  assert.equal(recommendation.isTie, true);
  assert.deepEqual(
    recommendation.leaders.map((leader) => leader.playerId).sort(),
    ["dipanjan", "naim"]
  );
});

test("POM correction transfers only POM XP from one player to another", () => {
  const match = finalisedMatch([
    performance({
      playerId: "rohit",
      teamId: "teamA",
      playerOfMatch: true,
      didBat: true,
      runs: 20,
      wickets: 1
    }),
    performance({
      playerId: "naim",
      teamId: "teamB",
      didBat: true,
      runs: 22,
      catches: 1
    })
  ]);
  const initialState = applyFinalisedMatchToCareerStats(
    match,
    createEmptyCareerProgressionState(),
    "2026-08-10T10:00:00.000Z"
  );
  const corrected = applyPlayerOfMatchCorrectionToFinalisedMatch({
    match,
    currentState: initialState,
    nextPlayerOfMatchId: "naim",
    correctedAt: "2026-08-10T11:00:00.000Z"
  });

  assert.equal(
    corrected.state.appliedProgressions["match-1:rohit"].xpBreakdown.playerOfMatchXP,
    0
  );
  assert.equal(
    corrected.state.appliedProgressions["match-1:naim"].xpBreakdown.playerOfMatchXP,
    XP_RULES.playerOfMatch
  );
  assert.equal(
    initialState.appliedProgressions["match-1:rohit"].xpBreakdown.playerOfMatchXP -
      corrected.state.appliedProgressions["match-1:rohit"].xpBreakdown
        .playerOfMatchXP,
    XP_RULES.playerOfMatch
  );
  assert.equal(
    corrected.state.appliedProgressions["match-1:naim"].xpBreakdown.playerOfMatchXP -
      initialState.appliedProgressions["match-1:naim"].xpBreakdown.playerOfMatchXP,
    XP_RULES.playerOfMatch
  );
  assert.equal(corrected.state.playerCareers.rohit.wickets, 1);
  assert.equal(corrected.state.playerCareers.naim.catches, 1);
  assert.equal(
    corrected.match.finalisedPlayerRecords?.find((record) => record.playerId === "naim")
      ?.playerOfMatch,
    true
  );
});

test("POM correction preserves non-POM XP components and cricket statistics", () => {
  const match = finalisedMatch([
    performance({
      playerId: "rohit",
      teamId: "teamA",
      playerOfMatch: true,
      didBat: true,
      runs: 20,
      wickets: 1
    }),
    performance({
      playerId: "naim",
      teamId: "teamB",
      didBat: true,
      runs: 22,
      catches: 1
    })
  ]);
  const initialState = applyFinalisedMatchToCareerStats(
    match,
    createEmptyCareerProgressionState(),
    "2026-08-10T10:00:00.000Z"
  );
  const corrected = applyPlayerOfMatchCorrectionToFinalisedMatch({
    match,
    currentState: initialState,
    nextPlayerOfMatchId: "naim"
  });
  const omitPomSpecificFields = (
    breakdown: ReturnType<typeof calculatePlayerMatchXP>
  ) =>
    Object.fromEntries(
      Object.entries(breakdown).filter(
        ([key]) =>
          !["playerOfMatchXP", "rawTotalXP", "awardedXP"].includes(key)
      )
    );

  for (const playerId of ["rohit", "naim"]) {
    assert.deepEqual(
      omitPomSpecificFields(
        corrected.state.appliedProgressions[`match-1:${playerId}`].xpBreakdown
      ),
      omitPomSpecificFields(
        initialState.appliedProgressions[`match-1:${playerId}`].xpBreakdown
      )
    );
  }

  assert.equal(corrected.state.playerCareers.rohit.matches, 1);
  assert.equal(corrected.state.playerCareers.rohit.runs, 20);
  assert.equal(corrected.state.playerCareers.rohit.wickets, 1);
  assert.equal(corrected.state.playerCareers.naim.matches, 1);
  assert.equal(corrected.state.playerCareers.naim.runs, 22);
  assert.equal(corrected.state.playerCareers.naim.catches, 1);
});

test("POM correction keeps legacy V1 application JSON free of new metadata", () => {
  const match = finalisedMatch([
    performance({
      playerId: "rohit",
      teamId: "teamA",
      playerOfMatch: true,
      didBat: true,
      runs: 20
    }),
    performance({
      playerId: "naim",
      teamId: "teamB",
      didBat: true,
      runs: 22
    })
  ]);
  const initialState = applyFinalisedMatchToCareerStats(
    match,
    createEmptyCareerProgressionState(),
    "2026-08-10T10:00:00.000Z"
  );

  for (const application of Object.values(initialState.appliedProgressions)) {
    delete application.xpBreakdown.xpRuleVersion;
    delete application.xpBreakdown.overQualityXP;
    delete application.xpBreakdown.rawPositiveOverQualityPoints;
    delete application.xpBreakdown.rawNegativeOverQualityPoints;
    delete application.xpBreakdown.rawBattingPoints;
    delete application.xpBreakdown.rawBowlingPoints;
    delete application.xpBreakdown.rawFieldingPoints;
  }

  const corrected = applyPlayerOfMatchCorrectionToFinalisedMatch({
    match,
    currentState: initialState,
    nextPlayerOfMatchId: "naim"
  });

  for (const playerId of ["rohit", "naim"]) {
    const breakdown =
      corrected.state.appliedProgressions[`match-1:${playerId}`].xpBreakdown;

    assert.equal("xpRuleVersion" in breakdown, false);
    assert.equal("rawBattingPoints" in breakdown, false);
    assert.equal("rawBowlingPoints" in breakdown, false);
    assert.equal("rawFieldingPoints" in breakdown, false);
  }
});

test("POM correction to none removes only the POM bonus", () => {
  const match = finalisedMatch([
    performance({
      playerId: "rohit",
      teamId: "teamA",
      playerOfMatch: true,
      didBat: true,
      runs: 20
    })
  ]);
  const initialState = applyFinalisedMatchToCareerStats(
    match,
    createEmptyCareerProgressionState(),
    "2026-08-10T10:00:00.000Z"
  );
  const corrected = applyPlayerOfMatchCorrectionToFinalisedMatch({
    match,
    currentState: initialState,
    nextPlayerOfMatchId: null
  });

  assert.equal(
    corrected.state.appliedProgressions["match-1:rohit"].xpBreakdown.playerOfMatchXP,
    0
  );
  assert.equal(corrected.state.playerCareers.rohit.runs, 20);
});

test("POM correction from none adds one POM bonus and repeated correction is idempotent", () => {
  const match = finalisedMatch([
    performance({
      playerId: "naim",
      teamId: "teamA",
      didBat: true,
      runs: 20
    })
  ]);
  const initialState = applyFinalisedMatchToCareerStats(
    match,
    createEmptyCareerProgressionState(),
    "2026-08-10T10:00:00.000Z"
  );
  const corrected = applyPlayerOfMatchCorrectionToFinalisedMatch({
    match,
    currentState: initialState,
    nextPlayerOfMatchId: "naim"
  });
  const repeated = applyPlayerOfMatchCorrectionToFinalisedMatch({
    match: corrected.match,
    currentState: corrected.state,
    nextPlayerOfMatchId: "naim"
  });

  assert.equal(
    corrected.state.appliedProgressions["match-1:naim"].xpBreakdown.playerOfMatchXP,
    XP_RULES.playerOfMatch
  );
  assert.equal(repeated.affectedPlayerIds.length, 0);
  assert.deepEqual(repeated.state, corrected.state);
});

test("POM correction updates ledger so career rebuild from corrected match agrees", () => {
  const match = finalisedMatch([
    performance({
      playerId: "rohit",
      teamId: "teamA",
      playerOfMatch: true,
      didBat: true,
      runs: 20
    }),
    performance({
      playerId: "naim",
      teamId: "teamB",
      didBat: true,
      runs: 22
    })
  ]);
  const initialState = applyFinalisedMatchToCareerStats(
    match,
    createEmptyCareerProgressionState(),
    "2026-08-10T10:00:00.000Z"
  );
  const corrected = applyPlayerOfMatchCorrectionToFinalisedMatch({
    match,
    currentState: initialState,
    nextPlayerOfMatchId: "naim",
    correctedAt: "2026-08-10T11:00:00.000Z"
  });
  const rebuilt = applyFinalisedMatchToCareerStats(
    corrected.match,
    createEmptyCareerProgressionState(),
    "2026-08-10T11:30:00.000Z"
  );

  for (const playerId of ["rohit", "naim"]) {
    assert.equal(
      rebuilt.appliedProgressions[`match-1:${playerId}`].xpBreakdown
        .playerOfMatchXP,
      corrected.state.appliedProgressions[`match-1:${playerId}`].xpBreakdown
        .playerOfMatchXP
    );
    assert.equal(
      rebuilt.appliedProgressions[`match-1:${playerId}`].xpBreakdown.awardedXP,
      corrected.state.appliedProgressions[`match-1:${playerId}`].xpBreakdown
        .awardedXP
    );
    assert.deepEqual(
      rebuilt.playerCareers[playerId],
      {
        ...corrected.state.playerCareers[playerId],
        totalXP: rebuilt.playerCareers[playerId].totalXP,
        level: rebuilt.playerCareers[playerId].level
      }
    );
    assert.equal(
      rebuilt.playerCareers[playerId].totalXP,
      corrected.state.playerCareers[playerId].totalXP
    );
    assert.equal(
      rebuilt.playerCareers[playerId].level,
      corrected.state.playerCareers[playerId].level
    );
  }
});

test("POM correction level handling follows protected XP application rules", () => {
  const match = finalisedMatch([
    performance({
      playerId: "rohit",
      teamId: "teamA",
      playerOfMatch: true,
      didBat: true,
      runs: 20
    })
  ]);
  const threshold = cumulativeXPForLevel(1);
  const initialState = applyFinalisedMatchToCareerStats(
    match,
    createEmptyCareerProgressionState(),
    "2026-08-10T10:00:00.000Z"
  );
  const currentState = {
    ...initialState,
    playerCareers: {
      rohit: {
        ...createEmptyPlayerCareerStats("rohit"),
        matches: 1,
        inningsBatted: 1,
        runs: 20,
        totalXP: threshold + 10,
        level: 1
      }
    }
  };
  const corrected = applyPlayerOfMatchCorrectionToFinalisedMatch({
    match,
    currentState,
    nextPlayerOfMatchId: null
  });

  assert.equal(corrected.state.playerCareers.rohit.totalXP, threshold);
  assert.equal(corrected.state.playerCareers.rohit.level, 1);
});

test("POM correction removes XP normally when the level floor is not crossed", () => {
  const match = finalisedMatch([
    performance({
      playerId: "rohit",
      teamId: "teamA",
      playerOfMatch: true,
      didBat: true,
      runs: 20
    }),
    performance({
      playerId: "naim",
      teamId: "teamB",
      didBat: true,
      runs: 10
    })
  ]);
  const currentState = applyFinalisedMatchToCareerStats(
    match,
    {
      playerCareers: {
        rohit: {
          ...createEmptyPlayerCareerStats("rohit"),
          totalXP: 200,
          level: 1
        }
      },
      appliedProgressions: {}
    },
    "2026-08-10T10:00:00.000Z"
  );
  const corrected = applyPlayerOfMatchCorrectionToFinalisedMatch({
    match,
    currentState,
    nextPlayerOfMatchId: null
  });

  assert.equal(corrected.state.playerCareers.rohit.totalXP, 235);
  assert.equal(corrected.state.playerCareers.rohit.level, 1);
});

test("POM correction for a Shared Player keeps one ledger application", () => {
  const sharedTeamA = performance({
    playerId: "aninda",
    teamId: "teamA",
    representingTeamId: "teamA" as const,
    playerOfMatch: true,
    didBat: true,
    runs: 12
  });
  const sharedTeamB = performance({
    playerId: "aninda",
    teamId: "teamB",
    representingTeamId: "teamB" as const,
    playerOfMatch: true,
    didBat: true,
    runs: 8
  });
  const aggregateSharedRecord = {
    ...sharedTeamA,
    runs: 20,
    xpBreakdown: calculateSharedPlayerMatchXP([sharedTeamA, sharedTeamB], {
      result: result()
    })
  };
  const match: MatchRecord = {
    ...finalisedMatch([sharedTeamA, sharedTeamB]),
    sharedPlayerId: "aninda",
    finalisedPlayerRecords: [aggregateSharedRecord]
  };
  const initialState = applyFinalisedMatchToCareerStats(
    match,
    createEmptyCareerProgressionState(),
    "2026-08-10T10:00:00.000Z"
  );
  const corrected = applyPlayerOfMatchCorrectionToFinalisedMatch({
    match,
    currentState: initialState,
    nextPlayerOfMatchId: null
  });

  assert.deepEqual(Object.keys(corrected.state.appliedProgressions), [
    "match-1:aninda"
  ]);
  assert.equal(
    corrected.state.appliedProgressions["match-1:aninda"].xpBreakdown
      .playerOfMatchXP,
    0
  );
  assert.equal(corrected.state.playerCareers.aninda.matches, 1);
});

test("batting runs XP is capped and milestone bonuses are cumulative", () => {
  assert.equal(calculatePlayerMatchXP(performance({ didBat: true, runs: 8 })).battingRunsXP, 4);
  assert.equal(calculatePlayerMatchXP(performance({ didBat: true, runs: 15 })).battingRunsXP, 7);
  assert.equal(calculatePlayerMatchXP(performance({ didBat: true, runs: 52 })).battingRunsXP, 26);
  assert.equal(calculatePlayerMatchXP(performance({ didBat: true, runs: 60 })).battingRunsXP, 30);
  assert.equal(calculatePlayerMatchXP(performance({ didBat: true, runs: 50 })).battingMilestoneXP, 15);
  assert.equal(calculatePlayerMatchXP(performance({ didBat: true, runs: 100 })).battingMilestoneXP, 40);
});

test("duck penalty applies only to out-for-zero batters", () => {
  assert.equal(
    calculatePlayerMatchXP(
      performance({ didBat: true, runs: 0, wasOut: true })
    ).duckPenaltyXP,
    -8
  );
  assert.equal(
    calculatePlayerMatchXP(
      performance({ didBat: true, runs: 0, wasOut: false })
    ).duckPenaltyXP,
    0
  );
  assert.equal(
    calculatePlayerMatchXP(performance({ didBat: false, wasOut: true })).duckPenaltyXP,
    0
  );
});

test("bowling XP uses derived wickets, hat-tricks, maidens and per-over penalties", () => {
  assert.equal(calculatePlayerMatchXP(performance({ wickets: 1 })).wicketXP, 10);
  assert.equal(calculatePlayerMatchXP(performance({ wickets: 0 })).wicketXP, 0);
  assert.equal(calculatePlayerMatchXP(performance({ hatTricks: 1 })).hatTrickXP, 25);
  assert.equal(calculatePlayerMatchXP(performance({ hatTricks: 0 })).hatTrickXP, 0);
  assert.equal(
    calculatePlayerMatchXP(performance(), {
      overs: [over("teamA", 1, 0, { maiden: true })]
    }).maidenXP,
    5
  );
  assert.equal(getOverPenalty(21), -5);
  assert.equal(getOverPenalty(25), -8);
  assert.equal(getOverPenalty(30), -12);
  assert.equal(
    calculateExpensiveOverPenalty([
      over("teamA", 1, 30),
      over("teamA", 2, 30),
      over("teamA", 3, 30)
    ]),
    -20
  );
});

test("fielding XP credits catches run-outs and stumpings with a combined cap", () => {
  assert.equal(calculatePlayerMatchXP(performance({ catches: 1 })).fieldingXP, 6);
  assert.equal(calculatePlayerMatchXP(performance({ runOuts: 1 })).fieldingXP, 8);
  assert.equal(calculatePlayerMatchXP(performance({ stumpings: 1 })).fieldingXP, 8);
  assert.equal(
    calculatePlayerMatchXP(
      performance({ catches: 4, runOuts: 2, stumpings: 2 })
    ).fieldingXP,
    24
  );
});

test("match XP stores raw and awarded totals with caps", () => {
  const huge = calculatePlayerMatchXP(
    performance({
      playerOfMatch: true,
      didBat: true,
      runs: 100,
      wickets: 5,
      catches: 4
    }),
    { result: result() }
  );

  assert.equal(huge.rawTotalXP > 120, true);
  assert.equal(huge.awardedXP, 120);
  assert.equal(clampAwardedMatchXP(-40), -15);
});

test("Shared Player XP is awarded once with combined discipline totals", () => {
  const sharedXP = calculateSharedPlayerMatchXP(
    [
      performance({
        playerId: "aninda",
        teamId: "teamA",
        representingTeamId: "teamA" as const,
        playerOfMatch: true,
        didBat: true,
        runs: 40,
        wickets: 2,
        catches: 3
      }),
      performance({
        playerId: "aninda",
        teamId: "teamB",
        representingTeamId: "teamB" as const,
        playerOfMatch: true,
        didBat: true,
        runs: 20,
        runOuts: 2
      })
    ],
    {
      result: result(),
      overs: [
        over("teamA", 1, 0, { maiden: true }),
        over("teamB", 1, 28)
      ]
    }
  );

  assert.equal(sharedXP.participationXP, 20);
  assert.equal(sharedXP.winBonusXP, 0);
  assert.equal(sharedXP.playerOfMatchXP, 15);
  assert.equal(sharedXP.battingRunsXP, 30);
  assert.equal(sharedXP.battingMilestoneXP, 0);
  assert.equal(sharedXP.wicketXP, 20);
  assert.equal(sharedXP.maidenXP, 5);
  assert.equal(sharedXP.expensiveOverPenaltyXP, -8);
  assert.equal(sharedXP.fieldingXP, 24);
  assert.equal(sharedXP.awardedXP, 106);
});

test("Shared Player milestones are evaluated per innings, not combined innings", () => {
  const sharedXP = calculateSharedPlayerMatchXP([
    performance({
      playerId: "aninda",
      teamId: "teamA",
      representingTeamId: "teamA" as const,
      didBat: true,
      runs: 30
    }),
    performance({
      playerId: "aninda",
      teamId: "teamB",
      representingTeamId: "teamB" as const,
      didBat: true,
      runs: 25
    })
  ]);

  assert.equal(sharedXP.battingRunsXP, 27);
  assert.equal(sharedXP.battingMilestoneXP, 0);
});

test("approved XP examples are reproducible", () => {
  assert.equal(
    calculateMatchXP(performance({ didBat: true, runs: 4 })),
    22
  );
  assert.equal(
    calculateMatchXP(
      performance({ didBat: true, runs: 18, wickets: 1, catches: 1 }),
      { result: result() }
    ),
    50
  );
  assert.equal(
    calculateMatchXP(
      performance({
        didBat: true,
        runs: 52,
        wickets: 2,
        catches: 1,
        playerOfMatch: true
      }),
      { result: result() }
    ),
    107
  );
  assert.equal(
    calculateMatchXP(
      performance({ didBat: true, runs: 0, wasOut: true }),
      { overs: [over("teamA", 1, 31)] }
    ),
    0
  );
});

test("XP rule version is selected from matchDate and missing stored versions are V1", () => {
  assert.equal(getXPRuleVersionForMatchDate("2026-08-31"), "v1");
  assert.equal(getXPRuleVersionForMatchDate("2026-09-01"), "v2");
  assert.equal(getXPRuleVersionForMatchDate("invalid"), "v1");
  assert.equal(getStoredXPRuleVersion(undefined), "v1");
  assert.equal(getStoredXPRuleVersion({}), "v1");
  assert.equal(getStoredXPRuleVersion({ xpRuleVersion: "v2" }), "v2");
});

test("server finalisation replaces submitted XP with a match-date-authoritative breakdown", () => {
  const submittedPerformance = performance({ didBat: true, runs: 100 });
  const submittedBreakdown = {
    ...calculatePlayerMatchXP(submittedPerformance),
    awardedXP: 999
  };
  const submittedMatch = {
    ...finalisedMatch([submittedPerformance]),
    matchDate: "2026-09-01",
    finalisedPlayerRecords: [
      {
        ...submittedPerformance,
        xpBreakdown: submittedBreakdown
      }
    ]
  };
  submittedMatch.teams.teamA.playerPerformances = [
    {
      ...submittedPerformance,
      xpBreakdown: submittedBreakdown
    }
  ];

  const authoritative = withAuthoritativeXPBreakdowns(submittedMatch);
  const record = authoritative.finalisedPlayerRecords?.[0];

  assert.equal(record?.xpBreakdown.xpRuleVersion, "v2");
  assert.equal(record?.xpBreakdown.awardedXP, 106);
  assert.equal(
    (authoritative.teams.teamA.playerPerformances[0] as typeof record)?.xpBreakdown
      .awardedXP,
    106
  );
});

test("XP V2 batting uses two run bands, cumulative milestones, and raw points beyond the career cap", () => {
  const regularExamples = new Map([
    [1, 0],
    [2, 1],
    [20, 10],
    [40, 20],
    [50, 25],
    [60, 30],
    [61, 30],
    [64, 31],
    [70, 32],
    [80, 35],
    [90, 37],
    [100, 40],
    [120, 45],
    [140, 50],
    [160, 55],
    [200, 65]
  ]);

  for (const [runs, points] of regularExamples) {
    assert.equal(calculateV2RawRegularBattingPoints(runs), points, `${runs} runs`);
  }

  const fifty = performance({ didBat: true, runs: 50 });
  const hundred = performance({ didBat: true, runs: 100 });
  const oneSixty = performance({ didBat: true, runs: 160 });
  const v2Context = { matchDate: "2026-09-01" };

  assert.equal(calculateRawBattingPoints(fifty), 40);
  assert.equal(calculateRawBattingPoints(hundred), 80);
  assert.equal(calculateCareerBattingXP(hundred), 80);
  assert.equal(calculateRawBattingPoints(oneSixty), 95);
  assert.equal(calculateCareerBattingXP(oneSixty), 90);
  assert.equal(calculatePlayerMatchXP(oneSixty, v2Context).battingRunsXP, 50);
  assert.equal(calculatePlayerMatchXP(oneSixty, v2Context).rawBattingPoints, 95);
});

test("XP V2 duck applies only to a dismissed batter who actually batted", () => {
  const v2Context = { matchDate: "2026-09-01" };

  assert.equal(
    calculatePlayerMatchXP(
      performance({ didBat: true, wasOut: true, runs: 0 }),
      v2Context
    ).duckPenaltyXP,
    -8
  );
  assert.equal(
    calculatePlayerMatchXP(
      performance({ didBat: true, wasOut: false, runs: 0 }),
      v2Context
    ).duckPenaltyXP,
    0
  );
  assert.equal(
    calculatePlayerMatchXP(
      performance({ didBat: false, wasOut: false, runs: 0 }),
      v2Context
    ).duckPenaltyXP,
    0
  );
});

test("XP V2 completed-over quality table covers every boundary", () => {
  const examples = new Map([
    [0, 10],
    [1, 6],
    [3, 6],
    [4, 3],
    [6, 3],
    [7, 1],
    [9, 1],
    [10, 0],
    [12, 0],
    [13, -2],
    [15, -2],
    [16, -4],
    [18, -4],
    [19, -6],
    [21, -6],
    [22, -8],
    [24, -8],
    [25, -11],
    [29, -11],
    [30, -15],
    [50, -15]
  ]);

  for (const [runs, points] of examples) {
    assert.equal(calculateOverQualityPoints(runs), points, `${runs} conceded`);
  }
});

test("XP V2 ignores incomplete overs and gives a maiden exactly +10 once", () => {
  const completeMaiden = over("teamA", 1, 0, { maiden: true, legalBalls: 6 });
  const incompleteMaiden = over("teamA", 2, 0, { maiden: true, legalBalls: 5 });
  const breakdown = calculatePlayerMatchXP(performance(), {
    matchDate: "2026-09-01",
    overs: [completeMaiden, incompleteMaiden]
  });

  assert.deepEqual(calculateRawOverQualityPoints([incompleteMaiden]), {
    positive: 0,
    negative: 0,
    total: 0
  });
  assert.equal(breakdown.maidenXP, 0);
  assert.equal(breakdown.overQualityXP, 10);
  assert.equal(breakdown.rawBowlingPoints, 10);
});

test("XP V2 wickets and hat-tricks stack with protected career over quality", () => {
  const positiveOvers = [1, 2, 3, 4].map((overNumber) =>
    over("teamA", overNumber, 0, { legalBalls: 6 })
  );
  const negativeOvers = [1, 2].map((overNumber) =>
    over("teamA", overNumber, 30, { legalBalls: 6 })
  );
  const bowlingPerformance = performance({ wickets: 3, hatTricks: 1 });

  assert.equal(calculateRawBowlingPoints(bowlingPerformance, positiveOvers), 95);
  assert.equal(calculateCareerBowlingXP(bowlingPerformance, positiveOvers), 85);
  assert.equal(calculateRawBowlingPoints(performance(), negativeOvers), -30);
  assert.equal(calculateCareerBowlingXP(performance(), negativeOvers), -20);

  const breakdown = calculatePlayerMatchXP(bowlingPerformance, {
    matchDate: "2026-09-01",
    overs: positiveOvers
  });
  assert.equal(breakdown.wicketXP, 30);
  assert.equal(breakdown.hatTrickXP, 25);
  assert.equal(breakdown.overQualityXP, XP_V2_RULES.positiveOverQualityCareerCap);
  assert.equal(breakdown.rawPositiveOverQualityPoints, 40);
});

test("XP V2 fielding raw points remain uncapped while career fielding stops at 40", () => {
  assert.equal(calculateRawFieldingPoints(performance({ catches: 1 })), 6);
  assert.equal(calculateRawFieldingPoints(performance({ runOuts: 1 })), 8);
  assert.equal(calculateRawFieldingPoints(performance({ stumpings: 1 })), 8);

  const hugeFielding = performance({ catches: 7, runOuts: 1, stumpings: 1 });
  assert.equal(calculateRawFieldingPoints(hugeFielding), 58);
  assert.equal(calculateCareerFieldingXP(hugeFielding), 40);

  const breakdown = calculatePlayerMatchXP(hugeFielding, {
    matchDate: "2026-09-01"
  });
  assert.equal(breakdown.fieldingXP, 40);
  assert.equal(breakdown.rawFieldingPoints, 58);
});

test("XP V2 career match award clamps to -15 and +160 without capping raw categories", () => {
  assert.equal(clampAwardedMatchXP(-100, "v2"), -15);
  assert.equal(clampAwardedMatchXP(500, "v2"), 160);

  const monster = calculatePlayerMatchXP(
    performance({
      playerOfMatch: true,
      didBat: true,
      runs: 200,
      wickets: 10,
      catches: 10
    }),
    {
      matchDate: "2026-09-01",
      result: result(),
      overs: [over("teamA", 1, 0, { legalBalls: 6 })]
    }
  );

  assert.equal(monster.awardedXP, 160);
  assert.equal(monster.rawBattingPoints, 105);
  assert.equal(monster.rawBowlingPoints, 110);
  assert.equal(monster.rawFieldingPoints, 60);
});

test("XP V2 POM recommendation uses uncapped raw performance and avoids cap-created ties", () => {
  const stronger = performance({
    playerId: "naim",
    teamId: "teamA",
    didBat: true,
    runs: 200,
    wickets: 8
  });
  const cappedRunnerUp = performance({
    playerId: "dipanjan",
    teamId: "teamB",
    didBat: true,
    runs: 180,
    wickets: 8
  });
  const context = { matchDate: "2026-09-01", result: result({ type: "tie" }) };

  assert.equal(calculatePrePomPlayerMatchXP(stronger, context).awardedXP, 160);
  assert.equal(calculatePrePomPlayerMatchXP(cappedRunnerUp, context).awardedXP, 160);

  const recommendation = getPlayerOfMatchRecommendation({
    performances: [stronger, cappedRunnerUp],
    allBowlingOvers: [],
    result: result({ type: "tie" }),
    sharedPlayerId: null,
    matchDate: "2026-09-01"
  });

  assert.equal(recommendation.recommendedPlayerId, "naim");
  assert.equal(recommendation.isTie, false);
  assert.equal(recommendation.leaders[0]?.prePomXP, 205);
});

test("XP V2 POM recommendation still returns no recommendation for a true raw tie", () => {
  const recommendation = getPlayerOfMatchRecommendation({
    performances: [
      performance({ playerId: "naim", teamId: "teamA", didBat: true, runs: 80 }),
      performance({ playerId: "dipanjan", teamId: "teamB", didBat: true, runs: 80 })
    ],
    allBowlingOvers: [],
    result: result({ type: "tie" }),
    sharedPlayerId: null,
    matchDate: "2026-09-01"
  });

  assert.equal(recommendation.recommendedPlayerId, null);
  assert.equal(recommendation.isTie, true);
});

test("XP V2 Shared Player remains one application with no normal win bonus", () => {
  const shared = calculateSharedPlayerMatchXP(
    [
      performance({ playerId: "aninda", teamId: "teamA", didBat: true, runs: 40 }),
      performance({ playerId: "aninda", teamId: "teamB", didBat: true, runs: 20 })
    ],
    { matchDate: "2026-09-01", result: result() }
  );

  assert.equal(shared.xpRuleVersion, "v2");
  assert.equal(shared.participationXP, 20);
  assert.equal(shared.winBonusXP, 0);
  assert.equal(shared.battingRunsXP, 30);
  assert.equal(shared.rawBattingPoints, 30);
});

test("late finalisation uses matchDate and stores the selected XP version in the ledger", () => {
  const augustMatch = {
    ...finalisedMatch([performance({ playerId: "aninda", didBat: true, runs: 160 })]),
    matchDate: "2026-08-31"
  };
  const septemberMatch = {
    ...finalisedMatch([performance({ playerId: "aninda", didBat: true, runs: 160 })]),
    id: "match-2",
    matchDate: "2026-09-01"
  };
  const augustState = applyFinalisedMatchToCareerStats(
    augustMatch,
    createEmptyCareerProgressionState(),
    "2026-09-10T12:00:00.000Z"
  );
  const septemberState = applyFinalisedMatchToCareerStats(
    septemberMatch,
    augustState,
    "2026-09-10T12:05:00.000Z"
  );

  assert.equal(
    augustState.appliedProgressions["match-1:aninda"].xpBreakdown.xpRuleVersion,
    "v1"
  );
  assert.equal(
    septemberState.appliedProgressions["match-2:aninda"].xpBreakdown.xpRuleVersion,
    "v2"
  );
  assert.equal(augustState.playerCareers.aninda.totalXP, 95);
  assert.equal(septemberState.playerCareers.aninda.totalXP, 211);
});

test("approved level curve and cumulative thresholds are used", () => {
  assert.equal(xpNeededToAdvance(0), 150);
  assert.equal(xpNeededToAdvance(1), 210);
  assert.equal(cumulativeXPForLevel(1), 150);
  assert.equal(cumulativeXPForLevel(2), 360);
  assert.equal(cumulativeXPForLevel(3), 650);
  assert.equal(cumulativeXPForLevel(4), 1040);
  assert.equal(cumulativeXPForLevel(5), 1550);
  assert.equal(cumulativeXPForLevel(10), 6600);
  assert.equal(cumulativeXPThresholdForLevel(10), 6600);
});

test("level progress uses XP within the current level", () => {
  assert.deepEqual(getLevelProgress(180), {
    level: 1,
    totalXP: 180,
    currentLevelThreshold: 150,
    nextLevelThreshold: 360,
    xpWithinLevel: 30,
    xpRequiredWithinLevel: 210,
    progressPercentage: (30 / 210) * 100
  });
});

test("XP progress percentages are formatted to one decimal place for display", () => {
  assert.equal(formatPercentage(28.000000000000004), "28.0%");
  assert.equal(formatPercentage(27.333333333333332), "27.3%");
  assert.equal(formatPercentage(57.99999999999999), "58.0%");
  assert.equal(formatPercentage(Number.NaN), "0.0%");
  assert.equal(formatPercentage(-10), "0.0%");
  assert.equal(formatPercentage(130), "100.0%");
  assert.equal(getLevelProgress(180).level, 1);
});

test("negative XP cannot reduce an achieved level", () => {
  const levelThreeXP = cumulativeXPForLevel(3);

  assert.equal(
    applyMatchXPWithLevelProtection({
      currentTotalXP: levelThreeXP,
      currentLevel: 3,
      awardedMatchXP: -15
    }),
    levelThreeXP
  );
  assert.deepEqual(applyMatchXP({ level: 3, xp: levelThreeXP }, -15), {
    level: 3,
    xp: levelThreeXP
  });
});

test("finalisation applies permanent XP and statistics exactly once", () => {
  const match = finalisedMatch([
    performance({ playerId: "aninda", teamId: "teamA", didBat: true, runs: 18 }),
    performance({ playerId: "biplab", teamId: "teamB", didBat: true, runs: 8 })
  ]);
  const firstApply = applyFinalisedMatchToCareerStats(
    match,
    createEmptyCareerProgressionState(),
    "2026-08-05T12:00:00.000Z"
  );
  const secondApply = applyFinalisedMatchToCareerStats(
    match,
    firstApply,
    "2026-08-05T12:01:00.000Z"
  );

  assert.equal(firstApply.playerCareers.aninda.matches, 1);
  assert.equal(firstApply.playerCareers.aninda.runs, 18);
  assert.equal(firstApply.playerCareers.aninda.totalXP, 34);
  assert.equal(secondApply.playerCareers.aninda.matches, 1);
  assert.equal(secondApply.playerCareers.aninda.totalXP, 34);
  assert.equal(Object.keys(secondApply.appliedProgressions).length, 2);
});

test("Shared Player career update combines both team contexts into one match", () => {
  const aggregateSharedRecord = {
    ...performance({
      playerId: "aninda",
      teamId: "teamA",
      didBat: true,
      runs: 19,
      wickets: 2,
      catches: 1,
      runOuts: 1,
      hatTricks: 1
    }),
    xpBreakdown: calculateSharedPlayerMatchXP([
      performance({
        playerId: "aninda",
        teamId: "teamA",
        representingTeamId: "teamA" as const,
        didBat: true,
        runs: 12,
        wickets: 1,
        catches: 1
      }),
      performance({
        playerId: "aninda",
        teamId: "teamB",
        representingTeamId: "teamB" as const,
        didBat: true,
        runs: 7,
        wickets: 1,
        runOuts: 1,
        hatTricks: 1
      })
    ])
  };
  const match = {
    ...finalisedMatch([
      performance({
        playerId: "aninda",
        teamId: "teamA",
        representingTeamId: "teamA" as const,
        didBat: true,
        runs: 12
      }),
      performance({
        playerId: "aninda",
        teamId: "teamB",
        representingTeamId: "teamB" as const,
        didBat: true,
        runs: 7
      })
    ]),
    sharedPlayerId: "aninda",
    finalisedPlayerRecords: [aggregateSharedRecord]
  };
  const state = applyFinalisedMatchToCareerStats(
    match,
    createEmptyCareerProgressionState(),
    "2026-08-05T12:00:00.000Z"
  );

  assert.equal(state.playerCareers.aninda.matches, 1);
  assert.equal(state.playerCareers.aninda.runs, 19);
  assert.equal(state.playerCareers.aninda.wickets, 2);
  assert.equal(state.playerCareers.aninda.catches, 1);
  assert.equal(state.playerCareers.aninda.runOuts, 1);
  assert.equal(state.playerCareers.aninda.hatTricks, 1);
  assert.equal(Object.keys(state.playerCareers).length, 1);
});

test("draft in-progress and no-result matches do not apply permanent career stats", () => {
  const draftMatch = { ...finalisedMatch([performance()]), status: "draft" as const };
  const noResultMatch = finalisedMatch([performance()], { type: "no_result" });

  assert.deepEqual(
    applyFinalisedMatchToCareerStats(draftMatch, createEmptyCareerProgressionState()),
    createEmptyCareerProgressionState()
  );
  assert.deepEqual(
    applyFinalisedMatchToCareerStats(noResultMatch, createEmptyCareerProgressionState()),
    createEmptyCareerProgressionState()
  );

  assert.deepEqual(
    applyFinalisedMatchToCareerStats(
      { ...finalisedMatch([performance()]), isDemo: true },
      createEmptyCareerProgressionState()
    ),
    createEmptyCareerProgressionState()
  );
});

test("career state merges into dashboard and profile player values", () => {
  const basePlayer: Player = {
    id: "aninda",
    slug: "aninda",
    name: "Aninda",
    cardTitle: "Rulebook Rambo",
    cardImage: "/player-cards/rulebook-rambo.png",
    role: "Balanced All-Rounder",
    playStyles: ["batting", "pace", "utility"],
    battingProfile: "Batting",
    bowlingProfile: "Bowling",
    fieldingProfile: "Fielding",
    heroSummary: "Summary",
    specialMoveName: "Move",
    specialMoveDescription: "Description",
    funTrait: "Trait",
    avatar: "/player-cards/rulebook-rambo.png",
    tags: ["all-rounder"],
    accent: "green",
    accentColor: "#9cff24",
    level: 0,
    xp: 0,
    ratings: { batting: 0, bowling: 0, fielding: 0 },
    stats: { matches: 0, runs: 0, wickets: 0, catches: 0, runOuts: 0, hatTricks: 0 }
  };
  const state = applyFinalisedMatchToCareerStats(
    finalisedMatch([
      performance({
        playerId: "aninda",
        teamId: "teamA",
        didBat: true,
        runs: 20,
        wickets: 1,
        catches: 1
      })
    ]),
    createEmptyCareerProgressionState()
  );
  const [mergedPlayer] = mergePlayersWithCareerState([basePlayer], state);

  assert.equal(mergedPlayer.level, 0);
  assert.equal(mergedPlayer.xp, 51);
  assert.deepEqual(mergedPlayer.stats, {
    matches: 1,
    runs: 20,
    wickets: 1,
    catches: 1,
    runOuts: 0,
    hatTricks: 0
  });
});

test("career roster merge preserves existing players and creates zero defaults for new players", () => {
  const existingState = createEmptyCareerProgressionState();
  existingState.playerCareers.aninda = {
    ...createEmptyPlayerCareerStats("aninda"),
    matches: 2,
    inningsBatted: 2,
    runs: 44,
    wickets: 3,
    catches: 1,
    runOuts: 1,
    threeWicketHauls: 1,
    matchesBowled: 2,
    completedOvers: 4,
    totalRunsConceded: 30,
    totalXP: 96
  };
  const roster = [
    {
      id: "aninda",
      slug: "aninda",
      name: "Aninda",
      cardTitle: "Rulebook Rambo",
      cardImage: "/player-cards/rulebook-rambo.png",
      role: "Balanced All-Rounder",
      playStyles: ["batting", "pace", "utility"],
      battingProfile: "Batting",
      bowlingProfile: "Bowling",
      fieldingProfile: "Fielding",
      heroSummary: "Summary",
      specialMoveName: "Move",
      specialMoveDescription: "Description",
      funTrait: "Trait",
      avatar: "/player-cards/rulebook-rambo.png",
      tags: ["all-rounder"],
      accent: "green",
      accentColor: "#9cff24",
      level: 0,
      xp: 0,
      ratings: { batting: 0, bowling: 0, fielding: 0 },
      stats: { matches: 0, runs: 0, wickets: 0, catches: 0, runOuts: 0, hatTricks: 0 }
    },
    {
      id: "new-player",
      slug: "new-player",
      name: "New Player",
      cardTitle: "Fresh Legend",
      cardImage: "/player-cards/new-player.png",
      role: "All-Rounder",
      playStyles: ["utility"],
      battingProfile: "Batting",
      bowlingProfile: "Bowling",
      fieldingProfile: "Fielding",
      heroSummary: "Summary",
      specialMoveName: "Move",
      specialMoveDescription: "Description",
      funTrait: "Trait",
      avatar: "/player-cards/new-player.png",
      tags: ["all-rounder"],
      accent: "green",
      accentColor: "#9cff24",
      level: 0,
      xp: 0,
      ratings: { batting: 0, bowling: 0, fielding: 0 },
      stats: { matches: 0, runs: 0, wickets: 0, catches: 0, runOuts: 0, hatTricks: 0 }
    }
  ] satisfies Player[];
  const mergedState = mergeCareerStateWithRoster(existingState, roster);
  const mergedPlayers = mergePlayersWithCareerState(roster, existingState);

  assert.equal(mergedState.playerCareers.aninda.matches, 2);
  assert.equal(mergedState.playerCareers.aninda.runs, 44);
  assert.equal(mergedState.playerCareers["new-player"].matches, 0);
  assert.equal(mergedState.playerCareers["new-player"].runs, 0);
  assert.equal(mergedState.playerCareers["new-player"].runOuts, 0);
  assert.equal(mergedState.playerCareers["new-player"].hatTricks, 0);
  assert.equal(mergedPlayers.find((player) => player.id === "new-player")?.level, 0);
  assert.equal(
    mergedPlayers.find((player) => player.id === "new-player")?.stats.matches,
    0
  );
});

test("zero completed matches are unrated with no numeric rating", () => {
  assert.deepEqual(calculateDisplayedRating(80, 0), {
    status: "UNRATED",
    value: null
  });
});

test("zero-career Player Power remains zero after clean reset state", () => {
  const snapshots = calculatePlayerRatingSnapshots([
    {
      playerId: "clean-player",
      finalisedMatches: 0,
      inningsBatted: 0,
      totalRuns: 0,
      fifties: 0,
      centuries: 0,
      dismissedDucks: 0,
      matchesBowled: 0,
      totalWickets: 0,
      completedOvers: 0,
      totalRunsConceded: 0,
      hatTricks: 0,
      threeWicketHauls: 0,
      catches: 0,
      runOuts: 0,
      stumpings: 0
    }
  ]);

  assert.deepEqual(snapshots[0].rawRatings, {
    batting: 0,
    bowling: 0,
    fielding: 0
  });
  assert.deepEqual(snapshots[0].displayedRatings.batting, {
    status: "UNRATED",
    value: null
  });
});

test("clean player after Demo Reset maps to 0/100 for all Player Power displays", () => {
  const resetState = createEmptyCareerProgressionState();
  const mergedPlayers = mergePlayersWithCareerState(activePlayers, resetState);

  for (const player of mergedPlayers) {
    assert.equal(player.stats.matches, 0);
    assert.equal(player.xp, 0);
    assert.deepEqual(player.ratings, {
      batting: 0,
      bowling: 0,
      fielding: 0
    });
  }
});

test("real non-zero batting Player Power still calculates from batting data", () => {
  const snapshots = calculatePlayerRatingSnapshots([
    aggregatePlayerPerformances("steady", [
      performance({ playerId: "steady", didBat: true, runs: 10 })
    ]),
    aggregatePlayerPerformances("striker", [
      performance({ playerId: "striker", didBat: true, runs: 30 })
    ])
  ]);
  const byPlayerId = new Map(
    snapshots.map((snapshot) => [snapshot.playerId, snapshot.rawRatings.batting])
  );

  assert.equal(byPlayerId.get("steady"), 20);
  assert.equal(byPlayerId.get("striker"), 80);
});

test("no bowling data produces no invalid delivery rating", () => {
  const [snapshot] = calculatePlayerRatingSnapshots([
    aggregatePlayerPerformances("aninda", [
      performance({ didBat: true, runs: 25, overs: [] })
    ])
  ]);

  assert.equal(snapshot.rawRatings.bowling, 0);
  assert.deepEqual(snapshot.displayedRatings.bowling, {
    status: "SCOUTING",
    value: null
  });
});

test("no fielding data produces a finite fielding rating", () => {
  const [snapshot] = calculatePlayerRatingSnapshots([
    aggregatePlayerPerformances("aninda", [
      performance({ catches: 0, runOuts: 0 }),
      performance({ catches: 0, runOuts: 0 }),
      performance({ catches: 0, runOuts: 0 })
    ])
  ]);

  assert.equal(Number.isFinite(snapshot.rawRatings.fielding), true);
  assert.equal(snapshot.displayedRatings.fielding.status, "PROVISIONAL");
});
