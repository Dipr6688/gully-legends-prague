import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getPragueMatchDateFromTimestamp,
  isValidIsoCalendarDate
} from "../lib/app-sync/prague-date";
import { XP_RULES, calculateSharedPlayerMatchXP } from "../lib/progression";
import { deriveQuickScoringInnings, undoLastQuickScoringEvent } from "../lib/quick-scoring";
import type { PlayerMatchPerformance, QuickScoringEvent } from "../lib/types/match";

const timestamp = "2026-08-19T10:00:00.000Z";

function event(
  sequence: number,
  overrides: Partial<QuickScoringEvent> = {}
): QuickScoringEvent {
  return {
    id: `event-${sequence}`,
    sequence,
    battingTeamId: "teamA",
    bowlingTeamId: "teamB",
    strikerId: "aninda",
    nonStrikerId: "arunabha",
    bowlerId: "atripan",
    batterRuns: 0,
    extraType: null,
    extras: 0,
    legalDelivery: true,
    wicket: null,
    timestamp,
    ...overrides
  };
}

test("app-sync derives Prague match date from startedAt instead of UTC slicing", () => {
  assert.equal(
    getPragueMatchDateFromTimestamp("2026-08-18T22:30:00Z"),
    "2026-08-19"
  );
});

test("server-side APK match-date validation accepts only real YYYY-MM-DD dates", () => {
  assert.equal(isValidIsoCalendarDate("2026-08-19"), true);
  assert.equal(isValidIsoCalendarDate("2026-02-29"), false);
  assert.equal(isValidIsoCalendarDate("2026-13-99"), false);
  assert.equal(isValidIsoCalendarDate("19-08-2026"), false);
  assert.equal(isValidIsoCalendarDate("random text"), false);
  assert.equal(isValidIsoCalendarDate(""), false);
});

test("app-sync validation rejects APK LBW quick scoring dismissals", () => {
  const assembler = readFileSync("lib/app-sync/assemble-pending-import.ts", "utf8");
  const dismissalSet = assembler.match(
    /const QUICK_DISMISSAL_TYPES = new Set<QuickScoringDismissalType>\(\[([\s\S]*?)\]\);/
  )?.[1] ?? "";

  assert.doesNotMatch(dismissalSet, /"lbw"/);
  assert.match(dismissalSet, /"stumped"/);
});

test("wide and no-ball events keep current website quick-scoring semantics", () => {
  const derived = deriveQuickScoringInnings({
    battingTeamId: "teamA",
    bowlingTeamId: "teamB",
    battingPlayerIds: ["aninda", "arunabha"],
    bowlingPlayerIds: ["atripan", "biplab"],
    fieldingPlayerIds: ["atripan", "biplab"],
    battingMode: "two_batter",
    events: [
      event(1, {
        extraType: "wide",
        extras: 1,
        legalDelivery: false
      }),
      event(2, {
        extraType: "no_ball",
        extras: 1,
        batterRuns: 2,
        legalDelivery: false
      }),
      event(3, {
        batterRuns: 1
      })
    ]
  });

  assert.equal(derived.extras, 2);
  assert.equal(derived.completedOvers, 1 / 6);
  assert.equal(derived.runs, 5);
  assert.equal(derived.bowlingOvers[0]?.runsConceded, 5);
  assert.equal(derived.bowlingOvers[0]?.legalBalls, 1);
});

test("quick scoring stumped credits bowler wicket and stumper fielding stat", () => {
  const derived = deriveQuickScoringInnings({
    battingTeamId: "teamA",
    bowlingTeamId: "teamB",
    battingPlayerIds: ["aninda", "arunabha"],
    bowlingPlayerIds: ["atripan", "biplab"],
    fieldingPlayerIds: ["atripan", "biplab"],
    battingMode: "two_batter",
    events: [
      event(1, {
        wicket: {
          type: "stumped",
          dismissedPlayerId: "aninda",
          fielderId: "biplab",
          newBatterId: null,
          completedRuns: 0
        }
      })
    ]
  });

  assert.equal(derived.wicketsLost, 1);
  assert.equal(derived.bowlingOvers[0]?.dismissals[0]?.type, "stumped");
  assert.equal(derived.bowlingOvers[0]?.dismissals[0]?.creditedBowlerId, "atripan");
  assert.equal(derived.bowlingOvers[0]?.dismissals[0]?.fielderId, "biplab");
});

