import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { MatchStatus } from "@/lib/types/match";
import { requireSupabasePublicEnv } from "@/lib/supabase/env";

type SupabaseErrorLike = {
  message: string;
};

export type SupabasePlayerRow = {
  id: string;
  slug: string;
  display_name: string;
  card_title: string;
  role: string;
  card_image: string;
  play_styles: string[];
  tags: string[];
  profile_payload: Record<string, unknown>;
  accent: string | null;
  accent_color: string | null;
  is_active: boolean;
};

export type SupabaseMatchRow = {
  id: string;
  match_date: string;
  start_time: string | null;
  match_sequence: number | null;
  name: string;
  venue: string;
  status: MatchStatus;
  is_demo: boolean;
  payload: unknown;
  finalised_at: string | null;
  stats_applied_at: string | null;
  deleted_at: string | null;
  updated_at: string;
};

export type SupabaseCareerStatsRow = {
  player_id: string;
  matches: number;
  innings_batted: number;
  runs: number;
  fifties: number;
  centuries: number;
  dismissed_ducks: number;
  wickets: number;
  catches: number;
  run_outs: number;
  stumpings: number;
  hat_tricks: number;
  three_wicket_hauls: number;
  matches_bowled: number;
  completed_overs: number;
  total_runs_conceded: number;
  total_xp: number;
  level: number;
  stats_payload: Record<string, unknown>;
};

export type SupabaseMatchStatApplicationRow = {
  match_id: string;
  player_id: string;
  idempotency_key: string;
  xp_breakdown: Record<string, unknown>;
  applied_at: string;
  finalisation_version: number;
};

export type SupabaseMonthlyBeastCrownRow = {
  id: string;
  month_key: string;
  version: number;
  status: "active" | "revoked";
  batting: Record<string, unknown>;
  bowling: Record<string, unknown>;
  fielding: Record<string, unknown>;
  is_demo: boolean;
  crowned_at: string;
  crowned_by: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
};

export type SupabaseGalleryPhotoRow = {
  id: string;
  deleted_at: string | null;
  is_demo: boolean;
};

export type PublicReadCheckResult = {
  key: "players" | "matches" | "careerStats" | "monthlyBeastCrowns" | "gallery";
  label: string;
  ok: boolean;
  count: number | null;
  error: string | null;
};

async function selectRows<T>(
  client: SupabaseClient,
  table: string,
  columns: string
): Promise<T[]> {
  const { data, error } = (await client
    .from(table)
    .select(columns)) as unknown as {
    data: T[] | null;
    error: SupabaseErrorLike | null;
  };

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export class SupabasePlayerRepository {
  constructor(private readonly client: SupabaseClient) {}

  getPlayers(): Promise<SupabasePlayerRow[]> {
    return selectRows<SupabasePlayerRow>(
      this.client,
      "players",
      [
        "id",
        "slug",
        "display_name",
        "card_title",
        "role",
        "card_image",
        "play_styles",
        "tags",
        "profile_payload",
        "accent",
        "accent_color",
        "is_active"
      ].join(", ")
    );
  }
}

export class SupabaseMatchRepository {
  constructor(private readonly client: SupabaseClient) {}

  getMatches(): Promise<SupabaseMatchRow[]> {
    return selectRows<SupabaseMatchRow>(
      this.client,
      "matches",
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
    );
  }
}

export class SupabaseCareerStatsRepository {
  constructor(private readonly client: SupabaseClient) {}

  getCareerStats(): Promise<SupabaseCareerStatsRow[]> {
    return selectRows<SupabaseCareerStatsRow>(
      this.client,
      "player_career_stats",
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
        "stats_payload"
      ].join(", ")
    );
  }
}

export class SupabaseProgressionLedgerRepository {
  constructor(private readonly client: SupabaseClient) {}

  getApplications(): Promise<SupabaseMatchStatApplicationRow[]> {
    return selectRows<SupabaseMatchStatApplicationRow>(
      this.client,
      "match_stat_applications",
      [
        "match_id",
        "player_id",
        "idempotency_key",
        "xp_breakdown",
        "applied_at",
        "finalisation_version"
      ].join(", ")
    );
  }
}

export class SupabaseMonthlyBeastCrownRepository {
  constructor(private readonly client: SupabaseClient) {}

  getCrowns(): Promise<SupabaseMonthlyBeastCrownRow[]> {
    return selectRows<SupabaseMonthlyBeastCrownRow>(
      this.client,
      "monthly_beast_crowns",
      [
        "id",
        "month_key",
        "version",
        "status",
        "batting",
        "bowling",
        "fielding",
        "is_demo",
        "crowned_at",
        "crowned_by",
        "revoked_at",
        "revoked_by"
      ].join(", ")
    );
  }
}

export class SupabaseGalleryPhotoRepository {
  constructor(private readonly client: SupabaseClient) {}

  getPhotos(): Promise<SupabaseGalleryPhotoRow[]> {
    return selectRows<SupabaseGalleryPhotoRow>(
      this.client,
      "gallery_photos",
      "id, deleted_at, is_demo"
    );
  }
}

export function createSupabaseAnonymousReadClient(): SupabaseClient {
  const env = requireSupabasePublicEnv();

  return createClient(env.url, env.publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}

async function checkPublicSelect(
  client: SupabaseClient,
  key: PublicReadCheckResult["key"],
  label: string,
  table: string,
  columns = "id"
): Promise<PublicReadCheckResult> {
  const { count, error } = (await client
    .from(table)
    .select(columns, { count: "exact", head: true })) as unknown as {
    count: number | null;
    error: SupabaseErrorLike | null;
  };

  return {
    key,
    label,
    ok: !error,
    count: error ? null : count,
    error: error?.message ?? null
  };
}

export async function runPublicRlsReadChecks(
  client: SupabaseClient
): Promise<PublicReadCheckResult[]> {
  return Promise.all([
    checkPublicSelect(client, "players", "Active players", "players"),
    checkPublicSelect(client, "matches", "Visible matches", "matches"),
    checkPublicSelect(
      client,
      "careerStats",
      "Career stats",
      "player_career_stats",
      "player_id"
    ),
    checkPublicSelect(
      client,
      "monthlyBeastCrowns",
      "Active Monthly Beast crowns",
      "monthly_beast_crowns"
    ),
    checkPublicSelect(client, "gallery", "Gallery metadata", "gallery_photos")
  ]);
}
