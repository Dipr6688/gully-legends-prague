"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Medal } from "lucide-react";
import {
  useEffect,
  useMemo,
  type CSSProperties,
  type KeyboardEvent
} from "react";
import { activePlayers } from "@/lib/data/players";
import {
  LEADERBOARD_CATEGORIES,
  getLeaderboardEntries,
  getLeaderboardPodium,
  getLeaderboardSummary,
  hasAnyFinalisedLeaderboardData,
  type LeaderSummary,
  type LeaderboardCategory,
  type LeaderboardPeriod,
  type PlayerLeaderboardEntry
} from "@/lib/leaderboard";
import { formatPercentage } from "@/lib/progression";
import { useMatchRepository } from "@/components/matches/useMatchRepository";
import { useCareerPlayers } from "@/components/players/useCareerPlayers";
import type { MatchRecord } from "@/lib/types/match";
import type { Player } from "@/lib/types/player";

const categories = Object.keys(LEADERBOARD_CATEGORIES) as LeaderboardCategory[];
const periods = [
  { id: "all-time", label: "ALL TIME" },
  { id: "current-month", label: "CURRENT MONTH" }
] as const satisfies Array<{ id: LeaderboardPeriod; label: string }>;

const accentColors = {
  orange: "#ff8f1f",
  purple: "#c557ff",
  green: "#9cff24",
  cyan: "#46dfff",
  gold: "#f7c734"
} as const;

const LEADER_QUICK_ICON_SCALE = {
  runs: 0.92,
  wickets: 0.92,
  catches: 0.92,
  strikeRate: 0.92,
  economy: 0.92,
  sixes: 0.92,
  boundaries: 0.92,
  ducks: 0.92,
  xp: 0.92,
  level: 0.92
} as const satisfies Record<LeaderboardCategory, number>;

const DUCK_COLLECTOR_QUOTES = [
  "Quack quack... another early walk back.",
  "Straight to the pond.",
  "No runs, only drama.",
  "Certified member of the Duck Club.",
  "Golden duck energy detected.",
  "The bat stayed silent. The duck did the talking."
] as const;

function isLeaderboardCategory(value: string | null): value is LeaderboardCategory {
  return categories.includes(value as LeaderboardCategory);
}

function isLeaderboardPeriod(value: string | null): value is LeaderboardPeriod {
  return periods.some((period) => period.id === value);
}

function getQuickCardCopy(summary: LeaderSummary) {
  if (summary.status === "race-not-started") {
    return {
      headline: "RACE NOT STARTED",
      detail: summary.supportingText,
      value: ""
    };
  }

  if (summary.status === "all-tied") {
    return {
      headline: "ALL PLAYERS TIED",
      detail: summary.displayValue,
      value: ""
    };
  }

  if (summary.status === "joint-leaders") {
    return {
      headline: "JOINT LEADERS",
      detail: summary.leaders.map((entry) => entry.player.name).join(" - "),
      value: summary.displayValue
    };
  }

  return {
    headline: summary.leaders[0]?.player.name ?? "RACE NOT STARTED",
    detail: summary.supportingText,
    value: summary.displayValue
  };
}

function formatPower(entry: PlayerLeaderboardEntry) {
  if (entry.supporting.ratingStatus === "UNRATED") return "UNRATED";
  if (entry.supporting.ratingStatus === "SCOUTING") return "SCOUTING";

  return `${entry.supporting.playerPower}/100`;
}

function getSupportLine(entry: PlayerLeaderboardEntry) {
  if (entry.category === "runs") return `HIGH SCORE ${entry.supporting.highScore ?? "-"}`;
  if (entry.category === "wickets") return `BEST ${entry.supporting.bestBowling ?? "-"}`;
  if (entry.category === "catches") return `${entry.supporting.runOuts} RUN-OUTS`;
  if (entry.category === "strikeRate") {
    return `${entry.supporting.ballsFaced} BALLS FACED`;
  }
  if (entry.category === "economy") {
    return `${entry.supporting.legalBallsBowled} LEGAL BALLS`;
  }
  if (entry.category === "sixes") return `${entry.supporting.fours} FOURS`;
  if (entry.category === "boundaries") {
    return `${entry.supporting.fours} FOURS - ${entry.supporting.sixes} SIXES`;
  }
  if (entry.category === "ducks") return "ZERO RUNS. MAXIMUM MEMORIES.";
  if (entry.category === "xp") return `LEVEL ${entry.supporting.level}`;

  return `${entry.supporting.totalXP} XP`;
}