test("quick scoring stumping is not a catch or run-out and can use a Fielding Helper", () => {
  const derived = deriveQuickScoringInnings({
    battingTeamId: "teamA",
    bowlingTeamId: "teamB",
    battingPlayerIds: ["aninda", "arunabha"],
    bowlingPlayerIds: ["atripan"],
    fieldingPlayerIds: ["atripan", "biplab"],
    battingMode: "two_batter",
    events: [
      event(1, {
        wicket: {
          type: "stumped",
          dismissedPlayerId: "aninda",
          fielderId: "biplab",
          newBatterId: null,
          completedRuns: 0
        }
      })
    ]
  });

  assert.deepEqual(derived.missingInformation, []);
  assert.equal(derived.wicketsLost, 1);
  assert.equal(derived.bowlingOvers[0]?.dismissals[0]?.creditedBowlerId, "atripan");
  assert.equal(derived.bowlingOvers[0]?.dismissals[0]?.fielderId, "biplab");
});

test("quick scoring rejects stumping with an invalid stumper", () => {
  const derived = deriveQuickScoringInnings({
    battingTeamId: "teamA",
    bowlingTeamId: "teamB",
    battingPlayerIds: ["aninda", "arunabha"],
    bowlingPlayerIds: ["atripan"],
    fieldingPlayerIds: ["atripan"],
    battingMode: "two_batter",
    events: [
      event(1, {
        wicket: {
          type: "stumped",
          dismissedPlayerId: "aninda",
          fielderId: "biplab",
          newBatterId: null,
          completedRuns: 0
        }
      })
    ]
  });

  assert.match(derived.missingInformation.join(" "), /ineligible fielder/);
});

test("undo fully reverses a stumping event", () => {
  const stumping = event(1, {
    wicket: {
      type: "stumped",
      dismissedPlayerId: "aninda",
      fielderId: "biplab",
      newBatterId: null,
      completedRuns: 0
    }
  });
  const events = [stumping];
  const beforeUndo = deriveQuickScoringInnings({
    battingTeamId: "teamA",
    bowlingTeamId: "teamB",
    battingPlayerIds: ["aninda", "arunabha"],
    bowlingPlayerIds: ["atripan", "biplab"],
    fieldingPlayerIds: ["atripan", "biplab"],
    battingMode: "two_batter",
    events
  });
  const afterUndo = deriveQuickScoringInnings({
    battingTeamId: "teamA",
    bowlingTeamId: "teamB",
    battingPlayerIds: ["aninda", "arunabha"],
    bowlingPlayerIds: ["atripan", "biplab"],
    fieldingPlayerIds: ["atripan", "biplab"],
    battingMode: "two_batter",
    events: undoLastQuickScoringEvent(
      {
        version: 2,
        battingMode: "two_batter",
        inningsPhase: "first_innings",
        inningsAEvents: events,
        inningsBEvents: []
      },
      "teamA"
    ).inningsAEvents
  });

  assert.equal(beforeUndo.wicketsLost, 1);
  assert.equal(afterUndo.wicketsLost, 0);
  assert.equal(afterUndo.bowlingOvers.length, 0);
});

test("stumping can leave two-batter mode in Last Batter Solo", () => {
  const derived = deriveQuickScoringInnings({
    battingTeamId: "teamA",
    bowlingTeamId: "teamB",
    battingPlayerIds: ["aninda", "arunabha"],
    bowlingPlayerIds: ["atripan", "biplab"],
    fieldingPlayerIds: ["atripan", "biplab"],
    battingMode: "two_batter",
    events: [
      event(1, {
        wicket: {
          type: "stumped",
          dismissedPlayerId: "aninda",
          fielderId: "biplab",
          newBatterId: null,
          completedRuns: 0
        }
      })
    ]
  });

  assert.equal(derived.isLastBatterSolo, true);
  assert.equal(derived.activeBatterCount, 1);
});

