import { activePlayers, getPlayerById } from "./data/players";
import {
  formatMatchDisplayDate,
  getMatchResultHeadline,
  getMatchScheduledOversLabel,
  getMatchScoreRowsInInningsOrder,
  type MatchScoreRow
} from "./match-display";
import { sanitizeRuns } from "./match-records";
import type { AchievementUnlock } from "./player-achievements";
import type { FinalisedPlayerMatchRecord, MatchRecord } from "./types/match";
import type {
  PostMatchCelebrationMetric,
  PostMatchCelebrationSummary
} from "./post-match-celebration";

export const MATCH_SHARE_CARD_WIDTH = 1080;
export const MATCH_SHARE_CARD_HEIGHT = 1350;
export const MATCH_SHARE_CARD_LOGO_PATH = "/branding/gully-legends-emblem-tight.png";

const SHARE_CARD_DISPLAY_FONT = "'Bangers', Impact, 'Arial Black', sans-serif";
const SHARE_CARD_SUPPORT_FONT = "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif";

export type MatchShareHighlightType =
  | "record_broken"
  | "first_record"
  | "achievement_unlocked"
  | "personal_best"
  | "first_personal_best"
  | "level_up";

export type MatchShareCardPom = {
  playerId: string;
  name: string;
  cardTitle: string;
  cardImage: string;
  contributions: string[];
};

export type MatchShareCardHighlight = {
  type: MatchShareHighlightType;
  title: string;
  playerName: string;
  metricText: string;
  subtext: string;
  icon: "record" | "achievement" | "personalBest" | "levelUp";
};

export type MatchShareCardViewModel = {
  width: number;
  height: number;
  filename: string;
  logoPath: string;
  brandTitle: string;
  tagline: string;
  matchTitle: string;
  gameLabel: string | null;
  dateLabel: string;
  venue: string;
  scheduledOversLabel: string;
  outcomeTitle: string;
  resultHeadline: string;
  scoreRows: MatchScoreRow[];
  pom: MatchShareCardPom | null;
  highlights: MatchShareCardHighlight[];
  mode: "live" | "historical";
};

export type ShareCapabilityNavigator = {
  share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  canShare?: (data: { files?: File[] }) => boolean;
};

type ShareCardSvgAssets = {
  logo?: string;
  trophy?: string;
  pomImage?: string;
  highlightIcons?: Partial<Record<MatchShareCardHighlight["icon"], string>>;
};

const METRIC_PRIORITY: Record<PostMatchCelebrationMetric, number> = {
  sixes: 10,
  runs: 20,
  wickets: 30,
  fours: 40,
  catches: 50,
  stumpings: 60,
  runOuts: 70,
  matchXP: 90
};

function isShareWorthyAchievement(unlock: AchievementUnlock): boolean {
  const { definition } = unlock;

  if (definition.type === "special_achievement") return true;
  if (definition.tier === "platinum" || definition.tier === "legend") return true;
  if (definition.metric === "runs" && definition.threshold >= 500) return true;
  if (definition.metric === "pomAwards" && definition.threshold >= 3) return true;
  if (definition.metric === "wickets" && definition.threshold >= 50) return true;
  if (definition.metric === "catches" && definition.threshold >= 25) return true;
  if (definition.metric === "sixes" && definition.threshold >= 25) return true;

  return false;
}

function getAchievementSharePriority(unlock: AchievementUnlock): number {
  const { definition } = unlock;
  const tierBonus = {
    bronze: 0,
    silver: 1,
    gold: 2,
    platinum: 3,
    legend: 4
  }[definition.tier ?? "bronze"];

  if (definition.id === "special-century") return 30;
  if (definition.id === "special-five-wicket-match") return 30.1;
  if (definition.id === "special-hat-trick") return 30.2;
  if (definition.id === "special-half-century") return 30.3;
  if (definition.id === "special-three-wicket-match") return 30.4;

  return 31 - tierBonus / 10 - Math.min(definition.threshold, 2000) / 10000;
}

function playerById(playerId: string) {
  return activePlayers.find((player) => player.id === playerId) ?? getPlayerById(playerId);
}

export function getSharePlayerName(playerId: string): string {
  return playerById(playerId)?.name ?? playerId;
}

