"use client";

import { PlayerGrid } from "@/components/players/PlayerGrid";
import { useCareerPlayers } from "@/components/players/useCareerPlayers";
import type { Player } from "@/lib/types/player";

export function CareerPlayerGrid({ players }: { players: Player[] }) {
  const careerPlayers = useCareerPlayers(players);

  return <PlayerGrid players={careerPlayers} />;
}
