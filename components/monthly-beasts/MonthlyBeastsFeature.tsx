"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Crown,
  MoreVertical,
  Trophy
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties
} from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { useMatchRepository } from "@/components/matches/useMatchRepository";
import { activePlayers } from "@/lib/data/players";
import { parseLocalMatchDate } from "@/lib/leaderboard";
import {
  addMonthsToMonthKey,
  createCrownedMonthlyBeasts,
  formatMonthEndLabel,
  formatMonthLabel,
  formatMonthTitle,
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
  monthlyBeastCrownRepository,
  MONTHLY_BEASTS_UPDATED_EVENT
} from "@/lib/monthly-beasts-store";
import type { MatchRecord } from "@/lib/types/match";
import type { Player } from "@/lib/types/player";

const categories = Object.keys(MONTHLY_BEAST_CATEGORIES) as MonthlyBeastCategory[];

const accentColors = {
  orange: "#ff8f1f",
  purple: "#c557ff",
  green: "#9cff24"
} as const;

function useLocalAdminMode() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      const params = new URLSearchParams(window.location.search);
      const requestedAdminMode = params.get("admin");

      if (requestedAdminMode === "1") {
        window.localStorage.setItem("gully-legends-admin-mode", "true");
      } else if (requestedAdminMode === "0") {
        window.localStorage.removeItem("gully-legends-admin-mode");
      }

      setIsAdmin(window.localStorage.getItem("gully-legends-admin-mode") === "true");
    });
  }, []);

  return isAdmin;
}

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

function getLatestMatchLabel(matches: MatchRecord[]) {
  const latestMatchDate = matches
    .map((match) => parseLocalMatchDate(match.matchDate))
    .filter((date): date is Date => Boolean(date))
    .sort((left, right) => right.getTime() - left.getTime())[0];

  if (!latestMatchDate) return "No finalised matches";

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(latestMatchDate);
}

function getNextVersion(crowns: CrownedMonthlyBeasts[], monthKey: string) {
  return (
    crowns
      .filter((crown) => crown.monthKey === monthKey)
      .reduce((highest, crown) => Math.max(highest, crown.version), 0) + 1
  );
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
  finalisedMatchCount,
  latestMatchLabel,
  isCurrentMonth,
  onCancel,
  onConfirm
}: {
  selectedMonth: string;
  snapshot: CrownedMonthlyBeasts;
  finalisedMatchCount: number;
  latestMatchLabel: string;
  isCurrentMonth: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [confirmedComplete, setConfirmedComplete] = useState(false);
  const [confirmedCurrentMonth, setConfirmedCurrentMonth] = useState(false);
  const canConfirm = confirmedComplete && (!isCurrentMonth || confirmedCurrentMonth);

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
          Crown {formatMonthLabel(selectedMonth)} Beasts?
        </h2>
        <p className="monthly-beasts-dialog-summary">
          {finalisedMatchCount} finalised matches counted
          <br />
          Latest match: {latestMatchLabel}
        </p>
        {isCurrentMonth ? (
          <div className="monthly-beasts-warning">
            <strong>This month is still in progress</strong>
            <span>
              There may be more matches before {formatMonthEndLabel(selectedMonth)}.
            </span>
          </div>
        ) : null}
        <div className="monthly-beasts-dialog-list">
          {categories.map((category) => {
            const meta = MONTHLY_BEAST_CATEGORIES[category];
            const winners = getWinnersForCategory(snapshot, category);

            return (
              <div key={category}>
                <span>{meta.title}</span>
                {winners.length > 0 ? (
                  <>
                    {winners.map((winner) => {
                      const playerName = getPlayer(winner.playerId)?.name ?? winner.playerId;

                      return (
                        <strong key={winner.playerId}>
                          {playerName} - {winner.categoryXp} XP
                        </strong>
                      );
                    })}
                    {winners.length > 1 ? <small>Joint winners</small> : null}
                  </>
                ) : (
                  <strong>Race not started</strong>
                )}
              </div>
            );
          })}
        </div>
        <label className="monthly-beasts-confirm-check">
          <input
            type="checkbox"
            checked={confirmedComplete}
            onChange={(event) => setConfirmedComplete(event.target.checked)}
          />
          <span>
            I confirm that all matches for {formatMonthTitle(selectedMonth)} have
            been entered and finalised.
          </span>
        </label>
        {isCurrentMonth ? (
          <label className="monthly-beasts-confirm-check">
            <input
              type="checkbox"
              checked={confirmedCurrentMonth}
              onChange={(event) => setConfirmedCurrentMonth(event.target.checked)}
            />
            <span>I understand and still want to crown this month.</span>
          </label>
        ) : null}
        <div className="monthly-beasts-dialog-actions">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={!canConfirm}>
            Crown Winners
          </Button>
        </div>
      </section>
    </div>
  );
}

