import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregatePlayerPerformances,
  applyMatchXP,
  calculateDisplayedRating,
  calculateExpensiveOverPenalty,
  calculateMatchXP,
  calculatePlayerRatingSnapshots,
  cumulativeXPThresholdForLevel,
  getOverPenalty
} from "../lib/progression";
import type { PlayerMatchPerformance } from "../lib/types/match";

function performance(
  overrides: Partial<PlayerMatchPerformance> = {}
): PlayerMatchPerformance {
  return {
    playerId: "aninda",
    teamId: "teamA",
    played: true,
    teamWon: false,
    playerOfMatch: false,
    didBat: false,
    runs: 0,
    wasOut: false,
    wickets: 0,
    overs: [],
    hatTricks: 0,
    catches: 0,
    runOuts: 0,
    stumpings: 0,
    ...overrides
  };
}

test("player did not bat receives no batting XP", () => {
  assert.equal(calculateMatchXP(performance({ didBat: false, runs: 80 })), 20);
});

test("player was not out on zero avoids duck penalty", () => {
  assert.equal(
    calculateMatchXP(performance({ didBat: true, runs: 0, wasOut: false })),
    20
  );
});

test("player dismissed for zero receives duck penalty", () => {
  assert.equal(
    calculateMatchXP(performance({ didBat: true, runs: 0, wasOut: true })),
    12
  );
});

test("score of exactly 50 receives regular batting and fifty XP", () => {
  assert.equal(calculateMatchXP(performance({ didBat: true, runs: 50 })), 60);
});

test("score of exactly 100 receives fifty and century bonuses", () => {
  assert.equal(calculateMatchXP(performance({ didBat: true, runs: 100 })), 90);
});

test("score above 100 still receives the same milestone bonuses", () => {
  assert.equal(calculateMatchXP(performance({ didBat: true, runs: 126 })), 90);
});

test("one hat-trick adds 25 XP", () => {
  assert.equal(calculateMatchXP(performance({ hatTricks: 1 })), 45);
});

test("over conceding exactly 20 runs has no penalty", () => {
  assert.equal(getOverPenalty(20), 0);
});

test("over conceding exactly 21 runs has the first penalty", () => {
  assert.equal(getOverPenalty(21), -5);
});

test("over conceding exactly 30 runs has the maximum single-over penalty", () => {
  assert.equal(getOverPenalty(30), -12);
});

test("multiple expensive overs are summed", () => {
  assert.equal(
    calculateExpensiveOverPenalty([
      { runsConceded: 21, wickets: 0, maiden: false },
      { runsConceded: 25, wickets: 0, maiden: false }
    ]),
    -13
  );
});

test("expensive-over penalty is capped", () => {
  assert.equal(
    calculateExpensiveOverPenalty([
      { runsConceded: 30, wickets: 0, maiden: false },
      { runsConceded: 30, wickets: 0, maiden: false },
      { runsConceded: 30, wickets: 0, maiden: false }
    ]),
    -20
  );
});

test("negative match XP is floored at minus 15", () => {
  assert.equal(
    calculateMatchXP(
      performance({
        played: false,
        didBat: true,
        wasOut: true,
        overs: [
          { runsConceded: 30, wickets: 0, maiden: false },
          { runsConceded: 30, wickets: 0, maiden: false }
        ]
      })
    ),
    -15
  );
});

test("player cannot lose an achieved level", () => {
  const levelThreeXP = cumulativeXPThresholdForLevel(3);

  assert.deepEqual(applyMatchXP({ level: 3, xp: levelThreeXP }, -15), {
    level: 3,
    xp: levelThreeXP
  });
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
