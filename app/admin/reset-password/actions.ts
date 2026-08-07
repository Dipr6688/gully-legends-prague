"use server";

import { redirect } from "next/navigation";
import { isAdminWithClient } from "@/lib/admin/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const minimumPasswordLength = 8;

export async function updateAdminPassword(formData: FormData) {
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (newPassword.length < minimumPasswordLength) {
    redirect("/admin/reset-password?error=short");
  }

  if (newPassword !== confirmPassword) {
    redirect("/admin/reset-password?error=mismatch");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error: sessionError } = await supabase.auth.getUser();

  if (sessionError || !data.user) {
    redirect("/admin/reset-password?error=session");
  }

  const isAdmin = await isAdminWithClient(supabase);

  if (!isAdmin) {
    await supabase.auth.signOut();
    redirect("/admin/reset-password?error=session");
  }

  const { error } = await supabase.auth.updateUser({
    password: newPassword
  });

  if (error) {
    redirect("/admin/reset-password?error=update");
  }

  await supabase.auth.signOut();
  redirect("/admin/login?reset=success");
}
