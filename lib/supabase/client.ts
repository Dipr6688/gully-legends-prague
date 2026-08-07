import { createBrowserClient } from "@supabase/ssr";
import { requireSupabasePublicEnv } from "@/lib/supabase/env";

export function createSupabaseBrowserClient() {
  const env = requireSupabasePublicEnv();

  return createBrowserClient(env.url, env.publishableKey);
}