export function ReopenMonthlyBeastsDialog({
  monthKey,
  onCancel,
  onConfirm
}: {
  monthKey: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="monthly-beasts-dialog-backdrop">
      <section
        className="monthly-beasts-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="monthly-beasts-reopen-title"
      >
        <p className="formula-eyebrow">Reopen month</p>
        <h2 id="monthly-beasts-reopen-title">
          Reopen {formatMonthLabel(monthKey)}?
        </h2>
        <p className="monthly-beasts-dialog-summary">
          The official {formatMonthTitle(monthKey)} Beast crowns will be
          withdrawn and the live race will resume.
        </p>
        <div className="monthly-beasts-warning">
          <strong>Match results, XP and player career statistics will not be changed.</strong>
          <span>You can crown the month again after completing any missing matches.</span>
        </div>
        <div className="monthly-beasts-dialog-actions">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Keep Crown
          </Button>
          <Button type="button" variant="secondary" onClick={onConfirm}>
            Reopen Month
          </Button>
        </div>
      </section>
    </div>
  );
}

function ReopenMonthMenu({ onReopen }: { onReopen: () => void }) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({
    opacity: 0,
    position: "fixed"
  });

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || typeof window === "undefined") return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const menuWidth = 178;
    const menuHeight = popoverRef.current?.offsetHeight ?? 52;
    const gap = 8;
    const viewportPadding = 10;
    const left = Math.min(
      Math.max(viewportPadding, triggerRect.right - menuWidth),
      window.innerWidth - menuWidth - viewportPadding
    );
    const belowTop = triggerRect.bottom + gap;
    const aboveTop = triggerRect.top - menuHeight - gap;
    const shouldFlip = belowTop + menuHeight > window.innerHeight - viewportPadding;
    const top = shouldFlip
      ? Math.max(viewportPadding, aboveTop)
      : Math.min(belowTop, window.innerHeight - menuHeight - viewportPadding);

    setPosition({
      left,
      opacity: 1,
      position: "fixed",
      top,
      width: menuWidth,
      zIndex: 120
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    queueMicrotask(updatePosition);

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;

      if (
        triggerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }

      setIsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, updatePosition]);

  const popover = isOpen ? (
    <div
      ref={popoverRef}
      className="monthly-beasts-admin-popover"
      style={position}
      role="menu"
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          setIsOpen(false);
          onReopen();
        }}
      >
        Reopen Month
      </button>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Monthly Beast admin actions"
        className="monthly-beasts-admin-trigger"
        onClick={() => setIsOpen((current) => !current)}
      >
        <MoreVertical aria-hidden="true" />
      </button>
      {typeof document !== "undefined" && popover
        ? createPortal(popover, document.body)
        : null}
    </>
  );
}

