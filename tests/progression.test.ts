import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregatePlayerPerformances,
  applyMatchXP,
  applyMatchXPWithLevelProtection,
  calculateDisplayedRating,
  calculateExpensiveOverPenalty,
  calculateMatchXP,
  calculatePlayerMatchXP,
  calculateSharedPlayerMatchXP,
  calculatePlayerRatingSnapshots,
  clampAwardedMatchXP,
  cumulativeXPForLevel,
  cumulativeXPThresholdForLevel,
  formatPercentage,
  getLevelProgress,
  getOverPenalty,
  xpNeededToAdvance
} from "../lib/progression";
import {
  applyFinalisedMatchToCareerStats,
  createEmptyCareerProgressionState,
  createEmptyPlayerCareerStats,
  mergeCareerStateWithRoster,
  mergePlayersWithCareerState
} from "../lib/career-store";
import type {
  BowlingOver,
  MatchRecord,
  MatchResult,
  PlayerMatchPerformance,
  TeamId,
  TeamInnings
} from "../lib/types/match";
import type { Player } from "../lib/types/player";

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
});

test("career state merges into dashboard and profile player values", () => {
  const basePlayer: Player = {
    id: "aninda",
    slug: "aninda",
    name: "Aninda",
    cardTitle: "Rulebook Rambo",
    cardImage: "/images/player-cards/rulebook-rambo.png",
    role: "Balanced All-Rounder",
    playStyles: ["batting", "pace", "utility"],
    battingProfile: "Batting",
    bowlingProfile: "Bowling",
    fieldingProfile: "Fielding",
    heroSummary: "Summary",
    specialMoveName: "Move",
    specialMoveDescription: "Description",
    funTrait: "Trait",
    avatar: "/player-cards/aninda.png",
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
      cardImage: "/images/player-cards/rulebook-rambo.png",
      role: "Balanced All-Rounder",
      playStyles: ["batting", "pace", "utility"],
      battingProfile: "Batting",
      bowlingProfile: "Bowling",
      fieldingProfile: "Fielding",
      heroSummary: "Summary",
      specialMoveName: "Move",
      specialMoveDescription: "Description",
      funTrait: "Trait",
      avatar: "/player-cards/aninda.png",
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
      cardImage: "/images/player-cards/new-player.png",
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
