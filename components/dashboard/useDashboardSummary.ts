"use client";

import { useMemo } from "react";
import { getDashboardSummary } from "@/lib/dashboard-summary";
import { useMatchRepository } from "@/components/matches/useMatchRepository";
import type { Player } from "@/lib/types/player";

export function useDashboardSummary(players: Player[]) {
  const { matches } = useMatchRepository();

  const summary = useMemo(
    () => getDashboardSummary({ matches, players }),
    [matches, players]
  );

  return { matches, summary };
}
