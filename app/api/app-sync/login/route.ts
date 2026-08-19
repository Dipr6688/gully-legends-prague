import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdminWithClient } from "@/lib/admin/auth";
import { getAdminLoginConfig } from "@/lib/admin/env";
import { requireSupabasePublicEnv } from "@/lib/supabase/env";

type LoginBody = {
  adminId?: string;
  password?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as LoginBody | null;

  if (!body?.adminId || !body.password) {
    return NextResponse.json(
      { ok: false, code: "invalid_request", message: "ADMIN ID AND PASSWORD REQUIRED" },
      { status: 400 }
    );
  }

  try {
    const config = getAdminLoginConfig();
    const env = requireSupabasePublicEnv();

    if (!config || body.adminId !== config.adminId) {
      return NextResponse.json(
        { ok: false, code: "invalid_credentials", message: "INVALID LOGIN" },
        { status: 401 }
      );
    }

    const supabase = createClient(env.url, env.publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });
    const { data, error } = await supabase.auth.signInWithPassword({
      email: config.adminEmail,
      password: body.password
    });

    if (error || !data.session || !data.user) {
      return NextResponse.json(
        { ok: false, code: "invalid_credentials", message: "INVALID LOGIN" },
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
