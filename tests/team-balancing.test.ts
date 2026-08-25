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
import { validateTeamBalanceRequest } from "../lib/team-balance-request";
import { activePlayers } from "../lib/data/players";
import {
  applySharedPlayerToRosters,
  getDistributablePlayerIds
} from "../lib/match-records";

const automaticSeparationPairs = [
  ["aninda", "rohit"],
  ["dheeraj", "rohit"]
] as const;

test("server-only private balance ratings resolve by stable player ID", () => {
  const serverSource = readFileSync("server/team-balancing.ts", "utf8");
  const activePlayerIds = activePlayers.map((player) => player.id).sort();

  for (const playerId of activePlayerIds) {
    assert.match(serverSource, new RegExp(`${playerId}: \\{ batting:`));
  }

  assert.match(serverSource, /privateBalanceRatings/);
  assert.match(serverSource, /batting: 5|bowling: 5|fielding: 5/);
  assert.doesNotMatch(serverSource, /Spin Wizard|apex-crusher\.jpeg/);
});

test("private automatic separation pairs stay in the server-only module", () => {
  const serverSource = readFileSync("server/team-balancing.ts", "utf8");
  const clientSource = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");
  const websiteRouteSource = readFileSync("app/api/team-balance/route.ts", "utf8");
  const appSyncRouteSource = readFileSync("app/api/app-sync/team-balance/route.ts", "utf8");

  assert.match(serverSource, /\["aninda", "rohit"\]/);
  assert.match(serverSource, /\["dheeraj", "rohit"\]/);
  assert.doesNotMatch(clientSource, /dheeraj.*rohit|aninda.*rohit|privateBalanceRatings/i);
  assert.doesNotMatch(websiteRouteSource, /batting:|bowling:|fielding:|prohibitedPairs|aninda|dheeraj|rohit/);
  assert.doesNotMatch(appSyncRouteSource, /batting:|bowling:|fielding:|prohibitedPairs|aninda|dheeraj|rohit/);
});

test("ten selected players are split five and five", () => {
  const result = balanceWeightedCandidates(tenPlayerPool(), fixedRandom(0.4));

  assert.equal(result.teamAPlayerIds.length, 5);
  assert.equal(result.teamBPlayerIds.length, 5);
});

test("every selected player appears exactly once and unselected players never appear", () => {
  const selectedCandidates = tenPlayerPool();
  const result = balanceWeightedCandidates(selectedCandidates, fixedRandom(0.2));
  const distributed = allDistributedIds(result);

  assert.equal(distributed.length, new Set(distributed).size);
  assert.deepEqual(distributed.sort(), selectedCandidates.map((candidate) => candidate.playerId).sort());
  assert.equal(distributed.includes("not-selected"), false);
});

test("elite bowlers are distributed as evenly as possible before totals", () => {
  const result = balanceWeightedCandidates(
    candidates([
      ["elite-a", 3, 5, 3],
      ["elite-b", 3, 5, 3],
      ["elite-c", 3, 5, 3],
      ["elite-d", 3, 5, 3],
      ["steady-a", 4, 3, 4],
      ["steady-b", 4, 3, 4],
      ["steady-c", 4, 3, 4],
      ["steady-d", 4, 3, 4]
    ]),
    fixedRandom(0)
  );

  assert.equal(Math.abs(countElite(result.teamAPlayerIds, "elite") - countElite(result.teamBPlayerIds, "elite")), 0);
});

test("elite batters are distributed as evenly as possible", () => {
  const result = balanceWeightedCandidates(
    candidates([
      ["bat-a", 5, 3, 3],
      ["bat-b", 5, 3, 3],
      ["bat-c", 5, 3, 3],
      ["bat-d", 5, 3, 3],
      ["bowl-a", 3, 4, 4],
      ["bowl-b", 3, 4, 4],
      ["bowl-c", 3, 4, 4],
      ["bowl-d", 3, 4, 4]
    ]),
    fixedRandom(0)
  );

  assert.equal(Math.abs(countElite(result.teamAPlayerIds, "bat") - countElite(result.teamBPlayerIds, "bat")), 0);
});

