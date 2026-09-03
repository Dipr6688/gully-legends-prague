"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode
} from "react";
import { Flame, ShieldCheck, Swords, Trophy, Zap } from "lucide-react";
import { TrophyCabinet } from "@/components/players/TrophyCabinet";
import {
  createEmptyPlayerPerformanceTrends,
  type PlayerPerformanceTrends,
  type PlayerTrendMetric,
  type PlayerTrendPoint
} from "@/lib/analytics/player-performance-trends";
import type { Player } from "@/lib/types/player";
import { formatPercentage, getLevelProgress } from "@/lib/progression";
import {
  PLAYER_FILE_ICONS,
  PLAYER_PROFILE_POWER_ICONS
} from "@/lib/data/player-power-icons";
import {
  formatEconomy,
  formatHighestScore,
  formatLegalBallsAsOvers,
  formatStrikeRate,
  type AdvancedCareerStats
} from "@/lib/advanced-cricket-stats";
import type { PlayerAchievements } from "@/lib/player-achievements";
import type { PlayerProfileNavigation } from "@/lib/player-profile-navigation";

const PLAYER_PROFILE_ICON_SCALE = {
  batting: 1.08,
  bowling: 1.08,
  fielding: 1.08
} as const;

type PlayerProfileIconType = keyof typeof PLAYER_PROFILE_ICON_SCALE;

function StatTile({
  icon,
  label,
  value
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="hero-stat-tile">
      <div className="hero-stat-icon" aria-hidden="true">
        {icon}
      </div>
      <span>{label}</span>
      <strong className="data-number-strong">{value}</strong>
    </div>
  );
}

function CareerMiniStat({
  metric,
  label,
  onSelectTrend,
  value
}: {
  label: string;
  metric?: PlayerTrendMetric;
  onSelectTrend?: (metric: PlayerTrendMetric) => void;
  value: ReactNode;
}) {
  if (metric && onSelectTrend) {
    return (
      <div className="career-mini-stat-row">
        <button
          type="button"
          className="career-mini-stat-action"
          onClick={() => onSelectTrend(metric)}
        >
          <span className="career-mini-stat-label">{label}</span>
          <span className="career-mini-stat-value data-number-strong">{value}</span>
          <span className="career-mini-stat-cue">Trend</span>
        </button>
      </div>
    );
  }

  return (
    <div className="career-mini-stat-row">
      <dt>{label}</dt>
      <dd className="data-number-strong">{value}</dd>
    </div>
  );
}

function PlayerProfileIcon({
  className,
  icon,
  type
}: {
  className: string;
  icon: string;
  type: PlayerProfileIconType;
}) {
  return (
    <div
      className={`${className} player-profile-icon-circle`}
      style={
        {
          "--artwork-scale": PLAYER_PROFILE_ICON_SCALE[type]
        } as CSSProperties
      }
    >
      <Image
        src={icon}
        alt=""
        width={96}
        height={96}
        sizes="96px"
        className="player-profile-icon-artwork"
      />
    </div>
  );
}

function HeroRatingRow({
  icon,
  label,
  type,
  value
}: {
  icon: string;
  label: string;
  type: PlayerProfileIconType;
  value: number;
}) {
  const width = `${Math.max(0, Math.min(100, value))}%`;

  return (
    <div className="hero-rating-row">
      <PlayerProfileIcon className="hero-rating-icon" icon={icon} type={type} />
      <div className="hero-rating-content">
        <div className="hero-rating-heading">
          <span>{label}</span>
          <strong className="data-number-strong">{value}/100</strong>
        </div>
        <div className="hero-rating-track">
          <div className="hero-rating-fill" style={{ width }} />
        </div>
      </div>
    </div>
  );
}

function ProfileTrait({
  icon,
  label,
  type,
  text
}: {
  icon: string;
  label: string;
  type: PlayerProfileIconType;
  text: string;
}) {
  return (
    <article className="profile-trait">
      <PlayerProfileIcon className="profile-trait-icon" icon={icon} type={type} />
      <h3>{label}</h3>
      <p>{text}</p>
    </article>
  );
}

function SectionHeading({
  children,
  id
}: {
  children: ReactNode;
  id?: string;
}) {
  return (
    <h2 className="profile-section-heading" id={id}>
      {children}
    </h2>
  );
}

