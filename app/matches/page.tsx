import { Plus } from "lucide-react";
import { LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MatchArchive } from "@/components/matches/MatchArchive";
import { TodayFixtures } from "@/components/matches/TodayFixtures";
import { getFinalisedMatches } from "@/lib/match-repository";
import { isSupabaseDataSource } from "@/lib/data-source";
import { loadPublicSupabaseReadData } from "@/lib/supabase/public-read-data";

export const dynamic = "force-dynamic";
export const revalidate = 30;

export default async function MatchesPage({
  searchParams
}: {
  searchParams?: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const supabaseMode = isSupabaseDataSource();
  const data = supabaseMode ? await loadPublicSupabaseReadData().catch(() => null) : null;

  if (supabaseMode && !data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 lg:px-6">
        <Card>
          <p className="text-xs font-black uppercase text-neon-cyan">Shared matches unavailable</p>
          <h1 className="font-display text-5xl uppercase comic-title">Try Again Soon</h1>
          <p className="mt-3 text-stone-300">
            We could not load the shared Supabase match data. Please refresh the page.
          </p>
        </Card>
      </div>
    );
  }

  const matches = data?.matches;
  const finalisedMatches = matches ? getFinalisedMatches(matches) : undefined;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-6">
      <Card>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-black uppercase text-neon-cyan">Archive</p>
            <h1 className="font-display text-5xl uppercase comic-title">Matches</h1>
          </div>
          <LinkButton href="/matches/new">
            <Plus className="h-5 w-5" aria-hidden="true" />
            Create Match
          </LinkButton>
        </div>
        <div className="mt-6 grid gap-5">
          <TodayFixtures dateFilter={params?.date} matches={matches} />
          <MatchArchive finalisedMatches={finalisedMatches} />
        </div>
      </Card>
    </div>
  );
}
