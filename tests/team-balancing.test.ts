import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  balanceWeightedCandidates,
  tryBalanceWeightedCandidates,
  type BalanceCandidate,
  type BalanceConstraintOptions,
  type BalancedTeams
} from "../lib/team-balancing-core";
import { activePlayers } from "../lib/data/players";
import {
  applySharedPlayerToRosters,
  getDistributablePlayerIds
} from "../lib/match-records";

const privateWeightExpectations = {
  dipanjan: 3,
  aninda: 3,
  rohit: 3,
  dipayan: 3,
  soman: 3,
  dheeraj: 3,
  arunabha: 3,
  naim: 3,
  utpal: 2,
  jogindar: 2,
  badhan: 2,
  madhab: 2,
  chaitanya: 2,
  amrit: 2,
  pritvi: 2,
  saurav: 1,
  atripan: 1,
  biplab: 1,
  gaurav: 1,
  debraj: 0,
  suprateem: 0
} as const satisfies Record<string, BalanceCandidate["balanceWeight"]>;

const automaticSeparationPairs = [
  ["aninda", "rohit"],
  ["dheeraj", "rohit"]
] as const;
const privateWeights: Record<string, BalanceCandidate["balanceWeight"]> =
  privateWeightExpectations;

test("server-only private balance weights resolve by stable player ID", () => {
  const source = readFileSync("server/team-balancing.ts", "utf8");
  const activePlayerIds = activePlayers.map((player) => player.id).sort();

  for (const [playerId, weight] of Object.entries(privateWeightExpectations)) {
    assert.match(source, new RegExp(`${playerId}: ${weight}`));
  }

  assert.deepEqual(Object.keys(privateWeightExpectations).sort(), activePlayerIds);
  assert.doesNotMatch(source, /Spin Wizard|apex-crusher\.jpeg/);
});

test("private automatic separation pairs stay in the server-only module", () => {
  const serverSource = readFileSync("server/team-balancing.ts", "utf8");
  const clientSource = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");
  const routeSource = readFileSync("app/api/team-balance/route.ts", "utf8");

  assert.match(serverSource, /\["aninda", "rohit"\]/);
  assert.match(serverSource, /\["dheeraj", "rohit"\]/);
  assert.doesNotMatch(clientSource, /dheeraj.*rohit|aninda.*rohit|balanceWeight/i);
  assert.doesNotMatch(routeSource, /balanceWeight|prohibitedPairs|aninda|dheeraj|rohit/);
});

test("only available players are distributed", () => {
  const selectedCandidates = byIds(["aninda", "arunabha", "biplab", "utpal"]);
  const result = balanceWeightedCandidates(selectedCandidates, fixedRandom(0.8));
  const distributed = allDistributedIds(result);

  assert.deepEqual(distributed.sort(), ["aninda", "arunabha", "biplab", "utpal"]);
});

test("each available player appears exactly once across exclusive teams", () => {
  const selectedCandidates = byIds([
    "aninda",
    "arunabha",
    "biplab",
    "utpal",
    "atripan",
    "gaurav"
  ]);
  const result = balanceWeightedCandidates(selectedCandidates, fixedRandom(0.4));
  const distributed = allDistributedIds(result);

  assert.equal(distributed.length, new Set(distributed).size);
  assert.equal(distributed.length, selectedCandidates.length);
});

test("team sizes are equal for six and eight exclusive players", () => {
  for (const playerIds of [
    ["aninda", "arunabha", "biplab", "utpal", "atripan", "gaurav"],
    [
      "aninda",
      "arunabha",
      "biplab",
      "utpal",
      "atripan",
      "gaurav",
      "saurav",
      "debraj"
    ]
  ]) {
    const result = balanceWeightedCandidates(byIds(playerIds), fixedRandom(0.2));

    assert.equal(result.teamAPlayerIds.length, result.teamBPlayerIds.length);
  }
});

test("team-size difference is never greater than one for seven and nine exclusive players", () => {
  for (const playerIds of [
    ["aninda", "arunabha", "biplab", "utpal", "atripan", "gaurav", "madhab"],
    [
      "aninda",
      "arunabha",
      "biplab",
      "utpal",
      "atripan",
      "gaurav",
      "madhab",
      "debraj",
      "saurav"
    ]
  ]) {
    const result = balanceWeightedCandidates(byIds(playerIds), fixedRandom(0.2));

    assert.equal(
      Math.abs(result.teamAPlayerIds.length - result.teamBPlayerIds.length) <= 1,
      true
    );
  }
});

test("automatic balancing separates Aninda from Rohit and Dheeraj from Rohit", () => {
  const selectedCandidates = byIds([
    "aninda",
    "rohit",
    "dheeraj",
    "dipanjan",
    "soman",
    "arunabha",
    "utpal",
    "jogindar"
  ]);

  for (const randomValue of [0, 0.12, 0.24, 0.37, 0.51, 0.68, 0.83, 0.99]) {
    const result = balanceWeightedCandidates(selectedCandidates, fixedRandom(randomValue), {
      prohibitedPairs: automaticSeparationPairs
    });

    assertSeparated(result, "aninda", "rohit");
    assertSeparated(result, "dheeraj", "rohit");
    assertResultIsOptimal(result, selectedCandidates, {
      prohibitedPairs: automaticSeparationPairs
    });
  }
});

