import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildDemoTestDraftMatch,
  isDemoTestMatchPayload
} from "@/lib/demo-test-match";
import type { MatchRecord } from "@/lib/types/match";

type SupabaseErrorLike = {
  message: string;
  code?: string;
};

type SupabaseMatchWriteRow = {
  id: string;
  status: MatchRecord["status"];
  is_demo: boolean;
  payload: MatchRecord;
  updated_at: string;
  deleted_at: string | null;
};

type SupabaseMatchWriteResultRow = Pick<
  SupabaseMatchWriteRow,
  "id" | "updated_at"
>;

type MatchMutationRow = {
  id: string;
  match_date: string;
  start_time: string | null;
  match_sequence: number | null;
  name: string;
  venue: string;
  status: MatchRecord["status"];
  is_demo: boolean;
  payload: MatchRecord;
  created_by?: string;
  updated_by: string;
  finalised_at: string | null;
  stats_applied_at: string | null;
  deleted_at: string | null;
};

export type SupabaseMatchWriteResult = {
  matchId: string;
  updatedAt: string;
};

export class SupabaseMatchWriteError extends Error {
  constructor(
    message: string,
    readonly code:
      | "not_found"
      | "not_allowed"
      | "stale_record"
      | "live_match_conflict"
      | "write_failed",
    readonly conflictMatchId?: string
  ) {
    super(message);
  }
}

function toDatabaseRow({
  match,
  userId,
  existing,
  forceDemo = false
}: {
  match: MatchRecord;
  userId: string;
  existing: SupabaseMatchWriteRow | null;
  forceDemo?: boolean;
}): MatchMutationRow {
  const payload = { ...match };

  delete payload.supabaseUpdatedAt;
  delete payload.isDemo;

  if (forceDemo || isDemoTestMatchPayload(existing?.payload)) {
    payload.isDemoTestMatch = true;
  }

  return {
    id: match.id,
    match_date: match.matchDate,
    start_time: match.startTime ?? null,
    match_sequence: match.matchNumber ?? null,
    name: match.matchName,
    venue: match.venue,
    status: match.status,
    is_demo: forceDemo || (existing?.is_demo ?? false),
    payload,
    created_by: existing ? undefined : userId,
    updated_by: userId,
    finalised_at: existing?.status === "finalised" ? null : null,
    stats_applied_at: null,
    deleted_at: match.deletedAt ?? null
  };
}

function toWriteResult(row: SupabaseMatchWriteResultRow): SupabaseMatchWriteResult {
  return {
    matchId: row.id,
    updatedAt: row.updated_at
  };
}

async function maybeSingle<T>(
  query: PromiseLike<{ data: T | null; error: SupabaseErrorLike | null }>
): Promise<T | null> {
  const { data, error } = await query;

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new SupabaseMatchWriteError("COULD NOT SAVE MATCH", "write_failed");
  }

  return data;
}

export class SupabaseAdminMatchWriteRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string
  ) {}

  private async getMatchRow(matchId: string): Promise<SupabaseMatchWriteRow | null> {
    return maybeSingle<SupabaseMatchWriteRow>(
      this.client
        .from("matches")
        .select("id, status, is_demo, payload, updated_at, deleted_at")
        .eq("id", matchId)
        .maybeSingle() as unknown as PromiseLike<{
        data: SupabaseMatchWriteRow | null;
        error: SupabaseErrorLike | null;
      }>
    );
  }

  private assertCanUpdate({
    match,
    existing,
    expectedUpdatedAt
  }: {
    match: MatchRecord;
    existing: SupabaseMatchWriteRow | null;
    expectedUpdatedAt?: string | null;
  }) {
    if (match.status === "finalised") {
      throw new SupabaseMatchWriteError(
        "USE MATCH FINALISATION WORKFLOW",
        "not_allowed"
      );
    }

    if (
      existing?.status === "finalised" ||
      (existing?.is_demo && !isDemoTestMatchPayload(existing.payload))
    ) {
      throw new SupabaseMatchWriteError("COULD NOT SAVE MATCH", "not_allowed");
    }

    if (
      expectedUpdatedAt &&
      existing?.updated_at &&
      expectedUpdatedAt !== existing.updated_at
    ) {
      throw new SupabaseMatchWriteError("COULD NOT SAVE MATCH", "stale_record");
    }
  }

  private async assertNoOtherLiveMatch(matchId: string) {
    const conflict = await maybeSingle<{ id: string }>(
      this.client
        .from("matches")
        .select("id")
        .eq("status", "in_progress")
        .is("deleted_at", null)
        .neq("id", matchId)
        .limit(1)
        .maybeSingle() as unknown as PromiseLike<{
        data: { id: string } | null;
        error: SupabaseErrorLike | null;
      }>
    );

    if (conflict) {
      throw new SupabaseMatchWriteError(
        "ANOTHER MATCH IS ALREADY IN PROGRESS",
        "live_match_conflict",
        conflict.id
      );
    }
  }

  async saveMatch({
    match,
    expectedUpdatedAt
  }: {
    match: MatchRecord;
    expectedUpdatedAt?: string | null;
  }): Promise<SupabaseMatchWriteResult> {
    const existing = await this.getMatchRow(match.id);

    this.assertCanUpdate({ match, existing, expectedUpdatedAt });

    if (match.status === "in_progress") {
      await this.assertNoOtherLiveMatch(match.id);
    }

    const row = toDatabaseRow({ match, userId: this.userId, existing });

    if (existing) {
      const updateRow = { ...row };

      delete updateRow.created_by;

      const { data, error } = (await this.client
        .from("matches")
        .update(updateRow)
        .eq("id", match.id)
        .select("id, status, is_demo, updated_at, deleted_at")
        .single()) as unknown as {
        data: SupabaseMatchWriteResultRow | null;
        error: SupabaseErrorLike | null;
      };

      if (error || !data) {
        throw new SupabaseMatchWriteError("COULD NOT SAVE MATCH", "write_failed");
      }

      return toWriteResult(data);
    }

    const { data, error } = (await this.client
      .from("matches")
      .insert(row)
      .select("id, status, is_demo, updated_at, deleted_at")
      .single()) as unknown as {
      data: SupabaseMatchWriteResultRow | null;
      error: SupabaseErrorLike | null;
    };

    if (error || !data) {
      throw new SupabaseMatchWriteError("COULD NOT SAVE MATCH", "write_failed");
    }

    return toWriteResult(data);
  }

  async createDemoTestMatch(): Promise<SupabaseMatchWriteResult> {
    const match = buildDemoTestDraftMatch();
    const row = toDatabaseRow({
      match,
      userId: this.userId,
      existing: null,
      forceDemo: true
    });
    const { data, error } = (await this.client
      .from("matches")
      .insert(row)
      .select("id, status, is_demo, updated_at, deleted_at")
      .single()) as unknown as {
      data: SupabaseMatchWriteResultRow | null;
      error: SupabaseErrorLike | null;
    };

    if (error || !data) {
      throw new SupabaseMatchWriteError("COULD NOT CREATE DEMO TEST MATCH", "write_failed");
    }

    return toWriteResult(data);
  }

  async softDeleteScheduledMatch({
    matchId,
    expectedUpdatedAt
  }: {
    matchId: string;
    expectedUpdatedAt?: string | null;
  }): Promise<SupabaseMatchWriteResult> {
    const existing = await this.getMatchRow(matchId);

    if (!existing || existing.deleted_at) {
      throw new SupabaseMatchWriteError("COULD NOT DELETE MATCH", "not_found");
    }

    if (existing.status !== "draft" || existing.is_demo) {
      throw new SupabaseMatchWriteError("COULD NOT DELETE MATCH", "not_allowed");
    }

    if (expectedUpdatedAt && expectedUpdatedAt !== existing.updated_at) {
      throw new SupabaseMatchWriteError("COULD NOT DELETE MATCH", "stale_record");
    }

    const deletedAt = new Date().toISOString();
    const deletedPayload = {
      ...existing.payload,
      deletedAt
    };
    const { data, error } = (await this.client
      .from("matches")
      .update({
        deleted_at: deletedAt,
        updated_by: this.userId,
        payload: deletedPayload
      })
      .eq("id", matchId)
      .select("id, status, is_demo, payload, updated_at, deleted_at")
      .single()) as unknown as {
      data: SupabaseMatchWriteRow | null;
      error: SupabaseErrorLike | null;
    };

    if (error || !data) {
      throw new SupabaseMatchWriteError("COULD NOT DELETE MATCH", "write_failed");
    }

    return toWriteResult(data);
  }
}
