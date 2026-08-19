import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { isAdminWithClient } from "@/lib/admin/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SupabaseApkImportRepository } from "@/lib/supabase/apk-import-repository";

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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ importId: string }> }
) {
  const { importId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user || !(await isAdminWithClient(supabase))) {
    return NextResponse.json(
      { ok: false, code: "not_admin", message: "ADMIN ACCESS REQUIRED" },
      { status: 403 }
    );
  }

  try {
    await new SupabaseApkImportRepository(supabase).rejectImport(
      importId,
      data.user.id
    );
    revalidatePath("/admin/apk-imports");
    revalidatePath(`/admin/apk-imports/${importId}`);

    return redirectToImport(request, importId, "APK import rejected.", "ok");
  } catch {
    return redirectToImport(request, importId, "Could not reject APK import.", "error");
  }
}
