import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateTeamTotals,
  sanitizeRuns,
  setPlayerAvailability,
  toggleTeamSelection,
  validateMatchRecordInput
} from "../lib/match-records";
import type { PlayerMatchPerformance } from "../lib/types/match";

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

test("server rejects duplicate cross-team membership", () => {
  const errors = validateMatchRecordInput({
    matchDate: "2026-08-04",
    availablePlayerIds: ["aninda", "biplab"],
    teamAPlayerIds: ["aninda"],
    teamBPlayerIds: ["aninda", "biplab"],
    performances: [
      performance("aninda", "teamA", 10),
      performance("biplab", "teamB", 12)
    ]
  });

  assert.equal(errors.includes("A player cannot be selected for both teams."), true);
});

test("team total equals the sum of selected players' runs", () => {
  assert.deepEqual(
    calculateTeamTotals(
      [
        performance("aninda", "teamA", 20),
        performance("biplab", "teamA", 15),
        performance("atripan", "teamB", 11)
      ],
      { teamAPlayerIds: ["aninda", "biplab"], teamBPlayerIds: ["atripan"] }
    ),
    { teamATotal: 35, teamBTotal: 11 }
  );
});

test("changing runs updates the team total", () => {
  const rosters = { teamAPlayerIds: ["aninda"], teamBPlayerIds: ["biplab"] };

  assert.equal(calculateTeamTotals([performance("aninda", "teamA", 8)], rosters).teamATotal, 8);
  assert.equal(calculateTeamTotals([performance("aninda", "teamA", 18)], rosters).teamATotal, 18);
});

test("removing a player removes that player's runs from the total", () => {
  const totals = calculateTeamTotals(
    [performance("aninda", "teamA", 20), performance("biplab", "teamA", 15)],
    { teamAPlayerIds: ["aninda"], teamBPlayerIds: [] }
  );

  assert.equal(totals.teamATotal, 20);
});

test("unselected players do not contribute to the team total", () => {
  const totals = calculateTeamTotals(
    [performance("aninda", "teamA", 20), performance("biplab", "teamA", 15)],
    { teamAPlayerIds: ["aninda"], teamBPlayerIds: [] }
  );

  assert.equal(totals.teamATotal, 20);
});

test("negative or invalid run values are handled safely", () => {
  assert.equal(sanitizeRuns(-4), 0);
  assert.equal(sanitizeRuns("not a score"), 0);
});

function baseState() {
  return {
    availablePlayerIds: ["aninda", "biplab"],
    teamAPlayerIds: [],
    teamBPlayerIds: []
  };
}

function performance(
  playerId: string,
  teamId: PlayerMatchPerformance["teamId"],
  runs: number
): PlayerMatchPerformance {
  return {
    playerId,
    teamId,
    played: true,
    teamWon: false,
    playerOfMatch: false,
    didBat: true,
    runs,
    wasOut: false,
    wickets: 0,
    overs: [],
    hatTricks: 0,
    catches: 0,
    runOuts: 0,
    stumpings: 0
  };
}
