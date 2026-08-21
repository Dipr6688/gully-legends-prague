import { GullyFaceOffArena } from "@/components/face-off/GullyFaceOffArena";
import { Card } from "@/components/ui/Card";
import { activePlayers } from "@/lib/data/players";
import { isSupabaseDataSource } from "@/lib/data-source";
import { loadPublicSupabaseReadData } from "@/lib/supabase/public-read-data";

export const dynamic = "force-dynamic";
export const revalidate = 30;

function PublicReadError() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-6">
      <Card>
        <p className="text-xs font-black uppercase text-neon-cyan">
          Face-Off arena unavailable
        </p>
        <h1 className="font-display text-5xl uppercase comic-title">Try Again Soon</h1>
        <p className="mt-3 max-w-3xl text-stone-300">
          We could not load the shared Supabase Face-Off data. Please refresh the page.
        </p>
      </Card>
    </div>
  );
}

export default async function FaceOffPage() {
  const supabaseMode = isSupabaseDataSource();
  const data = supabaseMode ? await loadPublicSupabaseReadData().catch(() => null) : null;

  if (supabaseMode && !data) return <PublicReadError />;

  return (
    <GullyFaceOffArena
      players={data?.careerPlayers ?? activePlayers}
      matches={data?.matches}
      careerResolved={Boolean(data)}
    />
  );
}
