import type { MatchRecord } from "./types/match";

export const MATCH_HISTORY_STORAGE_KEY = "gully-legends-prague-matches-v1";
export const MATCH_HISTORY_UPDATED_EVENT = "gully-legends-match-history-updated";

export function loadMatchHistory(): MatchRecord[] {
  if (typeof window === "undefined") return [];

  try {
    const rawMatches = window.localStorage.getItem(MATCH_HISTORY_STORAGE_KEY);
    if (!rawMatches) return [];

    const parsed = JSON.parse(rawMatches);

    return Array.isArray(parsed) ? (parsed as MatchRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveMatchHistory(matches: MatchRecord[]) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(MATCH_HISTORY_STORAGE_KEY, JSON.stringify(matches));
  window.dispatchEvent(new Event(MATCH_HISTORY_UPDATED_EVENT));
}

export function saveFinalisedMatchToHistory(match: MatchRecord): MatchRecord[] {
  if (match.status !== "finalised" || match.result.type === "no_result") {
    return loadMatchHistory();
  }

  const currentMatches = loadMatchHistory();
  const nextMatches = [
    match,
    ...currentMatches.filter((storedMatch) => storedMatch.id !== match.id)
  ];

  saveMatchHistory(nextMatches);

  return nextMatches;
}
