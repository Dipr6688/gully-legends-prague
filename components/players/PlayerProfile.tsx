import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { Flame, ShieldCheck, Swords, Trophy, Zap } from "lucide-react";
import type { Player } from "@/lib/types/player";

const ratingIcons = {
  batting: "/ui/most-runs-bat.png",
  bowling: "/ui/most-wickets-wicket-smash.png",
  fielding: "/ui/most-catches-gloves-ball.png"
} as const;

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

function HeroRatingRow({
  icon,
  label,
  value
}: {
  icon: string;
  label: string;
  value: number;
}) {
  const width = `${Math.max(0, Math.min(100, value))}%`;

  return (
    <div className="hero-rating-row">
      <div className="hero-rating-icon">
        <Image src={icon} alt="" width={80} height={80} />
      </div>
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
  text
}: {
  icon: string;
  label: string;
  text: string;
}) {
  return (
    <article className="profile-trait">
      <div className="profile-trait-icon">
        <Image src={icon} alt="" width={58} height={58} />
      </div>
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

export function PlayerProfile({ player }: { player: Player }) {
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
      icon: ratingIcons.batting,
      value: player.ratings.batting
    },
    {
      key: "bowling",
      label: "Delivery Threat",
      icon: ratingIcons.bowling,
      value: player.ratings.bowling
    },
    {
      key: "fielding",
      label: "Field Reflex",
      icon: ratingIcons.fielding,
      value: player.ratings.fielding
    }
  ] as const;

  const fileItems = [
    {
      key: "batting",
      label: "Batting DNA",
      icon: ratingIcons.batting,
      text: player.battingProfile
    },
    {
      key: "bowling",
      label: "Bowling Arsenal",
      icon: ratingIcons.bowling,
      text: player.bowlingProfile
    },
    {
      key: "fielding",
      label: "Fielding Instinct",
      icon: ratingIcons.fielding,
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
          </section>

          <section className="player-power-section" aria-labelledby="player-power-title">
            <SectionHeading id="player-power-title">Player Power</SectionHeading>
            <div className="hero-ratings">
              {powerItems.map((item) => (
                <HeroRatingRow
                  key={item.key}
                  icon={item.icon}
                  label={item.label}
                  value={item.value}
                />
              ))}
            </div>
          </section>
        </div>
      </section>

      <div className="player-profile-content">
        <section className="player-file-section" aria-labelledby="player-file-title">
          <SectionHeading id="player-file-title">Player File</SectionHeading>
          <div className="player-file-grid">
            {fileItems.map((item) => (
              <ProfileTrait
                key={item.key}
                icon={item.icon}
                label={item.label}
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
      </div>
    </main>
  );
}
