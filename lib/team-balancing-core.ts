export type BalanceCandidate = {
  playerId: string;
  balanceWeight: 0 | 1 | 2 | 3;
};

export type BalancedTeams = {
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
};

export type BalanceConstraintOptions = {
  prohibitedPairs?: ReadonlyArray<readonly [string, string]>;
};

export function balanceWeightedCandidates(
  candidates: BalanceCandidate[],
  random: () => number = Math.random,
  options: BalanceConstraintOptions = {}
): BalancedTeams {
  return (
    tryBalanceWeightedCandidates(candidates, random, options) ?? {
      teamAPlayerIds: [],
      teamBPlayerIds: []
    }
  );
}

export function tryBalanceWeightedCandidates(
  candidates: BalanceCandidate[],
  random: () => number = Math.random,
  options: BalanceConstraintOptions = {}
): BalancedTeams | null {
  const uniqueCandidates = Array.from(
    new Map(candidates.map((candidate) => [candidate.playerId, candidate])).values()
  );
  const teamASizes = Array.from(
    new Set([
      Math.floor(uniqueCandidates.length / 2),
      Math.ceil(uniqueCandidates.length / 2)
    ])
  );
  const bestCandidates: Array<BalancedTeams & { score: number[] }> = [];
  let bestScore: number[] | null = null;

  for (const teamASize of teamASizes) {
    for (const teamA of combinations(uniqueCandidates, teamASize)) {
      const teamAIds = new Set(teamA.map((candidate) => candidate.playerId));
      const teamB = uniqueCandidates.filter(
        (candidate) => !teamAIds.has(candidate.playerId)
      );

      if (violatesProhibitedPairs(teamA, options.prohibitedPairs)) continue;
      if (violatesProhibitedPairs(teamB, options.prohibitedPairs)) continue;

      const score = scoreCandidate(teamA, teamB);

      if (!bestScore || compareScore(score, bestScore) < 0) {
        bestScore = score;
        bestCandidates.length = 0;
      }

      if (bestScore && compareScore(score, bestScore) === 0) {
        bestCandidates.push({
          teamAPlayerIds: teamA.map((candidate) => candidate.playerId),
          teamBPlayerIds: teamB.map((candidate) => candidate.playerId),
          score
        });
      }
    }
  }

  if (bestCandidates.length === 0) return null;

  const selectedCandidate =
    bestCandidates[Math.floor(random() * bestCandidates.length)] ?? bestCandidates[0];

  return {
    teamAPlayerIds: selectedCandidate.teamAPlayerIds,
    teamBPlayerIds: selectedCandidate.teamBPlayerIds
  };
}

export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
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

function violatesProhibitedPairs(
  candidates: BalanceCandidate[],
  prohibitedPairs: BalanceConstraintOptions["prohibitedPairs"] = []
) {
  const playerIds = new Set(candidates.map((candidate) => candidate.playerId));

  return prohibitedPairs.some(
    ([leftPlayerId, rightPlayerId]) =>
      playerIds.has(leftPlayerId) && playerIds.has(rightPlayerId)
  );
}

function scoreCandidate(teamA: BalanceCandidate[], teamB: BalanceCandidate[]) {
  return [
    Math.abs(totalWeight(teamA) - totalWeight(teamB)),
    Math.abs(countWeight(teamA, 3) - countWeight(teamB, 3)),
    Math.abs(countWeight(teamA, 2) - countWeight(teamB, 2)),
    Math.abs(countWeight(teamA, 1) - countWeight(teamB, 1)),
    Math.abs(countWeight(teamA, 0) - countWeight(teamB, 0))
  ];
}

function compareScore(left: number[], right: number[]) {
  for (let index = 0; index < left.length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);

    if (difference !== 0) return difference;
  }

  return 0;
}

function totalWeight(candidates: BalanceCandidate[]) {
  return candidates.reduce((total, candidate) => total + candidate.balanceWeight, 0);
}

function countWeight(
  candidates: BalanceCandidate[],
  weight: BalanceCandidate["balanceWeight"]
) {
  return candidates.filter((candidate) => candidate.balanceWeight === weight).length;
}
