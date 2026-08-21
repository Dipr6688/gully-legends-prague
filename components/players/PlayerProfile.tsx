import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { Flame, ShieldCheck, Swords, Trophy, Zap } from "lucide-react";
import { TrophyCabinet } from "@/components/players/TrophyCabinet";
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
      <strong>{value}</strong>
    </div>
  );
}

function CareerMiniStat({
  label,
  value
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
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
          <strong>{value}/100</strong>
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

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function PlayerProfile({
  advancedStats,
  achievements,
  player
}: {
  player: Player;
  advancedStats?: AdvancedCareerStats;
  achievements?: PlayerAchievements;
}) {
  const levelProgress = getLevelProgress(player.xp);
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
            <div className="career-detail-grid">
              <article>
                <h3>Career Batting Totals</h3>
                <dl>
                  <CareerMiniStat label="Innings" value={exactStats.inningsBatted} />
                  <CareerMiniStat label="Runs" value={player.stats.runs} />
                  <CareerMiniStat
                    label="Highest Score"
                    value={formatHighestScore(exactStats)}
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
                    value={formatEconomy(exactStats.economy)}
                  />
                </dl>
              </article>
            </div>
            <p className="career-tracked-note">
              Ball-by-ball coverage: {trackedCoverageText}. Strike rate, balls
              faced, economy and boundary statistics use ball-by-ball tracked
              matches only.
            </p>
            <div className="mt-4 rounded-md border border-white/12 bg-black/30 p-3">
              <div className="flex items-center justify-between gap-3 text-xs font-black uppercase text-stone-300">
                <span>Next Level Progress</span>
                <strong className="text-neon-yellow">
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
        </div>
      </section>

      <div className="player-profile-content">
        {achievements ? <TrophyCabinet achievements={achievements} /> : null}
      </div>
    </main>
  );
}
