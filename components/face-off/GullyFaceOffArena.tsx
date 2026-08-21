"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useMemo,
  type CSSProperties
} from "react";
import {
  buildGullyFaceOff,
  type FaceOffMetric,
  type FaceOffSection,
  type GullyFaceOffPlayer
} from "@/lib/gully-face-off";
import { useMatchRepository } from "@/components/matches/useMatchRepository";
import { useCareerPlayers } from "@/components/players/useCareerPlayers";
import type { MatchRecord } from "@/lib/types/match";
import type { Player } from "@/lib/types/player";

const featuredMetricIds = new Set(["career-runs", "highest-score", "sixes", "wickets", "xp"]);
const faceOffVsArtwork = "/ui/face-off/gully-face-off-vs.png";

function formatContext(metric: FaceOffMetric, side: "left" | "right") {
  const value = metric[side];
  const context = value.context ?? {};

  if (value.availability === "tracked-only") {
    const tracked = Number(context.trackedInnings ?? 0);
    const innings = Number(context.innings ?? 0);
    const trackedBowlingMatches = Number(context.trackedBowlingMatches ?? 0);
    const matchesBowled = Number(context.matchesBowled ?? 0);

    if (metric.id === "economy") {
      return matchesBowled > 0
        ? `Tracked only - ${trackedBowlingMatches} / ${matchesBowled} matches`
        : "Tracked only";
    }

    return innings > 0
      ? `Tracked only - ${tracked} / ${innings} innings`
      : "Tracked innings only";
  }

  if (value.availability === "unavailable") {
    if (metric.id === "strike-rate") {
      return `${context.ballsFaced ?? 0} tracked balls. Minimum ${context.minimumBallsFaced ?? 20}`;
    }

    if (metric.id === "economy") {
      return `${context.legalBalls ?? 0} legal balls. Minimum ${context.minimumLegalBalls ?? 18}`;
    }

    return "Tracked data unavailable";
  }

  if (metric.id === "strike-rate") return `${context.ballsFaced ?? 0} balls faced`;
  if (metric.id === "economy") return `${context.legalBalls ?? 0} legal balls`;
  if (metric.id === "highest-score") return `${context.innings ?? 0} innings`;

  return metric.direction === "lower" ? "Lower is better" : "Official matches";
}

function formatMetricDisplayValue(metric: FaceOffMetric, side: "left" | "right") {
  const value = metric[side];

  if (value.availability === "reliable" || value.availability === "tracked-only") {
    return value.displayValue;
  }

  return "-";
}

function getBarWidth(metric: FaceOffMetric, side: "left" | "right") {
  const leftValue = metric.left.value;
  const rightValue = metric.right.value;
  const current = metric[side].value;

  if (
    metric.availability === "unavailable" ||
    leftValue === null ||
    rightValue === null ||
    current === null
  ) {
    return "0%";
  }

  const max = Math.max(Math.abs(leftValue), Math.abs(rightValue));

  if (max <= 0) return "50%";

  return `${Math.max(8, Math.min(100, (Math.abs(current) / max) * 100))}%`;
}

function getLeaderLabel(metric: FaceOffMetric, leftName: string, rightName: string) {
  if (metric.leader === "left") return `← ${leftName} leads`;
  if (metric.leader === "right") return `${rightName} leads →`;
  if (metric.leader === "tie") return "Even battle";

  return "Full tracking required";
}

function getLeaderSupport(metric: FaceOffMetric) {
  if (metric.availability === "tracked-only") {
    return metric.id === "economy" ? "Tracked bowling only" : "Tracked innings only";
  }

  if (metric.availability === "unavailable") {
    return "No usable tracked data";
  }

  return null;
}

function PlayerSelector({
  label,
  value,
  players,
  onChange
}: {
  label: string;
  value: string;
  players: Player[];
  onChange: (playerId: string) => void;
}) {
  return (
    <label className="face-off-selector">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
      >
        <option value="">Choose warrior</option>
        {players.map((player) => (
          <option key={player.id} value={player.id}>
            {player.name} - {player.cardTitle}
          </option>
        ))}
      </select>
    </label>
  );
}

