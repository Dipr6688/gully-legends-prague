import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdminWithClient } from "@/lib/admin/auth";
import { requireSupabasePublicEnv } from "@/lib/supabase/env";

type LoginBody = {
  email?: string;
  password?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as LoginBody | null;

  if (!body?.email || !body.password) {
    return NextResponse.json(
      { ok: false, code: "invalid_request", message: "EMAIL AND PASSWORD REQUIRED" },
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
    const { data, error } = await supabase.auth.signInWithPassword({
      email: body.email,
      password: body.password
    });

    if (error || !data.session || !data.user) {
      return NextResponse.json(
        { ok: false, code: "invalid_credentials", message: "ADMIN LOGIN FAILED" },
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