function getPlayerRecords(match: MatchRecord, playerId: string): FinalisedPlayerMatchRecord[] {
  return (match.finalisedPlayerRecords ?? []).filter(
    (record) => record.played && record.playerId === playerId
  );
}

export function pluralizeShareMetric(value: number, unit: string): string {
  switch (unit.toLowerCase()) {
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

export function formatShareMetricValue(value: number, unit: string): string {
  return `${value} ${pluralizeShareMetric(value, unit)}`;
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

  if (totals.runs > 0) items.push(formatShareMetricValue(totals.runs, "runs"));
  if (totals.wickets > 0) items.push(formatShareMetricValue(totals.wickets, "wickets"));
  if (totals.catches > 0) items.push(formatShareMetricValue(totals.catches, "catches"));
  if (totals.runOuts > 0) items.push(formatShareMetricValue(totals.runOuts, "run-outs"));
  if (totals.stumpings > 0) items.push(formatShareMetricValue(totals.stumpings, "stumpings"));

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

export function buildMatchShareCardFilename(match: MatchRecord): string {
  const gamePart =
    typeof match.matchNumber === "number"
      ? `game-${match.matchNumber}`
      : match.id.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();

  return `gully-legends-${gamePart || "match-card"}.png`;
}

function buildPom(match: MatchRecord, summary: PostMatchCelebrationSummary): MatchShareCardPom | null {
  if (!summary.playerOfMatch) return null;

  const player = playerById(summary.playerOfMatch.playerId);

  if (!player) return null;

  return {
    playerId: player.id,
    name: player.name,
    cardTitle: player.cardTitle,
    cardImage: player.cardImage,
    contributions: getPomContributionItems(getPlayerRecords(match, player.id))
  };
}

export function selectMatchShareHighlights(
  summary: PostMatchCelebrationSummary
): MatchShareCardHighlight[] {
  const recordKeys = new Set(
    summary.recordsBroken.map((record) => `${record.playerId}:${record.metric}`)
  );
  const recordHighlights = summary.recordsBroken
    .filter((record) => record.metric !== "matchXP")
    .map((record) => ({
      priority:
        (record.status === "broken" ? 10 : 20) + METRIC_PRIORITY[record.metric] / 100,
      item: {
        type: record.status === "broken" ? "record_broken" : "first_record",
        title: record.status === "broken" ? "Gully Record Broken" : "First Gully Record",
        playerName: getSharePlayerName(record.playerId),
        metricText: formatShareMetricValue(record.currentValue, record.unit),
        subtext: record.previousRecord
          ? `Previous: ${formatShareMetricValue(record.previousRecord.value, record.unit)}`
          : "First official mark in the Gully book.",
        icon: "record"
      } satisfies MatchShareCardHighlight
    }));
  const achievementHighlights = summary.achievementUnlocks
    .filter(isShareWorthyAchievement)
    .map((unlock) => ({
      priority: getAchievementSharePriority(unlock),
      item: {
        type: "achievement_unlocked",
        title: "Achievement Unlocked",
        playerName: getSharePlayerName(unlock.playerId),
        metricText: unlock.definition.title,
        subtext: unlock.definition.description,
        icon: "achievement"
      } satisfies MatchShareCardHighlight
    }));
  const personalBestHighlights = summary.personalBests
    .filter((best) => best.metric !== "matchXP")
    .filter((best) => !recordKeys.has(`${best.playerId}:${best.metric}`))
    .map((best) => ({
      priority:
        40 +
        METRIC_PRIORITY[best.metric] / 100 -
        Math.min(best.improvement ?? best.currentValue, 99) / 1000,
      item: {
        type:
          best.kind === "first_personal_best"
            ? "first_personal_best"
            : "personal_best",
        title:
          best.kind === "first_personal_best"
            ? "First Personal Best"
            : "New Personal Best",
        playerName: getSharePlayerName(best.playerId),
        metricText: formatShareMetricValue(best.currentValue, best.unit),
        subtext:
          best.previousBest !== null
            ? `Previous best: ${formatShareMetricValue(best.previousBest, best.unit)}`
            : "First official qualifying performance.",
        icon: "personalBest"
      } satisfies MatchShareCardHighlight
    }));
  const levelHighlights = summary.levelUps.map((levelUp) => ({
    priority: 50,
    item: {
      type: "level_up",
      title: "Level Up",
      playerName: getSharePlayerName(levelUp.playerId),
      metricText: `Level ${levelUp.fromLevel} to Level ${levelUp.toLevel}`,
      subtext:
        levelUp.levelsGained > 1
          ? `${levelUp.levelsGained} levels jumped`
          : "New level reached",
      icon: "levelUp"
    } satisfies MatchShareCardHighlight
  }));

  return [
    ...recordHighlights,
    ...achievementHighlights,
    ...personalBestHighlights,
    ...levelHighlights
  ]
    .sort((left, right) => left.priority - right.priority)
    .slice(0, 2)
    .map((entry) => entry.item);
}

export function buildMatchShareCardViewModel({
  summary,
  match,
  mode = "live"
}: {
  summary: PostMatchCelebrationSummary;
  match: MatchRecord;
  mode?: "live" | "historical";
}): MatchShareCardViewModel {
  return {
    width: MATCH_SHARE_CARD_WIDTH,
    height: MATCH_SHARE_CARD_HEIGHT,
    filename: buildMatchShareCardFilename(match),
    logoPath: MATCH_SHARE_CARD_LOGO_PATH,
    brandTitle: "GULLY LEGENDS PRAGUE",
    tagline: "No Rules. Only Fun!",
    matchTitle: match.matchName,
    gameLabel:
      typeof match.matchNumber === "number" ? `Game #${match.matchNumber}` : null,
    dateLabel: formatMatchDisplayDate(match.matchDate),
    venue: match.venue || "CZU Gully Arena",
    scheduledOversLabel: getMatchScheduledOversLabel(match),
    outcomeTitle: getOutcomeTitle(match),
    resultHeadline: getMatchResultHeadline(match),
    scoreRows: getMatchScoreRowsInInningsOrder(match),
    pom: buildPom(match, summary),
    highlights: selectMatchShareHighlights(summary),
    mode
  };
}

export function canUseNativeFileShare(
  navigatorLike: ShareCapabilityNavigator | undefined,
  files: File[]
): boolean {
  if (!navigatorLike?.share || !navigatorLike.canShare) return false;

  try {
    return navigatorLike.canShare({ files });
  } catch {
    return false;
  }
}

export function getShareFailureMessage(error: unknown): string | null {
  if (error instanceof DOMException && error.name === "AbortError") return null;

  return "Sharing was not available. You can save the image instead.";
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapWords(value: string, maxCharacters: number, maxLines: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;

    if (next.length <= maxCharacters) {
      current = next;
      continue;
    }

    if (current) lines.push(current);
    current = word;

    if (lines.length === maxLines - 1) break;
  }

  if (current && lines.length < maxLines) lines.push(current);

  return lines.length > 0 ? lines : [value];
}

function svgText({
  lines,
  x,
  y,
  size,
  color,
  weight = 900,
  anchor = "middle",
  lineHeight = 1.08,
  letterSpacing = 0,
  stroke,
  strokeWidth,
  paintOrder,
  filter,
  opacity,
  fontFamily = SHARE_CARD_DISPLAY_FONT,
  fontStyle = "italic"
}: {
  lines: string[];
  x: number;
  y: number;
  size: number;
  color: string;
  weight?: number;
  anchor?: "start" | "middle" | "end";
  lineHeight?: number;
  letterSpacing?: number;
  stroke?: string;
  strokeWidth?: number;
  paintOrder?: "fill" | "stroke" | "markers" | "stroke fill" | "fill stroke";
  filter?: string;
  opacity?: number;
  fontFamily?: string;
  fontStyle?: "normal" | "italic";
}): string {
  const optionalAttributes = [
    stroke ? `stroke="${stroke}"` : "",
    strokeWidth ? `stroke-width="${strokeWidth}"` : "",
    paintOrder ? `paint-order="${paintOrder}"` : "",
    filter ? `filter="${filter}"` : "",
    typeof opacity === "number" ? `opacity="${opacity}"` : ""
  ]
    .filter(Boolean)
    .join(" ");

  return `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${color}" font-family="${fontFamily}" font-style="${fontStyle}" font-size="${size}" font-weight="${weight}" letter-spacing="${letterSpacing}" ${optionalAttributes}>${lines
    .map(
      (line, index) =>
        `<tspan x="${x}" dy="${index === 0 ? 0 : size * lineHeight}">${escapeXml(line)}</tspan>`
    )
    .join("")}</text>`;
}

export function renderMatchShareCardSvg(
  viewModel: MatchShareCardViewModel,
  assets: ShareCardSvgAssets = {}
): string {
  const titleLines = wrapWords(viewModel.outcomeTitle.toUpperCase(), 17, 2);
  const resultLines = wrapWords(viewModel.resultHeadline.toUpperCase(), 34, 2);
  const scoreRows = viewModel.scoreRows.slice(0, 2);
  const pom = viewModel.pom;
  const highlight = viewModel.highlights[0] ?? null;
  const highlight2 = viewModel.highlights[1] ?? null;
  const highlightBoxY = pom ? 1142 : 1080;
  const highlightBoxHeight = pom ? 108 : 120;
  const renderHighlightSvg = (
    item: MatchShareCardHighlight,
    index: number,
    hasPair: boolean
  ) => {
    const x = hasPair ? (index === 0 ? 105 : 555) : 105;
    const width = hasPair ? 420 : 870;
    const icon = assets.highlightIcons?.[item.icon];
    const isCool = item.icon === "achievement" || item.icon === "personalBest";
    const fill = isCool ? "#061c22" : "#220f05";
    const stroke = isCool ? "#46dfff" : "#ff8f1f";
    const titleColor = item.icon === "achievement" ? "#9cff24" : isCool ? "url(#sectionFill)" : "#f7c734";
    const textX = icon ? x + 94 : x + 31;
    const titleWidth = hasPair ? 22 : 36;
    const mainWidth = hasPair ? 17 : 34;
    const subWidth = hasPair ? 24 : 48;

    return `<rect x="${x}" y="${highlightBoxY}" width="${width}" height="${highlightBoxHeight}" rx="28" fill="${fill}" stroke="${stroke}" stroke-width="3" opacity="0.96"/>
      ${
        icon
          ? `<image href="${icon}" x="${x + 20}" y="${highlightBoxY + 24}" width="54" height="54" preserveAspectRatio="xMidYMid meet"/>`
          : ""
      }
      ${svgText({
        lines: wrapWords(item.title.toUpperCase(), titleWidth, 1),
        x: textX,
        y: highlightBoxY + 36,
        size: hasPair ? 19 : 22,
        color: titleColor,
        anchor: "start",
        letterSpacing: 1,
        fontFamily: SHARE_CARD_SUPPORT_FONT,
        fontStyle: "normal",
        stroke: fill,
        strokeWidth: 3,
        paintOrder: "stroke fill",
        filter: "url(#sectionGlow)"
      })}
      ${svgText({
        lines: wrapWords(
          item.type === "achievement_unlocked"
            ? item.metricText.toUpperCase()
            : `${item.playerName} - ${item.metricText}`.toUpperCase(),
          mainWidth,
          1
        ),
        x: textX,
        y: highlightBoxY + (pom ? 78 : 82),
        size: hasPair ? 25 : 31,
        color: "#f8f1d6",
        anchor: "start"
      })}
      ${svgText({
        lines: wrapWords(
          item.type === "achievement_unlocked"
            ? `${item.playerName} - ${item.subtext}`.toUpperCase()
            : item.subtext.toUpperCase(),
          subWidth,
          1
        ),
        x: textX,
        y: highlightBoxY + (pom ? 101 : 111),
        size: hasPair ? 16 : 18,
        color: item.icon === "achievement" ? "#9cff24" : "#f7c734",
        anchor: "start",
        weight: 800,
        fontFamily: SHARE_CARD_SUPPORT_FONT,
        fontStyle: "normal"
      })}`;
  };
  const metaItems = [
    viewModel.gameLabel,
    viewModel.dateLabel,
    viewModel.scheduledOversLabel
  ].filter((item): item is string => Boolean(item));
  const metaItemWidth = metaItems.length > 0 ? 792 / metaItems.length : 792;
  const pomText = pom?.contributions.length
    ? pom.contributions.join(" - ")
    : "Gully energy unlocked";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${viewModel.width}" height="${viewModel.height}" viewBox="0 0 ${viewModel.width} ${viewModel.height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#05080d"/>
      <stop offset="0.45" stop-color="#071423"/>
      <stop offset="1" stop-color="#120914"/>
    </linearGradient>
    <radialGradient id="goldGlow" cx="50%" cy="18%" r="72%">
      <stop offset="0" stop-color="#f7c734" stop-opacity="0.30"/>
      <stop offset="1" stop-color="#f7c734" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="winnerFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff3a4"/>
      <stop offset="0.46" stop-color="#f7c734"/>
      <stop offset="1" stop-color="#ff8f1f"/>
    </linearGradient>
    <linearGradient id="sectionFill" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#46dfff"/>
      <stop offset="0.55" stop-color="#f8f1d6"/>
      <stop offset="1" stop-color="#f7c734"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#000" flood-opacity="0.52"/>
    </filter>
    <filter id="comicShadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="6" stdDeviation="0" flood-color="#041018" flood-opacity="0.95"/>
      <feDropShadow dx="0" dy="16" stdDeviation="12" flood-color="#000" flood-opacity="0.46"/>
      <feDropShadow dx="0" dy="0" stdDeviation="12" flood-color="#f7c734" flood-opacity="0.34"/>
    </filter>
    <filter id="sectionGlow" x="-20%" y="-30%" width="140%" height="160%">
      <feDropShadow dx="0" dy="3" stdDeviation="0" flood-color="#06111b" flood-opacity="0.9"/>
      <feDropShadow dx="0" dy="0" stdDeviation="8" flood-color="#46dfff" flood-opacity="0.32"/>
    </filter>
  </defs>
  <rect width="1080" height="1350" fill="url(#bg)"/>
  <rect width="1080" height="1350" fill="url(#goldGlow)"/>
  <circle cx="135" cy="160" r="210" fill="#46dfff" opacity="0.11"/>
  <circle cx="948" cy="80" r="225" fill="#9cff24" opacity="0.10"/>
  <circle cx="930" cy="1210" r="260" fill="#ff8f1f" opacity="0.13"/>
  <rect x="46" y="42" width="988" height="1266" rx="44" fill="none" stroke="#f7c734" stroke-width="6" opacity="0.78"/>
  <rect x="70" y="66" width="940" height="1218" rx="32" fill="none" stroke="#46dfff" stroke-width="2" opacity="0.36"/>
  ${
    assets.logo
      ? `<image href="${assets.logo}" x="78" y="78" width="190" height="82" preserveAspectRatio="xMinYMid meet"/>`
      : ""
  }
  ${svgText({
    lines: [viewModel.brandTitle],
    x: 650,
    y: 105,
    size: 38,
    color: "#f8f1d6",
    letterSpacing: 1
  })}
  ${svgText({
    lines: [viewModel.tagline.toUpperCase()],
    x: 650,
    y: 153,
    size: 24,
    color: "#46dfff",
    fontFamily: SHARE_CARD_SUPPORT_FONT,
    fontStyle: "normal",
    letterSpacing: 1.8
  })}
  <rect x="118" y="205" width="844" height="94" rx="28" fill="#000" opacity="0.38" stroke="#f7c734" stroke-width="2"/>
  ${metaItems
    .map((item, index) => {
      const x = 144 + index * metaItemWidth;
      const width = metaItemWidth - 12;
      return `<rect x="${x}" y="219" width="${width}" height="36" rx="18" fill="#07111b" stroke="#46dfff" stroke-width="1.5" opacity="0.94"/>
      ${svgText({
        lines: [item.toUpperCase()],
        x: x + width / 2,
        y: 244,
        size: metaItems.length > 2 ? 21 : 24,
        color: "#f7c734",
        fontFamily: SHARE_CARD_SUPPORT_FONT,
        fontStyle: "normal",
        stroke: "#07111b",
        strokeWidth: 2,
        paintOrder: "stroke fill",
        letterSpacing: 0.8
      })}`;
    })
    .join("")}
  ${svgText({
    lines: wrapWords(viewModel.venue.toUpperCase(), 34, 1),
    x: 540,
    y: 287,
    size: 21,
    color: "#c8d6d8",
    weight: 800,
    fontFamily: SHARE_CARD_SUPPORT_FONT,
    fontStyle: "normal"
  })}
  ${
    assets.trophy
      ? `<image href="${assets.trophy}" x="445" y="315" width="190" height="144" preserveAspectRatio="xMidYMid meet"/>`
      : ""
  }
  ${svgText({
    lines: titleLines,
    x: 540,
    y: 552,
    size: titleLines.length > 1 ? 74 : 92,
    color: "url(#winnerFill)",
    lineHeight: 0.94,
    stroke: "#061018",
    strokeWidth: 8,
    paintOrder: "stroke fill",
    filter: "url(#comicShadow)",
    letterSpacing: 1.2
  })}
  ${svgText({
    lines: resultLines,
    x: 540,
    y: titleLines.length > 1 ? 678 : 654,
    size: 34,
    color: "#f8f1d6",
    lineHeight: 1.18
  })}
  <g filter="url(#shadow)">
    ${scoreRows
      .map((row, index) => {
        const x = index === 0 ? 115 : 555;
        return `<rect x="${x}" y="704" width="410" height="132" rx="26" fill="#07111b" stroke="#46dfff" stroke-width="3" opacity="0.96"/>
        ${svgText({
          lines: wrapWords(row.teamName.toUpperCase(), 16, 1),
          x: x + 205,
          y: 750,
          size: 30,
          color: "#46dfff"
        })}
        ${svgText({
          lines: [row.score],
          x: x + 205,
          y: 802,
          size: 52,
          color: "#f8f1d6"
        })}
        ${svgText({
          lines: [`(${row.overs})`],
          x: x + 205,
          y: 829,
          size: 24,
          color: "#c8d6d8",
          weight: 800,
          fontFamily: SHARE_CARD_SUPPORT_FONT,
          fontStyle: "normal"
        })}`;
      })
      .join("")}
  </g>
  ${
    pom
      ? `<rect x="105" y="872" width="870" height="244" rx="34" fill="#07111b" stroke="#f7c734" stroke-width="4" opacity="0.98"/>
      ${
        assets.pomImage
          ? `<image href="${assets.pomImage}" x="134" y="894" width="140" height="210" preserveAspectRatio="xMidYMid meet"/>`
          : ""
      }
      ${svgText({
        lines: ["PLAYER OF THE MATCH"],
        x: 310,
        y: 928,
        size: 26,
        color: "url(#sectionFill)",
        anchor: "start",
        letterSpacing: 1.4,
        fontFamily: SHARE_CARD_SUPPORT_FONT,
        fontStyle: "normal",
        stroke: "#07111b",
        strokeWidth: 3,
        paintOrder: "stroke fill",
        filter: "url(#sectionGlow)"
      })}
      ${svgText({
        lines: wrapWords(pom.name.toUpperCase(), 21, 2),
        x: 310,
        y: 998,
        size: 54,
        color: "#f8f1d6",
        anchor: "start",
        lineHeight: 0.98
      })}
      ${svgText({
        lines: wrapWords(pomText.toUpperCase(), 30, 2),
        x: 310,
        y: 1082,
        size: 26,
        color: "#46dfff",
        anchor: "start",
        weight: 850,
        lineHeight: 1.18,
        fontFamily: SHARE_CARD_SUPPORT_FONT,
        fontStyle: "normal"
      })}`
      : `<rect x="105" y="900" width="870" height="150" rx="34" fill="#07111b" stroke="#46dfff" stroke-width="3" opacity="0.92"/>
      ${svgText({
        lines: ["NO PLAYER OF THE MATCH AWARDED"],
        x: 540,
        y: 970,
        size: 35,
        color: "#f8f1d6"
      })}
      ${svgText({
        lines: ["THE WHOLE GULLY TAKES THE STORY HOME"],
        x: 540,
        y: 1015,
        size: 23,
        color: "#46dfff",
        weight: 850,
        fontFamily: SHARE_CARD_SUPPORT_FONT,
        fontStyle: "normal"
      })}`
  }
  ${
    highlight
      ? renderHighlightSvg(highlight, 0, Boolean(highlight2))
      : ""
  }
  ${
    highlight2
      ? renderHighlightSvg(highlight2, 1, true)
      : ""
  }
  ${svgText({
    lines: ["NO RULES. ONLY FUN!"],
    x: 540,
    y: 1294,
    size: 24,
    color: "#f7c734",
    stroke: "#061018",
    strokeWidth: 3,
    paintOrder: "stroke fill",
    filter: "url(#sectionGlow)",
    letterSpacing: 1.5
  })}
</svg>`;
}
