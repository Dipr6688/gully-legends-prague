import { getPlayerById } from "./data/players";
import {
  getMatchResultHeadline,
  getMatchScoreRowsInInningsOrder
} from "./match-display";
import { buildBowlingFigures, formatCompletedOvers } from "./match-scorecard";
import { sanitizeRuns } from "./match-records";
import { isOfficialCelebrationMatch } from "./official-match-history";
import type {
  MatchRecord,
  MatchResult,
  MatchStory,
  TeamId,
  TeamInnings
} from "./types/match";

export const MATCH_STORY_VERSION = 1;
export const MATCH_STORY_RECENT_LIMIT = 48;
const MAX_GENERATION_ATTEMPTS = 36;
const SIMILARITY_THRESHOLD = 0.56;

export type MatchStoryCharacter =
  | "CLOSE_CHASE"
  | "COMFORTABLE_CHASE"
  | "LAST_OVER_FINISH"
  | "SUCCESSFUL_DEFENCE"
  | "COMFORTABLE_DEFENCE"
  | "LOW_SCORING_GAME"
  | "HIGH_SCORING_GAME"
  | "WICKET_HEAVY"
  | "BATTING_HEAVY"
  | "WICKET_BURST"
  | "RUN_OUT_TWIST"
  | "LATE_ACCELERATION"
  | "EARLY_WICKETS"
  | "TIE"
  | "BACK_AND_FORTH";

export type MatchStoryDraft = Omit<
  MatchStory,
  "generatedAt" | "createdAt" | "updatedAt"
>;

type StoryMoment = {
  key: string;
  weight: number;
  playerIds: string[];
  text: string;
};

type StoryStructure =
  | "RESULT_FIRST"
  | "MOMENT_FIRST"
  | "SCOREBOARD_JOURNEY"
  | "PLAYER_MOMENT"
  | "SHORT_DIARY"
  | "MINIMAL";

type StoryBuildAttempt = {
  title: string;
  sentences: string[];
  storyStyle: string;
};

const titlePatterns: Record<MatchStoryCharacter | "GENERIC", string[]> = {
  CLOSE_CHASE: [
    "A Tight Chase",
    "The Late Finish",
    "A Close One",
    "The Chase Stayed Alive",
    "One More Over",
    "Final Over Fun",
    "The Reply Held",
    "The Last Push",
    "A Narrow Finish",
    "The Chase Got There",
    "Not Much Between Them",
    "The Late Reply",
    "One Wicket Left",
    "The Target Chase",
    "A Proper Scrap",
    "The Finish Stayed Close",
    "The Reply Found A Way",
    "A Nervy Finish",
    "The Chase Had Nerves",
    "The Last Few Runs",
    "A Small Margin",
    "The Late Answer",
    "The Chase Squeezed Through",
    "The Reply Survived"
  ],
  COMFORTABLE_CHASE: [
    "Chase In Control",
    "The Reply Held",
    "Target In Sight",
    "A Quick Finish",
    "The Chase Was Calm",
    "The Reply Got There",
    "A Clean Chase",
    "The Target Was Found",
    "The Chase Had Time",
    "The Answer Came Early",
    "The Reply Stayed Steady",
    "Runs To Spare",
    "The Chase Settled",
    "A Calm Reply"
  ],
  LAST_OVER_FINISH: [
    "One More Over",
    "Final Over Fun",
    "The Late Finish",
    "A Tight Chase",
    "The Last Over",
    "The Chase Stayed Alive",
    "The Final Push",
    "The Late Answer",
    "The Last Six Balls",
    "The Finish Waited",
    "The Chase Went Deep",
    "A Late Twist",
    "The Final Reply",
    "One Last Over",
    "The End Stayed Busy",
    "A Nervy Last Over"
  ],
  SUCCESSFUL_DEFENCE: [
    "The Defence Held",
    "The Total Was Enough",
    "Runs On The Board",
    "The Reply Fell Short",
    "Wickets Changed It",
    "The Bowling Turned It",
    "The Chase Stopped Short",
    "The Total Survived",
    "A Close Defence",
    "The Reply Could Not Pass",
    "The Board Held Firm",
    "A Few Runs Enough",
    "The Defence Stayed Up",
    "The Target Stayed Safe"
  ],
  COMFORTABLE_DEFENCE: [
    "The Defence Held",
    "The Total Stood",
    "Runs On The Board",
    "The Total Was Enough",
    "A Clear Defence",
    "The Reply Fell Short",
    "The Board Was Enough",
    "A Steady Defence",
    "The Gap Stayed Open",
    "The Chase Ran Out"
  ],
  LOW_SCORING_GAME: [
    "Every Run Mattered",
    "A Tight Little Match",
    "Small Score Drama",
    "One Run At A Time",
    "The Low Score Scrap",
    "A Small Total Fight",
    "The Runs Felt Bigger",
    "A Short Score Story",
    "The Little Chase"
  ],
  HIGH_SCORING_GAME: [
    "Runs On The Board",
    "The Batters Took Over",
    "The Scoreboard Moved",
    "Runs Kept Coming",
    "A Big Scoring Day",
    "The Bat Did Plenty",
    "A Busy Scorecard",
    "Runs Around CZU",
    "The Board Lit Up"
  ],
  WICKET_HEAVY: [
    "Wickets Everywhere",
    "Wickets Changed It",
    "The Bowling Turned It",
    "The Bails Kept Moving",
    "A Wicket Heavy One",
    "The Batters Kept Leaving",
    "A Bowling Day",
    "The Wickets Came Often",
    "The Middle Was Messy"
  ],
  BATTING_HEAVY: [
    "Runs Kept Coming",
    "The Batters Took Over",
    "Runs On The Board",
    "A Big Scoring Day",
    "The Scoreboard Moved",
    "The Bat Did Plenty",
    "A Busy Scorecard",
    "The Runs Had Rhythm"
  ],
  WICKET_BURST: [
    "The Bowling Turned It",
    "The Quick Strike",
    "Wickets Changed It",
    "Three Sharp Wickets",
    "The Spell That Bit",
    "The Wicket Burst",
    "A Sharp Spell",
    "The Bails Went",
    "The Over Had Bite"
  ],
  RUN_OUT_TWIST: [
    "A Run Out Twist",
    "One Sharp Throw",
    "The Fielders Had A Say",
    "A Quick Run Out",
    "The Running Game",
    "The Fielding Turn",
    "A Direct Hit Moment",
    "The Run Out Note",
    "Quick Hands"
  ],
  LATE_ACCELERATION: [
    "The Late Finish",
    "The Finish Spark",
    "The Late Push",
    "One More Over",
    "The Chase Stayed Alive",
    "The Last Gear",
    "The Late Lift",
    "The End Had Runs",
    "A Finish With Pace"
  ],
  EARLY_WICKETS: [
    "Wickets Changed It",
    "Quick Trouble",
    "The Early Break",
    "The First Overs",
    "The Bowling Turned It",
    "The Start Had Wickets",
    "The Opening Bite",
    "Early Trouble",
    "The New Ball Note"
  ],
  TIE: [
    "Nothing Between Them",
    "Scores Level",
    "All Square",
    "The Match Finished Level",
    "A Proper Tie",
    "No Winner Today"
  ],
  BACK_AND_FORTH: [
    "Momentum Moved",
    "A Gully Classic",
    "Back And Forth",
    "Every Moment Moved",
    "A Close One"
  ],
  GENERIC: [
    "Gully Notes",
    "Match Day Memory",
    "Another Prague Chapter",
    "Fun In The Middle",
    "The Scorecard Story",
    "One More Match"
  ]
};

