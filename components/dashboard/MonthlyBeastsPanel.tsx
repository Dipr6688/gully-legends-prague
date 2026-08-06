"use client";

import { CalendarDays } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { useMatchRepository } from "@/components/matches/useMatchRepository";
import { activePlayers } from "@/lib/data/players";
import {
  getCurrentMonthKey,
  getMonthlyBeastDashboardPreview,
  MONTHLY_BEAST_CATEGORIES,
  type CrownedMonthlyBeasts
} from "@/lib/monthly-beasts";
import {
  loadCrownedMonthlyBeasts,
  MONTHLY_BEASTS_UPDATED_EVENT
} from "@/lib/monthly-beasts-store";

const awards = [
  {
    category: "batting",
    imageAlt: "Batting Beast",
    imageScale: 1.02
  },
  {
    category: "bowling",
    imageAlt: "Bowling Beast",
    imageScale: 1.02
  },
  {
    category: "fielding",
    imageAlt: "Fielding Beast",
    imageScale: 1.04
  }
] as const;

export function MonthlyBeastsPanel() {
  const { matches } = useMatchRepository();
  const [crownedAwards, setCrownedAwards] = useState<CrownedMonthlyBeasts[]>([]);
  const playerNames = useMemo(
    () => Object.fromEntries(activePlayers.map((player) => [player.id, player.name])),
    []
  );
  const previews = useMemo(
    () =>
      getMonthlyBeastDashboardPreview({
        matches,
        crownedAwards,
        monthKey: getCurrentMonthKey(),
        playerNames
      }),
    [crownedAwards, matches, playerNames]
  );
  const previewByCategory = useMemo(
    () => new Map(previews.map((preview) => [preview.category, preview])),
    [previews]
  );

  useEffect(() => {
    function refreshMonthlyBeasts() {
      setCrownedAwards(loadCrownedMonthlyBeasts());
    }

    refreshMonthlyBeasts();
    window.addEventListener("storage", refreshMonthlyBeasts);
    window.addEventListener(MONTHLY_BEASTS_UPDATED_EVENT, refreshMonthlyBeasts);

    return () => {
      window.removeEventListener("storage", refreshMonthlyBeasts);
      window.removeEventListener(MONTHLY_BEASTS_UPDATED_EVENT, refreshMonthlyBeasts);
    };
  }, []);

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
        {awards.map(({ category, imageAlt, imageScale }) => {
          const meta = MONTHLY_BEAST_CATEGORIES[category];
          const preview = previewByCategory.get(category);

          return (
          <div key={category} className="flex items-center gap-4 py-3">
            <div className="beast-icon-circle border border-neon-cyan/25 bg-black/45">
              <Image
                src={meta.icon}
                alt={imageAlt}
                width={96}
                height={96}
                className="beast-icon-image"
                style={{ transform: `scale(${imageScale})` }}
              />
            </div>
            <div>
              <p className="stat-label text-sm font-black uppercase text-stone-100">
                {meta.compactTitle}
              </p>
              <p className="text-sm font-medium text-neon-yellow">
                {preview?.primaryText ?? "Race not started"}
              </p>
              {preview?.supportingText ? (
                <p className="text-xs font-bold uppercase text-stone-400">
                  {preview.supportingText}
                </p>
              ) : null}
            </div>
          </div>
          );
        })}
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