function getRankTone(rank: number) {
  if (rank === 1) return "gold";
  if (rank === 2) return "silver";
  if (rank === 3) return "bronze";
  return "dark";
}

function getMedalText(rank: number) {
  if (rank === 1) return "First place";
  if (rank === 2) return "Second place";
  if (rank === 3) return "Third place";
  if (rank <= 0) return "Not qualified yet";

  return `Rank ${rank}`;
}

function getDuckCollectorQuote(summary: LeaderSummary) {
  const seed =
    summary.leaders[0]?.player.id
      .split("")
      .reduce((total, letter) => total + letter.charCodeAt(0), summary.value) ??
    0;

  return DUCK_COLLECTOR_QUOTES[seed % DUCK_COLLECTOR_QUOTES.length];
}

function DuckCollectorTease({ quote }: { quote: string }) {
  return (
    <span className="duck-collector-tease">
      <span aria-hidden="true">🥲</span>
      <strong>{quote}</strong>
      <span aria-hidden="true">🦆</span>
    </span>
  );
}

function getPodiumPlacement(entry: PlayerLeaderboardEntry) {
  if (entry.rank === 1) return "first";
  if (entry.rank === 2) return "second";

  return "third";
}

function LeaderboardHero({
  period,
  onPeriodChange
}: {
  period: LeaderboardPeriod;
  onPeriodChange: (period: LeaderboardPeriod) => void;
}) {
  return (
    <section className="leaderboard-hero">
      <div className="leaderboard-hero-copy">
        <p className="leaderboard-eyebrow">
          {period === "current-month" ? "CURRENT MONTH" : "ALL TIME"}
        </p>
        <h1 className="comic-title">HALL OF LEGENDS</h1>
        <p>
          The greatest run-makers, wicket-hunters, fielding heroes, strike-rate
          rockets, economy artists, six machines, boundary bandits and XP
          warriors of Gully Legends Prague.
        </p>
      </div>
      <div className="leaderboard-period-filter" aria-label="Leaderboard period">
        {periods.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={period === option.id}
            onClick={() => onPeriodChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function LeaderQuickCards({
  activeCategory,
  summaries,
  onSelectCategory
}: {
  activeCategory: LeaderboardCategory;
  summaries: LeaderSummary[];
  onSelectCategory: (category: LeaderboardCategory) => void;
}) {
  return (
    <section className="leader-quick-grid" aria-label="Quick leader cards">
      {summaries.map((summary) => {
        const meta = LEADERBOARD_CATEGORIES[summary.category];
        const copy = getQuickCardCopy(summary);

        return (
          <button
            key={summary.category}
            type="button"
            className="leader-quick-card"
            data-category={summary.category}
            data-active={activeCategory === summary.category}
            style={
              {
                "--leader-accent": accentColors[meta.accent]
              } as CSSProperties
            }
            onClick={() => onSelectCategory(summary.category)}
          >
            <div
              className="leader-quick-icon"
              style={
                {
                  "--icon-scale": LEADER_QUICK_ICON_SCALE[summary.category]
                } as CSSProperties
              }
            >
              <Image
                src={meta.icon}
                alt=""
                fill
                sizes="84px"
                quality={100}
                className="leader-quick-icon-artwork"
              />
            </div>
            <span>{meta.label}</span>
            <strong>{copy.headline}</strong>
            {copy.value ? <b>{copy.value}</b> : null}
            <small>{copy.detail}</small>
            {summary.category === "ducks" && summary.status !== "race-not-started" ? (
              <em>
                <DuckCollectorTease quote={getDuckCollectorQuote(summary)} />
              </em>
            ) : null}
          </button>
        );
      })}
    </section>
  );
}

function LeaderboardCategoryTabs({
  selectedCategory,
  onChange
}: {
  selectedCategory: LeaderboardCategory;
  onChange: (category: LeaderboardCategory) => void;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;

    event.preventDefault();
    const currentIndex = categories.indexOf(selectedCategory);
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextCategory =
      categories[(currentIndex + direction + categories.length) % categories.length];

    onChange(nextCategory);
  }

  return (
    <div
      className="leaderboard-tabs"
      role="tablist"
      aria-label="Leaderboard categories"
      onKeyDown={handleKeyDown}
    >
      {categories.map((category) => {
        const meta = LEADERBOARD_CATEGORIES[category];

        return (
          <button
            key={category}
            id={`${category}-leaderboard-tab`}
            type="button"
            role="tab"
            aria-selected={selectedCategory === category}
            aria-controls={`${category}-leaderboard-panel`}
            style={
              {
                "--leader-accent": accentColors[meta.accent]
              } as CSSProperties
            }
            data-category={category}
            onClick={() => onChange(category)}
          >
            <Image src={meta.icon} alt="" width={38} height={38} />
            <span>{meta.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
}

function LeaderboardEmptyState({
  category,
  global = false
}: {
  category: LeaderboardCategory;
  global?: boolean;
}) {
  const meta = LEADERBOARD_CATEGORIES[category];

  return (
    <section className="leaderboard-empty-state">
      <Image src={meta.icon} alt="" width={120} height={120} />
      <div>
        <h2>{global ? "THE HALL AWAITS ITS FIRST LEGEND" : meta.emptyTitle}</h2>
        <p>
          {global
            ? "Finalise the first Gully Legends match to unlock crowns, podiums and player rankings."
            : meta.emptyCopy}
        </p>
      </div>
    </section>
  );
}

function LeaderboardPodiumCard({
  entry,
  placement
}: {
  entry: PlayerLeaderboardEntry;
  placement: "first" | "second" | "third" | "joint-first";
}) {
  const rankTone = getRankTone(entry.rank);

  return (
    <Link
      href={`/players/${entry.player.slug}`}
      className={`podium-card podium-card-${placement} podium-rank-${rankTone}`}
      aria-label={`Open ${entry.player.name} profile, rank ${entry.rank}`}
    >
      <span className="rank-badge">#{entry.rank}</span>
      <div className="podium-artwork">
        <span
          className={`podium-medal podium-medal-${rankTone}`}
          aria-label={getMedalText(entry.rank)}
        >
          <Medal aria-hidden="true" />
          <b>{entry.rank}</b>
        </span>
        <Image
          src={entry.player.cardImage}
          alt={`${entry.player.name} player card`}
          fill
          sizes="(max-width: 680px) 58vw, 220px"
          className="podium-player-image"
        />
      </div>
      <div className="podium-copy">
        <h3>{entry.player.name}</h3>
        <p>{entry.player.role}</p>
        <strong>{entry.displayValue}</strong>
        <span>{getSupportLine(entry)}</span>
      </div>
    </Link>
  );
}

function RaceOpenCard({ rank }: { rank: number }) {
  return (
    <div className="podium-card podium-placeholder">
      <span className="rank-badge">#{rank}</span>
      <h3>RACE OPEN</h3>
      <p>A finalised performance can claim this place.</p>
    </div>
  );
}

function LeaderboardPodium({
  category,
  entries,
  summary
}: {
  category: LeaderboardCategory;
  entries: PlayerLeaderboardEntry[];
  summary: LeaderSummary;
}) {
  const meta = LEADERBOARD_CATEGORIES[category];
  const podiumEntries = getLeaderboardPodium(entries);
  const firstPlaceEntries =
    summary.status === "joint-leaders" && summary.leaders[0]?.rank === 1
      ? summary.leaders.filter((entry) => entry.rank === 1)
      : podiumEntries.filter((entry) => entry.rank === 1);
  const hasJointFirstPlace = firstPlaceEntries.length > 1;
  const visibleJointLeaders = firstPlaceEntries.slice(0, 3);
  const extraJointLeaders =
    hasJointFirstPlace
      ? Math.max(0, firstPlaceEntries.length - visibleJointLeaders.length)
      : 0;
  const orderedCards = [
    podiumEntries[1] ? (
      <LeaderboardPodiumCard
        key={podiumEntries[1].player.id}
        entry={podiumEntries[1]}
        placement={getPodiumPlacement(podiumEntries[1])}
      />
    ) : (
      <RaceOpenCard key="race-open-second" rank={2} />
    ),
    podiumEntries[0] ? (
      <LeaderboardPodiumCard
        key={podiumEntries[0].player.id}
        entry={podiumEntries[0]}
        placement={getPodiumPlacement(podiumEntries[0])}
      />
    ) : (
      <RaceOpenCard key="race-open-first" rank={1} />
    ),
    podiumEntries[2] ? (
      <LeaderboardPodiumCard
        key={podiumEntries[2].player.id}
        entry={podiumEntries[2]}
        placement={getPodiumPlacement(podiumEntries[2])}
      />
    ) : (
      <RaceOpenCard key="race-open-third" rank={3} />
    )
  ];

  if (summary.status === "race-not-started" || summary.status === "all-tied") {
    return <LeaderboardEmptyState category={category} />;
  }

  return (
    <section
      id={`${category}-leaderboard-panel`}
      role="tabpanel"
      aria-labelledby={`${category}-leaderboard-tab`}
      className="leaderboard-podium-section"
      data-category={category}
      style={
        {
          "--leader-accent": accentColors[meta.accent]
        } as CSSProperties
      }
    >
      <div className="leaderboard-section-heading">
        <p>{meta.label}</p>
        <h2>{meta.crownTitle}</h2>
        {category === "ducks" ? (
          <DuckCollectorTease quote={getDuckCollectorQuote(summary)} />
        ) : null}
      </div>
      {hasJointFirstPlace ? (
        <div
          className={`joint-winners-grid joint-winners-count-${visibleJointLeaders.length}`}
        >
          {visibleJointLeaders.map((entry) => (
            <LeaderboardPodiumCard
              key={entry.player.id}
              entry={entry}
              placement="joint-first"
            />
          ))}
        </div>
      ) : (
        <div className="podium-grid">{orderedCards}</div>
      )}
      {extraJointLeaders > 0 ? (
        <a className="joint-leaders-link" href="#full-rankings">
          +{extraJointLeaders} MORE JOINT LEADERS
        </a>
      ) : null}
    </section>
  );
}

function CategoryStatValue({ entry }: { entry: PlayerLeaderboardEntry }) {
  return (
    <strong className={entry.mutedZero ? "leaderboard-zero-value" : undefined}>
      {entry.displayValue}
    </strong>
  );
}

function RankBadge({ rank }: { rank: number }) {
  return (
    <span className={`rank-badge rank-badge-${getRankTone(rank)}`}>
      {rank > 0 ? `#${rank}` : "--"}
    </span>
  );
}

function LeaderboardRankRow({ entry }: { entry: PlayerLeaderboardEntry }) {
  const stats =
    entry.category === "runs"
      ? [
          ["MATCHES", entry.supporting.matches],
          ["HIGH SCORE", entry.supporting.highScore ?? "-"],
          ["BLADE POWER", formatPower(entry)]
        ]
      : entry.category === "wickets"
        ? [
            ["MATCHES", entry.supporting.matches],
            ["BEST BOWLING", entry.supporting.bestBowling ?? "-"],
            ["DELIVERY THREAT", formatPower(entry)]
          ]
        : entry.category === "catches"
          ? [
              ["MATCHES", entry.supporting.matches],
              ["RUN-OUTS", entry.supporting.runOuts],
              ["FIELD REFLEX", formatPower(entry)]
            ]
          : entry.category === "xp"
            ? [
                ["LEVEL", entry.supporting.level],
                ["XP TO NEXT", entry.supporting.xpToNextLevel],
                ["XP PROGRESS", formatPercentage(entry.supporting.xpProgressPercentage)]
              ]
            : entry.category === "strikeRate"
              ? [
                  ["BALLS FACED", entry.supporting.ballsFaced],
                  ["TRACKED INNINGS", entry.supporting.trackedBattingInnings],
                  ["RUNS TRACKED", entry.supporting.trackedBattingRuns]
                ]
              : entry.category === "economy"
                ? [
                    ["LEGAL BALLS", entry.supporting.legalBallsBowled],
                    ["TRACKED MATCHES", entry.supporting.trackedBowlingMatches],
                    ["RUNS CONCEDED", entry.supporting.trackedRunsConceded]
                  ]
                : entry.category === "ducks"
                  ? [
                      ["DUCKS", entry.supporting.ducks],
                      ["INNINGS", entry.supporting.matches],
                      ["NOTE", "GOLDEN ZERO CLUB"]
                    ]
                  : entry.category === "sixes"
                    ? [
                        ["SIXES", entry.supporting.sixes],
                        ["FOURS", entry.supporting.fours],
                        ["BALLS FACED", entry.supporting.ballsFaced]
                      ]
                    : entry.category === "boundaries"
                      ? [
                          ["BOUNDARIES", entry.supporting.boundaries],
                          ["FOURS", entry.supporting.fours],
                          ["SIXES", entry.supporting.sixes]
                        ]
                  : [
                      ["TOTAL XP", entry.supporting.totalXP],
                      ["XP TO NEXT", entry.supporting.xpToNextLevel],
                      ["PROGRESS", formatPercentage(entry.supporting.xpProgressPercentage)]
                    ];

  return (
    <Link
      href={`/players/${entry.player.slug}`}
      className="leaderboard-rank-row"
      aria-label={`Open ${entry.player.name} profile, rank ${entry.rank}`}
    >
      <RankBadge rank={entry.rank} />
      <div className="rank-player">
        <div className="rank-player-thumb">
          <Image
            src={entry.player.cardImage}
            alt={`${entry.player.name} player card`}
            fill
            sizes="72px"
            className="rank-player-image"
          />
        </div>
        <div>
          <h3>{entry.player.name}</h3>
          <p>{entry.player.role}</p>
        </div>
      </div>
      <CategoryStatValue entry={entry} />
      <div className="rank-supporting-stats">
        {stats.map(([label, value]) => (
          <span key={label}>
            {label} <b>{value}</b>
          </span>
        ))}
      </div>
    </Link>
  );
}

function LeaderboardRankList({
  category,
  entries,
  period
}: {
  category: LeaderboardCategory;
  entries: PlayerLeaderboardEntry[];
  period: LeaderboardPeriod;
}) {
  const meta = LEADERBOARD_CATEGORIES[category];

  return (
    <section
      id="full-rankings"
      className="leaderboard-rankings"
      style={
        {
          "--leader-accent": accentColors[meta.accent]
        } as CSSProperties
      }
    >
      <div className="leaderboard-section-heading">
        <p>FULL RANKINGS</p>
        <h2>{meta.label}</h2>
        {period === "current-month" && category === "level" ? (
          <span>Level reflects total career progression.</span>
        ) : null}
      </div>
      <div className="leaderboard-rank-list">
        {entries.map((entry) => (
          <LeaderboardRankRow key={entry.player.id} entry={entry} />
        ))}
      </div>
    </section>
  );
}

export function CareerLeaderboard({
  players,
  matches: suppliedMatches,
  careerResolved = false
}: {
  players?: Player[];
  matches?: MatchRecord[];
  careerResolved?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const suppliedPlayers = players ?? activePlayers;
  const localCareerPlayers = useCareerPlayers(suppliedPlayers);
  const careerPlayers = careerResolved ? suppliedPlayers : localCareerPlayers;
  const localRepository = useMatchRepository();
  const matches = suppliedMatches ?? localRepository.matches;
  const periodParam = searchParams.get("period");
  const categoryParam = searchParams.get("category");
  const period = isLeaderboardPeriod(periodParam) ? periodParam : "all-time";
  const category = isLeaderboardCategory(categoryParam) ? categoryParam : "runs";
  const entriesByCategory = useMemo(
    () =>
      Object.fromEntries(
        categories.map((currentCategory) => [
          currentCategory,
          getLeaderboardEntries({
            players: careerPlayers,
            matches,
            category: currentCategory,
            period
          })
        ])
      ) as Record<LeaderboardCategory, PlayerLeaderboardEntry[]>,
    [careerPlayers, matches, period]
  );
  const summaries = useMemo(
    () =>
      categories.map((currentCategory) =>
        getLeaderboardSummary({
          category: currentCategory,
          entries: entriesByCategory[currentCategory]
        })
      ),
    [entriesByCategory]
  );
  const entries = entriesByCategory[category];
  const summary = getLeaderboardSummary({ category, entries });
  const hasFinalisedData = hasAnyFinalisedLeaderboardData(careerPlayers, matches);

  useEffect(() => {
    document.title = "HALL OF LEGENDS | Gully Legends Prague";
  }, []);

  function updateUrl(
    next: Partial<{ period: LeaderboardPeriod; category: LeaderboardCategory }>
  ) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", next.period ?? period);
    params.set("category", next.category ?? category);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <main className="leaderboard-page">
      <LeaderboardHero
        period={period}
        onPeriodChange={(nextPeriod) => updateUrl({ period: nextPeriod })}
      />
      <LeaderQuickCards
        activeCategory={category}
        summaries={summaries}
        onSelectCategory={(nextCategory) => updateUrl({ category: nextCategory })}
      />
      <LeaderboardCategoryTabs
        selectedCategory={category}
        onChange={(nextCategory) => updateUrl({ category: nextCategory })}
      />
      {hasFinalisedData ? (
        <>
          <LeaderboardPodium category={category} entries={entries} summary={summary} />
          <LeaderboardRankList category={category} entries={entries} period={period} />
        </>
      ) : (
        <LeaderboardEmptyState category={category} global />
      )}
    </main>
  );
}