const scoreOpenings = [
  "{firstScore} came first, and {secondScore} followed in the reply.",
  "First came {firstScore}; then came {secondScore}.",
  "The innings ran in order: {firstScore}, then {secondScore}.",
  "{firstScore} set the target shape, before {secondScore} closed the scoring.",
  "The scorecard moved from {firstScore} to {secondScore}.",
  "The batting order read {firstScore} before {secondScore}.",
  "The first innings landed on {firstScore}; the second finished at {secondScore}.",
  "By the end, the two lines read {firstScore} and {secondScore}.",
  "{firstScore} was the first entry, with {secondScore} written underneath.",
  "The chase column finally sat beside {firstScore} as {secondScore}."
];

const diaryOpenings = [
  "This was a short official match with enough happening to earn a proper note.",
  "The match stayed simple: a first innings, a reply, and a few moments worth keeping.",
  "The scorecard carried most of the memory, which is sometimes exactly right.",
  "Another Prague match found its shape through ordinary cricket moments.",
  "The game had a clean rhythm, with just enough detail beyond the final score.",
  "For the diary, this one is best remembered through the score and the small match notes."
];

const friendlyClosings = [
  "It stayed competitive without losing the Gully mood.",
  "The result can sit in the archive without needing a big speech.",
  "No Rules, Only Fun had room around the scoreline.",
  "A tidy little chapter for the CZU scorebook."
];

const scorecardClosings = [
  "The scorecard had enough detail to tell the story.",
  "The numbers did most of the talking by the end.",
  "That was enough cricket for one neat diary entry.",
  "The final line felt clear without needing decoration."
];

const battingMomentTemplates = [
  "{player} led the batting with {runs}.",
  "{player} made {runs}.",
  "{player} led the scoring with {runs}.",
  "{player}'s {runs} was the biggest individual score.",
  "{player} gave the innings its main batting push with {runs}.",
  "{player} kept the batting line moving with {runs}."
];

const bowlingMomentTemplates = [
  "{player} picked up {wickets}.",
  "{wicketsCapitalized} from {player} stood out.",
  "{player} finished with {wickets}, the best wicket return of the match.",
  "{player} made the biggest bowling mark with {wickets}."
];

const runOutMomentTemplates = [
  "{player} was involved in {runOuts}.",
  "{player} produced {runOuts} in the field.",
  "{runOutsCapitalized} from {player} gave the fielding its sharpest moment.",
  "{player} helped turn the running game with {runOuts}.",
  "{player} made the fielding notes matter with {runOuts}."
];

const stumpingMomentTemplates = [
  "{player} completed {stumpings} behind the wicket.",
  "{stumpingsCapitalized} from {player} gave the keeper's work a clear note.",
  "{player} had {stumpings} in the wicketkeeping notes.",
  "{player} was quick enough behind the stumps for {stumpings}."
];

const pomMomentTemplates = [
  "{player} also carried the official Player of the Match tag.",
  "The official Player of the Match label went to {player}.",
  "{player} had the Player of the Match line beside the performance.",
  "The match record also marked {player} as Player of the Match."
];

function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function seededIndex(seed: string, length: number): number {
  if (length <= 0) return 0;

  return hashString(seed) % length;
}

function choose<T>(items: T[], seed: string): T {
  return items[seededIndex(seed, items.length)];
}

