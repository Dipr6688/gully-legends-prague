import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildLocalDemoImportPlan,
  EXPECTED_LOCAL_DEMO_MATCH_COUNT,
  IMPORT_DEMO_CONFIRMATION_PHRASE
} from "../lib/admin/local-demo-import";
import {
  validateCareerStatsRows,
  validateProgressionLedgerRows,
  validateSupabaseMatchPayload,
  validateSupabasePlayers,
  verifySupabaseDataSnapshot
} from "../lib/admin/supabase-data-check";
import {
  CAREER_PROGRESS_STORAGE_KEY,
  type AppliedPlayerMatchProgression,
  type CareerProgressionState,
  type PlayerCareerStats
} from "../lib/career-store";
import { activePlayers } from "../lib/data/players";
import { MATCH_HISTORY_STORAGE_KEY } from "../lib/match-history-store";
import { MONTHLY_BEASTS_STORAGE_KEY } from "../lib/monthly-beasts-store";
import { createCrownedMonthlyBeasts } from "../lib/monthly-beasts";
import type {
  FinalisedPlayerMatchRecord,
  MatchRecord,
  PlayerMatchXPBreakdown
} from "../lib/types/match";
import type {
  SupabaseCareerStatsRow,
  SupabaseMatchRow,
  SupabaseMatchStatApplicationRow,
  SupabasePlayerRow
} from "../lib/supabase/read-repositories";

function source(path: string) {
  return readFileSync(path, "utf8");
}

test("Supabase SSR packages and clients are configured", () => {
  const packageJson = source("package.json");
  const browserClient = source("lib/supabase/client.ts");
  const serverClient = source("lib/supabase/server.ts");
  const proxyClient = source("lib/supabase/proxy.ts");
  const rootProxy = source("proxy.ts");

  assert.match(packageJson, /@supabase\/supabase-js/);
  assert.match(packageJson, /@supabase\/ssr/);
  assert.match(browserClient, /createBrowserClient/);
  assert.match(serverClient, /createServerClient/);
  assert.match(serverClient, /cookies/);
  assert.match(proxyClient, /getClaims/);
  assert.match(rootProxy, /export async function proxy/);
  assert.match(rootProxy, /updateSession/);
});

test("admin role migration creates admin_users and is_admin without hardcoded UID", () => {
  const migration = source("supabase/migrations/20260807090000_admin_users.sql");

  assert.match(migration, /create table if not exists public\.admin_users/);
  assert.match(migration, /user_id uuid primary key references auth\.users\(id\) on delete cascade/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /create or replace function public\.is_admin\(\)/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /where user_id = auth\.uid\(\)/);
  assert.doesNotMatch(
    migration,
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
  );
});

test("admin login uses Admin ID mapping and generic errors", () => {
  const action = source("app/admin/login/actions.ts");
  const page = source("app/admin/login/page.tsx");

  assert.match(page, /CONTROL ROOM/);
  assert.match(page, /ADMIN ACCESS/);
  assert.match(page, /Admin ID/);
  assert.match(page, /Password/);
  assert.match(page, /ENTER CONTROL ROOM/);
  assert.match(page, /INVALID ADMIN ID OR PASSWORD/);
  assert.doesNotMatch(page, /ADMIN_LOGIN_EMAIL|email/i);
  assert.match(action, /getAdminLoginConfig/);
  assert.match(action, /adminId !== config\.adminId/);
  assert.match(action, /email: config\.adminEmail/);
  assert.match(action, /signInWithPassword/);
  assert.match(action, /isAdminWithClient/);
  assert.match(action, /invalidLoginRedirect/);
});

