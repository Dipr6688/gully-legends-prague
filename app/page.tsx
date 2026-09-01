import { GullyRulesCard } from "@/components/dashboard/GullyRulesCard";
import { HeroSection } from "@/components/dashboard/HeroSection";
import { MonthlyBeastsPanel } from "@/components/dashboard/MonthlyBeastsPanel";
import { PlayerBrowserSection } from "@/components/dashboard/PlayerBrowserSection";
import { RecentMatchesPanel } from "@/components/dashboard/RecentMatchesPanel";
import { TopPerformersPanel } from "@/components/dashboard/TopPerformersPanel";
import { activePlayers } from "@/lib/data/players";
import { isSupabaseDataSource } from "@/lib/data-source";
import { loadPublicSupabaseReadData } from "@/lib/supabase/public-read-data";
import { getWeekendWeatherViewModel } from "@/lib/weekend-weather-server";
import Image from "next/image";

export const dynamic = "force-dynamic";
export const revalidate = 30;

function PublicReadError() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-10 lg:px-6">
      <div className="gaming-panel card-grit p-5">
        <p className="text-xs font-black uppercase text-neon-cyan">Shared data unavailable</p>
        <h1 className="font-display text-4xl uppercase comic-title">Try Again Soon</h1>
        <p className="mt-3 text-stone-300">
          We could not load the shared Supabase data right now. Please refresh the page.
        </p>
      </div>
    </section>
  );
}

export default async function DashboardPage() {
  const supabaseMode = isSupabaseDataSource();
  const data = supabaseMode ? await loadPublicSupabaseReadData().catch(() => null) : null;

  if (supabaseMode && !data) return <PublicReadError />;

  const players = data?.careerPlayers ?? activePlayers;
  const matches = data?.matches;
  const crownedAwards = data?.crownedAwards;
  const weekendWeather = await getWeekendWeatherViewModel();

  return (
    <>
      <HeroSection players={players} matches={matches} weather={weekendWeather} />
      <section className="lower-dashboard-bg">
        <div className="relative mx-auto max-w-[1680px] px-4 py-7 lg:px-6">
          <div className="dashboard-layout">
            <aside className="dashboard-sidebar">
              <div className="dashboard-monthly">
                <MonthlyBeastsPanel
                  players={players}
                  matches={matches}
                  crownedAwards={crownedAwards}
                />
              </div>
              <div className="play-hard-wrapper">
                <Image
                  src="/ui/play-hard-laugh-harder.png"
                  alt="Play hard but laugh harder"
                  width={1536}
                  height={1024}
                  className="play-hard-artwork"
                />
              </div>
              <div className="next-ball-friends-wrapper">
                <Image
                  src="/ui/decorations/next-ball-best-friends.png"
                  alt="Next ball, best friends"
                  width={867}
                  height={943}
                  className="next-ball-friends-artwork"
                />
              </div>
            </aside>

            <main className="dashboard-main-content">
              <div className="dashboard-upper-row">
                <PlayerBrowserSection players={players} careerResolved={Boolean(data)} />

                <aside className="dashboard-rules">
                  <GullyRulesCard />
                </aside>
              </div>

              <div className="dashboard-lower-row">
                <section className="dashboard-recent">
                  <RecentMatchesPanel players={players} matches={matches} />
                </section>
                <section className="dashboard-top-performers">
                  <TopPerformersPanel
                    players={players}
                    matches={matches}
                    careerResolved={Boolean(data)}
                  />
                </section>
              </div>

              <p className="dashboard-note rounded-md border border-white/12 bg-black/45 px-4 py-3 text-base text-stone-300">
                Note: All players start from Level 0. Levels and ratings update
                only after a match is finalised.
              </p>
            </main>
          </div>
        </div>
      </section>
    </>
  );
}