function PlayerProfileBrowser({
  navigation
}: {
  navigation?: PlayerProfileNavigation;
}) {
  if (!navigation) return null;

  const previousLabel = navigation.previous
    ? `Previous player: ${navigation.previous.name}`
    : "No previous player";
  const nextLabel = navigation.next
    ? `Next player: ${navigation.next.name}`
    : "No next player";

  return (
    <nav className="player-profile-browser" aria-label="Player profile browsing">
      {navigation.previous ? (
        <Link
          href={`/players/${navigation.previous.slug}`}
          className="player-profile-browser-link player-profile-browser-link-previous"
          aria-label={previousLabel}
        >
          <span>&larr; Previous Player</span>
          <strong>{navigation.previous.name}</strong>
        </Link>
      ) : (
        <span
          className="player-profile-browser-link player-profile-browser-link-previous is-disabled"
          aria-label={previousLabel}
          aria-disabled="true"
        >
          <span>&larr; Previous Player</span>
          <strong>-</strong>
        </span>
      )}

      <Link
        href={navigation.allPlayersHref}
        className="player-profile-browser-all"
        aria-label="Back to all players"
      >
        All Players
      </Link>

      {navigation.next ? (
        <Link
          href={`/players/${navigation.next.slug}`}
          className="player-profile-browser-link player-profile-browser-link-next"
          aria-label={nextLabel}
        >
          <span>Next Player &rarr;</span>
          <strong>{navigation.next.name}</strong>
        </Link>
      ) : (
        <span
          className="player-profile-browser-link player-profile-browser-link-next is-disabled"
          aria-label={nextLabel}
          aria-disabled="true"
        >
          <span>Next Player &rarr;</span>
          <strong>-</strong>
        </span>
      )}
    </nav>
  );
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const TREND_METRIC_ORDER: PlayerTrendMetric[] = [
  "score",
  "battingAverage",
  "battingStrikeRate",
  "economy",
  "bowlingStrikeRate"
];

type TrendChartLayout = {
  bottom: number;
  height: number;
  left: number;
  pointInnerRadius: number;
  pointRadius: number;
  top: number;
  viewBox: string;
  width: number;
};

const TREND_DESKTOP_CHART: TrendChartLayout = {
  left: 64,
  top: 34,
  width: 820,
  height: 145,
  bottom: 218,
  pointRadius: 7,
  pointInnerRadius: 3.2,
  viewBox: "0 0 960 260"
};

const TREND_MOBILE_CHART: TrendChartLayout = {
  left: 58,
  top: 38,
  width: 612,
  height: 300,
  bottom: 362,
  pointRadius: 7,
  pointInnerRadius: 3.2,
  viewBox: "0 0 720 390"
};

function getNiceAxisStep(maximum: number) {
  if (maximum <= 0) return 1;

  const rawStep = maximum / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const niceStep =
    normalized <= 1
      ? 1
      : normalized <= 2
        ? 2
        : normalized <= 5
          ? 5
          : 10;

  return niceStep * magnitude;
}

function getTrendAxisTicks(values: number[]) {
  const rawMaximum = values.length ? Math.max(...values) : 100;
  const step = getNiceAxisStep(Math.max(1, rawMaximum));
  const maximum = Math.max(step, Math.ceil(rawMaximum / step) * step);

  return {
    maximum,
    ticks: [maximum, maximum - step, maximum - step * 2, maximum - step * 3, 0]
      .map((value) => Math.max(0, value))
      .filter((value, index, all) => all.indexOf(value) === index)
  };
}

function formatTrendAxisTick(value: number) {
  if (value >= 10 || Number.isInteger(value)) return String(Math.round(value));

  return value.toFixed(1);
}

function getTrendPointPosition({
  index,
  maximum,
  point,
  plot,
  total
}: {
  index: number;
  point: PlayerTrendPoint;
  plot: TrendChartLayout;
  total: number;
  maximum: number;
}) {
  const range = maximum || 1;
  const x =
    total <= 1
      ? plot.left + plot.width / 2
      : plot.left + (index / (total - 1)) * plot.width;
  const y =
    plot.top +
    plot.height -
    (point.value / range) * plot.height;

  return { x, y };
}

function useTrendChartLayout() {
  const [isMobileChart, setIsMobileChart] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 560px)");
    const updateMobileState = () => setIsMobileChart(query.matches);

    updateMobileState();

    if (query.addEventListener) {
      query.addEventListener("change", updateMobileState);

      return () => query.removeEventListener("change", updateMobileState);
    }

    query.addListener(updateMobileState);

    return () => query.removeListener(updateMobileState);
  }, []);

  return {
    isMobileChart,
    plot: isMobileChart ? TREND_MOBILE_CHART : TREND_DESKTOP_CHART
  };
}

