"use client";

import Image from "next/image";
import { X } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/Button";
import { activePlayers, getPlayerById } from "@/lib/data/players";
import {
  getMatchResultHeadline,
  getMatchScheduledOversLabel,
  getMatchScoreRowsInInningsOrder
} from "@/lib/match-display";
import type {
  PostMatchCelebrationMetric,
  PostMatchCelebrationSummary
} from "@/lib/post-match-celebration";
import { sanitizeRuns } from "@/lib/match-records";
import type { FinalisedPlayerMatchRecord, MatchRecord } from "@/lib/types/match";
import type { Player } from "@/lib/types/player";

const CELEBRATION_ICONS = {
  winner: "/ui/post-match-celebration/winner-trophy.svg",
  pom: "/ui/post-match-celebration/pom-star.svg",
  record: "/ui/post-match-celebration/record-broken.svg",
  personalBest: "/ui/post-match-celebration/personal-best.svg",
  levelUp: "/ui/post-match-celebration/level-up.svg",
  xp: "/ui/post-match-celebration/xp-bolt.svg"
} as const;

const CONFETTI_PIECES = [
  ["8%", "0ms", "#f7c734"],
  ["14%", "360ms", "#46dfff"],
  ["22%", "120ms", "#9cff24"],
  ["29%", "640ms", "#ff8f1f"],
  ["36%", "260ms", "#f42135"],
  ["44%", "520ms", "#f7c734"],
  ["52%", "180ms", "#46dfff"],
  ["61%", "720ms", "#9cff24"],
  ["70%", "300ms", "#ff8f1f"],
  ["78%", "80ms", "#f42135"],
  ["86%", "460ms", "#f7c734"],
  ["93%", "220ms", "#46dfff"]
] as const;

type PostMatchCelebrationProps = {
  summary: PostMatchCelebrationSummary;
  match: MatchRecord;
  onDismiss: () => void;
};

function playerById(playerId: string): Player | undefined {
  return activePlayers.find((player) => player.id === playerId) ?? getPlayerById(playerId);
}

function getPlayerName(playerId: string): string {
  return playerById(playerId)?.name ?? playerId;
}

function formatSignedXP(value: number): string {
  if (value > 0) return `+${value} XP`;
  if (value < 0) return `${value} XP`;

  return "0 XP";
}

function formatMetricValue(value: number, unit: string): string {
  const upperUnit = unit.toUpperCase();

  if (upperUnit === "XP") return `${value} XP`;

  return `${value} ${upperUnit}`;
}

function getPlayerRecords(match: MatchRecord, playerId: string): FinalisedPlayerMatchRecord[] {
  return (match.finalisedPlayerRecords ?? []).filter(
    (record) => record.played && record.playerId === playerId
  );
}

function getPomContributionItems(records: FinalisedPlayerMatchRecord[]): string[] {
  const totals = records.reduce(
    (current, record) => ({
      runs: current.runs + (record.didBat ? sanitizeRuns(record.runs) : 0),
      wickets: current.wickets + sanitizeRuns(record.wickets),
      catches: current.catches + sanitizeRuns(record.catches),
      runOuts: current.runOuts + sanitizeRuns(record.runOuts),
      stumpings: current.stumpings + sanitizeRuns(record.stumpings ?? 0)
    }),
    { runs: 0, wickets: 0, catches: 0, runOuts: 0, stumpings: 0 }
  );
  const items: string[] = [];

  if (totals.runs > 0) items.push(`${totals.runs} Runs`);
  if (totals.wickets > 0) items.push(`${totals.wickets} Wickets`);
  if (totals.catches > 0) items.push(`${totals.catches} Catches`);
  if (totals.runOuts > 0) items.push(`${totals.runOuts} Run-outs`);
  if (totals.stumpings > 0) items.push(`${totals.stumpings} Stumpings`);

  return items;
}

function getOutcomeTitle(match: MatchRecord): string {
  if (match.result.type === "tie") return "MATCH TIED!";
  if (match.result.type === "no_result") return "NO RESULT";
  if ("winnerTeamId" in match.result) {
    const winnerName =
      match.result.winnerTeamId === "teamA"
        ? match.teams.teamA.teamName || "Team A"
        : match.teams.teamB.teamName || "Team B";

    return `${winnerName} WINS!`;
  }

  return "MATCH FINALISED!";
}

function achievementKey(playerId: string, metric: PostMatchCelebrationMetric): string {
  return `${playerId}:${metric}`;
}

