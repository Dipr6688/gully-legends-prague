import { CalendarClock, MapPin, Plus, Shield, Users, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

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

function NextMatchCard() {
  return (
    <section className="rounded-lg border border-white/14 bg-black/90 p-4 shadow-2xl">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div className="stat-label flex items-center gap-2 text-base font-black uppercase">
          <CalendarClock className="h-4 w-4 text-stone-300" aria-hidden="true" />
          Next Match
        </div>
        <button
          type="button"
          className="grid h-8 w-8 place-items-center rounded-md border border-white/10 bg-white/5 hover:bg-white/10"
          aria-label="Dismiss next match preview"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="py-5 text-center font-ui">
        <p className="text-base font-black uppercase tracking-wide text-stone-100">
          Not scheduled
        </p>
        <p className="mt-1 text-sm font-bold uppercase text-stone-400">
          Gully Premier League
        </p>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
        <div className="rounded-md border border-white/10 bg-white/5 p-3">
          <Shield className="mx-auto h-6 w-6 text-neon-violet" aria-hidden="true" />
          <p className="mt-2 text-xs font-black uppercase">Team A</p>
        </div>
        <span className="rounded-full bg-neon-yellow px-2 py-1 text-xs font-black text-pitch-950">
          VS
        </span>
        <div className="rounded-md border border-white/10 bg-white/5 p-3">
          <Shield className="mx-auto h-6 w-6 text-neon-red" aria-hidden="true" />
          <p className="mt-2 text-xs font-black uppercase">Team B</p>
        </div>
      </div>
    </section>
  );
}

function ActionStats() {
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
        <HeroStat label="Total Matches" value={0} />
        <HeroStat
          label="Players"
          value={4}
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

function HeroControls() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(250px,300px)_minmax(230px,270px)_minmax(0,1fr)] lg:items-end">
      <div className="hidden lg:block" />
      <NextMatchCard />
      <ActionStats />
    </div>
  );
}

export function HeroSection() {
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
            <HeroControls />
          </div>
        </div>
      </div>

      <div className="relative z-10 grid gap-4 bg-[#05080d] px-4 py-4 sm:px-6 lg:hidden">
        <HeroControls />
      </div>
    </section>
  );
}
