"use client";

import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight, Crown } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useDashboardSummary } from "@/components/dashboard/useDashboardSummary";
import { activePlayers } from "@/lib/data/players";
import {
  LEADERBOARD_CATEGORIES,
  formatLeaderboardValue,
  getLeaderboardEntries,
  getLeaderboardSummary,
  type LeaderboardCategory,
  type PlayerLeaderboardEntry
} from "@/lib/leaderboard";
import { useCareerPlayers } from "@/components/players/useCareerPlayers";
import type { MatchRecord } from "@/lib/types/match";
import type { Player } from "@/lib/types/player";

type TopPerformerCategory = Extract<
  LeaderboardCategory,
  "runs" | "wickets" | "catches"
>;

type TopPerformerCardProps = {
  category: TopPerformerCategory;
  leaders: PlayerLeaderboardEntry[];
  value: number;
  status: "single-leader" | "joint-leaders" | "race-not-started" | "all-tied";
};

const topPerformerCategories = ["runs", "wickets", "catches"] as const;

const topPerformerAccents = {
  runs: "#ff8f1f",
  wickets: "#c557ff",
  catches: "#9cff24"
} as const satisfies Record<TopPerformerCategory, string>;

const PLAYER_PORTRAIT_POSITION = {
  aninda: "50% 18%",
  arunabha: "50% 16%",
  atripan: "50% 17%",
  biplab: "50% 18%",
  dipanjan: "50% 17%",
  rohit: "50% 16%",
  soman: "50% 17%"
} as const;

function getPortraitPosition(playerId: string) {
  return (
    PLAYER_PORTRAIT_POSITION[playerId as keyof typeof PLAYER_PORTRAIT_POSITION] ??
    "50% 18%"
  );
}

function getZeroCopy(category: TopPerformerCategory) {
  if (category === "runs") return "No runs recorded yet";
  if (category === "wickets") return "No wickets recorded yet";

  return "No catches recorded yet";
}

function getDisplayValue({
  category,
  leaderCount,
  value
}: {
  category: TopPerformerCategory;
  leaderCount: number;
  value: number;
}) {
  const baseValue = formatLeaderboardValue(category, value);

  return leaderCount > 1 ? `${baseValue} EACH` : baseValue;
}

function TopPerformerPortraits({
  isJointLeader,
  leaders,
  value
}: {
  isJointLeader: boolean;
  leaders: PlayerLeaderboardEntry[];
  value: number;
}) {
  const visibleLeaders = leaders.slice(0, 2);
  const extraCount = Math.max(0, leaders.length - visibleLeaders.length);

  if (value <= 0) return null;

  return (
    <div
      className={`performer-portrait-stack${
        isJointLeader ? " performer-portrait-stack-joint" : ""
      }`}
    >
      {isJointLeader ? (
        <span className="performer-joint-badge" aria-label="Joint all-time leaders">
          <Crown className="h-4 w-4" aria-hidden="true" />
          <b>JOINT #1</b>
        </span>
      ) : null}
      {visibleLeaders.map((entry) => (
        <div className="performer-portrait" key={entry.player.id}>
          <Image
            src={entry.player.cardImage}
            alt={`${entry.player.name} player card`}
            fill
            sizes="88px"
            quality={100}
            className="performer-portrait-image"
            style={{ objectPosition: getPortraitPosition(entry.player.id) }}
          />
        </div>
      ))}
      {extraCount > 0 ? <span className="performer-extra-count">+{extraCount}</span> : null}
      {!isJointLeader ? (
        <span className="performer-leader-badge" aria-label="All-time leader">
          <Crown className="h-4 w-4" aria-hidden="true" />
          <b>#1</b>
        </span>
      ) : null}
    </div>
  );
}

function TopPerformerCard({
  category,
  leaders,
  status,
  value
}: TopPerformerCardProps) {
  const meta = LEADERBOARD_CATEGORIES[category];
  const hasLeader = value > 0 && leaders.length > 0;
  const href =
    hasLeader && leaders.length === 1
      ? `/players/${leaders[0].player.slug}`
      : `/leaderboard?period=all-time&category=${category}`;
  const names = leaders
    .slice(0, 3)
    .map((entry) => entry.player.name)
    .join(" - ");
  const title = status === "joint-leaders" ? "JOINT LEADERS" : leaders[0]?.player.name;

  return (
    <Link
      href={href}
      className="top-performer-card"
      style={
        {
          "--performer-accent": topPerformerAccents[category]
        } as CSSProperties
      }
      aria-label={`${meta.label} spotlight`}
    >
      <Image
        src={meta.icon}
        alt=""
        width={220}
        height={220}
        className="performer-watermark"
      />
      <span className="performer-category">{meta.label}</span>
      {hasLeader ? (
        <>
          <TopPerformerPortraits
            isJointLeader={status === "joint-leaders"}
            leaders={leaders}
            value={value}
          />
          <div className="performer-copy">
            <h3>{title}</h3>
            {status === "joint-leaders" ? <p>{names}</p> : null}
            <strong>{getDisplayValue({ category, leaderCount: leaders.length, value })}</strong>
          </div>
        </>
      ) : (
        <div className="performer-empty-state">
          <Image src={meta.icon} alt="" width={96} height={96} />
          <h3>RACE NOT STARTED</h3>
          <p>{getZeroCopy(category)}</p>
        </div>
      )}
    </Link>
  );
}

export function TopPerformersPanel({
  players,
  matches: suppliedMatches,
  careerResolved = false
}: {
  players?: Player[];
  matches?: MatchRecord[];
  careerResolved?: boolean;
}) {
  const suppliedPlayers = players ?? activePlayers;
  const localCareerPlayers = useCareerPlayers(suppliedPlayers);
  const careerPlayers = careerResolved ? suppliedPlayers : localCareerPlayers;
  const localDashboard = useDashboardSummary(activePlayers);
  const matches = suppliedMatches ?? localDashboard.matches;
  const performers = topPerformerCategories.map((category) => {
    const entries = getLeaderboardEntries({
      players: careerPlayers,
      matches,
      category,
      period: "all-time"
    });
    const summary = getLeaderboardSummary({ category, entries });

    return {
      category,
      leaders: summary.leaders,
      status: summary.status,
      value: summary.value
    };
  });

  return (
    <Card className="h-full min-h-52 p-4">
      <div className="top-performers-header">
        <div>
          <h2 className="arcade-heading text-xl uppercase">
            Top Performers (All Time)
          </h2>
          <span className="heading-accent" aria-hidden="true" />
        </div>
        <Link href="/leaderboard" className="top-performers-hall-link">
          View Hall of Legends
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="top-performer-grid">
        {performers.map((performer) => (
          <TopPerformerCard
            key={performer.category}
            category={performer.category}
            leaders={performer.leaders}
            status={performer.status}
            value={performer.value}
          />
        ))}
      </div>
    </Card>
  );
}
