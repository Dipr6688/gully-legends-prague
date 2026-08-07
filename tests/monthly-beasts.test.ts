import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { players } from "../lib/data/players";
import { getLeaderboardEntries } from "../lib/leaderboard";
import {
  createCrownedMonthlyBeasts,
  getCrownedMonthlyBeasts,
  getFinalisedMatchesForMonth,
  getMonthlyBeastDashboardPreview,
  getMonthlyBeastStandings,
  getMonthlyBeastSummary,
  getMonthlyBeastCategoryXp,
  isFutureMonthKey
} from "../lib/monthly-beasts";
import {
  LocalMonthlyBeastCrownRepository,
  MONTHLY_BEASTS_STORAGE_KEY
} from "../lib/monthly-beasts-store";
import type {
  BowlingOver,
  FinalisedPlayerMatchRecord,
  MatchRecord,
  MatchStatus,
  PlayerMatchXPBreakdown,
  TeamId
} from "../lib/types/match";

const monthlyFeatureSource = () =>
  readFileSync("components/monthly-beasts/MonthlyBeastsFeature.tsx", "utf8");
const dashboardMonthlySource = () =>
  readFileSync("components/dashboard/MonthlyBeastsPanel.tsx", "utf8");
const formulaRoomSource = () =>
  readFileSync("components/stats/FormulaRoom.tsx", "utf8");
const monthlyStoreSource = () =>
  readFileSync("lib/monthly-beasts-store.ts", "utf8");
const matchEntrySource = () =>
  readFileSync("components/matches/MockMatchEntryForm.tsx", "utf8");
const cssSource = () => readFileSync("app/globals.css", "utf8");
const packageSource = () => readFileSync("package.json", "utf8");

function withMockWindow(run: () => void) {
  const previousWindow = (globalThis as { window?: unknown }).window;
  const storage = new Map<string, string>();

  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    },
    dispatchEvent: () => undefined
  };

  try {
    run();
  } finally {
    (globalThis as { window?: unknown }).window = previousWindow;
  }
}

function xpBreakdown(
  overrides: Partial<PlayerMatchXPBreakdown> = {}
): PlayerMatchXPBreakdown {
  const base = {
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
    rawTotalXP: 0,
    awardedXP: 0
  };
  const next = { ...base, ...overrides };

  return {
    ...next,
    rawTotalXP: overrides.rawTotalXP ?? next.awardedXP,
    awardedXP: overrides.awardedXP ?? next.awardedXP
  };
}

