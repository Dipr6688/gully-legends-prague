"use client";

import { MapPin, Plus, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { activePlayers } from "@/lib/data/players";
import type { DashboardSummary } from "@/lib/dashboard-summary";
import { getDashboardSummary } from "@/lib/dashboard-summary";
import { useDashboardSummary } from "@/components/dashboard/useDashboardSummary";
import { WeekendWeather } from "@/components/dashboard/WeekendWeather";
import {
  applyWeekendMatchDayMarkers,
  type WeekendWeatherViewModel
} from "@/lib/weekend-weather";
import type { MatchRecord } from "@/lib/types/match";
import type { Player } from "@/lib/types/player";

function HeroStat({
  label,
  value,
  icon
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="min-h-[72px] rounded-lg border border-stone-600/35 bg-[rgba(8,10,14,0.94)] px-4 py-3 shadow-[0_12px_26px_rgba(0,0,0,0.42),0_0_14px_rgba(247,199,52,0.08)]">
      <div className="stat-label flex items-center gap-2 text-xs font-bold uppercase text-stone-200">
        {icon}
        {label}
      </div>
      <div className="mt-1 font-ui text-2xl font-black leading-6 text-stone-50">{value}</div>
    </div>
  );
}

function ActionStats({ summary }: { summary: DashboardSummary }) {
  return (
    <div className="flex flex-col items-start gap-2 lg:items-end">
      <Link
        href="/matches/new"
        className="neon-button inline-flex min-h-[58px] items-center justify-center gap-2 border border-black/70 bg-neon-yellow px-5 py-2 font-ui text-base font-black uppercase tracking-wide text-pitch-950 transition hover:-translate-y-0.5 hover:scale-[1.03] hover:bg-yellow-200 focus:outline-none focus:ring-2 focus:ring-neon-cyan focus:ring-offset-2 focus:ring-offset-pitch-950"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Create Match
        <Image
          src="/ui/create-match-button.png"
          alt=""
          width={40}
          height={40}
          className="h-10 w-10 rounded-sm object-contain"
          aria-hidden="true"
        />
      </Link>
      <div className="grid w-full max-w-[560px] gap-2 sm:grid-cols-3">
        <HeroStat label="Matches Played" value={summary.totalFinalisedMatches} />
        <HeroStat
          label="Players"
          value={summary.activePlayerCount}
          icon={<Users className="h-4 w-4" aria-hidden="true" />}
        />
        <HeroStat
          label="Venue"
          value={
            <span className="text-base leading-5">
              ČZU Gully Arena
              <span className="block text-xs font-bold text-stone-300">
                Open Field, Prague
              </span>
            </span>
          }
          icon={<MapPin className="h-4 w-4" aria-hidden="true" />}
        />
      </div>
    </div>
  );
}

function HeroControls({
  players,
  matches,
  weather
}: {
  players?: Player[];
  matches?: MatchRecord[];
  weather: WeekendWeatherViewModel;
}) {
  const localDashboard = useDashboardSummary(activePlayers);
  const resolvedPlayers = players ?? activePlayers;
  const resolvedMatches = matches ?? localDashboard.matches;
  const markedWeather = applyWeekendMatchDayMarkers(
    weather,
    resolvedMatches as MatchRecord[]
  );
  const summary = matches
    ? getDashboardSummary({ matches: resolvedMatches, players: resolvedPlayers })
    : localDashboard.summary;

  return (
    <div className="hero-controls-grid grid gap-4 lg:items-end">
      <WeekendWeather weather={markedWeather} />
      <ActionStats summary={summary} />
    </div>
  );
}

export function HeroSection({
  players,
  matches,
  weather
}: {
  players?: Player[];
  matches?: MatchRecord[];
  weather: WeekendWeatherViewModel;
}) {
  return (
    <section
      className="relative w-full border-b border-white/10 bg-pitch-950"
      style={{ "--hero-top-crop": "clamp(30px,4.8vw,90px)" } as React.CSSProperties}
    >
      <div className="relative overflow-hidden">
        <Image
          src="/backgrounds/prague-gully-arena.png"
          alt="ČZU Gully Arena in Prague"
          width={1672}
          height={941}
          priority
          className="block h-auto w-full"
          style={{
            marginBottom: "calc(var(--hero-top-crop) * -1)",
            transform: "translateY(calc(var(--hero-top-crop) * -1))"
          }}
        />

        <div className="absolute inset-0 hidden lg:block">
          <div className="absolute inset-x-0 bottom-[clamp(20px,4vw,64px)] mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8">
            <HeroControls players={players} matches={matches} weather={weather} />
          </div>
        </div>
      </div>

      <div className="relative z-10 grid gap-4 bg-[#05080d] px-4 py-4 sm:px-6 lg:hidden">
        <HeroControls players={players} matches={matches} weather={weather} />
      </div>
    </section>
  );
}