test("scorecard and app-sync assembly explicitly support stumping display and XP", () => {
  const scorecard = readFileSync("lib/match-scorecard.ts", "utf8");
  const assembler = readFileSync("lib/app-sync/assemble-pending-import.ts", "utf8");

  assert.match(scorecard, /st \$\{fielderName\} b \$\{bowlerName\}/);
  assert.match(assembler, /calculatePlayerStumpings/);
  assert.match(assembler, /stumpings:/);
  assert.match(assembler, /calculatePlayerMatchXP/);
});

test("quick scoring rejects stumping when stumper is the bowler", () => {
  const derived = deriveQuickScoringInnings({
    battingTeamId: "teamA",
    bowlingTeamId: "teamB",
    battingPlayerIds: ["aninda", "arunabha"],
    bowlingPlayerIds: ["atripan", "biplab"],
    fieldingPlayerIds: ["atripan", "biplab"],
    battingMode: "two_batter",
    events: [
      event(1, {
        wicket: {
          type: "stumped",
          dismissedPlayerId: "aninda",
          fielderId: "atripan",
          newBatterId: null,
          completedRuns: 0
        }
      })
    ]
  });

  assert.equal(
    derived.missingInformation.includes("Event 1 uses the bowler as the stumper."),
    true
  );
});

test("shared-player stumping earns the approved stumping XP component", () => {
  const sharedRecord: PlayerMatchPerformance = {
    playerId: "aninda",
    teamId: "teamA",
    played: true,
    playerOfMatch: false,
    didBat: false,
    runs: "",
    wasOut: false,
    wickets: 0,
    hatTricks: 0,
    catches: 0,
    runOuts: 0,
    stumpings: 1
  };

  const xp = calculateSharedPlayerMatchXP([sharedRecord], {
    result: { type: "tie" },
    overs: []
  });

  assert.equal(xp.fieldingXP, XP_RULES.stumping);
});

test("app-sync assembly keeps pending matches unnumbered and derives POM server-side", () => {
  const assembler = readFileSync("lib/app-sync/assemble-pending-import.ts", "utf8");

  assert.match(assembler, /matchNumber = null/);
  assert.match(assembler, /getPlayerOfMatchRecommendation/);
  assert.match(assembler, /getPragueMatchDateFromTimestamp\(payload\.startedAt\)/);
});

test("migration keeps APK imports admin-only and separate from matches status", () => {
  const migration = readFileSync(
    "supabase/migrations/20260819120000_apk_pending_imports.sql",
    "utf8"
  );

  assert.match(migration, /create table if not exists public\.apk_match_imports/);
  assert.match(migration, /alter table public\.apk_match_imports enable row level security/);
  assert.match(migration, /using \(public\.is_admin\(\)\)/);
  assert.match(migration, /with check \(public\.is_admin\(\)\)/);
  assert.match(migration, /create unique index if not exists apk_match_imports_source_offline_match_id_idx/);
  assert.doesNotMatch(migration, /alter table public\.matches[\s\S]*pending_review/);
  assert.doesNotMatch(migration, /grant select, insert, update, delete on public\.apk_match_imports/);
  assert.match(migration, /grant select, insert, update on public\.apk_match_imports to authenticated/);
  assert.doesNotMatch(migration, /create policy "Admins can delete APK match imports"/);
});

