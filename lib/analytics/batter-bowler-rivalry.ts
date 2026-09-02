import {
  calculateBattingStrikeRate,
  deliveryCountsAsBallFaced,
  eventBoundaryCounts,
  formatStrikeRate
} from "../advanced-cricket-stats";
import { sanitizeRuns } from "../match-records";
import { isBeforeCelebrationMatch, isOfficialCelebrationMatch } from "../official-match-history";
import { getQuickScoringEventsForTeam } from "../quick-scoring";
import type { MatchRecord, QuickScoringEvent } from "../types/match";

export type BatterBowlerRivalryMaturity =
  | "too-early"
  | "brewing"
  | "established";

export type BatterBowlerRivalryResult = {
  batterId: string;
  bowlerId: string;
  runs: number;
  balls: number;
  dismissals: number;
  fours: number;
  sixes: number;
  dotBalls: number;
  strikeRate: number | null;
  strikeRateDisplay: string;
  matchesEncountered: number;
  firstEncounterDate: string | null;
  lastEncounterDate: string | null;
  eligibleDeliveryCount: number;
  reliableMatchCount: number;
  officialMatchCount: number;
  maturity: BatterBowlerRivalryMaturity;
};

export type CalculateBatterBowlerRivalryInput = {
  matches: MatchRecord[];
  batterId: string;
  bowlerId: string;
};

export function getBatterBowlerRivalryMaturity(
  balls: number
): BatterBowlerRivalryMaturity {
  const safeBalls = sanitizeRuns(balls);

  if (safeBalls >= 24) return "established";
  if (safeBalls >= 12) return "brewing";

  return "too-early";
}

function sortOfficialMatches(matches: MatchRecord[]): MatchRecord[] {
  return matches.filter(isOfficialCelebrationMatch).sort((left, right) => {
    if (isBeforeCelebrationMatch(left, right)) return -1;
    if (isBeforeCelebrationMatch(right, left)) return 1;

    return left.id.localeCompare(right.id);
  });
}

function getReliableMatchEvents(match: MatchRecord): QuickScoringEvent[] {
  if (!match.quickScoring) return [];

  return [
    ...getQuickScoringEventsForTeam(match.quickScoring, match.innings.first.battingTeamId),
    ...getQuickScoringEventsForTeam(match.quickScoring, match.innings.second.battingTeamId)
  ].sort((left, right) => left.sequence - right.sequence);
}

function isBowlerCreditedDismissal(event: QuickScoringEvent, batterId: string): boolean {
  return Boolean(
    event.wicket &&
      event.wicket.dismissedPlayerId === batterId &&
      event.wicket.type !== "run_out"
  );
}

function isRivalryDotBall(event: QuickScoringEvent): boolean {
  return (
    deliveryCountsAsBallFaced(event) &&
    sanitizeRuns(event.batterRuns) === 0 &&
    sanitizeRuns(event.extras) === 0
  );
}

export function calculateBatterBowlerRivalry({
  matches,
  batterId,
  bowlerId
}: CalculateBatterBowlerRivalryInput): BatterBowlerRivalryResult {
  const officialMatches = sortOfficialMatches(matches);
  const encounteredMatchIds = new Set<string>();
  let reliableMatchCount = 0;
  let runs = 0;
  let balls = 0;
  let dismissals = 0;
  let fours = 0;
  let sixes = 0;
  let dotBalls = 0;
  let eligibleDeliveryCount = 0;
  let firstEncounterDate: string | null = null;
  let lastEncounterDate: string | null = null;

  for (const match of officialMatches) {
    const events = getReliableMatchEvents(match);

    if (events.length === 0) continue;

    reliableMatchCount += 1;

    for (const event of events) {
      if (event.strikerId !== batterId || event.bowlerId !== bowlerId) continue;

      eligibleDeliveryCount += 1;
      encounteredMatchIds.add(match.id);
      firstEncounterDate ??= match.matchDate;
      lastEncounterDate = match.matchDate;
      runs += event.extraType === "wide" ? 0 : sanitizeRuns(event.batterRuns);

      if (deliveryCountsAsBallFaced(event)) {
        balls += 1;
      }

      if (isBowlerCreditedDismissal(event, batterId)) {
        dismissals += 1;
      }

      const boundaries = eventBoundaryCounts(event);
      fours += boundaries.fours;
      sixes += boundaries.sixes;

      if (isRivalryDotBall(event)) {
        dotBalls += 1;
      }
    }
  }

  const strikeRate = calculateBattingStrikeRate({ runs, ballsFaced: balls });

  return {
    batterId,
    bowlerId,
    runs,
    balls,
    dismissals,
    fours,
    sixes,
    dotBalls,
    strikeRate,
    strikeRateDisplay: formatStrikeRate(strikeRate),
    matchesEncountered: encounteredMatchIds.size,
    firstEncounterDate,
    lastEncounterDate,
    eligibleDeliveryCount,
    reliableMatchCount,
    officialMatchCount: officialMatches.length,
    maturity: getBatterBowlerRivalryMaturity(balls)
  };
}
