import { MatchScorecard } from "@/components/matches/MatchScorecard";
import { Card } from "@/components/ui/Card";
import { isSupabaseDataSource } from "@/lib/data-source";
import { loadPublicSupabaseReadData } from "@/lib/supabase/public-read-data";

export const dynamic = "force-dynamic";
export const revalidate = 30;

export default async function MatchScorecardPage({
  params
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  const supabaseMode = isSupabaseDataSource();
  const data = supabaseMode ? await loadPublicSupabaseReadData().catch(() => null) : null;

  if (supabaseMode && !data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 lg:px-6">
        <Card>
          <p className="text-xs font-black uppercase text-neon-cyan">Shared scorecard unavailable</p>
          <h1 className="font-display text-5xl uppercase comic-title">Try Again Soon</h1>
          <p className="mt-3 text-stone-300">
            We could not load the shared Supabase scorecard data. Please refresh the page.
          </p>
        </Card>
      </div>
    );
  }

  const match = data?.matches.find((candidate) => candidate.id === matchId) ?? null;

  return (
    <MatchScorecard
      matchId={matchId}
      initialMatch={supabaseMode ? match : undefined}
      players={data?.careerPlayers}
      matches={data?.matches}
    />
  );
}