function getPlayerName(playerId: string): string {
  return getPlayerById(playerId)?.name ?? playerId;
}

function getTeamName(match: MatchRecord, teamId: TeamId): string {
  return teamId === "teamA"
    ? match.teams.teamA.teamName || "Team A"
    : match.teams.teamB.teamName || "Team B";
}

function formatSmallNumber(value: number): string {
  const words = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten"
  ];

  return value >= 0 && value <= 10 ? words[value] : String(value);
}

function formatCount(value: number, singular: string, plural: string): string {
  return `${formatSmallNumber(value)} ${value === 1 ? singular : plural}`;
}

function capitalizeFirst(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function getOrderedInnings(match: MatchRecord): [TeamInnings, TeamInnings] {
  const rows = getMatchScoreRowsInInningsOrder(match);
  const first =
    match.innings.first.battingTeamId === rows[0]?.teamId
      ? match.innings.first
      : match.innings.second;
  const second = first === match.innings.first ? match.innings.second : match.innings.first;

  return [first, second];
}

export function isEligibleForMatchStory(match: MatchRecord): boolean {
  return isOfficialCelebrationMatch(match) && match.result.type !== "no_result";
}

export function classifyMatchStory(match: MatchRecord): MatchStoryCharacter[] {
  if (!isEligibleForMatchStory(match)) return [];

  const [firstInnings, secondInnings] = getOrderedInnings(match);
  const traits: MatchStoryCharacter[] = [];
  const totalRuns = firstInnings.runs + secondInnings.runs;
  const totalWickets = firstInnings.wicketsLost + secondInnings.wicketsLost;
  const scheduledOvers = match.scheduledOversPerInnings ?? 0;
  const topScore = Math.max(
    0,
    ...(match.finalisedPlayerRecords ?? []).map((record) =>
      record.didBat ? sanitizeRuns(record.runs) : 0
    )
  );
  const runOuts = (match.finalisedPlayerRecords ?? []).reduce(
    (total, record) => total + sanitizeRuns(record.runOuts),
    0
  );
  const maxWickets = Math.max(
    0,
    ...(match.finalisedPlayerRecords ?? []).map((record) => sanitizeRuns(record.wickets))
  );

  if (match.result.type === "tie") traits.push("TIE");
  if (match.result.type === "win_by_wickets") {
    traits.push(
      match.result.wicketsRemaining <= 2 ? "CLOSE_CHASE" : "COMFORTABLE_CHASE"
    );
    if (
      scheduledOvers > 0 &&
      scheduledOvers - Number(secondInnings.completedOvers) <= 1
    ) {
      traits.push("LAST_OVER_FINISH");
    }
  }
  if (match.result.type === "win_by_runs") {
    traits.push(
      match.result.marginRuns <= 10 ? "SUCCESSFUL_DEFENCE" : "COMFORTABLE_DEFENCE"
    );
  }
  if (scheduledOvers > 0 && totalRuns >= scheduledOvers * 28) traits.push("HIGH_SCORING_GAME");
  if (scheduledOvers > 0 && totalRuns <= scheduledOvers * 13) traits.push("LOW_SCORING_GAME");
  if (totalWickets >= 7) traits.push("WICKET_HEAVY");
  if (topScore >= 40 || totalRuns >= 100) traits.push("BATTING_HEAVY");
  if (maxWickets >= 3) traits.push("WICKET_BURST");
  if (runOuts > 0) traits.push("RUN_OUT_TWIST");
  if (topScore >= 35) traits.push("LATE_ACCELERATION");
  if (firstInnings.wicketsLost >= 2) traits.push("EARLY_WICKETS");
  if (traits.length > 1 && !traits.includes("TIE")) traits.push("BACK_AND_FORTH");

  return Array.from(new Set(traits));
}

function getPrimaryTrait(match: MatchRecord): MatchStoryCharacter | "GENERIC" {
  const priorities: MatchStoryCharacter[] = [
    "TIE",
    "LAST_OVER_FINISH",
    "CLOSE_CHASE",
    "SUCCESSFUL_DEFENCE",
    "RUN_OUT_TWIST",
    "WICKET_BURST",
    "WICKET_HEAVY",
    "HIGH_SCORING_GAME",
    "LOW_SCORING_GAME",
    "COMFORTABLE_CHASE",
    "COMFORTABLE_DEFENCE",
    "BATTING_HEAVY",
    "BACK_AND_FORTH",
    "LATE_ACCELERATION",
    "EARLY_WICKETS"
  ];
  const traits = classifyMatchStory(match);

  return priorities.find((trait) => traits.includes(trait)) ?? "GENERIC";
}

function getResultMoment(match: MatchRecord): StoryMoment | null {
  if (match.result.type === "tie") {
    return {
      key: "tie",
      weight: 110,
      playerIds: [],
      text: "The two teams finished level, leaving the match with no winner and no loser."
    };
  }

  if (match.result.type === "win_by_wickets") {
    return {
      key: "chase",
      weight: match.result.wicketsRemaining <= 2 ? 105 : 82,
      playerIds: [],
      text: `${getTeamName(match, match.result.winnerTeamId)} won by ${formatCount(match.result.wicketsRemaining, "wicket", "wickets")}.`
    };
  }

  if (match.result.type === "win_by_runs") {
    return {
      key: "defence",
      weight: match.result.marginRuns <= 10 ? 102 : 78,
      playerIds: [],
      text: `${getTeamName(match, match.result.winnerTeamId)} won by ${formatCount(match.result.marginRuns, "run", "runs")}.`
    };
  }

  return null;
}

function getTopBattingMoment(match: MatchRecord, attempt: number): StoryMoment | null {
  const topRecord = [...(match.finalisedPlayerRecords ?? [])]
    .filter((record) => record.played && record.didBat && sanitizeRuns(record.runs) >= 15)
    .sort((left, right) => sanitizeRuns(right.runs) - sanitizeRuns(left.runs))[0];

  if (!topRecord) return null;

  const runs = sanitizeRuns(topRecord.runs);

  return {
    key: `batting:${topRecord.playerId}`,
    weight: Math.min(88, 48 + runs),
    playerIds: [topRecord.playerId],
    text: applyMomentContext(
      choose(battingMomentTemplates, `${match.id}:${attempt}:batting:${topRecord.playerId}`),
      {
        player: getPlayerName(topRecord.playerId),
        runs
      }
    )
  };
}

function getBowlingMoment(match: MatchRecord, attempt: number): StoryMoment | null {
  const figures = [
    ...buildBowlingFigures(match.innings.first.bowlingOvers, getPlayerName),
    ...buildBowlingFigures(match.innings.second.bowlingOvers, getPlayerName)
  ].sort((left, right) => {
    if (right.wickets !== left.wickets) return right.wickets - left.wickets;

    return left.runsConceded - right.runsConceded;
  });
  const best = figures.find((figure) => figure.wickets >= 2);

  if (!best) return null;

  return {
    key: `bowling:${best.playerId}`,
    weight: best.wickets >= 3 ? 92 : 70,
    playerIds: [best.playerId],
    text: applyMomentContext(
      choose(bowlingMomentTemplates, `${match.id}:${attempt}:bowling:${best.playerId}`),
      {
        player: best.bowler,
        wickets: formatCount(best.wickets, "wicket", "wickets"),
        wicketsCapitalized: capitalizeFirst(formatCount(best.wickets, "wicket", "wickets"))
      }
    )
  };
}

function getRunOutMoment(match: MatchRecord, attempt: number): StoryMoment | null {
  const best = [...(match.finalisedPlayerRecords ?? [])]
    .filter((record) => record.played && sanitizeRuns(record.runOuts) > 0)
    .sort((left, right) => sanitizeRuns(right.runOuts) - sanitizeRuns(left.runOuts))[0];

  if (!best) return null;

  const runOuts = sanitizeRuns(best.runOuts);

  return {
    key: `runout:${best.playerId}`,
    weight: 86,
    playerIds: [best.playerId],
    text: applyMomentContext(
      choose(runOutMomentTemplates, `${match.id}:${attempt}:runout:${best.playerId}`),
      {
        player: getPlayerName(best.playerId),
        runOuts: formatCount(runOuts, "run-out", "run-outs"),
        runOutsCapitalized: capitalizeFirst(formatCount(runOuts, "run-out", "run-outs"))
      }
    )
  };
}

function getStumpingMoment(match: MatchRecord, attempt: number): StoryMoment | null {
  const best = [...(match.finalisedPlayerRecords ?? [])]
    .filter((record) => record.played && sanitizeRuns(record.stumpings ?? 0) > 0)
    .sort(
      (left, right) =>
        sanitizeRuns(right.stumpings ?? 0) - sanitizeRuns(left.stumpings ?? 0)
    )[0];

  if (!best) return null;

  const stumpings = sanitizeRuns(best.stumpings ?? 0);

  return {
    key: `stumping:${best.playerId}`,
    weight: 76,
    playerIds: [best.playerId],
    text: applyMomentContext(
      choose(stumpingMomentTemplates, `${match.id}:${attempt}:stumping:${best.playerId}`),
      {
        player: getPlayerName(best.playerId),
        stumpings: formatCount(stumpings, "stumping", "stumpings"),
        stumpingsCapitalized: capitalizeFirst(formatCount(stumpings, "stumping", "stumpings"))
      }
    )
  };
}

function getPomMoment(match: MatchRecord, attempt: number): StoryMoment | null {
  const pom = (match.finalisedPlayerRecords ?? []).find(
    (record) => record.played && record.playerOfMatch
  );
  const pomRuns = pom?.didBat ? sanitizeRuns(pom.runs) : 0;
  const pomWickets = sanitizeRuns(pom?.wickets ?? 0);
  const pomFielding =
    sanitizeRuns(pom?.catches ?? 0) +
    sanitizeRuns(pom?.runOuts ?? 0) +
    sanitizeRuns(pom?.stumpings ?? 0);

  if (!pom || seededIndex(`${match.id}:pom-mention`, 4) !== 0) return null;
  if (pomRuns < 25 && pomWickets < 2 && pomFielding === 0) return null;

  return {
    key: `pom:${pom.playerId}`,
    weight: 94,
    playerIds: [pom.playerId],
    text: applyMomentContext(
      choose(pomMomentTemplates, `${match.id}:${attempt}:pom:${pom.playerId}`),
      {
        player: getPlayerName(pom.playerId)
      }
    )
  };
}

function buildMomentCandidates(match: MatchRecord, attempt: number): StoryMoment[] {
  return [
    getResultMoment(match),
    getTopBattingMoment(match, attempt),
    getBowlingMoment(match, attempt),
    getRunOutMoment(match, attempt),
    getStumpingMoment(match, attempt),
    getPomMoment(match, attempt)
  ]
    .filter((moment): moment is StoryMoment => Boolean(moment))
    .sort((left, right) => {
      if (right.weight !== left.weight) return right.weight - left.weight;

      return left.key.localeCompare(right.key);
    });
}

function selectStoryMoments(match: MatchRecord, attempt: number): StoryMoment[] {
  const selected: StoryMoment[] = [];
  const mentionedPlayers = new Set<string>();

  for (const moment of buildMomentCandidates(match, attempt)) {
    if (selected.length >= 3) break;

    const newPlayerMentions = moment.playerIds.filter(
      (playerId) => !mentionedPlayers.has(playerId)
    );

    if (mentionedPlayers.size + newPlayerMentions.length > 3) continue;

    selected.push(moment);
    newPlayerMentions.forEach((playerId) => mentionedPlayers.add(playerId));
  }

  const desiredCount = 1 + seededIndex(`${match.id}:${attempt}:moment-count`, 3);

  return selected.slice(0, Math.min(desiredCount, selected.length));
}

function getScoreContext(match: MatchRecord) {
  const [firstRow, secondRow] = getMatchScoreRowsInInningsOrder(match);

  return {
    firstTeam: firstRow?.teamName ?? "Team A",
    secondTeam: secondRow?.teamName ?? "Team B",
    firstScore: firstRow
      ? `${firstRow.teamName} ${firstRow.score} in ${formatOversForStory(firstRow.overs)}`
      : "the first innings",
    secondScore: secondRow
      ? `${secondRow.teamName} ${secondRow.score} in ${formatOversForStory(secondRow.overs)}`
      : "the reply",
    result: getMatchResultHeadline(match)
  };
}

function formatOversForStory(overs: string): string {
  const [overText, ballText] = overs.split(".");
  const oversValue = Number.parseInt(overText ?? "", 10);
  const ballsValue = Number.parseInt(ballText ?? "", 10);

  if (!Number.isFinite(oversValue) || !Number.isFinite(ballsValue)) {
    return `${overs} overs`;
  }

  if (ballsValue === 0) {
    return `${oversValue} ${oversValue === 1 ? "over" : "overs"}`;
  }

  return `${oversValue} ${oversValue === 1 ? "over" : "overs"} and ${ballsValue} ${ballsValue === 1 ? "ball" : "balls"}`;
}

function ensureSentence(value: string): string {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function applyScoreContext(template: string, match: MatchRecord): string {
  const context = getScoreContext(match);

  return template
    .replaceAll("{result}", context.result)
    .replaceAll("{firstTeam}", context.firstTeam)
    .replaceAll("{secondTeam}", context.secondTeam)
    .replaceAll("{firstScore}", context.firstScore)
    .replaceAll("{secondScore}", context.secondScore);
}

function applyMomentContext(
  template: string,
  values: Record<string, string | number>
): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template
  );
}

