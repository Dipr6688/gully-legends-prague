import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppSyncMatchPayload, ApkImportReviewStatus, ApkMatchImport } from "@/lib/app-sync/types";
import type { FinalisationPlan } from "@/lib/supabase/match-finalisation-plan";
import type { MatchRecord } from "@/lib/types/match";

type SupabaseErrorLike = {
  message: string;
  code?: string;
};

export type ApkMatchImportRow = {
  id: string;
  offline_match_id: string;
  source: string;
  is_demo: boolean;
  sync_version: number;
  review_status: ApkImportReviewStatus;
  started_at: string | null;
  completed_at: string | null;
  match_date: string | null;
  imported_at: string;
  updated_at: string;
  raw_payload: AppSyncMatchPayload;
  derived_match_payload: MatchRecord | null;
  validation_result: Record<string, unknown> | null;
  review_payload?: AppSyncMatchPayload | null;
  review_derived_match_payload?: MatchRecord | null;
  review_validation_result?: Record<string, unknown> | null;
  review_source_sync_version?: number | null;
  review_version?: number | null;
  review_updated_at?: string | null;
  review_is_stale?: boolean | null;
  finalised_match_id: string | null;
  created_by: string | null;
  updated_by: string | null;
};

export type ApkImportMutation = {
  payload: AppSyncMatchPayload;
  derivedMatch: MatchRecord | null;
  validationResult: Record<string, unknown>;
  matchDate: string | null;
  userId: string;
  source?: string;
};

export type ApkImportUpsertResult = {
  importRecord: ApkMatchImport;
  changed: boolean;
  ignored: boolean;
};

export type ApkImportFinalisationResult = {
  ok: boolean;
  matchId: string;
  matchNumber: number | null;
  alreadyApplied: boolean;
  finalisedAt: string | null;
  statsAppliedAt: string | null;
};

export class SupabaseApkImportError extends Error {
  constructor(
    message: string,
    readonly code:
      | "not_found"
      | "not_allowed"
      | "conflict"
      | "write_failed"
      | "same_day_pending"
      | "invalid_request"
  ) {
    super(message);
  }
}

