import { MockMatchEntryForm } from "@/components/matches/MockMatchEntryForm";
import { Card } from "@/components/ui/Card";
import { requireAdmin } from "@/lib/admin/auth";
import { isSupabaseDataSource } from "@/lib/data-source";
import { loadPublicSupabaseReadData } from "@/lib/supabase/public-read-data";

export const metadata = {
  title: "Create Match | Gully Legends Prague"
};

export const dynamic = "force-dynamic";
export const revalidate = 30;

export default async function NewMatchPage() {
  const supabaseMode = isSupabaseDataSource();

  if (supabaseMode) {
    await requireAdmin();
  }

  const data = supabaseMode ? await loadPublicSupabaseReadData().catch(() => null) : null;

  if (supabaseMode && !data) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 lg:px-6">
        <Card>
          <p className="text-xs font-black uppercase text-neon-cyan">Shared matches unavailable</p>
          <h1 className="font-display text-5xl uppercase comic-title">Try Again Soon</h1>
          <p className="mt-3 text-stone-300">
            We could not load the shared Supabase match data. Please refresh the page.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-6">
      <MockMatchEntryForm matches={data?.matches} isAdmin />
    </div>
  );
}
