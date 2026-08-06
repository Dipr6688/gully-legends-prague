"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CAREER_PROGRESS_UPDATED_EVENT,
  createEmptyCareerProgressionState,
  loadCareerProgressionState,
  mergePlayersWithCareerState,
  type CareerProgressionState
} from "@/lib/career-store";
import type { Player } from "@/lib/types/player";

export function useCareerProgressionState(): CareerProgressionState {
  const [careerState, setCareerState] = useState(createEmptyCareerProgressionState);

  useEffect(() => {
    function refreshCareerState() {
      setCareerState(loadCareerProgressionState());
    }

    refreshCareerState();
    window.addEventListener("storage", refreshCareerState);
    window.addEventListener(CAREER_PROGRESS_UPDATED_EVENT, refreshCareerState);

    return () => {
      window.removeEventListener("storage", refreshCareerState);
      window.removeEventListener(CAREER_PROGRESS_UPDATED_EVENT, refreshCareerState);
    };
  }, []);

  return careerState;
}

export function useCareerPlayers(basePlayers: Player[]): Player[] {
  const careerState = useCareerProgressionState();

  return useMemo(
    () => mergePlayersWithCareerState(basePlayers, careerState),
    [basePlayers, careerState]
  );
}
