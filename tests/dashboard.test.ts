import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { getDashboardSummary } from "../lib/dashboard-summary";
import {
  activePlayers,
  getPlayerById,
  getPlayerBySlug,
  players
} from "../lib/data/players";
import {
  isNavigationItemActive,
  mainNavigation
} from "../lib/data/navigation";
import {
  getMatchResultHeadline,
  getMatchTeamScore
} from "../lib/match-display";
import {
  canDeleteScheduledFixture,
  compactSameDayUnplayedMatchNumbers,
  compareFixtureOrder,
  formatNextMatchDateLine,
  getDraftMatchSetupState,
  getFixtureLabel,
  getLiveMatchConflict,
  getLiveNextMatchTeamSummaries,
  getMatchPositionLabel,
  getNextAvailableMatchNumber,
  getNextMatchAction,
  getNextMatchCountdownLabel,
  getNextMatchState,
  getSameDayFixtures,
  getTeamPlayerCount,
  getTodaySlate,
  getUniqueAttendanceCount,
  hasDuplicateMatchNumber,
  hasAssignedTeams,
  isDeletedFixture
} from "../lib/next-match";
import {
  LocalMatchRepository,
  getFinalisedMatches,
  type MatchRepository
} from "../lib/match-repository";
import {
  MATCH_ARCHIVE_PAGE_SIZE,
  filterArchivedMatches,
  getArchiveMatchSearchText,
  getAvailableArchiveYears,
  getMatchArchiveDisplayIdentifier,
  getMatchArchiveGameLabel,
  getPaginatedArchiveMatches,
  groupArchiveMatchesByDate,
  normaliseArchiveQuery,
  sortArchivedMatches
} from "../lib/match-archive";
import {
  buildPlayerOfMatchSummary,
  buildScorecardInnings,
  formatOneDecimal,
  getOrderedInnings
} from "../lib/match-scorecard";
import { MATCH_HISTORY_STORAGE_KEY } from "../lib/match-history-store";
import {
  DEFAULT_PLAYER_BROWSER_OPTIONS,
  formatVisibleWarriorCount,
  getVisiblePlayers
} from "../lib/player-browser";
import { calculateDisplayedRating } from "../lib/progression";
import type {
  FinalisedPlayerMatchRecord,
  MatchRecord,
  MatchStatus,
  PlayerMatchXPBreakdown
} from "../lib/types/match";
import type { Player } from "../lib/types/player";

const topPerformersSource = () =>
  readFileSync("components/dashboard/TopPerformersPanel.tsx", "utf8");
const cssSource = () => readFileSync("app/globals.css", "utf8");
const recentMatchesSource = () =>
  readFileSync("components/dashboard/RecentMatchesPanel.tsx", "utf8");
const heroSectionSource = () =>
  readFileSync("components/dashboard/HeroSection.tsx", "utf8");
const nextMatchTicketSource = () =>
  readFileSync("components/dashboard/NextMatchTicket.tsx", "utf8");
const playerBrowserSource = () =>
  readFileSync("components/dashboard/PlayerBrowserSection.tsx", "utf8");
const matchFormSource = () =>
  readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");
const matchesPageSource = () => readFileSync("app/matches/page.tsx", "utf8");
const matchArchiveSource = () =>
  readFileSync("components/matches/MatchArchive.tsx", "utf8");
const matchScorecardSource = () =>
  readFileSync("components/matches/MatchScorecard.tsx", "utf8");
const todayFixturesSource = () =>
  readFileSync("components/matches/TodayFixtures.tsx", "utf8");
const newPlayerIds = ["naim", "chaitanya", "amrit", "pritvi", "suprateem"];
const newPlayerImagePaths = [
  "/player-cards/calm-cannon.png",
  "/player-cards/steady-storm.png",
  "/player-cards/looper-legend.png",
  "/player-cards/precision-pacer.png",
  "/player-cards/style-striker.png"
];

