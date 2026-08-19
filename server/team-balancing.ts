import "server-only";

import { activePlayers } from "@/lib/data/players";
import { applySharedPlayerToRosters, getDistributablePlayerIds } from "@/lib/match-records";
import {
  tryBalanceWeightedCandidates,
  type BalancedTeams,
  type BalanceCandidate
} from "@/lib/team-balancing-core";

const privateBalanceWeights: Record<string, BalanceCandidate["balanceWeight"]> = {
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
};

const privateAutomaticSeparationPairs = [
  ["aninda", "rohit"],
  ["dheeraj", "rohit"]
] as const;

const canonicalPlayerIds = new Set(activePlayers.map((player) => player.id));
const noValidAutomaticSolutionMessage =
  "Could not generate teams with the current selection. Please adjust the players or choose teams manually.";

export function balanceTeams(
  availablePlayerIds: string[],
  sharedPlayerId: string | null = null
): (BalancedTeams & { sharedPlayerId: string | null }) | { error: string } {
  const uniqueAvailablePlayerIds = Array.from(new Set(availablePlayerIds));
  const distributablePlayerIds = getDistributablePlayerIds(
    uniqueAvailablePlayerIds,
    sharedPlayerId
  );
  const candidates = distributablePlayerIds
    .filter((playerId) => canonicalPlayerIds.has(playerId))
    .map((playerId) => ({
      playerId,
      balanceWeight: privateBalanceWeights[playerId] ?? 2
    }));

  const balancedTeams = tryBalanceWeightedCandidates(candidates, Math.random, {
    prohibitedPairs: privateAutomaticSeparationPairs
  });

  if (!balancedTeams) {
    return { error: noValidAutomaticSolutionMessage };
  }

  return applySharedPlayerToRosters({
    ...balancedTeams,
    sharedPlayerId:
      sharedPlayerId && canonicalPlayerIds.has(sharedPlayerId) ? sharedPlayerId : null
  });
}