function getTrendPrimaryValue(series: PlayerPerformanceTrends["series"][PlayerTrendMetric], point: PlayerTrendPoint) {
  if (series.metric === "score") return `${point.displayValue} runs`;
  if (series.metric === "battingAverage") return `${point.displayValue} average`;
  if (series.metric === "battingStrikeRate") return `${point.displayValue} strike rate`;
  if (series.metric === "economy") return `${point.displayValue} economy`;

  return `${point.displayValue} bowling SR`;
}

function PerformanceTrendGraph({
  series
}: {
  series: PlayerPerformanceTrends["series"][PlayerTrendMetric];
}) {
  const plotShellRef = useRef<HTMLDivElement | null>(null);
  const { isMobileChart, plot } = useTrendChartLayout();
  const [activePoint, setActivePoint] = useState<{
    metric: PlayerTrendMetric;
    index: number;
  }>({
    metric: series.metric,
    index: Math.max(0, series.points.length - 1)
  });
  const points = series.points;
  const activePointIndex =
    activePoint.metric === series.metric && points[activePoint.index]
      ? activePoint.index
      : Math.max(0, points.length - 1);
  const selectedPoint = points[activePointIndex] ?? points[points.length - 1] ?? null;
  const values = points.map((point) => point.value);
  const { maximum, ticks } = getTrendAxisTicks(values);
  const plottedPoints = points.map((point, index) =>
    getTrendPointPosition({
      index,
      point,
      plot,
      total: points.length,
      maximum
    })
  );
  const polyline = plottedPoints
    .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(" ");

  function handlePointKeyDown(
    event: KeyboardEvent<SVGGElement>,
    index: number
  ) {
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    setActivePoint({ metric: series.metric, index });
  }

  useEffect(() => {
    const shell = plotShellRef.current;

    if (!shell || !isMobileChart) return;

    const hiddenWidth = shell.scrollWidth - shell.clientWidth;

    if (hiddenWidth > 0) {
      shell.scrollLeft = hiddenWidth;
    }
  }, [isMobileChart, points.length, series.metric]);

  if (points.length === 0) {
    return (
      <div className="performance-trend-empty" role="status">
        <strong>{series.emptyMessage}</strong>
        <span>{series.note}</span>
      </div>
    );
  }

  return (
    <div className="performance-trend-chart">
      <div className="performance-trend-body">
        <div
          className={`performance-trend-plot-shell${isMobileChart ? " is-mobile-scrollable" : ""}`}
          ref={plotShellRef}
        >
          <svg
            role="img"
            aria-label={`${series.label} performance trend with ${series.axisLabel} axis`}
            viewBox={plot.viewBox}
            className="performance-trend-svg"
          >
            <text className="performance-trend-axis-title" x="4" y="22">
              {series.axisLabel}
            </text>
            <text
              className="performance-trend-chart-title"
              x={plot.left + plot.width / 2}
              y="22"
            >
              {series.label}
            </text>
            <line
              className="performance-trend-axis-line"
              x1={plot.left}
              x2={plot.left}
              y1={plot.top}
              y2={plot.top + plot.height}
            />
            <line
              className="performance-trend-axis-line"
              x1={plot.left}
              x2={plot.left + plot.width}
              y1={plot.top + plot.height}
              y2={plot.top + plot.height}
            />
            {ticks.map((tick) => {
              const y =
                plot.top +
                plot.height -
                (tick / maximum) * plot.height;

              return (
                <g key={tick} className="performance-trend-gridline">
                  <line
                    x1={plot.left}
                    x2={plot.left + plot.width}
                    y1={y}
                    y2={y}
                  />
                  <text x={plot.left - 12} y={y + 4}>
                    {formatTrendAxisTick(tick)}
                  </text>
                </g>
              );
            })}
            {polyline ? (
              <polyline className="performance-trend-line" points={polyline} />
            ) : null}
            {plottedPoints.map((point, index) => {
              const datum = points[index];
              const isActive = activePointIndex === index;

              return (
                <g
                  key={datum.id}
                  className={`performance-trend-point${isActive ? " is-active" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${datum.gameLabel}: ${datum.displayValue}. ${datum.detail}`}
                  onClick={() => setActivePoint({ metric: series.metric, index })}
                  onFocus={() => setActivePoint({ metric: series.metric, index })}
                  onKeyDown={(event) => handlePointKeyDown(event, index)}
                  onMouseEnter={() => setActivePoint({ metric: series.metric, index })}
                >
                  <title>
                    {datum.gameLabel}: {datum.displayValue}. {datum.detail}
                  </title>
                  <circle cx={point.x} cy={point.y} r={plot.pointRadius} />
                  <circle cx={point.x} cy={point.y} r={plot.pointInnerRadius} />
                  <text x={point.x} y={plot.bottom}>
                    {datum.label}
                  </text>
                  <text
                    className="performance-trend-date-label"
                    x={point.x}
                    y={plot.bottom + 18}
                  >
                    {datum.shortDateLabel}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {selectedPoint ? (
          <aside className="performance-trend-detail-card" aria-live="polite">
            <span>Selected match</span>
            <h4>{selectedPoint.gameLabel}</h4>
            <p>{selectedPoint.fullDateLabel}</p>
            {selectedPoint.inningsLabel ? (
              <strong className="performance-trend-innings-label">
                {selectedPoint.inningsLabel}
              </strong>
            ) : null}
            <strong className="data-number-strong">
              {getTrendPrimaryValue(series, selectedPoint)}
            </strong>
            <dl>
              {selectedPoint.detailRows.map((row) => (
                <div key={`${row.label}-${row.value}`}>
                  <dt>{row.label}</dt>
                  <dd className="data-number">{row.value}</dd>
                </div>
              ))}
            </dl>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

export function PlayerProfile({
  advancedStats,
  achievements,
  performanceTrends,
  player,
  profileNavigation
}: {
  player: Player;
  advancedStats?: AdvancedCareerStats;
  achievements?: PlayerAchievements;
  performanceTrends?: PlayerPerformanceTrends;
  profileNavigation?: PlayerProfileNavigation;
}) {
  const [selectedTrendMetric, setSelectedTrendMetric] =
    useState<PlayerTrendMetric>("score");
  const trendPanelRef = useRef<HTMLDivElement | null>(null);
  const levelProgress = getLevelProgress(player.xp);
  const trends = useMemo(
    () => performanceTrends ?? createEmptyPlayerPerformanceTrends(player.id),
    [performanceTrends, player.id]
  );
  const selectedTrend = trends.series[selectedTrendMetric];
  const exactStats =
    advancedStats ??
    ({
      playerId: player.id,
      inningsBatted: 0,
      trackedBattingInnings: 0,
      trackedBattingRuns: 0,
      ballsFaced: 0,
      fours: 0,
      sixes: 0,
      boundaries: 0,
      strikeRate: null,
      highestScore: null,
      highestScoreNotOut: false,
      ducks: 0,
      matchesBowled: 0,
      trackedBowlingMatches: 0,
      trackedRunsConceded: 0,
      legalBallsBowled: 0,
      economy: null,
      matchesWithEventHistory: 0,
      legacyFinalisedMatchesWithoutEvents: 0
    } satisfies AdvancedCareerStats);
  const coverageTotal = Math.max(
    player.stats.matches,
    exactStats.matchesWithEventHistory + exactStats.legacyFinalisedMatchesWithoutEvents
  );
  const trackedCoverageText =
    coverageTotal > 0
      ? `${exactStats.matchesWithEventHistory} of ${coverageTotal} matches`
      : "0 of 0 matches";
  const heroSummary =
    player.heroSummary ??
    `${player.role} with a distinctive style in every department.`;
  const specialMoveName = player.specialMoveName ?? "Matchday Mode";
  const specialMoveDescription =
    player.specialMoveDescription ??
    player.funTrait ??
    "Always brings a little extra energy to the game.";
  const selectTrendMetric = (metric: PlayerTrendMetric) => {
    setSelectedTrendMetric(metric);
    trendPanelRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest"
    });
  };

  const powerItems = [
    {
      key: "batting",
      label: "Blade Power",
      icon: PLAYER_PROFILE_POWER_ICONS.batting,
      value: player.ratings.batting
    },
    {
      key: "bowling",
      label: "Delivery Threat",
      icon: PLAYER_PROFILE_POWER_ICONS.bowling,
      value: player.ratings.bowling
    },
    {
      key: "fielding",
      label: "Field Reflex",
      icon: PLAYER_PROFILE_POWER_ICONS.fielding,
      value: player.ratings.fielding
    }
  ] as const;

  const fileItems = [
    {
      key: "batting",
      label: "Batting DNA",
      icon: PLAYER_FILE_ICONS.batting,
      text: player.battingProfile
    },
    {
      key: "bowling",
      label: "Bowling Arsenal",
      icon: PLAYER_FILE_ICONS.bowling,
      text: player.bowlingProfile
    },
    {
      key: "fielding",
      label: "Fielding Instinct",
      icon: PLAYER_FILE_ICONS.fielding,
      text: player.fieldingProfile
    }
  ] as const;

  return (
    <main
      className="player-profile-page"
      style={{ "--player-accent": player.accentColor } as CSSProperties}
    >
      <section className="player-hero">
        <PlayerProfileBrowser navigation={profileNavigation} />

        <div className="player-hero-artwork">
          <div className="profile-artwork-frame">
            {player.cardImage ? (
              <Image
                src={player.cardImage}
                alt={`${player.name} - ${player.cardTitle}`}
                fill
                sizes="(max-width: 900px) 90vw, 380px"
                className="profile-artwork-image"
                priority
              />
            ) : (
              <div className="profile-artwork-fallback" aria-hidden="true">
                {getInitials(player.name)}
              </div>
            )}
          </div>
        </div>

        <div className="player-hero-information">
          <div className="profile-identity">
            <p className="player-identity-kicker">Gully Legends Player File</p>
            <h1>{player.name}</h1>
            <p className="player-role">{player.role}</p>
            <p className="player-summary">{heroSummary}</p>
          </div>

          <section className="career-scoreboard" aria-labelledby="career-scoreboard-title">
            <SectionHeading id="career-scoreboard-title">
              Career Scoreboard
            </SectionHeading>
            <div className="career-metrics">
              <StatTile
                icon={<Trophy className="h-5 w-5" />}
                label="Level"
                value={player.level}
              />
              <StatTile icon={<Zap className="h-5 w-5" />} label="XP" value={player.xp} />
              <StatTile
                icon={<Swords className="h-5 w-5" />}
                label="Matches"
                value={player.stats.matches}
              />
              <StatTile
                icon={<Flame className="h-5 w-5" />}
                label="Runs"
                value={player.stats.runs}
              />
              <StatTile
                icon={<ShieldCheck className="h-5 w-5" />}
                label="Wickets"
                value={player.stats.wickets}
              />
              <StatTile
                icon={<Trophy className="h-5 w-5" />}
                label="Catches"
                value={player.stats.catches}
              />
            </div>
            <div className="career-level-progress mt-4 rounded-md border border-white/12 bg-black/30 p-3">
              <div className="career-level-progress-heading flex items-center justify-between gap-3 text-xs font-black uppercase text-stone-300">
                <span>Next Level Progress</span>
                <strong className="data-number-strong text-neon-yellow">
                  {levelProgress.xpWithinLevel}/{levelProgress.xpRequiredWithinLevel} XP
                  {" "}
                  ({formatPercentage(levelProgress.progressPercentage)})
                </strong>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-neon-yellow"
                  style={{ width: `${levelProgress.progressPercentage}%` }}
                />
              </div>
            </div>
          </section>
        </div>
      </section>

      <div className="player-profile-content">
        <section className="fun-trait-callout">
          <div className="fun-trait-label">On-Field Special Move</div>
          <h3>{specialMoveName}</h3>
          <p>{specialMoveDescription}</p>
        </section>

        <section className="player-power-section" aria-labelledby="player-power-title">
          <SectionHeading id="player-power-title">Player Power</SectionHeading>
          <div className="hero-ratings">
            {powerItems.map((item) => (
              <HeroRatingRow
                key={item.key}
                icon={item.icon}
                label={item.label}
                type={item.key}
                value={item.value}
              />
            ))}
          </div>
        </section>

        <section className="player-file-section" aria-labelledby="player-file-title">
          <SectionHeading id="player-file-title">Player File</SectionHeading>
          <div className="player-file-grid">
            {fileItems.map((item) => (
              <ProfileTrait
                key={item.key}
                icon={item.icon}
                label={item.label}
                type={item.key}
                text={item.text}
              />
            ))}
          </div>
        </section>

        <section className="career-statistics-section" aria-label="Career cricket statistics">
          <div className="career-detail-grid">
            <article>
              <h3>Career Batting Totals</h3>
              <dl>
                <CareerMiniStat label="Innings" value={exactStats.inningsBatted} />
                <CareerMiniStat
                  label="Runs"
                  metric="score"
                  onSelectTrend={selectTrendMetric}
                  value={player.stats.runs}
                />
                <CareerMiniStat
                  label="Highest Score"
                  value={formatHighestScore(exactStats)}
                />
                <CareerMiniStat
                  label="Batting Average"
                  metric="battingAverage"
                  onSelectTrend={selectTrendMetric}
                  value={trends.battingAverageDisplay}
                />
              </dl>
              <h4>Ball-by-ball tracked</h4>
              <dl>
                <CareerMiniStat
                  label="Tracked Innings"
                  value={`${exactStats.trackedBattingInnings} of ${exactStats.inningsBatted}`}
                />
                <CareerMiniStat
                  label="Tracked Runs"
                  value={exactStats.trackedBattingRuns}
                />
                <CareerMiniStat label="Balls Faced" value={exactStats.ballsFaced} />
                <CareerMiniStat
                  label="Tracked Strike Rate"
                  metric="battingStrikeRate"
                  onSelectTrend={selectTrendMetric}
                  value={formatStrikeRate(exactStats.strikeRate)}
                />
                <CareerMiniStat label="Fours" value={exactStats.fours} />
                <CareerMiniStat label="Sixes" value={exactStats.sixes} />
              </dl>
            </article>
            <article>
              <h3>Career Bowling Totals</h3>
              <dl>
                <CareerMiniStat label="Wickets" value={player.stats.wickets} />
              </dl>
              <h4>Ball-by-ball tracked</h4>
              <dl>
                <CareerMiniStat
                  label="Tracked Bowling Matches"
                  value={exactStats.trackedBowlingMatches}
                />
                <CareerMiniStat
                  label="Tracked Overs"
                  value={formatLegalBallsAsOvers(exactStats.legalBallsBowled)}
                />
                <CareerMiniStat
                  label="Tracked Runs Conceded"
                  value={exactStats.trackedRunsConceded}
                />
                <CareerMiniStat
                  label="Tracked Economy"
                  metric="economy"
                  onSelectTrend={selectTrendMetric}
                  value={formatEconomy(exactStats.economy)}
                />
                <CareerMiniStat
                  label="Tracked Bowling Strike Rate"
                  metric="bowlingStrikeRate"
                  onSelectTrend={selectTrendMetric}
                  value={trends.trackedBowlingStrikeRateDisplay}
                />
              </dl>
            </article>
          </div>
          <p className="career-tracked-note">
            Ball-by-ball coverage: {trackedCoverageText}. Strike rate, balls
            faced, economy, bowling strike rate and boundary statistics use
            ball-by-ball tracked matches only.
          </p>
        </section>

        <section
          className="performance-trend-panel"
          aria-labelledby="performance-trend-title"
          ref={trendPanelRef}
        >
          <div className="performance-trend-heading">
            <div>
              <h3 id="performance-trend-title">Performance Trend</h3>
              <p>{selectedTrend.note}</p>
            </div>
            <div
              className="performance-trend-tabs"
              role="tablist"
              aria-label="Performance trend metrics"
            >
              {TREND_METRIC_ORDER.map((metric) => {
                const item = trends.series[metric];

                return (
                  <button
                    key={metric}
                    type="button"
                    role="tab"
                    aria-selected={selectedTrendMetric === metric}
                    className={selectedTrendMetric === metric ? "is-active" : undefined}
                    onClick={() => setSelectedTrendMetric(metric)}
                  >
                    {item.shortLabel}
                  </button>
                );
              })}
            </div>
          </div>
          <PerformanceTrendGraph series={selectedTrend} />
          <p className="performance-trend-accessible-summary">
            {selectedTrend.points.length > 0
              ? `${selectedTrend.label} trend has ${selectedTrend.points.length} plotted points from ${selectedTrend.points[0].label} to ${selectedTrend.points[selectedTrend.points.length - 1].label}.`
              : selectedTrend.emptyMessage}
          </p>
        </section>

        {achievements ? <TrophyCabinet achievements={achievements} /> : null}
      </div>
    </main>
  );
}
