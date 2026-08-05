import assert from "node:assert/strict";
import test from "node:test";
import {
  balanceWeightedCandidates,
  type BalanceCandidate,
  type BalancedTeams
} from "../lib/team-balancing-core";

const candidates: BalanceCandidate[] = [
  { playerId: "aninda", balanceWeight: 3 },
  { playerId: "arunabha", balanceWeight: 3 },
  { playerId: "biplab", balanceWeight: 2 },
  { playerId: "utpal", balanceWeight: 2 },
  { playerId: "atripan", balanceWeight: 1 },
  { playerId: "gaurav", balanceWeight: 1 }
];

test("only available players are distributed", () => {
  const result = balanceWeightedCandidates(candidates.slice(0, 4), fixedRandom(0.8));
  const distributed = allDistributedIds(result);

  assert.deepEqual(distributed.sort(), ["aninda", "arunabha", "biplab", "utpal"]);
});

test("each available player appears exactly once", () => {
  const result = balanceWeightedCandidates(candidates, fixedRandom(0.4));
  const distributed = allDistributedIds(result);

  assert.equal(distributed.length, new Set(distributed).size);
  assert.equal(distributed.length, candidates.length);
});

test("no player appears in both teams", () => {
  const result = balanceWeightedCandidates(candidates, fixedRandom(0.4));
  const teamB = new Set(result.teamBPlayerIds);

  assert.equal(result.teamAPlayerIds.some((playerId) => teamB.has(playerId)), false);
});

test("even player counts produce equal team sizes", () => {
  const result = balanceWeightedCandidates(candidates, fixedRandom(0.2));

  assert.equal(result.teamAPlayerIds.length, result.teamBPlayerIds.length);
});

test("odd player counts produce a size difference of exactly one", () => {
  const result = balanceWeightedCandidates(candidates.slice(0, 5), fixedRandom(0.2));

  assert.equal(
    Math.abs(result.teamAPlayerIds.length - result.teamBPlayerIds.length),
    1
  );
});

test("hidden team-weight difference is kept reasonably small", () => {
  const result = balanceWeightedCandidates(candidates, fixedRandom(0.2));
  const weights = new Map(candidates.map((candidate) => [candidate.playerId, candidate.balanceWeight]));

  assert.equal(Math.abs(teamWeight(result.teamAPlayerIds, weights) - teamWeight(result.teamBPlayerIds, weights)) <= 1, true);
});

test("repeated shuffles can produce different valid results", () => {
  const results = [
    [0.1, 0.9, 0.1, 0.9, 0.1, 0.9, 0.1, 0.9],
    [0.2, 0.2, 0.8, 0.8, 0.2, 0.2, 0.8, 0.8],
    [0.3, 0.7, 0.3, 0.7, 0.7, 0.3, 0.7, 0.3]
  ].map((values) => balanceWeightedCandidates(candidates, sequenceRandom(values)));
  const uniqueResults = new Set(results.map((result) => JSON.stringify(result)));

  assert.equal(uniqueResults.size > 1, true);

  for (const result of results) {
    assert.equal(allDistributedIds(result).length, candidates.length);
  }
});

test("no private balance weights are returned to the client shape", () => {
  const result = balanceWeightedCandidates(candidates, fixedRandom(0.4));

  assert.equal("balanceWeight" in result, false);
  assert.equal(
    allDistributedIds(result).some((playerId) => typeof playerId !== "string"),
    false
  );
});

function allDistributedIds(result: BalancedTeams): string[] {
  return [...result.teamAPlayerIds, ...result.teamBPlayerIds];
}

function teamWeight(
  playerIds: string[],
  weights: Map<string, BalanceCandidate["balanceWeight"]>
): number {
  return playerIds.reduce((total, playerId) => total + (weights.get(playerId) ?? 0), 0);
}

function fixedRandom(value: number) {
  return () => value;
}

function sequenceRandom(values: number[]) {
  let index = 0;

  return () => {
    const value = values[index % values.length];
    index += 1;
    return value;
  };
}