function buildTitle(match: MatchRecord, primaryTrait: MatchStoryCharacter | "GENERIC", attempt: number): string {
  const seed = `${match.id}:${MATCH_STORY_VERSION}:${attempt}:${primaryTrait}:title`;
  const titlePool = titlePatterns[primaryTrait] ?? titlePatterns.GENERIC;

  return choose(titlePool, `${seed}:natural`);
}

function chooseStructure(
  primaryTrait: MatchStoryCharacter | "GENERIC",
  attempt: number,
  seed: string
): StoryStructure {
  const preferred: StoryStructure[] =
    primaryTrait === "WICKET_BURST" ||
    primaryTrait === "RUN_OUT_TWIST" ||
    primaryTrait === "BATTING_HEAVY"
      ? ["PLAYER_MOMENT", "MOMENT_FIRST", "SCOREBOARD_JOURNEY", "RESULT_FIRST", "SHORT_DIARY", "MINIMAL"]
      : primaryTrait === "TIE" ||
          primaryTrait === "CLOSE_CHASE" ||
          primaryTrait === "LAST_OVER_FINISH" ||
          primaryTrait === "SUCCESSFUL_DEFENCE"
        ? ["SCOREBOARD_JOURNEY", "MOMENT_FIRST", "RESULT_FIRST", "SHORT_DIARY", "PLAYER_MOMENT", "MINIMAL"]
        : ["SHORT_DIARY", "SCOREBOARD_JOURNEY", "RESULT_FIRST", "MINIMAL", "MOMENT_FIRST", "PLAYER_MOMENT"];

  return preferred[(seededIndex(`${seed}:structure`, preferred.length) + attempt) % preferred.length];
}