test("automatic balancing may place Aninda and Dheeraj together", () => {
  const selectedCandidates = byIds(["aninda", "dheeraj", "rohit", "biplab"]);
  const result = balanceWeightedCandidates(selectedCandidates, fixedRandom(0), {
    prohibitedPairs: automaticSeparationPairs
  });

  assertTogether(result, "aninda", "dheeraj");
  assertSeparated(result, "aninda", "rohit");
  assertSeparated(result, "dheeraj", "rohit");
});

test("manual roster assignment can override private automatic separation preferences", () => {
  const manualAnindaRohit = applySharedPlayerToRosters({
    teamAPlayerIds: ["aninda", "rohit"],
    teamBPlayerIds: ["dheeraj", "utpal"],
    sharedPlayerId: null
  });
  const manualDheerajRohit = applySharedPlayerToRosters({
    teamAPlayerIds: ["dheeraj", "rohit"],
    teamBPlayerIds: ["aninda", "utpal"],
    sharedPlayerId: null
  });

  assert.deepEqual(manualAnindaRohit.teamAPlayerIds, ["aninda", "rohit"]);
  assert.deepEqual(manualDheerajRohit.teamAPlayerIds, ["dheeraj", "rohit"]);
});

test("Shared Player selection stays unrestricted and outside exclusive balancing", () => {
  const availablePlayerIds = ["aninda", "rohit", "dheeraj", "utpal", "jogindar"];
  const distributablePlayerIds = getDistributablePlayerIds(availablePlayerIds, "rohit");
  const balancedExclusiveTeams = balanceWeightedCandidates(
    byIds(distributablePlayerIds),
    fixedRandom(0.4),
    { prohibitedPairs: automaticSeparationPairs }
  );
  const result = applySharedPlayerToRosters({
    ...balancedExclusiveTeams,
    sharedPlayerId: "rohit"
  });

  assert.equal(distributablePlayerIds.includes("rohit"), false);
  assert.equal(result.teamAPlayerIds.includes("rohit"), true);
  assert.equal(result.teamBPlayerIds.includes("rohit"), true);
});

test("balance scoring chooses the lexicographically best valid candidate", () => {
  const selectedCandidates = byIds([
    "dipanjan",
    "aninda",
    "rohit",
    "dheeraj",
    "utpal",
    "jogindar",
    "badhan",
    "saurav",
    "biplab",
    "debraj"
  ]);
  const result = balanceWeightedCandidates(selectedCandidates, fixedRandom(0.65), {
    prohibitedPairs: automaticSeparationPairs
  });

  assertResultIsOptimal(result, selectedCandidates, {
    prohibitedPairs: automaticSeparationPairs
  });
});

test("shuffle can choose different equally optimal candidates while staying valid", () => {
  const equalCandidates: BalanceCandidate[] = [
    { playerId: "a", balanceWeight: 1 },
    { playerId: "b", balanceWeight: 1 },
    { playerId: "c", balanceWeight: 1 },
    { playerId: "d", balanceWeight: 1 }
  ];
  const first = balanceWeightedCandidates(equalCandidates, fixedRandom(0));
  const last = balanceWeightedCandidates(equalCandidates, fixedRandom(0.99));

  assert.notDeepEqual(first, last);
  assertResultIsOptimal(first, equalCandidates);
  assertResultIsOptimal(last, equalCandidates);
});

test("no valid automatic solution returns null from the strict search", () => {
  const impossibleCandidates: BalanceCandidate[] = [
    { playerId: "a", balanceWeight: 1 },
    { playerId: "b", balanceWeight: 1 },
    { playerId: "c", balanceWeight: 1 }
  ];

  assert.equal(
    tryBalanceWeightedCandidates(impossibleCandidates, fixedRandom(0), {
      prohibitedPairs: [
        ["a", "b"],
        ["a", "c"],
        ["b", "c"]
      ]
    }),
    null
  );
});

test("no-valid automatic solution message is generic and private", () => {
  const source = readFileSync("server/team-balancing.ts", "utf8");
  const messageMatch = source.match(/const noValidAutomaticSolutionMessage =\s+"([^"]+)"/);
  const message = messageMatch?.[1] ?? "";

  assert.match(
    message,
    /Could not generate teams with the current selection\. Please adjust the players or choose teams manually\./
  );
  assert.doesNotMatch(
    message,
    /rohit|aninda|dheeraj|weight|tier|strength|separation|prohibited/i
  );
});

test("automatic response shape does not include private weights or totals", () => {
  const result = balanceWeightedCandidates(byIds(["aninda", "utpal", "biplab", "debraj"]));

  assert.equal("balanceWeight" in result, false);
  assert.equal("totalWeight" in result, false);
  assert.equal("prohibitedPairs" in result, false);
  assert.equal(
    allDistributedIds(result).some((playerId) => typeof playerId !== "string"),
    false
  );
});

