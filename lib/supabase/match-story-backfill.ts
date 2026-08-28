import {
  MATCH_STORY_RECENT_LIMIT,
  buildMatchStory,
  getMatchStoryBackfillCandidates,
  isEligibleForMatchStory,
  type MatchStoryDraft
} from "../match-story";
import type { MatchRecord, MatchStory } from "../types/match";

export type MatchStoryBackfillFailure = {
  matchId: string;
  matchName: string;
  reason: string;
};

export type MatchStoryBackfillSummary = {
  eligible: number;
  generated: number;
  skipped: number;
  failed: number;
  failures: MatchStoryBackfillFailure[];
};

type MatchStoryWriter = {
  createStoryIfAbsent(story: MatchStoryDraft): Promise<void>;
};

function getBackfillMatchNumber(match: MatchRecord): number {
  return match.matchNumber ?? Number.MAX_SAFE_INTEGER;
}

export function sortMatchStoryBackfillMatches(matches: MatchRecord[]): MatchRecord[] {
  return [...matches].sort((left, right) => {
    if (left.matchDate !== right.matchDate) {
      return left.matchDate.localeCompare(right.matchDate);
    }

    const leftNumber = getBackfillMatchNumber(left);
    const rightNumber = getBackfillMatchNumber(right);

    if (leftNumber !== rightNumber) return leftNumber - rightNumber;

    return left.id.localeCompare(right.id);
  });
}

function storedStoryFromDraft(story: MatchStoryDraft): MatchStory {
  return {
    ...story,
    generatedAt: null,
    createdAt: null,
    updatedAt: null
  };
}

function getFailureReason(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Match Story backfill error";
}

export async function backfillHistoricalMatchStories({
  matches,
  recentStories,
  repository
}: {
  matches: MatchRecord[];
  recentStories: MatchStory[];
  repository: MatchStoryWriter;
}): Promise<MatchStoryBackfillSummary> {
  const eligibleMatches = matches.filter(isEligibleForMatchStory);
  const candidates = sortMatchStoryBackfillMatches(
    getMatchStoryBackfillCandidates(eligibleMatches)
  );
  const failures: MatchStoryBackfillFailure[] = [];
  let generated = 0;
  let skipped = eligibleMatches.length - candidates.length;
  let rollingRecentStories = recentStories.slice(0, MATCH_STORY_RECENT_LIMIT);

  for (const match of candidates) {
    try {
      const story = buildMatchStory({ match, recentStories: rollingRecentStories });

      if (!story) {
        skipped += 1;
        continue;
      }

      await repository.createStoryIfAbsent(story);
      generated += 1;
      rollingRecentStories = [
        storedStoryFromDraft(story),
        ...rollingRecentStories
      ].slice(0, MATCH_STORY_RECENT_LIMIT);
    } catch (error) {
      failures.push({
        matchId: match.id,
        matchName: match.matchName,
        reason: getFailureReason(error)
      });
    }
  }

  return {
    eligible: eligibleMatches.length,
    generated,
    skipped,
    failed: failures.length,
    failures
  };
}