function getResultSentence(match: MatchRecord): string {
  const context = getScoreContext(match);

  if (match.result.type === "tie") {
    return `The match finished level after ${context.firstScore} and ${context.secondScore}.`;
  }

  if (match.result.type === "win_by_wickets") {
    const winner = getTeamName(match, match.result.winnerTeamId);

    return `${winner} won by ${formatCount(match.result.wicketsRemaining, "wicket", "wickets")} after ${context.secondScore} answered ${context.firstScore}.`;
  }

  if (match.result.type === "win_by_runs") {
    const winner = getTeamName(match, match.result.winnerTeamId);

    return `${winner} won by ${formatCount(match.result.marginRuns, "run", "runs")} after ${context.secondScore} fell short of ${context.firstScore}.`;
  }

  return ensureSentence(context.result);
}

function getScoreSentence(match: MatchRecord, seed: string): string {
  return applyScoreContext(choose(scoreOpenings, `${seed}:score`), match);
}

function getDiaryOpening(seed: string): string {
  return choose(diaryOpenings, `${seed}:diary`);
}

function getOptionalClosing(match: MatchRecord, seed: string): string | null {
  const family = seededIndex(`${seed}:closing:family`, 10);

  if (family < 6) return null;

  if (family < 8) {
    return applyScoreContext(choose(scorecardClosings, `${seed}:scorecard-closing`), match);
  }

  return choose(friendlyClosings, `${seed}:friendly-closing`);
}