function PastBeastsArchive({ crownedAwards }: { crownedAwards: CrownedMonthlyBeasts[] }) {
  const archiveAwards = [...crownedAwards]
    .filter((award) => award.status === "active")
    .sort((left, right) => right.monthKey.localeCompare(left.monthKey));

  return (
    <section className="monthly-beasts-archive">
      <div className="monthly-beasts-section-heading">
        <p>Official archive</p>
        <h2>Past Beasts</h2>
      </div>
      {archiveAwards.length > 0 ? (
        <div className="monthly-beasts-archive-grid">
          {archiveAwards.map((award) => (
            <article key={award.id} className="monthly-beasts-archive-card">
              <h3>{formatMonthLabel(award.monthKey)}</h3>
              <p className="monthly-beasts-official-label">Official Beasts</p>
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

function CrownHistory({ crowns }: { crowns: CrownedMonthlyBeasts[] }) {
  const history = [...crowns].sort((left, right) => {
    if (right.monthKey !== left.monthKey) return right.monthKey.localeCompare(left.monthKey);

    return right.version - left.version;
  });

  if (history.length === 0) return null;

  return (
    <section className="monthly-beasts-crown-history">
      <div className="monthly-beasts-section-heading">
        <p>Admin only</p>
        <h2>Crown History</h2>
      </div>
      <div className="monthly-beasts-history-list">
        {history.map((crown) => (
          <article key={crown.id}>
            <strong>{formatMonthLabel(crown.monthKey)}</strong>
            <span>Version {crown.version}</span>
            <span>
              Crowned: {new Date(crown.crownedAt).toLocaleDateString()}
            </span>
            <b>{crown.status === "active" ? "OFFICIAL" : "REOPENED"}</b>
          </article>
        ))}
      </div>
    </section>
  );
}

export function MonthlyBeastsFeature() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { matches } = useMatchRepository();
  const isAdmin = useLocalAdminMode();
  const [crownedAwards, setCrownedAwards] = useCrownedAwards();
  const selectedMonth = getSelectedMonth(searchParams.get("month"));
  const currentMonth = getCurrentMonthKey();
  const isSelectedCurrentMonth = selectedMonth === currentMonth;
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
  const hasPastPendingCrown =
    !isSelectedCurrentMonth && !crownedAward && finalisedMatchesForMonth.length > 0;
  const presentationState = crownedAward
    ? "CROWNED"
    : hasPastPendingCrown
      ? "CROWN PENDING"
      : "CURRENT RACE";
  const [pendingSnapshot, setPendingSnapshot] = useState<CrownedMonthlyBeasts | null>(
    null
  );
  const [reopenMonthKey, setReopenMonthKey] = useState<string | null>(null);

  useEffect(() => {
    document.title = "MONTHLY BEASTS | Gully Legends Prague";
  }, []);

  function refreshAwards() {
    setCrownedAwards(loadCrownedMonthlyBeasts());
  }

  function updateMonth(monthKey: string) {
    if (isFutureMonthKey(monthKey)) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("month", monthKey);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function openCrownDialog() {
    if (crownDisabled || !isAdmin) return;

    setPendingSnapshot(
      createCrownedMonthlyBeasts({
        matches,
        monthKey: selectedMonth,
        version: getNextVersion(crownedAwards, selectedMonth)
      })
    );
  }

  function confirmCrown() {
    if (!pendingSnapshot) return;

    monthlyBeastCrownRepository.crownMonth({
      monthKey: selectedMonth,
      matches,
      crownedBy: "local-admin"
    });
    refreshAwards();
    setPendingSnapshot(null);
  }

  function confirmReopen() {
    if (!reopenMonthKey) return;

    monthlyBeastCrownRepository.reopenMonth(reopenMonthKey, "local-admin");
    refreshAwards();
    setReopenMonthKey(null);
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
        <p className={`monthly-beasts-state monthly-beasts-state-${presentationState.toLowerCase().replace(/\s+/g, "-")}`}>
          <Trophy aria-hidden="true" />
          {presentationState}
        </p>
        {hasPastPendingCrown ? (
          <p className="monthly-beasts-pending-copy">Final results are ready.</p>
        ) : null}
        {crownedAward ? (
          <p>
            <Trophy aria-hidden="true" />
            Crowned on {new Date(crownedAward.crownedAt).toLocaleDateString()}
          </p>
        ) : null}
        {isAdmin && !crownedAward ? (
          <Button type="button" onClick={openCrownDialog} disabled={crownDisabled}>
            <Crown aria-hidden="true" />
            Crown {formatMonthLabel(selectedMonth)} Beasts
          </Button>
        ) : null}
        {isAdmin && crownedAward ? (
          <div className="monthly-beasts-admin-menu">
            <ReopenMonthMenu onReopen={() => setReopenMonthKey(selectedMonth)} />
          </div>
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
      {isAdmin ? <CrownHistory crowns={crownedAwards} /> : null}

      {pendingSnapshot ? (
        <CrownDialog
          selectedMonth={selectedMonth}
          snapshot={pendingSnapshot}
          finalisedMatchCount={finalisedMatchesForMonth.length}
          latestMatchLabel={getLatestMatchLabel(finalisedMatchesForMonth)}
          isCurrentMonth={isSelectedCurrentMonth}
          onCancel={() => setPendingSnapshot(null)}
          onConfirm={confirmCrown}
        />
      ) : null}
      {reopenMonthKey ? (
        <ReopenMonthlyBeastsDialog
          monthKey={reopenMonthKey}
          onCancel={() => setReopenMonthKey(null)}
          onConfirm={confirmReopen}
        />
      ) : null}
    </main>
  );
}
