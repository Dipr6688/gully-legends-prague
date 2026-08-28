import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatchStory } from "@/lib/types/match";
import type { MatchStoryDraft } from "@/lib/match-story";

type SupabaseErrorLike = {
  message: string;
};

export type SupabaseMatchStoryRow = {
  match_id: string;
  title: string;
  story_text: string;
  story_version: number;
  story_style: string;
  story_signature: string;
  generated_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const MATCH_STORY_COLUMNS = [
  "match_id",
  "title",
  "story_text",
  "story_version",
  "story_style",
  "story_signature",
  "generated_at",
  "created_at",
  "updated_at"
].join(", ");

export function matchStoryFromSupabaseRow(row: SupabaseMatchStoryRow): MatchStory {
  return {
    matchId: row.match_id,
    title: row.title,
    storyText: row.story_text,
    storyVersion: row.story_version,
    storyStyle: row.story_style,
    storySignature: row.story_signature,
    generatedAt: row.generated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toInsertRow(story: MatchStoryDraft) {
  return {
    match_id: story.matchId,
    title: story.title,
    story_text: story.storyText,
    story_version: story.storyVersion,
    story_style: story.storyStyle,
    story_signature: story.storySignature
  };
}

export class SupabaseMatchStoryRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getStories(): Promise<MatchStory[]> {
    const { data, error } = (await this.client
      .from("match_stories")
      .select(MATCH_STORY_COLUMNS)
      .order("generated_at", { ascending: false })) as unknown as {
      data: SupabaseMatchStoryRow[] | null;
      error: SupabaseErrorLike | null;
    };

    if (error) throw new Error(error.message);

    return (data ?? []).map(matchStoryFromSupabaseRow);
  }

  async getRecentStories(limit: number): Promise<MatchStory[]> {
    const { data, error } = (await this.client
      .from("match_stories")
      .select(MATCH_STORY_COLUMNS)
      .order("generated_at", { ascending: false })
      .limit(limit)) as unknown as {
      data: SupabaseMatchStoryRow[] | null;
      error: SupabaseErrorLike | null;
    };

    if (error) throw new Error(error.message);

    return (data ?? []).map(matchStoryFromSupabaseRow);
  }

  async createStoryIfAbsent(story: MatchStoryDraft): Promise<void> {
    const { error } = (await this.client.from("match_stories").upsert(toInsertRow(story), {
      onConflict: "match_id",
      ignoreDuplicates: true
    })) as unknown as {
      error: SupabaseErrorLike | null;
    };

    if (error) throw new Error(error.message);
  }
}
