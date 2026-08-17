"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { useMatchRepository } from "@/components/matches/useMatchRepository";
import { MockMatchEntryForm } from "@/components/matches/MockMatchEntryForm";
import { getPlayerById } from "@/lib/data/players";
import {
  formatMatchDisplayDate,
  getMatchResultHeadline,
} from "@/lib/match-display";
import {
  buildPlayerOfMatchSummary,
  buildScorecardInnings,
  getOrderedInnings,
  type ScorecardInnings
} from "@/lib/match-scorecard";
import type { MatchRecord } from "@/lib/types/match";
import type { Player } from "@/lib/types/player";

export function MatchScorecard({
  matchId,
  initialMatch,
  players,
  matches: suppliedMatches,
  isAdmin = true
}: {
  matchId: string;
  initialMatch?: MatchRecord | null;
  players?: Player[];
  matches?: MatchRecord[];
  isAdmin?: boolean;
}) {
  const localRepository = useMatchRepository();
  const searchParams = useSearchParams();
  const matches = suppliedMatches ?? localRepository.matches;
  const match =
    initialMatch ?? matches.find((candidate) => candidate.id === matchId) ?? null;
  const playerById = (playerId: string) =>
    players?.find((player) => player.id === playerId) ?? getPlayerById(playerId);

  if (!match) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 lg:px-6">
        <EmptyState title="MATCH NOT FOUND">
          This match is not available in the archive.
        </EmptyState>
      </div>
    );
  }

  const [firstInnings, secondInnings] = getOrderedInnings(match);

  if (match.status === "draft" || match.status === "in_progress") {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 lg:px-6">
        <MockMatchEntryForm
          initialMatch={match}
          matches={matches}
          isAdmin={isAdmin}
        />
      </div>
    );
  }

  const resolvePlayerName = (playerId: string) => playerById(playerId)?.name ?? playerId;
  const scorecardInnings = [firstInnings, secondInnings].map((innings) =>
    buildScorecardInnings(match, innings, resolvePlayerName)
  );
  const playerOfMatch = buildPlayerOfMatchSummary(match, playerById);
  const returnTo = searchParams.get("returnTo");
  const backToMatchesHref =
    returnTo && returnTo.startsWith("/matches") && !returnTo.startsWith("//")
      ? returnTo
      : "/matches";

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-6">
      <Link href={backToMatchesHref} className="match-scorecard-back">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to Matches
      </Link>
      <section className="match-scorecard">
        <div className="match-scorecard-header">
          <div>
            <p className="text-xs font-black uppercase text-neon-cyan">
              Match Scorecard
            </p>
            <h1 className="font-display text-5xl uppercase comic-title">
              {match.matchName}
            </h1>
            <span>
              {formatMatchDisplayDate(match.matchDate)} - {match.venue}
            </span>
          </div>
          <strong>Finalised</strong>
        </div>

        <div className="match-scorecard-scoreboard">
          {scorecardInnings.map((scorecardInningsItem) => (
            <div key={scorecardInningsItem.innings.battingTeamId}>
              <span>{scorecardInningsItem.teamName}</span>
              <b>{scorecardInningsItem.score}</b>
            </div>
          ))}
        </div>

        <p className="match-scorecard-result">{getMatchResultHeadline(match)}</p>
      </section>

      <div className="match-scorecard-innings-stack">
        {scorecardInnings.map((innings) => (
          <ScorecardInningsSection
            key={innings.innings.battingTeamId}
            innings={innings}
          />
        ))}
      </div>

      <section className="match-scorecard-player-of-match">
        <p className="scorecard-section-kicker">Player of the Match</p>
        {playerOfMatch ? (
          <div className="scorecard-potm-content">
            <div className="player-of-match-card-artwork">
              <Image
                src={playerOfMatch.artwork}
                alt={`${playerOfMatch.name} - ${playerOfMatch.cardTitle}`}
                fill
                sizes="180px"
                className="player-of-match-card-image"
              />
            </div>
            <div>
              <h2>{playerOfMatch.name}</h2>
              <p>{playerOfMatch.role}</p>
              <span>{playerOfMatch.teamLabel}</span>
              {playerOfMatch.contributions.length > 0 ? (
                <strong>{playerOfMatch.contributions.join(" • ")}</strong>
              ) : null}
              <b>{playerOfMatch.xpAwarded} XP Awarded</b>
            </div>
          </div>
        ) : (
          <p className="scorecard-not-awarded">Not awarded</p>
        )}
      </section>

      <Link href="/matches" className="match-scorecard-back scorecard-bottom-back">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to Matches
      </Link>
    </div>
  );
}

function ScorecardInningsSection({ innings }: { innings: ScorecardInnings }) {
  return (
    <section className="scorecard-innings-card">
      <div className="scorecard-innings-header">
        <div>
          <p className="scorecard-section-kicker">{innings.teamName} Innings</p>
          <h2>{innings.score}</h2>
        </div>
        <div>
          <span>{innings.overs}</span>
          {innings.endLabel ? <strong>{innings.endLabel}</strong> : null}
        </div>
      </div>

      <div className="scorecard-innings-grid">
        <div className="scorecard-table-panel">
          <h3>{innings.teamName} Batting</h3>
          <table className="scorecard-table scorecard-batting-table">
            <thead>
              <tr>
                <th>Batter</th>
                <th>Dismissal</th>
                <th>R</th>
                <th>B</th>
                <th>4s</th>
                <th>6s</th>
                <th>SR</th>
              </tr>
            </thead>
            <tbody>
              {innings.battingRows.map((row) => (
                <tr key={row.key}>
                  <td>
                    <span className="scorecard-cell-value">{row.batter}</span>
                  </td>
                  <td>
                    <span className="scorecard-cell-value">{row.dismissal}</span>
                  </td>
                  <td>
                    <span className="scorecard-cell-value">{row.runs}</span>
                  </td>
                  <td>
                    <span className="scorecard-cell-value">{row.balls}</span>
                  </td>
                  <td>
                    <span className="scorecard-cell-value">{row.fours}</span>
                  </td>
                  <td>
                    <span className="scorecard-cell-value">{row.sixes}</span>
                  </td>
                  <td>
                    <span className="scorecard-cell-value">{row.strikeRate}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="scorecard-total-strip">
            <div>
              <span>Extras</span>
              <b>{innings.extras}</b>
            </div>
            <div>
              <span>Total</span>
              <b>{innings.total}</b>
            </div>
          </div>
        </div>

        <div className="scorecard-table-panel">
          <h3>{innings.bowlingTeamName} Bowling</h3>
          <table className="scorecard-table scorecard-bowling-table">
            <thead>
              <tr>
                <th>Bowler</th>
                <th>O</th>
                <th>M</th>
                <th>R</th>
                <th>W</th>
                <th>ECO</th>
              </tr>
            </thead>
            <tbody>
              {innings.bowlingFigures.map((figure) => (
                <tr key={figure.playerId}>
                  <td>
                    <span className="scorecard-cell-value">{figure.bowler}</span>
                  </td>
                  <td>
                    <span className="scorecard-cell-value">{figure.overs}</span>
                  </td>
                  <td>
                    <span className="scorecard-cell-value">{figure.maidens}</span>
                  </td>
                  <td>
                    <span className="scorecard-cell-value">{figure.runsConceded}</span>
                  </td>
                  <td>
                    <span className="scorecard-cell-value">{figure.wickets}</span>
                  </td>
                  <td>
                    <span className="scorecard-cell-value">{figure.economy}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
