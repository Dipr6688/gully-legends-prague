export type PublicDataSource = "local" | "supabase";

export function getPublicDataSource(): PublicDataSource {
  return process.env.NEXT_PUBLIC_DATA_SOURCE === "local" ? "local" : "supabase";
}

export function isSupabaseDataSource() {
  return getPublicDataSource() === "supabase";
}