function EmptyArena() {
  return (
    <section className="face-off-empty-arena" aria-label="Choose contenders">
      <div className="face-off-empty-slot">
        <span>PLAYER 1</span>
      </div>
      <div className="face-off-vs-emblem face-off-vs-emblem-empty" aria-hidden="true">
        <Image
          src={faceOffVsArtwork}
          alt=""
          fill
          sizes="72px"
          className="face-off-vs-image"
        />
      </div>
      <div className="face-off-empty-slot">
        <span>PLAYER 2</span>
      </div>
      <p>Choose your contenders and let the stats start swinging.</p>
    </section>
  );
}

function FaceOffPlayerCard({
  player,
  side
}: {
  player: GullyFaceOffPlayer;
  side: "left" | "right";
}) {
  return (
    <Link
      href={`/players/${player.slug}`}
      className="face-off-hero-player"
      data-side={side}
      aria-label={`Open ${player.name} profile`}
    >
      <div className="face-off-player-artwork">
        <Image
          src={player.cardImage}
          alt={`${player.name} - ${player.cardTitle}`}
          fill
          sizes="(max-width: 640px) 38vw, 260px"
          className="face-off-player-image"
          priority
        />
      </div>
      <div className="face-off-player-copy">
        <p>{player.cardTitle}</p>
        <h2>{player.name}</h2>
        <span>{player.role}</span>
        <strong>Level {player.level}</strong>
      </div>
    </Link>
  );
}

function FaceOffHero({
  left,
  right
}: {
  left: GullyFaceOffPlayer;
  right: GullyFaceOffPlayer;
}) {
  return (
    <section className="face-off-matchup-hero" aria-label={`${left.name} versus ${right.name}`}>
      <FaceOffPlayerCard player={left} side="left" />
      <div className="face-off-vs-emblem" aria-label="versus">
        <Image
          src={faceOffVsArtwork}
          alt=""
          fill
          sizes="(max-width: 720px) 70px, (max-width: 1080px) 96px, 192px"
          className="face-off-vs-image"
          priority
        />
      </div>
      <FaceOffPlayerCard player={right} side="right" />
    </section>
  );
}

function MetricValue({
  metric,
  side,
  playerName
}: {
  metric: FaceOffMetric;
  side: "left" | "right";
  playerName: string;
}) {
  const value = metric[side];
  const leads = metric.leader === side;

  return (
    <div
      className="face-off-metric-value"
      data-leads={leads}
      data-availability={value.availability}
    >
      <span>{playerName}</span>
      <strong>{formatMetricDisplayValue(metric, side)}</strong>
      <div className="face-off-meter" aria-hidden="true">
        <i style={{ width: getBarWidth(metric, side) }} />
      </div>
      <small>{formatContext(metric, side)}</small>
    </div>
  );
}

function MetricRow({
  metric,
  leftName,
  rightName
}: {
  metric: FaceOffMetric;
  leftName: string;
  rightName: string;
}) {
  return (
    <article
      className="face-off-metric-row"
      data-leader={metric.leader}
      data-featured={featuredMetricIds.has(metric.id)}
      data-availability={metric.availability}
    >
      <MetricValue metric={metric} side="left" playerName={leftName} />
      <div className="face-off-metric-center">
        <p>{metric.label}</p>
        <span>{getLeaderLabel(metric, leftName, rightName)}</span>
        {getLeaderSupport(metric) ? <small>{getLeaderSupport(metric)}</small> : null}
      </div>
      <MetricValue metric={metric} side="right" playerName={rightName} />
    </article>
  );
}

function getEdgeCopy(section: FaceOffSection, leftName: string, rightName: string) {
  if (section.edge.leader === "left") return `⚡ ${leftName} edge`;
  if (section.edge.leader === "right") return `⚡ ${rightName} edge`;
  if (section.edge.leader === "tie") return "Even edge";

  return "Edge not called";
}

function FaceOffSectionCard({
  section,
  leftName,
  rightName
}: {
  section: FaceOffSection;
  leftName: string;
  rightName: string;
}) {
  return (
    <section
      className="face-off-battle-section"
      data-section={section.id}
      data-edge={section.edge.leader}
      aria-labelledby={`${section.id}-face-off-title`}
    >
      <div className="face-off-section-heading">
        <div>
          <p>{section.id === "career-glory" ? "Glory board" : "Stat battle"}</p>
          <h2 id={`${section.id}-face-off-title`}>{section.title}</h2>
        </div>
        <strong>{getEdgeCopy(section, leftName, rightName)}</strong>
      </div>
      <div className="face-off-metric-stack">
        {section.metrics.map((metric) => (
          <MetricRow
            key={metric.id}
            metric={metric}
            leftName={leftName}
            rightName={rightName}
          />
        ))}
      </div>
    </section>
  );
}

