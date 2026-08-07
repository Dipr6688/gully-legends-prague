"use client";

import { PlayerProfile } from "@/components/players/PlayerProfile";
import { useCareerPlayers } from "@/components/players/useCareerPlayers";
import type { Player } from "@/lib/types/player";

export function CareerPlayerProfile({
  player,
  players,
  careerResolved = false
}: {
  player: Player;
  players: Player[];
  careerResolved?: boolean;
}) {
  const localCareerPlayers = useCareerPlayers(players);
  const careerPlayers = careerResolved ? players : localCareerPlayers;
  const careerPlayer =
    careerPlayers.find((candidate) => candidate.id === player.id) ?? player;

  return <PlayerProfile player={careerPlayer} />;
}
