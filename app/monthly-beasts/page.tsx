import { Suspense } from "react";
import { MonthlyBeastsFeature } from "@/components/monthly-beasts/MonthlyBeastsFeature";
import { Card } from "@/components/ui/Card";
import { isCurrentUserAdmin } from "@/lib/admin/auth";
import { isSupabaseDataSource } from "@/lib/data-source";
import { loadPublicSupabaseReadData } from "@/lib/supabase/public-read-data";

export const dynamic = "force-dynamic";
export const revalidate = 30;

export default async function MonthlyBeastsPage() {
  const isAdmin = await isCurrentUserAdmin();
  const supabaseMode = isSupabaseDataSource();
  const data = supabaseMode ? await loadPublicSupabaseReadData().catch(() => null) : null;

  if (supabaseMode && !data) {
    return (
      <div className="mx-auto max-w-[1480px] px-4 py-8 lg:px-6">
        <Card>
          <p className="text-xs font-black uppercase text-neon-cyan">Shared beast race unavailable</p>
          <h1 className="font-display text-5xl uppercase comic-title">Try Again Soon</h1>
          <p className="mt-3 text-stone-300">
            We could not load shared Supabase Monthly Beast data. Please refresh the page.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1480px] px-4 py-8 lg:px-6">
      <Suspense fallback={null}>
        <MonthlyBeastsFeature
          isAdmin={isAdmin}
          initialMatches={data?.matches}
          initialCrownedAwards={data?.crownedAwards}
          supabaseReadMode={Boolean(data)}
        />
      </Suspense>
    </div>
  );
}