export function GullyFaceOffArena({
  players,
  matches: suppliedMatches,
  careerResolved = false
}: {
  players: Player[];
  matches?: MatchRecord[];
  careerResolved?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const localCareerPlayers = useCareerPlayers(players);
  const careerPlayers = careerResolved ? players : localCareerPlayers;
  const localRepository = useMatchRepository();
  const matches = suppliedMatches ?? localRepository.matches;
  const playersById = useMemo(
    () => new Map(careerPlayers.map((player) => [player.id, player])),
    [careerPlayers]
  );
  const leftParam = searchParams.get("left") ?? "";
  const rightParam = searchParams.get("right") ?? "";
  const leftId = playersById.has(leftParam) ? leftParam : "";
  const rightId = playersById.has(rightParam) ? rightParam : "";
  const hasSamePlayer = leftId !== "" && leftId === rightId;
  const leftOptions = careerPlayers.filter((player) => player.id !== rightId || player.id === leftId);
  const rightOptions = careerPlayers.filter((player) => player.id !== leftId || player.id === rightId);
  const faceOff = leftId && rightId
    ? buildGullyFaceOff({
        players: careerPlayers,
        matches,
        leftPlayerId: leftId,
        rightPlayerId: rightId
      })
    : null;
  const readyFaceOff =
    faceOff?.availability.status === "ready" &&
    faceOff.left !== null &&
    faceOff.right !== null
      ? {
          left: faceOff.left,
          right: faceOff.right,
          sections: faceOff.sections,
          officialMatchCount: faceOff.officialMatchCount
        }
      : null;

  useEffect(() => {
    document.title = "GULLY FACE-OFF | Gully Legends Prague";
  }, []);

  function updateSelection(side: "left" | "right", playerId: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (playerId) {
      params.set(side, playerId);
    } else {
      params.delete(side);
    }

    if (side === "left" && playerId === rightId) params.delete("right");
    if (side === "right" && playerId === leftId) params.delete("left");

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function clearSelection() {
    router.replace(pathname, { scroll: false });
  }

  return (
    <main className="face-off-page">
      <section className="face-off-hero-copy">
        <p>Public stat arena</p>
        <h1 className="comic-title" aria-label="GULLY FACE-OFF">
          <span>GULLY</span> <span>FACE-OFF</span>
        </h1>
        <span>TWO PLAYERS. ONE STAT BATTLE.</span>
      </section>

      <section className="face-off-control-panel" aria-label="Choose Face-Off players">
        <PlayerSelector
          label="Player A"
          value={leftId}
          players={leftOptions}
          onChange={(playerId) => updateSelection("left", playerId)}
        />
        <div className="face-off-control-vs" aria-hidden="true">VS</div>
        <PlayerSelector
          label="Player B"
          value={rightId}
          players={rightOptions}
          onChange={(playerId) => updateSelection("right", playerId)}
        />
        {(leftId || rightId) ? (
          <button type="button" className="face-off-clear-button" onClick={clearSelection}>
            Reset
          </button>
        ) : null}
      </section>

      {hasSamePlayer ? (
        <section className="face-off-safety-note" role="status">
          <h2>Choose two different warriors</h2>
          <p>
            A player cannot face themselves in the arena. Pick another contender to start
            the battle.
          </p>
        </section>
      ) : null}

      {readyFaceOff ? (
        <>
          <FaceOffHero left={readyFaceOff.left} right={readyFaceOff.right} />
          <section
            className="face-off-domain-note"
            style={
              {
                "--official-count": readyFaceOff.officialMatchCount
              } as CSSProperties
            }
          >
            <strong>{readyFaceOff.officialMatchCount}</strong>
            <span>official matches scanned</span>
            <p>
              No single throne. Every category tells its own story.
            </p>
          </section>
          <div className="face-off-battle-grid">
            {readyFaceOff.sections.map((section) => (
              <FaceOffSectionCard
                key={section.id}
                section={section}
                leftName={readyFaceOff.left.name}
                rightName={readyFaceOff.right.name}
              />
            ))}
          </div>
        </>
      ) : !hasSamePlayer ? (
        <EmptyArena />
      ) : null}
    </main>
  );
}
