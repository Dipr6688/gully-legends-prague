import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdminWithClient } from "@/lib/admin/auth";
import { requireSupabasePublicEnv } from "@/lib/supabase/env";

type RefreshBody = {
  refreshToken?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as RefreshBody | null;

  if (!body?.refreshToken) {
    return NextResponse.json(
      { ok: false, code: "invalid_request", message: "REFRESH TOKEN REQUIRED" },
      { status: 400 }
    );
  }

  try {
    const env = requireSupabasePublicEnv();
    const supabase = createClient(env.url, env.publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: body.refreshToken
    });

    if (error || !data.session || !data.user) {
      return NextResponse.json(
        { ok: false, code: "refresh_failed", message: "ADMIN SESSION REFRESH FAILED" },
        { status: 401 }
      );
    }

    const isAdmin = await isAdminWithClient(supabase);

    if (!isAdmin) {
      await supabase.auth.signOut();
      return NextResponse.json(
        { ok: false, code: "not_admin", message: "ADMIN ACCESS REQUIRED" },
        { status: 403 }
      );
    }

    return NextResponse.json({
      ok: true,
      userId: data.user.id,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at ?? null
    });
  } catch {
    return NextResponse.json(
      { ok: false, code: "supabase_not_configured", message: "SUPABASE IS NOT CONFIGURED" },
      { status: 503 }
    );
  }
}
