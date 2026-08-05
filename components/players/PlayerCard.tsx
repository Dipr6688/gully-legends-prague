import Image from "next/image";
import Link from "next/link";
import type { Player } from "@/lib/types/player";
import { cn } from "@/lib/utils";
import { RatingBar } from "@/components/players/RatingBar";

const accentGlow = {
  green: "shadow-green-glow",
  orange: "shadow-[0_0_18px_rgb(255_122_48_/_0.28)]",
  yellow: "shadow-glow",
  violet: "shadow-[0_0_18px_rgb(183_92_255_/_0.28)]"
};

export function PlayerCard({
  player,
  priority = false
}: {
  player: Player;
  priority?: boolean;
}) {
  return (
    <Link
      href={`/players/${player.id}`}
      className={cn(
        "player-card group focus:outline-none focus:ring-2 focus:ring-neon-cyan focus:ring-offset-2 focus:ring-offset-pitch-950",
        accentGlow[player.accent]
      )}
    >
      <div className="player-card-media">
        <Image
          src={player.cardImage}
          alt={`${player.name} - ${player.cardTitle}`}
          fill
          sizes="(max-width: 768px) 82vw, 280px"
          priority={priority}
          className="player-card-image"
        />
        <div className="player-level">
          <span>Level</span>
          <strong>{player.level}</strong>
        </div>
      </div>

      <div className="player-card-info">
        <div className="player-identity">
          <h3>{player.name}</h3>
          <p>{player.role}</p>
        </div>

        <div className="player-ratings">
          <RatingBar label="Batting" value={player.ratings.batting} type="batting" />
          <RatingBar label="Bowling" value={player.ratings.bowling} type="bowling" />
          <RatingBar label="Fielding" value={player.ratings.fielding} type="fielding" />
        </div>
      </div>
    </Link>
  );
}