function rowToImport(row: ApkMatchImportRow): ApkMatchImport {
  return {
    id: row.id,
    offlineMatchId: row.offline_match_id,
    source: row.source,
    isDemo: row.is_demo,
    syncVersion: row.sync_version,
    reviewStatus: row.review_status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    matchDate: row.match_date,
    importedAt: row.imported_at,
    updatedAt: row.updated_at,
      rawPayload: row.raw_payload,
      derivedMatch: row.derived_match_payload,
      validationResult: row.validation_result ?? {},
      reviewPayload: row.review_payload ?? null,
      reviewDerivedMatch: row.review_derived_match_payload ?? null,
      reviewValidationResult: row.review_validation_result ?? null,
      reviewSourceSyncVersion: row.review_source_sync_version ?? null,
      reviewVersion: row.review_version ?? 0,
      reviewUpdatedAt: row.review_updated_at ?? null,
      reviewIsStale: row.review_is_stale ?? false,
      finalisedMatchId: row.finalised_match_id,
    createdBy: row.created_by,
    updatedBy: row.updated_by
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseImportRow(value: unknown): ApkMatchImport {
  if (!isRecord(value)) {
    throw new SupabaseApkImportError("COULD NOT READ APK IMPORT", "write_failed");
  }

  return rowToImport(value as ApkMatchImportRow);
}

function parseUpsertResult(value: unknown): ApkImportUpsertResult {
  if (!isRecord(value)) {
    throw new SupabaseApkImportError("COULD NOT SAVE APK IMPORT", "write_failed");
  }

  return {
    importRecord: parseImportRow(value.import_record),
    changed: value.changed === true,
    ignored: value.ignored === true
  };
}

function parseFinalisationResult(value: unknown): ApkImportFinalisationResult {
  if (!isRecord(value)) {
    throw new SupabaseApkImportError("COULD NOT FINALISE APK IMPORT", "write_failed");
  }

  const matchNumber =
    typeof value.match_number === "number"
      ? value.match_number
      : typeof value.matchNumber === "number"
        ? value.matchNumber
        : null;

  return {
    ok: value.ok === true,
    matchId: String(value.match_id ?? value.matchId ?? ""),
    matchNumber,
    alreadyApplied: value.already_applied === true || value.alreadyApplied === true,
    finalisedAt:
      typeof value.finalised_at === "string"
        ? value.finalised_at
        : typeof value.finalisedAt === "string"
          ? value.finalisedAt
          : null,
    statsAppliedAt:
      typeof value.stats_applied_at === "string"
        ? value.stats_applied_at
        : typeof value.statsAppliedAt === "string"
          ? value.statsAppliedAt
          : null
  };
}

async function maybeSingle<T>(
  query: PromiseLike<{ data: T | null; error: SupabaseErrorLike | null }>
): Promise<T | null> {
  const { data, error } = await query;

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new SupabaseApkImportError("COULD NOT READ APK IMPORT", "write_failed");
  }

  return data;
}

function sortImportChronology(left: ApkMatchImport, right: ApkMatchImport): number {
  const leftTime =
    Date.parse(left.startedAt ?? "") ||
    Date.parse(left.completedAt ?? "") ||
    Date.parse(left.importedAt);
  const rightTime =
    Date.parse(right.startedAt ?? "") ||
    Date.parse(right.completedAt ?? "") ||
    Date.parse(right.importedAt);

  if (leftTime !== rightTime) return leftTime - rightTime;

  const leftEnd = Date.parse(left.completedAt ?? "") || Date.parse(left.importedAt);
  const rightEnd = Date.parse(right.completedAt ?? "") || Date.parse(right.importedAt);

  if (leftEnd !== rightEnd) return leftEnd - rightEnd;

  return left.offlineMatchId.localeCompare(right.offlineMatchId);
}

export class SupabaseApkImportRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getByOfflineMatchId({
    source,
    offlineMatchId
  }: {
    source: string;
    offlineMatchId: string;
  }): Promise<ApkMatchImport | null> {
    const row = await maybeSingle<ApkMatchImportRow>(
      this.client
        .from("apk_match_imports")
        .select("*")
        .eq("source", source)
        .eq("offline_match_id", offlineMatchId)
        .maybeSingle() as unknown as PromiseLike<{
        data: ApkMatchImportRow | null;
        error: SupabaseErrorLike | null;
      }>
    );

    return row ? rowToImport(row) : null;
  }

  async getById(importId: string): Promise<ApkMatchImport | null> {
    const row = await maybeSingle<ApkMatchImportRow>(
      this.client
        .from("apk_match_imports")
        .select("*")
        .eq("id", importId)
        .maybeSingle() as unknown as PromiseLike<{
        data: ApkMatchImportRow | null;
        error: SupabaseErrorLike | null;
      }>
    );

    return row ? rowToImport(row) : null;
  }

  async listForReview(): Promise<ApkMatchImport[]> {
    const { data, error } = (await this.client
      .from("apk_match_imports")
      .select("*")
      .in("review_status", ["pending_review", "correction_pending"])
      .order("match_date", { ascending: false, nullsFirst: false })
      .order("started_at", { ascending: false, nullsFirst: false })
      .order("imported_at", { ascending: false })) as unknown as {
      data: ApkMatchImportRow[] | null;
      error: SupabaseErrorLike | null;
    };

    if (error) {
      throw new SupabaseApkImportError("COULD NOT LOAD APK IMPORTS", "write_failed");
    }

    return (data ?? []).map(rowToImport);
  }

  async upsertPendingImport({
    payload,
    derivedMatch,
    validationResult,
    matchDate,
    userId,
    source = "apk"
  }: ApkImportMutation): Promise<ApkImportUpsertResult> {
    void userId;

    const { data, error } = (await this.client.rpc("upsert_apk_match_import_atomic", {
      import_payload: payload,
      derived_payload: derivedMatch,
      import_validation_result: validationResult,
      import_match_date: matchDate,
      import_source: source
    })) as unknown as {
      data: unknown;
      error: SupabaseErrorLike | null;
    };

    if (error) {
      throw new SupabaseApkImportError("COULD NOT SAVE APK IMPORT", "write_failed");
    }

    return parseUpsertResult(data);
  }

  async rejectImport(importId: string, userId: string): Promise<ApkMatchImport> {
    const { data, error } = (await this.client
      .from("apk_match_imports")
      .update({
        review_status: "rejected",
        updated_by: userId
      })
      .eq("id", importId)
      .eq("review_status", "pending_review")
      .select("*")
      .single()) as unknown as {
      data: ApkMatchImportRow | null;
      error: SupabaseErrorLike | null;
    };

    if (error || !data) {
      throw new SupabaseApkImportError("IMPORT NOT PENDING REVIEW", "not_allowed");
    }

    return rowToImport(data);
  }

  async saveReviewPayload({
    importId,
    payload,
    derivedMatch,
    validationResult,
    matchDate,
    userId,
    sourceSyncVersion,
    expectedReviewVersion
  }: {
    importId: string;
    payload: AppSyncMatchPayload;
    derivedMatch: MatchRecord | null;
    validationResult: Record<string, unknown>;
    matchDate: string | null;
    userId: string;
    sourceSyncVersion: number;
    expectedReviewVersion: number;
  }): Promise<ApkMatchImport> {
    const { data, error } = (await this.client
      .from("apk_match_imports")
      .update({
        review_payload: payload,
        review_derived_match_payload: derivedMatch,
        review_validation_result: validationResult,
        review_source_sync_version: sourceSyncVersion,
        review_version: expectedReviewVersion + 1,
        review_updated_at: new Date().toISOString(),
        review_is_stale: false,
        match_date: matchDate,
        updated_by: userId
      })
      .eq("id", importId)
      .eq("review_status", "pending_review")
      .eq("review_version", expectedReviewVersion)
      .select("*")
      .single()) as unknown as {
      data: ApkMatchImportRow | null;
      error: SupabaseErrorLike | null;
    };

    if (error || !data) {
      throw new SupabaseApkImportError(
        "REVIEW COPY CHANGED - RELOAD BEFORE SAVING",
        "conflict"
      );
    }

    return rowToImport(data);
  }

  async getEarlierOpenImport(current: ApkMatchImport): Promise<ApkMatchImport | null> {
    if (!current.matchDate) return null;

    const { data, error } = (await this.client
      .from("apk_match_imports")
      .select("*")
      .eq("match_date", current.matchDate)
      .eq("is_demo", false)
      .in("review_status", ["pending_review", "correction_pending"])
      .neq("id", current.id)) as unknown as {
      data: ApkMatchImportRow[] | null;
      error: SupabaseErrorLike | null;
    };

    if (error) {
      throw new SupabaseApkImportError("COULD NOT CHECK APK IMPORT ORDER", "write_failed");
    }

    return (
      (data ?? [])
        .map(rowToImport)
        .filter((candidate) => sortImportChronology(candidate, current) < 0)
        .sort(sortImportChronology)[0] ?? null
    );
  }

  async finalizeImportAtomically({
    importId,
    finalisationPlan
  }: {
    importId: string;
    finalisationPlan: FinalisationPlan;
  }): Promise<ApkImportFinalisationResult> {
    const { data, error } = (await this.client.rpc("finalize_apk_import_atomic", {
      apk_import_id: importId,
      finalisation_plan: finalisationPlan
    })) as unknown as {
      data: unknown;
      error: SupabaseErrorLike | null;
    };

    if (error) {
      const code = error.message.includes("same_day_pending")
        ? "same_day_pending"
        : error.message.includes("demo")
          ? "not_allowed"
          : error.message.includes("not_found")
            ? "not_found"
            : error.message.includes("not_pending")
              ? "not_allowed"
              : "write_failed";

      throw new SupabaseApkImportError("COULD NOT FINALISE APK IMPORT", code);
    }

    return parseFinalisationResult(data);
  }
}