test("migration defines admin-only atomic APK upsert and finalise RPCs", () => {
  const migration = readFileSync(
    "supabase/migrations/20260819120000_apk_pending_imports.sql",
    "utf8"
  );

  assert.match(migration, /create or replace function public\.upsert_apk_match_import_atomic/);
  assert.match(migration, /create or replace function public\.finalize_apk_import_atomic/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /if not public\.is_admin\(\) then/);
  assert.match(migration, /for update/);
  assert.match(migration, /public\.finalize_match_atomic\(v_finalisation_plan\)/);
  assert.match(migration, /pg_advisory_xact_lock\([\s\S]*gully-legends-apk-match-number/);
  assert.match(migration, /where public\.apk_match_imports\.sync_version < excluded\.sync_version/);
  assert.match(migration, /review_status = 'finalised'/);
  assert.match(migration, /finalised_match_id = v_match_id/);
  assert.match(migration, /revoke all on function public\.finalize_apk_import_atomic\(uuid, jsonb\) from anon/);
  assert.match(migration, /grant execute on function public\.finalize_apk_import_atomic\(uuid, jsonb\) to authenticated/);
});

test("atomic finalise RPC blocks only earlier real pending-review APK imports", () => {
  const migration = readFileSync(
    "supabase/migrations/20260819120000_apk_pending_imports.sql",
    "utf8"
  );

  assert.match(migration, /candidate\.is_demo = false/);
  assert.match(migration, /candidate\.review_status = 'pending_review'/);
  assert.doesNotMatch(migration, /correction_pending'\]\)/);
  assert.doesNotMatch(migration, /review_status in \('pending_review', 'correction_pending'\)/);
});

test("atomic finalise RPC returns existing finalised import without replaying XP", () => {
  const migration = readFileSync(
    "supabase/migrations/20260819120000_apk_pending_imports.sql",
    "utf8"
  );

  assert.match(migration, /v_import\.review_status = 'finalised'/);
  assert.match(migration, /v_existing_final_match\.status = 'finalised'/);
  assert.match(migration, /'already_applied', true/);
});

test("atomic finalise RPC inserts official match and import state in one function", () => {
  const migration = readFileSync(
    "supabase/migrations/20260819120000_apk_pending_imports.sql",
    "utf8"
  );

  assert.match(migration, /insert into public\.matches/);
  assert.match(migration, /status,\s+is_demo,\s+payload/);
  assert.match(migration, /'in_progress'/);
  assert.match(migration, /public\.finalize_match_atomic\(v_finalisation_plan\)/);
  assert.match(migration, /update public\.apk_match_imports/);
});

test("app-sync match endpoint never calls finalize_match_atomic", () => {
  const route = readFileSync("app/api/app-sync/match/route.ts", "utf8");

  assert.doesNotMatch(route, /finalize_match_atomic/);
});

test("app-sync match endpoint uses database atomic sync-version upsert", () => {
  const route = readFileSync("app/api/app-sync/match/route.ts", "utf8");
  const repository = readFileSync("lib/supabase/apk-import-repository.ts", "utf8");

  assert.match(route, /upsertPendingImport/);
  assert.match(repository, /upsert_apk_match_import_atomic/);
  assert.doesNotMatch(repository, /payload\.syncVersion <= existing\.syncVersion/);
});

test("roster endpoint errors when Supabase mode cannot load the official roster", () => {
  const route = readFileSync("app/api/app-sync/roster/route.ts", "utf8");

  assert.match(route, /roster_unavailable/);
  assert.match(route, /loadPublicSupabaseReadData/);
});

test("finalise-from-pending blocks demo imports and same-day earlier pending imports", () => {
  const route = readFileSync(
    "app/api/admin/apk-imports/[importId]/finalize/route.ts",
    "utf8"
  );
  const repository = readFileSync("lib/supabase/apk-import-repository.ts", "utf8");

  assert.match(route, /DEMO APK IMPORTS CANNOT CREATE OFFICIAL MATCHES/);
  assert.match(route, /isValidIsoCalendarDate/);
  assert.match(route, /finalizeImportAtomically/);
  assert.doesNotMatch(route, /saveMatch/);
  assert.doesNotMatch(route, /markFinalised/);
  assert.doesNotMatch(route, /getNextAvailableMatchNumber/);
  assert.match(repository, /\.eq\("is_demo", false\)/);
  assert.match(repository, /\.eq\("review_status", "pending_review"\)/);
});

test("APK selected POM must be a website-eligible match participant", () => {
  const assembler = readFileSync("lib/app-sync/assemble-pending-import.ts", "utf8");

  assert.match(assembler, /playerOfMatchId &&/);
  assert.match(assembler, /performance\.played && performance\.playerId === playerOfMatchId/);
  assert.match(assembler, /Player of the Match must be a match participant/);
});

test("website-created Demo Test Match finalisation is server-blocked", () => {
  const finaliseRoute = readFileSync("app/api/admin/matches/finalize/route.ts", "utf8");

  assert.match(finaliseRoute, /currentRow\.is_demo && currentRow\.status !== "finalised"/);
  assert.doesNotMatch(finaliseRoute, /!isDemoTestMatchPayload\(currentPayload\.match\)/);
});
