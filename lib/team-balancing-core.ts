export type BalanceCandidate = {
  playerId: string;
  balanceWeight: 1 | 2 | 3;
};

export type BalancedTeams = {
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
};

type TeamDraft = {
  playerIds: string[];
  totalWeight: number;
  maxSize: number;
};

export function balanceWeightedCandidates(
  candidates: BalanceCandidate[],
  random: () => number = Math.random
): BalancedTeams {
  const uniqueCandidates = Array.from(
    new Map(candidates.map((candidate) => [candidate.playerId, candidate])).values()
  );
  const teamAExtra = random() < 0.5;
  const teamA: TeamDraft = {
    playerIds: [],
    totalWeight: 0,
    maxSize: teamAExtra
      ? Math.ceil(uniqueCandidates.length / 2)
      : Math.floor(uniqueCandidates.length / 2)
  };
  const teamB: TeamDraft = {
    playerIds: [],
    totalWeight: 0,
    maxSize: teamAExtra
      ? Math.floor(uniqueCandidates.length / 2)
      : Math.ceil(uniqueCandidates.length / 2)
  };
  const orderedCandidates = [3, 2, 1].flatMap((weight) =>
    shuffle(
      uniqueCandidates.filter((candidate) => candidate.balanceWeight === weight),
      random
    )
  );

  for (const candidate of orderedCandidates) {
    const targetTeam = chooseTeam(teamA, teamB, random);
    targetTeam.playerIds.push(candidate.playerId);
    targetTeam.totalWeight += candidate.balanceWeight;
  }

  return {
    teamAPlayerIds: teamA.playerIds,
    teamBPlayerIds: teamB.playerIds
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

function chooseTeam(
  teamA: TeamDraft,
  teamB: TeamDraft,
  random: () => number
): TeamDraft {
  const teamAFull = teamA.playerIds.length >= teamA.maxSize;
  const teamBFull = teamB.playerIds.length >= teamB.maxSize;

  if (teamAFull && !teamBFull) return teamB;
  if (teamBFull && !teamAFull) return teamA;
  if (teamA.playerIds.length < teamB.playerIds.length) return teamA;
  if (teamB.playerIds.length < teamA.playerIds.length) return teamB;
  if (teamA.totalWeight < teamB.totalWeight) return teamA;
  if (teamB.totalWeight < teamA.totalWeight) return teamB;

  return random() < 0.5 ? teamA : teamB;
}