test("batting bowling and fielding dimensions are all considered", () => {
  const selectedCandidates = candidates([
    ["bat-heavy", 5, 2, 2],
    ["bowl-heavy", 2, 5, 2],
    ["field-heavy", 2, 2, 5],
    ["balanced", 3, 3, 3]
  ]);
  const result = balanceWeightedCandidates(selectedCandidates, fixedRandom(0));
  const score = scoreResult(result, selectedCandidates);

  assert.deepEqual(score, findBestScore(selectedCandidates));
});

test("automatic balancing preserves private hard constraints", () => {
  const selectedCandidates = candidates([
    ["aninda", 3, 4, 2],
    ["rohit", 4, 5, 4],
    ["dheeraj", 5, 4, 4],
    ["dipanjan", 4, 3, 5],
    ["soman", 4, 3, 4],
    ["arunabha", 3, 5, 4],
    ["utpal", 3, 3, 3],
    ["jogindar", 3, 3, 4]
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

test("tied optimal candidates can yield alternative balanced teams with injected RNG", () => {
  const equalCandidates = candidates([
    ["a", 3, 3, 3],
    ["b", 3, 3, 3],
    ["c", 3, 3, 3],
    ["d", 3, 3, 3]
  ]);
  const first = balanceWeightedCandidates(equalCandidates, fixedRandom(0));
  const last = balanceWeightedCandidates(equalCandidates, fixedRandom(0.99));

  assert.notDeepEqual(first, last);
  assertResultIsOptimal(first, equalCandidates);
  assertResultIsOptimal(last, equalCandidates);
});

test("unknown duplicate odd and Shared validation are rejected safely", () => {
  const eligible = new Set(["a", "b", "c", "d", "s"]);

  assert.deepEqual(validateTeamBalanceRequest(["a", "missing"], null, eligible), {
    error: "Selected players must be active roster players."
  });
  assert.deepEqual(validateTeamBalanceRequest(["a", "a"], null, eligible), {
    error: "Each selected player can appear only once."
  });
  assert.deepEqual(validateTeamBalanceRequest(["a", "b", "c"], null, eligible), {
    error: "Select one Shared Player to balance an odd group."
  });
  assert.deepEqual(validateTeamBalanceRequest(["a", "b", "c", "d"], "a", eligible), {
    error:
      "Shared Player is only available for odd attendance. Remove Shared Player or select an odd group."
  });
  assert.deepEqual(validateTeamBalanceRequest(["a", "b", "c"], "s", eligible), {
    error: "Shared Player must be selected for this match."
  });
});

test("eleven selected with Shared balances five and five and excludes Shared from exclusive teams", () => {
  const selected = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "s"];
  const validation = validateTeamBalanceRequest(selected, "s", new Set(selected));

  assert.deepEqual(validation, {
    distributablePlayerIds: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"],
    sharedPlayerId: "s"
  });
  assert.equal(getDistributablePlayerIds(selected, "s").includes("s"), false);
});

test("Shared Player selection stays unrestricted and outside exclusive balancing", () => {
  const availablePlayerIds = ["aninda", "rohit", "dheeraj", "utpal", "jogindar"];
  const distributablePlayerIds = getDistributablePlayerIds(availablePlayerIds, "rohit");
  const balancedExclusiveTeams = balanceWeightedCandidates(
    candidates([
      ["aninda", 3, 4, 2],
      ["dheeraj", 5, 4, 4],
      ["utpal", 3, 3, 3],
      ["jogindar", 3, 3, 4]
    ]),
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

test("no valid automatic solution returns null from the strict search", () => {
  const impossibleCandidates = candidates([
    ["a", 3, 3, 3],
    ["b", 3, 3, 3],
    ["c", 3, 3, 3],
    ["d", 3, 3, 3]
  ]);

  assert.equal(
    tryBalanceWeightedCandidates(impossibleCandidates, fixedRandom(0), {
      prohibitedPairs: [
        ["a", "b"],
        ["a", "c"],
        ["a", "d"],
        ["b", "c"],
        ["b", "d"],
        ["c", "d"]
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
    /rohit|aninda|dheeraj|weight|tier|strength|separation|prohibited|batting|bowling|fielding/i
  );
});

test("automatic response shape does not include private ratings or scores", () => {
  const result = balanceWeightedCandidates(candidates([
    ["aninda", 3, 4, 2],
    ["utpal", 3, 3, 3],
    ["biplab", 3, 3, 3],
    ["debraj", 2, 2, 2]
  ]));

  assert.equal("batting" in result, false);
  assert.equal("bowling" in result, false);
  assert.equal("fielding" in result, false);
  assert.equal("score" in result, false);
  assert.equal("prohibitedPairs" in result, false);
  assert.equal(
    allDistributedIds(result).some((playerId) => typeof playerId !== "string"),
    false
  );
});

function tenPlayerPool(): BalanceCandidate[] {
  return candidates([
    ["a", 5, 3, 3],
    ["b", 5, 3, 3],
    ["c", 4, 5, 4],
    ["d", 4, 5, 4],
    ["e", 3, 4, 5],
    ["f", 3, 4, 5],
    ["g", 3, 3, 3],
    ["h", 3, 3, 3],
    ["i", 2, 2, 2],
    ["j", 2, 2, 2]
  ]);
}

function candidates(
  rows: Array<[string, BalanceCandidate["batting"], BalanceCandidate["bowling"], BalanceCandidate["fielding"]]>
): BalanceCandidate[] {
  return rows.map(([playerId, batting, bowling, fielding]) => ({
    playerId,
    batting,
    bowling,
    fielding
  }));
}

function allDistributedIds(result: BalancedTeams): string[] {
  return [...result.teamAPlayerIds, ...result.teamBPlayerIds];
}

function countElite(playerIds: string[], prefix: string) {
  return playerIds.filter((playerId) => playerId.startsWith(prefix)).length;
}

function assertSeparated(result: BalancedTeams, leftPlayerId: string, rightPlayerId: string) {
  const teams = [new Set(result.teamAPlayerIds), new Set(result.teamBPlayerIds)];

  assert.equal(
    teams.some((team) => team.has(leftPlayerId) && team.has(rightPlayerId)),
    false
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
  let bestScore: number[] | null = null;

  for (const teamA of combinations(selectedCandidates, selectedCandidates.length / 2)) {
    const teamAIds = new Set(teamA.map((candidate) => candidate.playerId));
    const teamB = selectedCandidates.filter(
      (candidate) => !teamAIds.has(candidate.playerId)
    );

    if (containsProhibitedPair(teamA, options.prohibitedPairs)) continue;
    if (containsProhibitedPair(teamB, options.prohibitedPairs)) continue;

    const score = scoreTeams(teamA, teamB);

    if (!bestScore || compareScores(score, bestScore) < 0) {
      bestScore = score;
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
  const batDiff = Math.abs(total(teamA, "batting") - total(teamB, "batting"));
  const bowlDiff = Math.abs(total(teamA, "bowling") - total(teamB, "bowling"));
  const fieldDiff = Math.abs(total(teamA, "fielding") - total(teamB, "fielding"));

  return [
    Math.abs(countRating(teamA, "bowling", 5) - countRating(teamB, "bowling", 5)),
    Math.abs(countRating(teamA, "batting", 5) - countRating(teamB, "batting", 5)),
    Math.abs(countAtLeast(teamA, "bowling", 4) - countAtLeast(teamB, "bowling", 4)),
    Math.abs(countAtLeast(teamA, "batting", 4) - countAtLeast(teamB, "batting", 4)),
    batDiff * 40 + bowlDiff * 40 + fieldDiff * 20,
    Math.abs(overall(teamA) - overall(teamB)),
    batDiff,
    bowlDiff,
    fieldDiff
  ];
}

function combinations<T>(items: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (size > items.length || !Number.isInteger(size)) return [];

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

function total(
  team: BalanceCandidate[],
  skill: "batting" | "bowling" | "fielding"
) {
  return team.reduce((sum, candidate) => sum + candidate[skill], 0);
}

function overall(team: BalanceCandidate[]) {
  return team.reduce(
    (sum, candidate) => sum + candidate.batting + candidate.bowling + candidate.fielding,
    0
  );
}

function countRating(
  team: BalanceCandidate[],
  skill: "batting" | "bowling" | "fielding",
  rating: BalanceCandidate["batting"]
) {
  return team.filter((candidate) => candidate[skill] === rating).length;
}

function countAtLeast(
  team: BalanceCandidate[],
  skill: "batting" | "bowling" | "fielding",
  rating: BalanceCandidate["batting"]
) {
  return team.filter((candidate) => candidate[skill] >= rating).length;
}

function fixedRandom(value: number) {
  return () => value;
}
