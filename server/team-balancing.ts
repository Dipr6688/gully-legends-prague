import "server-only";

import { players } from "@/lib/data/players";
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

const canonicalPlayerIds = new Set(players.map((player) => player.id));

export function balanceTeams(availablePlayerIds: string[]): BalancedTeams {
  const candidates = Array.from(new Set(availablePlayerIds))
    .filter((playerId) => canonicalPlayerIds.has(playerId))
    .map((playerId) => ({
      playerId,
      balanceWeight: privateBalanceWeights[playerId] ?? 1
    }));

  return balanceWeightedCandidates(candidates);
}
