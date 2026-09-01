import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { activePlayers } from "../lib/data/players";
import {
  LEADERBOARD_CATEGORIES,
  calculateBattingAverage,
  getLeaderboardEntries,
  getLeaderboardPodium,
  getLeaderboardSummary,
  groupLeaderboardPodiumEntries,
  hasAnyFinalisedLeaderboardData,
  parseLocalMatchDate
} from "../lib/leaderboard";
import { createQuickScoringEvent } from "../lib/quick-scoring";
import type {
  BowlingOver,
  MatchRecord,
  MatchStatus,
  PlayerMatchXPBreakdown,
  TeamId
} from "../lib/types/match";
import type { Player } from "../lib/types/player";

const leaderboardSource = () =>
  readFileSync("components/leaderboard/CareerLeaderboard.tsx", "utf8");
const leaderboardLibSource = () => readFileSync("lib/leaderboard.ts", "utf8");
const leaderboardPageSource = () => readFileSync("app/leaderboard/page.tsx", "utf8");
const matchFormSource = () =>
  readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");
const leaderboardCssSource = () => readFileSync("app/globals.css", "utf8");
const newPlayerIds = ["naim", "chaitanya", "amrit", "pritvi", "suprateem"];

function withCareerStats(
  overrides: Record<
    string,
    Partial<Omit<Pick<Player, "level" | "xp" | "stats" | "ratings">, "stats" | "ratings">> & {
      stats?: Partial<Player["stats"]>;
      ratings?: Partial<Player["ratings"]>;
    }
  >
): Player[] {
  return activePlayers.map((player) => ({
    ...player,
    ...(overrides[player.id] ?? {}),
    stats: {
      ...player.stats,
      ...(overrides[player.id]?.stats ?? {})
    },
    ratings: {
      ...player.ratings,
      ...(overrides[player.id]?.ratings ?? {})
    }
  }));
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

function performance({
  playerId,
  teamId = "teamA",
  runs = 0,
  wickets = 0,
  catches = 0,
  runOuts = 0,
  awardedXP = 0,
  played = true,
  didBat = true,
  wasOut = false
}: {
  playerId: string;
  teamId?: TeamId;
  runs?: number;
  wickets?: number;
  catches?: number;
  runOuts?: number;
  awardedXP?: number;
  played?: boolean;
  didBat?: boolean;
  wasOut?: boolean;
}) {
  return {
    playerId,
    teamId,
    played,
    playerOfMatch: false,
    didBat,
    runs,
    wasOut,
    wickets,
    hatTricks: 0,
    catches,
    runOuts,
    stumpings: 0,
    xpBreakdown: xpBreakdown(awardedXP)
  };
}

function bowlingOver(playerId: string, runsConceded: number): BowlingOver {
  return {
    id: `${playerId}-over`,
    bowlingTeamId: "teamA",
    battingTeamId: "teamB",
    bowlerId: playerId,
    overNumber: 1,
    runsConceded,
    wicketsTaken: 0,
    dismissals: [],
    maiden: false
  };
}

function economyEvents(
  bowlerId: string,
  runsPerBall: number[],
  firstSequence: number
) {
  return runsPerBall.map((batterRuns, index) =>
    createQuickScoringEvent({
      sequence: firstSequence + index,
      battingTeamId: "teamB",
      strikerId: index % 2 === 0 ? "aninda" : "arunabha",
      nonStrikerId: index % 2 === 0 ? "arunabha" : "aninda",
      bowlerId,
      batterRuns,
      extraType: null,
      wicket: null,
      timestamp: `2026-08-05T12:${String(firstSequence + index).padStart(2, "0")}:00.000Z`
    })
  );
}

function getPodiumLayoutForEntries(entries: ReturnType<typeof getLeaderboardEntries>) {
  const rankGroupCount = groupLeaderboardPodiumEntries(entries).length;

  if (rankGroupCount >= 3) return "three";
  if (rankGroupCount === 2) return "two";

  return "one";
}

function matchRecord({
  id,
  matchDate,
  status = "finalised",
  records,
  bowlingOvers = []
}: {
  id: string;
  matchDate: string;
  status?: MatchStatus;
  records: ReturnType<typeof performance>[];
  bowlingOvers?: BowlingOver[];
}): MatchRecord {
  return {
    id,
    matchDate,
    matchName: "Gully Match",
    venue: "CZU Gully Arena",
    status,
    scheduledOversPerInnings: 4,
    battingFirstTeamId: "teamA",
    chasingTeamId: "teamB",
    teams: {
      teamA: {
        teamId: "teamA",
        teamName: "Team A",
        playerIds: records
          .filter((record) => record.teamId === "teamA")
          .map((record) => record.playerId),
        playerPerformances: records.filter((record) => record.teamId === "teamA"),
        bowlingOvers,
        totalRuns: 0,
        completedBowlingOvers: bowlingOvers.length
      },
      teamB: {
        teamId: "teamB",
        teamName: "Team B",
        playerIds: records
          .filter((record) => record.teamId === "teamB")
          .map((record) => record.playerId),
        playerPerformances: records.filter((record) => record.teamId === "teamB"),
        bowlingOvers: [],
        totalRuns: 0,
        completedBowlingOvers: 0
      }
    },
    innings: {
      first: {
        battingTeamId: "teamA",
        bowlingTeamId: "teamB",
        runs: 0,
        wicketsLost: 0,
        extras: 0,
        playerCount: 2,
        completedOvers: 4,
        battingPerformances: records,
        bowlingOvers: []
      },
      second: {
        battingTeamId: "teamB",
        bowlingTeamId: "teamA",
        runs: 0,
        wicketsLost: 0,
        extras: 0,
        playerCount: 2,
        completedOvers: 4,
        battingPerformances: [],
        bowlingOvers
      }
    },
    result: { type: "tie" },
    finalisedPlayerRecords: records,
    progressionAppliedAt: "2026-08-05T12:00:00.000Z",
    appliedFinalisationVersion: 1
  };
}

test("Leaderboard page identity is Hall of Legends and not Formula Room", () => {
  const page = leaderboardPageSource();
  const leaderboard = leaderboardSource();

  assert.match(leaderboard, /HALL OF LEGENDS/);
  assert.match(
    leaderboard,
    /strike-rate\s+rockets, economy artists, six machines, boundary bandits and XP\s+warriors/
  );
  assert.match(leaderboard, /ALL TIME/);
  assert.match(leaderboard, /CURRENT MONTH/);
  assert.match(page, /max-w-\[1480px\]/);
  assert.doesNotMatch(leaderboard, /XP_RULES|Level formula|MATCH_RULES|FORMULA ROOM/);
  assert.doesNotMatch(leaderboard, /mock leaderboard|Phase 1|sample statistics/i);
});

test("Navbar label is Hall of Legends while route remains leaderboard", () => {
  const navigation = readFileSync("lib/data/navigation.ts", "utf8");
  const leaderboard = leaderboardSource();

  assert.match(navigation, /label:\s*"HALL OF LEGENDS"/);
  assert.match(navigation, /href:\s*"\/leaderboard"/);
  assert.match(leaderboard, /HALL OF LEGENDS/);
});

test("Leaderboard renders required interactive sections and player links", () => {
  const leaderboard = leaderboardSource();
  const css = leaderboardCssSource();

  assert.match(leaderboard, /LeaderQuickCards/);
  assert.match(leaderboard, /LeaderboardCategoryTabs/);
  assert.match(leaderboard, /LeaderboardPodium/);
  assert.match(leaderboard, /LeaderboardRankList/);
  assert.match(leaderboard, /role="tablist"/);
  assert.match(leaderboard, /aria-selected/);
  assert.match(leaderboard, /aria-pressed/);
  assert.match(leaderboard, /LEADER_QUICK_ICON_SCALE/);
  assert.match(leaderboard, /quality=\{100\}/);
  assert.match(leaderboard, /className="leader-quick-icon"/);
  assert.match(leaderboard, /className="leader-quick-icon-artwork"/);
  assert.match(leaderboard, /DUCK_COLLECTOR_QUOTES/);
  assert.match(leaderboard, /getDuckCollectorQuote/);
  assert.match(leaderboard, /data-category=\{summary\.category\}/);
  assert.match(leaderboard, /className="duck-collector-tease"/);
  assert.match(leaderboard, /🥲/);
  assert.match(leaderboard, /🦆/);
  assert.match(leaderboard, /className=\{`podium-medal podium-medal-\$\{rankTone\}`\}/);
  assert.match(leaderboard, /<Medal aria-hidden="true" \/>/);
  assert.match(leaderboard, /href=\{`\/players\/\$\{entry\.player\.slug\}`\}/);
  assert.match(css, /\.leaderboard-tabs\s*{[\s\S]*?overflow-x:\s*auto/);
  assert.match(css, /\.leaderboard-rank-row\s*{[\s\S]*?min-width:\s*0/);
  assert.match(css, /\.leader-quick-icon\s*{[\s\S]*?width:\s*84px/);
  assert.match(css, /\.leader-quick-icon-artwork\s*{[\s\S]*?transform:\s*scale\(var\(--icon-scale,\s*0\.92\)\)/);
  assert.match(css, /\.leader-quick-card\[data-category="ducks"\]/);
  assert.match(css, /\.leader-quick-card\[data-category="runs"\]/);
  assert.match(css, /\.leader-quick-card\[data-category="wickets"\]/);
  assert.match(css, /\.leader-quick-card\[data-category="catches"\]/);
  assert.match(css, /\.leader-quick-card\[data-category="battingAverage"\]/);
  assert.match(css, /\.duck-collector-tease/);
  assert.match(css, /\.duck-collector-tease::after/);
  assert.match(css, /\.podium-slot-layout-three\s*{[\s\S]*?grid-template-areas:\s*"second first third"/);
  assert.match(css, /\.podium-slot-layout-two\s*{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.podium-slot-layout-one\s*{[\s\S]*?justify-content:\s*center/);
  assert.match(css, /\.podium-card-first\s*{[\s\S]*?translateY\(-38px\)\s*scale\(1\.07\)/);
  assert.match(leaderboard, /groupLeaderboardPodiumEntries\(entries\)/);
  assert.match(leaderboard, /rankGroups\.length >= 3 \? "three"/);
  assert.match(leaderboard, /podiumLayout === "three"/);
  assert.match(leaderboard, /\[2, 1, 3\]/);
  assert.match(leaderboard, /className=\{`podium-slot-layout podium-slot-layout-\$\{podiumLayout\}`\}/);
  assert.match(leaderboard, /className=\{`podium-slot podium-slot-rank-\$\{group\.rank\}`\}/);
  assert.match(leaderboard, /JOINT #\{rank\}/);
  assert.match(css, /\.joint-rank-card\s*{[\s\S]*?overflow:\s*hidden/);
  assert.match(css, /\.joint-rank-players\s*{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(72px,\s*1fr\)\)/);
  assert.match(css, /\.leaderboard-podium-section \.leaderboard-section-heading\s*{[\s\S]*?margin-bottom:\s*60px/);
  assert.match(css, /@media \(max-width:\s*1024px\)[\s\S]*?\.leaderboard-podium-section \.leaderboard-section-heading\s*{[\s\S]*?margin-bottom:\s*48px/);
  assert.match(css, /@media \(max-width:\s*540px\)[\s\S]*?\.leaderboard-podium-section \.leaderboard-section-heading\s*{[\s\S]*?margin-bottom:\s*32px/);
});

test("Leaderboard categories and quick-card summaries cover all Hall crowns", () => {
  assert.deepEqual(Object.keys(LEADERBOARD_CATEGORIES), [
    "runs",
    "wickets",
    "catches",
    "strikeRate",
    "economy",
    "sixes",
    "boundaries",
    "ducks",
    "xp",
    "battingAverage"
  ]);
  assert.equal(LEADERBOARD_CATEGORIES.runs.label, "MOST RUNS");
  assert.equal(LEADERBOARD_CATEGORIES.runs.icon, "/ui/leaderboard/most-runs.png");
  assert.equal(LEADERBOARD_CATEGORIES.wickets.label, "MOST WICKETS");
  assert.equal(
    LEADERBOARD_CATEGORIES.wickets.icon,
    "/ui/leaderboard/most-wickets.png"
  );
  assert.equal(LEADERBOARD_CATEGORIES.catches.label, "MOST CATCHES");
  assert.equal(
    LEADERBOARD_CATEGORIES.catches.icon,
    "/ui/leaderboard/most-catches.png"
  );
  assert.equal(LEADERBOARD_CATEGORIES.strikeRate.label, "BEST STRIKE RATE");
  assert.equal(
    LEADERBOARD_CATEGORIES.strikeRate.icon,
    "/ui/leaderboard/best-strike-rate.png"
  );
  assert.equal(LEADERBOARD_CATEGORIES.economy.label, "BEST ECONOMY");
  assert.equal(
    LEADERBOARD_CATEGORIES.economy.icon,
    "/ui/leaderboard/best-economy.png"
  );
  assert.equal(LEADERBOARD_CATEGORIES.sixes.label, "SIX MACHINE");
  assert.equal(
    LEADERBOARD_CATEGORIES.sixes.icon,
    "/ui/leaderboard/six-machine.png"
  );
  assert.equal(LEADERBOARD_CATEGORIES.boundaries.label, "BOUNDARY BANDIT");
  assert.equal(
    LEADERBOARD_CATEGORIES.boundaries.icon,
    "/ui/leaderboard/boundary-bandit.png"
  );
  assert.equal(LEADERBOARD_CATEGORIES.ducks.label, "DUCK COLLECTOR");
  assert.equal(
    LEADERBOARD_CATEGORIES.ducks.icon,
    "/ui/leaderboard/duck-collector.png"
  );
  assert.equal(LEADERBOARD_CATEGORIES.xp.label, "HIGHEST XP");
  assert.equal(
    LEADERBOARD_CATEGORIES.xp.icon,
    "/ui/leaderboard/highest-xp.png"
  );
  assert.equal(LEADERBOARD_CATEGORIES.battingAverage.label, "BEST BATTING AVERAGE");
  assert.equal(LEADERBOARD_CATEGORIES.battingAverage.crownTitle, "CURRENT RUN BANKER");
  assert.equal(
    LEADERBOARD_CATEGORIES.battingAverage.icon,
    "/ui/leaderboard/most-runs.png"
  );
  assert.equal(LEADERBOARD_CATEGORIES.battingAverage.quickStatus, "CURRENT RUN BANKER");

  for (const category of [
    "runs",
    "wickets",
    "catches",
    "strikeRate",
    "economy",
    "sixes",
    "boundaries",
    "ducks",
    "xp",
    "battingAverage"
  ] as const) {
    assert.equal(
      existsSync(
        path.join(
          process.cwd(),
          "public",
          LEADERBOARD_CATEGORIES[category].icon.replace(/^\//, "")
        )
      ),
      true
    );
  }
});

test("Current Month filters by match date and excludes non-finalised statuses", () => {
  const careerPlayers = withCareerStats({});
  const matches = [
    matchRecord({
      id: "current",
      matchDate: "2026-08-04",
      records: [performance({ playerId: "aninda", runs: 20, awardedXP: 35 })]
    }),
    matchRecord({
      id: "old",
      matchDate: "2026-07-29",
      records: [performance({ playerId: "arunabha", runs: 50, awardedXP: 90 })]
    }),
    matchRecord({
      id: "draft",
      matchDate: "2026-08-05",
      status: "draft",
      records: [performance({ playerId: "atripan", runs: 99, awardedXP: 99 })]
    }),
    matchRecord({
      id: "live",
      matchDate: "2026-08-05",
      status: "in_progress",
      records: [performance({ playerId: "biplab", runs: 99, awardedXP: 99 })]
    })
  ];
  const entries = getLeaderboardEntries({
    players: careerPlayers,
    matches,
    category: "runs",
    period: "current-month",
    now: new Date("2026-08-05T12:00:00")
  });

  assert.equal(entries[0].player.id, "aninda");
  assert.equal(entries[0].primaryValue, 20);
  assert.equal(entries.find((entry) => entry.player.id === "arunabha")?.primaryValue, 0);
  assert.equal(entries.find((entry) => entry.player.id === "atripan")?.primaryValue, 0);
  assert.equal(entries.find((entry) => entry.player.id === "biplab")?.primaryValue, 0);
});

test("Current Month diagnostic includes Dipanjan finalised ISO-date match", () => {
  const careerPlayers = withCareerStats({});
  const matches = [
    matchRecord({
      id: "dipanjan-current",
      matchDate: "2026-08-09",
      records: [
        performance({
          playerId: "dipanjan",
          runs: 15,
          wickets: 3,
          awardedXP: 87
        })
      ],
      bowlingOvers: [bowlingOver("dipanjan", 20)]
    })
  ];
  const now = new Date(2026, 7, 5);
  const runs = getLeaderboardEntries({
    players: careerPlayers,
    matches,
    category: "runs",
    period: "current-month",
    now
  });
  const wickets = getLeaderboardEntries({
    players: careerPlayers,
    matches,
    category: "wickets",
    period: "current-month",
    now
  });
  const xp = getLeaderboardEntries({
    players: careerPlayers,
    matches,
    category: "xp",
    period: "current-month",
    now
  });

  assert.equal(runs[0].player.id, "dipanjan");
  assert.equal(runs[0].primaryValue, 15);
  assert.equal(wickets[0].player.id, "dipanjan");
  assert.equal(wickets[0].primaryValue, 3);
  assert.equal(xp[0].player.id, "dipanjan");
  assert.equal(xp[0].primaryValue, 87);
  assert.notEqual(getLeaderboardSummary({ category: "runs", entries: runs }).status, "race-not-started");
  assert.notEqual(getLeaderboardSummary({ category: "wickets", entries: wickets }).status, "race-not-started");
  assert.notEqual(getLeaderboardSummary({ category: "xp", entries: xp }).status, "race-not-started");
});

test("Current Month safely parses ISO and legacy DD/MM/YYYY match dates", () => {
  const isoDate = parseLocalMatchDate("2026-08-09");
  const legacyDate = parseLocalMatchDate("09/08/2026");

  assert.equal(isoDate?.getFullYear(), 2026);
  assert.equal(isoDate?.getMonth(), 7);
  assert.equal(isoDate?.getDate(), 9);
  assert.equal(legacyDate?.getFullYear(), 2026);
  assert.equal(legacyDate?.getMonth(), 7);
  assert.equal(legacyDate?.getDate(), 9);
  assert.equal(parseLocalMatchDate("08/09/2026")?.getMonth(), 8);
});

test("Competition ranking keeps ties and skips the next rank", () => {
  const careerPlayers = withCareerStats({
    aninda: { stats: { matches: 1, runs: 0, wickets: 3, catches: 0 } },
    arunabha: { stats: { matches: 1, runs: 0, wickets: 3, catches: 0 } },
    atripan: { stats: { matches: 1, runs: 0, wickets: 2, catches: 0 } }
  });
  const entries = getLeaderboardEntries({
    players: careerPlayers,
    matches: [],
    category: "wickets",
    period: "all-time"
  });
  const summary = getLeaderboardSummary({ category: "wickets", entries });

  assert.deepEqual(
    entries.slice(0, 3).map((entry) => [entry.player.id, entry.rank]),
    [
      ["aninda", 1],
      ["arunabha", 1],
      ["atripan", 3]
    ]
  );
  assert.equal(summary.status, "joint-leaders");
  assert.equal(summary.displayValue, "3 EACH");
});

test("Best Batting Average uses runs divided by dismissals", () => {
  assert.equal(calculateBattingAverage({ runs: 200, dismissals: 5 }), 40);
  assert.equal(calculateBattingAverage({ runs: 200, dismissals: 4 }), 50);
  assert.equal(calculateBattingAverage({ runs: 200, dismissals: 0 }), 0);
});

test("Best Batting Average counts not-outs DNB and qualification correctly", () => {
  const qualifiedWithNotOuts = matchRecord({
    id: "average-qualified-not-outs",
    matchDate: "2026-08-04",
    records: [
      performance({ playerId: "aninda", runs: 40, wasOut: true }),
      performance({ playerId: "aninda", runs: 30, wasOut: false }),
      performance({ playerId: "aninda", runs: 20, wasOut: true }),
      performance({ playerId: "aninda", runs: 10, wasOut: false }),
      performance({ playerId: "aninda", runs: 0, wasOut: false }),
      performance({ playerId: "arunabha", runs: 60, wasOut: false }),
      performance({ playerId: "arunabha", runs: 50, wasOut: false }),
      performance({ playerId: "arunabha", runs: 40, wasOut: false }),
      performance({ playerId: "arunabha", runs: 30, wasOut: false }),
      performance({ playerId: "arunabha", runs: 20, wasOut: false }),
      performance({ playerId: "atripan", runs: 10, wasOut: true }),
      performance({ playerId: "atripan", runs: 10, wasOut: true }),
      performance({ playerId: "atripan", runs: 10, wasOut: true }),
      performance({ playerId: "atripan", runs: 10, wasOut: true }),
      performance({ playerId: "biplab", didBat: false, runs: 99, wasOut: true })
    ]
  });
  const entries = getLeaderboardEntries({
    players: activePlayers,
    matches: [qualifiedWithNotOuts],
    category: "battingAverage",
    period: "all-time"
  });
  const aninda = entries.find((entry) => entry.player.id === "aninda");
  const arunabha = entries.find((entry) => entry.player.id === "arunabha");
  const atripan = entries.find((entry) => entry.player.id === "atripan");
  const biplab = entries.find((entry) => entry.player.id === "biplab");

  assert.equal(aninda?.primaryValue, 50);
  assert.equal(aninda?.displayValue, "50.00 AVG");
  assert.equal(aninda?.supporting.battingInnings, 5);
  assert.equal(aninda?.supporting.battingDismissals, 2);
  assert.equal(aninda?.supporting.battingAverageRuns, 100);
  assert.equal(aninda?.rankable, true);
  assert.equal(arunabha?.rankable, false, "5 innings with 0 dismissals is not qualified");
  assert.equal(arunabha?.supporting.battingInnings, 5);
  assert.equal(arunabha?.supporting.battingDismissals, 0);
  assert.equal(atripan?.rankable, false, "4 innings is not qualified");
  assert.equal(atripan?.supporting.battingInnings, 4);
  assert.equal(biplab?.supporting.battingInnings, 0, "DNB does not count as a batting innings");
  assert.equal(biplab?.supporting.battingDismissals, 0, "DNB does not count as a dismissal");
});

test("Best Batting Average ranking handles better average ties and podium order", () => {
  const averageMatch = matchRecord({
    id: "average-rank",
    matchDate: "2026-08-04",
    records: [
      ...Array.from({ length: 5 }, () =>
        performance({ playerId: "aninda", runs: 40, wasOut: true })
      ),
      ...Array.from({ length: 4 }, () =>
        performance({ playerId: "arunabha", runs: 40, wasOut: true })
      ),
      performance({ playerId: "arunabha", runs: 0, wasOut: false }),
      ...Array.from({ length: 3 }, () =>
        performance({ playerId: "biplab", runs: 50, wasOut: true })
      ),
      ...Array.from({ length: 2 }, () =>
        performance({ playerId: "biplab", runs: 0, wasOut: false })
      )
    ]
  });
  const entries = getLeaderboardEntries({
    players: activePlayers,
    matches: [averageMatch],
    category: "battingAverage",
    period: "all-time"
  });
  const summary = getLeaderboardSummary({ category: "battingAverage", entries });

  assert.deepEqual(
    entries
      .filter((entry) => ["aninda", "arunabha", "biplab"].includes(entry.player.id))
      .map((entry) => [entry.player.id, entry.displayValue, entry.rank]),
    [
      ["biplab", "50.00 AVG", 1],
      ["aninda", "40.00 AVG", 2],
      ["arunabha", "40.00 AVG", 2]
    ]
  );
  assert.equal(summary.status, "single-leader");
  assert.equal(summary.displayValue, "50.00 AVG");
  assert.equal(summary.supportingText, "CURRENT RUN BANKER");
  assert.deepEqual(
    groupLeaderboardPodiumEntries(entries).map((group) => group.rank),
    [1, 2]
  );
  assert.match(leaderboardSource(), /podiumLayout === "three"[\s\S]*?\[2, 1, 3\]/);
});

test("Best Batting Average excludes non-official matches and preserves legacy dismissal safety", () => {
  const official = matchRecord({
    id: "average-official",
    matchDate: "2026-08-04",
    records: Array.from({ length: 5 }, () =>
      performance({ playerId: "aninda", runs: 20, wasOut: true })
    )
  });
  const demo = {
    ...matchRecord({
      id: "average-demo",
      matchDate: "2026-08-04",
      records: Array.from({ length: 5 }, () =>
        performance({ playerId: "arunabha", runs: 100, wasOut: true })
      )
    }),
    isDemo: true
  } as MatchRecord & { isDemo: true };
  const draft = matchRecord({
    id: "average-draft",
    matchDate: "2026-08-04",
    status: "draft",
    records: Array.from({ length: 5 }, () =>
      performance({ playerId: "atripan", runs: 100, wasOut: true })
    )
  });
  const live = matchRecord({
    id: "average-live",
    matchDate: "2026-08-04",
    status: "in_progress",
    records: Array.from({ length: 5 }, () =>
      performance({ playerId: "biplab", runs: 100, wasOut: true })
    )
  });
  const cancelled = matchRecord({
    id: "average-cancelled",
    matchDate: "2026-08-04",
    status: "cancelled",
    records: Array.from({ length: 5 }, () =>
      performance({ playerId: "dipanjan", runs: 100, wasOut: true })
    )
  });
  const deleted = {
    ...matchRecord({
      id: "average-deleted",
      matchDate: "2026-08-04",
      records: Array.from({ length: 5 }, () =>
        performance({ playerId: "gaurav", runs: 100, wasOut: true })
      )
    }),
    deletedAt: "2026-08-05T12:00:00.000Z"
  } as MatchRecord & { deletedAt: string };
  const legacyMissingDismissal = performance({
    playerId: "soman",
    runs: 30,
    wasOut: true
  });
  delete (legacyMissingDismissal as Partial<typeof legacyMissingDismissal>).wasOut;
  const legacy = matchRecord({
    id: "average-legacy-missing-dismissal",
    matchDate: "2026-08-04",
    records: Array.from({ length: 5 }, () => ({ ...legacyMissingDismissal }))
  });
  const entries = getLeaderboardEntries({
    players: activePlayers,
    matches: [official, demo, draft, live, cancelled, deleted, legacy],
    category: "battingAverage",
    period: "all-time"
  });

  assert.equal(entries.find((entry) => entry.player.id === "aninda")?.primaryValue, 20);
  assert.equal(entries.find((entry) => entry.player.id === "aninda")?.rankable, true);
  for (const playerId of ["arunabha", "atripan", "biplab", "dipanjan", "gaurav"]) {
    const entry = entries.find((candidate) => candidate.player.id === playerId);

    assert.equal(entry?.supporting.battingInnings, 0, `${playerId} non-official rows excluded`);
    assert.equal(entry?.rankable, false);
  }
  const soman = entries.find((entry) => entry.player.id === "soman");
  assert.equal(soman?.supporting.battingInnings, 5);
  assert.equal(soman?.supporting.battingDismissals, 0);
  assert.equal(soman?.rankable, false, "missing wasOut is not invented as a dismissal");
});

test("Best Batting Average handles Shared Player batting innings independently", () => {
  const sharedMatch = matchRecord({
    id: "average-shared",
    matchDate: "2026-08-04",
    records: [
      performance({ playerId: "aninda", teamId: "teamA", runs: 20, wasOut: true }),
      performance({ playerId: "aninda", teamId: "teamB", runs: 30, wasOut: false }),
      performance({ playerId: "aninda", teamId: "teamA", runs: 25, wasOut: true }),
      performance({ playerId: "aninda", teamId: "teamB", runs: 35, wasOut: false }),
      performance({ playerId: "aninda", teamId: "teamA", runs: 40, wasOut: true })
    ]
  });
  const entries = getLeaderboardEntries({
    players: activePlayers,
    matches: [sharedMatch],
    category: "battingAverage",
    period: "all-time"
  });
  const aninda = entries.find((entry) => entry.player.id === "aninda");

  assert.equal(aninda?.supporting.battingInnings, 5);
  assert.equal(aninda?.supporting.battingDismissals, 3);
  assert.equal(aninda?.supporting.battingAverageRuns, 150);
  assert.equal(aninda?.displayValue, "50.00 AVG");
});

test("Best Batting Average UI replaces Highest Level only in Hall surfaces", () => {
  const leaderboard = leaderboardSource();
  const leaderboardLib = leaderboardLibSource();
  const css = leaderboardCssSource();
  const formulaRoom = readFileSync("components/stats/FormulaRoom.tsx", "utf8");

  assert.match(leaderboardLib, /BEST BATTING AVERAGE/);
  assert.match(leaderboardLib, /CURRENT RUN BANKER/);
  assert.match(leaderboard, /Minimum 5 batting innings and 1 dismissal/);
  assert.doesNotMatch(leaderboardLib, /HIGHEST LEVEL|CURRENT LEVEL LEGEND|LEVEL LEGENDS/);
  assert.doesNotMatch(leaderboard, /category === "level"|data-category="level"/);
  assert.match(css, /\.leader-quick-card\[data-category="battingAverage"\]/);
  assert.match(formulaRoom, /LEVEL LADDER/);
});

test("Hall podium includes all players at competition ranks one through three", () => {
  const xpTieFirstPlayers = withCareerStats({
    aninda: { xp: 100 },
    arunabha: { xp: 100 },
    atripan: { xp: 90 },
    biplab: { xp: 80 }
  });
  const threeFirstPlayers = withCareerStats({
    aninda: { xp: 100 },
    arunabha: { xp: 100 },
    atripan: { xp: 100 },
    biplab: { xp: 90 }
  });
  const tiedSecondPlayers = withCareerStats({
    aninda: { xp: 100 },
    arunabha: { xp: 90 },
    atripan: { xp: 90 },
    biplab: { xp: 80 }
  });
  const tiedThirdPlayers = withCareerStats({
    rohit: { stats: { matches: 1, runs: 0, wickets: 0, catches: 6, runOuts: 0 } },
    soman: { stats: { matches: 1, runs: 0, wickets: 0, catches: 6, runOuts: 0 } },
    amrit: { stats: { matches: 1, runs: 0, wickets: 0, catches: 4, runOuts: 1 } },
    dipanjan: { stats: { matches: 1, runs: 0, wickets: 0, catches: 4, runOuts: 1 } },
    saurav: { stats: { matches: 1, runs: 0, wickets: 0, catches: 4, runOuts: 0 } }
  });
  const noSecondRankPlayers = withCareerStats({
    aninda: { stats: { matches: 1, runs: 100, wickets: 0, catches: 0 } },
    arunabha: { stats: { matches: 1, runs: 100, wickets: 0, catches: 0 } },
    atripan: { stats: { matches: 1, runs: 90, wickets: 0, catches: 0 } },
    biplab: { stats: { matches: 1, runs: 90, wickets: 0, catches: 0 } },
    dipanjan: { stats: { matches: 1, runs: 90, wickets: 0, catches: 0 } },
    gaurav: { stats: { matches: 1, runs: 80, wickets: 0, catches: 0 } }
  });
  const tiedFirstEntries = getLeaderboardEntries({
    players: xpTieFirstPlayers,
    matches: [],
    category: "xp",
    period: "all-time"
  });
  const threeFirstEntries = getLeaderboardEntries({
    players: threeFirstPlayers,
    matches: [],
    category: "xp",
    period: "all-time"
  });
  const tiedSecondEntries = getLeaderboardEntries({
    players: tiedSecondPlayers,
    matches: [],
    category: "xp",
    period: "all-time"
  });
  const tiedThirdEntries = getLeaderboardEntries({
    players: tiedThirdPlayers,
    matches: [],
    category: "catches",
    period: "all-time"
  });
  const noSecondRankEntries = getLeaderboardEntries({
    players: noSecondRankPlayers,
    matches: [],
    category: "runs",
    period: "all-time"
  });

  assert.deepEqual(
    getLeaderboardPodium(tiedFirstEntries).map((entry) => [entry.player.id, entry.rank]),
    [
      ["aninda", 1],
      ["arunabha", 1],
      ["atripan", 3]
    ]
  );
  assert.deepEqual(
    groupLeaderboardPodiumEntries(tiedFirstEntries).map((group) => [
      group.rank,
      group.entries.map((entry) => entry.player.id)
    ]),
    [
      [1, ["aninda", "arunabha"]],
      [3, ["atripan"]]
    ]
  );
  assert.deepEqual(
    getLeaderboardPodium(threeFirstEntries).map((entry) => [entry.player.id, entry.rank]),
    [
      ["aninda", 1],
      ["arunabha", 1],
      ["atripan", 1]
    ]
  );
  assert.equal(
    getLeaderboardPodium(threeFirstEntries).some((entry) => entry.rank === 4),
    false
  );
  assert.deepEqual(
    groupLeaderboardPodiumEntries(tiedSecondEntries).map((group) => [
      group.rank,
      group.entries.map((entry) => entry.player.id)
    ]),
    [
      [1, ["aninda"]],
      [2, ["arunabha", "atripan"]]
    ]
  );
  assert.deepEqual(
    groupLeaderboardPodiumEntries(tiedThirdEntries).map((group) => [
      group.rank,
      group.entries.map((entry) => entry.player.id)
    ]),
    [
      [1, ["rohit", "soman"]],
      [3, ["amrit", "dipanjan"]]
    ]
  );
  assert.deepEqual(
    tiedThirdEntries
      .filter((entry) => ["rohit", "soman", "amrit", "dipanjan", "saurav"].includes(entry.player.id))
      .map((entry) => [entry.player.id, entry.primaryValue, entry.supporting.runOuts, entry.rank]),
    [
      ["rohit", 6, 0, 1],
      ["soman", 6, 0, 1],
      ["amrit", 4, 1, 3],
      ["dipanjan", 4, 1, 3],
      ["saurav", 4, 0, 5]
    ]
  );
  assert.deepEqual(
    groupLeaderboardPodiumEntries(noSecondRankEntries).map((group) => [
      group.rank,
      group.entries.map((entry) => entry.player.id)
    ]),
    [
      [1, ["aninda", "arunabha"]],
      [3, ["atripan", "biplab", "dipanjan"]]
    ]
  );
  assert.equal(
    getLeaderboardPodium(noSecondRankEntries).some((entry) => entry.player.id === "gaurav"),
    false
  );
});

test("Hall podium preserves single leader and race-not-started behavior", () => {
  const singleLeaderPlayers = withCareerStats({
    aninda: { stats: { matches: 1, runs: 30, wickets: 0, catches: 0 } },
    arunabha: { stats: { matches: 1, runs: 20, wickets: 0, catches: 0 } },
    atripan: { stats: { matches: 1, runs: 10, wickets: 0, catches: 0 } }
  });
  const singleLeaderEntries = getLeaderboardEntries({
    players: singleLeaderPlayers,
    matches: [],
    category: "runs",
    period: "all-time"
  });
  const emptyEntries = getLeaderboardEntries({
    players: withCareerStats({}),
    matches: [],
    category: "catches",
    period: "all-time"
  });

  assert.deepEqual(
    getLeaderboardPodium(singleLeaderEntries).map((entry) => [
      entry.player.id,
      entry.rank
    ]),
    [
      ["aninda", 1],
      ["arunabha", 2],
      ["atripan", 3]
    ]
  );
  assert.deepEqual(getLeaderboardPodium(emptyEntries), []);
  assert.equal(
    getLeaderboardSummary({ category: "catches", entries: emptyEntries }).status,
    "race-not-started"
  );
});

test("Hall podium ranks Best Economy ties with lower economy first", () => {
  const economyMatch = {
    ...matchRecord({
      id: "economy-tie",
      matchDate: "2026-08-05",
      records: [
        performance({ playerId: "aninda" }),
        performance({ playerId: "arunabha" }),
        performance({ playerId: "atripan" }),
        performance({ playerId: "biplab" })
      ]
    }),
    quickScoring: {
      version: 2 as const,
      setupLocked: true,
      battingMode: "two_batter" as const,
      inningsPhase: "second_innings" as const,
      inningsAEvents: [],
      inningsBEvents: [
        ...economyEvents("aninda", Array.from({ length: 18 }, () => 1), 1),
        ...economyEvents("arunabha", Array.from({ length: 18 }, () => 1), 19),
        ...economyEvents("atripan", Array.from({ length: 18 }, () => 2), 37),
        ...economyEvents("biplab", Array.from({ length: 18 }, () => 3), 55)
      ]
    }
  } satisfies MatchRecord;
  const entries = getLeaderboardEntries({
    players: withCareerStats({}),
    matches: [economyMatch],
    category: "economy",
    period: "all-time"
  });

  assert.deepEqual(
    getLeaderboardPodium(entries).map((entry) => [
      entry.player.id,
      entry.rank,
      entry.displayValue
    ]),
    [
      ["aninda", 1, "6.00 ECO"],
      ["arunabha", 1, "6.00 ECO"],
      ["atripan", 3, "12.00 ECO"]
    ]
  );
  assert.equal(
    getLeaderboardPodium(entries).some((entry) => entry.player.id === "biplab"),
    false
  );
});

test("Safe Hands uses run-outs only as a Most Catches tie-breaker", () => {
  const sameCatchesDifferentRunOuts = getLeaderboardEntries({
    players: withCareerStats({
      amrit: { stats: { matches: 1, runs: 0, wickets: 0, catches: 4, runOuts: 1 } },
      saurav: { stats: { matches: 1, runs: 0, wickets: 0, catches: 4, runOuts: 0 } }
    }),
    matches: [],
    category: "catches",
    period: "all-time"
  });
  const sameCatchesSameRunOuts = getLeaderboardEntries({
    players: withCareerStats({
      amrit: { stats: { matches: 1, runs: 0, wickets: 0, catches: 4, runOuts: 1 } },
      dipanjan: { stats: { matches: 1, runs: 0, wickets: 0, catches: 4, runOuts: 1 } }
    }),
    matches: [],
    category: "catches",
    period: "all-time"
  });
  const realExample = getLeaderboardEntries({
    players: withCareerStats({
      rohit: { stats: { matches: 1, runs: 0, wickets: 0, catches: 6, runOuts: 0 } },
      soman: { stats: { matches: 1, runs: 0, wickets: 0, catches: 6, runOuts: 0 } },
      amrit: { stats: { matches: 1, runs: 0, wickets: 0, catches: 4, runOuts: 1 } },
      dipanjan: { stats: { matches: 1, runs: 0, wickets: 0, catches: 4, runOuts: 1 } },
      saurav: { stats: { matches: 1, runs: 0, wickets: 0, catches: 4, runOuts: 0 } }
    }),
    matches: [],
    category: "catches",
    period: "all-time"
  });
  const realSummary = getLeaderboardSummary({
    category: "catches",
    entries: realExample
  });
  const source = leaderboardSource();

  assert.deepEqual(
    sameCatchesDifferentRunOuts
      .filter((entry) => ["amrit", "saurav"].includes(entry.player.id))
      .map((entry) => [entry.player.id, entry.primaryValue, entry.supporting.runOuts, entry.rank]),
    [
      ["amrit", 4, 1, 1],
      ["saurav", 4, 0, 2]
    ]
  );
  assert.deepEqual(
    sameCatchesSameRunOuts
      .filter((entry) => ["amrit", "dipanjan"].includes(entry.player.id))
      .map((entry) => [entry.player.id, entry.primaryValue, entry.supporting.runOuts, entry.rank]),
    [
      ["amrit", 4, 1, 1],
      ["dipanjan", 4, 1, 1]
    ]
  );
  assert.deepEqual(
    realExample
      .filter((entry) => ["rohit", "soman", "amrit", "dipanjan", "saurav"].includes(entry.player.id))
      .map((entry) => [
        entry.player.id,
        entry.displayValue,
        entry.supporting.runOuts,
        entry.rank
      ]),
    [
      ["rohit", "6 CATCHES", 0, 1],
      ["soman", "6 CATCHES", 0, 1],
      ["amrit", "4 CATCHES", 1, 3],
      ["dipanjan", "4 CATCHES", 1, 3],
      ["saurav", "4 CATCHES", 0, 5]
    ]
  );
  assert.deepEqual(
    groupLeaderboardPodiumEntries(realExample).map((group) => [
      group.rank,
      group.entries.map((entry) => entry.player.id)
    ]),
    [
      [1, ["rohit", "soman"]],
      [3, ["amrit", "dipanjan"]]
    ]
  );
  assert.equal(
    getLeaderboardPodium(realExample).some((entry) => entry.player.id === "saurav"),
    false
  );
  assert.equal(realSummary.status, "joint-leaders");
  assert.deepEqual(
    realSummary.leaders.map((entry) => entry.player.id),
    ["rohit", "soman"]
  );
  assert.match(source, /function formatRunOuts/);
  assert.match(source, /formatRunOuts\(entry\.supporting\.runOuts\)/);
  assert.match(source, /formatRunOuts\(entry\.supporting\.runOuts\)} EACH/);
});

test("Safe Hands run-out tie-breaker does not affect other leaderboard categories", () => {
  const runEntries = getLeaderboardEntries({
    players: withCareerStats({
      amrit: { stats: { matches: 1, runs: 25, wickets: 0, catches: 0, runOuts: 4 } },
      saurav: { stats: { matches: 1, runs: 25, wickets: 0, catches: 0, runOuts: 0 } }
    }),
    matches: [],
    category: "runs",
    period: "all-time"
  });
  const wicketEntries = getLeaderboardEntries({
    players: withCareerStats({
      amrit: { stats: { matches: 1, runs: 0, wickets: 2, catches: 0, runOuts: 4 } },
      saurav: { stats: { matches: 1, runs: 0, wickets: 2, catches: 0, runOuts: 0 } }
    }),
    matches: [],
    category: "wickets",
    period: "all-time"
  });

  assert.deepEqual(
    runEntries
      .filter((entry) => ["amrit", "saurav"].includes(entry.player.id))
      .map((entry) => [entry.player.id, entry.rank]),
    [
      ["amrit", 1],
      ["saurav", 1]
    ]
  );
  assert.deepEqual(
    wicketEntries
      .filter((entry) => ["amrit", "saurav"].includes(entry.player.id))
      .map((entry) => [entry.player.id, entry.rank]),
    [
      ["amrit", 1],
      ["saurav", 1]
    ]
  );
});

test("Podium excludes zero-value players but preserves tied podium ranks", () => {
  const oneWinnerPlayers = withCareerStats({
    dipanjan: { stats: { matches: 1, runs: 0, wickets: 3, catches: 0 } }
  });
  const oneWinnerEntries = getLeaderboardEntries({
    players: oneWinnerPlayers,
    matches: [],
    category: "wickets",
    period: "all-time"
  });
  const tiedSecondPlayers = withCareerStats({
    dipanjan: { stats: { matches: 1, runs: 0, wickets: 3, catches: 0 } },
    aninda: { stats: { matches: 1, runs: 0, wickets: 2, catches: 0 } },
    arunabha: { stats: { matches: 1, runs: 0, wickets: 2, catches: 0 } }
  });
  const tiedSecondEntries = getLeaderboardEntries({
    players: tiedSecondPlayers,
    matches: [],
    category: "wickets",
    period: "all-time"
  });

  assert.deepEqual(
    getLeaderboardPodium(oneWinnerEntries).map((entry) => entry.player.id),
    ["dipanjan"]
  );
  assert.deepEqual(
    getLeaderboardPodium(tiedSecondEntries)
      .slice(0, 3)
      .map((entry) => [entry.player.id, entry.rank]),
    [
      ["dipanjan", 1],
      ["aninda", 2],
      ["arunabha", 2]
    ]
  );
});

test("Hall podium chooses visual geometry from distinct rank positions", () => {
  const leaderboard = leaderboardSource();
  const css = leaderboardCssSource();
  const entriesFor = (
    overrides: Parameters<typeof withCareerStats>[0],
    category: "runs" | "xp" = "runs"
  ) =>
    getLeaderboardEntries({
      players: withCareerStats(overrides),
      matches: [],
      category,
      period: "all-time"
    });
  const normalEntries = entriesFor({
    aninda: { stats: { matches: 1, runs: 30, wickets: 0, catches: 0 } },
    arunabha: { stats: { matches: 1, runs: 20, wickets: 0, catches: 0 } },
    atripan: { stats: { matches: 1, runs: 10, wickets: 0, catches: 0 } }
  });
  const tieFirstEntries = entriesFor({
    aninda: { stats: { matches: 1, runs: 30, wickets: 0, catches: 0 } },
    arunabha: { stats: { matches: 1, runs: 30, wickets: 0, catches: 0 } },
    atripan: { stats: { matches: 1, runs: 10, wickets: 0, catches: 0 } }
  });
  const tieSecondEntries = entriesFor({
    aninda: { xp: 100 },
    arunabha: { xp: 80 },
    atripan: { xp: 80 },
    biplab: { xp: 70 }
  }, "xp");
  const tieThirdEntries = entriesFor({
    aninda: { stats: { matches: 1, runs: 30, wickets: 0, catches: 0 } },
    arunabha: { stats: { matches: 1, runs: 20, wickets: 0, catches: 0 } },
    atripan: { stats: { matches: 1, runs: 10, wickets: 0, catches: 0 } },
    biplab: { stats: { matches: 1, runs: 10, wickets: 0, catches: 0 } },
    dipanjan: { stats: { matches: 1, runs: 10, wickets: 0, catches: 0 } }
  });
  const threeWayFirstEntries = entriesFor({
    aninda: { xp: 100 },
    arunabha: { xp: 100 },
    atripan: { xp: 100 },
    biplab: { xp: 70 }
  }, "xp");
  const tieFirstAndThirdEntries = entriesFor({
    aninda: { stats: { matches: 1, runs: 30, wickets: 0, catches: 0 } },
    arunabha: { stats: { matches: 1, runs: 30, wickets: 0, catches: 0 } },
    atripan: { stats: { matches: 1, runs: 10, wickets: 0, catches: 0 } },
    biplab: { stats: { matches: 1, runs: 10, wickets: 0, catches: 0 } },
    dipanjan: { stats: { matches: 1, runs: 10, wickets: 0, catches: 0 } }
  });
  const threeWaySecondEntries = entriesFor({
    aninda: { xp: 100 },
    arunabha: { xp: 80 },
    atripan: { xp: 80 },
    biplab: { xp: 80 },
    dipanjan: { xp: 70 }
  }, "xp");

  assert.deepEqual(
    groupLeaderboardPodiumEntries(normalEntries).map((group) => group.rank),
    [1, 2, 3]
  );
  assert.equal(getPodiumLayoutForEntries(normalEntries), "three");
  assert.deepEqual(
    groupLeaderboardPodiumEntries(tieFirstEntries).map((group) => [
      group.rank,
      group.entries.map((entry) => entry.player.id)
    ]),
    [
      [1, ["aninda", "arunabha"]],
      [3, ["atripan"]]
    ]
  );
  assert.equal(getPodiumLayoutForEntries(tieFirstEntries), "two");
  assert.deepEqual(
    groupLeaderboardPodiumEntries(tieSecondEntries).map((group) => [
      group.rank,
      group.entries.map((entry) => entry.player.id)
    ]),
    [
      [1, ["aninda"]],
      [2, ["arunabha", "atripan"]]
    ]
  );
  assert.equal(getPodiumLayoutForEntries(tieSecondEntries), "two");
  assert.deepEqual(
    groupLeaderboardPodiumEntries(tieThirdEntries).map((group) => [
      group.rank,
      group.entries.map((entry) => entry.player.id)
    ]),
    [
      [1, ["aninda"]],
      [2, ["arunabha"]],
      [3, ["atripan", "biplab", "dipanjan"]]
    ]
  );
  assert.equal(getPodiumLayoutForEntries(tieThirdEntries), "three");
  assert.deepEqual(
    groupLeaderboardPodiumEntries(threeWayFirstEntries).map((group) => [
      group.rank,
      group.entries.map((entry) => entry.player.id)
    ]),
    [[1, ["aninda", "arunabha", "atripan"]]]
  );
  assert.equal(getPodiumLayoutForEntries(threeWayFirstEntries), "one");
  assert.deepEqual(
    groupLeaderboardPodiumEntries(tieFirstAndThirdEntries).map((group) => [
      group.rank,
      group.entries.map((entry) => entry.player.id)
    ]),
    [
      [1, ["aninda", "arunabha"]],
      [3, ["atripan", "biplab", "dipanjan"]]
    ]
  );
  assert.equal(getPodiumLayoutForEntries(tieFirstAndThirdEntries), "two");
  assert.deepEqual(
    groupLeaderboardPodiumEntries(threeWaySecondEntries).map((group) => [
      group.rank,
      group.entries.map((entry) => entry.player.id)
    ]),
    [
      [1, ["aninda"]],
      [2, ["arunabha", "atripan", "biplab"]]
    ]
  );
  assert.equal(getPodiumLayoutForEntries(threeWaySecondEntries), "two");
  assert.equal(
    getLeaderboardPodium(threeWaySecondEntries).some((entry) => entry.rank >= 5),
    false
  );
  assert.match(leaderboard, /JointRankCard/);
  assert.match(leaderboard, /podium-slot-layout-\$\{podiumLayout\}/);
  assert.match(leaderboard, /podiumLayout === "three"[\s\S]*?\[2, 1, 3\]/);
  assert.match(css, /\.podium-card-first\s*{[\s\S]*?transform:\s*translateY\(-38px\)\s*scale\(1\.07\)/);
  assert.match(css, /\.joint-rank-card-first\s*{[\s\S]*?transform:\s*translateY\(-38px\)\s*scale\(1\.07\)/);
  assert.match(css, /\.podium-slot-layout-two\s*{[\s\S]*?align-items:\s*stretch/);
  assert.match(css, /\.podium-slot-layout-one\s*{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*min\(100%,\s*460px\)\)/);
  assert.match(css, /\.joint-rank-player\s*{[\s\S]*?aspect-ratio:\s*2 \/ 3/);
  assert.match(css, /@media \(max-width:\s*820px\)[\s\S]*?\.podium-slot-layout-three \.podium-slot-rank-1\s*{[\s\S]*?order:\s*-1/);
  assert.match(css, /@media \(max-width:\s*540px\)[\s\S]*?\.joint-rank-players,/);
});

test("Cricket stats use bowler wickets, catches and stored XP correctly", () => {
  const careerPlayers = withCareerStats({
    aninda: {
      level: 2,
      xp: 410,
      stats: { matches: 2, runs: 10, wickets: 0, catches: 1 }
    },
    arunabha: {
      level: 1,
      xp: 220,
      stats: { matches: 2, runs: 8, wickets: 1, catches: 0 }
    }
  });
  const matches = [
    matchRecord({
      id: "month",
      matchDate: "2026-08-04",
      records: [
        performance({
          playerId: "aninda",
          wickets: 0,
          catches: 1,
          runOuts: 2,
          awardedXP: 37
        }),
        performance({ playerId: "arunabha", wickets: 1, awardedXP: 12 })
      ],
      bowlingOvers: [bowlingOver("arunabha", 14)]
    })
  ];
  const wicketEntries = getLeaderboardEntries({
    players: careerPlayers,
    matches,
    category: "wickets",
    period: "current-month",
    now: new Date("2026-08-05")
  });
  const catchEntries = getLeaderboardEntries({
    players: careerPlayers,
    matches,
    category: "catches",
    period: "current-month",
    now: new Date("2026-08-05")
  });
  const xpEntries = getLeaderboardEntries({
    players: careerPlayers,
    matches,
    category: "xp",
    period: "current-month",
    now: new Date("2026-08-05")
  });

  assert.equal(wicketEntries.find((entry) => entry.player.id === "aninda")?.primaryValue, 0);
  assert.equal(wicketEntries.find((entry) => entry.player.id === "arunabha")?.primaryValue, 1);
  assert.equal(catchEntries[0].player.id, "aninda");
  assert.equal(catchEntries[0].primaryValue, 1);
  assert.equal(xpEntries[0].player.id, "aninda");
  assert.equal(xpEntries[0].primaryValue, 37);
});

test("Zero states distinguish race-not-started for unqualified Hall categories", () => {
  const careerPlayers = withCareerStats({});
  const catchEntries = getLeaderboardEntries({
    players: careerPlayers,
    matches: [],
    category: "catches",
    period: "all-time"
  });
  const battingAverageEntries = getLeaderboardEntries({
    players: careerPlayers,
    matches: [],
    category: "battingAverage",
    period: "all-time"
  });

  assert.equal(
    getLeaderboardSummary({ category: "catches", entries: catchEntries }).status,
    "race-not-started"
  );
  assert.equal(
    getLeaderboardSummary({
      category: "battingAverage",
      entries: battingAverageEntries
    }).status,
    "race-not-started"
  );
  assert.equal(hasAnyFinalisedLeaderboardData(careerPlayers, []), false);
});

test("Hall of Legends full rankings include new players without positive podium placement", () => {
  const entries = getLeaderboardEntries({
    players: activePlayers,
    matches: [],
    category: "runs",
    period: "all-time"
  });

  for (const playerId of newPlayerIds) {
    const entry = entries.find((candidate) => candidate.player.id === playerId);

    assert.ok(entry);
    assert.equal(entry?.primaryValue, 0);
    assert.equal(entry?.supporting.matches, 0);
  }

  assert.deepEqual(getLeaderboardPodium(entries), []);
});

test("Finalised matches are saved for Leaderboard history when match is finalised", () => {
  const form = matchFormSource();

  assert.match(form, /localMatchRepository\.saveMatch\(finalisedMatch\)/);
  assert.match(form, /applyFinalisedMatchToLocalCareerStats\(finalisedMatch\)/);
});
