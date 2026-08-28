import { MATCH_STORY_RECENT_LIMIT, buildMatchStory } from "@/lib/match-story";
import { SupabaseMatchStoryRepository } from "@/lib/supabase/match-story-repository";
import type { MatchRecord } from "@/lib/types/match";

export async function createMatchStoryAfterOfficialFinalisation({
  repository,
  match
}: {
  repository: SupabaseMatchStoryRepository;
  match: MatchRecord;
}): Promise<void> {
  const recentStories = await repository.getRecentStories(MATCH_STORY_RECENT_LIMIT);
  const story = buildMatchStory({ match, recentStories });

  if (!story) return;

  await repository.createStoryIfAbsent(story);
}

export async function safelyCreateMatchStoryAfterOfficialFinalisation({
  repository,
  match
}: {
  repository: SupabaseMatchStoryRepository;
  match: MatchRecord;
}): Promise<void> {
  try {
    await createMatchStoryAfterOfficialFinalisation({ repository, match });
  } catch (error) {
    console.error("Match story generation failed after official finalisation.", error);
  }
}
