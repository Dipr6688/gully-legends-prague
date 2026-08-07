"use client";

import { PlayerGrid } from "@/components/players/PlayerGrid";
import { useCareerPlayers } from "@/components/players/useCareerPlayers";
import type { Player } from "@/lib/types/player";

export function CareerPlayerGrid({
  players,
  careerResolved = false
}: {
  players: Player[];
  careerResolved?: boolean;
}) {
  const localCareerPlayers = useCareerPlayers(players);
  const careerPlayers = careerResolved ? players : localCareerPlayers;

  return <PlayerGrid players={careerPlayers} />;
}
