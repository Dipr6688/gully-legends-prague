import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { isAdminWithClient } from "@/lib/admin/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SupabaseVenueSettingsRepository } from "@/lib/supabase/venue-settings-repository";
import { isVenueId } from "@/lib/venues";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return NextResponse.json(
      { ok: false, message: "ADMIN LOGIN REQUIRED", code: "not_authenticated" },
      { status: 401 }
    );
  }

  if (!(await isAdminWithClient(supabase))) {
    return NextResponse.json(
      { ok: false, message: "ADMIN ACCESS REQUIRED", code: "not_admin" },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { venueId?: unknown }
    | null;

  if (!isVenueId(body?.venueId)) {
    return NextResponse.json(
      { ok: false, message: "SELECT A SUPPORTED VENUE", code: "invalid_venue" },
      { status: 400 }
    );
  }

  try {
    const repository = new SupabaseVenueSettingsRepository(supabase);
    const venueId = await repository.setCurrentVenueId(body.venueId, data.user.id);

    revalidatePath("/");
    revalidatePath("/matches/new");
    revalidatePath("/admin");

    return NextResponse.json({ ok: true, venueId });
  } catch {
    return NextResponse.json(
      { ok: false, message: "CURRENT VENUE COULD NOT BE SAVED", code: "write_failed" },
      { status: 500 }
    );
  }
}
