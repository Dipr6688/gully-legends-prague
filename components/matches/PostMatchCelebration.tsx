"use client";

import Image from "next/image";
import { useState } from "react";
import { Share2, X } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/Button";
import { DynamicAvatarFrame } from "@/components/ui/DynamicAvatarFrame";
import { MatchShareCardDialog } from "@/components/matches/MatchShareCard";
import { activePlayers, getPlayerById } from "@/lib/data/players";
import {
  getMatchResultHeadline,
  getMatchScheduledOversLabel,
  getMatchScoreRowsInInningsOrder
} from "@/lib/match-display";
import {
  formatAchievementUnlockMeta
} from "@/lib/trophy-cabinet";
import type {
  PostMatchCelebrationMetric,
  PostMatchProgressionChange,
  PostMatchCelebrationSummary
} from "@/lib/post-match-celebration";
import { sanitizeRuns } from "@/lib/match-records";
import type { FinalisedPlayerMatchRecord, MatchRecord } from "@/lib/types/match";
import type { Player } from "@/lib/types/player";

const CELEBRATION_ICONS = {
  winner: "/ui/post-match-celebration/winner-trophy-v2.png",
  pom: "/ui/post-match-celebration/pom-star-v2.png",
  record: "/ui/post-match-celebration/record-broken-v2.png",
  achievement: "/ui/post-match-celebration/achievement-unlocked-v2.png",
  personalBest: "/ui/post-match-celebration/personal-best-v2.png",
  levelUp: "/ui/post-match-celebration/level-up-v2.png",
  xp: "/ui/post-match-celebration/xp-bolt-v2.png"
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
  mode?: "live" | "historical";
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

function pluralizeMetricUnit(value: number, unit: string): string {
  const normalizedUnit = unit.toLowerCase();

  switch (normalizedUnit) {
    case "runs":
      return value === 1 ? "Run" : "Runs";
    case "wickets":
      return value === 1 ? "Wicket" : "Wickets";
    case "fours":
      return value === 1 ? "Four" : "Fours";
    case "sixes":
      return value === 1 ? "Six" : "Sixes";
    case "catches":
      return value === 1 ? "Catch" : "Catches";
    case "run-outs":
      return value === 1 ? "Run-out" : "Run-outs";
    case "stumpings":
      return value === 1 ? "Stumping" : "Stumpings";
    case "xp":
      return "XP";
    default:
      return value === 1 ? unit.replace(/s$/i, "") : unit;
  }
}

function formatMetricValue(value: number, unit: string): string {
  return `${value} ${pluralizeMetricUnit(value, unit)}`;
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

  if (totals.runs > 0) items.push(formatMetricValue(totals.runs, "runs"));
  if (totals.wickets > 0) items.push(formatMetricValue(totals.wickets, "wickets"));
  if (totals.catches > 0) items.push(formatMetricValue(totals.catches, "catches"));
  if (totals.runOuts > 0) items.push(formatMetricValue(totals.runOuts, "run-outs"));
  if (totals.stumpings > 0) items.push(formatMetricValue(totals.stumpings, "stumpings"));

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

type AchievementUnlockItem = PostMatchCelebrationSummary["achievementUnlocks"][number];
type AchievementUnlockGroup = {
  key: string;
  definition: AchievementUnlockItem["definition"];
  unlocks: AchievementUnlockItem[];
  playerIds: string[];
};
type PersonalBestItem = PostMatchCelebrationSummary["personalBests"][number];
type PersonalBestGroup = {
  playerId: string;
  bests: PersonalBestItem[];
};

function groupAchievementUnlocks(
  unlocks: AchievementUnlockItem[],
  shouldGroup: boolean
): AchievementUnlockGroup[] {
  if (!shouldGroup) {
    return unlocks.map((unlock) => ({
      key: `${unlock.playerId}-${unlock.definition.id}`,
      definition: unlock.definition,
      unlocks: [unlock],
      playerIds: [unlock.playerId]
    }));
  }

  const groups = new Map<string, AchievementUnlockGroup>();

  for (const unlock of unlocks) {
    const existing = groups.get(unlock.definition.id);

    if (existing) {
      existing.unlocks.push(unlock);
      if (!existing.playerIds.includes(unlock.playerId)) {
        existing.playerIds.push(unlock.playerId);
      }
    } else {
      groups.set(unlock.definition.id, {
        key: unlock.definition.id,
        definition: unlock.definition,
        unlocks: [unlock],
        playerIds: [unlock.playerId]
      });
    }
  }

  return [...groups.values()];
}

function groupPersonalBestsByPlayer(bests: PersonalBestItem[]): PersonalBestGroup[] {
  const groups = new Map<string, PersonalBestGroup>();

  for (const best of bests) {
    const existing = groups.get(best.playerId);

    if (existing) {
      existing.bests.push(best);
    } else {
      groups.set(best.playerId, {
        playerId: best.playerId,
        bests: [best]
      });
    }
  }

  return [...groups.values()];
}

function isProgressionChange(
  change:
    | PostMatchCelebrationSummary["progressionChanges"][number]
    | PostMatchCelebrationSummary["matchXPAwards"][number]
): change is PostMatchProgressionChange {
  return "afterProgress" in change;
}

export function PostMatchCelebration({
  summary,
  match,
  onDismiss,
  mode = "live"
}: PostMatchCelebrationProps) {
  const [isShareCardOpen, setIsShareCardOpen] = useState(false);
  const scoreRows = getMatchScoreRowsInInningsOrder(match);
  const resultHeadline = getMatchResultHeadline(match);
  const pom = summary.playerOfMatch;
  const pomPlayer = pom ? playerById(pom.playerId) : undefined;
  const pomContributions = pom ? getPomContributionItems(getPlayerRecords(match, pom.playerId)) : [];
  const isHistorical = mode === "historical";
  const recordKeys = new Set(
    summary.recordsBroken.map((record) => achievementKey(record.playerId, record.metric))
  );
  const displayPersonalBests = summary.personalBests.filter(
    (best) => best.metric !== "matchXP"
  );
  const standalonePersonalBests = displayPersonalBests.filter(
    (best) => !recordKeys.has(achievementKey(best.playerId, best.metric))
  );
  const groupedAchievementUnlocks = groupAchievementUnlocks(
    summary.achievementUnlocks,
    isHistorical
  );
  const groupedPersonalBests = groupPersonalBestsByPlayer(standalonePersonalBests);
  const levelUpsByPlayer = new Map(
    summary.levelUps.map((levelUp) => [levelUp.playerId, levelUp])
  );
  const hasAchievements =
    summary.recordsBroken.length > 0 ||
    summary.achievementUnlocks.length > 0 ||
    standalonePersonalBests.length > 0 ||
    summary.levelUps.length > 0;
  const hasProgression = summary.progressionChanges.length > 0;
  const xpRows = hasProgression ? summary.progressionChanges : summary.matchXPAwards;
  const hasXPSection = hasProgression || (isHistorical && summary.matchXPAwards.length > 0);
  const xpKicker = isHistorical ? "Match XP" : "XP Earned";
  const xpTitle = isHistorical ? "XP Earned in This Match" : "Progression Board";
  const pomStoredXPAward = pom
    ? summary.matchXPAwards.find((award) => award.playerId === pom.playerId)
    : undefined;
  const pomXPValue = hasProgression ? pom?.matchXP : pomStoredXPAward?.awardedXP;
  const shouldShowPomXP =
    hasProgression || (isHistorical && typeof pomXPValue === "number");

  return (
    <div className="post-match-celebration-backdrop" role="presentation">
      <section
        className={`post-match-celebration${isHistorical ? " is-historical" : ""}`}
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
            <p>{isHistorical ? "Celebration Replay" : "No Rules. Only Fun."}</p>
            <h2 id="post-match-celebration-title">{getOutcomeTitle(match)}</h2>
            <strong>{resultHeadline}</strong>
            <div className="post-match-game-meta">
              {typeof match.matchNumber === "number" ? (
                <span className="data-number">Game #{match.matchNumber}</span>
              ) : null}
              <span className="data-number">{getMatchScheduledOversLabel(match)}</span>
              <span>CZU Gully Arena</span>
            </div>
            <div className="post-match-score-row">
              {scoreRows.map((row) => (
                <div key={row.teamId}>
                  <span>{row.teamName}</span>
                  <b className="data-number-strong">{row.score}</b>
                  <em className="data-number">({row.overs})</em>
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
                <DynamicAvatarFrame
                  mode={isHistorical ? "pomStatic" : "pom"}
                  className="post-match-pom-artwork"
                >
                  <Image
                    src={pomPlayer.cardImage}
                    alt={`${pomPlayer.name} - ${pomPlayer.cardTitle}`}
                    fill
                    sizes="160px"
                    className="object-contain object-center"
                  />
                </DynamicAvatarFrame>
                <div>
                  <span>{pomPlayer.cardTitle}</span>
                  {pomContributions.length > 0 ? (
                    <strong className="data-number">{pomContributions.join(" • ")}</strong>
                  ) : (
                    <strong>Match-winning gully energy</strong>
                  )}
                  {shouldShowPomXP && typeof pomXPValue === "number" ? (
                    <b className="data-number-strong">{formatSignedXP(pomXPValue)}</b>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          {hasAchievements ? (
            <div className="post-match-achievement-grid">
              {summary.recordsBroken.map((record) => {
                const matchingBest = displayPersonalBests.find(
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
                    <strong className="data-number-strong">
                      {formatMetricValue(record.currentValue, record.unit)}
                    </strong>
                    <span>{record.recordLabel}</span>
                    {record.previousRecord ? (
                      <em className="data-number">
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

              {groupedAchievementUnlocks.map((group) => {
                const isGrouped = group.playerIds.length > 1;
                const singleUnlock = group.unlocks[0];

                return (
                  <article
                    key={group.key}
                    className={`post-match-achievement-card post-match-unlock-card${
                      isGrouped ? " is-grouped" : ""
                    }`}
                  >
                    <Image
                      src={CELEBRATION_ICONS.achievement}
                      alt=""
                      width={58}
                      height={58}
                    />
                    <p>
                      {isHistorical
                        ? "Achievement Unlocked in This Match!"
                        : "Achievement Unlocked!"}
                    </p>
                    {isGrouped ? (
                      <>
                        <h3>{group.definition.title}</h3>
                        <span>{group.definition.description}</span>
                        <em className="data-number">
                          Unlocked by: {group.playerIds.map(getPlayerName).join(" · ")}
                        </em>
                      </>
                    ) : singleUnlock ? (
                      <>
                        <h3>{getPlayerName(singleUnlock.playerId)}</h3>
                        <strong>{group.definition.title}</strong>
                        <span>{group.definition.description}</span>
                        {!isHistorical ? (
                          <em className="data-number">
                            {formatAchievementUnlockMeta(singleUnlock)}
                          </em>
                        ) : null}
                      </>
                    ) : null}
                  </article>
                );
              })}

              {groupedPersonalBests.map((group) => (
                <article
                  key={group.playerId}
                  className="post-match-achievement-card post-match-personal-card"
                >
                  <Image
                    src={CELEBRATION_ICONS.personalBest}
                    alt=""
                    width={58}
                    height={58}
                  />
                  <p>Personal Best</p>
                  <h3>{getPlayerName(group.playerId)}</h3>
                  <strong>
                    <span>{group.bests.length}</span>{" "}
                    {group.bests.length === 1 ? "Personal Best" : "Personal Bests"}
                  </strong>
                  <ul className="post-match-personal-list">
                    {group.bests.map((best) => (
                      <li key={`${best.metric}-${best.kind}`}>
                        <b className="data-number">
                          {formatMetricValue(best.currentValue, best.unit)}
                        </b>
                        <span>
                          {best.previousBest !== null
                            ? `Previous best: ${formatMetricValue(best.previousBest, best.unit)}`
                            : "First qualifying performance"}
                        </span>
                      </li>
                    ))}
                  </ul>
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
                    <span className="data-number">
                      Level {levelUp.fromLevel} → Level {levelUp.toLevel}
                    </span>
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
                <span>
                  {isHistorical
                    ? "This replay keeps the old match readable without inventing extra awards."
                    : "The archive is updated. The next legend moment is loading."}
                </span>
              </div>
            </section>
          )}

          {hasXPSection ? (
            <section className="post-match-xp-section" aria-label="XP earned">
              <div className="post-match-section-title">
                <Image src={CELEBRATION_ICONS.xp} alt="" width={62} height={62} />
                <div>
                  <p>{xpKicker}</p>
                  <h3>{xpTitle}</h3>
                </div>
              </div>
              <div className="post-match-xp-list">
                {xpRows.map((change) => {
                  const hasLevelProgress = isProgressionChange(change);
                  const levelUp = hasLevelProgress
                    ? levelUpsByPlayer.get(change.playerId)
                    : undefined;
                  const progress = hasLevelProgress
                    ? Math.max(
                        0,
                        Math.min(100, change.afterProgress.progressPercentage)
                      )
                    : null;

                  return (
                    <article key={change.playerId} className="post-match-xp-row">
                      <div>
                        <b>{getPlayerName(change.playerId)}</b>
                        {hasLevelProgress ? (
                          levelUp ? (
                            <span className="data-number">
                              Level {levelUp.fromLevel} → {levelUp.toLevel}
                            </span>
                          ) : (
                            <span className="data-number">Level {change.afterLevel}</span>
                          )
                        ) : (
                          !isHistorical ? <span>Match XP</span> : null
                        )}
                      </div>
                      <strong
                        className={`data-number-strong${
                          change.awardedXP < 0 ? " is-negative" : ""
                        }`}
                      >
                        {formatSignedXP(change.awardedXP)}
                      </strong>
                      {progress !== null ? (
                        <div className="post-match-xp-track" aria-hidden="true">
                          <span style={{ width: `${progress}%` }} />
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          <footer className="post-match-celebration-actions">
            <Button type="button" onClick={() => setIsShareCardOpen(true)}>
              <Share2 className="h-4 w-4" aria-hidden="true" />
              Share Match Card
            </Button>
            {isHistorical ? (
              <Button type="button" onClick={onDismiss}>
                Back to Scorecard
              </Button>
            ) : (
              <LinkButton href={`/matches/${match.id}`} onClick={onDismiss}>
                View Scorecard
              </LinkButton>
            )}
            <LinkButton
              href={isHistorical ? "/matches" : "/"}
              variant="secondary"
              onClick={onDismiss}
            >
              {isHistorical ? "Matches Archive" : "Home"}
            </LinkButton>
            <Button type="button" variant="ghost" onClick={onDismiss}>
              {isHistorical ? "Close Replay" : "Keep Reviewing"}
            </Button>
          </footer>
        </div>
        {isShareCardOpen ? (
          <MatchShareCardDialog
            summary={summary}
            match={match}
            mode={mode}
            onClose={() => setIsShareCardOpen(false)}
          />
        ) : null}
      </section>
    </div>
  );
}
