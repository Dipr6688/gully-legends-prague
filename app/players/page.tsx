import { CareerPlayerGrid } from "@/components/players/CareerPlayerGrid";
import { Card } from "@/components/ui/Card";
import { activePlayers } from "@/lib/data/players";
import { isSupabaseDataSource } from "@/lib/data-source";
import { loadPublicSupabaseReadData } from "@/lib/supabase/public-read-data";

export const dynamic = "force-dynamic";
export const revalidate = 30;

export default async function PlayersPage() {
  const supabaseMode = isSupabaseDataSource();
  const data = supabaseMode ? await loadPublicSupabaseReadData().catch(() => null) : null;
  const players = data?.careerPlayers ?? activePlayers;

  if (supabaseMode && !data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 lg:px-6">
        <Card>
          <p className="text-xs font-black uppercase text-neon-cyan">Shared squad unavailable</p>
          <h1 className="font-display text-5xl uppercase comic-title">Try Again Soon</h1>
          <p className="mt-3 max-w-3xl text-stone-300">
            We could not load the shared Supabase player data. Please refresh the page.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-6">
      <Card className="mb-5">
        <p className="text-xs font-black uppercase text-neon-cyan">Squad</p>
        <h1 className="font-display text-5xl uppercase comic-title">
          Gully Legends Players
        </h1>
        <p className="mt-3 max-w-3xl text-stone-300">
          {players.length} WARRIORS loaded from the shared Supabase roster.
          Career values come from shared match records.
        </p>
      </Card>
      <CareerPlayerGrid players={players} careerResolved={Boolean(data)} />
    </div>
  );
}