test("admin route is protected and non-admin sessions are signed out", () => {
  const adminPage = source("app/admin/page.tsx");
  const auth = source("lib/admin/auth.ts");
  const proxy = source("lib/supabase/proxy.ts");

  assert.match(adminPage, /await requireAdmin\(\)/);
  assert.match(auth, /export async function requireAdmin/);
  assert.match(auth, /supabase\.auth\.signOut\(\)/);
  assert.match(proxy, /isAdminPath/);
  assert.match(proxy, /isAdminAuthUtilityPath/);
  assert.match(proxy, /supabase\.rpc\("is_admin"\)/);
  assert.match(proxy, /supabase\.auth\.signOut\(\)/);
  assert.match(proxy, /NextResponse\.redirect\(new URL\("\/admin\/login"/);
});

test("admin login links to password recovery without offering signup", () => {
  const page = source("app/admin/login/page.tsx");

  assert.match(page, /FORGOT PASSWORD\?/);
  assert.match(page, /href="\/admin\/forgot-password"/);
  assert.match(page, /PASSWORD UPDATED SUCCESSFULLY/);
  assert.doesNotMatch(page, /sign\s*up|signup|create account/i);
});

test("forgot password sends generic reset response using hidden server email", () => {
  const page = source("app/admin/forgot-password/page.tsx");
  const action = source("app/admin/forgot-password/actions.ts");
  const env = source("lib/admin/env.ts");

  assert.match(page, /RESET ADMIN PASSWORD/);
  assert.match(page, /Admin ID/);
  assert.match(page, /SEND RESET LINK/);
  assert.match(
    page,
    /IF THE ADMIN ACCOUNT IS VALID, A RESET LINK HAS BEEN SENT\./
  );
  assert.doesNotMatch(page, /ADMIN_LOGIN_EMAIL|email/i);
  assert.match(action, /adminId !== config\.adminId/);
  assert.match(action, /resetPasswordForEmail\(config\.adminEmail/);
  assert.match(action, /redirectTo/);
  assert.match(action, /genericSentRedirect/);
  assert.match(env, /getAdminPasswordResetRedirectUrl/);
  assert.match(env, /NEXT_PUBLIC_SITE_URL/);
  assert.match(env, /callbackUrl\.searchParams\.set\("next", "\/admin\/reset-password"\)/);
});

test("PKCE recovery callback exchanges code and redirects to reset password", () => {
  const callback = source("app/auth/callback/route.ts");

  assert.match(callback, /exchangeCodeForSession\(code\)/);
  assert.match(callback, /getSafeNextPath/);
  assert.match(callback, /"\/admin\/reset-password\?error=session"/);
  assert.match(callback, /NextResponse\.redirect\(new URL\(next/);
});

test("reset password requires admin session validates password and updates Supabase user", () => {
  const page = source("app/admin/reset-password/page.tsx");
  const action = source("app/admin/reset-password/actions.ts");

  assert.match(page, /SET NEW PASSWORD/);
  assert.match(page, /New Password/);
  assert.match(page, /Confirm Password/);
  assert.match(page, /UPDATE PASSWORD/);
  assert.match(page, /getAdminSessionState/);
  assert.match(page, /Request New Reset Link/);
  assert.match(action, /minimumPasswordLength = 8/);
  assert.match(action, /newPassword !== confirmPassword/);
  assert.match(action, /getUser\(\)/);
  assert.match(action, /isAdminWithClient/);
  assert.match(action, /updateUser\(\{[\s\S]*password: newPassword/);
  assert.match(action, /signOut\(\)/);
  assert.match(action, /redirect\("\/admin\/login\?reset=success"\)/);
});

test("password recovery does not create users or modify admin role records", () => {
  const recoverySources = [
    source("app/admin/forgot-password/actions.ts"),
    source("app/admin/reset-password/actions.ts"),
    source("app/auth/callback/route.ts")
  ].join("\n");

  assert.doesNotMatch(recoverySources, /signUp/);
  assert.doesNotMatch(recoverySources, /insert\s+into\s+public\.admin_users/i);
  assert.doesNotMatch(recoverySources, /admin_users\.insert|from\("admin_users"\)\.insert/);
});

test("password recovery never logs or persists plaintext passwords", () => {
  const recoverySources = [
    source("app/admin/forgot-password/actions.ts"),
    source("app/admin/reset-password/actions.ts"),
    source("app/admin/reset-password/page.tsx"),
    source("app/admin/forgot-password/page.tsx")
  ].join("\n");

  assert.doesNotMatch(recoverySources, /console\.(log|error|warn|info)/);
  assert.doesNotMatch(recoverySources, /localStorage|sessionStorage/);
  assert.doesNotMatch(recoverySources, /ADMIN_PASSWORD/);
});

test("navbar routes Admin by verified state and exposes logout", () => {
  const header = source("components/navigation/SiteHeader.tsx");
  const links = source("components/navigation/NavigationLinks.tsx");

  assert.match(header, /isCurrentUserAdmin/);
  assert.match(header, /isAdmin \? "\/admin" : "\/admin\/login"/);
  assert.match(header, /logoutAdmin/);
  assert.match(header, /Log Out/);
  assert.match(links, /adminHref/);
  assert.match(links, /href=\{adminHref\}/);
});

test("?admin=1 and localStorage grant no administrator authority", () => {
  const monthly = source("components/monthly-beasts/MonthlyBeastsFeature.tsx");
  const gallery = source("components/gallery/GalleryFeature.tsx");
  const monthlyPage = source("app/monthly-beasts/page.tsx");
  const galleryPage = source("app/gallery/page.tsx");

  for (const file of [monthly, gallery, monthlyPage, galleryPage]) {
    assert.doesNotMatch(file, /gully-legends-admin-mode/);
    assert.doesNotMatch(file, /requestedAdminMode/);
    assert.doesNotMatch(file, /searchParams\.get\("admin"\)/);
  }

  assert.match(monthlyPage, /isCurrentUserAdmin/);
  assert.match(galleryPage, /isCurrentUserAdmin/);
});

test("public pages do not require login", () => {
  const publicPages = [
    "app/page.tsx",
    "app/players/page.tsx",
    "app/players/[playerId]/page.tsx",
    "app/matches/page.tsx",
    "app/leaderboard/page.tsx",
    "app/monthly-beasts/page.tsx",
    "app/stats/page.tsx",
    "app/gallery/page.tsx"
  ];

  for (const path of publicPages) {
    assert.doesNotMatch(source(path), /requireAdmin/);
  }
});

test("private admin email and passwords are not rendered to browser-facing UI", () => {
  const browserFacingFiles = [
    "components/navigation/SiteHeader.tsx",
    "components/navigation/NavigationLinks.tsx",
    "components/gallery/GalleryFeature.tsx",
    "components/monthly-beasts/MonthlyBeastsFeature.tsx",
    "app/admin/login/page.tsx",
    "app/admin/forgot-password/page.tsx",
    "app/admin/reset-password/page.tsx",
    "app/admin/page.tsx"
  ];

  for (const path of browserFacingFiles) {
    const text = source(path);
    assert.doesNotMatch(text, /ADMIN_LOGIN_EMAIL/);
    assert.doesNotMatch(text, /ADMIN_PASSWORD/);
    assert.doesNotMatch(text, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/);
  }
});

function xpBreakdown(awardedXP: number): PlayerMatchXPBreakdown {
  return {
    participationXP: 20,
    winBonusXP: 5,
    playerOfMatchXP: 0,
    battingRunsXP: awardedXP,
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

function finalisedRecord({
  playerId,
  teamId,
  runs,
  awardedXP,
  playerOfMatch = false
}: {
  playerId: string;
  teamId: "teamA" | "teamB";
  runs: number;
  awardedXP: number;
  playerOfMatch?: boolean;
}): FinalisedPlayerMatchRecord {
  return {
    playerId,
    teamId,
    played: true,
    playerOfMatch,
    didBat: true,
    runs,
    wasOut: false,
    wickets: teamId === "teamA" ? 1 : 0,
    hatTricks: 0,
    catches: teamId === "teamB" ? 1 : 0,
    runOuts: 0,
    stumpings: 0,
    xpBreakdown: xpBreakdown(awardedXP),
    progressionAppliedAt: "2026-08-05T12:00:00.000Z"
  };
}

function demoMatch(index: number): MatchRecord {
  const teamAPlayerId = activePlayers[0].id;
  const teamBPlayerId = activePlayers[1].id;
  const teamARecord = finalisedRecord({
    playerId: teamAPlayerId,
    teamId: "teamA",
    runs: 20 + index,
    awardedXP: 30 + index,
    playerOfMatch: index === 1
  });
  const teamBRecord = finalisedRecord({
    playerId: teamBPlayerId,
    teamId: "teamB",
    runs: 10 + index,
    awardedXP: 20 + index
  });
  const teamARuns = Number(teamARecord.runs);
  const teamBRuns = Number(teamBRecord.runs);

  return {
    id: `demo-match-${index}`,
    matchDate: `2026-08-${String(index).padStart(2, "0")}`,
    matchNumber: index,
    startTime: "18:30",
    deletedAt: null,
    matchName: `Demo Match ${index}`,
    venue: "CZU Gully Arena",
    status: "finalised",
    scheduledOversPerInnings: 4,
    battingFirstTeamId: "teamA",
    chasingTeamId: "teamB",
    sharedPlayerId: null,
    teams: {
      teamA: {
        teamId: "teamA",
        teamName: "Team A",
        playerIds: [teamAPlayerId],
        playerPerformances: [teamARecord],
        bowlingOvers: [],
        totalRuns: teamARuns,
        completedBowlingOvers: 0
      },
      teamB: {
        teamId: "teamB",
        teamName: "Team B",
        playerIds: [teamBPlayerId],
        playerPerformances: [teamBRecord],
        bowlingOvers: [],
        totalRuns: teamBRuns,
        completedBowlingOvers: 0
      }
    },
    innings: {
      first: {
        battingTeamId: "teamA",
        bowlingTeamId: "teamB",
        runs: teamARuns,
        wicketsLost: 0,
        extras: 0,
        playerCount: 1,
        completedOvers: 0,
        battingPerformances: [teamARecord],
        bowlingOvers: []
      },
      second: {
        battingTeamId: "teamB",
        bowlingTeamId: "teamA",
        runs: teamBRuns,
        wicketsLost: 0,
        extras: 0,
        playerCount: 1,
        completedOvers: 0,
        battingPerformances: [teamBRecord],
        bowlingOvers: []
      }
    },
    result: {
      type: "win_by_runs",
      winnerTeamId: "teamA",
      loserTeamId: "teamB",
      marginRuns: 10
    },
    finalisedPlayerRecords: [teamARecord, teamBRecord],
    progressionAppliedAt: "2026-08-05T12:00:00.000Z",
    appliedFinalisationVersion: 1
  };
}

function career(playerId: string, overrides: Partial<PlayerCareerStats> = {}): PlayerCareerStats {
  return {
    playerId,
    matches: 0,
    inningsBatted: 0,
    runs: 0,
    fifties: 0,
    centuries: 0,
    dismissedDucks: 0,
    wickets: 0,
    catches: 0,
    runOuts: 0,
    stumpings: 0,
    hatTricks: 0,
    threeWicketHauls: 0,
    matchesBowled: 0,
    completedOvers: 0,
    totalRunsConceded: 0,
    totalXP: 0,
    level: 0,
    ...overrides
  };
}

function localDemoStorage(overrides: Record<string, unknown> = {}) {
  const matches = Array.from(
    { length: EXPECTED_LOCAL_DEMO_MATCH_COUNT },
    (_, index) => demoMatch(index + 1)
  );
  const firstPlayerId = activePlayers[0].id;
  const playerCareers = Object.fromEntries(
    activePlayers.map((player) => [
      player.id,
      career(player.id, player.id === firstPlayerId ? {
        matches: 6,
        inningsBatted: 6,
        runs: 123,
        wickets: 6,
        catches: 2,
        totalXP: 250,
        level: 1
      } : {})
    ])
  );
  const appliedProgressions = Object.fromEntries(
    matches.map((match) => {
      const idempotencyKey = `${match.id}:${firstPlayerId}`;

      return [
        idempotencyKey,
        {
          idempotencyKey,
          matchId: match.id,
          playerId: firstPlayerId,
          xpBreakdown: xpBreakdown(40),
          progressionAppliedAt: "2026-08-05T12:00:00.000Z",
          appliedFinalisationVersion: 1
        }
      ];
    })
  );
  const currentCrown = createCrownedMonthlyBeasts({
    matches,
    monthKey: "2026-08",
    crownedAt: "2026-08-31T20:00:00.000Z",
    crownedBy: "local-admin"
  });
  const storage = {
    [MATCH_HISTORY_STORAGE_KEY]: matches,
    [CAREER_PROGRESS_STORAGE_KEY]: {
      playerCareers,
      appliedProgressions
    },
    [MONTHLY_BEASTS_STORAGE_KEY]: [currentCrown],
    ...overrides
  };
  const writes: string[] = [];

  return {
    writes,
    reader: {
      getItem(key: string) {
        return key in storage
          ? JSON.stringify(storage[key as keyof typeof storage])
          : null;
      },
      setItem(key: string) {
        writes.push(key);
      }
    }
  };
}

test("admin local demo importer route is protected and uses normal RLS writes", () => {
  const page = source("app/admin/import-local-data/page.tsx");
  const component = source("components/admin/LocalDemoImportTool.tsx");
  const planner = source("lib/admin/local-demo-import.ts");

  assert.match(page, /await requireAdmin\(\)/);
  assert.match(component, /createSupabaseBrowserClient/);
  assert.match(component, /VALIDATE DATA/);
  assert.match(component, /IMPORT TO SUPABASE/);
  assert.match(component, /staleCrownAcknowledged/);
  assert.match(component, /will NOT be\s+imported/);
  assert.match(component, /IMPORT_DEMO_CONFIRMATION_PHRASE/);
  assert.match(planner, new RegExp(IMPORT_DEMO_CONFIRMATION_PHRASE));
  assert.match(component, /runStage\("players"[\s\S]*"id"\)/);
  assert.match(component, /runStage\("matches"[\s\S]*"id"\)/);
  assert.match(component, /runStage\("careerStats"[\s\S]*"player_id"\)/);
  assert.match(component, /runStage\([\s\S]*"matchStatApplications"[\s\S]*"idempotency_key"/);
  assert.match(planner, /is_demo:\s*true/);

  for (const text of [page, component, planner]) {
    assert.doesNotMatch(text, /SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE|service-role/i);
    assert.doesNotMatch(text, /indexedDB|galleryPhotoBlobs|GALLERY_BLOB_STORE/);
  }
});

test("local demo import preview rebuilds clean IDs totals demo flags and local storage", () => {
  const storage = localDemoStorage();
  const plan = buildLocalDemoImportPlan(storage.reader);

  assert.deepEqual(plan.errors, []);
  assert.equal(plan.preview.players, 21);
  assert.equal(plan.preview.demoMatches, 6);
  assert.equal(plan.preview.careerRecords, 21);
  assert.equal(plan.preview.progressionRecords, 12);
  assert.equal(plan.preview.monthlyBeastCrowns, 1);
  assert.equal(plan.statuses.careerRecords, "REBUILT / VALID");
  assert.equal(plan.statuses.progressionRecords, "REBUILT / VALID");
  assert.ok(plan.payload);
  assert.equal(plan.payload.players[0].id, activePlayers[0].id);
  assert.deepEqual(
    plan.payload.matches.map((match) => match.id),
    Array.from({ length: 6 }, (_, index) => `demo-match-${index + 1}`)
  );
  assert.ok(plan.payload.matches.every((match) => match.is_demo === true));
  assert.ok(
    plan.payload.matches.every(
      (match) => match.stats_applied_at === "2026-08-05T12:00:00.000Z"
    )
  );
  assert.equal(
    plan.payload.careerStats.find((row) => row.player_id === activePlayers[0].id)?.runs,
    141
  );
  assert.notEqual(
    plan.payload.careerStats.find((row) => row.player_id === activePlayers[0].id)
      ?.total_xp,
    250
  );
  assert.equal(plan.payload.matchStatApplications[0].match_id, "demo-match-1");
  assert.equal(plan.payload.matchStatApplications[0].player_id, activePlayers[0].id);
  assert.ok(
    plan.payload.monthlyBeastCrowns.every((crown) => crown.is_demo === true)
  );
  assert.equal(new Set(plan.payload.players.map((row) => row.id)).size, 21);
  assert.equal(new Set(plan.payload.matches.map((row) => row.id)).size, 6);
  assert.equal(
    new Set(
      plan.payload.matchStatApplications.map((row) => row.idempotency_key)
    ).size,
    12
  );
  assert.deepEqual(storage.writes, []);
});

test("local demo importer rebuilds missing careers and ignores eight stale progressions", () => {
  const matches = Array.from(
    { length: EXPECTED_LOCAL_DEMO_MATCH_COUNT },
    (_, index) => demoMatch(index + 1)
  );
  const currentCrown = createCrownedMonthlyBeasts({
    matches,
    monthKey: "2026-08",
    crownedAt: "2026-08-31T20:00:00.000Z",
    crownedBy: "local-admin"
  });
  const missingCareerIds = ["amrit", "pritvi", "suprateem"];
  const playerCareers = Object.fromEntries(
    activePlayers
      .filter((player) => !missingCareerIds.includes(player.id))
      .map((player) => [player.id, career(player.id)])
  );
  const staleProgressions = Object.fromEntries(
    Array.from({ length: 8 }, (_, index) => {
      const playerId = activePlayers[index % 2].id;
      const idempotencyKey = `old-missing-match-${index + 1}:${playerId}`;
      const progression: AppliedPlayerMatchProgression = {
        idempotencyKey,
        matchId: `old-missing-match-${index + 1}`,
        playerId,
        xpBreakdown: xpBreakdown(80 + index),
        progressionAppliedAt: "2026-07-20T12:00:00.000Z",
        appliedFinalisationVersion: 1
      };

      return [idempotencyKey, progression];
    })
  );
  const localCareerState: CareerProgressionState = {
    playerCareers,
    appliedProgressions: staleProgressions
  };
  const storage = localDemoStorage({
    [MATCH_HISTORY_STORAGE_KEY]: matches,
    [CAREER_PROGRESS_STORAGE_KEY]: localCareerState,
    [MONTHLY_BEASTS_STORAGE_KEY]: [currentCrown]
  });
  const plan = buildLocalDemoImportPlan(storage.reader);

  assert.deepEqual(plan.errors, []);
  assert.ok(plan.payload);
  assert.equal(plan.preview.careerRecords, 21);
  assert.equal(plan.preview.progressionRecords, 12);
  assert.deepEqual(
    plan.audit.missingCanonicalCareerPlayerIds.sort(),
    missingCareerIds.sort()
  );
  assert.equal(plan.audit.staleProgressionsIgnored, 8);
  assert.equal(plan.audit.staleProgressionsWithExistingLocalMatches, 0);
  assert.ok(plan.audit.staleProgressionsAffectLocalTotals);
  assert.ok(
    plan.payload.matchStatApplications.every((row) =>
      matches.some((match) => match.id === row.match_id)
    )
  );
  assert.ok(
    plan.payload.matchStatApplications.every(
      (row) => !row.match_id.includes("old-missing-match")
    )
  );
  assert.equal(
    plan.payload.careerStats.find((row) => row.player_id === "amrit")?.matches,
    0
  );
  assert.equal(
    plan.payload.careerStats.find((row) => row.player_id === "amrit")?.total_xp,
    0
  );
  assert.deepEqual(storage.writes, []);
});

test("local demo importer excludes mismatched monthly beast crowns without blocking core data", () => {
  const badCrown = createCrownedMonthlyBeasts({
    matches: Array.from(
      { length: EXPECTED_LOCAL_DEMO_MATCH_COUNT },
      (_, index) => demoMatch(index + 1)
    ),
    monthKey: "2026-08",
    crownedAt: "2026-08-31T20:00:00.000Z",
    crownedBy: "local-admin"
  });
  const storage = localDemoStorage({
    [MONTHLY_BEASTS_STORAGE_KEY]: [
      {
        ...badCrown,
        batting: {
          playerIds: [activePlayers[1].id],
          xp: 1
        }
      }
    ]
  });
  const plan = buildLocalDemoImportPlan(storage.reader);

  assert.deepEqual(plan.errors, []);
  assert.ok(plan.payload);
  assert.equal(plan.preview.monthlyBeastCrowns, 0);
  assert.equal(plan.payload.monthlyBeastCrowns.length, 0);
  assert.equal(plan.statuses.monthlyBeastCrowns, "STALE CROWN EXCLUDED");
  assert.ok(plan.audit.monthlyCrownMismatches.length > 0);
  assert.equal(plan.audit.localMonthlyBeastCrowns, 1);
  assert.equal(plan.audit.validMonthlyBeastCrownsForImport, 0);
  assert.equal(plan.audit.staleCrownsExcluded, 1);
  assert.match(plan.audit.staleCrownExclusionReasons.join("\n"), /Stale demo crown excluded/);
  assert.deepEqual(storage.writes, []);
});

test("local demo importer rejects malformed local records before writing", () => {
  const badMatch = demoMatch(1);
  badMatch.teams.teamA.playerIds = ["ghost-player"];
  const storage = localDemoStorage({
    [MATCH_HISTORY_STORAGE_KEY]: [
      badMatch,
      ...Array.from({ length: 5 }, (_, index) => demoMatch(index + 2))
    ]
  });
  const plan = buildLocalDemoImportPlan(storage.reader);

  assert.equal(plan.payload, null);
  assert.match(plan.errors.join("\n"), /unknown player ghost-player/);
  assert.deepEqual(storage.writes, []);
});

function playerRow(playerId: string): SupabasePlayerRow {
  const player = activePlayers.find((candidate) => candidate.id === playerId) ?? activePlayers[0];

  return {
    id: player.id,
    slug: player.slug,
    display_name: player.name,
    card_title: player.cardTitle,
    role: player.role,
    card_image: player.cardImage,
    play_styles: [...player.playStyles],
    tags: [...player.tags],
    profile_payload: {
      battingProfile: player.battingProfile,
      bowlingProfile: player.bowlingProfile,
      fieldingProfile: player.fieldingProfile,
      heroSummary: player.heroSummary,
      specialMoveName: player.specialMoveName,
      specialMoveDescription: player.specialMoveDescription,
      funTrait: player.funTrait,
      avatar: player.avatar
    },
    accent: player.accent,
    accent_color: player.accentColor,
    is_active: true
  };
}

function matchRow(match: MatchRecord, overrides: Partial<SupabaseMatchRow> = {}): SupabaseMatchRow {
  return {
    id: match.id,
    match_date: match.matchDate,
    start_time: match.startTime ?? null,
    match_sequence: null,
    name: match.matchName,
    venue: match.venue,
    status: match.status,
    is_demo: true,
    payload: match,
    finalised_at: match.progressionAppliedAt ?? null,
    stats_applied_at: match.progressionAppliedAt ?? null,
    deleted_at: match.deletedAt ?? null,
    updated_at: "2026-08-05T12:00:00.000Z",
    ...overrides
  };
}

function careerRow(playerId: string, overrides: Partial<SupabaseCareerStatsRow> = {}): SupabaseCareerStatsRow {
  return {
    player_id: playerId,
    matches: 0,
    innings_batted: 0,
    runs: 0,
    fifties: 0,
    centuries: 0,
    dismissed_ducks: 0,
    wickets: 0,
    catches: 0,
    run_outs: 0,
    stumpings: 0,
    hat_tricks: 0,
    three_wicket_hauls: 0,
    matches_bowled: 0,
    completed_overs: 0,
    total_runs_conceded: 0,
    total_xp: 0,
    level: 0,
    stats_payload: {},
    updated_at: "2026-08-05T12:00:00.000Z",
    ...overrides
  };
}

function progressionRow({
  matchId,
  playerId,
  idempotencyKey = `${matchId}:${playerId}`
}: {
  matchId: string;
  playerId: string;
  idempotencyKey?: string;
}): SupabaseMatchStatApplicationRow {
  return {
    match_id: matchId,
    player_id: playerId,
    idempotency_key: idempotencyKey,
    xp_breakdown: xpBreakdown(20),
    applied_at: "2026-08-05T12:00:00.000Z",
    finalisation_version: 1
  };
}

test("Supabase data check route is admin-only and diagnostics are read-only", () => {
  const page = source("app/admin/supabase-data-check/page.tsx");
  const repositories = source("lib/supabase/read-repositories.ts");
  const verifier = source("lib/admin/supabase-data-check.ts");

  assert.match(page, /await requireAdmin\(\)/);
  assert.match(page, /Supabase Data Check/);
  assert.match(page, /SELECT-only reads/);
  assert.match(repositories, /class SupabasePlayerRepository/);
  assert.match(repositories, /class SupabaseMatchRepository/);
  assert.match(repositories, /class SupabaseCareerStatsRepository/);
  assert.match(repositories, /class SupabaseMonthlyBeastCrownRepository/);
  assert.match(repositories, /runPublicRlsReadChecks/);
  assert.match(verifier, /getMonthlyBeastSummary/);
  assert.match(verifier, /getLeaderboardEntries/);
  assert.match(verifier, /getLeaderboardSummary/);

  for (const text of [page, repositories, verifier]) {
    assert.doesNotMatch(text, /\.insert\(/);
    assert.doesNotMatch(text, /\.update\(/);
    assert.doesNotMatch(text, /\.delete\(/);
    assert.doesNotMatch(text, /\.upsert\(/);
    assert.doesNotMatch(text, /SERVICE_ROLE|SUPABASE_SERVICE_ROLE_KEY/i);
  }
});

test("Supabase player and MatchRecord diagnostics parse canonical read responses", () => {
  const players = activePlayers.map((player) => playerRow(player.id));
  const match = demoMatch(1);
  const row = matchRow(match, { match_sequence: null });
  const playerValidation = validateSupabasePlayers(players);
  const matchValidation = validateSupabaseMatchPayload(row);

  assert.equal(players.length, 21);
  assert.deepEqual(playerValidation.issues, []);
  assert.equal(playerValidation.ok, true);
  assert.deepEqual(matchValidation.issues, []);
  assert.equal(matchValidation.match?.id, match.id);
});

test("Supabase MatchRecord validation rejects malformed payloads and checks demo flag", () => {
  const match = demoMatch(1);
  const malformed = validateSupabaseMatchPayload(matchRow(match, {
    payload: {
      id: match.id,
      status: "finalised"
    }
  }));
  const result = verifySupabaseDataSnapshot({
    snapshot: {
      players: activePlayers.map((player) => playerRow(player.id)),
      matches: [matchRow(match, { is_demo: false })],
      careerStats: activePlayers.map((player) => careerRow(player.id)),
      matchStatApplications: [],
      monthlyBeastCrowns: [],
      galleryPhotos: []
    }
  });

  assert.match(malformed.issues.join("\n"), /payload is not a valid MatchRecord/);
  assert.equal(result.demoFlags.ok, false);
  assert.match(result.demoFlags.issues.join("\n"), /is_demo = true/);
});

test("Supabase career and progression diagnostics catch bad references and duplicates", () => {
  const careerValidation = validateCareerStatsRows([
    careerRow(activePlayers[0].id),
    careerRow("ghost-player")
  ]);
  const progressionValidation = validateProgressionLedgerRows({
    rows: [
      progressionRow({
        matchId: "demo-match-1",
        playerId: activePlayers[0].id,
        idempotencyKey: "duplicate-key"
      }),
      progressionRow({
        matchId: "demo-match-1",
        playerId: activePlayers[0].id,
        idempotencyKey: "duplicate-key"
      }),
      progressionRow({
        matchId: "missing-match",
        playerId: "ghost-player"
      })
    ],
    matchIds: new Set(["demo-match-1"]),
    playerIds: new Set(activePlayers.map((player) => player.id))
  });

  assert.equal(careerValidation.ok, false);
  assert.match(careerValidation.issues.join("\n"), /unknown player ghost-player/);
  assert.equal(progressionValidation.ok, false);
  assert.equal(progressionValidation.orphaned, 1);
  assert.equal(progressionValidation.duplicateIdempotencyKeys, 1);
  assert.equal(progressionValidation.duplicateLogicalApplications, 1);
});

test("Supabase diagnostics reuse Monthly Beast and Hall engines in memory", () => {
  const matches = Array.from({ length: 6 }, (_, index) => demoMatch(index + 1));
  const snapshot = {
    players: activePlayers.map((player) => playerRow(player.id)),
    matches: matches.map((match) => matchRow(match)),
    careerStats: activePlayers.map((player, index) =>
      careerRow(player.id, {
        matches: index < 2 ? 6 : 0,
        runs: index === 0 ? 141 : 0,
        wickets: index === 0 ? 6 : 0,
        catches: index === 1 ? 6 : 0,
        total_xp: index === 0 ? 201 : 0,
        level: index === 0 ? 1 : 0
      })
    ),
    matchStatApplications: Array.from({ length: 52 }, (_, index) =>
      progressionRow({
        matchId: matches[Math.floor(index / activePlayers.length)].id,
        playerId: activePlayers[index % activePlayers.length].id
      })
    ),
    monthlyBeastCrowns: [],
    galleryPhotos: []
  };
  const result = verifySupabaseDataSnapshot({ snapshot });

  assert.equal(result.counts.every((check) => check.ok), true);
  assert.equal(result.monthlyBeast.usesExistingEngine, true);
  assert.equal(result.hallOfLegends.usesExistingEngine, true);
  assert.equal(result.monthlyBeast.summaries.length, 3);
  assert.equal(result.hallOfLegends.summaries.length, 5);
});

test("Phase 2C2 public read pages use Supabase loaders without requiring auth", () => {
  const publicPages = [
    source("app/page.tsx"),
    source("app/players/page.tsx"),
    source("app/players/[playerId]/page.tsx"),
    source("app/matches/page.tsx"),
    source("app/matches/[matchId]/page.tsx"),
    source("app/leaderboard/page.tsx"),
    source("app/monthly-beasts/page.tsx")
  ];
  const combinedPages = publicPages.join("\n");

  assert.match(combinedPages, /isSupabaseDataSource/);
  assert.match(combinedPages, /loadPublicSupabaseReadData/);
  assert.match(combinedPages, /Try Again Soon/);
  assert.doesNotMatch(combinedPages, /requireAdmin/);
  assert.match(source("app/monthly-beasts/page.tsx"), /isCurrentUserAdmin/);
  assert.match(source("app/loading.tsx"), /Warming Up The Scoreboard/);
});

test("Phase 2C2 Supabase public loader maps shared data and validates payloads", () => {
  const loader = source("lib/supabase/public-read-data.ts");
  const dataSource = source("lib/data-source.ts");

  assert.match(dataSource, /NEXT_PUBLIC_DATA_SOURCE/);
  assert.match(dataSource, /"local" \? "local" : "supabase"/);
  assert.match(loader, /SupabasePlayerRepository/);
  assert.match(loader, /SupabaseMatchRepository/);
  assert.match(loader, /SupabaseCareerStatsRepository/);
  assert.match(loader, /SupabaseMonthlyBeastCrownRepository/);
  assert.match(loader, /validateSupabaseMatchPayload/);
  assert.match(loader, /mergePlayersWithCareerState/);
  assert.match(loader, /match_sequence/);

  for (const text of [loader, dataSource]) {
    assert.doesNotMatch(text, /\.insert\(/);
    assert.doesNotMatch(text, /\.update\(/);
    assert.doesNotMatch(text, /\.delete\(/);
    assert.doesNotMatch(text, /\.upsert\(/);
  }
});

test("Phase 2C2 keeps Gallery local and Phase 2D moves match writes behind admin Supabase APIs", () => {
  const gallery = source("components/gallery/GalleryFeature.tsx");
  const matchForm = source("components/matches/MockMatchEntryForm.tsx");
  const monthlyFeature = source("components/monthly-beasts/MonthlyBeastsFeature.tsx");
  const matchWriteRoute = source("app/api/admin/matches/route.ts");
  const matchFinaliseRoute = source("app/api/admin/matches/finalize/route.ts");
  const matchWriteRepository = source("lib/supabase/match-write-repository.ts");
  const matchFinalisationPlan = source("lib/supabase/match-finalisation-plan.ts");
  const matchFinalisationRepository = source("lib/supabase/match-finalisation-repository.ts");
  const matchWriteClient = source("lib/admin-match-write-client.ts");
  const atomicFinalisationSql = source("supabase/migrations/20260807103000_atomic_match_finalisation.sql");

  assert.match(gallery, /LocalGalleryRepository|useMatchRepository/);
  assert.doesNotMatch(gallery, /SupabaseGalleryPhotoRepository|loadPublicSupabaseReadData/);
  assert.match(matchForm, /saveSupabaseAdminMatch/);
  assert.match(matchForm, /finalizeSupabaseAdminMatch/);
  assert.match(matchForm, /applyFinalisedMatchToLocalCareerStats/);
  assert.match(matchWriteClient, /\/api\/admin\/matches/);
  assert.match(matchWriteClient, /\/api\/admin\/matches\/finalize/);
  assert.match(matchWriteRoute, /isAdminWithClient/);
  assert.match(matchWriteRoute, /validateMatchOnServer/);
  assert.match(matchFinaliseRoute, /ADMIN LOGIN REQUIRED/);
  assert.match(matchFinaliseRoute, /ADMIN ACCESS REQUIRED/);
  assert.match(matchFinaliseRoute, /isAdminWithClient/);
  assert.match(matchFinaliseRoute, /validateMatchOnServer/);
  assert.match(matchFinaliseRoute, /hasActiveCrown/);
  assert.match(matchFinaliseRoute, /buildFinalisationPlan/);
  assert.match(matchFinaliseRoute, /finalizeAtomically/);
  assert.match(matchWriteRepository, /SupabaseAdminMatchWriteRepository/);
  assert.match(matchWriteRepository, /\.insert\(/);
  assert.match(matchWriteRepository, /\.update\(/);
  assert.match(matchFinalisationPlan, /applyFinalisedMatchToCareerStats/);
  assert.match(matchFinalisationPlan, /FINALISATION_VERSION/);
  assert.match(matchFinalisationPlan, /existingApplications/);
  assert.match(matchFinalisationRepository, /client\.rpc\("finalize_match_atomic"/);
  assert.match(atomicFinalisationSql, /create or replace function public\.finalize_match_atomic/);
  assert.match(atomicFinalisationSql, /security definer/);
  assert.match(atomicFinalisationSql, /set search_path = ''/);
  assert.match(atomicFinalisationSql, /for update/);
  assert.match(atomicFinalisationSql, /stale_match/);
  assert.match(atomicFinalisationSql, /stale_career/);
  assert.match(atomicFinalisationSql, /match_stat_applications/);
  assert.match(monthlyFeature, /monthlyBeastCrownRepository\.crownMonth/);
  assert.match(monthlyFeature, /supabaseReadMode/);
  assert.match(monthlyFeature, /write phase is implemented/);
});

test("Phase 2D1 admin match writes are protected and do not mutate finalisation data", () => {
  const newMatchPage = source("app/matches/new/page.tsx");
  const matchWriteRoute = source("app/api/admin/matches/route.ts");
  const matchWriteRepository = source("lib/supabase/match-write-repository.ts");

  assert.match(newMatchPage, /await requireAdmin\(\)/);
  assert.match(matchWriteRoute, /ADMIN LOGIN REQUIRED/);
  assert.match(matchWriteRoute, /ADMIN ACCESS REQUIRED/);
  assert.match(matchWriteRoute, /operation: "save"/);
  assert.match(matchWriteRoute, /operation: "delete"/);
  assert.match(matchWriteRoute, /validationInputFromMatch/);
  assert.match(matchWriteRepository, /USE MATCH FINALISATION WORKFLOW/);
  assert.match(matchWriteRepository, /live_match_conflict/);
  assert.match(matchWriteRepository, /stale_record/);
  assert.match(matchWriteRepository, /is_demo: existing\?\.is_demo \?\? false/);
  assert.doesNotMatch(matchWriteRoute + matchWriteRepository, /player_career_stats|match_stat_applications/);
});
