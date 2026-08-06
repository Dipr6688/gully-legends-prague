"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Crown, Trophy } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/Button";
import { useMatchRepository } from "@/components/matches/useMatchRepository";
import { activePlayers } from "@/lib/data/players";
import {
  addMonthsToMonthKey,
  createCrownedMonthlyBeasts,
  formatMonthLabel,
  getCrownedMonthlyBeasts,
  getCurrentMonthKey,
  getFinalisedMatchesForMonth,
  getMonthlyBeastSummary,
  getWinnersForCategory,
  isFutureMonthKey,
  isValidMonthKey,
  MONTHLY_BEAST_CATEGORIES,
  type CrownedMonthlyBeasts,
  type MonthlyBeastCategory,
  type MonthlyBeastSummary
} from "@/lib/monthly-beasts";
import {
  loadCrownedMonthlyBeasts,
  MONTHLY_BEASTS_UPDATED_EVENT,
  saveCrownedMonthlyBeastSnapshot
} from "@/lib/monthly-beasts-store";
import type { Player } from "@/lib/types/player";

const categories = Object.keys(MONTHLY_BEAST_CATEGORIES) as MonthlyBeastCategory[];

const accentColors = {
  orange: "#ff8f1f",
  purple: "#c557ff",
  green: "#9cff24"
} as const;

function useCrownedAwards() {
  const [crownedAwards, setCrownedAwards] = useState<CrownedMonthlyBeasts[]>([]);

  useEffect(() => {
    function refreshAwards() {
      setCrownedAwards(loadCrownedMonthlyBeasts());
    }

    refreshAwards();
    window.addEventListener("storage", refreshAwards);
    window.addEventListener(MONTHLY_BEASTS_UPDATED_EVENT, refreshAwards);

    return () => {
      window.removeEventListener("storage", refreshAwards);
      window.removeEventListener(MONTHLY_BEASTS_UPDATED_EVENT, refreshAwards);
    };
  }, []);

  return [crownedAwards, setCrownedAwards] as const;
}

function getPlayer(playerId: string) {
  return activePlayers.find((player) => player.id === playerId) ?? null;
}

function joinPlayerNames(winners: Array<{ playerId: string }>) {
  return winners
    .map((winner) => getPlayer(winner.playerId)?.name ?? winner.playerId)
    .join(" & ");
}

function getSelectedMonth(monthParam: string | null) {
  const currentMonth = getCurrentMonthKey();

  if (!isValidMonthKey(monthParam) || isFutureMonthKey(monthParam)) {
    return currentMonth;
  }

  return monthParam;
}

function MonthSelector({
  selectedMonth,
  onSelectMonth
}: {
  selectedMonth: string;
  onSelectMonth: (monthKey: string) => void;
}) {
  const previousMonth = addMonthsToMonthKey(selectedMonth, -1);
  const nextMonth = addMonthsToMonthKey(selectedMonth, 1);
  const isNextDisabled = isFutureMonthKey(nextMonth);

  return (
    <div className="monthly-beasts-month-selector" aria-label="Monthly Beasts month">
      <button type="button" onClick={() => onSelectMonth(previousMonth)}>
        <ChevronLeft aria-hidden="true" />
        <span className="sr-only">Previous month</span>
      </button>
      <strong>{formatMonthLabel(previousMonth)}</strong>
      <span aria-current="date">{formatMonthLabel(selectedMonth)}</span>
      <button
        type="button"
        onClick={() => onSelectMonth(nextMonth)}
        disabled={isNextDisabled}
      >
        <ChevronRight aria-hidden="true" />
        <span className="sr-only">Next month</span>
      </button>
    </div>
  );
}

function LeaderPortraits({ leaders }: { leaders: Array<{ playerId: string }> }) {
  const leaderPlayers = leaders
    .map((leader) => getPlayer(leader.playerId))
    .filter((player): player is Player => Boolean(player));

  if (leaderPlayers.length === 0) return null;

  return (
    <div className="monthly-beast-portraits" aria-label="Current leader portraits">
      {leaderPlayers.slice(0, 2).map((player) => (
        <Link
          key={player.id}
          href={`/players/${player.slug}`}
          className="monthly-beast-portrait"
        >
          <Image
            src={player.cardImage}
            alt={`${player.name} player card`}
            fill
            sizes="180px"
            className="monthly-beast-portrait-image"
            quality={100}
          />
        </Link>
      ))}
      {leaderPlayers.length > 2 ? (
        <span className="monthly-beast-extra-count">+{leaderPlayers.length - 2}</span>
      ) : null}
    </div>
  );
}

