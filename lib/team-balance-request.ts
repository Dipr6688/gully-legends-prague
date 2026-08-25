import { getDistributablePlayerIds } from "./match-records";

export type TeamBalanceValidationSuccess = {
  distributablePlayerIds: string[];
  sharedPlayerId: string | null;
};

export type TeamBalanceValidationResult =
  | TeamBalanceValidationSuccess
  | { error: string };

export function validateTeamBalanceRequest(
  selectedPlayerIds: string[],
  sharedPlayerId: string | null,
  eligiblePlayerIds: ReadonlySet<string>
): TeamBalanceValidationResult {
  if (selectedPlayerIds.length < 2) {
    return { error: "Select at least two players before balancing teams." };
  }

  const uniqueSelectedPlayerIds = Array.from(new Set(selectedPlayerIds));

  if (uniqueSelectedPlayerIds.length !== selectedPlayerIds.length) {
    return { error: "Each selected player can appear only once." };
  }

  const unknownPlayerId = uniqueSelectedPlayerIds.find(
    (playerId) => !eligiblePlayerIds.has(playerId)
  );

  if (unknownPlayerId) {
    return { error: "Selected players must be active roster players." };
  }

  const normalisedSharedPlayerId =
    sharedPlayerId && sharedPlayerId.length > 0 ? sharedPlayerId : null;

  if (
    normalisedSharedPlayerId &&
    !uniqueSelectedPlayerIds.includes(normalisedSharedPlayerId)
  ) {
    return { error: "Shared Player must be selected for this match." };
  }

  if (uniqueSelectedPlayerIds.length % 2 === 0 && normalisedSharedPlayerId) {
    return {
      error:
        "Shared Player is only available for odd attendance. Remove Shared Player or select an odd group."
    };
  }

  if (uniqueSelectedPlayerIds.length % 2 === 1 && !normalisedSharedPlayerId) {
    return { error: "Select one Shared Player to balance an odd group." };
  }

  const distributablePlayerIds = getDistributablePlayerIds(
    uniqueSelectedPlayerIds,
    normalisedSharedPlayerId
  );

  if (distributablePlayerIds.length < 2 || distributablePlayerIds.length % 2 !== 0) {
    return { error: "Teams need an equal number of exclusive players." };
  }

  return {
    distributablePlayerIds,
    sharedPlayerId: normalisedSharedPlayerId
  };
}