function record({
  playerId,
  teamId = "teamA",
  runs = 0,
  didBat = runs > 0,
  wickets = 0,
  catches = 0,
  runOuts = 0,
  stumpings = 0,
  breakdown = xpBreakdown()
}: {
  playerId: string;
  teamId?: TeamId;
  runs?: number;
  didBat?: boolean;
  wickets?: number;
  catches?: number;
  runOuts?: number;
  stumpings?: number;
  breakdown?: PlayerMatchXPBreakdown;
}): FinalisedPlayerMatchRecord {
  return {
    playerId,
    teamId,
    played: true,
    playerOfMatch: false,
    didBat,
    runs,
    wasOut: false,
    wickets,
    hatTricks: 0,
    catches,
    runOuts,
    stumpings,
    xpBreakdown: breakdown
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
  records: FinalisedPlayerMatchRecord[];
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
          .filter((performance) => performance.teamId === "teamA")
          .map((performance) => performance.playerId),
        playerPerformances: records.filter(
          (performance) => performance.teamId === "teamA"
        ),
        bowlingOvers,
        totalRuns: 0,
        completedBowlingOvers: bowlingOvers.length
      },
      teamB: {
        teamId: "teamB",
        teamName: "Team B",
        playerIds: records
          .filter((performance) => performance.teamId === "teamB")
          .map((performance) => performance.playerId),
        playerPerformances: records.filter(
          (performance) => performance.teamId === "teamB"
        ),
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

test("Hall of Legends current month uses raw stats while Monthly Beasts uses category XP", () => {
  const matches = [
    matchRecord({
      id: "aug-main",
      matchDate: "2026-08-05",
      records: [
        record({
          playerId: "aninda",
          runs: 120,
          wickets: 4,
          catches: 3,
          breakdown: xpBreakdown({
            battingRunsXP: 30,
            battingMilestoneXP: 40,
            wicketXP: 20,
            fieldingXP: 18,
            awardedXP: 128
          })
        }),
        record({
          playerId: "arunabha",
          runs: 50,
          wickets: 3,
          catches: 2,
          runOuts: 1,
          breakdown: xpBreakdown({
            battingRunsXP: 25,
            battingMilestoneXP: 15,
            wicketXP: 35,
            fieldingXP: 20,
            awardedXP: 95
          })
        })
      ]
    }),
    matchRecord({
      id: "aug-extra-batting",
      matchDate: "2026-08-12",
      records: [
        record({
          playerId: "arunabha",
          runs: 50,
          breakdown: xpBreakdown({
            battingRunsXP: 25,
            battingMilestoneXP: 15,
            awardedXP: 40
          })
        })
      ]
    })
  ];
  const now = new Date(2026, 7, 18);

  assert.equal(
    getLeaderboardEntries({
      players,
      matches,
      category: "runs",
      period: "current-month",
      now
    })[0].player.id,
    "aninda"
  );
  assert.equal(
    getMonthlyBeastSummary({
      matches,
      monthKey: "2026-08",
      category: "batting"
    }).leaders[0].playerId,
    "arunabha"
  );

  assert.equal(
    getLeaderboardEntries({
      players,
      matches,
      category: "wickets",
      period: "current-month",
      now
    })[0].player.id,
    "aninda"
  );
  assert.equal(
    getMonthlyBeastSummary({
      matches,
      monthKey: "2026-08",
      category: "bowling"
    }).leaders[0].playerId,
    "arunabha"
  );

  assert.equal(
    getLeaderboardEntries({
      players,
      matches,
      category: "catches",
      period: "current-month",
      now
    })[0].player.id,
    "aninda"
  );
  assert.equal(
    getMonthlyBeastSummary({
      matches,
      monthKey: "2026-08",
      category: "fielding"
    }).leaders[0].playerId,
    "arunabha"
  );
});

test("Monthly Beast category XP excludes participation win and Player of the Match XP", () => {
  const match = matchRecord({
    id: "base-xp-only",
    matchDate: "2026-08-05",
    records: [
      record({
        playerId: "biplab",
        didBat: false,
        breakdown: xpBreakdown({
          participationXP: 20,
          winBonusXP: 5,
          playerOfMatchXP: 15,
          awardedXP: 40
        })
      })
    ]
  });

  assert.equal(
    getMonthlyBeastStandings({
      matches: [match],
      monthKey: "2026-08",
      category: "batting"
    }).length,
    0
  );
});

test("Monthly Beast calculations use finalised matchDate month only", () => {
  const matches = [
    matchRecord({
      id: "aug",
      matchDate: "2026-08-05",
      records: [
        record({
          playerId: "aninda",
          runs: 20,
          breakdown: xpBreakdown({ battingRunsXP: 10, awardedXP: 10 })
        })
      ]
    }),
    matchRecord({
      id: "jul",
      matchDate: "2026-07-28",
      records: [
        record({
          playerId: "arunabha",
          runs: 50,
          breakdown: xpBreakdown({ battingRunsXP: 25, battingMilestoneXP: 15 })
        })
      ]
    }),
    matchRecord({
      id: "draft",
      matchDate: "2026-08-18",
      status: "draft",
      records: [
        record({
          playerId: "atripan",
          runs: 100,
          breakdown: xpBreakdown({ battingRunsXP: 30, battingMilestoneXP: 40 })
        })
      ]
    })
  ];

  assert.equal(getFinalisedMatchesForMonth({ matches, monthKey: "2026-08" }).length, 1);
  assert.equal(
    getMonthlyBeastSummary({
      matches,
      monthKey: "2026-08",
      category: "batting"
    }).leaders[0].playerId,
    "aninda"
  );
  assert.equal(
    getMonthlyBeastSummary({
      matches,
      monthKey: "2026-07",
      category: "batting"
    }).leaders[0].playerId,
    "arunabha"
  );
  assert.equal(isFutureMonthKey("2026-09", new Date(2026, 7, 15)), true);
});

test("Bowling Beast includes wicket hat-trick maiden and expensive-over XP, but run-outs do not help bowling", () => {
  const match = matchRecord({
    id: "bowling-engine",
    matchDate: "2026-08-05",
    records: [
      record({
        playerId: "aninda",
        wickets: 2,
        breakdown: xpBreakdown({
          wicketXP: 20,
          hatTrickXP: 25,
          maidenXP: 5,
          expensiveOverPenaltyXP: -12
        })
      }),
      record({
        playerId: "arunabha",
        wickets: 0,
        runOuts: 2,
        breakdown: xpBreakdown({ fieldingXP: 16 })
      })
    ]
  });

  assert.equal(
    getMonthlyBeastSummary({
      matches: [match],
      monthKey: "2026-08",
      category: "bowling"
    }).leaders[0].categoryXp,
    38
  );
  assert.equal(
    getMonthlyBeastStandings({
      matches: [match],
      monthKey: "2026-08",
      category: "bowling"
    }).some((standing) => standing.playerId === "arunabha"),
    false
  );
});

test("Fielding Beast uses catches and run-outs, respects the cap, and ignores stumpings", () => {
  const match = matchRecord({
    id: "fielding-engine",
    matchDate: "2026-08-05",
    records: [
      record({
        playerId: "aninda",
        catches: 2,
        runOuts: 2,
        stumpings: 3,
        breakdown: xpBreakdown({ fieldingXP: 24 })
      }),
      record({
        playerId: "arunabha",
        catches: 0,
        runOuts: 0,
        stumpings: 3,
        breakdown: xpBreakdown({ fieldingXP: 24 })
      })
    ]
  });

  assert.equal(
    getMonthlyBeastCategoryXp({
      match,
      performance: match.finalisedPlayerRecords![0],
      category: "fielding"
    }),
    24
  );
  assert.equal(
    getMonthlyBeastCategoryXp({
      match,
      performance: match.finalisedPlayerRecords![1],
      category: "fielding"
    }),
    0
  );
});

test("Joint leaders share rank one and crowned snapshots preserve all winners", () => {
  const matches = [
    matchRecord({
      id: "joint",
      matchDate: "2026-08-05",
      records: [
        record({
          playerId: "aninda",
          runs: 40,
          breakdown: xpBreakdown({ battingRunsXP: 20 })
        }),
        record({
          playerId: "arunabha",
          runs: 40,
          breakdown: xpBreakdown({ battingRunsXP: 20 })
        }),
        record({
          playerId: "atripan",
          runs: 20,
          breakdown: xpBreakdown({ battingRunsXP: 10 })
        })
      ]
    })
  ];
  const summary = getMonthlyBeastSummary({
    matches,
    monthKey: "2026-08",
    category: "batting"
  });
  const snapshot = createCrownedMonthlyBeasts({
    matches,
    monthKey: "2026-08",
    crownedAt: "2026-08-31T20:00:00.000Z"
  });

  assert.equal(summary.status, "joint-leaders");
  assert.deepEqual(
    summary.leaders.map((leader) => [leader.rank, leader.playerId]),
    [
      [1, "aninda"],
      [1, "arunabha"]
    ]
  );
  assert.deepEqual(
    snapshot.batting.playerIds,
    ["aninda", "arunabha"]
  );
  assert.equal(
    getCrownedMonthlyBeasts({
      crownedAwards: [snapshot],
      monthKey: "2026-08"
    })?.batting.playerIds.length,
    2
  );
});

test("Empty Monthly Beast races do not fill top-three rows with zero-XP players", () => {
  const match = matchRecord({
    id: "empty",
    matchDate: "2026-08-05",
    records: [
      record({
        playerId: "aninda",
        didBat: false,
        breakdown: xpBreakdown({ participationXP: 20, awardedXP: 20 })
      })
    ]
  });
  const summary = getMonthlyBeastSummary({
    matches: [match],
    monthKey: "2026-08",
    category: "batting"
  });

  assert.equal(summary.status, "race-not-started");
  assert.equal(summary.topThree.length, 0);
});

test("Monthly Beasts can include a new roster player after qualifying XP", () => {
  const matches = [
    matchRecord({
      id: "new-player-beast",
      matchDate: "2026-08-15",
      records: [
        record({
          playerId: "naim",
          runs: 34,
          breakdown: xpBreakdown({ battingRunsXP: 17, awardedXP: 37 })
        })
      ]
    })
  ];
  const summary = getMonthlyBeastSummary({
    matches,
    monthKey: "2026-08",
    category: "batting"
  });

  assert.equal(summary.leaders[0].playerId, "naim");
  assert.equal(summary.leaders[0].categoryXp, 17);
});

test("Dashboard preview switches from live leaders to crowned winners", () => {
  const matches = [
    matchRecord({
      id: "live",
      matchDate: "2026-08-05",
      records: [
        record({
          playerId: "aninda",
          runs: 20,
          breakdown: xpBreakdown({ battingRunsXP: 10 })
        })
      ]
    })
  ];
  const playerNames = Object.fromEntries(players.map((player) => [player.id, player.name]));
  const livePreview = getMonthlyBeastDashboardPreview({
    matches,
    crownedAwards: [],
    monthKey: "2026-08",
    playerNames
  });
  const snapshot = createCrownedMonthlyBeasts({
    matches,
    monthKey: "2026-08",
    crownedAt: "2026-08-31T20:00:00.000Z"
  });
  const crownedPreview = getMonthlyBeastDashboardPreview({
    matches: [],
    crownedAwards: [snapshot],
    monthKey: "2026-08",
    playerNames
  });

  assert.equal(livePreview[0].primaryText, "Aninda");
  assert.equal(livePreview[0].supportingText, "Leading the race");
  assert.equal(crownedPreview[0].primaryText, "Aninda");
  assert.equal(crownedPreview[0].supportingText, "AUGUST winner");
});

test("Monthly Beast crowns are active versioned snapshots with joint winners preserved", () => {
  withMockWindow(() => {
    const repository = new LocalMonthlyBeastCrownRepository();
    const matches = [
      matchRecord({
        id: "joint-crown",
        matchDate: "2026-08-05",
        records: [
          record({
            playerId: "dipanjan",
            runs: 60,
            breakdown: xpBreakdown({ battingRunsXP: 30 })
          }),
          record({
            playerId: "naim",
            runs: 60,
            breakdown: xpBreakdown({ battingRunsXP: 30 })
          }),
          record({
            playerId: "pritvi",
            wickets: 3,
            breakdown: xpBreakdown({ wicketXP: 30 })
          })
        ]
      })
    ];
    const crown = repository.crownMonth({
      monthKey: "2026-08",
      matches,
      crownedAt: "2026-08-31T20:00:00.000Z"
    });

    assert.equal(crown.version, 1);
    assert.equal(crown.status, "active");
    assert.deepEqual(crown.batting.playerIds, ["dipanjan", "naim"]);
    assert.equal(crown.batting.xp, 30);
    assert.equal(repository.getActiveCrown("2026-08")?.id, crown.id);
    assert.match(
      (globalThis as { window: { localStorage: { getItem: (key: string) => string | null } } }).window.localStorage.getItem(MONTHLY_BEASTS_STORAGE_KEY) ?? "",
      /"status":"active"/
    );
  });
});

test("Reopening revokes the active crown and recrowning creates version two", () => {
  withMockWindow(() => {
    const repository = new LocalMonthlyBeastCrownRepository();
    const matches = [
      matchRecord({
        id: "versioned-crown",
        matchDate: "2026-08-05",
        records: [
          record({
            playerId: "badhan",
            catches: 2,
            breakdown: xpBreakdown({ fieldingXP: 12 })
          })
        ]
      })
    ];
    const firstCrown = repository.crownMonth({
      monthKey: "2026-08",
      matches,
      crownedAt: "2026-08-31T20:00:00.000Z"
    });

    repository.reopenMonth("2026-08", "local-admin");

    assert.equal(repository.getActiveCrown("2026-08"), null);
    assert.equal(repository.listCrownHistory("2026-08")[0].status, "revoked");

    const secondCrown = repository.crownMonth({
      monthKey: "2026-08",
      matches,
      crownedAt: "2026-09-02T20:00:00.000Z"
    });
    const history = repository.listCrownHistory("2026-08");

    assert.equal(firstCrown.version, 1);
    assert.equal(secondCrown.version, 2);
    assert.equal(repository.getActiveCrown("2026-08")?.id, secondCrown.id);
    assert.deepEqual(
      history.map((crown) => [crown.version, crown.status]),
      [
        [2, "active"],
        [1, "revoked"]
      ]
    );
  });
});

test("Monthly Beasts UI replaces placeholder copy and links to Formula Room", () => {
  const feature = monthlyFeatureSource();
  const dashboard = dashboardMonthlySource();
  const formulaRoom = formulaRoomSource();
  const store = monthlyStoreSource();
  const matchEntry = matchEntrySource();
  const css = cssSource();
  const packageJson = packageSource();

  assert.match(feature, /MONTHLY BEASTS/);
  assert.match(feature, /Three battles\. Three crowns\. One month to become a Beast\./);
  assert.match(feature, /How are Beasts decided\?/);
  assert.match(feature, /href="\/stats#monthly-beasts"/);
  assert.match(feature, /role="dialog"/);
  assert.match(feature, /Crown Winners/);
  assert.match(feature, /I confirm that all matches/);
  assert.match(feature, /This month is still in progress/);
  assert.match(feature, /I understand and still want to crown this month/);
  assert.match(feature, /Reopen Month/);
  assert.match(feature, /Crown History/);
  assert.match(feature, /function ReopenMonthMenu/);
  assert.match(feature, /createPortal\(popover, document\.body\)/);
  assert.match(feature, /getBoundingClientRect\(\)/);
  assert.match(feature, /window\.innerHeight/);
  assert.match(feature, /shouldFlip/);
  assert.match(feature, /position:\s*"fixed"/);
  assert.match(feature, /document\.addEventListener\("pointerdown"/);
  assert.match(feature, /event\.key === "Escape"/);
  assert.match(feature, /setIsOpen\(\(current\) => !current\)/);
  assert.match(feature, /export function MonthlyBeastsFeature\(\{/);
  assert.match(feature, /initialMatches/);
  assert.match(feature, /supabaseReadMode/);
  assert.doesNotMatch(feature, /useLocalAdminMode/);
  assert.doesNotMatch(feature, /gully-legends-admin-mode/);
  assert.match(feature, /monthlyBeastCrownRepository\.crownMonth/);
  assert.match(feature, /monthlyBeastCrownRepository\.reopenMonth/);
  assert.match(feature, /crownSupabaseMonthlyBeasts/);
  assert.match(feature, /reopenSupabaseMonthlyBeasts/);
  assert.doesNotMatch(feature, /write phase is implemented/);
  assert.match(feature, /Past Beasts/);
  assert.doesNotMatch(feature, /Monthly awards are intentionally empty/i);
  assert.match(dashboard, /Fielding Beast/);
  assert.doesNotMatch(dashboard, /Catching Beast|Not decided yet/);
  assert.match(dashboard, /View Monthly Beasts/);
  assert.match(formulaRoom, /id="monthly-beasts"/);
  assert.match(formulaRoom, /Participation, win bonus\s+and Player of the Match XP do not count/);
  assert.match(store, /type MonthlyBeastCrownRepository/);
  assert.match(store, /status: "revoked"/);
  assert.match(store, /version/);
  assert.match(matchEntry, /has already been crowned/);
  assert.match(matchEntry, /skipMonthlyCrownGuard/);
  assert.match(matchEntry, /monthlyBeastCrownRepository\.getActiveCrown/);
  assert.match(css, /\.monthly-beasts-control-panel[\s\S]*?overflow:\s*hidden/);
  assert.match(css, /\.monthly-beasts-admin-popover\s*{/);
  assert.match(packageJson, /monthly-beasts\.test\.js/);
});

test("Monthly Beast Supabase writes use server calculation and protected RPCs", () => {
  const feature = monthlyFeatureSource();
  const monthlyPage = readFileSync("app/monthly-beasts/page.tsx", "utf8");
  const crownRoute = readFileSync("app/api/admin/monthly-beasts/crown/route.ts", "utf8");
  const reopenRoute = readFileSync("app/api/admin/monthly-beasts/reopen/route.ts", "utf8");
  const client = readFileSync("lib/admin-monthly-beasts-client.ts", "utf8");
  const plan = readFileSync("lib/supabase/monthly-beast-write-plans.ts", "utf8");
  const repository = readFileSync("lib/supabase/monthly-beast-write-repository.ts", "utf8");
  const migration = readFileSync(
    "supabase/migrations/20260807110000_monthly_beast_writes_and_demo_reset.sql",
    "utf8"
  );

  assert.match(feature, /CrownDialog/);
  assert.match(feature, /I confirm that all matches/);
  assert.match(feature, /This month is still in progress/);
  assert.match(feature, /crownSupabaseMonthlyBeasts\(selectedMonth\)/);
  assert.match(feature, /reopenSupabaseMonthlyBeasts\(reopenMonthKey\)/);
  assert.match(monthlyPage, /loadSupabaseReadData/);
  assert.match(monthlyPage, /createSupabaseServerClient/);
  assert.match(crownRoute, /ADMIN LOGIN REQUIRED/);
  assert.match(crownRoute, /ADMIN ACCESS REQUIRED/);
  assert.match(crownRoute, /buildCrownMonthlyBeastsPlan/);
  assert.match(crownRoute, /SupabaseMatchRepository/);
  assert.match(crownRoute, /SupabaseMonthlyBeastCrownRepository/);
  assert.match(crownRoute, /crownMonth\(plan\)/);
  assert.match(reopenRoute, /ADMIN LOGIN REQUIRED/);
  assert.match(reopenRoute, /ADMIN ACCESS REQUIRED/);
  assert.match(reopenRoute, /reopenMonth\(body\.monthKey\)/);
  assert.match(client, /\/api\/admin\/monthly-beasts\/crown/);
  assert.match(client, /\/api\/admin\/monthly-beasts\/reopen/);
  assert.match(plan, /createCrownedMonthlyBeasts/);
  assert.match(plan, /getFinalisedMatchesForMonth/);
  assert.match(plan, /isDemo: rowsForMonth\.some/);
  assert.match(repository, /crown_monthly_beasts_atomic/);
  assert.match(repository, /reopen_monthly_beast_crown/);
  assert.match(migration, /create or replace function public\.crown_monthly_beasts_atomic/);
  assert.match(migration, /create or replace function public\.reopen_monthly_beast_crown/);
  assert.match(migration, /public\.is_admin\(\)/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /active_crown_exists/);
  assert.match(migration, /jsonb_typeof\(snapshot->'playerIds'\)/);
  assert.match(migration, /jsonb_array_length\(snapshot->'playerIds'\) = 0/);
  assert.match(migration, /count\(distinct player_id\.value\)/);
  assert.match(migration, /from public\.players/);
  assert.match(migration, /status = 'revoked'/);
  assert.match(migration, /coalesce\(max\(version\), 0\) \+ 1/);
});
