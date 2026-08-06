"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MATCH_HISTORY_UPDATED_EVENT,
  getFinalisedMatches,
  localMatchRepository,
  type MatchRepository
} from "@/lib/match-repository";
import type { MatchRecord } from "@/lib/types/match";

export function useMatchRepository(
  repository: MatchRepository = localMatchRepository
) {
  const [matches, setMatches] = useState<MatchRecord[]>([]);

  useEffect(() => {
    function refreshMatches() {
      setMatches(repository.getAllMatches());
    }

    refreshMatches();
    window.addEventListener("storage", refreshMatches);
    window.addEventListener(MATCH_HISTORY_UPDATED_EVENT, refreshMatches);

    return () => {
      window.removeEventListener("storage", refreshMatches);
      window.removeEventListener(MATCH_HISTORY_UPDATED_EVENT, refreshMatches);
    };
  }, [repository]);

  return useMemo(
    () => ({
      matches,
      finalisedMatches: getFinalisedMatches(matches)
    }),
    [matches]
  );
}
