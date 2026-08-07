"use server";

import { redirect } from "next/navigation";
import {
  getAdminLoginConfig,
  getAdminPasswordResetRedirectUrl
} from "@/lib/admin/env";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const genericSentRedirect = "/admin/forgot-password?sent=1";

export async function sendAdminPasswordReset(formData: FormData) {
  const config = getAdminLoginConfig();
  const publicEnv = getSupabasePublicEnv();
  const redirectTo = getAdminPasswordResetRedirectUrl();
  const adminId = String(formData.get("adminId") ?? "").trim();

  if (!config || !publicEnv || !redirectTo || adminId !== config.adminId) {
    redirect(genericSentRedirect);
  }

  const supabase = await createSupabaseServerClient();

  await supabase.auth.resetPasswordForEmail(config.adminEmail, {
    redirectTo
  });

  redirect(genericSentRedirect);
}