function getPublicPngDimensions(publicPath: string) {
  const image = readFileSync(path.join(process.cwd(), "public", publicPath.replace(/^\//, "")));

  return {
    width: image.readUInt32BE(16),
    height: image.readUInt32BE(20)
  };
}

const originalPlayerSummaries = [
  ["aninda", "Rulebook Rambo", "/player-cards/rulebook-rambo.png"],
  ["arunabha", "Turbo Technician", "/player-cards/turbo-technician.png"],
  ["atripan", "Smiling Sniper", "/player-cards/smiling-sniper.png"],
  ["biplab", "Nerve Ninja", "/player-cards/nerve-ninja.png"],
  ["dipanjan", "Cutter Commander", "/player-cards/cutter-commander.png"],
  ["gaurav", "Slow Poison", "/player-cards/slow-poison.png"],
  ["madhab", "Sweep Samurai", "/player-cards/sweep-samurai.png"],
  ["rohit", "Skidball Sheriff", "/player-cards/skidball-sheriff.png"],
  ["soman", "Apex Crusher", "/player-cards/apex-crusher.png"],
  ["utpal", "Tempo Tactician", "/player-cards/tempo-tactician.png"],
  ["jogindar", "Loopy Loyalist", "/player-cards/loopy-loyalist.png"],
  ["badhan", "Quiet Quake", "/player-cards/quiet-quake.png"],
  ["debraj", "Steady Sentinel", "/player-cards/steady-sentinel.png"],
  ["dipayan", "Dipayan the Destroyer", "/player-cards/dipayan-the-destroyer.png"],
  ["dheeraj", "Surgical Chase Master", "/player-cards/surgical-chase-master.png"],
  ["saurav", "Zen Sixsmith", "/player-cards/zen-sixsmith.png"]
];

function matchRecord({
  id,
  matchDate,
  matchNumber,
  startTime,
  deletedAt,
  progressionAppliedAt,
  status = "finalised",
  resultType = "win_by_runs"
}: {
  id: string;
  matchDate: string;
  matchNumber?: number | null;
  startTime?: string;
  deletedAt?: string | null;
  progressionAppliedAt?: string;
  status?: MatchStatus;
  resultType?: "win_by_runs" | "no_result" | "tie";
}): MatchRecord {
  const result =
    resultType === "win_by_runs"
      ? {
          type: "win_by_runs" as const,
          winnerTeamId: "teamA" as const,
          loserTeamId: "teamB" as const,
          marginRuns: 8
        }
      : resultType === "tie"
        ? { type: "tie" as const }
        : { type: "no_result" as const };

  return {
    id,
    matchDate,
    matchNumber,
    startTime,
    deletedAt,
    progressionAppliedAt,
    matchName: `Match ${id}`,
    venue: "CZU Gully Arena",
    status,
    scheduledOversPerInnings: 4,
    battingFirstTeamId: "teamA",
    chasingTeamId: "teamB",
    teams: {
      teamA: {
        teamId: "teamA",
        teamName: "Team A",
        playerIds: ["aninda"],
        playerPerformances: [],
        bowlingOvers: [],
        totalRuns: 20,
        completedBowlingOvers: 4
      },
      teamB: {
        teamId: "teamB",
        teamName: "Team B",
        playerIds: ["biplab"],
        playerPerformances: [],
        bowlingOvers: [],
        totalRuns: 12,
        completedBowlingOvers: 4
      }
    },
    innings: {
      first: {
        battingTeamId: "teamA",
        bowlingTeamId: "teamB",
        runs: 20,
        wicketsLost: 2,
        extras: 0,
        playerCount: 1,
        completedOvers: 4,
        battingPerformances: [],
        bowlingOvers: []
      },
      second: {
        battingTeamId: "teamB",
        bowlingTeamId: "teamA",
        runs: 12,
        wicketsLost: 1,
        extras: 0,
        playerCount: 1,
        completedOvers: 4,
        battingPerformances: [],
        bowlingOvers: []
      }
    },
    result
  };
}

function temporaryPlayer(index: number): Player {
  const base = players[0];

  return {
    ...base,
    id: `temporary-player-${index}`,
    slug: `temporary-player-${index}`,
    name: `Temporary Player ${index}`,
    cardTitle: `Temporary Title ${index}`,
    cardImage: `/player-cards/temporary-player-${index}.png`,
    playStyles: ["batting", "utility"],
    avatar: `/player-cards/temporary-player-${index}.png`,
    level: 0,
    xp: 0,
    ratings: { batting: 0, bowling: 0, fielding: 0 },
    stats: {
      matches: 0,
      runs: 0,
      wickets: 0,
      catches: 0,
      runOuts: 0,
      hatTricks: 0
    }
  };
}

function xpBreakdown(awardedXP: number): PlayerMatchXPBreakdown {
  return {
    participationXP: 0,
    winBonusXP: 0,
    playerOfMatchXP: 0,
    battingRunsXP: 0,
    battingMilestoneXP: 0,
    duckPenaltyXP: 0,
    wicketXP: 0,
    hatTrickXP: 0,
    maidenXP: 0,
    expensiveOverPenaltyXP: 0,
    fieldingXP: 0,
    rawTotalXP: awardedXP,
    awardedXP
  };
}

function finalisedPerformance(
  performance: Omit<FinalisedPlayerMatchRecord, "xpBreakdown">
): FinalisedPlayerMatchRecord {
  return {
    ...performance,
    xpBreakdown: xpBreakdown(performance.playerOfMatch ? 50 : 10)
  };
}

function activeNavigationLabels(pathname: string): string[] {
  return mainNavigation
    .filter((item) => isNavigationItemActive(pathname, item))
    .map((item) => item.label);
}

function richScorecardMatch(): MatchRecord {
  const aninda = finalisedPerformance({
    playerId: "aninda",
    teamId: "teamA",
    representingTeamId: "teamA",
    played: true,
    playerOfMatch: true,
    didBat: true,
    runs: 15,
    wasOut: true,
    wickets: 0,
    hatTricks: 0,
    catches: 0,
    runOuts: 0
  });
  const atripan = finalisedPerformance({
    playerId: "atripan",
    teamId: "teamA",
    representingTeamId: "teamA",
    played: true,
    playerOfMatch: false,
    didBat: true,
    runs: 20,
    wasOut: false,
    wickets: 0,
    hatTricks: 0,
    catches: 0,
    runOuts: 0
  });
  const dipanjan = finalisedPerformance({
    playerId: "dipanjan",
    teamId: "teamA",
    representingTeamId: "teamA",
    played: true,
    playerOfMatch: false,
    didBat: true,
    runs: 18,
    wasOut: true,
    wickets: 0,
    hatTricks: 0,
    catches: 0,
    runOuts: 0
  });
  const biplabTeamA = finalisedPerformance({
    playerId: "biplab",
    teamId: "teamA",
    representingTeamId: "teamA",
    played: true,
    playerOfMatch: false,
    didBat: false,
    runs: "",
    wasOut: false,
    wickets: 0,
    hatTricks: 0,
    catches: 0,
    runOuts: 0
  });
  const arunabha = finalisedPerformance({
    playerId: "arunabha",
    teamId: "teamB",
    representingTeamId: "teamB",
    played: true,
    playerOfMatch: false,
    didBat: true,
    runs: 10,
    wasOut: true,
    wickets: 2,
    hatTricks: 0,
    catches: 0,
    runOuts: 0
  });
  const soman = finalisedPerformance({
    playerId: "soman",
    teamId: "teamB",
    representingTeamId: "teamB",
    played: true,
    playerOfMatch: false,
    didBat: true,
    runs: 23,
    wasOut: false,
    wickets: 0,
    hatTricks: 0,
    catches: 1,
    runOuts: 0
  });
  const biplabTeamB = finalisedPerformance({
    playerId: "biplab",
    teamId: "teamB",
    representingTeamId: "teamB",
    played: true,
    playerOfMatch: false,
    didBat: false,
    runs: "",
    wasOut: false,
    wickets: 0,
    hatTricks: 0,
    catches: 0,
    runOuts: 0
  });
  const teamBBowlingOvers = [
    {
      id: "team-b-over-1",
      bowlingTeamId: "teamB" as const,
      battingTeamId: "teamA" as const,
      bowlerId: "arunabha",
      overNumber: 1,
      runsConceded: 12,
      wicketsTaken: 1,
      maiden: false,
      dismissals: [
        {
          id: "caught-aninda",
          overId: "team-b-over-1",
          battingTeamId: "teamA" as const,
          bowlingTeamId: "teamB" as const,
          dismissedBatterId: "aninda",
          type: "caught" as const,
          creditedBowlerId: "arunabha",
          fielderId: "soman"
        }
      ]
    },
    {
      id: "team-b-over-2",
      bowlingTeamId: "teamB" as const,
      battingTeamId: "teamA" as const,
      bowlerId: "arunabha",
      overNumber: 2,
      runsConceded: 13,
      wicketsTaken: 1,
      maiden: false,
      dismissals: [
        {
          id: "bowled-dipanjan",
          overId: "team-b-over-2",
          battingTeamId: "teamA" as const,
          bowlingTeamId: "teamB" as const,
          dismissedBatterId: "dipanjan",
          type: "bowled" as const,
          creditedBowlerId: "arunabha",
          fielderId: null
        }
      ]
    }
  ];
  const teamABowlingOvers = [
    {
      id: "team-a-over-1",
      bowlingTeamId: "teamA" as const,
      battingTeamId: "teamB" as const,
      bowlerId: "aninda",
      overNumber: 1,
      runsConceded: 33,
      wicketsTaken: 1,
      maiden: false,
      dismissals: [
        {
          id: "run-out-arunabha",
          overId: "team-a-over-1",
          battingTeamId: "teamB" as const,
          bowlingTeamId: "teamA" as const,
          dismissedBatterId: "arunabha",
          type: "run_out" as const,
          creditedBowlerId: null,
          fielderId: "dipanjan"
        }
      ]
    }
  ];

  return {
    id: "scorecard-rich",
    matchDate: "2026-08-05",
    matchName: "Gully Premier League",
    venue: "CZU Gully Arena",
    status: "finalised",
    scheduledOversPerInnings: 4,
    battingFirstTeamId: "teamA",
    chasingTeamId: "teamB",
    sharedPlayerId: "biplab",
    teams: {
      teamA: {
        teamId: "teamA",
        teamName: "Team A",
        playerIds: ["aninda", "atripan", "dipanjan", "biplab"],
        playerPerformances: [aninda, atripan, dipanjan, biplabTeamA],
        bowlingOvers: teamABowlingOvers,
        totalRuns: 57,
        completedBowlingOvers: 1
      },
      teamB: {
        teamId: "teamB",
        teamName: "Team B",
        playerIds: ["arunabha", "soman", "biplab"],
        playerPerformances: [arunabha, soman, biplabTeamB],
        bowlingOvers: teamBBowlingOvers,
        totalRuns: 33,
        completedBowlingOvers: 2
      }
    },
    innings: {
      first: {
        battingTeamId: "teamA",
        bowlingTeamId: "teamB",
        runs: 57,
        wicketsLost: 2,
        extras: 4,
        playerCount: 4,
        completedOvers: 2,
        battingPerformances: [aninda, atripan, dipanjan, biplabTeamA],
        bowlingOvers: teamBBowlingOvers
      },
      second: {
        battingTeamId: "teamB",
        bowlingTeamId: "teamA",
        runs: 33,
        wicketsLost: 1,
        extras: 0,
        playerCount: 3,
        completedOvers: 1,
        battingPerformances: [arunabha, soman, biplabTeamB],
        bowlingOvers: teamABowlingOvers
      }
    },
    result: {
      type: "win_by_runs",
      winnerTeamId: "teamA",
      loserTeamId: "teamB",
      marginRuns: 24
    },
    finalisedPlayerRecords: [aninda, atripan, dipanjan, biplabTeamA, arunabha, soman]
  };
}

test("navbar active state follows the current pathname and nested routes", () => {
  assert.deepEqual(activeNavigationLabels("/"), ["Dashboard"]);
  assert.deepEqual(activeNavigationLabels("/players"), ["Players"]);
  assert.deepEqual(activeNavigationLabels("/players/dipanjan"), ["Players"]);
  assert.deepEqual(activeNavigationLabels("/matches"), ["Matches"]);
  assert.deepEqual(activeNavigationLabels("/matches/create"), ["Matches"]);
  assert.deepEqual(activeNavigationLabels("/matches/fixture-id/edit"), ["Matches"]);
  assert.deepEqual(activeNavigationLabels("/matches/fixture-id/scorecard"), ["Matches"]);
  assert.deepEqual(activeNavigationLabels("/leaderboard"), ["HALL OF LEGENDS"]);
  assert.deepEqual(activeNavigationLabels("/monthly-beasts"), ["Monthly Beasts"]);
  assert.deepEqual(activeNavigationLabels("/stats"), ["FORMULA ROOM"]);
  assert.deepEqual(activeNavigationLabels("/gallery"), ["Gallery"]);

  for (const pathname of [
    "/",
    "/players/aninda",
    "/matches/fixture-id",
    "/leaderboard",
    "/monthly-beasts",
    "/stats",
    "/gallery"
  ]) {
    assert.equal(activeNavigationLabels(pathname).length, 1);
  }
});

test("navbar renders pathname-driven active aria state instead of hardcoded Dashboard", () => {
  const header = readFileSync("components/navigation/SiteHeader.tsx", "utf8");
  const navigationLinks = readFileSync(
    "components/navigation/NavigationLinks.tsx",
    "utf8"
  );
  const navigation = readFileSync("lib/data/navigation.ts", "utf8");

  assert.match(navigationLinks, /usePathname/);
  assert.match(navigationLinks, /aria-current=\{isActive \? "page" : undefined\}/);
  assert.match(navigationLinks, /isNavigationItemActive\(pathname, item\)/);
  assert.match(navigation, /exact:\s*true/);
  assert.match(navigation, /pathname === item\.href/);
  assert.doesNotMatch(header, /index === 0/);
});

test("Dashboard Top Performers is a focused Legend Spotlight section", () => {
  const source = topPerformersSource();

  assert.match(source, /Top Performers \(All Time\)/);
  assert.match(source, /View Hall of Legends/);
  assert.match(source, /href="\/leaderboard"/);
  assert.match(source, /topPerformerCategories = \["runs", "wickets", "catches"\]/);
  assert.match(source, /getLeaderboardEntries/);
  assert.match(source, /getLeaderboardSummary/);
  assert.doesNotMatch(source, /XP TO NEXT|HIGH SCORE|BLADE POWER|Player Power/i);
});

test("Dashboard Top Performer cards use approved portraits and subtle watermarks", () => {
  const source = topPerformersSource();

  assert.match(source, /function TopPerformerCard/);
  assert.match(source, /function TopPerformerPortraits/);
  assert.match(source, /PLAYER_PORTRAIT_POSITION/);
  assert.match(source, /entry\.player\.cardImage/);
  assert.match(source, /className="performer-portrait"/);
  assert.match(source, /className="performer-portrait-image"/);
  assert.match(source, /className="performer-watermark"/);
  assert.match(source, /<Crown className="h-4 w-4" aria-hidden="true" \/>/);
  assert.match(source, /aria-label="All-time leader"/);
  assert.doesNotMatch(source, /emoji|initials/i);
});

test("Dashboard Top Performer cards preserve tie and zero states", () => {
  const source = topPerformersSource();

  assert.match(source, /JOINT LEADERS/);
  assert.match(source, /RACE NOT STARTED/);
  assert.match(source, /No catches recorded yet/);
  assert.match(source, /leaderCount > 1 \? `\$\{baseValue\} EACH` : baseValue/);
  assert.match(source, /leaders\.length === 1\s*\?\s*`\/players\/\$\{leaders\[0\]\.player\.slug\}`/);
  assert.match(source, /`\/leaderboard\?period=all-time&category=\$\{category\}`/);
});

test("Dashboard summary counts finalised matches and active roster players", () => {
  const summary = getDashboardSummary({
    matches: [
      matchRecord({ id: "draft", matchDate: "2026-08-06", status: "draft" }),
      matchRecord({ id: "live", matchDate: "2026-08-07", status: "in_progress" }),
      matchRecord({ id: "abandoned", matchDate: "2026-08-08", resultType: "no_result" }),
      matchRecord({ id: "older", matchDate: "2026-08-04" }),
      matchRecord({ id: "newer", matchDate: "2026-08-09", resultType: "tie" })
    ],
    players: activePlayers
  });

  assert.equal(summary.totalFinalisedMatches, 2);
  assert.equal(summary.activePlayerCount, activePlayers.length);
  assert.equal(summary.activePlayerCount, 21);
  assert.deepEqual(
    summary.recentFinalisedMatches.map((match) => match.id),
    ["newer"]
  );
});

test("shared finalised-match selector sorts newest first and excludes unfinished matches", () => {
  const finalisedMatches = getFinalisedMatches([
    matchRecord({ id: "draft", matchDate: "2026-08-06", status: "draft" }),
    matchRecord({ id: "live", matchDate: "2026-08-07", status: "in_progress" }),
    matchRecord({ id: "no-result", matchDate: "2026-08-08", resultType: "no_result" }),
    matchRecord({
      id: "recently-finalised-old-date",
      matchDate: "2026-08-04",
      progressionAppliedAt: "2026-08-11T20:00:00.000Z"
    }),
    matchRecord({ id: "newer-game-one", matchDate: "2026-08-09", matchNumber: 1 }),
    matchRecord({
      id: "newer-game-two",
      matchDate: "2026-08-09",
      matchNumber: 2,
      resultType: "tie"
    }),
    matchRecord({
      id: "deleted-newer",
      matchDate: "2026-08-10",
      deletedAt: "2026-08-11T08:00:00.000Z"
    })
  ]);

  assert.deepEqual(
    finalisedMatches.map((match) => match.id),
    ["newer-game-two", "newer-game-one", "recently-finalised-old-date"]
  );
  assert.equal(finalisedMatches.length, 3);
});

test("Next Match selector prioritises live today and future draft matches", () => {
  const now = new Date(2026, 7, 6, 9);
  const matches = [
    matchRecord({ id: "future", matchDate: "2026-08-15", status: "draft" }),
    matchRecord({ id: "today", matchDate: "2026-08-06", status: "draft" }),
    matchRecord({ id: "live", matchDate: "2026-08-09", status: "in_progress" })
  ];

  const liveState = getNextMatchState(matches, now);

  assert.equal(liveState.type, "live");
  assert.equal(liveState.match?.id, "live");
  assert.equal(getNextMatchAction(liveState).label, "CONTINUE SCORING \u2192");

  const matchDayState = getNextMatchState(
    matches.filter((match) => match.status !== "in_progress"),
    now
  );

  assert.equal(matchDayState.type, "match-day");
  assert.equal(matchDayState.match?.id, "today");
  assert.equal(getNextMatchAction(matchDayState).label, "START SCORING \u2192");
});

test("Next Match selector sorts future Drafts by date time and stable id", () => {
  const state = getNextMatchState(
    [
      matchRecord({
        id: "same-day-b",
        matchDate: "2026-08-15",
        startTime: "11:00",
        status: "draft"
      }),
      matchRecord({
        id: "same-day-a",
        matchDate: "2026-08-15",
        startTime: "10:00",
        status: "draft"
      }),
      matchRecord({
        id: "nearest",
        matchDate: "2026-08-10",
        status: "draft"
      })
    ],
    new Date(2026, 7, 6, 9)
  );

  assert.equal(state.type, "scheduled");
  assert.equal(state.match?.id, "nearest");

  const sameDayState = getNextMatchState(
    [
      matchRecord({
        id: "same-day-b",
        matchDate: "2026-08-15",
        startTime: "11:00",
        status: "draft"
      }),
      matchRecord({
        id: "same-day-a",
        matchDate: "2026-08-15",
        startTime: "10:00",
        status: "draft"
      })
    ],
    new Date(2026, 7, 6, 9)
  );

  assert.equal(sameDayState.match?.id, "same-day-a");
});

test("same-day fixture ordering uses date game number time and id", () => {
  const fixtures = [
    matchRecord({
      id: "game-3",
      matchDate: "2026-08-06",
      matchNumber: 3,
      startTime: "09:00",
      status: "draft"
    }),
    matchRecord({
      id: "time-only",
      matchDate: "2026-08-06",
      startTime: "08:00",
      status: "draft"
    }),
    matchRecord({
      id: "game-2",
      matchDate: "2026-08-06",
      matchNumber: 2,
      startTime: "12:00",
      status: "draft"
    }),
    matchRecord({
      id: "game-1",
      matchDate: "2026-08-06",
      matchNumber: 1,
      status: "draft"
    })
  ];

  assert.deepEqual(
    getSameDayFixtures(fixtures, "2026-08-06").map((match) => match.id),
    ["game-1", "game-2", "game-3", "time-only"]
  );
  assert.equal(compareFixtureOrder(fixtures[0], fixtures[1]) < 0, true);
  assert.equal(getFixtureLabel(fixtures[0]), "GAME 3");
});

test("same-day game number helpers suggest and reject duplicates", () => {
  const fixtures = [
    matchRecord({ id: "game-1", matchDate: "2026-08-06", matchNumber: 1 }),
    matchRecord({ id: "game-2", matchDate: "2026-08-06", matchNumber: 2 })
  ];

  assert.equal(getNextAvailableMatchNumber(fixtures, "2026-08-06"), 3);
  assert.equal(
    hasDuplicateMatchNumber({
      matches: fixtures,
      matchDate: "2026-08-06",
      matchNumber: 2,
      currentMatchId: "new-match"
    }),
    true
  );
  assert.equal(
    hasDuplicateMatchNumber({
      matches: fixtures,
      matchDate: "2026-08-06",
      matchNumber: 2,
      currentMatchId: "game-2"
    }),
    false
  );
});

test("scheduled fixture deletion is limited to unstarted Draft Ready and Scheduled states", () => {
  const scheduleOnly = {
    ...matchRecord({
      id: "schedule-only",
      matchDate: "2026-08-06",
      status: "draft"
    }),
    teams: {
      teamA: {
        ...matchRecord({ id: "empty-a", matchDate: "2026-08-06" }).teams.teamA,
        playerIds: []
      },
      teamB: {
        ...matchRecord({ id: "empty-b", matchDate: "2026-08-06" }).teams.teamB,
        playerIds: []
      }
    },
    battingFirstTeamId: null,
    chasingTeamId: null,
    scheduledOversPerInnings: null
  };
  const partiallyPrepared = {
    ...matchRecord({
      id: "partial",
      matchDate: "2026-08-06",
      status: "draft"
    }),
    battingFirstTeamId: null,
    chasingTeamId: null
  };
  const ready = matchRecord({
    id: "ready",
    matchDate: "2026-08-06",
    status: "draft"
  });

  assert.equal(canDeleteScheduledFixture(scheduleOnly), true);
  assert.equal(canDeleteScheduledFixture(partiallyPrepared), true);
  assert.equal(canDeleteScheduledFixture(ready), true);
  assert.equal(
    canDeleteScheduledFixture(
      matchRecord({
        id: "live",
        matchDate: "2026-08-06",
        status: "in_progress"
      })
    ),
    false
  );
  assert.equal(
    canDeleteScheduledFixture(
      matchRecord({ id: "final", matchDate: "2026-08-06", status: "finalised" })
    ),
    false
  );
  assert.equal(
    canDeleteScheduledFixture(
      matchRecord({ id: "abandoned", matchDate: "2026-08-06", status: "abandoned" })
    ),
    false
  );
});

test("deleted scheduled fixtures are removed from Next Battle slate and game-number checks", () => {
  const matches = [
    matchRecord({
      id: "game-1",
      matchDate: "2026-08-06",
      matchNumber: 1,
      status: "finalised"
    }),
    matchRecord({
      id: "deleted-game",
      matchDate: "2026-08-06",
      matchNumber: 2,
      status: "draft",
      deletedAt: "2026-08-06T10:00:00.000Z"
    }),
    matchRecord({
      id: "game-3",
      matchDate: "2026-08-06",
      matchNumber: 3,
      status: "draft"
    })
  ];

  assert.equal(isDeletedFixture(matches[1]), true);
  assert.deepEqual(
    getSameDayFixtures(matches, "2026-08-06").map((match) => match.id),
    ["game-1", "game-3"]
  );
  assert.equal(getNextMatchState(matches, new Date(2026, 7, 6, 9)).match?.id, "game-3");
  assert.deepEqual(
    getTodaySlate({ matches, match: matches[2], now: new Date(2026, 7, 6, 9) })
      .map((item) => item.match.id),
    ["game-1", "game-3"]
  );
  assert.equal(
    hasDuplicateMatchNumber({
      matches,
      matchDate: "2026-08-06",
      matchNumber: 2,
      currentMatchId: "new-match"
    }),
    false
  );
});

test("remaining unplayed same-day game numbers are compacted without changing stable ids", () => {
  const matches = [
    matchRecord({
      id: "final-1",
      matchDate: "2026-08-06",
      matchNumber: 1,
      status: "finalised"
    }),
    matchRecord({
      id: "final-2",
      matchDate: "2026-08-06",
      matchNumber: 2,
      status: "finalised"
    }),
    matchRecord({
      id: "deleted-3",
      matchDate: "2026-08-06",
      matchNumber: 3,
      status: "draft",
      deletedAt: "2026-08-06T10:00:00.000Z"
    }),
    matchRecord({
      id: "draft-4",
      matchDate: "2026-08-06",
      matchNumber: 4,
      status: "draft"
    }),
    matchRecord({
      id: "draft-5",
      matchDate: "2026-08-06",
      matchNumber: 5,
      status: "draft"
    })
  ];
  const compacted = compactSameDayUnplayedMatchNumbers(matches, "2026-08-06");

  assert.deepEqual(
    compacted.map((match) => match.id),
    ["final-1", "final-2", "deleted-3", "draft-4", "draft-5"]
  );
  assert.equal(compacted.find((match) => match.id === "final-1")?.matchNumber, 1);
  assert.equal(compacted.find((match) => match.id === "final-2")?.matchNumber, 2);
  assert.equal(compacted.find((match) => match.id === "draft-4")?.matchNumber, 3);
  assert.equal(compacted.find((match) => match.id === "draft-5")?.matchNumber, 4);
});

test("Next Match excludes finalised cancelled abandoned and stale Draft matches", () => {
  const state = getNextMatchState(
    [
      matchRecord({ id: "final", matchDate: "2026-08-09" }),
      matchRecord({ id: "cancelled", matchDate: "2026-08-10", status: "cancelled" }),
      matchRecord({ id: "abandoned", matchDate: "2026-08-11", status: "abandoned" }),
      matchRecord({ id: "stale-draft", matchDate: "2026-08-04", status: "draft" })
    ],
    new Date(2026, 7, 6, 9)
  );

  assert.equal(state.type, "empty");
  assert.equal(state.match, null);
  assert.equal(getNextMatchAction(state).href, "/matches/new");
  assert.equal(getNextMatchAction(state).label, "CREATE A MATCH TO BEGIN \u2192");
});

test("Next Match formats schedule date countdown and optional start time safely", () => {
  const timedMatch = matchRecord({
    id: "timed",
    matchDate: "2026-08-15",
    startTime: "10:00",
    status: "draft"
  });
  const untimedMatch = matchRecord({
    id: "untimed",
    matchDate: "2026-08-15",
    status: "draft"
  });

  assert.equal(formatNextMatchDateLine(timedMatch, "scheduled"), "SAT \u2022 15 AUG \u2022 10:00");
  assert.equal(formatNextMatchDateLine(untimedMatch, "scheduled"), "SAT \u2022 15 AUG");
  assert.equal(
    getNextMatchCountdownLabel(timedMatch, new Date(2026, 7, 14, 8)),
    "TOMORROW"
  );
  assert.equal(
    getNextMatchCountdownLabel(timedMatch, new Date(2026, 7, 12, 8)),
    "IN 3 DAYS"
  );
  assert.equal(
    getNextMatchCountdownLabel(timedMatch, new Date(2026, 7, 16, 8)),
    null
  );
});

test("Next Match team counts include a shared player in both sides but unique attendance once", () => {
  const match = {
    ...matchRecord({ id: "shared", matchDate: "2026-08-15", status: "draft" }),
    sharedPlayerId: "biplab",
    teams: {
      teamA: {
        ...matchRecord({ id: "shared-a", matchDate: "2026-08-15" }).teams.teamA,
        playerIds: ["aninda", "biplab"]
      },
      teamB: {
        ...matchRecord({ id: "shared-b", matchDate: "2026-08-15" }).teams.teamB,
        playerIds: ["arunabha", "biplab"]
      }
    }
  };

  assert.equal(hasAssignedTeams(match), true);
  assert.equal(getTeamPlayerCount(match, "teamA"), 2);
  assert.equal(getTeamPlayerCount(match, "teamB"), 2);
  assert.equal(getUniqueAttendanceCount(match), 3);
});

test("Next Match actions use existing match routes and line-up pending route labels", () => {
  const readyMatch = matchRecord({
    id: "ready",
    matchDate: "2026-08-15",
    status: "draft"
  });
  const pendingMatch = {
    ...readyMatch,
    id: "pending",
    teams: {
      teamA: { ...readyMatch.teams.teamA, playerIds: [] },
      teamB: { ...readyMatch.teams.teamB, playerIds: [] }
    }
  };

  assert.deepEqual(
    getNextMatchAction({ type: "scheduled", match: readyMatch }),
    {
      href: "/matches/ready",
      label: "MANAGE MATCH \u2192"
    }
  );
  assert.deepEqual(
    getNextMatchAction({ type: "scheduled", match: pendingMatch }),
    {
      href: "/matches/pending",
      label: "PREPARE MATCH \u2192"
    }
  );
});

test("Next Battle includes scheduled Drafts with incomplete setup", () => {
  const scheduleOnlyDraft = {
    ...matchRecord({
      id: "schedule-only",
      matchDate: "2026-08-15",
      status: "draft"
    }),
    battingFirstTeamId: null,
    chasingTeamId: null,
    scheduledOversPerInnings: null,
    teams: {
      teamA: {
        ...matchRecord({ id: "empty-a", matchDate: "2026-08-15" }).teams.teamA,
        playerIds: []
      },
      teamB: {
        ...matchRecord({ id: "empty-b", matchDate: "2026-08-15" }).teams.teamB,
        playerIds: []
      }
    }
  };
  const teamsWithoutBattingFirst = {
    ...matchRecord({
      id: "setup-incomplete",
      matchDate: "2026-08-16",
      status: "draft"
    }),
    battingFirstTeamId: null,
    chasingTeamId: null
  };

  const state = getNextMatchState(
    [scheduleOnlyDraft, teamsWithoutBattingFirst],
    new Date(2026, 7, 6, 9)
  );

  assert.equal(state.type, "scheduled");
  assert.equal(state.match?.id, "schedule-only");
  assert.equal(getDraftMatchSetupState(scheduleOnlyDraft), "lineup-pending");
  assert.equal(getDraftMatchSetupState(teamsWithoutBattingFirst), "setup-incomplete");
});

test("Next Battle advances through a multi-match day by game number", () => {
  const game1 = matchRecord({
    id: "game-1",
    matchDate: "2026-08-06",
    matchNumber: 1
  });
  const game2Live = matchRecord({
    id: "game-2",
    matchDate: "2026-08-06",
    matchNumber: 2,
    status: "in_progress"
  });
  const game2Finalised = {
    ...game2Live,
    status: "finalised" as const
  };
  const game3 = matchRecord({
    id: "game-3",
    matchDate: "2026-08-06",
    matchNumber: 3,
    status: "draft"
  });
  const game4 = matchRecord({
    id: "game-4",
    matchDate: "2026-08-06",
    matchNumber: 4,
    status: "draft"
  });
  const liveState = getNextMatchState(
    [game1, game2Live, game3, game4],
    new Date(2026, 7, 6, 9)
  );
  const afterFinaliseState = getNextMatchState(
    [game1, game2Finalised, game3, game4],
    new Date(2026, 7, 6, 9)
  );

  assert.equal(liveState.type, "live");
  assert.equal(liveState.match?.id, "game-2");
  assert.equal(afterFinaliseState.type, "match-day");
  assert.equal(afterFinaliseState.match?.id, "game-3");
  assert.equal(
    getMatchPositionLabel({ matches: [game1, game2Live, game3, game4], match: game2Live }),
    "GAME 2 OF 4"
  );
});

test("Today slate marks finalised live next and later fixtures compactly", () => {
  const fixtures = [
    matchRecord({ id: "game-1", matchDate: "2026-08-06", matchNumber: 1 }),
    matchRecord({
      id: "game-2",
      matchDate: "2026-08-06",
      matchNumber: 2,
      status: "in_progress"
    }),
    matchRecord({
      id: "game-3",
      matchDate: "2026-08-06",
      matchNumber: 3,
      status: "draft"
    }),
    matchRecord({
      id: "game-4",
      matchDate: "2026-08-06",
      matchNumber: 4,
      status: "draft"
    })
  ];

  assert.deepEqual(
    getTodaySlate({
      matches: fixtures,
      match: fixtures[1],
      now: new Date(2026, 7, 6, 9)
    }).map((item) => `${item.label}:${item.status}`),
    ["1:done", "2:live", "3:later", "4:later"]
  );
});

test("only one match can be in progress at a time", () => {
  const liveMatch = matchRecord({
    id: "live",
    matchDate: "2026-08-06",
    status: "in_progress"
  });
  const nextMatch = matchRecord({
    id: "next",
    matchDate: "2026-08-06",
    status: "draft"
  });

  assert.equal(getLiveMatchConflict([liveMatch, nextMatch], "next")?.id, "live");
  assert.equal(getLiveMatchConflict([liveMatch, nextMatch], "live"), null);
});

test("Next Match live summary uses official innings snapshots", () => {
  const firstOnly = {
    ...matchRecord({ id: "live-score", matchDate: "2026-08-06", status: "in_progress" }),
    innings: {
      ...matchRecord({ id: "live-score", matchDate: "2026-08-06" }).innings,
      first: {
        ...matchRecord({ id: "live-score", matchDate: "2026-08-06" }).innings.first,
        runs: 21,
        wicketsLost: 2,
        completedOvers: 3
      },
      second: {
        ...matchRecord({ id: "live-score", matchDate: "2026-08-06" }).innings.second,
        runs: 0,
        wicketsLost: 0,
        completedOvers: 0
      }
    }
  };
  const chaseStarted = {
    ...firstOnly,
    innings: {
      ...firstOnly.innings,
      second: {
        ...firstOnly.innings.second,
        runs: 16,
        wicketsLost: 1,
        completedOvers: 2
      }
    }
  };

  assert.deepEqual(
    getLiveNextMatchTeamSummaries(firstOnly).map((team) => ({
      teamName: team.teamName,
      score: team.score,
      detail: team.detail
    })),
    [
      { teamName: "Team A", score: "21/2", detail: "3.0 OVERS COMPLETED" },
      { teamName: "Team B", score: "YET TO BAT", detail: "" }
    ]
  );
  assert.deepEqual(
    getLiveNextMatchTeamSummaries(chaseStarted).map((team) => team.score),
    ["21/2", "16/1"]
  );
});

test("Finalising a Draft removes it from Next Match and moves it to Recent Matches", () => {
  const draft = matchRecord({
    id: "workflow",
    matchDate: "2026-08-15",
    status: "draft"
  });
  const finalised = {
    ...draft,
    status: "finalised" as const
  };

  assert.equal(getNextMatchState([draft], new Date(2026, 7, 6)).match?.id, "workflow");
  assert.equal(getNextMatchState([finalised], new Date(2026, 7, 6)).type, "empty");
  assert.deepEqual(
    getDashboardSummary({ matches: [finalised], players: activePlayers })
      .recentFinalisedMatches.map((match) => match.id),
    ["workflow"]
  );
  assert.equal(
    getDashboardSummary({ matches: [draft], players: activePlayers })
      .totalFinalisedMatches,
    0
  );
});

test("Next Match ticket removes close control and uses shared repository data", () => {
  const hero = heroSectionSource();
  const ticket = nextMatchTicketSource();
  const form = matchFormSource();
  const css = cssSource();

  assert.match(hero, /useDashboardSummary\(activePlayers\)/);
  assert.match(hero, /<NextMatchTicket matches=\{resolvedMatches/);
  assert.match(ticket, /getNextMatchState\(matches\)/);
  assert.match(ticket, /NO MATCH SCHEDULED/);
  assert.match(ticket, /LINE-UP PENDING/);
  assert.match(ticket, /TicketAction/);
  assert.match(ticket, /<TicketActions primaryHref=\{action\.href\} primaryLabel=\{action\.label\}/);
  assert.match(ticket, /TodaySlate/);
  assert.match(ticket, /FixtureOverflowMenu/);
  assert.match(ticket, /RescheduleDialog/);
  assert.match(ticket, /DeleteMatchDialog/);
  assert.match(ticket, /More actions for/);
  assert.match(ticket, /Reschedule Match/);
  assert.match(ticket, /DELETE SCHEDULED MATCH\?/);
  assert.match(ticket, /deleteSupabaseAdminDraftMatch/);
  assert.match(ticket, /saveSupabaseAdminMatch/);
  assert.match(ticket, /localMatchRepository\.deleteScheduledMatch\(match\.id\)/);
  assert.match(ticket, /next-battle-team-crest--a/);
  assert.match(ticket, /next-battle-team-crest--b/);
  assert.doesNotMatch(ticket + hero, /Dismiss next match preview|<X\b|from "lucide-react";[\s\S]*\bX\b/);
  assert.doesNotMatch(ticket, /FINALISED/);
  assert.match(form, /persistNonFinalisedMatch/);
  assert.match(form, /saveSupabaseAdminMatch/);
  assert.match(hero, /href="\/matches\/new"/);
  assert.match(hero, /Create Match/);
  assert.match(css, /\.next-match-ticket/);
  assert.match(css, /\.next-match-overflow-button/);
  assert.match(css, /\.next-match-overflow-delete/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.next-match-teams/);
});

test("Matches page keeps scheduled fixtures separate from archive", () => {
  const page = matchesPageSource();
  const fixtures = todayFixturesSource();

  assert.match(page, /loadPublicSupabaseReadData/);
  assert.match(page, /<TodayFixtures dateFilter=\{params\?\.date\} matches=\{matches\}/);
  assert.match(page, /<MatchArchive finalisedMatches=\{finalisedMatches\}/);
  assert.match(fixtures, /Today&apos;s Fixtures/);
  assert.match(fixtures, /getDraftMatchSetupState/);
  assert.match(fixtures, /getSameDayFixtures/);
  assert.match(fixtures, /return "LIVE"/);
  assert.match(fixtures, /today-fixtures-empty/);
  assert.match(fixtures, /href=\{`\/matches\/\$\{match\.id\}`\}/);
});

test("Next Battle crest CSS keeps equal dimensions and distinct variants", () => {
  const css = cssSource();

  assert.match(css, /\.next-battle-team-crest\s*{[\s\S]*?width:\s*60px/);
  assert.match(css, /\.next-battle-team-crest\s*{[\s\S]*?height:\s*60px/);
  assert.match(css, /\.next-battle-team-crest--b\s*{/);
  assert.match(css, /--crest-shield-start:\s*#53dcff/);
  assert.match(css, /--crest-shield-start:\s*#ffb52c/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.next-battle-team-crest\s*{[\s\S]*?width:\s*50px/);
});

test("Recent Matches uses separated artwork layout and links to the archive", () => {
  const recent = recentMatchesSource();
  const css = cssSource();

  assert.match(recent, /className="recent-matches-content mt-4"/);
  assert.match(recent, /className="recent-matches-panel p-4"/);
  assert.doesNotMatch(recent, /min-h-52|h-full/);
  assert.match(recent, /className="recent-match-list grid gap-2/);
  assert.match(recent, /className="recent-match-artwork"/);
  assert.match(recent, /src="\/ui\/recent-matches-wicket-ball\.png"/);
  assert.match(recent, /fill/);
  assert.match(recent, /sizes="210px"/);
  assert.match(recent, /quality=\{100\}/);
  assert.match(recent, /href="\/matches"/);
  assert.match(css, /\.recent-matches-content\s*{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*210px/);
  assert.match(css, /\.recent-matches-content\s*{[\s\S]*?gap:\s*26px/);
  assert.match(css, /\.recent-match-artwork\s*{[\s\S]*?width:\s*210px/);
  assert.match(css, /\.recent-match-artwork\s*{[\s\S]*?height:\s*220px/);
  assert.match(css, /\.recent-match-artwork\s*{[\s\S]*?overflow:\s*hidden/);
  assert.match(css, /\.recent-match-artwork-image\s*{[\s\S]*?transform:\s*scale\(1\.45\)/);
  assert.doesNotMatch(recent, /absolute bottom-2 right-2/);
});

test("Scorecard innings use batting order, batting rows and cricket dismissal text", () => {
  const match = richScorecardMatch();
  const [firstInnings, secondInnings] = getOrderedInnings(match);
  const resolvePlayerName = (playerId: string) =>
    getPlayerById(playerId)?.name ?? playerId;
  const firstScorecard = buildScorecardInnings(match, firstInnings, resolvePlayerName);
  const secondScorecard = buildScorecardInnings(match, secondInnings, resolvePlayerName);

  assert.equal(firstScorecard.teamName, "Team A");
  assert.equal(secondScorecard.teamName, "Team B");
  assert.deepEqual(
    firstScorecard.battingRows.map((row) => row.batter),
    ["Aninda", "Atripan", "Dipanjan", "Biplab"]
  );
  assert.equal(firstScorecard.battingRows[0].dismissal, "c Soman b Arunabha");
  assert.equal(firstScorecard.battingRows[1].dismissal, "not out");
  assert.equal(firstScorecard.battingRows[3].dismissal, "did not bat");
  assert.equal(firstScorecard.battingRows[3].runs, "-");
  assert.equal(secondScorecard.battingRows[0].dismissal, "run out (Dipanjan)");
});

test("Scorecard totals and bowling figures are derived from finalised innings snapshots", () => {
  const match = richScorecardMatch();
  const resolvePlayerName = (playerId: string) =>
    getPlayerById(playerId)?.name ?? playerId;
  const firstScorecard = buildScorecardInnings(
    match,
    match.innings.first,
    resolvePlayerName
  );
  const secondScorecard = buildScorecardInnings(
    match,
    match.innings.second,
    resolvePlayerName
  );
  const arunabhaFigures = firstScorecard.bowlingFigures[0];
  const anindaFigures = secondScorecard.bowlingFigures[0];

  assert.equal(firstScorecard.extras, 4);
  assert.equal(firstScorecard.total, getMatchTeamScore(match, "teamA"));
  assert.equal(firstScorecard.bowlingTeamName, "Team B");
  assert.equal(arunabhaFigures.bowler, "Arunabha");
  assert.equal(arunabhaFigures.overs, "2.0");
  assert.equal(arunabhaFigures.runsConceded, 25);
  assert.equal(arunabhaFigures.wickets, 2);
  assert.equal(arunabhaFigures.economy, "12.5");
  assert.equal(formatOneDecimal(8), "8.0");
  assert.equal(secondScorecard.bowlingTeamName, "Team A");
  assert.equal(anindaFigures.wickets, 0);
});

test("Scorecard Player of the Match uses stored XP and omits zero contributions", () => {
  const match = richScorecardMatch();
  const playerOfMatch = buildPlayerOfMatchSummary(match, getPlayerById);

  assert.equal(playerOfMatch?.name, "Aninda");
  assert.equal(playerOfMatch?.xpAwarded, 50);
  assert.deepEqual(playerOfMatch?.contributions, ["15 runs"]);
});

test("finalised scorecards resolve renamed players from stable ids at display time", () => {
  const jogi = finalisedPerformance({
    playerId: "jogindar",
    teamId: "teamA",
    played: true,
    didBat: true,
    runs: 14,
    wasOut: true,
    wickets: 0,
    catches: 0,
    runOuts: 0,
    hatTricks: 0,
    playerOfMatch: false
  });
  const naeem = finalisedPerformance({
    playerId: "naim",
    teamId: "teamB",
    played: true,
    didBat: true,
    runs: 22,
    wasOut: false,
    wickets: 1,
    catches: 1,
    runOuts: 0,
    hatTricks: 0,
    playerOfMatch: true
  });
  naeem.xpBreakdown = xpBreakdown(38);
  const match: MatchRecord = {
    ...matchRecord({ id: "historical-name-resolution", matchDate: "2026-08-12" }),
    teams: {
      teamA: {
        teamId: "teamA",
        teamName: "Team A",
        playerIds: ["jogindar", "amrit"],
        playerPerformances: [jogi],
        bowlingOvers: [],
        totalRuns: 14,
        completedBowlingOvers: 1
      },
      teamB: {
        teamId: "teamB",
        teamName: "Team B",
        playerIds: ["naim", "saurav"],
        playerPerformances: [naeem],
        bowlingOvers: [],
        totalRuns: 22,
        completedBowlingOvers: 1
      }
    },
    innings: {
      first: {
        battingTeamId: "teamA",
        bowlingTeamId: "teamB",
        runs: 14,
        wicketsLost: 1,
        extras: 0,
        playerCount: 2,
        completedOvers: 1,
        battingPerformances: [jogi],
        bowlingOvers: [
          {
            id: "team-b-over-1",
            bowlingTeamId: "teamB",
            battingTeamId: "teamA",
            bowlerId: "naim",
            overNumber: 1,
            runsConceded: 14,
            wicketsTaken: 1,
            maiden: false,
            dismissals: [
              {
                id: "jogi-dismissal",
                overId: "team-b-over-1",
                battingTeamId: "teamA",
                bowlingTeamId: "teamB",
                dismissedBatterId: "jogindar",
                type: "caught",
                creditedBowlerId: "naim",
                fielderId: "naim"
              }
            ]
          }
        ]
      },
      second: {
        battingTeamId: "teamB",
        bowlingTeamId: "teamA",
        runs: 22,
        wicketsLost: 0,
        extras: 0,
        playerCount: 2,
        completedOvers: 1,
        battingPerformances: [naeem],
        bowlingOvers: []
      }
    },
    finalisedPlayerRecords: [jogi, naeem]
  };
  const resolvePlayerName = (playerId: string) => getPlayerById(playerId)?.name ?? playerId;
  const firstScorecard = buildScorecardInnings(match, match.innings.first, resolvePlayerName);
  const secondScorecard = buildScorecardInnings(match, match.innings.second, resolvePlayerName);
  const playerOfMatch = buildPlayerOfMatchSummary(match, getPlayerById);

  assert.equal(firstScorecard.battingRows[0]?.playerId, "jogindar");
  assert.equal(firstScorecard.battingRows[0]?.batter, "Jogi");
  assert.equal(firstScorecard.battingRows[0]?.dismissal, "c Naeem b Naeem");
  assert.equal(firstScorecard.bowlingFigures[0]?.playerId, "naim");
  assert.equal(firstScorecard.bowlingFigures[0]?.bowler, "Naeem");
  assert.equal(secondScorecard.battingRows[0]?.playerId, "naim");
  assert.equal(secondScorecard.battingRows[0]?.batter, "Naeem");
  assert.equal(playerOfMatch?.playerId, "naim");
  assert.equal(playerOfMatch?.name, "Naeem");
  assert.equal(playerOfMatch?.xpAwarded, 38);
  assert.equal(firstScorecard.score, "14/1");
  assert.equal(secondScorecard.score, "22/0");
  assert.equal(match.teams.teamA.playerIds[0], "jogindar");
  assert.equal(match.teams.teamB.playerIds[0], "naim");
  assert.equal(jogi.runs, 14);
  assert.equal(naeem.wickets, 1);
});

test("match archive search resolves renamed historical player ids from current metadata", () => {
  const match: MatchRecord = {
    ...matchRecord({ id: "archive-name-resolution", matchDate: "2026-08-13" }),
    matchName: "Archive Name Resolution",
    teams: {
      ...matchRecord({ id: "archive-base", matchDate: "2026-08-13" }).teams,
      teamA: {
        ...matchRecord({ id: "archive-a", matchDate: "2026-08-13" }).teams.teamA,
        playerIds: ["jogindar"],
        playerPerformances: [
          finalisedPerformance({
            playerId: "jogindar",
            teamId: "teamA",
            played: true,
            playerOfMatch: false,
            didBat: true,
            runs: 8,
            wasOut: false,
            wickets: 0,
            hatTricks: 0,
            catches: 0,
            runOuts: 0
          })
        ]
      },
      teamB: {
        ...matchRecord({ id: "archive-b", matchDate: "2026-08-13" }).teams.teamB,
        playerIds: ["naim"],
        playerPerformances: [
          finalisedPerformance({
            playerId: "naim",
            teamId: "teamB",
            played: true,
            playerOfMatch: true,
            didBat: true,
            runs: 18,
            wasOut: false,
            wickets: 0,
            hatTricks: 0,
            catches: 0,
            runOuts: 0
          })
        ]
      }
    },
    finalisedPlayerRecords: [
      finalisedPerformance({
        playerId: "naim",
        teamId: "teamB",
        played: true,
        playerOfMatch: true,
        didBat: true,
        runs: 18,
        wasOut: false,
        wickets: 0,
        hatTricks: 0,
        catches: 0,
        runOuts: 0
      })
    ]
  };
  const searchText = getArchiveMatchSearchText(match);

  assert.match(searchText, /jogi/);
  assert.match(searchText, /naeem/);
  assert.doesNotMatch(searchText, /jogindar/);
});

test("Shared Player of the Match appears once with combined saved contributions", () => {
  const match = richScorecardMatch();
  const biplabTeamA = finalisedPerformance({
    playerId: "biplab",
    teamId: "teamA",
    representingTeamId: "teamA",
    played: true,
    playerOfMatch: true,
    didBat: true,
    runs: 7,
    wasOut: false,
    wickets: 0,
    hatTricks: 0,
    catches: 0,
    runOuts: 0
  });
  const biplabTeamB = finalisedPerformance({
    playerId: "biplab",
    teamId: "teamB",
    representingTeamId: "teamB",
    played: true,
    playerOfMatch: true,
    didBat: true,
    runs: 5,
    wasOut: false,
    wickets: 1,
    hatTricks: 0,
    catches: 1,
    runOuts: 0
  });
  const aggregateBiplab = {
    ...biplabTeamA,
    teamId: "teamA" as const,
    representingTeamId: "teamA" as const,
    runs: 12,
    wickets: 1,
    catches: 1,
    xpBreakdown: xpBreakdown(44)
  };

  match.teams.teamA.playerPerformances = [biplabTeamA];
  match.teams.teamB.playerPerformances = [biplabTeamB];
  match.finalisedPlayerRecords = [aggregateBiplab];

  const playerOfMatch = buildPlayerOfMatchSummary(match, getPlayerById);

  assert.equal(playerOfMatch?.name, "Biplab");
  assert.equal(playerOfMatch?.teamLabel, "Shared Player");
  assert.equal(playerOfMatch?.xpAwarded, 44);
  assert.deepEqual(playerOfMatch?.contributions, [
    "12 runs",
    "1 wicket",
    "1 catch"
  ]);
});

test("Scorecard page renders read-only cricket tables and no editing controls", () => {
  const scorecard = matchScorecardSource();
  const css = cssSource();
  const playerOfMatchImageRule =
    css.match(/\.player-of-match-card-image\s*{[^}]*}/)?.[0] ?? "";

  assert.match(scorecard, /ScorecardInningsSection/);
  assert.match(scorecard, /Player of the Match/);
  assert.match(scorecard, /className="player-of-match-card-artwork"/);
  assert.match(scorecard, /className="player-of-match-card-image"/);
  assert.match(scorecard, /fill/);
  assert.match(scorecard, /sizes="180px"/);
  assert.match(css, /\.player-of-match-card-artwork\s*{[\s\S]*?aspect-ratio:\s*2\s*\/\s*3/);
  assert.match(css, /\.player-of-match-card-artwork\s*{[\s\S]*?overflow:\s*visible/);
  assert.match(css, /\.player-of-match-card-image\s*{[\s\S]*?object-fit:\s*contain/);
  assert.doesNotMatch(playerOfMatchImageRule, /transform|object-fit:\s*cover/);
  assert.match(scorecard, /<th>Batter<\/th>/);
  assert.match(scorecard, /<th>Dismissal<\/th>/);
  assert.match(scorecard, /<th>Runs<\/th>/);
  assert.match(scorecard, /<th>Bowler<\/th>/);
  assert.match(scorecard, /<th>O<\/th>/);
  assert.match(scorecard, /<th>M<\/th>/);
  assert.match(scorecard, /<th>R<\/th>/);
  assert.match(scorecard, /<th>W<\/th>/);
  assert.match(scorecard, /<th>ECO<\/th>/);
  assert.doesNotMatch(
    scorecard,
    /type="number"|type="checkbox"|Add Over|Save Draft|Finalise Match|Reset/
  );
});

test("Dashboard Recent Matches is capped at the latest finalised archive match", () => {
  const summary = getDashboardSummary({
    matches: [
      matchRecord({ id: "one", matchDate: "2026-08-01" }),
      matchRecord({ id: "two", matchDate: "2026-08-02" }),
      matchRecord({ id: "three", matchDate: "2026-08-03" }),
      matchRecord({ id: "four", matchDate: "2026-08-04" }),
      matchRecord({ id: "draft-newer", matchDate: "2026-08-06", status: "draft" }),
      matchRecord({ id: "live-newer", matchDate: "2026-08-07", status: "in_progress" })
    ],
    players: activePlayers
  });

  assert.deepEqual(
    summary.recentFinalisedMatches.map((match) => match.id),
    ["four"]
  );
});

test("Dashboard Recent Matches selects latest finalised match by date and game number", () => {
  const summary = getDashboardSummary({
    matches: [
      matchRecord({
        id: "older-but-finalised-last",
        matchDate: "2026-08-01",
        matchNumber: 3,
        progressionAppliedAt: "2026-08-12T19:00:00.000Z"
      }),
      matchRecord({ id: "same-day-game-one", matchDate: "2026-08-10", matchNumber: 1 }),
      matchRecord({ id: "same-day-game-two", matchDate: "2026-08-10", matchNumber: 2 }),
      matchRecord({ id: "draft-newer", matchDate: "2026-08-11", matchNumber: 1, status: "draft" }),
      matchRecord({
        id: "live-newer",
        matchDate: "2026-08-11",
        matchNumber: 2,
        status: "in_progress"
      }),
      matchRecord({
        id: "deleted-newer",
        matchDate: "2026-08-12",
        matchNumber: 1,
        deletedAt: "2026-08-12T08:00:00.000Z"
      })
    ],
    players: activePlayers
  });

  assert.deepEqual(
    summary.recentFinalisedMatches.map((match) => match.id),
    ["same-day-game-two"]
  );
});

test("Dashboard Recent Matches handles zero one and multiple finalised matches", () => {
  assert.equal(
    getDashboardSummary({ matches: [], players: activePlayers }).recentFinalisedMatches
      .length,
    0
  );
  assert.deepEqual(
    getDashboardSummary({
      matches: [matchRecord({ id: "only", matchDate: "2026-08-05" })],
      players: activePlayers
    }).recentFinalisedMatches.map((match) => match.id),
    ["only"]
  );
  assert.deepEqual(
    getDashboardSummary({
      matches: [
        matchRecord({ id: "older", matchDate: "2026-08-05" }),
        matchRecord({ id: "newer", matchDate: "2026-08-06" })
      ],
      players: activePlayers
    }).recentFinalisedMatches.map((match) => match.id),
    ["newer"]
  );
});

test("Matches Archive paginates finalised data while Dashboard count stays complete", () => {
  const matches = [
    matchRecord({ id: "one", matchDate: "2026-08-01" }),
    matchRecord({ id: "two", matchDate: "2026-08-02" }),
    matchRecord({ id: "three", matchDate: "2026-08-03" }),
    matchRecord({ id: "four", matchDate: "2026-08-04" }),
    matchRecord({ id: "five", matchDate: "2026-08-05" }),
    matchRecord({ id: "six", matchDate: "2026-08-06" }),
    matchRecord({ id: "seven", matchDate: "2026-08-07" }),
    matchRecord({ id: "draft", matchDate: "2026-08-08", status: "draft" })
  ];
  const archiveMatches = getFinalisedMatches(matches);
  const sortedArchive = sortArchivedMatches(
    filterArchivedMatches(archiveMatches, normaliseArchiveQuery({})),
    "newest"
  );
  const pageOne = getPaginatedArchiveMatches(sortedArchive, 1);
  const pageTwo = getPaginatedArchiveMatches(sortedArchive, 2);
  const dashboardSummary = getDashboardSummary({ matches, players: activePlayers });

  assert.deepEqual(
    pageOne.pageMatches.map((match) => match.id),
    ["seven", "six", "five", "four", "three", "two"]
  );
  assert.deepEqual(
    pageTwo.pageMatches.map((match) => match.id),
    ["one"]
  );
  assert.deepEqual(
    dashboardSummary.recentFinalisedMatches.map((match) => match.id),
    ["seven"]
  );
  assert.equal(MATCH_ARCHIVE_PAGE_SIZE, 6);
  assert.equal(pageOne.pageMatches.length, 6);
  assert.equal(archiveMatches.length, 7);
  assert.equal(dashboardSummary.totalFinalisedMatches, 7);
  assert.equal(dashboardSummary.recentFinalisedMatches.length, 1);
});

test("Matches archive uses repository data and removes stale development copy", () => {
  const page = matchesPageSource();
  const archive = matchArchiveSource();

  assert.match(page, /loadPublicSupabaseReadData/);
  assert.match(page, /<MatchArchive finalisedMatches=\{finalisedMatches\}/);
  assert.match(archive, /useMatchRepository/);
  assert.match(archive, /finalisedMatches\.length === 0/);
  assert.match(archive, /NO MATCHES IN THE ARCHIVE/);
  assert.match(archive, /Finalise the first Gully Legends match to begin the match archive\./);
  assert.match(archive, /normaliseArchiveQuery/);
  assert.match(archive, /getPaginatedArchiveMatches/);
  assert.match(archive, /groupArchiveMatchesByDate/);
  assert.match(archive, /returnTo=\$\{encodeURIComponent\(returnTo\)\}/);
  assert.match(archive, /View Scorecard/);
  assert.doesNotMatch(page + archive, /database and finalisation workflow|later phases|mock|sample/i);
});

test("Archive and Recent Matches use identical score and result helpers", () => {
  const match = matchRecord({ id: "score", matchDate: "2026-08-05" });
  const recent = recentMatchesSource();
  const archive = matchArchiveSource();

  assert.equal(getMatchTeamScore(match, "teamA"), "20/2");
  assert.equal(getMatchTeamScore(match, "teamB"), "12/1");
  assert.equal(getMatchResultHeadline(match), "TEAM A WINS BY 8 RUNS");
  assert.match(recent, /getMatchTeamScore\(match, "teamA"\)/);
  assert.match(recent, /getMatchResultHeadline\(match\)/);
  assert.match(archive, /getMatchTeamScore\(match, "teamA"\)/);
  assert.match(archive, /getMatchResultHeadline\(match\)/);
});

test("Match archive filters search sorts and groups finalised matches", () => {
  const teamBWin = {
    ...matchRecord({
      id: "team-b",
      matchDate: "2026-09-02",
      matchNumber: 2
    }),
    matchName: "Night Premier",
    venue: "CZU Gully Arena",
    teams: {
      ...matchRecord({ id: "team-b-base", matchDate: "2026-09-02" }).teams,
      teamA: {
        ...matchRecord({ id: "team-b-a", matchDate: "2026-09-02" }).teams.teamA,
        teamName: "Prague Strikers"
      },
      teamB: {
        ...matchRecord({ id: "team-b-b", matchDate: "2026-09-02" }).teams.teamB,
        teamName: "Gully Warriors"
      }
    },
    result: {
      type: "win_by_wickets" as const,
      winnerTeamId: "teamB" as const,
      loserTeamId: "teamA" as const,
      wicketsRemaining: 2
    }
  };
  const teamAWin = matchRecord({
    id: "team-a",
    matchDate: "2026-08-01",
    matchNumber: 1
  });
  const sameDayGameThree = {
    ...matchRecord({
      id: "same-day-game-three",
      matchDate: "2026-08-01",
      matchNumber: 3
    }),
    matchName: "Gully Premier League",
    teams: {
      ...matchRecord({ id: "same-day-base", matchDate: "2026-08-01" }).teams,
      teamA: {
        ...matchRecord({ id: "same-day-a", matchDate: "2026-08-01" }).teams.teamA,
        playerIds: ["dipanjan", "saurav"],
        teamName: "Team A"
      },
      teamB: {
        ...matchRecord({ id: "same-day-b", matchDate: "2026-08-01" }).teams.teamB,
        playerIds: ["biplab"],
        teamName: "Team B"
      }
    },
    finalisedPlayerRecords: [
      finalisedPerformance({
        playerId: "dipanjan",
        teamId: "teamA",
        played: true,
        playerOfMatch: false,
        didBat: true,
        runs: 18,
        wasOut: false,
        wickets: 0,
        hatTricks: 0,
        catches: 0,
        runOuts: 0
      })
    ]
  };
  const olderNoGameNumber = matchRecord({
    id: "older-no-game",
    matchDate: "2026-07-20",
    matchNumber: null
  });
  const tie = {
    ...matchRecord({
      id: "tie",
      matchDate: "2027-08-03",
      resultType: "tie"
    }),
    matchName: "Memory Tie"
  };
  const draft = matchRecord({
    id: "draft",
    matchDate: "2026-08-04",
    status: "draft"
  });
  const matches = [teamBWin, teamAWin, sameDayGameThree, olderNoGameNumber, tie, draft];

  assert.deepEqual(getAvailableArchiveYears(matches), [2027, 2026]);
  assert.deepEqual(
    filterArchivedMatches(
      matches,
      normaliseArchiveQuery({ month: "8", year: "2026" })
    ).map((match) => match.id),
    ["team-a", "same-day-game-three"]
  );
  assert.deepEqual(
    filterArchivedMatches(
      matches,
      normaliseArchiveQuery({ date: "2026-08-01" })
    ).map((match) => match.id),
    ["team-a", "same-day-game-three"]
  );
  assert.deepEqual(
    filterArchivedMatches(
      matches,
      normaliseArchiveQuery({ date: "2026-08-01", q: "Saurav" })
    ).map((match) => match.id),
    ["same-day-game-three"]
  );
  assert.deepEqual(
    filterArchivedMatches(matches, normaliseArchiveQuery({ q: "warriors" })).map(
      (match) => match.id
    ),
    ["team-b"]
  );
  assert.deepEqual(
    filterArchivedMatches(matches, normaliseArchiveQuery({ q: "PREMIER" })).map(
      (match) => match.id
    ),
    ["team-b", "same-day-game-three"]
  );
  assert.deepEqual(
    filterArchivedMatches(matches, normaliseArchiveQuery({ q: "Dipanjan" })).map(
      (match) => match.id
    ),
    ["same-day-game-three"]
  );
  assert.deepEqual(
    filterArchivedMatches(matches, normaliseArchiveQuery({ q: "CZU" })).map(
      (match) => match.id
    ),
    ["team-b", "team-a", "same-day-game-three", "older-no-game", "tie"]
  );
  assert.deepEqual(
    filterArchivedMatches(matches, normaliseArchiveQuery({ q: "Game 3" })).map(
      (match) => match.id
    ),
    ["same-day-game-three"]
  );
  assert.deepEqual(
    filterArchivedMatches(matches, normaliseArchiveQuery({ q: "1 August" })).map(
      (match) => match.id
    ),
    ["team-a", "same-day-game-three"]
  );
  assert.deepEqual(
    filterArchivedMatches(matches, normaliseArchiveQuery({ q: "Team A wins" })).map(
      (match) => match.id
    ),
    ["team-a", "same-day-game-three", "older-no-game"]
  );
  assert.deepEqual(
    filterArchivedMatches(matches, normaliseArchiveQuery({ result: "teamB" })).map(
      (match) => match.id
    ),
    ["team-b"]
  );
  assert.deepEqual(
    filterArchivedMatches(matches, normaliseArchiveQuery({ result: "tie" })).map(
      (match) => match.id
    ),
    ["tie"]
  );
  assert.deepEqual(
    sortArchivedMatches([teamAWin, tie, teamBWin], "newest").map(
      (match) => match.id
    ),
    ["tie", "team-b", "team-a"]
  );
  assert.deepEqual(
    sortArchivedMatches([teamBWin, teamAWin, tie], "oldest").map(
      (match) => match.id
    ),
    ["team-a", "team-b", "tie"]
  );
  assert.deepEqual(
    sortArchivedMatches([sameDayGameThree, teamAWin], "newest").map(
      (match) => match.id
    ),
    ["same-day-game-three", "team-a"]
  );
  assert.deepEqual(
    groupArchiveMatchesByDate([teamAWin, teamBWin], [teamAWin, teamBWin]).map(
      (group) => group.label
    ),
    ["1 AUGUST 2026", "2 SEPTEMBER 2026"]
  );
  assert.equal(getMatchArchiveGameLabel(sameDayGameThree), "GAME 3");
  assert.equal(getMatchArchiveGameLabel(olderNoGameNumber), "MATCH");
  assert.match(getMatchArchiveDisplayIdentifier(sameDayGameThree), /G3/);
  assert.match(getArchiveMatchSearchText(sameDayGameThree), /dipanjan/);
});

test("Match archive page controls pagination reset empty state and scorecard return URL", () => {
  const archive = matchArchiveSource();
  const scorecard = matchScorecardSource();
  const css = cssSource();

  assert.match(archive, /MATCH_ARCHIVE_PAGE_SIZE/);
  assert.match(archive, /params\.delete\("page"\)/);
  assert.match(archive, /placeholder="Search player, team or venue\.\.\."/);
  assert.match(archive, /<span>Match Date<\/span>/);
  assert.match(archive, /type="date"/);
  assert.match(archive, /\["q", "date", "month", "year", "result", "sort", "page"\]/);
  assert.match(archive, /getMatchArchiveGameLabel\(match\)/);
  assert.match(archive, /getMatchArchiveDisplayIdentifier\(match\)/);
  assert.match(archive, /NO MATCHES FOUND/);
  assert.match(archive, /Try another player, date, team or venue\./);
  assert.match(archive, /aria-current=\{item === currentPage \? "page" : undefined\}/);
  assert.match(archive, /disabled=\{currentPage === 1\}/);
  assert.match(archive, /disabled=\{currentPage === pageCount\}/);
  assert.match(scorecard, /returnTo && returnTo\.startsWith\("\/matches"\)/);
  assert.match(scorecard, /href=\{backToMatchesHref\}/);
  assert.match(css, /\.match-archive-controls\s*{[\s\S]*?grid-template-columns/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.match-archive-controls\s*{[\s\S]*?grid-template-columns:\s*1fr/);
});

test("Match scorecard route reads the saved match by route id", () => {
  const scorecard = matchScorecardSource();
  const route = readFileSync("app/matches/[matchId]/page.tsx", "utf8");

  assert.match(route, /params: Promise<\{ matchId: string \}>/);
  assert.match(route, /loadPublicSupabaseReadData/);
  assert.match(route, /initialMatch=\{supabaseMode \? match : undefined\}/);
  assert.match(scorecard, /candidate\.id === matchId/);
  assert.match(scorecard, /Back to Matches/);
  assert.match(scorecard, /getMatchResultHeadline\(match\)/);
});

test("repository interface can be replaced while preserving UI selectors", () => {
  const matches = [
    matchRecord({ id: "draft", matchDate: "2026-08-06", status: "draft" }),
    matchRecord({ id: "final", matchDate: "2026-08-07" })
  ];
  const memoryRepository: MatchRepository = {
    getAllMatches: () => matches,
    getFinalisedMatches: () => getFinalisedMatches(matches),
    getMatchById: (matchId) =>
      matches.find((match) => match.id === matchId) ?? null,
    saveMatch: () => undefined,
    deleteScheduledMatch: () => false
  };

  assert.equal(memoryRepository.getFinalisedMatches().length, 1);
  assert.equal(memoryRepository.getMatchById("final")?.id, "final");
  assert.equal(memoryRepository.getMatchById("missing"), null);
});

test("LocalMatchRepository reads existing locally saved finalised matches", () => {
  const storedMatches = [
    matchRecord({ id: "stored-draft", matchDate: "2026-08-06", status: "draft" }),
    matchRecord({ id: "stored-final", matchDate: "2026-08-07" })
  ];
  const originalWindow = globalThis.window;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) =>
          key === MATCH_HISTORY_STORAGE_KEY ? JSON.stringify(storedMatches) : null,
        setItem: () => undefined
      },
      dispatchEvent: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    }
  });

  try {
    const repository = new LocalMatchRepository();

    assert.equal(repository.getAllMatches().length, 2);
    assert.deepEqual(
      repository.getFinalisedMatches().map((match) => match.id),
      ["stored-final"]
    );
    assert.equal(repository.getMatchById("stored-final")?.id, "stored-final");
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow
    });
  }
});

test("LocalMatchRepository soft-deletes scheduled fixtures and leaves finalised history untouched", () => {
  let storedMatches = [
    matchRecord({
      id: "final-1",
      matchDate: "2026-08-06",
      matchNumber: 1,
      status: "finalised"
    }),
    matchRecord({
      id: "delete-me",
      matchDate: "2026-08-06",
      matchNumber: 2,
      status: "draft"
    }),
    matchRecord({
      id: "next-up",
      matchDate: "2026-08-06",
      matchNumber: 3,
      status: "draft"
    })
  ];
  const originalWindow = globalThis.window;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) =>
          key === MATCH_HISTORY_STORAGE_KEY ? JSON.stringify(storedMatches) : null,
        setItem: (_key: string, value: string) => {
          storedMatches = JSON.parse(value) as MatchRecord[];
        }
      },
      dispatchEvent: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    }
  });

  try {
    const repository = new LocalMatchRepository();

    assert.equal(repository.deleteScheduledMatch("delete-me"), true);
    assert.equal(
      storedMatches.find((match) => match.id === "delete-me")?.deletedAt
        ? true
        : false,
      true
    );
    assert.deepEqual(
      repository.getAllMatches().map((match) => match.id),
      ["final-1", "next-up"]
    );
    assert.equal(repository.getMatchById("delete-me"), null);
    assert.equal(repository.getMatchById("next-up")?.matchNumber, 2);
    assert.deepEqual(
      repository.getFinalisedMatches().map((match) => match.id),
      ["final-1"]
    );
    assert.equal(
      getDashboardSummary({
        matches: repository.getAllMatches(),
        players: activePlayers
      }).totalFinalisedMatches,
      1
    );
    assert.equal(
      getNextMatchState(
        repository.getAllMatches(),
        new Date(2026, 7, 6, 9)
      ).match?.id,
      "next-up"
    );
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow
    });
  }
});

test("LocalMatchRepository rejects deleting live finalised and abandoned matches", () => {
  let storedMatches = [
    matchRecord({
      id: "live",
      matchDate: "2026-08-06",
      status: "in_progress"
    }),
    matchRecord({
      id: "final",
      matchDate: "2026-08-06",
      status: "finalised"
    }),
    matchRecord({
      id: "abandoned",
      matchDate: "2026-08-06",
      status: "abandoned"
    })
  ];
  const originalWindow = globalThis.window;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) =>
          key === MATCH_HISTORY_STORAGE_KEY ? JSON.stringify(storedMatches) : null,
        setItem: (_key: string, value: string) => {
          storedMatches = JSON.parse(value) as MatchRecord[];
        }
      },
      dispatchEvent: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    }
  });

  try {
    const repository = new LocalMatchRepository();

    assert.equal(repository.deleteScheduledMatch("live"), false);
    assert.equal(repository.deleteScheduledMatch("final"), false);
    assert.equal(repository.deleteScheduledMatch("abandoned"), false);
    assert.equal(storedMatches.some((match) => match.deletedAt), false);
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow
    });
  }
});