function byIds(playerIds: string[]): BalanceCandidate[] {
  return playerIds.map((playerId) => ({
    playerId,
    balanceWeight: privateWeights[playerId] ?? 1
  }));
}

function allDistributedIds(result: BalancedTeams): string[] {
  return [...result.teamAPlayerIds, ...result.teamBPlayerIds];
}

function assertSeparated(result: BalancedTeams, leftPlayerId: string, rightPlayerId: string) {
  const teams = [new Set(result.teamAPlayerIds), new Set(result.teamBPlayerIds)];

  assert.equal(
    teams.some((team) => team.has(leftPlayerId) && team.has(rightPlayerId)),
    false
  );
}

function assertTogether(result: BalancedTeams, leftPlayerId: string, rightPlayerId: string) {
  const teams = [new Set(result.teamAPlayerIds), new Set(result.teamBPlayerIds)];

  assert.equal(
    teams.some((team) => team.has(leftPlayerId) && team.has(rightPlayerId)),
    true
  );
}

function assertResultIsOptimal(
  result: BalancedTeams,
  selectedCandidates: BalanceCandidate[],
  options: BalanceConstraintOptions = {}
) {
  const resultScore = scoreResult(result, selectedCandidates);
  const bestScore = findBestScore(selectedCandidates, options);

  assert.deepEqual(resultScore, bestScore);
}

function findBestScore(
  selectedCandidates: BalanceCandidate[],
  options: BalanceConstraintOptions = {}
) {
  const uniqueCandidates = Array.from(
    new Map(selectedCandidates.map((candidate) => [candidate.playerId, candidate])).values()
  );
  const sizes = Array.from(
    new Set([
      Math.floor(uniqueCandidates.length / 2),
      Math.ceil(uniqueCandidates.length / 2)
    ])
  );
  let bestScore: number[] | null = null;

  for (const size of sizes) {
    for (const teamA of combinations(uniqueCandidates, size)) {
      const teamAIds = new Set(teamA.map((candidate) => candidate.playerId));
      const teamB = uniqueCandidates.filter(
        (candidate) => !teamAIds.has(candidate.playerId)
      );

      if (containsProhibitedPair(teamA, options.prohibitedPairs)) continue;
      if (containsProhibitedPair(teamB, options.prohibitedPairs)) continue;

      const score = scoreTeams(teamA, teamB);

      if (!bestScore || compareScores(score, bestScore) < 0) {
        bestScore = score;
      }
    }
  }

  assert.notEqual(bestScore, null);

  return bestScore;
}

function scoreResult(result: BalancedTeams, selectedCandidates: BalanceCandidate[]) {
  const candidatesById = new Map(
    selectedCandidates.map((candidate) => [candidate.playerId, candidate])
  );
  const teamA = result.teamAPlayerIds
    .map((playerId) => candidatesById.get(playerId))
    .filter((candidate): candidate is BalanceCandidate => Boolean(candidate));
  const teamB = result.teamBPlayerIds
    .map((playerId) => candidatesById.get(playerId))
    .filter((candidate): candidate is BalanceCandidate => Boolean(candidate));

  return scoreTeams(teamA, teamB);
}

function scoreTeams(teamA: BalanceCandidate[], teamB: BalanceCandidate[]) {
  return [
    Math.abs(totalWeight(teamA) - totalWeight(teamB)),
    Math.abs(countWeight(teamA, 3) - countWeight(teamB, 3)),
    Math.abs(countWeight(teamA, 2) - countWeight(teamB, 2)),
    Math.abs(countWeight(teamA, 1) - countWeight(teamB, 1)),
    Math.abs(countWeight(teamA, 0) - countWeight(teamB, 0))
  ];
}

function combinations<T>(items: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (size > items.length) return [];

  const result: T[][] = [];

  function visit(startIndex: number, selected: T[]) {
    if (selected.length === size) {
      result.push([...selected]);
      return;
    }

    const remainingNeeded = size - selected.length;

    for (
      let index = startIndex;
      index <= items.length - remainingNeeded;
      index += 1
    ) {
      selected.push(items[index]);
      visit(index + 1, selected);
      selected.pop();
    }
  }

  visit(0, []);

  return result;
}

function containsProhibitedPair(
  team: BalanceCandidate[],
  prohibitedPairs: BalanceConstraintOptions["prohibitedPairs"] = []
) {
  const playerIds = new Set(team.map((candidate) => candidate.playerId));

  return prohibitedPairs.some(
    ([leftPlayerId, rightPlayerId]) =>
      playerIds.has(leftPlayerId) && playerIds.has(rightPlayerId)
  );
}

function compareScores(left: number[], right: number[]) {
  for (let index = 0; index < left.length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);

    if (difference !== 0) return difference;
  }

  return 0;
}

function totalWeight(team: BalanceCandidate[]) {
  return team.reduce((total, candidate) => total + candidate.balanceWeight, 0);
}

function countWeight(team: BalanceCandidate[], weight: BalanceCandidate["balanceWeight"]) {
  return team.filter((candidate) => candidate.balanceWeight === weight).length;
}

function fixedRandom(value: number) {
  return () => value;
}
