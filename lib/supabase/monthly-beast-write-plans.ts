import {
  applyFinalisedMatchToCareerStats,
  createEmptyCareerProgressionState,
  createEmptyPlayerCareerStats,
  type PlayerCareerStats
} from "@/lib/career-store";
import {
  createCrownedMonthlyBeasts,
  getFinalisedMatchesForMonth,
  isValidMonthKey
} from "@/lib/monthly-beasts";
import { validateSupabaseMatchPayload } from "@/lib/admin/supabase-data-check";
import type {
  SupabaseCareerStatsRow,
  SupabaseMatchRow,
  SupabaseMonthlyBeastCrownRow,
  SupabasePlayerRow
} from "@/lib/supabase/read-repositories";
import type { MatchRecord } from "@/lib/types/match";

export type ExpectedMatchVersion = {
  id: string;
  updatedAt: string;
  isDemo?: boolean;
};

export type ExpectedCareerReplacement = {
  playerId: string;
  expectedCareer: (PlayerCareerStats & { updatedAt: string }) | null;
  nextCareer: PlayerCareerStats;
};

export type CrownMonthlyBeastsPlan = {
  monthKey: string;
  batting: { playerIds: string[]; xp: number };
  bowling: { playerIds: string[]; xp: number };
  fielding: { playerIds: string[]; xp: number };
  sourceMatches: ExpectedMatchVersion[];
  isDemo: boolean;
};

export type ResetDemoPlan = {
  expectedDemoMatches: ExpectedMatchVersion[];
  expectedRealFinalisedMatches: ExpectedMatchVersion[];
  replacementCareers: ExpectedCareerReplacement[];
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

function parseValidMatches(rows: SupabaseMatchRow[]): MatchRecord[] {
  return rows.map((row) => {
    const result = validateSupabaseMatchPayload(row);

    if (!result.match || result.issues.length > 0) {
      throw new Error(`Invalid Supabase MatchRecord payload for ${row.id}.`);
    }

    return result.match;
  });
}

export function buildCrownMonthlyBeastsPlan({
  monthKey,
  matchRows,
  existingCrowns
}: {
  monthKey: string;
  matchRows: SupabaseMatchRow[];
  existingCrowns: SupabaseMonthlyBeastCrownRow[];
}): CrownMonthlyBeastsPlan {
  if (!isValidMonthKey(monthKey)) {
    throw new Error("Invalid month key.");
  }

  if (existingCrowns.some((crown) => crown.month_key === monthKey && crown.status === "active")) {
    throw new Error("Month already crowned.");
  }

  const matches = parseValidMatches(matchRows);
  const matchesForMonth = getFinalisedMatchesForMonth({ matches, monthKey });

  if (matchesForMonth.length === 0) {
    throw new Error("No finalised matches for this month.");
  }

  const version =
    existingCrowns
      .filter((crown) => crown.month_key === monthKey)
      .reduce((highest, crown) => Math.max(highest, crown.version), 0) + 1;
  const snapshot = createCrownedMonthlyBeasts({
    matches,
    monthKey,
    version
  });
  const rowsForMonth = matchRows.filter((row) =>
    matchesForMonth.some((match) => match.id === row.id)
  );

  return {
    monthKey,
    batting: snapshot.batting,
    bowling: snapshot.bowling,
    fielding: snapshot.fielding,
    sourceMatches: rowsForMonth
      .map((row) => ({
        id: row.id,
        updatedAt: row.updated_at,
        isDemo: row.is_demo
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    isDemo: rowsForMonth.some((row) => row.is_demo)
  };
}

export function buildResetDemoPlan({
  matchRows,
  careerRows,
  playerRows
}: {
  matchRows: SupabaseMatchRow[];
  careerRows: SupabaseCareerStatsRow[];
  playerRows: SupabasePlayerRow[];
}): ResetDemoPlan {
  const validMatches = parseValidMatches(matchRows);
  const validMatchesById = new Map(validMatches.map((match) => [match.id, match]));
  const realFinalisedRows = matchRows
    .filter((row) => row.status === "finalised" && !row.is_demo && !row.deleted_at)
    .sort((left, right) => {
      if (left.match_date !== right.match_date) return left.match_date.localeCompare(right.match_date);
      if ((left.match_sequence ?? 0) !== (right.match_sequence ?? 0)) {
        return (left.match_sequence ?? 0) - (right.match_sequence ?? 0);
      }

      return left.id.localeCompare(right.id);
    });
  const realFinalisedMatches = realFinalisedRows.map((row) => {
    const match = validMatchesById.get(row.id);

    if (!match) throw new Error(`Missing parsed MatchRecord for ${row.id}.`);

    return match;
  });
  const rebuiltState = realFinalisedMatches.reduce(
    (state, match) => applyFinalisedMatchToCareerStats(match, state),
    createEmptyCareerProgressionState()
  );
  const careerRowsByPlayerId = new Map(careerRows.map((row) => [row.player_id, row]));
  const activePlayerIds = playerRows
    .filter((player) => player.is_active)
    .map((player) => player.id)
    .sort();

  return {
    expectedDemoMatches: matchRows
      .filter((row) => row.is_demo)
      .map((row) => ({ id: row.id, updatedAt: row.updated_at }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    expectedRealFinalisedMatches: realFinalisedRows
      .map((row) => ({ id: row.id, updatedAt: row.updated_at }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    replacementCareers: activePlayerIds.map((playerId) => {
      const row = careerRowsByPlayerId.get(playerId);
      const expectedCareer = row
        ? {
            ...careerRowToStats(row),
            updatedAt: row.updated_at
          }
        : null;

      return {
        playerId,
        expectedCareer,
        nextCareer:
          rebuiltState.playerCareers[playerId] ??
          createEmptyPlayerCareerStats(playerId)
      };
    })
  };
}
