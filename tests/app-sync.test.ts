import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  getPragueMatchDateFromTimestamp,
  isValidIsoCalendarDate
} from "../lib/app-sync/prague-date";
import { describeApkFinaliseError } from "../lib/supabase/apk-import-repository";
import { buildBowlingFigures } from "../lib/match-scorecard";
import { calculateCompletedBowlingOvers } from "../lib/match-records";
import { XP_RULES, calculateSharedPlayerMatchXP } from "../lib/progression";
import { deriveQuickScoringInnings, undoLastQuickScoringEvent } from "../lib/quick-scoring";
import {
  SupabaseApkImportError,
  SupabaseApkImportRepository
} from "../lib/supabase/apk-import-repository";
import type { AppSyncMatchPayload } from "../lib/app-sync/types";
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

function appSyncPayload(
  overrides: Partial<AppSyncMatchPayload> = {}
): AppSyncMatchPayload {
  return {
    offlineMatchId: "offline-1",
    syncVersion: 1,
    isDemo: false,
    startedAt: timestamp,
    completedAt: timestamp,
    matchName: "APK Review Test",
    venue: "CZU Gully Arena",
    scheduledOversPerInnings: 2,
    battingMode: "two_batter",
    battingFirstTeamId: "teamA",
    teamAPlayerIds: ["aninda", "arunabha"],
    teamBPlayerIds: ["atripan", "biplab"],
    sharedPlayerId: null,
    fieldingHelperIds: [],
    inningsAEvents: [],
    inningsBEvents: [],
    ...overrides
  };
}

function apkImportRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "import-1",
    offline_match_id: "offline-1",
    source: "apk",
    is_demo: false,
    sync_version: 1,
    review_status: "pending_review",
    started_at: timestamp,
    completed_at: timestamp,
    match_date: "2026-08-19",
    imported_at: timestamp,
    updated_at: timestamp,
    raw_payload: appSyncPayload(),
    derived_match_payload: null,
    validation_result: {},
    review_payload: null,
    review_derived_match_payload: null,
    review_validation_result: null,
    review_source_sync_version: null,
    review_version: 0,
    review_updated_at: null,
    review_is_stale: false,
    finalised_match_id: null,
    created_by: "admin-user",
    updated_by: "admin-user",
    ...overrides
  };
}

function createMutationClient(initialRow: Record<string, unknown>) {
  let row = { ...initialRow };
  const calls: Array<{
    table: string;
    values: Record<string, unknown>;
    filters: Array<[string, unknown]>;
  }> = [];

  return {
    calls,
    get row() {
      return row;
    },
    from(table: string) {
      return {
        update(values: Record<string, unknown>) {
          const filters: Array<[string, unknown]> = [];
          const call = { table, values, filters };
          calls.push(call);
          const chain = {
            eq(column: string, value: unknown) {
              filters.push([column, value]);
              return chain;
            },
            select() {
              return chain;
            },
            single() {
              const matches = filters.every(([column, value]) => row[column] === value);

              if (!matches) {
                return {
                  data: null,
                  error: { message: "No rows", code: "PGRST116" }
                };
              }

              row = { ...row, ...values };

              return { data: row, error: null };
            }
          };

          return chain;
        }
      };
    }
  };
}

function legalOver(firstSequence: number, bowlerId: string): QuickScoringEvent[] {
  return Array.from({ length: 6 }, (_, index) =>
    event(firstSequence + index, { bowlerId })
  );
}

