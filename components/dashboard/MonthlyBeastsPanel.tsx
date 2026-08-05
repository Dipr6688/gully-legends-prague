import { CalendarDays } from "lucide-react";
import Image from "next/image";
import { Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";

const awards = [
  {
    label: "Batting Beast",
    imageSrc: "/ui/monthly-beasts/monthly-batting-beast-trimmed.png",
    imageAlt: "Batting Beast",
    imageScale: 1.02
  },
  {
    label: "Bowling Beast",
    imageSrc: "/ui/monthly-beasts/monthly-bowling-beast-trimmed.png",
    imageAlt: "Bowling Beast",
    imageScale: 1.02
  },
  {
    label: "Catching Beast",
    imageSrc: "/ui/monthly-beasts/monthly-catching-beast-trimmed.png",
    imageAlt: "Catching Beast",
    imageScale: 1.04
  }
];

export function MonthlyBeastsPanel() {
  return (
    <Card className="border-neon-violet/35 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="arcade-heading text-[1.7rem] uppercase">
            Monthly Beasts
          </h2>
          <p className="stat-label mt-2 text-xs font-bold uppercase text-stone-400">
            Current month
          </p>
        </div>
        <CalendarDays className="h-5 w-5 text-stone-300" aria-hidden="true" />
      </div>
      <div className="mt-4 divide-y divide-white/10">
        {awards.map(({ label, imageSrc, imageAlt, imageScale }) => (
          <div key={label} className="flex items-center gap-4 py-3">
            <div className="beast-icon-circle border border-neon-cyan/25 bg-black/45">
              <Image
                src={imageSrc}
                alt={imageAlt}
                width={96}
                height={96}
                className="beast-icon-image"
                style={{ transform: `scale(${imageScale})` }}
              />
            </div>
            <div>
              <p className="stat-label text-sm font-black uppercase text-stone-100">
                {label}
              </p>
              <p className="text-sm font-medium text-neon-yellow">Not decided yet</p>
            </div>
          </div>
        ))}
      </div>
      <LinkButton href="/monthly-beasts" variant="secondary" className="mt-4 w-full">
        <Image
          src="/ui/view-all-leaderboard-trophy.png"
          alt=""
          width={1536}
          height={1024}
          className="h-7 w-7 object-contain"
          aria-hidden="true"
        />
        View Monthly Beasts
      </LinkButton>
    </Card>
  );
}