function getQuietMatchNote(match: MatchRecord, seed: string): string {
  const gameText = match.matchNumber ? `Game #${match.matchNumber}` : "The archive";
  const context = getScoreContext(match);
  const notes = [
    `${gameText} can keep that final score exactly as it happened.`,
    `${gameText} now has ${context.firstScore} and ${context.secondScore} in the diary.`,
    `${gameText} left a clean scorecard behind.`,
    `${gameText} had enough in the numbers to earn its place.`
  ];

  return choose(notes, `${seed}:quiet-note`);
}

function getResultMomentKey(moment: StoryMoment): boolean {
  return moment.key === "tie" || moment.key === "chase" || moment.key === "defence";
}

function buildCompactSentenceList(
  sentences: Array<string | null | undefined>,
  fallbacks: string[]
): string[] {
  const used = new Set<string>();
  const result: string[] = [];

  for (const sentence of [...sentences, ...fallbacks]) {
    if (!sentence || result.length >= 5) continue;

    const key = normalizeText(sentence);
    if (!key || used.has(key)) continue;

    used.add(key);
    result.push(sentence);
    if (result.length >= 3 && sentences.indexOf(sentence) === -1) break;
  }

  return result;
}

function buildSentenceList({
  match,
  moments,
  structure,
  seed
}: {
  match: MatchRecord;
  moments: StoryMoment[];
  structure: StoryStructure;
  seed: string;
}): string[] {
  const playerMoments = moments.filter((moment) => !getResultMomentKey(moment));
  const primaryPlayerMoment = playerMoments[0];
  const secondaryPlayerMoment = playerMoments[1];
  const scoreSentence = getScoreSentence(match, seed);
  const resultSentence = getResultSentence(match);
  const closing = getOptionalClosing(match, seed);
  const diaryOpening = getDiaryOpening(seed);
  const quietMatchNote = getQuietMatchNote(match, seed);
  const fallbackSentences = [scoreSentence, resultSentence, closing, quietMatchNote].filter(
    (sentence): sentence is string => Boolean(sentence)
  );

  switch (structure) {
    case "RESULT_FIRST":
      return buildCompactSentenceList(
        [
          resultSentence,
          primaryPlayerMoment?.text,
          secondaryPlayerMoment?.text,
          closing
        ],
        fallbackSentences
      );
    case "MOMENT_FIRST":
      return buildCompactSentenceList(
        [
          primaryPlayerMoment?.text ?? diaryOpening,
          scoreSentence,
          secondaryPlayerMoment?.text,
          resultSentence
        ],
        fallbackSentences
      );
    case "SCOREBOARD_JOURNEY":
      return buildCompactSentenceList(
        [
          scoreSentence,
          primaryPlayerMoment?.text ?? resultSentence,
          secondaryPlayerMoment?.text,
          primaryPlayerMoment ? resultSentence : closing
        ],
        fallbackSentences
      );
    case "PLAYER_MOMENT":
      return buildCompactSentenceList(
        [
          primaryPlayerMoment?.text ?? diaryOpening,
          scoreSentence,
          secondaryPlayerMoment?.text,
          resultSentence
        ],
        fallbackSentences
      );
    case "SHORT_DIARY":
      return buildCompactSentenceList(
        [
          diaryOpening,
          primaryPlayerMoment?.text,
          secondaryPlayerMoment?.text,
          scoreSentence,
          resultSentence
        ],
        fallbackSentences
      );
    case "MINIMAL":
      return buildCompactSentenceList(
        [
          scoreSentence,
          primaryPlayerMoment?.text ?? resultSentence,
          primaryPlayerMoment ? resultSentence : closing
        ],
        fallbackSentences
      );
  }
}

function buildAttempt(match: MatchRecord, attempt: number): StoryBuildAttempt {
  const primaryTrait = getPrimaryTrait(match);
  const seed = `${match.id}:${MATCH_STORY_VERSION}:${attempt}:${primaryTrait}`;
  const moments = selectStoryMoments(match, attempt);
  const structure = chooseStructure(primaryTrait, attempt, seed);
  const sentences = buildSentenceList({ match, moments, structure, seed })
    .map(ensureSentence)
    .filter(Boolean)
    .slice(0, 5);

  return {
    title: buildTitle(match, primaryTrait, attempt),
    sentences,
    storyStyle: `${primaryTrait}:${structure}`
  };
}

function getShortResultLine(match: MatchRecord): string {
  const gameSuffix = match.matchNumber ? ` in Game #${match.matchNumber}` : "";

  if (match.result.type === "tie") return `Neither side finished ahead${gameSuffix}.`;

  if (match.result.type === "win_by_wickets") {
    return `${getTeamName(match, match.result.winnerTeamId)} got home by ${formatCount(match.result.wicketsRemaining, "wicket", "wickets")}${gameSuffix}.`;
  }

  if (match.result.type === "win_by_runs") {
    return `${getTeamName(match, match.result.winnerTeamId)} stayed in front by ${formatCount(match.result.marginRuns, "run", "runs")}${gameSuffix}.`;
  }

  return getResultSentence(match);
}

