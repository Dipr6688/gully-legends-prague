import {
  FINALISATION_VERSION,
  applyFinalisedMatchToCareerStats,
  createEmptyCareerProgressionState,
  type AppliedPlayerMatchProgression,
  type CareerProgressionState,
  type PlayerCareerStats
} from "@/lib/career-store";
import type { SupabaseCareerStatsRow, SupabaseMatchStatApplicationRow } from "@/lib/supabase/read-repositories";
import type { MatchRecord } from "@/lib/types/match";

export type FinalisationCareerSnapshot = PlayerCareerStats & {
  updatedAt: string;
};

export type FinalisationPlayerApplication = {
  playerId: string;
  expectedCareer: FinalisationCareerSnapshot;
  nextCareer: PlayerCareerStats;
  progression: AppliedPlayerMatchProgression;
};

export type FinalisationPlan = {
  matchId: string;
  expectedMatchUpdatedAt: string | null;
  finalMatch: MatchRecord;
  appliedAt: string;
  finalisationVersion: typeof FINALISATION_VERSION;
  applications: FinalisationPlayerApplication[];
};

function careerRowToStats(row: SupabaseCareerStatsRow): PlayerCareerStats {
  return {
    playerId: row.player_id,
    matches: row.matches,
    inningsBatted: row.innings_batted,
    runs: row.runs,
    fifties: row.fifties,
    centuries: row.centuries,
    dismissedDucks: row.dismissed_ducks,
    wickets: row.wickets,
    catches: row.catches,
    runOuts: row.run_outs,
    stumpings: row.stumpings,
    hatTricks: row.hat_tricks,
    threeWicketHauls: row.three_wicket_hauls,
    matchesBowled: row.matches_bowled,
    completedOvers: row.completed_overs,
    totalRunsConceded: row.total_runs_conceded,
    totalXP: row.total_xp,
    level: row.level
  };
}

function buildCurrentCareerState(rows: SupabaseCareerStatsRow[]): CareerProgressionState {
  const state = createEmptyCareerProgressionState();

  for (const row of rows) {
    state.playerCareers[row.player_id] = careerRowToStats(row);
  }

  return state;
}

function getPlayedPlayerIds(match: MatchRecord): string[] {
  return Array.from(
    new Set(
      (match.finalisedPlayerRecords ?? [])
        .filter((performance) => performance.played)
        .map((performance) => performance.playerId)
    )
  ).sort();
}

export function buildFinalisationPlan({
  finalMatch,
  expectedMatchUpdatedAt,
  careerRows,
  existingApplications,
  appliedAt = new Date().toISOString()
}: {
  finalMatch: MatchRecord;
  expectedMatchUpdatedAt?: string | null;
  careerRows: SupabaseCareerStatsRow[];
  existingApplications: SupabaseMatchStatApplicationRow[];
  appliedAt?: string;
}): FinalisationPlan {
  if (finalMatch.status !== "finalised") {
    throw new Error("Finalisation plan requires a finalised MatchRecord.");
  }

  const playerIds = getPlayedPlayerIds(finalMatch);
  const careerRowsByPlayerId = new Map(careerRows.map((row) => [row.player_id, row]));
  const missingPlayerId = playerIds.find((playerId) => !careerRowsByPlayerId.has(playerId));

  if (missingPlayerId) {
    throw new Error(`Missing career row for ${missingPlayerId}.`);
  }

  const currentState = buildCurrentCareerState(careerRows);

  for (const application of existingApplications) {
    currentState.appliedProgressions[application.idempotency_key] = {
      idempotencyKey: application.idempotency_key,
      matchId: application.match_id,
      playerId: application.player_id,
      xpBreakdown: application.xp_breakdown as AppliedPlayerMatchProgression["xpBreakdown"],
      progressionAppliedAt: application.applied_at,
      appliedFinalisationVersion: application.finalisation_version
    };
  }

  const nextState = applyFinalisedMatchToCareerStats(finalMatch, currentState, appliedAt);
  const applications = playerIds.map((playerId) => {
    const row = careerRowsByPlayerId.get(playerId);
    const progression = nextState.appliedProgressions[`${finalMatch.id}:${playerId}`];

    if (!row || !progression) {
      throw new Error(`Missing progression plan for ${playerId}.`);
    }

    return {
      playerId,
      expectedCareer: {
        ...careerRowToStats(row),
        updatedAt: row.updated_at
      },
      nextCareer: nextState.playerCareers[playerId],
      progression
    };
  });

  return {
    matchId: finalMatch.id,
    expectedMatchUpdatedAt: expectedMatchUpdatedAt ?? null,
    finalMatch,
    appliedAt,
    finalisationVersion: FINALISATION_VERSION,
    applications
  };
}
