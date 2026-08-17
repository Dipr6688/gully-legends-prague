import { notFound } from "next/navigation";
import { CareerPlayerProfile } from "@/components/players/CareerPlayerProfile";
import { Card } from "@/components/ui/Card";
import { activePlayers, getPlayerBySlug } from "@/lib/data/players";
import { isSupabaseDataSource } from "@/lib/data-source";
import { loadPublicSupabaseReadData } from "@/lib/supabase/public-read-data";

export const dynamic = "force-dynamic";
export const revalidate = 30;

export function generateStaticParams() {
  return activePlayers.map((player) => ({
    playerId: player.slug
  }));
}

export default async function PlayerProfilePage({
  params
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId: playerSlug } = await params;
  const supabaseMode = isSupabaseDataSource();
  const data = supabaseMode ? await loadPublicSupabaseReadData().catch(() => null) : null;

  if (supabaseMode && !data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 lg:px-6">
        <Card>
          <p className="text-xs font-black uppercase text-neon-cyan">Shared player data unavailable</p>
          <h1 className="font-display text-5xl uppercase comic-title">Try Again Soon</h1>
          <p className="mt-3 text-stone-300">
            We could not load the shared Supabase player profile. Please refresh the page.
          </p>
        </Card>
      </div>
    );
  }

  const players = data?.careerPlayers ?? activePlayers;
  const player =
    players.find((candidate) => candidate.slug === playerSlug) ?? getPlayerBySlug(playerSlug);

  if (!player) {
    notFound();
  }

  return (
    <CareerPlayerProfile
      player={player}
      players={players}
      matches={data?.matches}
      careerResolved={Boolean(data)}
    />
  );
}
