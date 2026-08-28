import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { isAdminWithClient } from "@/lib/admin/auth";
import { validateSupabaseMatchPayload } from "@/lib/admin/supabase-data-check";
import { backfillHistoricalMatchStories } from "@/lib/supabase/match-story-backfill";
import { SupabaseMatchStoryRepository } from "@/lib/supabase/match-story-repository";
import {
  SupabaseMatchRepository,
  type SupabaseMatchRow
} from "@/lib/supabase/read-repositories";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MatchRecord, MatchStory } from "@/lib/types/match";

function matchRecordFromRow(
  row: SupabaseMatchRow,
  storyByMatchId: Map<string, MatchStory>
): MatchRecord | null {
  const result = validateSupabaseMatchPayload(row);

  if (!result.match || result.issues.length > 0) return null;

  return {
    ...result.match,
    isDemo: row.is_demo,
    isDemoTestMatch: row.is_demo && result.match.isDemoTestMatch === true,
    supabaseUpdatedAt: row.updated_at,
    matchNumber: row.match_sequence ?? result.match.matchNumber ?? null,
    deletedAt: row.deleted_at ?? result.match.deletedAt ?? null,
    matchStory: storyByMatchId.get(row.id) ?? null
  };
}

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user || !(await isAdminWithClient(supabase))) {
    return NextResponse.json(
      { ok: false, code: "not_admin", message: "ADMIN ACCESS REQUIRED" },
      { status: 403 }
    );
  }

  try {
    const matchRepository = new SupabaseMatchRepository(supabase);
    const storyRepository = new SupabaseMatchStoryRepository(supabase);
    const [matchRows, existingStories] = await Promise.all([
      matchRepository.getMatches(),
      storyRepository.getStories()
    ]);
    const storyByMatchId = new Map(
      existingStories.map((story) => [story.matchId, story])
    );
    const matches = matchRows.flatMap((row) => {
      const match = matchRecordFromRow(row, storyByMatchId);

      return match ? [match] : [];
    });
    const summary = await backfillHistoricalMatchStories({
      matches,
      recentStories: existingStories,
      repository: storyRepository
    });

    revalidatePath("/match-diary");
    revalidatePath("/matches");

    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: "backfill_failed",
        message:
          error instanceof Error
            ? error.message
            : "COULD NOT GENERATE HISTORICAL MATCH STORIES"
      },
      { status: 500 }
    );
  }
}
