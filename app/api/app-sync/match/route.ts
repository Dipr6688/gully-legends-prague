import { NextResponse } from "next/server";
import {
  assemblePendingImportMatch,
  isAppSyncMatchPayload
} from "@/lib/app-sync/assemble-pending-import";
import { getBearerAdminSession } from "@/lib/app-sync/bearer";
import { SupabaseApkImportRepository } from "@/lib/supabase/apk-import-repository";

export async function POST(request: Request) {
  const auth = await getBearerAdminSession(request);

  if (!auth) {
    return NextResponse.json(
      { ok: false, code: "not_admin", message: "ADMIN BEARER TOKEN REQUIRED" },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => null)) as unknown;

  if (!isAppSyncMatchPayload(body)) {
    return NextResponse.json(
      {
        ok: false,
        code: "invalid_payload",
        message: "APK MATCH PAYLOAD IS INVALID OR CONTAINS UNSUPPORTED DISMISSALS"
      },
      { status: 400 }
    );
  }

  const assembly = assemblePendingImportMatch({ payload: body });
  const repository = new SupabaseApkImportRepository(auth.client);
  const result = await repository.upsertPendingImport({
    payload: body,
    derivedMatch: assembly.derivedMatch,
    validationResult: assembly.validationResult,
    matchDate: assembly.matchDate,
    userId: auth.userId
  });

  return NextResponse.json({
    ok: assembly.ok,
    importId: result.importRecord.id,
    reviewStatus: result.importRecord.reviewStatus,
    syncVersion: result.importRecord.syncVersion,
    changed: result.changed,
    ignored: result.ignored,
    validation: assembly.validationResult
  }, { status: assembly.ok ? 200 : 202 });
}