function CategoryPanel({
  category,
  summary,
  crownedAward
}: {
  category: MonthlyBeastCategory;
  summary: MonthlyBeastSummary;
  crownedAward: CrownedMonthlyBeasts | null;
}) {
  const meta = MONTHLY_BEAST_CATEGORIES[category];
  const crownedWinners = crownedAward
    ? getWinnersForCategory(crownedAward, category)
    : [];
  const isCrowned = Boolean(crownedAward);
  const activeLeaders = isCrowned ? crownedWinners : summary.leaders;
  const hasLeaders = activeLeaders.length > 0;
  const headline = !hasLeaders
    ? meta.emptyTitle
    : isCrowned
      ? activeLeaders.length > 1
        ? "OFFICIAL JOINT WINNERS"
        : "OFFICIAL WINNER"
      : summary.status === "joint-leaders"
        ? "JOINT LEADERS"
        : "CURRENT LEADER";
  const names = hasLeaders ? joinPlayerNames(activeLeaders) : "";
  const xpValue = hasLeaders ? activeLeaders[0].categoryXp : 0;

  return (
    <article
      className={`monthly-beast-card monthly-beast-card-${meta.accent}`}
      style={{ "--beast-accent": accentColors[meta.accent] } as CSSProperties}
    >
      <div className="monthly-beast-card-header">
        <div className="monthly-beast-card-icon" aria-hidden="true">
          <Image
            src={meta.icon}
            alt=""
            fill
            sizes="88px"
            className="monthly-beast-card-icon-image"
          />
        </div>
        <div>
          <p>{isCrowned ? "CROWNED" : "RACE IN PROGRESS"}</p>
          <h2>{meta.title}</h2>
        </div>
      </div>

      <div className="monthly-beast-leader-stage">
        {hasLeaders ? <LeaderPortraits leaders={activeLeaders} /> : null}
        <div className="monthly-beast-leader-copy">
          <span>{headline}</span>
          {hasLeaders ? (
            <>
              <strong>{names}</strong>
              <b>
                {xpValue} {meta.xpLabel}
                {activeLeaders.length > 1 ? " EACH" : ""}
              </b>
            </>
          ) : (
            <p>{meta.emptyCopy}</p>
          )}
        </div>
      </div>

      <div className="monthly-beast-standings">
        <h3>Top Three Contenders</h3>
        {summary.topThree.length > 0 ? (
          <div className="monthly-beast-standing-list">
            {summary.topThree.map((standing) => {
              const player = getPlayer(standing.playerId);
              const behind = summary.highestXp - standing.categoryXp;

              return (
                <Link
                  key={`${category}-${standing.playerId}`}
                  href={`/players/${player?.slug ?? standing.playerId}`}
                  className="monthly-beast-standing-row"
                >
                  <span>{standing.rank}</span>
                  <strong>{player?.name ?? standing.playerId}</strong>
                  <b>{standing.categoryXp} XP</b>
                  <small>{behind > 0 ? `${behind} behind` : "Leader"}</small>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="monthly-beast-empty-note">Race not started</p>
        )}
      </div>
    </article>
  );
}

function CrownDialog({
  selectedMonth,
  snapshot,
  onCancel,
  onConfirm
}: {
  selectedMonth: string;
  snapshot: CrownedMonthlyBeasts;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="monthly-beasts-dialog-backdrop">
      <section
        className="monthly-beasts-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="monthly-beasts-dialog-title"
      >
        <p className="formula-eyebrow">Confirm crown</p>
        <h2 id="monthly-beasts-dialog-title">
          Crown the {formatMonthLabel(selectedMonth)} Monthly Beasts?
        </h2>
        <div className="monthly-beasts-dialog-list">
          {categories.map((category) => {
            const meta = MONTHLY_BEAST_CATEGORIES[category];
            const winners = getWinnersForCategory(snapshot, category);

            return (
              <div key={category}>
                <span>{meta.title}</span>
                <strong>
                  {winners.length > 0 ? joinPlayerNames(winners) : "Race not started"}
                </strong>
                {winners.length > 0 ? (
                  <small>
                    {winners[0].categoryXp} {meta.xpLabel}
                    {winners.length > 1 ? " EACH" : ""}
                  </small>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="monthly-beasts-dialog-actions">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm}>
            Crown Beasts
          </Button>
        </div>
      </section>
    </div>
  );
}

function PastBeastsArchive({ crownedAwards }: { crownedAwards: CrownedMonthlyBeasts[] }) {
  const archiveAwards = [...crownedAwards].sort((left, right) =>
    right.monthKey.localeCompare(left.monthKey)
  );

  return (
    <section className="monthly-beasts-archive">
      <div className="monthly-beasts-section-heading">
        <p>Official archive</p>
        <h2>Past Beasts</h2>
      </div>
      {archiveAwards.length > 0 ? (
        <div className="monthly-beasts-archive-grid">
          {archiveAwards.map((award) => (
            <article key={award.monthKey} className="monthly-beasts-archive-card">
              <h3>{formatMonthLabel(award.monthKey)}</h3>
              <div>
                {categories.map((category) => {
                  const meta = MONTHLY_BEAST_CATEGORIES[category];
                  const winners = getWinnersForCategory(award, category);

                  return (
                    <section key={category}>
                      <Image src={meta.icon} alt="" width={42} height={42} />
                      <span>{meta.title}</span>
                      {winners.length > 0 ? (
                        <>
                          <strong>{joinPlayerNames(winners)}</strong>
                          <small>
                            {winners[0].categoryXp} {meta.xpLabel}
                            {winners.length > 1 ? " EACH" : ""}
                          </small>
                        </>
                      ) : (
                        <strong>Race not started</strong>
                      )}
                    </section>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="monthly-beasts-empty-archive">
          Crown a month to open the official Beast archive.
        </p>
      )}
    </section>
  );
}

export function MonthlyBeastsFeature() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { matches } = useMatchRepository();
  const [crownedAwards, setCrownedAwards] = useCrownedAwards();
  const selectedMonth = getSelectedMonth(searchParams.get("month"));
  const crownedAward = getCrownedMonthlyBeasts({
    crownedAwards,
    monthKey: selectedMonth
  });
  const summaries = Object.fromEntries(
    categories.map((category) => [
      category,
      getMonthlyBeastSummary({ matches, monthKey: selectedMonth, category })
    ])
  ) as Record<MonthlyBeastCategory, MonthlyBeastSummary>;
  const finalisedMatchesForMonth = getFinalisedMatchesForMonth({
    matches,
    monthKey: selectedMonth
  });
  const hasAnyRace = categories.some(
    (category) => summaries[category].status !== "race-not-started"
  );
  const crownDisabled =
    finalisedMatchesForMonth.length === 0 || !hasAnyRace || Boolean(crownedAward);
  const [pendingSnapshot, setPendingSnapshot] = useState<CrownedMonthlyBeasts | null>(
    null
  );

  useEffect(() => {
    document.title = "MONTHLY BEASTS | Gully Legends Prague";
  }, []);

  function updateMonth(monthKey: string) {
    if (isFutureMonthKey(monthKey)) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("month", monthKey);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function openCrownDialog() {
    if (crownDisabled) return;

    setPendingSnapshot(
      createCrownedMonthlyBeasts({
        matches,
        monthKey: selectedMonth
      })
    );
  }

  function confirmCrown() {
    if (!pendingSnapshot) return;

    const nextAwards = saveCrownedMonthlyBeastSnapshot(pendingSnapshot);
    setCrownedAwards(nextAwards);
    setPendingSnapshot(null);
  }

  return (
    <main className="monthly-beasts-page">
      <section className="monthly-beasts-hero">
        <div>
          <p className="leaderboard-eyebrow">Awards</p>
          <h1 className="comic-title">MONTHLY BEASTS</h1>
          <p>Three battles. Three crowns. One month to become a Beast.</p>
        </div>
        <div className="monthly-beasts-hero-actions">
          <MonthSelector selectedMonth={selectedMonth} onSelectMonth={updateMonth} />
          <Link href="/stats#monthly-beasts" className="monthly-beasts-formula-link">
            How are Beasts decided? -&gt;
          </Link>
        </div>
      </section>

      <section className="monthly-beasts-control-panel">
        <div>
          <CalendarDays aria-hidden="true" />
          <div>
            <span>Selected Month</span>
            <strong>{formatMonthLabel(selectedMonth)}</strong>
          </div>
        </div>
        <Button type="button" onClick={openCrownDialog} disabled={crownDisabled}>
          <Crown aria-hidden="true" />
          Crown {formatMonthLabel(selectedMonth)} Beasts
        </Button>
        {crownedAward ? (
          <p>
            <Trophy aria-hidden="true" />
            Crowned on {new Date(crownedAward.crownedAt).toLocaleDateString()}
          </p>
        ) : null}
      </section>

      <section className="monthly-beasts-card-grid" aria-label="Monthly Beast races">
        {categories.map((category) => (
          <CategoryPanel
            key={category}
            category={category}
            summary={summaries[category]}
            crownedAward={crownedAward}
          />
        ))}
      </section>

      <PastBeastsArchive crownedAwards={crownedAwards} />

      {pendingSnapshot ? (
        <CrownDialog
          selectedMonth={selectedMonth}
          snapshot={pendingSnapshot}
          onCancel={() => setPendingSnapshot(null)}
          onConfirm={confirmCrown}
        />
      ) : null}
    </main>
  );
}
