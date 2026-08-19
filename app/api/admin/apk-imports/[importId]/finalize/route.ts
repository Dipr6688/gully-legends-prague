import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { isAdminWithClient } from "@/lib/admin/auth";
import { getPlayerById } from "@/lib/data/players";
import {
  assemblePendingImportMatch,
  buildApkOfficialMatchId
} from "@/lib/app-sync/assemble-pending-import";
import { isValidIsoCalendarDate } from "@/lib/app-sync/prague-date";
import { buildFinalisationPlan } from "@/lib/supabase/match-finalisation-plan";
import {
  SupabaseMatchFinalisationError,
  SupabaseMatchFinalisationRepository
} from "@/lib/supabase/match-finalisation-repository";
import {
  SupabaseApkImportError,
  SupabaseApkImportRepository
} from "@/lib/supabase/apk-import-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MatchRecord } from "@/lib/types/match";

function redirectToImport(
  request: Request,
  importId: string,
  message: string,
  key: "ok" | "error"
) {
  return NextResponse.redirect(
    new URL(
      `/admin/apk-imports/${importId}?${key}=${encodeURIComponent(message)}`,
      request.url
    )
  );
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

function revalidateFinalisedImportPages(importId: string, matchId: string, playerIds: string[]) {
  revalidatePath("/");
  revalidatePath("/matches");
  revalidatePath(`/matches/${matchId}`);
  revalidatePath("/leaderboard");
  revalidatePath("/monthly-beasts");
  revalidatePath("/admin/apk-imports");
  revalidatePath(`/admin/apk-imports/${importId}`);

  for (const playerId of playerIds) {
    const player = getPlayerById(playerId);
    revalidatePath(`/players/${player?.slug ?? playerId}`);
  }
}

function finalisationErrorMessage(error: unknown): string {
  if (
    error instanceof SupabaseMatchFinalisationError ||
    error instanceof SupabaseApkImportError
  ) {
    return error.message;
  }

  if (error instanceof Error) return error.message;

  return "Could not finalise APK import.";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ importId: string }> }
) {
  const { importId } = await params;
  const formData = await request.formData();
  const correctedMatchDate = String(formData.get("matchDate") ?? "").trim();
  const selectedPom = String(formData.get("playerOfMatchId") ?? "").trim() || null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user || !(await isAdminWithClient(supabase))) {
    return NextResponse.json(
      { ok: false, code: "not_admin", message: "ADMIN ACCESS REQUIRED" },
      { status: 403 }
    );
  }

  const apkRepository = new SupabaseApkImportRepository(supabase);
  const finalisationRepository = new SupabaseMatchFinalisationRepository(supabase);

  try {
    const importRecord = await apkRepository.getById(importId);

    if (!importRecord) {
      throw new SupabaseApkImportError("APK IMPORT NOT FOUND", "not_found");
    }

    if (importRecord.isDemo) {
      throw new SupabaseApkImportError(
        "DEMO APK IMPORTS CANNOT CREATE OFFICIAL MATCHES",
        "not_allowed"
      );
    }

    if (
      importRecord.reviewStatus !== "pending_review" &&
      importRecord.reviewStatus !== "finalised"
    ) {
      throw new SupabaseApkImportError(
        "ONLY PENDING APK IMPORTS CAN BE FINALISED",
        "not_allowed"
      );
    }

    const matchDate = correctedMatchDate || importRecord.matchDate;

    if (!matchDate || !isValidIsoCalendarDate(matchDate)) {
      throw new SupabaseApkImportError(
        "MATCH DATE MUST BE A VALID YYYY-MM-DD DATE",
        "invalid_request"
      );
    }

    const officialMatchId = buildApkOfficialMatchId(importRecord.id);
    const assembly = assemblePendingImportMatch({
      payload: importRecord.rawPayload,
      matchId: officialMatchId,
      matchDate,
      matchNumber: null,
      playerOfMatchId: selectedPom
    });

    if (!assembly.ok) {
      throw new SupabaseApkImportError(
        assembly.errors[0] ?? "APK IMPORT VALIDATION FAILED",
        "invalid_request"
      );
    }

    const playerIds = getPlayedPlayerIds(assembly.derivedMatch);
    const [careerRows, existingApplications] = await Promise.all([
      finalisationRepository.getCareerRows(playerIds),
      finalisationRepository.getMatchApplications(assembly.derivedMatch.id)
    ]);
    const plan = buildFinalisationPlan({
      finalMatch: assembly.derivedMatch,
      expectedMatchUpdatedAt: null,
      careerRows,
      existingApplications
    });
    const result = await apkRepository.finalizeImportAtomically({
      importId,
      finalisationPlan: plan
    });

    revalidateFinalisedImportPages(importId, result.matchId || assembly.derivedMatch.id, playerIds);

    return redirectToImport(
      request,
      importId,
      result.alreadyApplied
        ? "APK import was already finalised."
        : "APK import finalised through the website engine.",
      "ok"
    );
  } catch (error) {
    return redirectToImport(request, importId, finalisationErrorMessage(error), "error");
  }
}
