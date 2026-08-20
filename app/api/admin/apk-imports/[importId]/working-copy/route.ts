import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { isAdminWithClient } from "@/lib/admin/auth";
import {
  applyApkReviewEventForm,
  assembleApkReviewWorkingCopy,
  deleteApkReviewEvent,
  getApkReviewPayload,
  insertApkReviewEventAfter,
  isApkReviewWorkingCopyStale,
  updateApkReviewEvent,
  updateApkReviewOverBowler
} from "@/lib/app-sync/review-working-copy";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  SupabaseApkImportError,
  SupabaseApkImportRepository
} from "@/lib/supabase/apk-import-repository";
import type { AppSyncMatchPayload } from "@/lib/app-sync/types";

type EditableInningsKey = "inningsAEvents" | "inningsBEvents";

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

function getInningsKey(formData: FormData): EditableInningsKey {
  return formData.get("inningsKey") === "inningsBEvents"
    ? "inningsBEvents"
    : "inningsAEvents";
}

function getExpectedReviewVersion(formData: FormData): number {
  const parsed = Number.parseInt(String(formData.get("expectedReviewVersion") ?? ""), 10);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new SupabaseApkImportError("REVIEW COPY VERSION REQUIRED", "invalid_request");
  }

  return parsed;
}

function findEvent(payload: AppSyncMatchPayload, inningsKey: EditableInningsKey, eventId: string) {
  return payload[inningsKey].find((event) => event.id === eventId) ?? null;
}

function saveErrorMessage(error: unknown): string {
  if (error instanceof SupabaseApkImportError || error instanceof Error) {
    return error.message;
  }

  return "Could not save APK review copy.";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ importId: string }> }
) {
  const { importId } = await params;
  const formData = await request.formData();
  const action = String(formData.get("action") ?? "");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user || !(await isAdminWithClient(supabase))) {
    return NextResponse.json(
      { ok: false, code: "not_admin", message: "ADMIN ACCESS REQUIRED" },
      { status: 403 }
    );
  }

  const repository = new SupabaseApkImportRepository(supabase);

  try {
    const importRecord = await repository.getById(importId);

    if (!importRecord) {
      throw new SupabaseApkImportError("APK IMPORT NOT FOUND", "not_found");
    }

    if (importRecord.reviewStatus !== "pending_review") {
      throw new SupabaseApkImportError(
        "ONLY PENDING APK IMPORTS CAN BE EDITED",
        "not_allowed"
      );
    }

    if (isApkReviewWorkingCopyStale(importRecord) && action !== "reset_to_raw") {
      throw new SupabaseApkImportError(
        "A newer APK upload is available. Reset to the latest raw APK data before editing again.",
        "not_allowed"
      );
    }

    let payload = getApkReviewPayload(importRecord);
    const expectedReviewVersion = getExpectedReviewVersion(formData);

    if ((importRecord.reviewVersion ?? 0) !== expectedReviewVersion) {
      throw new SupabaseApkImportError(
        "This match was changed in another Admin session. Reload the latest version before saving your changes.",
        "conflict"
      );
    }

    const inningsKey = getInningsKey(formData);
    const eventId = String(formData.get("eventId") ?? "");

    if (action === "reset_to_raw") {
      payload = importRecord.rawPayload;
    } else if (action === "update_event") {
      const currentEvent = findEvent(payload, inningsKey, eventId);

      if (!currentEvent) {
        throw new SupabaseApkImportError("APK EVENT NOT FOUND", "not_found");
      }

      payload = updateApkReviewEvent(
        payload,
        inningsKey,
        currentEvent.id,
        applyApkReviewEventForm(
          {
            ...currentEvent,
            bowlerId: String(formData.get("bowlerId") ?? currentEvent.bowlerId)
          },
          formData
        )
      );
    } else if (action === "delete_event") {
      payload = deleteApkReviewEvent(payload, inningsKey, eventId);
    } else if (action === "insert_after") {
      payload = insertApkReviewEventAfter(payload, inningsKey, eventId);
    } else if (action === "update_over_bowler") {
      const overNumber = Number.parseInt(String(formData.get("overNumber") ?? ""), 10);
      const bowlerId = String(formData.get("bowlerId") ?? "").trim();

      if (!Number.isInteger(overNumber) || overNumber <= 0 || !bowlerId) {
        throw new SupabaseApkImportError("INVALID OVER BOWLER CHANGE", "invalid_request");
      }

      payload = updateApkReviewOverBowler(payload, inningsKey, overNumber, bowlerId);
    } else {
      throw new SupabaseApkImportError("UNKNOWN APK REVIEW ACTION", "invalid_request");
    }

    const assembly = assembleApkReviewWorkingCopy({
      importRecord,
      payload
    });

    await repository.saveReviewPayload({
      importId,
      payload,
      derivedMatch: assembly.derivedMatch,
      validationResult: assembly.validationResult,
      matchDate: assembly.matchDate,
      userId: data.user.id,
      sourceSyncVersion: importRecord.syncVersion,
      expectedReviewVersion
    });

    revalidatePath("/admin/apk-imports");
    revalidatePath(`/admin/apk-imports/${importId}`);

    return redirectToImport(request, importId, "APK review working copy updated.", "ok");
  } catch (error) {
    return redirectToImport(request, importId, saveErrorMessage(error), "error");
  }
}