function getShortResultLineVariants(match: MatchRecord): string[] {
  const gameSuffix = match.matchNumber ? ` in Game #${match.matchNumber}` : "";

  if (match.result.type === "tie") {
    return [
      `Neither side finished ahead${gameSuffix}.`,
      `The result stayed level${gameSuffix}.`,
      `No winner was needed for this one${gameSuffix}.`
    ];
  }

  if (match.result.type === "win_by_wickets") {
    const winner = getTeamName(match, match.result.winnerTeamId);
    const margin = formatCount(match.result.wicketsRemaining, "wicket", "wickets");

    return [
      `${winner} got home by ${margin}${gameSuffix}.`,
      `${winner} crossed the line with ${margin} left${gameSuffix}.`,
      `The chase belonged to ${winner} by ${margin}${gameSuffix}.`,
      `${winner} found the final answer with ${margin} to spare${gameSuffix}.`
    ];
  }

  if (match.result.type === "win_by_runs") {
    const winner = getTeamName(match, match.result.winnerTeamId);
    const margin = formatCount(match.result.marginRuns, "run", "runs");

    return [
      `${winner} stayed in front by ${margin}${gameSuffix}.`,
      `${winner} defended the total by ${margin}${gameSuffix}.`,
      `The chase stopped ${margin} short of ${winner}${gameSuffix}.`,
      `${winner} kept the reply behind by ${margin}${gameSuffix}.`
    ];
  }

  return [getShortResultLine(match)];
}

function buildFactualFallbackAttempts(match: MatchRecord): StoryBuildAttempt[] {
  const primaryTrait = getPrimaryTrait(match);
  const context = getScoreContext(match);
  const gameText = match.matchNumber ? `Game #${match.matchNumber}` : "The match";
  const dateText = match.matchDate ? ` on ${match.matchDate}` : "";
  const resultLines = getShortResultLineVariants(match);
  const titlePool = [
    "The Short Note",
    "The Score Note",
    "The Clean Entry",
    "A Simple Finish",
    "The Diary Line",
    "The Match Note"
  ];
  const variants = [
    [
      `${gameText} moved from ${context.firstScore} to ${context.secondScore}.`,
      resultLines[0],
      `The diary keeps it as a clean official entry${dateText}.`
    ],
    [
      `${gameText} ended with ${context.firstScore} followed by ${context.secondScore}.`,
      resultLines[1] ?? resultLines[0],
      `${gameText} has enough in the score for this chapter.`
    ],
    [
      `${context.firstTeam} batted first and ${context.secondTeam} replied.`,
      `${context.firstScore} and ${context.secondScore} tell the main story.`,
      resultLines[2] ?? resultLines[0]
    ],
    [
      `${gameText} was a compact one for the record.`,
      `${context.firstScore} came before ${context.secondScore}.`,
      resultLines[3] ?? resultLines[0]
    ],
    [
      `${gameText} is a simple scorecard memory${dateText}.`,
      `${context.secondScore} was the reply to ${context.firstScore}.`,
      resultLines[1] ?? resultLines[0]
    ],
    [
      `The short version is ${context.firstScore}, then ${context.secondScore}.`,
      resultLines[2] ?? resultLines[0],
      `${gameText} goes into the diary without extra noise.`
    ],
    [
      `${context.firstScore} set up the match.`,
      `${context.secondScore} closed it.`,
      resultLines[3] ?? resultLines[0]
    ],
    [
      `${gameText} had a tidy shape: first innings, reply, result.`,
      `${context.firstScore} became ${context.secondScore}.`,
      resultLines[0]
    ]
  ];

  return variants.map((sentences, index) => ({
    title: match.matchNumber ? `Game ${match.matchNumber} Note` : titlePool[index % titlePool.length],
    sentences,
    storyStyle: `${primaryTrait}:FACTUAL_${index + 1}`
  }));
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTextShape(value: string): string {
  return normalizeText(value)
    .replace(/\b\d+\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): Set<string> {
  const tokens = normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 2 || /^\d+$/.test(token));
  const tokenSet = new Set(tokens);

  for (let index = 0; index < tokens.length - 1; index += 1) {
    tokenSet.add(`${tokens[index]}_${tokens[index + 1]}`);
  }

  for (let index = 0; index < tokens.length - 2; index += 1) {
    tokenSet.add(`${tokens[index]}_${tokens[index + 1]}_${tokens[index + 2]}`);
  }

  for (let index = 0; index < tokens.length - 3; index += 1) {
    tokenSet.add(
      `${tokens[index]}_${tokens[index + 1]}_${tokens[index + 2]}_${tokens[index + 3]}`
    );
  }

  return tokenSet;
}

export function calculateStorySimilarity(left: string, right: string): number {
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);

  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;

  return union === 0 ? 0 : intersection / union;
}

function getFirstSentence(value: string): string {
  return value.split(".")[0]?.trim() ?? "";
}

function getLastSentence(value: string): string {
  return (
    value
      .split(".")
      .map((sentence) => sentence.trim())
      .filter(Boolean)
      .at(-1) ?? ""
  );
}

function getStoryStructureFamily(storyStyle: string): string {
  return storyStyle.split(":")[1] ?? storyStyle;
}

