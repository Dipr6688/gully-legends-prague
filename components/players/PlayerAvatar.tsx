import type { Player } from "@/lib/types/player";
import { cn } from "@/lib/utils";

const accentClasses = {
  green: "from-neon-green/45 via-emerald-900 to-black ring-neon-green/70",
  orange: "from-neon-orange/45 via-red-950 to-black ring-neon-orange/70",
  yellow: "from-neon-yellow/45 via-amber-950 to-black ring-neon-yellow/70",
  violet: "from-neon-violet/45 via-purple-950 to-black ring-neon-violet/70"
};

export function PlayerAvatar({
  player,
  size = "card"
}: {
  player: Player;
  size?: "card" | "profile";
}) {
  const initials = player.name.slice(0, 2).toUpperCase();

  const isProfile = size === "profile";

  return (
    <div
      className={cn(
        "relative grid place-items-center overflow-hidden rounded-lg bg-gradient-to-br ring-2",
        accentClasses[player.accent],
        isProfile ? "h-56 min-h-56 w-full" : "aspect-[4/5] w-full"
      )}
      aria-label={`${player.name} stylized avatar`}
      role="img"
    >
      <div className="absolute inset-0 bg-comic-halftone bg-[length:14px_14px] opacity-35" />
      <div className="absolute bottom-0 h-1/3 w-full bg-gradient-to-t from-black/85 to-transparent" />
      <div className="absolute left-1/2 top-12 h-28 w-4 -translate-x-1/2 -rotate-45 rounded-full bg-yellow-100/80 shadow-glow" />
      <div className="absolute left-[18%] top-[18%] h-16 w-16 rounded-full bg-red-600/80 shadow-[0_0_24px_rgb(255_75_56_/_0.55)]" />
      <div className="relative grid h-28 w-28 place-items-center rounded-full border-4 border-white/80 bg-pitch-950/82 text-5xl font-black text-white shadow-2xl sm:h-32 sm:w-32">
        {initials}
      </div>
      <div className="absolute left-3 top-3 rounded-md border border-neon-yellow bg-black/70 px-2 py-1 text-xs font-black uppercase text-neon-yellow">
        Level {player.level}
      </div>
      <div className="absolute bottom-3 left-3 right-3 font-display text-4xl uppercase leading-8 text-white comic-title">
        {player.name}
      </div>
    </div>
  );
}
