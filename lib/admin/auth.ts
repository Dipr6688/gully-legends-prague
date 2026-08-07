import type { SupabaseClient, User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AdminSessionState = {
  user: User | null;
  isAdmin: boolean;
};

type AdminAwareClient = SupabaseClient & {
  rpc(fn: "is_admin"): ReturnType<SupabaseClient["rpc"]>;
};

export async function getCurrentUser(): Promise<User | null> {
  if (!getSupabasePublicEnv()) return null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) return null;

  return data.user;
}

export async function isAdminWithClient(supabase: AdminAwareClient) {
  const { data, error } = await supabase.rpc("is_admin");

  if (error) return false;

  return data === true;
}

export async function getAdminSessionState(): Promise<AdminSessionState> {
  if (!getSupabasePublicEnv()) {
    return { user: null, isAdmin: false };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return { user: null, isAdmin: false };
  }

  const isAdmin = await isAdminWithClient(supabase);

  if (!isAdmin) {
    await supabase.auth.signOut();
    return { user: null, isAdmin: false };
  }

  return { user: data.user, isAdmin };
}

export async function isCurrentUserAdmin() {
  const session = await getAdminSessionState();

  return session.isAdmin;
}

export async function requireAdmin() {
  if (!getSupabasePublicEnv()) {
    redirect("/admin/login");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/admin/login");
  }

  const isAdmin = await isAdminWithClient(supabase);

  if (!isAdmin) {
    await supabase.auth.signOut();
    redirect("/admin/login");
  }

  return data.user;
}
