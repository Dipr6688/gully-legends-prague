"use client";

import { PlayerProfile } from "@/components/players/PlayerProfile";
import { useCareerPlayers } from "@/components/players/useCareerPlayers";
import type { Player } from "@/lib/types/player";

export function CareerPlayerProfile({
  player,
  players
}: {
  player: Player;
  players: Player[];
}) {
  const careerPlayers = useCareerPlayers(players);
  const careerPlayer =
    careerPlayers.find((candidate) => candidate.id === player.id) ?? player;

  return <PlayerProfile player={careerPlayer} />;
}
