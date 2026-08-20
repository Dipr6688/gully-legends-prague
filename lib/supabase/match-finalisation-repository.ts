import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinalisationPlan } from "@/lib/supabase/match-finalisation-plan";
import type {
  SupabaseCareerStatsRow,
  SupabaseMatchRow,
  SupabaseMatchStatApplicationRow
} from "@/lib/supabase/read-repositories";

type SupabaseErrorLike = {
  message: string;
  code?: string;
};

export type AtomicFinalisationResult = {
  ok: boolean;
  matchId: string;
  alreadyApplied: boolean;
  finalisedAt: string | null;
  statsAppliedAt: string | null;
};

export class SupabaseMatchFinalisationError extends Error {
  constructor(
    message: string,
    readonly code:
      | "not_found"
      | "not_allowed"
      | "validation_failed"
      | "stale_match"
      | "stale_career"
      | "active_crown"
      | "already_applied"
      | "rpc_failed"
  ) {
    super(message);
  }
}

function parseAtomicResult(value: unknown): AtomicFinalisationResult {
  if (!value || typeof value !== "object") {
    throw new SupabaseMatchFinalisationError("COULD NOT FINALISE MATCH", "rpc_failed");
  }

  const result = value as Record<string, unknown>;

  return {
    ok: result.ok === true,
    matchId: String(result.match_id ?? result.matchId ?? ""),
    alreadyApplied: result.already_applied === true || result.alreadyApplied === true,
    finalisedAt:
      typeof result.finalised_at === "string"
        ? result.finalised_at
        : typeof result.finalisedAt === "string"
          ? result.finalisedAt
          : null,
    statsAppliedAt:
      typeof result.stats_applied_at === "string"
        ? result.stats_applied_at
        : typeof result.statsAppliedAt === "string"
          ? result.statsAppliedAt
          : null
  };
}

export class SupabaseMatchFinalisationRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getMatch(matchId: string): Promise<SupabaseMatchRow | null> {
    const { data, error } = (await this.client
      .from("matches")
      .select(
        [
          "id",
          "match_date",
          "start_time",
          "match_sequence",
          "name",
          "venue",
          "status",
          "is_demo",
          "payload",
          "finalised_at",
          "stats_applied_at",
          "deleted_at",
          "updated_at"
        ].join(", ")
      )
      .eq("id", matchId)
      .maybeSingle()) as unknown as {
      data: SupabaseMatchRow | null;
      error: SupabaseErrorLike | null;
    };

    if (error) {
      throw new SupabaseMatchFinalisationError("COULD NOT FINALISE MATCH", "rpc_failed");
    }

    return data;
  }

  async getMatchRows(): Promise<SupabaseMatchRow[]> {
    const { data, error } = (await this.client
      .from("matches")
      .select(
        [
          "id",
          "match_date",
          "start_time",
          "match_sequence",
          "name",
          "venue",
          "status",
          "is_demo",
          "payload",
          "finalised_at",
          "stats_applied_at",
          "deleted_at",
          "updated_at"
        ].join(", ")
      )) as unknown as {
      data: SupabaseMatchRow[] | null;
      error: SupabaseErrorLike | null;
    };

    if (error) {
      throw new SupabaseMatchFinalisationError("COULD NOT FINALISE MATCH", "rpc_failed");
    }

    return data ?? [];
  }

  async getCareerRows(playerIds: string[]): Promise<SupabaseCareerStatsRow[]> {
    const { data, error } = (await this.client
      .from("player_career_stats")
      .select(
        [
          "player_id",
          "matches",
          "innings_batted",
          "runs",
          "fifties",
          "centuries",
          "dismissed_ducks",
          "wickets",
          "catches",
          "run_outs",
          "stumpings",
          "hat_tricks",
          "three_wicket_hauls",
          "matches_bowled",
          "completed_overs",
          "total_runs_conceded",
          "total_xp",
          "level",
          "stats_payload",
          "updated_at"
        ].join(", ")
      )
      .in("player_id", playerIds)) as unknown as {
      data: SupabaseCareerStatsRow[] | null;
      error: SupabaseErrorLike | null;
    };

    if (error) {
      throw new SupabaseMatchFinalisationError("COULD NOT FINALISE MATCH", "rpc_failed");
    }

    return data ?? [];
  }

  async getMatchApplications(matchId: string): Promise<SupabaseMatchStatApplicationRow[]> {
    const { data, error } = (await this.client
      .from("match_stat_applications")
      .select(
        [
          "match_id",
          "player_id",
          "idempotency_key",
          "xp_breakdown",
          "applied_at",
          "finalisation_version"
        ].join(", ")
      )
      .eq("match_id", matchId)) as unknown as {
      data: SupabaseMatchStatApplicationRow[] | null;
      error: SupabaseErrorLike | null;
    };

    if (error) {
      throw new SupabaseMatchFinalisationError("COULD NOT FINALISE MATCH", "rpc_failed");
    }

    return data ?? [];
  }

  async hasActiveCrown(monthKey: string): Promise<boolean> {
    const { data, error } = (await this.client
      .from("monthly_beast_crowns")
      .select("id")
      .eq("month_key", monthKey)
      .eq("status", "active")
      .limit(1)
      .maybeSingle()) as unknown as {
      data: { id: string } | null;
      error: SupabaseErrorLike | null;
    };

    if (error) {
      throw new SupabaseMatchFinalisationError("COULD NOT FINALISE MATCH", "rpc_failed");
    }

    return Boolean(data);
  }

  async finalizeAtomically(plan: FinalisationPlan): Promise<AtomicFinalisationResult> {
    const { data, error } = (await this.client.rpc("finalize_match_atomic", {
      finalisation_plan: plan
    })) as unknown as {
      data: unknown;
      error: SupabaseErrorLike | null;
    };

    if (error) {
      const code = error.message.includes("stale_career")
        ? "stale_career"
        : error.message.includes("stale_match")
          ? "stale_match"
          : error.message.includes("already_applied")
            ? "already_applied"
            : "rpc_failed";

      throw new SupabaseMatchFinalisationError("COULD NOT FINALISE MATCH", code);
    }

    return parseAtomicResult(data);
  }
}