function isTooSimilar(candidate: MatchStoryDraft, recentStories: MatchStory[]): boolean {
  const candidateStructure = getStoryStructureFamily(candidate.storyStyle);

  return recentStories.some((story, index) => {
    if (story.title.toLowerCase() === candidate.title.toLowerCase()) return true;
    if (index < 2 && getStoryStructureFamily(story.storyStyle) === candidateStructure) {
      return true;
    }
    if (
      getFirstSentence(story.storyText).toLowerCase() ===
      getFirstSentence(candidate.storyText).toLowerCase()
    ) {
      return true;
    }
    if (
      normalizeTextShape(getFirstSentence(story.storyText)) ===
      normalizeTextShape(getFirstSentence(candidate.storyText))
    ) {
      return true;
    }
    if (normalizeTextShape(story.storyText) === normalizeTextShape(candidate.storyText)) {
      return true;
    }
    if (
      getLastSentence(story.storyText).toLowerCase() ===
      getLastSentence(candidate.storyText).toLowerCase()
    ) {
      return true;
    }

    return calculateStorySimilarity(story.storyText, candidate.storyText) > SIMILARITY_THRESHOLD;
  });
}

function getMaxRecentStorySimilarity(
  candidate: MatchStoryDraft,
  recentStories: MatchStory[]
): number {
  if (recentStories.length === 0) return 0;

  return Math.max(
    ...recentStories.map((story) =>
      calculateStorySimilarity(story.storyText, candidate.storyText)
    )
  );
}

function sentenceCount(value: string): number {
  return value.split(/[.!?]+/).filter((sentence) => sentence.trim()).length;
}

function toStoryDraft(attempt: StoryBuildAttempt, match: MatchRecord): MatchStoryDraft {
  const storyText = attempt.sentences.join(" ");
  const rawSignature = `${match.id}:${attempt.title}:${storyText}:${attempt.storyStyle}`;

  return {
    matchId: match.id,
    title: attempt.title,
    storyText,
    storyVersion: MATCH_STORY_VERSION,
    storyStyle: attempt.storyStyle,
    storySignature: `story_${hashString(rawSignature).toString(16)}`
  };
}

export function buildMatchStory({
  match,
  recentStories = []
}: {
  match: MatchRecord;
  recentStories?: MatchStory[];
}): MatchStoryDraft | null {
  if (!isEligibleForMatchStory(match)) return null;

  const recent = recentStories.slice(0, MATCH_STORY_RECENT_LIMIT);
  let fallback: { story: MatchStoryDraft; score: number } | null = null;

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const draft = toStoryDraft(buildAttempt(match, attempt), match);

    if (sentenceCount(draft.storyText) < 3 || sentenceCount(draft.storyText) > 5) {
      continue;
    }

    const similarity = getMaxRecentStorySimilarity(draft, recent);
    const structurePenalty = recent
      .slice(0, 2)
      .some(
        (story) =>
          getStoryStructureFamily(story.storyStyle) === getStoryStructureFamily(draft.storyStyle)
      )
      ? 1
      : 0;
    const recentTitleRepeats = recent.filter(
      (story) => story.title.toLowerCase() === draft.title.toLowerCase()
    ).length;
    const recentOpeningShapeRepeats = recent.filter(
      (story) =>
        normalizeTextShape(getFirstSentence(story.storyText)) ===
        normalizeTextShape(getFirstSentence(draft.storyText))
    ).length;
    const recentStoryShapeRepeats = recent.filter(
      (story) => normalizeTextShape(story.storyText) === normalizeTextShape(draft.storyText)
    ).length;
    const fallbackScore =
      similarity +
      structurePenalty +
      recentTitleRepeats * 2 +
      recentOpeningShapeRepeats +
      recentStoryShapeRepeats * 3;

    if (!fallback || fallbackScore < fallback.score) {
      fallback = { story: draft, score: fallbackScore };
    }

    if (!isTooSimilar(draft, recent)) return draft;
  }

  for (const attempt of buildFactualFallbackAttempts(match)) {
    const draft = toStoryDraft(attempt, match);

    if (!isTooSimilar(draft, recent)) return draft;

    const structurePenalty = recent
      .slice(0, 2)
      .some(
        (story) =>
          getStoryStructureFamily(story.storyStyle) === getStoryStructureFamily(draft.storyStyle)
      )
      ? 1
      : 0;
    const fallbackScore = getMaxRecentStorySimilarity(draft, recent) + structurePenalty;
    if (!fallback || fallbackScore < fallback.score) {
      fallback = { story: draft, score: fallbackScore };
    }
  }

  return fallback?.story ?? null;
}

export function getMatchStoryBackfillCandidates(matches: MatchRecord[]): MatchRecord[] {
  return matches.filter(
    (match) => isEligibleForMatchStory(match) && !match.matchStory
  );
}

export function getMatchStorySampleContext(match: MatchRecord): string {
  const [first, second] = getOrderedInnings(match);

  return [
    getMatchResultHeadline(match),
    `${getTeamName(match, first.battingTeamId)} ${first.runs}/${first.wicketsLost} in ${formatCompletedOvers(first.completedOvers)}`,
    `${getTeamName(match, second.battingTeamId)} ${second.runs}/${second.wicketsLost} in ${formatCompletedOvers(second.completedOvers)}`
  ].join(" | ");
}

export function getResultStoryTone(result: MatchResult): string {
  if (result.type === "tie") return "tie";
  if (result.type === "win_by_wickets") return "chase";
  if (result.type === "win_by_runs") return "defence";

  return "neutral";
}
