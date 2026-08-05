import { PlayerGrid } from "@/components/players/PlayerGrid";
import { Card } from "@/components/ui/Card";
import { players } from "@/lib/data/players";

export default function PlayersPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-6">
      <Card className="mb-5">
        <p className="text-xs font-black uppercase text-neon-cyan">Squad</p>
        <h1 className="font-display text-5xl uppercase comic-title">
          Gully Legends Players
        </h1>
        <p className="mt-3 max-w-3xl text-stone-300">
          The full approved roster is loaded from typed local mock data. Everyone
          starts at Level 0 with batting, bowling, and fielding ratings at 0/100.
        </p>
      </Card>
      <PlayerGrid players={players} />
    </div>
  );
}
