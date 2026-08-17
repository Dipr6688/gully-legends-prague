"use client";

import { PlayerProfile } from "@/components/players/PlayerProfile";
import { useMatchRepository } from "@/components/matches/useMatchRepository";
import { useCareerPlayers } from "@/components/players/useCareerPlayers";
import { getAdvancedCareerStatsForPlayer } from "@/lib/advanced-cricket-stats";
import type { MatchRecord } from "@/lib/types/match";
import type { Player } from "@/lib/types/player";

export function CareerPlayerProfile({
  player,
  players,
  matches: suppliedMatches,
  careerResolved = false
}: {
  player: Player;
  players: Player[];
  matches?: MatchRecord[];
  careerResolved?: boolean;
}) {
  const localCareerPlayers = useCareerPlayers(players);
  const localRepository = useMatchRepository();
  const careerPlayers = careerResolved ? players : localCareerPlayers;
  const matches = suppliedMatches ?? localRepository.matches;
  const careerPlayer =
    careerPlayers.find((candidate) => candidate.id === player.id) ?? player;
  const advancedStats = getAdvancedCareerStatsForPlayer({
    matches,
    playerId: careerPlayer.id
  });

  return <PlayerProfile player={careerPlayer} advancedStats={advancedStats} />;
}
