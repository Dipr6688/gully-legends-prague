import "server-only";

import { activePlayers } from "@/lib/data/players";
import { applySharedPlayerToRosters, getDistributablePlayerIds } from "@/lib/match-records";
import {
  balanceWeightedCandidates,
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
  utpal: 2,
  biplab: 2,
  jogindar: 2,
  badhan: 2,
  madhab: 2,
  saurav: 1,
  debraj: 1,
  atripan: 1,
  gaurav: 1
};

const canonicalPlayerIds = new Set(activePlayers.map((player) => player.id));

export function balanceTeams(
  availablePlayerIds: string[],
  sharedPlayerId: string | null = null
): BalancedTeams & { sharedPlayerId: string | null } {
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

  const balancedTeams = balanceWeightedCandidates(candidates);

  return applySharedPlayerToRosters({
    ...balancedTeams,
    sharedPlayerId:
      sharedPlayerId && canonicalPlayerIds.has(sharedPlayerId) ? sharedPlayerId : null
  });
}
