import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CrownMonthlyBeastsPlan,
  ResetDemoPlan
} from "@/lib/supabase/monthly-beast-write-plans";

type SupabaseErrorLike = {
  message: string;
};

export type CrownMonthlyBeastsResult = {
  ok: boolean;
  id: string;
  monthKey: string;
  version: number;
  isDemo: boolean;
};

export type ReopenMonthlyBeastsResult = {
  ok: boolean;
  id: string;
  monthKey: string;
  version: number;
};

export type ResetDemoDataResult = {
  ok: boolean;
  demoMatchesRemoved: number;
  demoProgressionsRemoved: number;
  demoCrownsRemoved: number;
  demoGalleryRecordsRemoved: number;
  careerRowsRebuilt: number;
  realMatchesPreserved: number;
};

export class SupabaseMonthlyBeastWriteError extends Error {
  constructor(
    message: string,
    readonly code:
      | "active_crown"
      | "no_active_crown"
      | "stale_reset"
      | "validation_failed"
      | "rpc_failed"
  ) {
    super(message);
  }
}

function getRpcCode(message: string): SupabaseMonthlyBeastWriteError["code"] {
  if (message.includes("active_crown_exists")) return "active_crown";
  if (message.includes("no_active_crown")) return "no_active_crown";
  if (
    message.includes("demo_match_set_changed") ||
    message.includes("real_match_set_changed") ||
    message.includes("stale_career")
  ) {
    return "stale_reset";
  }

  if (
    message.includes("invalid_") ||
    message.includes("month_key") ||
    message.includes("snapshot")
  ) {
    return "validation_failed";
  }

  return "rpc_failed";
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export class SupabaseMonthlyBeastWriteRepository {
  constructor(private readonly client: SupabaseClient) {}

  private async callRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = (await this.client.rpc(fn, args)) as unknown as {
      data: unknown;
      error: SupabaseErrorLike | null;
    };

    if (error) {
      throw new SupabaseMonthlyBeastWriteError(error.message, getRpcCode(error.message));
    }

    return data as T;
  }

  async crownMonth(plan: CrownMonthlyBeastsPlan): Promise<CrownMonthlyBeastsResult> {
    const result = toRecord(
      await this.callRpc("crown_monthly_beasts_atomic", {
        crown_plan: plan
      })
    );

    return {
      ok: result.ok === true,
      id: String(result.id ?? ""),
      monthKey: String(result.month_key ?? result.monthKey ?? plan.monthKey),
      version: Number(result.version ?? 0),
      isDemo: result.is_demo === true || result.isDemo === true
    };
  }

  async reopenMonth(monthKey: string): Promise<ReopenMonthlyBeastsResult> {
    const result = toRecord(
      await this.callRpc("reopen_monthly_beast_crown", {
        month_key: monthKey
      })
    );

    return {
      ok: result.ok === true,
      id: String(result.id ?? ""),
      monthKey: String(result.month_key ?? result.monthKey ?? monthKey),
      version: Number(result.version ?? 0)
    };
  }

  async resetDemoData(plan: ResetDemoPlan): Promise<ResetDemoDataResult> {
    const result = toRecord(
      await this.callRpc("reset_demo_data_atomic", {
        reset_plan: plan
      })
    );

    return {
      ok: result.ok === true,
      demoMatchesRemoved: Number(result.demo_matches_removed ?? result.demoMatchesRemoved ?? 0),
      demoProgressionsRemoved: Number(
        result.demo_progressions_removed ?? result.demoProgressionsRemoved ?? 0
      ),
      demoCrownsRemoved: Number(result.demo_crowns_removed ?? result.demoCrownsRemoved ?? 0),
      demoGalleryRecordsRemoved: Number(
        result.demo_gallery_records_removed ?? result.demoGalleryRecordsRemoved ?? 0
      ),
      careerRowsRebuilt: Number(result.career_rows_rebuilt ?? result.careerRowsRebuilt ?? 0),
      realMatchesPreserved: Number(result.real_matches_preserved ?? result.realMatchesPreserved ?? 0)
    };
  }
}
