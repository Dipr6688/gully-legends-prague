import "server-only";

import { activePlayers } from "@/lib/data/players";
import { applySharedPlayerToRosters } from "@/lib/match-records";
import { validateTeamBalanceRequest } from "@/lib/team-balance-request";
import {
  tryBalanceWeightedCandidates,
  type BalancedTeams,
  type BalanceCandidate
} from "@/lib/team-balancing-core";

type TeamBalanceSuccess = BalancedTeams & { sharedPlayerId: string | null };
type TeamBalanceResult = TeamBalanceSuccess | { error: string };

const privateBalanceRatings: Record<string, Omit<BalanceCandidate, "playerId">> = {
  dipanjan: { batting: 4, bowling: 3, fielding: 5 },
  dipayan: { batting: 4, bowling: 5, fielding: 4 },
  amrit: { batting: 3, bowling: 5, fielding: 4 },
  aninda: { batting: 3, bowling: 4, fielding: 2 },
  arunabha: { batting: 3, bowling: 5, fielding: 4 },
  atripan: { batting: 3, bowling: 3, fielding: 3 },
  badhan: { batting: 4, bowling: 3, fielding: 4 },
  biplab: { batting: 3, bowling: 3, fielding: 3 },
  chaitanya: { batting: 4, bowling: 3, fielding: 4 },
  debraj: { batting: 2, bowling: 2, fielding: 2 },
  dheeraj: { batting: 5, bowling: 4, fielding: 4 },
  gaurav: { batting: 2, bowling: 3, fielding: 2 },
  jogindar: { batting: 3, bowling: 3, fielding: 4 },
  madhab: { batting: 3, bowling: 4, fielding: 3 },
  naim: { batting: 5, bowling: 4, fielding: 4 },
  pritvi: { batting: 3, bowling: 3, fielding: 3 },
  rohit: { batting: 4, bowling: 5, fielding: 4 },
  saurav: { batting: 3, bowling: 3, fielding: 4 },
  soman: { batting: 4, bowling: 3, fielding: 4 },
  suprateem: { batting: 3, bowling: 3, fielding: 3 },
  utpal: { batting: 3, bowling: 3, fielding: 3 }
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
  sharedPlayerId: string | null = null,
  random: () => number = Math.random
): TeamBalanceResult {
  const exclusiveResult = balanceExclusiveTeams(availablePlayerIds, sharedPlayerId, random);

  if ("error" in exclusiveResult) {
    return exclusiveResult;
  }

  return applySharedPlayerToRosters(exclusiveResult);
}

export function balanceExclusiveTeams(
  selectedPlayerIds: string[],
  sharedPlayerId: string | null = null,
  random: () => number = Math.random
): TeamBalanceResult {
  const validation = validateBalanceRequest(selectedPlayerIds, sharedPlayerId);

  if ("error" in validation) {
    return validation;
  }

  const candidates = validation.distributablePlayerIds.map((playerId) => ({
    playerId,
    ...privateBalanceRatings[playerId]
  }));

  const balancedTeams = tryBalanceWeightedCandidates(candidates, random, {
    prohibitedPairs: privateAutomaticSeparationPairs
  });

  if (!balancedTeams) {
    return { error: noValidAutomaticSolutionMessage };
  }

  return {
    ...balancedTeams,
    sharedPlayerId: validation.sharedPlayerId
  };
}

function validateBalanceRequest(
  selectedPlayerIds: string[],
  sharedPlayerId: string | null
):
  | { distributablePlayerIds: string[]; sharedPlayerId: string | null }
  | { error: string } {
  return validateTeamBalanceRequest(selectedPlayerIds, sharedPlayerId, canonicalPlayerIds);
}
