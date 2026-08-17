import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { activePlayers } from "../lib/data/players";
import {
  LEADERBOARD_CATEGORIES,
  getLeaderboardEntries,
  getLeaderboardPodium,
  getLeaderboardSummary,
  hasAnyFinalisedLeaderboardData,
  parseLocalMatchDate
} from "../lib/leaderboard";
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
  awardedXP = 0
}: {
  playerId: string;
  teamId?: TeamId;
  runs?: number;
  wickets?: number;
  catches?: number;
  runOuts?: number;
  awardedXP?: number;
}) {
  return {
    playerId,
    teamId,
    played: true,
    playerOfMatch: false,
    didBat: true,
    runs,
    wasOut: false,
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
  assert.match(css, /\.leader-quick-card\[data-category="level"\]/);
  assert.match(css, /\.duck-collector-tease/);
  assert.match(css, /\.duck-collector-tease::after/);
  assert.match(css, /\.podium-grid\s*{[\s\S]*?minmax\(0,\s*1\.08fr\)/);
  assert.match(css, /\.podium-card-first\s*{[\s\S]*?translateY\(-38px\)\s*scale\(1\.07\)/);
  assert.match(leaderboard, /const hasJointFirstPlace = firstPlaceEntries\.length > 1/);
  assert.match(leaderboard, /placement="joint-first"/);
  assert.match(css, /\.joint-winners-grid\s*{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.joint-winners-grid > \*\s*{[\s\S]*?transform:\s*none/);
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
    "level"
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
  assert.equal(LEADERBOARD_CATEGORIES.level.label, "HIGHEST LEVEL");
  assert.equal(
    LEADERBOARD_CATEGORIES.level.icon,
    "/ui/leaderboard/highest-level.png"
  );

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
    "level"
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

test("Joint first-place podium uses equal winner cards while unique first keeps elevation", () => {
  const leaderboard = leaderboardSource();
  const css = leaderboardCssSource();
  const threeLeaderPlayers = withCareerStats({
    aninda: { stats: { matches: 1, runs: 30, wickets: 0, catches: 0 } },
    arunabha: { stats: { matches: 1, runs: 30, wickets: 0, catches: 0 } },
    atripan: { stats: { matches: 1, runs: 30, wickets: 0, catches: 0 } }
  });
  const entries = getLeaderboardEntries({
    players: threeLeaderPlayers,
    matches: [],
    category: "runs",
    period: "all-time"
  });

  assert.deepEqual(
    entries.slice(0, 3).map((entry) => [entry.player.id, entry.rank]),
    [
      ["aninda", 1],
      ["arunabha", 1],
      ["atripan", 1]
    ]
  );
  assert.match(leaderboard, /hasJointFirstPlace \? \(/);
  assert.match(leaderboard, /<div className="podium-grid">\{orderedCards\}<\/div>/);
  assert.match(css, /\.podium-card-first\s*{[\s\S]*?transform:\s*translateY\(-38px\)\s*scale\(1\.07\)/);
  assert.match(css, /\.podium-card-joint-first[\s\S]*?transform:\s*translateY\(0\)/);
  assert.match(css, /\.joint-winners-count-2\s*{[\s\S]*?justify-content:\s*center/);
  assert.match(css, /@media \(max-width:\s*820px\)[\s\S]*?\.joint-winners-grid\s*{[\s\S]*?repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media \(max-width:\s*540px\)[\s\S]*?\.joint-winners-grid,[\s\S]*?grid-template-columns:\s*1fr/);
});

test("Cricket stats use bowler wickets, catches, stored XP and career Level correctly", () => {
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
  const levelEntries = getLeaderboardEntries({
    players: careerPlayers,
    matches,
    category: "level",
    period: "current-month",
    now: new Date("2026-08-05")
  });

  assert.equal(wicketEntries.find((entry) => entry.player.id === "aninda")?.primaryValue, 0);
  assert.equal(wicketEntries.find((entry) => entry.player.id === "arunabha")?.primaryValue, 1);
  assert.equal(catchEntries[0].player.id, "aninda");
  assert.equal(catchEntries[0].primaryValue, 1);
  assert.equal(xpEntries[0].player.id, "aninda");
  assert.equal(xpEntries[0].primaryValue, 37);
  assert.equal(levelEntries[0].player.id, "aninda");
  assert.equal(levelEntries[0].primaryValue, 2);
});

test("Zero states distinguish race-not-started and all Level 0 tied", () => {
  const careerPlayers = withCareerStats({});
  const catchEntries = getLeaderboardEntries({
    players: careerPlayers,
    matches: [],
    category: "catches",
    period: "all-time"
  });
  const levelEntries = getLeaderboardEntries({
    players: careerPlayers,
    matches: [],
    category: "level",
    period: "all-time"
  });

  assert.equal(
    getLeaderboardSummary({ category: "catches", entries: catchEntries }).status,
    "race-not-started"
  );
  assert.equal(
    getLeaderboardSummary({ category: "level", entries: levelEntries }).status,
    "all-tied"
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
