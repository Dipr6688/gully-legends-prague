import { getFinalisedMatches } from "./match-repository";
import type { MatchRecord } from "./types/match";
import type { Player } from "./types/player";

export type DashboardSummary = {
  totalFinalisedMatches: number;
  activePlayerCount: number;
  recentFinalisedMatches: MatchRecord[];
};

export function getDashboardSummary({
  matches,
  players
}: {
  matches: MatchRecord[];
  players: Player[];
}): DashboardSummary {
  const finalisedMatches = getFinalisedMatches(matches);
  const activePlayers = players.filter((player) => player.isActive !== false);

  return {
    totalFinalisedMatches: finalisedMatches.length,
    activePlayerCount: activePlayers.length,
    recentFinalisedMatches: finalisedMatches.slice(0, 1)
  };
}