test("Dashboard player count uses active roster rather than current team size", () => {
  const inactiveRoster = [
    { ...activePlayers[0], isActive: false },
    ...activePlayers.slice(1, 5)
  ];
  const summary = getDashboardSummary({
    matches: [],
    players: inactiveRoster
  });

  assert.equal(summary.activePlayerCount, 4);
});

test("Dashboard roster summaries grow when four active players are added", () => {
  const expandedRoster = [
    ...activePlayers,
    temporaryPlayer(1),
    temporaryPlayer(2),
    temporaryPlayer(3),
    temporaryPlayer(4)
  ];
  const summary = getDashboardSummary({
    matches: [],
    players: expandedRoster
  });

  assert.equal(summary.activePlayerCount, activePlayers.length + 4);
  assert.equal(
    expandedRoster.filter((player) => player.isActive !== false).length,
    activePlayers.length + 4
  );
  assert.equal(expandedRoster.at(-1)?.level, 0);
  assert.equal(expandedRoster.at(-1)?.stats.matches, 0);
});

test("canonical active roster contains the five new approved players", () => {
  const playerData = readFileSync("lib/data/players.ts", "utf8");

  assert.equal(activePlayers.length, 21);
  assert.equal(new Set(activePlayers.map((player) => player.id)).size, activePlayers.length);
  for (const playerId of newPlayerIds) {
    const player = activePlayers.find((candidate) => candidate.id === playerId);

    assert.ok(player);
    assert.equal(player.slug, playerId);
    assert.equal(player.level, 0);
    assert.equal(player.xp, 0);
    assert.deepEqual(player.ratings, { batting: 0, bowling: 0, fielding: 0 });
    assert.deepEqual(calculateDisplayedRating(player.ratings.batting, player.stats.matches), {
      status: "UNRATED",
      value: null
    });
    assert.deepEqual(player.stats, {
      matches: 0,
      runs: 0,
      wickets: 0,
      catches: 0,
      runOuts: 0,
      hatTricks: 0
    });
    assert.equal(player.avatar, playerId === "pritvi" ? "" : player.cardImage);
    assert.equal(getPlayerBySlug(playerId)?.id, playerId);
  }

  assert.deepEqual(
    newPlayerIds.map((playerId) => activePlayers.find((player) => player.id === playerId)?.cardImage),
    newPlayerImagePaths
  );
  for (const imagePath of newPlayerImagePaths) {
    assert.equal(
      existsSync(path.join(process.cwd(), "public", imagePath.replace(/^\//, ""))),
      true
    );
  }
  assert.doesNotMatch(playerData, /avatarImage|portraitImage|thumbnailImage|player-avatars/);
});

test("canonical roster includes explicit neutral Play Style tags", () => {
  const expectedStyles = new Map([
    ["aninda", ["batting", "pace", "utility"]],
    ["arunabha", ["pace", "utility"]],
    ["atripan", ["batting", "spin"]],
    ["biplab", ["spin", "utility"]],
    ["dipanjan", ["batting", "pace", "utility"]],
    ["gaurav", ["batting", "spin"]],
    ["madhab", ["batting", "pace", "utility"]],
    ["rohit", ["batting", "pace"]],
    ["soman", ["batting", "pace"]],
    ["utpal", ["pace", "utility"]],
    ["jogindar", ["spin", "utility"]],
    ["badhan", ["batting", "spin"]],
    ["debraj", ["spin", "utility"]],
    ["dipayan", ["batting", "pace", "utility"]],
    ["dheeraj", ["spin", "utility"]],
    ["saurav", ["batting", "spin"]],
    ["naim", ["batting", "pace", "utility"]],
    ["chaitanya", ["batting", "utility"]],
    ["amrit", ["spin", "utility"]],
    ["pritvi", ["batting", "pace", "utility"]],
    ["suprateem", ["batting", "utility"]]
  ]);

  for (const [playerId, playStyles] of expectedStyles) {
    assert.deepEqual(
      activePlayers.find((player) => player.id === playerId)?.playStyles,
      playStyles
    );
  }
});

test("Player browser filters by Play Style and supports multi-tag players", () => {
  const battingPlayers = getVisiblePlayers({
    players: activePlayers,
    options: { ...DEFAULT_PLAYER_BROWSER_OPTIONS, style: "batting" }
  });
  const pacePlayers = getVisiblePlayers({
    players: activePlayers,
    options: { ...DEFAULT_PLAYER_BROWSER_OPTIONS, style: "pace" }
  });
  const spinPlayers = getVisiblePlayers({
    players: activePlayers,
    options: { ...DEFAULT_PLAYER_BROWSER_OPTIONS, style: "spin" }
  });
  const utilityPlayers = getVisiblePlayers({
    players: activePlayers,
    options: { ...DEFAULT_PLAYER_BROWSER_OPTIONS, style: "utility" }
  });

  assert.ok(battingPlayers.every((player) => player.playStyles.includes("batting")));
  assert.ok(pacePlayers.every((player) => player.playStyles.includes("pace")));
  assert.ok(spinPlayers.every((player) => player.playStyles.includes("spin")));
  assert.ok(utilityPlayers.every((player) => player.playStyles.includes("utility")));
  assert.ok(battingPlayers.some((player) => player.id === "naim"));
  assert.ok(pacePlayers.some((player) => player.id === "naim"));
  assert.ok(spinPlayers.some((player) => player.id === "atripan"));
  assert.equal(
    getVisiblePlayers({
      players: activePlayers,
      options: { ...DEFAULT_PLAYER_BROWSER_OPTIONS, style: "all" }
    }).length,
    activePlayers.length
  );
});

test("Player browser search covers public name card title and role case-insensitively", () => {
  assert.deepEqual(
    getVisiblePlayers({
      players: activePlayers,
      options: { ...DEFAULT_PLAYER_BROWSER_OPTIONS, search: "ANINDA" }
    }).map((player) => player.id),
    ["aninda"]
  );
  assert.deepEqual(
    getVisiblePlayers({
      players: activePlayers,
      options: { ...DEFAULT_PLAYER_BROWSER_OPTIONS, search: "cannon" }
    }).map((player) => player.id),
    ["naim"]
  );
  assert.ok(
    getVisiblePlayers({
      players: activePlayers,
      options: { ...DEFAULT_PLAYER_BROWSER_OPTIONS, search: "spin" }
    }).some((player) => player.id === "atripan")
  );
});

test("Player browser combines style search and sort without mutating roster order", () => {
  const visiblePlayers = getVisiblePlayers({
    players: activePlayers,
    options: { style: "pace", search: "seam", sort: "name" }
  });

  assert.deepEqual(
    visiblePlayers.map((player) => player.id),
    ["dipanjan", "pritvi"]
  );
  assert.deepEqual(
    getVisiblePlayers({
      players: activePlayers,
      options: DEFAULT_PLAYER_BROWSER_OPTIONS
    })
      .slice(0, 4)
      .map((player) => player.id),
    activePlayers.slice(0, 4).map((player) => player.id)
  );
});

test("Player browser sorting handles name Level XP and numeric Player Power", () => {
  const sortablePlayers = [
    { ...activePlayers[0], name: "Charlie", level: 1, xp: 80 },
    {
      ...activePlayers[1],
      name: "Bravo",
      level: 3,
      xp: 100,
      ratings: { batting: 55, bowling: 91, fielding: 64 },
      stats: { ...activePlayers[1].stats, matches: 4 }
    },
    {
      ...activePlayers[2],
      name: "Alpha",
      level: 3,
      xp: 130,
      ratings: { batting: 88, bowling: 42, fielding: 95 },
      stats: { ...activePlayers[2].stats, matches: 8 }
    }
  ];

  assert.deepEqual(
    getVisiblePlayers({
      players: sortablePlayers,
      options: { ...DEFAULT_PLAYER_BROWSER_OPTIONS, sort: "name" }
    }).map((player) => player.name),
    ["Alpha", "Bravo", "Charlie"]
  );
  assert.deepEqual(
    getVisiblePlayers({
      players: sortablePlayers,
      options: { ...DEFAULT_PLAYER_BROWSER_OPTIONS, sort: "level" }
    }).map((player) => player.name),
    ["Alpha", "Bravo", "Charlie"]
  );
  assert.deepEqual(
    getVisiblePlayers({
      players: sortablePlayers,
      options: { ...DEFAULT_PLAYER_BROWSER_OPTIONS, sort: "xp" }
    }).map((player) => player.name),
    ["Alpha", "Bravo", "Charlie"]
  );
  assert.deepEqual(
    getVisiblePlayers({
      players: sortablePlayers,
      options: { ...DEFAULT_PLAYER_BROWSER_OPTIONS, sort: "bladePower" }
    }).map((player) => player.name),
    ["Alpha", "Bravo", "Charlie"]
  );
  assert.deepEqual(
    getVisiblePlayers({
      players: sortablePlayers,
      options: { ...DEFAULT_PLAYER_BROWSER_OPTIONS, sort: "deliveryThreat" }
    }).map((player) => player.name),
    ["Bravo", "Alpha", "Charlie"]
  );
  assert.deepEqual(
    getVisiblePlayers({
      players: sortablePlayers,
      options: { ...DEFAULT_PLAYER_BROWSER_OPTIONS, sort: "fieldReflex" }
    }).map((player) => player.name),
    ["Alpha", "Bravo", "Charlie"]
  );
});

test("Player browser formats dynamic warrior counts and empty state controls", () => {
  const source = playerBrowserSource();
  const css = cssSource();

  assert.equal(
    formatVisibleWarriorCount({ count: 21, style: "all", search: "" }),
    "21 WARRIORS"
  );
  assert.equal(
    formatVisibleWarriorCount({ count: 1, style: "spin", search: "" }),
    "1 SPIN WARRIOR"
  );
  assert.equal(
    formatVisibleWarriorCount({ count: 3, style: "all", search: "rambo" }),
    "3 WARRIORS FOUND"
  );
  assert.match(source, /NO WARRIORS FOUND/);
  assert.match(source, /Clear Filters/);
  assert.match(source, /setOptions\(DEFAULT_PLAYER_BROWSER_OPTIONS\)/);
  assert.match(source, /carouselRef\.current\?\.scrollTo/);
  assert.match(css, /\.players-empty-state/);
});

test("Player browser UI replaces All-Rounders with accessible controls", () => {
  const dashboardPage = readFileSync("app/page.tsx", "utf8");
  const source = playerBrowserSource();
  const css = cssSource();

  assert.match(dashboardPage, /<PlayerBrowserSection players=\{players\} careerResolved=\{Boolean\(data\)\}/);
  assert.doesNotMatch(dashboardPage + source, /All-Rounders/i);
  assert.match(source, /aria-pressed=\{options\.style === "all"\}/);
  assert.match(source, /aria-haspopup="menu"/);
  assert.match(source, /aria-expanded=\{isOpen\}/);
  assert.match(source, /role="menuitemradio"/);
  assert.match(source, /aria-checked=\{options\.style === style\}/);
  assert.match(source, /aria-label="Search players"/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /document\.addEventListener\("pointerdown"/);
  assert.match(css, /@media \(max-width:\s*640px\)[\s\S]*?\.players-search-control\s*{[\s\S]*?grid-column:\s*1 \/ -1/);
});

test("production player display names keep their stable ids slugs and zero career data", () => {
  const jogindar = getPlayerById("jogindar");
  const naim = getPlayerById("naim");

  assert.ok(jogindar);
  assert.ok(naim);
  assert.equal(jogindar.name, "Jogi");
  assert.equal(jogindar.slug, "jogindar");
  assert.equal(getPlayerBySlug("jogindar")?.id, "jogindar");
  assert.equal(naim.name, "Naeem");
  assert.equal(naim.slug, "naim");
  assert.equal(getPlayerBySlug("naim")?.id, "naim");
  assert.equal(jogindar.cardTitle, "Loopy Loyalist");
  assert.equal(jogindar.avatar, "/player-cards/loopy-loyalist.png");
  assert.equal(naim.cardTitle, "Calm Cannon");
  assert.equal(naim.avatar, "/player-cards/calm-cannon.png");

  for (const player of [jogindar, naim]) {
    assert.equal(player.level, 0);
    assert.equal(player.xp, 0);
    assert.deepEqual(player.ratings, { batting: 0, bowling: 0, fielding: 0 });
    assert.deepEqual(player.stats, {
      matches: 0,
      runs: 0,
      wickets: 0,
      catches: 0,
      runOuts: 0,
      hatTricks: 0
    });
  }
});

test("Soman keeps his player identity and approved Apex Crusher card artwork", () => {
  const soman = getPlayerById("soman");

  assert.ok(soman);
  assert.equal(soman.name, "Soman");
  assert.equal(soman.slug, "soman");
  assert.equal(soman.cardTitle, "Apex Crusher");
  assert.equal(soman.cardImage, "/player-cards/apex-crusher.png");
  assert.equal(soman.avatar, "/player-cards/apex-crusher.png");
  assert.equal(
    existsSync(path.join(process.cwd(), "public", "player-cards", "apex-crusher.png")),
    true
  );
  assert.equal(soman.level, 0);
  assert.equal(soman.xp, 0);
  assert.deepEqual(soman.ratings, { batting: 0, bowling: 0, fielding: 0 });
  assert.deepEqual(soman.stats, {
    matches: 0,
    runs: 0,
    wickets: 0,
    catches: 0,
    runOuts: 0,
    hatTricks: 0
  });
});

test("the original sixteen player identities and approved card assets are canonical", () => {
  assert.deepEqual(
    activePlayers.slice(0, 16).map((player) => [
      player.id,
      player.cardTitle,
      player.cardImage
    ]),
    originalPlayerSummaries
  );

  for (const player of activePlayers.slice(0, 16)) {
    assert.equal(player.avatar, player.cardImage);
    assert.equal(existsSync(path.join(process.cwd(), "public", player.cardImage.slice(1))), true);
  }
});

test("active player-card artwork uses the shared two-by-three card aspect", () => {
  for (const player of activePlayers) {
    const dimensions = getPublicPngDimensions(player.cardImage);
    const aspectRatio = dimensions.width / dimensions.height;

    assert.ok(
      Math.abs(aspectRatio - 2 / 3) < 0.01,
      `${player.id} card artwork should be close to 2:3 but is ${dimensions.width}x${dimensions.height}`
    );
  }

  assert.deepEqual(getPublicPngDimensions("/player-cards/slow-poison.png"), {
    width: 1024,
    height: 1536
  });
  assert.deepEqual(getPublicPngDimensions("/player-cards/skidball-sheriff.png"), {
    width: 1024,
    height: 1536
  });
});

test("approved player avatar title changes preserve stable roster identities", () => {
  const approvedUpdates = [
    ["gaurav", "Gaurav", "Slow Poison", "/player-cards/slow-poison.png"],
    ["soman", "Soman", "Apex Crusher", "/player-cards/apex-crusher.png"],
    ["dipayan", "Dipayan", "Dipayan the Destroyer", "/player-cards/dipayan-the-destroyer.png"],
    ["dheeraj", "Dheeraj", "Surgical Chase Master", "/player-cards/surgical-chase-master.png"]
  ];

  for (const [id, name, cardTitle, cardImage] of approvedUpdates) {
    const player = getPlayerById(id);

    assert.ok(player);
    assert.equal(player.id, id);
    assert.equal(player.name, name);
    assert.equal(player.slug, id);
    assert.equal(player.cardTitle, cardTitle);
    assert.equal(player.cardImage, cardImage);
    assert.equal(player.avatar, cardImage);
    assert.equal(existsSync(path.join(process.cwd(), "public", cardImage.slice(1))), true);
    assert.equal(player.level, 0);
    assert.equal(player.xp, 0);
    assert.deepEqual(player.ratings, { batting: 0, bowling: 0, fielding: 0 });
    assert.deepEqual(player.stats, {
      matches: 0,
      runs: 0,
      wickets: 0,
      catches: 0,
      runOuts: 0,
      hatTricks: 0
    });
  }

  assert.equal(activePlayers.length, 21);
  assert.equal(new Set(activePlayers.map((player) => player.id)).size, activePlayers.length);
  assert.equal(getPlayerById("gaurav")?.cardTitle, "Slow Poison");
  assert.notEqual(getPlayerById("gaurav")?.cardTitle, "Spin Wizard");
});

test("Dashboard panels use shared persisted match summary source", () => {
  const hero = readFileSync("components/dashboard/HeroSection.tsx", "utf8");
  const recent = readFileSync("components/dashboard/RecentMatchesPanel.tsx", "utf8");
  const topPerformers = topPerformersSource();

  assert.match(hero, /useDashboardSummary\(activePlayers\)/);
  assert.match(hero, /Matches Played/);
  assert.match(hero, /summary\.totalFinalisedMatches/);
  assert.match(hero, /summary\.activePlayerCount/);
  assert.match(recent, /summary\.recentFinalisedMatches/);
  assert.match(recent, /recentMatches\.length > 0/);
  assert.match(recent, /getMatchResultHeadline/);
  assert.match(topPerformers, /const localDashboard = useDashboardSummary\(activePlayers\)/);
  assert.match(topPerformers, /const matches = suppliedMatches \?\? localDashboard\.matches/);
  assert.match(topPerformers, /matches,/);
  assert.doesNotMatch(topPerformers, /matches:\s*\[\]/);
});

test("Dashboard and Players page render from the same active player roster", () => {
  const dashboardPage = readFileSync("app/page.tsx", "utf8");
  const playersPage = readFileSync("app/players/page.tsx", "utf8");
  const playerRoute = readFileSync("app/players/[playerId]/page.tsx", "utf8");

  assert.match(dashboardPage, /loadPublicSupabaseReadData/);
  assert.match(dashboardPage, /<PlayerBrowserSection players=\{players\} careerResolved=\{Boolean\(data\)\}/);
  assert.doesNotMatch(dashboardPage, /activePlayers\.length\} Warriors|All-Rounders/);
  assert.match(playersPage, /loadPublicSupabaseReadData/);
  assert.match(playersPage, /\{players\.length\} WARRIORS/);
  assert.match(playersPage, /<CareerPlayerGrid players=\{players\} careerResolved=\{Boolean\(data\)\}/);
  assert.match(playerRoute, /activePlayers\.map\(\(player\) =>/);
  assert.match(playerRoute, /playerId: player\.slug/);
  assert.match(playerRoute, /getPlayerBySlug\(playerSlug\)/);
});

test("Match creation controls read the active player roster", () => {
  const matchForm = readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");
  const teamBalance = readFileSync("server/team-balancing.ts", "utf8");

  assert.match(matchForm, /const allPlayerIds = activePlayers\.map\(\(player\) => player\.id\)/);
  assert.match(matchForm, /activePlayers\.filter\(\(player\) => availablePlayerIds\.includes\(player\.id\)\)/);
  assert.match(matchForm, /\{activePlayers\.map\(\(player\) =>/);
  assert.match(teamBalance, /new Set\(activePlayers\.map\(\(player\) => player\.id\)\)/);
  assert.match(teamBalance, /privateBalanceWeights\[playerId\] \?\? 2/);
});

test("Dashboard Top Performer spotlight CSS is scoped and responsive", () => {
  const css = cssSource();

  assert.match(css, /\.top-performers-header\s*{[\s\S]*?justify-content:\s*space-between/);
  assert.match(css, /\.top-performer-grid\s*{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.top-performer-card\s*{[\s\S]*?min-height:\s*226px/);
  assert.match(css, /\.performer-portrait\s*{[\s\S]*?width:\s*88px/);
  assert.match(css, /\.performer-portrait-image\s*{[\s\S]*?object-fit:\s*cover/);
  assert.match(css, /\.performer-watermark\s*{[\s\S]*?opacity:\s*0\.11/);
  assert.match(css, /\.top-performer-card:hover[\s\S]*?transform:\s*translateY\(-4px\)/);
  assert.match(css, /@media \(max-width:\s*760px\)[\s\S]*?\.top-performer-grid\s*{[\s\S]*?grid-template-columns:\s*1fr/);
});
