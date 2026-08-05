import { GullyRulesCard } from "@/components/dashboard/GullyRulesCard";
import { HeroSection } from "@/components/dashboard/HeroSection";
import { MonthlyBeastsPanel } from "@/components/dashboard/MonthlyBeastsPanel";
import { RecentMatchesPanel } from "@/components/dashboard/RecentMatchesPanel";
import { TopPerformersPanel } from "@/components/dashboard/TopPerformersPanel";
import { PlayerGrid } from "@/components/players/PlayerGrid";
import { players } from "@/lib/data/players";
import Image from "next/image";

export default function DashboardPage() {
  return (
    <>
      <HeroSection />
      <section className="lower-dashboard-bg">
        <div className="relative mx-auto max-w-[1680px] px-4 py-7 lg:px-6">
          <div className="dashboard-layout">
            <aside className="dashboard-sidebar">
              <div className="dashboard-monthly">
                <MonthlyBeastsPanel />
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
                <section className="dashboard-players space-y-5">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                    <div>
                      <h2 className="arcade-heading text-[2.25rem] uppercase">
                        Our Players
                      </h2>
                      <p className="stat-label mt-2 text-base font-bold uppercase text-neon-cyan">
                        {players.length} Warriors
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-sm font-black uppercase">
                      <span className="rounded-md bg-neon-yellow px-3 py-2 text-pitch-950">
                        All
                      </span>
                      <span className="rounded-md border border-white/12 bg-white/5 px-3 py-2 text-stone-300">
                        All-Rounders
                      </span>
                    </div>
                  </div>
                  <PlayerGrid players={players} />
                </section>

                <aside className="dashboard-rules">
                  <GullyRulesCard />
                </aside>
              </div>

              <div className="dashboard-lower-row">
                <section className="dashboard-recent">
                  <RecentMatchesPanel />
                </section>
                <section className="dashboard-top-performers">
                  <TopPerformersPanel />
                </section>
              </div>

              <p className="dashboard-note rounded-md border border-white/12 bg-black/45 px-4 py-3 text-base text-stone-300">
                Note: All players start from Level 0. Levels and ratings will update
                only after finalised matches are introduced in a later phase.
              </p>
            </main>
          </div>
        </div>
      </section>
    </>
  );
}
