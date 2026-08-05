import type { PlayerMatchPerformance, TeamId } from "./types/match";

export type TeamRosters = {
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
};

export type MatchTotals = {
  teamATotal: number;
  teamBTotal: number;
};

export type TeamSelectionState = TeamRosters & {
  availablePlayerIds: string[];
};

export type MatchValidationInput = TeamSelectionState & {
  matchDate: string;
  performances: PlayerMatchPerformance[];
};

export function sanitizeRuns(value: unknown): number {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) return 0;

  return Math.max(0, Math.floor(numericValue));
}

export function calculateTeamTotals(
  performances: PlayerMatchPerformance[],
  rosters: TeamRosters
): MatchTotals {
  return {
    teamATotal: calculateTeamTotal(performances, "teamA", rosters.teamAPlayerIds),
    teamBTotal: calculateTeamTotal(performances, "teamB", rosters.teamBPlayerIds)
  };
}

export function getCrossTeamPlayerIds(rosters: TeamRosters): string[] {
  const teamBIds = new Set(rosters.teamBPlayerIds);
  return rosters.teamAPlayerIds.filter((playerId) => teamBIds.has(playerId));
}

export function toggleTeamSelection(
  state: TeamSelectionState,
  teamId: TeamId,
  playerId: string
): TeamSelectionState {
  if (!state.availablePlayerIds.includes(playerId)) {
    return state;
  }

  const sourceKey = teamId === "teamA" ? "teamAPlayerIds" : "teamBPlayerIds";
  const otherKey = teamId === "teamA" ? "teamBPlayerIds" : "teamAPlayerIds";
  const alreadySelected = state[sourceKey].includes(playerId);

  return {
    ...state,
    [sourceKey]: alreadySelected
      ? state[sourceKey].filter((id) => id !== playerId)
      : [...state[sourceKey], playerId],
    [otherKey]: state[otherKey].filter((id) => id !== playerId)
  };
}

export function setPlayerAvailability(
  state: TeamSelectionState,
  playerId: string,
  isAvailable: boolean
): TeamSelectionState {
  const availablePlayerIds = isAvailable
    ? Array.from(new Set([...state.availablePlayerIds, playerId]))
    : state.availablePlayerIds.filter((id) => id !== playerId);

  return {
    availablePlayerIds,
    teamAPlayerIds: state.teamAPlayerIds.filter((id) =>
      availablePlayerIds.includes(id)
    ),
    teamBPlayerIds: state.teamBPlayerIds.filter((id) =>
      availablePlayerIds.includes(id)
    )
  };
}

export function validateMatchRecordInput(input: MatchValidationInput): string[] {
  const errors: string[] = [];
  const availableIds = new Set(input.availablePlayerIds);
  const selectedIds = new Set([
    ...input.teamAPlayerIds,
    ...input.teamBPlayerIds
  ]);

  if (!input.matchDate) {
    errors.push("Match date is required.");
  }

  if (input.availablePlayerIds.length === 0) {
    errors.push("Select at least one available player.");
  }

  if (getCrossTeamPlayerIds(input).length > 0) {
    errors.push("A player cannot be selected for both teams.");
  }

  if (input.teamAPlayerIds.length === 0 || input.teamBPlayerIds.length === 0) {
    errors.push("Team A and Team B must each contain at least one player.");
  }

  for (const playerId of selectedIds) {
    if (!availableIds.has(playerId)) {
      errors.push("Every selected player must be marked available.");
      break;
    }
  }

  for (const performance of input.performances) {
    const inTeamA = input.teamAPlayerIds.includes(performance.playerId);
    const inTeamB = input.teamBPlayerIds.includes(performance.playerId);

    if (!selectedIds.has(performance.playerId)) {
      errors.push("Every performance record must belong to a selected player.");
      break;
    }

    if (
      (performance.teamId === "teamA" && !inTeamA) ||
      (performance.teamId === "teamB" && !inTeamB)
    ) {
      errors.push("Every performance record must match the player's selected team.");
      break;
    }

    if (!Number.isInteger(performance.runs) || performance.runs < 0) {
      errors.push("Runs must be non-negative integers.");
      break;
    }
  }

  return errors;
}

function calculateTeamTotal(
  performances: PlayerMatchPerformance[],
  teamId: TeamId,
  playerIds: string[]
): number {
  return performances
    .filter(
      (record) => record.teamId === teamId && playerIds.includes(record.playerId)
    )
    .reduce((total, record) => total + sanitizeRuns(record.runs), 0);
}