function changeOverBowler(
  events: QuickScoringEvent[],
  overNumber: number,
  bowlerId: string
): QuickScoringEvent[] {
  let legalBalls = 0;

  return events.map((quickEvent) => {
    const currentOver = Math.floor(legalBalls / 6) + 1;

    if (quickEvent.legalDelivery) legalBalls += 1;

    return currentOver === overNumber
      ? { ...quickEvent, bowlerId }
      : quickEvent;
  });
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

test("app-sync payload type and validator accept optional explicit Match Date", () => {
  const types = readFileSync("lib/app-sync/types.ts", "utf8");
  const assembler = readFileSync("lib/app-sync/assemble-pending-import.ts", "utf8");

  assert.match(types, /matchDate\?: string;/);
  assert.match(
    assembler,
    /value\.matchDate === undefined \|\| typeof value\.matchDate === "string"/
  );
});

test("app-sync assembly uses explicit APK Match Date before timestamp fallback", () => {
  const assembler = readFileSync("lib/app-sync/assemble-pending-import.ts", "utf8");

  assert.match(assembler, /matchDate \?\? payload\.matchDate \?\? null/);
  assert.match(assembler, /isValidIsoCalendarDate\(derivedMatchDate\)/);
  assert.match(assembler, /Invalid matchDate\. Use YYYY-MM-DD\./);
  assert.match(assembler, /derivedMatchDate = getPragueMatchDateFromTimestamp\(payload\.startedAt\)/);
});

test("app-sync explicit Match Date is not derived from completedAt", () => {
  const assembler = readFileSync("lib/app-sync/assemble-pending-import.ts", "utf8");
  const completedAtValidationStart = assembler.search(
    /\n\s+if \(\r?\n\s+payload\.completedAt/
  );
  const dateDerivationBlock = assembler.slice(
    assembler.indexOf("let derivedMatchDate"),
    completedAtValidationStart
  );

  assert.match(dateDerivationBlock, /payload\.matchDate/);
  assert.doesNotMatch(
    dateDerivationBlock,
    /getPragueMatchDateFromTimestamp\(payload\.completedAt\)|new Date\(payload\.completedAt\)|Date\.parse\(payload\.completedAt\)/
  );
});

test("app-sync legacy no-Match-Date fallback still uses Prague startedAt conversion", () => {
  assert.equal(
    getPragueMatchDateFromTimestamp("2026-08-25T22:30:00.000Z"),
    "2026-08-26"
  );
});

test("app-sync same-day and next-day explicit Match Date examples stay calendar strings", () => {
  const sameDay = appSyncPayload({
    matchDate: "2026-08-25",
    startedAt: "2026-08-25T21:58:00.000Z"
  });
  const nextDay = appSyncPayload({
    matchDate: "2026-08-26",
    startedAt: "2026-08-25T21:58:00.000Z"
  });

  assert.equal(sameDay.matchDate, "2026-08-25");
  assert.equal(nextDay.matchDate, "2026-08-26");
  assert.notEqual(sameDay.matchDate, nextDay.matchDate);
});

test("app-sync payload accepts optional APK POM recommendation metadata", () => {
  const types = readFileSync("lib/app-sync/types.ts", "utf8");
  const assembler = readFileSync("lib/app-sync/assemble-pending-import.ts", "utf8");

  assert.match(types, /pomRecommendationPlayerId\?: string \| null;/);
  assert.match(assembler, /value\.pomRecommendationPlayerId === undefined/);
  assert.match(assembler, /value\.pomRecommendationPlayerId === null/);
  assert.match(assembler, /typeof value\.pomRecommendationPlayerId === "string"/);
});

test("app-sync validates APK POM recommendation without blocking the match", () => {
  const assembler = readFileSync("lib/app-sync/assemble-pending-import.ts", "utf8");

  assert.match(assembler, /const suppliedPomRecommendationId/);
  assert.match(assembler, /payload\.pomRecommendationPlayerId\?\.trim\(\) \|\| null/);
  assert.match(assembler, /status: "valid" as const/);
  assert.match(assembler, /APK POM recommendation ignored: unknown player\./);
  assert.match(assembler, /APK POM recommendation ignored: player did not participate\./);
  assert.match(assembler, /performance\.played && performance\.playerId === suppliedPomRecommendationId/);
  assert.match(assembler, /apkPomRecommendation/);
});

test("APK POM recommendation never becomes official POM automatically", () => {
  const assembler = readFileSync("lib/app-sync/assemble-pending-import.ts", "utf8");
  const finaliseRoute = readFileSync(
    "app/api/admin/apk-imports/[importId]/finalize/route.ts",
    "utf8"
  );
  const finaliseConfirmation = readFileSync(
    "components/admin/ApkOfficialFinaliseConfirmation.tsx",
    "utf8"
  );
  const page = readFileSync("app/admin/apk-imports/[importId]/page.tsx", "utf8");

  assert.match(assembler, /playerOfMatchId = null/);
  assert.match(assembler, /playerOfMatchId &&/);
  assert.doesNotMatch(assembler, /playerOfMatchId\s*=\s*payload\.pomRecommendationPlayerId/);
  assert.match(finaliseRoute, /formData\.get\("playerOfMatchId"\)/);
  assert.doesNotMatch(finaliseRoute, /pomRecommendationPlayerId/);
  assert.match(page, /APK POM Recommendation/);
  assert.match(page, /recommendedPomId=\{recommendedPomId\}/);
  assert.match(finaliseConfirmation, /defaultValue=\{recommendedPomId \?\? ""\}/);
  assert.doesNotMatch(page, /defaultValue=\{apkPomRecommendation/);
  assert.doesNotMatch(finaliseConfirmation, /defaultValue=\{apkPomRecommendation/);
});

test("APK POM recommendation respects review-copy stale behavior and demo isolation", () => {
  const helper = readFileSync("lib/app-sync/review-working-copy.ts", "utf8");
  const route = readFileSync(
    "app/api/admin/apk-imports/[importId]/finalize/route.ts",
    "utf8"
  );
  const page = readFileSync("app/admin/apk-imports/[importId]/page.tsx", "utf8");

  assert.match(helper, /return importRecord\.reviewPayload \?\? importRecord\.rawPayload/);
  assert.match(helper, /reviewSourceSyncVersion/);
  assert.match(route, /DEMO APK IMPORTS CANNOT CREATE OFFICIAL MATCHES/);
  assert.match(page, /ApkOfficialFinaliseConfirmation/);
  assert.match(page, /isDemo=\{importRecord\.isDemo\}/);
  assert.match(page, /Website Admin still chooses the official Player of the Match/);
});

test("APK official finalisation requires explicit UI confirmation", () => {
  const component = readFileSync(
    "components/admin/ApkOfficialFinaliseConfirmation.tsx",
    "utf8"
  );
  const page = readFileSync("app/admin/apk-imports/[importId]/page.tsx", "utf8");
  const finaliseRoute = readFileSync(
    "app/api/admin/apk-imports/[importId]/finalize/route.ts",
    "utf8"
  );

  assert.match(component, /"use client"/);
  assert.match(component, /const \[confirming, setConfirming\] = useState\(false\)/);
  assert.match(component, /FINALISE OFFICIAL MATCH\?/);
  assert.match(component, /career statistics/);
  assert.match(component, /XP \/ levels/);
  assert.match(component, /Player of the Match/);
  assert.match(component, /Game Number/);
  assert.match(component, /Archive \/ rankings \/ derived features/);
  assert.match(component, /type="button"[\s\S]*setConfirming\(true\)/);
  assert.match(component, /type="submit"[\s\S]*FINALISE OFFICIAL MATCH/);
  assert.match(page, /action=\{`\/api\/admin\/apk-imports\/\$\{importRecord\.id\}\/finalize`\}/);
  assert.match(finaliseRoute, /formData\.get\("playerOfMatchId"\)/);
  assert.match(finaliseRoute, /finalizeImportAtomically/);
});

test("APK official finalisation cancel is non-mutating UI only", () => {
  const component = readFileSync(
    "components/admin/ApkOfficialFinaliseConfirmation.tsx",
    "utf8"
  );
  const cancelTextIndex = component.indexOf("CANCEL");
  const cancelButtonStart = component.lastIndexOf("<Button", cancelTextIndex);
  const cancelButtonEnd = component.indexOf("</Button>", cancelTextIndex);
  const cancelButton = component.slice(cancelButtonStart, cancelButtonEnd);

  assert.ok(cancelButtonStart >= 0);
  assert.ok(cancelButtonEnd > cancelButtonStart);
  assert.match(cancelButton, /type="button"/);
  assert.match(cancelButton, /variant="ghost"/);
  assert.match(cancelButton, /setConfirming\(false\)/);
  assert.match(component, />\s*CANCEL\s*<\/Button>/);
  assert.doesNotMatch(cancelButton, /type="submit"/);
});

test("Demo APK imports do not expose usable official finalise action", () => {
  const component = readFileSync(
    "components/admin/ApkOfficialFinaliseConfirmation.tsx",
    "utf8"
  );
  const page = readFileSync("app/admin/apk-imports/[importId]/page.tsx", "utf8");

  assert.match(component, /if \(isDemo\) \{/);
  assert.match(component, /DEMO MATCH - CANNOT BE FINALISED AS OFFICIAL/);
  assert.match(component, /Demo APK imports can be reviewed and corrected/);
  assert.match(component, /return \([\s\S]*DEMO MATCH - CANNOT BE FINALISED AS OFFICIAL[\s\S]*\);\s*\}\s*return \(\s*<form/);
  assert.match(page, /canFinalize =[\s\S]*!importRecord\.isDemo/);
});

test("APK finalisation keeps POM selection authoritative through the confirmed form", () => {
  const component = readFileSync(
    "components/admin/ApkOfficialFinaliseConfirmation.tsx",
    "utf8"
  );
  const page = readFileSync("app/admin/apk-imports/[importId]/page.tsx", "utf8");
  const finaliseRoute = readFileSync(
    "app/api/admin/apk-imports/[importId]/finalize/route.ts",
    "utf8"
  );

  assert.match(component, /name="playerOfMatchId"/);
  assert.match(component, /defaultValue=\{recommendedPomId \?\? ""\}/);
  assert.match(page, /recommendedPomId=\{recommendedPomId\}/);
  assert.match(page, /pomOptions=\{players\.map/);
  assert.match(finaliseRoute, /const selectedPom = String\(formData\.get\("playerOfMatchId"\)/);
  assert.doesNotMatch(component, /pomRecommendationPlayerId/);
});

test("app-sync login route accepts Admin ID and keeps Admin email server-side", () => {
  const route = readFileSync("app/api/app-sync/login/route.ts", "utf8");

  assert.match(route, /type LoginBody = \{[\s\S]*adminId\?: string;[\s\S]*password\?: string;/);
  assert.match(route, /getAdminLoginConfig/);
  assert.match(route, /!body\?\.adminId \|\| !body\.password/);
  assert.match(route, /ADMIN ID AND PASSWORD REQUIRED/);
  assert.match(route, /body\.adminId !== config\.adminId/);
  assert.match(route, /message: "INVALID LOGIN"/);
  assert.match(route, /email: config\.adminEmail/);
  assert.match(route, /password: body\.password/);
  assert.match(route, /signInWithPassword/);
  assert.match(route, /isAdminWithClient/);
  assert.match(route, /ADMIN ACCESS REQUIRED/);
  assert.doesNotMatch(route, /body\.email/);
  assert.doesNotMatch(route, /EMAIL AND PASSWORD REQUIRED/);
  assert.doesNotMatch(route, /ADMIN LOGIN FAILED/);
});

test("app-sync login route preserves safe failure categories and refresh flow remains unchanged", () => {
  const loginRoute = readFileSync("app/api/app-sync/login/route.ts", "utf8");
  const refreshRoute = readFileSync("app/api/app-sync/refresh/route.ts", "utf8");

  assert.match(loginRoute, /code: "invalid_request"/);
  assert.match(loginRoute, /code: "invalid_credentials"/);
  assert.match(loginRoute, /code: "not_admin"/);
  assert.match(loginRoute, /code: "supabase_not_configured"/);
  assert.doesNotMatch(loginRoute, /message:\s*config\.adminEmail/);
  assert.doesNotMatch(loginRoute, /config\.adminEmail[\s\S]*NextResponse\.json\(\{[\s\S]*adminEmail/);
  assert.match(refreshRoute, /refreshToken/);
  assert.match(refreshRoute, /refreshSession/);
  assert.match(refreshRoute, /isAdminWithClient/);
  assert.match(refreshRoute, /ADMIN ACCESS REQUIRED/);
});

const APK_SOURCE_INDEX_PATH =
  process.env.APK_SOURCE_INDEX_PATH ??
  "../apk-integration/GullyLegendsArena-source/app/src/main/assets/index.html";

test("APK login sends adminId and does not embed Admin email or credentials", (t) => {
  if (!existsSync(APK_SOURCE_INDEX_PATH)) {
    t.skip(
      "APK source not checked out at " + APK_SOURCE_INDEX_PATH + " - set APK_SOURCE_INDEX_PATH to run this check"
    );
    return;
  }

  const apkIndex = readFileSync(APK_SOURCE_INDEX_PATH, "utf8");
  const loginFunction = apkIndex.match(
    /function doLogin\(adminId,password\)\{([\s\S]*?)\n\}/
  )?.[0] ?? "";

  assert.match(loginFunction, /api\('\/api\/app-sync\/login',\{adminId:adminId,password:password\}\)/);
  assert.doesNotMatch(loginFunction, /\bemail\b/);
  assert.doesNotMatch(apkIndex, /ADMIN_LOGIN_EMAIL|@.*\..*|gullylegends@gmail|supabase\.co/i);
  assert.doesNotMatch(apkIndex, /password\s*[:=]\s*["'][^"']+["']/i);
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

test("app-sync team balance endpoint requires authenticated Admin bearer access", () => {
  const route = readFileSync("app/api/app-sync/team-balance/route.ts", "utf8");

  assert.match(route, /getBearerAdminSession/);
  assert.match(route, /ADMIN BEARER TOKEN REQUIRED/);
  assert.match(route, /status: 401/);
});

test("app-sync team balance endpoint returns only team ids and Shared Player", () => {
  const route = readFileSync("app/api/app-sync/team-balance/route.ts", "utf8");

  assert.match(route, /balanceExclusiveTeams/);
  assert.match(route, /playerIds/);
  assert.match(route, /teamAPlayerIds: result\.teamAPlayerIds/);
  assert.match(route, /teamBPlayerIds: result\.teamBPlayerIds/);
  assert.match(route, /sharedPlayerId: result\.sharedPlayerId/);
  assert.doesNotMatch(route, /privateBalanceRatings|batting:|bowling:|fielding:|score|prohibitedPairs/);
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
  assert.match(repository, /\.in\("review_status", \["pending_review", "correction_pending"\]\)/);
  assert.match(route, /getApkReviewPayload\(importRecord\)/);
  assert.match(route, /isApkReviewWorkingCopyStale\(importRecord\)/);
});

test("APK Pending Review list excludes rejected and finalised imports", () => {
  const repository = readFileSync("lib/supabase/apk-import-repository.ts", "utf8");
  const page = readFileSync("app/admin/apk-imports/page.tsx", "utf8");
  const detailPage = readFileSync("app/admin/apk-imports/[importId]/page.tsx", "utf8");

  assert.match(repository, /\.in\("review_status", \["pending_review", "correction_pending"\]\)/);
  assert.match(page, /listForReview/);
  assert.doesNotMatch(page, /reviewStatus !== "finalised"[\s\S]*REJECT/);
  assert.match(detailPage, /REJECTED - audit record preserved/);
  assert.match(detailPage, /importRecord\.reviewStatus === "pending_review" \? \(/);
  assert.doesNotMatch(
    detailPage,
    /importRecord\.reviewStatus !== "finalised" \? \([\s\S]*REJECT IMPORT/
  );
});

test("APK review working copy migration preserves raw payload and marks stale corrections", () => {
  const migration = readFileSync(
    "supabase/migrations/20260820120000_apk_review_working_copy.sql",
    "utf8"
  );
  const repository = readFileSync("lib/supabase/apk-import-repository.ts", "utf8");
  const route = readFileSync(
    "app/api/admin/apk-imports/[importId]/working-copy/route.ts",
    "utf8"
  );
  const helper = readFileSync("lib/app-sync/review-working-copy.ts", "utf8");

  assert.match(migration, /add column if not exists review_payload jsonb/);
  assert.match(migration, /add column if not exists review_source_sync_version integer/);
  assert.match(migration, /add column if not exists review_is_stale boolean not null default false/);
  assert.match(migration, /review_is_stale = public\.apk_match_imports\.review_payload is not null/);
  assert.match(migration, /raw_payload = excluded\.raw_payload/);
  assert.doesNotMatch(migration, /drop table|truncate table|delete from public\.apk_match_imports/i);
  assert.match(repository, /saveReviewPayload/);
  assert.match(repository, /review_payload: payload/);
  assert.doesNotMatch(repository, /raw_payload: payload/);
  assert.match(route, /getApkReviewPayload/);
  assert.match(route, /rawPayload/);
  assert.match(route, /A newer APK upload is available/);
  assert.match(helper, /updateApkReviewOverBowler/);
  assert.match(helper, /groupApkReviewEventsByOver/);
  assert.match(helper, /insertApkReviewEventAfter/);
  assert.match(helper, /assembleApkReviewWorkingCopy/);
});

test("APK review working-copy saves use optimistic review-version concurrency", async () => {
  const raw = appSyncPayload({ syncVersion: 1 });
  const tabA = appSyncPayload({
    syncVersion: 1,
    matchName: "Tab A Correction"
  });
  const tabB = appSyncPayload({
    syncVersion: 1,
    matchName: "Tab B Correction"
  });
  const client = createMutationClient(
    apkImportRow({
      raw_payload: raw,
      review_payload: raw,
      review_source_sync_version: 1,
      review_version: 3
    })
  );
  const repository = new SupabaseApkImportRepository(client as never);

  const firstSave = await repository.saveReviewPayload({
    importId: "import-1",
    payload: tabA,
    derivedMatch: null,
    validationResult: { ok: true, errors: [] },
    matchDate: "2026-08-19",
    userId: "admin-user",
    sourceSyncVersion: 1,
    expectedReviewVersion: 3
  });

  assert.equal(firstSave.reviewVersion, 4);
  assert.equal(client.row.review_payload, tabA);
  assert.deepEqual(client.calls[0]?.filters, [
    ["id", "import-1"],
    ["review_status", "pending_review"],
    ["review_version", 3]
  ]);

  await assert.rejects(
    () =>
      repository.saveReviewPayload({
        importId: "import-1",
        payload: tabB,
        derivedMatch: null,
        validationResult: { ok: true, errors: [] },
        matchDate: "2026-08-19",
        userId: "admin-user",
        sourceSyncVersion: 1,
        expectedReviewVersion: 3
      }),
    (error) =>
      error instanceof SupabaseApkImportError &&
      error.code === "conflict" &&
      error.message.includes("REVIEW COPY CHANGED")
  );
  assert.equal(client.row.review_payload, tabA);
  assert.equal(client.row.review_version, 4);

  const reloadedSave = await repository.saveReviewPayload({
    importId: "import-1",
    payload: tabB,
    derivedMatch: null,
    validationResult: { ok: true, errors: [] },
    matchDate: "2026-08-19",
    userId: "admin-user",
    sourceSyncVersion: 1,
    expectedReviewVersion: 4
  });

  assert.equal(reloadedSave.reviewVersion, 5);
  assert.equal(client.row.review_payload, tabB);
});

test("APK review routes carry expectedReviewVersion for every mutation and finalise", () => {
  const detailPage = readFileSync("app/admin/apk-imports/[importId]/page.tsx", "utf8");
  const workingCopyRoute = readFileSync(
    "app/api/admin/apk-imports/[importId]/working-copy/route.ts",
    "utf8"
  );
  const finaliseRoute = readFileSync(
    "app/api/admin/apk-imports/[importId]/finalize/route.ts",
    "utf8"
  );
  const repository = readFileSync("lib/supabase/apk-import-repository.ts", "utf8");

  assert.match(detailPage, /name="expectedReviewVersion"/);
  assert.match(workingCopyRoute, /getExpectedReviewVersion\(formData\)/);
  assert.match(workingCopyRoute, /importRecord\.reviewVersion \?\? 0/);
  assert.match(repository, /\.eq\("review_version", expectedReviewVersion\)/);
  assert.match(finaliseRoute, /parseExpectedReviewVersion/);
  assert.match(finaliseRoute, /Reload the latest version before finalising/);
});

test("APK import reject is limited to pending_review and preserves other statuses", async () => {
  const pendingClient = createMutationClient(apkImportRow({ review_status: "pending_review" }));
  const pendingRepository = new SupabaseApkImportRepository(pendingClient as never);
  const rejected = await pendingRepository.rejectImport("import-1", "admin-user");

  assert.equal(rejected.reviewStatus, "rejected");
  assert.deepEqual(pendingClient.calls[0]?.filters, [
    ["id", "import-1"],
    ["review_status", "pending_review"]
  ]);

  for (const status of ["finalised", "correction_pending", "rejected"]) {
    const client = createMutationClient(
      apkImportRow({
        review_status: status,
        finalised_match_id: status === "finalised" ? "match-1" : null
      })
    );
    const repository = new SupabaseApkImportRepository(client as never);

    await assert.rejects(
      () => repository.rejectImport("import-1", "admin-user"),
      (error) =>
        error instanceof SupabaseApkImportError &&
        error.code === "not_allowed" &&
        error.message === "IMPORT NOT PENDING REVIEW"
    );
    assert.equal(client.row.review_status, status);
    assert.equal(
      client.row.finalised_match_id,
      status === "finalised" ? "match-1" : null
    );
  }
});

test("APK review working-copy over-bowler correction re-derives two overs cleanly", () => {
  const repeatedBowlerEvents = [
    ...legalOver(1, "atripan"),
    ...legalOver(7, "atripan")
  ];
  const before = deriveQuickScoringInnings({
    battingTeamId: "teamA",
    bowlingTeamId: "teamB",
    battingPlayerIds: ["aninda", "arunabha"],
    bowlingPlayerIds: ["atripan", "biplab"],
    events: repeatedBowlerEvents,
    battingMode: "two_batter"
  });
  const beforeFigures = buildBowlingFigures(before.bowlingOvers, (playerId) => playerId);

  assert.equal(calculateCompletedBowlingOvers(before.bowlingOvers), 2);
  assert.equal(beforeFigures.find((figure) => figure.playerId === "atripan")?.overs, "2.0");
  assert.deepEqual(before.missingInformation, [
    "Over 2 uses the same bowler as Over 1."
  ]);

  const correctedEvents = changeOverBowler(repeatedBowlerEvents, 2, "biplab");
  const after = deriveQuickScoringInnings({
    battingTeamId: "teamA",
    bowlingTeamId: "teamB",
    battingPlayerIds: ["aninda", "arunabha"],
    bowlingPlayerIds: ["atripan", "biplab"],
    events: correctedEvents,
    battingMode: "two_batter"
  });
  const afterFigures = buildBowlingFigures(after.bowlingOvers, (playerId) => playerId);

  assert.equal(calculateCompletedBowlingOvers(after.bowlingOvers), 2);
  assert.equal(afterFigures.find((figure) => figure.playerId === "atripan")?.overs, "1.0");
  assert.equal(afterFigures.find((figure) => figure.playerId === "biplab")?.overs, "1.0");
  assert.equal(after.missingInformation.length, 0);
  assert.equal(after.runs, before.runs);
  assert.equal(after.legalBalls, before.legalBalls);
});

test("APK finalisation source uses corrected working copy and blocks stale review copies", () => {
  const finaliseRoute = readFileSync(
    "app/api/admin/apk-imports/[importId]/finalize/route.ts",
    "utf8"
  );
  const helper = readFileSync("lib/app-sync/review-working-copy.ts", "utf8");
  const rawPayload = appSyncPayload({
    inningsAEvents: [...legalOver(1, "atripan"), ...legalOver(7, "atripan")]
  });
  const correctedPayload = {
    ...rawPayload,
    inningsAEvents: changeOverBowler(rawPayload.inningsAEvents, 2, "biplab")
  };
  const importRecord = {
    ...apkImportRow({
      sync_version: 2,
      raw_payload: rawPayload,
      review_payload: correctedPayload,
      review_source_sync_version: 2,
      review_version: 4,
      review_is_stale: false
    }),
    syncVersion: 2,
    rawPayload,
    reviewPayload: correctedPayload,
    reviewSourceSyncVersion: 2,
    reviewVersion: 4,
    reviewIsStale: false
  };

  assert.match(finaliseRoute, /payload: getApkReviewPayload\(importRecord\)/);
  assert.match(finaliseRoute, /isApkReviewWorkingCopyStale\(importRecord\)/);
  assert.match(helper, /return importRecord\.reviewPayload \?\? importRecord\.rawPayload/);
  assert.equal(importRecord.reviewPayload.inningsAEvents[6]?.bowlerId, "biplab");
  assert.equal(importRecord.rawPayload.inningsAEvents[6]?.bowlerId, "atripan");
});

test("APK v2 keeps Admin review copy but marks it stale until reset", () => {
  const migration = readFileSync(
    "supabase/migrations/20260820120000_apk_review_working_copy.sql",
    "utf8"
  );
  const helper = readFileSync("lib/app-sync/review-working-copy.ts", "utf8");
  const route = readFileSync(
    "app/api/admin/apk-imports/[importId]/working-copy/route.ts",
    "utf8"
  );
  const finaliseRoute = readFileSync(
    "app/api/admin/apk-imports/[importId]/finalize/route.ts",
    "utf8"
  );

  assert.match(migration, /raw_payload = excluded\.raw_payload/);
  assert.doesNotMatch(migration, /review_payload = excluded\.raw_payload/);
  assert.match(migration, /review_is_stale = public\.apk_match_imports\.review_payload is not null/);
  assert.match(helper, /importRecord\.syncVersion > importRecord\.reviewSourceSyncVersion/);
  assert.match(helper, /importRecord\.reviewIsStale === true/);
  assert.match(route, /action !== "reset_to_raw"/);
  assert.match(finaliseRoute, /A NEWER APK SYNC VERSION IS AVAILABLE/);
});

test("Demo APK imports remain editable for review but cannot become official", () => {
  const detailPage = readFileSync("app/admin/apk-imports/[importId]/page.tsx", "utf8");
  const workingCopyRoute = readFileSync(
    "app/api/admin/apk-imports/[importId]/working-copy/route.ts",
    "utf8"
  );
  const finaliseRoute = readFileSync(
    "app/api/admin/apk-imports/[importId]/finalize/route.ts",
    "utf8"
  );

  assert.doesNotMatch(workingCopyRoute, /importRecord\.isDemo[\s\S]*ONLY PENDING APK IMPORTS CAN BE EDITED/);
  assert.match(detailPage, /importRecord\.isDemo \? "DEMO TEST MATCH"/);
  assert.match(detailPage, /isDemo=\{importRecord\.isDemo\}/);
  assert.match(finaliseRoute, /DEMO APK IMPORTS CANNOT CREATE OFFICIAL MATCHES/);
  assert.doesNotMatch(finaliseRoute, /getNextAvailableMatchNumber/);
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

test("APK finalise surfaces the real Supabase refusal instead of a generic banner", () => {
  const sameDay = describeApkFinaliseError({ message: "same_day_pending" });

  assert.equal(sameDay.code, "same_day_pending");
  assert.match(sameDay.message, /EARLIER MATCH FROM THE SAME DAY/);

  const crowned = describeApkFinaliseError({
    message: 'error returned from database: month_already_crowned'
  });

  assert.equal(crowned.code, "not_allowed");
  assert.match(crowned.message, /ALREADY CROWNED/);

  const notPending = describeApkFinaliseError({
    message: "apk_import_not_pending_review"
  });

  assert.equal(notPending.code, "not_allowed");
  assert.match(notPending.message, /NO LONGER PENDING REVIEW/);

  const duplicate = describeApkFinaliseError({
    message: 'duplicate key value violates unique constraint "matches_pkey"',
    code: "23505"
  });

  assert.equal(duplicate.code, "conflict");
  assert.match(duplicate.message, /ALREADY EXISTS/);
});

test("unmapped APK finalise failures keep the underlying Supabase message", () => {
  const unknown = describeApkFinaliseError({
    message: "permission denied for table player_career_stats"
  });

  assert.equal(unknown.code, "write_failed");
  assert.match(unknown.message, /permission denied for table player_career_stats/);

  const empty = describeApkFinaliseError({ message: "" });

  assert.equal(empty.message, "COULD NOT FINALISE APK IMPORT");
});
