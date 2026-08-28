import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { MatchSectionTabs } from "@/components/matches/MatchSectionTabs";
import { formatMatchDisplayDate, getMatchResultHeadline } from "@/lib/match-display";
import { getMatchArchiveGameLabel } from "@/lib/match-archive";
import { getFinalisedMatches } from "@/lib/match-repository";
import { isOfficialCelebrationMatch } from "@/lib/official-match-history";
import { isSupabaseDataSource } from "@/lib/data-source";
import { loadPublicSupabaseReadData } from "@/lib/supabase/public-read-data";
import type { MatchRecord } from "@/lib/types/match";

export const dynamic = "force-dynamic";
export const revalidate = 30;

function sortDiaryMatches(left: MatchRecord, right: MatchRecord): number {
  if (left.matchDate !== right.matchDate) {
    return right.matchDate.localeCompare(left.matchDate);
  }

  const leftNumber = left.matchNumber ?? Number.MAX_SAFE_INTEGER;
  const rightNumber = right.matchNumber ?? Number.MAX_SAFE_INTEGER;

  if (leftNumber !== rightNumber) return rightNumber - leftNumber;

  return right.id.localeCompare(left.id);
}

export default async function MatchDiaryPage() {
  const supabaseMode = isSupabaseDataSource();
  const data = supabaseMode ? await loadPublicSupabaseReadData().catch(() => null) : null;

  if (supabaseMode && !data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 lg:px-6">
        <Card>
          <p className="text-xs font-black uppercase text-neon-cyan">Match Diary</p>
          <h1 className="font-display text-5xl uppercase comic-title">Try Again Soon</h1>
          <p className="mt-3 text-stone-300">
            We could not load the shared Supabase match stories. Please refresh the page.
          </p>
        </Card>
      </div>
    );
  }

  const matchesWithStories = data?.matches
    ? getFinalisedMatches(data.matches)
        .filter((match) => isOfficialCelebrationMatch(match) && match.matchStory)
        .sort(sortDiaryMatches)
    : [];

  return (
    <main className="match-diary-page mx-auto max-w-5xl px-4 py-8 lg:px-6">
      <Card className="match-diary-hero">
        <p className="text-xs font-black uppercase text-neon-cyan">Memory Book</p>
        <h1 className="font-display text-5xl uppercase comic-title">Match Diary</h1>
        <p>
          Short official stories from finalised Gully Legends matches, kept for the
          memory rather than the scoreboard noise.
        </p>
        <MatchSectionTabs active="diary" />
      </Card>

      {matchesWithStories.length === 0 ? (
        <EmptyState title="THE DIARY IS WAITING FOR ITS FIRST STORY">
          Official Match Stories will appear here automatically after matches are
          finalised.
        </EmptyState>
      ) : (
        <section className="match-diary-list" aria-label="Match stories">
          {matchesWithStories.map((match) => (
            <article key={match.id} className="match-diary-entry">
              <div className="match-diary-entry-header">
                <div>
                  <span>
                    {formatMatchDisplayDate(match.matchDate)} ·{" "}
                    {getMatchArchiveGameLabel(match)}
                  </span>
                  <h2>{match.matchStory?.title}</h2>
                </div>
              </div>
              <p>{match.matchStory?.storyText}</p>
              <div className="match-diary-entry-footer">
                <span>{getMatchResultHeadline(match)}</span>
                <Link href={`/matches/${match.id}`}>
                  View Match
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
