import type { Player } from "@/lib/types/player";
import { PlayerCard } from "@/components/players/PlayerCard";

export function PlayerGrid({ players }: { players: Player[] }) {
  return (
    <div className="players-carousel" aria-label="Player cards carousel">
      {players.map((player, index) => (
        <PlayerCard key={player.id} player={player} priority={index < 4} />
      ))}
    </div>
  );
}
