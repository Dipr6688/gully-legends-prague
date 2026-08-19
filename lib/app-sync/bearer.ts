import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export type BearerAdminSession = {
  client: SupabaseClient;
  userId: string;
};

type AdminAwareClient = SupabaseClient & {
  rpc(fn: "is_admin"): ReturnType<SupabaseClient["rpc"]>;
};

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());

  return match?.[1] ?? null;
}

export function createBearerSupabaseClient(accessToken: string): SupabaseClient | null {
  const env = getSupabasePublicEnv();

  if (!env) return null;

  return createClient(env.url, env.publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });
}

export async function isBearerClientAdmin(client: SupabaseClient): Promise<boolean> {
  const { data, error } = await (client as AdminAwareClient).rpc("is_admin");

  return !error && data === true;
}

export async function getBearerAdminSession(
  request: Request
): Promise<BearerAdminSession | null> {
  const token = getBearerToken(request);

  if (!token) return null;

  const client = createBearerSupabaseClient(token);

  if (!client) return null;

  const { data, error } = await client.auth.getUser(token);

  if (error || !data.user) return null;

  const isAdmin = await isBearerClientAdmin(client);

  return isAdmin ? { client, userId: data.user.id } : null;
}
