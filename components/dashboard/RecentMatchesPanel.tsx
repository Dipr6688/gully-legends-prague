"use client";

import Image from "next/image";
import { Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { useDashboardSummary } from "@/components/dashboard/useDashboardSummary";
import { activePlayers } from "@/lib/data/players";
import { getDashboardSummary } from "@/lib/dashboard-summary";
import {
  formatMatchDisplayDate,
  getMatchResultHeadline,
  getMatchTeamScore
} from "@/lib/match-display";
import type { MatchRecord } from "@/lib/types/match";
import type { Player } from "@/lib/types/player";

function RecentMatchRow({ match }: { match: MatchRecord }) {
  return (
    <article className="rounded-lg border border-neon-cyan/18 bg-black/56 p-3 shadow-inner">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-ui text-sm font-black uppercase text-stone-100">
            {match.matchName}
          </h3>
          <p className="mt-1 text-xs font-bold uppercase text-stone-400">
            {formatMatchDisplayDate(match.matchDate)} - {match.venue}
          </p>
        </div>
        <span className="rounded-full border border-neon-yellow/30 bg-neon-yellow/10 px-2 py-1 text-[0.68rem] font-black uppercase text-neon-yellow">
          Finalised
        </span>
      </div>
      <div className="mt-3 grid gap-1 text-xs font-black uppercase text-stone-200">
        <span>
          {match.teams.teamA.teamName}:{" "}
          <span className="data-number">{getMatchTeamScore(match, "teamA")}</span>
        </span>
        <span>
          {match.teams.teamB.teamName}:{" "}
          <span className="data-number">{getMatchTeamScore(match, "teamB")}</span>
        </span>
      </div>
      <p className="mt-3 text-xs font-black uppercase text-neon-cyan">
        {getMatchResultHeadline(match)}
      </p>
    </article>
  );
}

export function RecentMatchesPanel({
  players,
  matches
}: {
  players?: Player[];
  matches?: MatchRecord[];
}) {
  const localDashboard = useDashboardSummary(activePlayers);
  const summary = matches
    ? getDashboardSummary({ matches, players: players ?? activePlayers })
    : localDashboard.summary;
  const recentMatches = summary.recentFinalisedMatches;

  return (
    <Card className="recent-matches-panel p-4">
      <div className="recent-matches-header flex items-center justify-between gap-4">
        <div>
          <h2 className="arcade-heading text-xl uppercase">Recent Matches</h2>
          <span className="heading-accent" aria-hidden="true" />
        </div>
        <LinkButton href="/matches" variant="ghost" className="min-h-9 px-3 text-xs">
          Archive
        </LinkButton>
      </div>
      <div className="recent-matches-content mt-4">
        <div className="recent-match-list grid gap-2 text-sm text-stone-300">
          {recentMatches.length > 0 ? (
            recentMatches.map((match) => (
              <RecentMatchRow key={match.id} match={match} />
            ))
          ) : (
            <div className="rounded-lg border border-neon-cyan/18 bg-black/50 p-3 text-sm text-stone-300 shadow-inner">
              <p className="arcade-heading text-lg font-black uppercase text-stone-100">
                No matches yet
              </p>
              <p className="mt-2 max-w-52 leading-5">
                Create and finalise the first match to begin the archive.
              </p>
            </div>
          )}
        </div>
        <div className="recent-match-artwork" aria-hidden="true">
          <Image
            src="/ui/recent-matches-wicket-ball.png"
            alt=""
            fill
            sizes="210px"
            quality={100}
            className="recent-match-artwork-image"
          />
        </div>
      </div>
    </Card>
  );
}