export function PostMatchCelebration({
  summary,
  match,
  onDismiss
}: PostMatchCelebrationProps) {
  const scoreRows = getMatchScoreRowsInInningsOrder(match);
  const resultHeadline = getMatchResultHeadline(match);
  const pom = summary.playerOfMatch;
  const pomPlayer = pom ? playerById(pom.playerId) : undefined;
  const pomContributions = pom ? getPomContributionItems(getPlayerRecords(match, pom.playerId)) : [];
  const recordKeys = new Set(
    summary.recordsBroken.map((record) => achievementKey(record.playerId, record.metric))
  );
  const standalonePersonalBests = summary.personalBests.filter(
    (best) => !recordKeys.has(achievementKey(best.playerId, best.metric))
  );
  const levelUpsByPlayer = new Map(
    summary.levelUps.map((levelUp) => [levelUp.playerId, levelUp])
  );
  const hasAchievements =
    summary.recordsBroken.length > 0 ||
    standalonePersonalBests.length > 0 ||
    summary.levelUps.length > 0;
  const hasProgression = summary.progressionChanges.length > 0;

  return (
    <div className="post-match-celebration-backdrop" role="presentation">
      <section
        className="post-match-celebration"
        role="dialog"
        aria-modal="true"
        aria-labelledby="post-match-celebration-title"
      >
        <div className="post-match-confetti" aria-hidden="true">
          {CONFETTI_PIECES.map(([left, delay, color], index) => (
            <span
              key={`${left}-${delay}`}
              style={{
                left,
                animationDelay: delay,
                backgroundColor: color,
                transform: `rotate(${index * 19}deg)`
              }}
            />
          ))}
        </div>

        <button
          type="button"
          className="post-match-celebration-close"
          onClick={onDismiss}
          aria-label="Close post-match celebration"
        >
          <X aria-hidden="true" />
        </button>

        <div className="post-match-celebration-scroll">
          <header className="post-match-winner-hero">
            <Image
              src={CELEBRATION_ICONS.winner}
              alt=""
              width={120}
              height={120}
              className="post-match-hero-icon"
              priority
            />
            <p>No Rules. Only Fun.</p>
            <h2 id="post-match-celebration-title">{getOutcomeTitle(match)}</h2>
            <strong>{resultHeadline}</strong>
            <div className="post-match-game-meta">
              {typeof match.matchNumber === "number" ? (
                <span>Game #{match.matchNumber}</span>
              ) : null}
              <span>{getMatchScheduledOversLabel(match)}</span>
              <span>CZU Gully Arena</span>
            </div>
            <div className="post-match-score-row">
              {scoreRows.map((row) => (
                <div key={row.teamId}>
                  <span>{row.teamName}</span>
                  <b>{row.score}</b>
                  <em>({row.overs})</em>
                </div>
              ))}
            </div>
          </header>

          {pom && pomPlayer ? (
            <section className="post-match-pom-card" aria-label="Player of the Match">
              <div className="post-match-section-title">
                <Image src={CELEBRATION_ICONS.pom} alt="" width={68} height={68} />
                <div>
                  <p>Player of the Match</p>
                  <h3>{pomPlayer.name}</h3>
                </div>
              </div>
              <div className="post-match-pom-content">
                <div className="post-match-pom-artwork">
                  <Image
                    src={pomPlayer.cardImage}
                    alt={`${pomPlayer.name} - ${pomPlayer.cardTitle}`}
                    fill
                    sizes="160px"
                    className="object-contain object-center"
                  />
                </div>
                <div>
                  <span>{pomPlayer.cardTitle}</span>
                  {pomContributions.length > 0 ? (
                    <strong>{pomContributions.join(" • ")}</strong>
                  ) : (
                    <strong>Match-winning gully energy</strong>
                  )}
                  {hasProgression ? <b>{formatSignedXP(pom.matchXP)}</b> : null}
                </div>
              </div>
            </section>
          ) : null}

          {hasAchievements ? (
            <div className="post-match-achievement-grid">
              {summary.recordsBroken.map((record) => {
                const matchingBest = summary.personalBests.find(
                  (best) =>
                    best.playerId === record.playerId && best.metric === record.metric
                );

                return (
                  <article
                    key={`${record.playerId}-${record.metric}-${record.status}`}
                    className="post-match-achievement-card post-match-record-card"
                  >
                    <Image src={CELEBRATION_ICONS.record} alt="" width={58} height={58} />
                    <p>
                      {record.status === "firstRecord"
                        ? "First Gully Record!"
                        : "Gully Record Broken!"}
                    </p>
                    <h3>{getPlayerName(record.playerId)}</h3>
                    <strong>{formatMetricValue(record.currentValue, record.unit)}</strong>
                    <span>{record.recordLabel}</span>
                    {record.previousRecord ? (
                      <em>
                        Previous: {record.previousRecord.holderPlayerIds.map(getPlayerName).join(", ")} -{" "}
                        {formatMetricValue(record.previousRecord.value, record.unit)}
                      </em>
                    ) : (
                      <em>First official mark in the Gully book.</em>
                    )}
                    {matchingBest ? <small>Also a personal best</small> : null}
                  </article>
                );
              })}

              {standalonePersonalBests.map((best) => (
                <article
                  key={`${best.playerId}-${best.metric}-${best.kind}`}
                  className="post-match-achievement-card post-match-personal-card"
                >
                  <Image
                    src={CELEBRATION_ICONS.personalBest}
                    alt=""
                    width={58}
                    height={58}
                  />
                  <p>
                    {best.kind === "first_personal_best"
                      ? "First Personal Mark!"
                      : "New Personal Best!"}
                  </p>
                  <h3>{getPlayerName(best.playerId)}</h3>
                  <strong>{formatMetricValue(best.currentValue, best.unit)}</strong>
                  <span>{best.metricLabel}</span>
                  {best.previousBest !== null ? (
                    <em>
                      Previous best: {formatMetricValue(best.previousBest, best.unit)}
                    </em>
                  ) : (
                    <em>First official qualifying performance.</em>
                  )}
                </article>
              ))}

              {summary.levelUps.map((levelUp) => (
                <article
                  key={`${levelUp.playerId}-${levelUp.fromLevel}-${levelUp.toLevel}`}
                  className="post-match-achievement-card post-match-level-card"
                >
                  <Image src={CELEBRATION_ICONS.levelUp} alt="" width={58} height={58} />
                  <p>Level Up!</p>
                  <h3>{getPlayerName(levelUp.playerId)}</h3>
                  <strong>
                    Level {levelUp.fromLevel} → Level {levelUp.toLevel}
                  </strong>
                  <span>
                    {levelUp.levelsGained > 1
                      ? `${levelUp.levelsGained} levels jumped`
                      : "New level reached"}
                  </span>
                </article>
              ))}
            </div>
          ) : (
            <section className="post-match-no-achievements">
              <Image src={CELEBRATION_ICONS.personalBest} alt="" width={64} height={64} />
              <div>
                <p>Good gully, clean finish.</p>
                <span>The archive is updated. The next legend moment is loading.</span>
              </div>
            </section>
          )}

          {hasProgression ? (
            <section className="post-match-xp-section" aria-label="XP earned">
              <div className="post-match-section-title">
                <Image src={CELEBRATION_ICONS.xp} alt="" width={62} height={62} />
                <div>
                  <p>XP Earned</p>
                  <h3>Progression Board</h3>
                </div>
              </div>
              <div className="post-match-xp-list">
                {summary.progressionChanges.map((change) => {
                  const levelUp = levelUpsByPlayer.get(change.playerId);
                  const progress = Math.max(
                    0,
                    Math.min(100, change.afterProgress.progressPercentage)
                  );

                  return (
                    <article key={change.playerId} className="post-match-xp-row">
                      <div>
                        <b>{getPlayerName(change.playerId)}</b>
                        {levelUp ? (
                          <span>
                            Level {levelUp.fromLevel} → {levelUp.toLevel}
                          </span>
                        ) : (
                          <span>Level {change.afterLevel}</span>
                        )}
                      </div>
                      <strong className={change.awardedXP < 0 ? "is-negative" : ""}>
                        {formatSignedXP(change.awardedXP)}
                      </strong>
                      <div className="post-match-xp-track" aria-hidden="true">
                        <span style={{ width: `${progress}%` }} />
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          <footer className="post-match-celebration-actions">
            <LinkButton href={`/matches/${match.id}`} onClick={onDismiss}>
              View Scorecard
            </LinkButton>
            <LinkButton href="/" variant="secondary" onClick={onDismiss}>
              Home
            </LinkButton>
            <Button type="button" variant="ghost" onClick={onDismiss}>
              Keep Reviewing
            </Button>
          </footer>
        </div>
      </section>
    </div>
  );
}
