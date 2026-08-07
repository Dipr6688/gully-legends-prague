"use server";

import { redirect } from "next/navigation";
import { isAdminWithClient } from "@/lib/admin/auth";
import { getAdminLoginConfig } from "@/lib/admin/env";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const invalidLoginRedirect = "/admin/login?error=invalid";

export async function loginAdmin(formData: FormData) {
  const config = getAdminLoginConfig();
  const publicEnv = getSupabasePublicEnv();
  const adminId = String(formData.get("adminId") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!config || !publicEnv || !adminId || !password || adminId !== config.adminId) {
    redirect(invalidLoginRedirect);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: config.adminEmail,
    password
  });

  if (error || !data.user) {
    await supabase.auth.signOut();
    redirect(invalidLoginRedirect);
  }

  const isAdmin = await isAdminWithClient(supabase);

  if (!isAdmin) {
    await supabase.auth.signOut();
    redirect(invalidLoginRedirect);
  }

  redirect("/admin");
}
