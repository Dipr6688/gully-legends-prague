import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  DEFAULT_VENUE_ID,
  VENUES,
  getMatchVenueDefinition,
  getMatchVenueId,
  getVenueDefinition,
  isVenueId,
  resolveVenueId
} from "../lib/venues";
import {
  assemblePendingImportMatch,
  isAppSyncMatchPayload
} from "../lib/app-sync/assemble-pending-import";
import type { AppSyncMatchPayload } from "../lib/app-sync/types";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const legacyApkPayload: AppSyncMatchPayload = {
  offlineMatchId: "venue-legacy-apk",
  syncVersion: 1,
  isDemo: true,
  startedAt: "2026-11-01T14:00:00.000Z",
  completedAt: "2026-11-01T15:00:00.000Z",
  matchName: "Legacy APK Match",
  scheduledOversPerInnings: 1,
  battingMode: "single_batter",
  battingFirstTeamId: "teamA",
  teamAPlayerIds: ["aninda"],
  teamBPlayerIds: ["rohit"],
  inningsAEvents: [],
  inningsBEvents: []
};

test("venue config defines the two permanent venues and exact assets", () => {
  assert.equal(DEFAULT_VENUE_ID, "open-field");
  assert.deepEqual(Object.keys(VENUES), ["open-field", "indoor-dome"]);
  assert.equal(VENUES["open-field"].name, "Open Field");
  assert.equal(VENUES["open-field"].locationHeading, "ČZU Gully Arena");
  assert.equal(VENUES["open-field"].backgroundAsset, "/backgrounds/prague-gully-arena.png");
  assert.equal(VENUES["indoor-dome"].name, "The Dome");
  assert.equal(VENUES["indoor-dome"].subtitle, "Indoor Court, Prague");
  assert.equal(VENUES["indoor-dome"].backgroundAsset, "/venue-backgrounds/the-dome.jpg");
  assert.equal(existsSync("public/venue-backgrounds/the-dome.jpg"), true);
});

test("venue validation accepts only supported stable IDs", () => {
  assert.equal(isVenueId("open-field"), true);
  assert.equal(isVenueId("indoor-dome"), true);
  assert.equal(isVenueId("somewhere-else"), false);
  assert.equal(resolveVenueId("somewhere-else"), "open-field");
  assert.equal(getVenueDefinition("indoor-dome").theme, "indoor");
});

test("legacy matches resolve defensively to Open Field", () => {
  assert.equal(getMatchVenueId({}), "open-field");
  assert.equal(getMatchVenueDefinition({}).name, "Open Field");
  assert.equal(getMatchVenueId({ venueId: "indoor-dome" }), "indoor-dome");
});

test("global current venue is server persisted and Admin protected", () => {
  const repository = source("lib/supabase/venue-settings-repository.ts");
  const route = source("app/api/admin/current-venue/route.ts");
  const control = source("components/admin/CurrentVenueControl.tsx");
  const migration = source("supabase/migrations/20261104120000_venue_system.sql");

  assert.match(repository, /from\("site_settings"\)/);
  assert.match(repository, /current_venue_id/);
  assert.match(route, /isAdminWithClient/);
  assert.match(route, /if \(!\(await isAdminWithClient\(supabase\)\)\)/);
  assert.match(route, /isVenueId\(body\?\.venueId\)/);
  assert.match(route, /revalidatePath\("\/"\)/);
  assert.match(control, /\/api\/admin\/current-venue/);
  assert.match(migration, /Public can read site settings/);
  assert.match(migration, /Admins can update site settings/);
  assert.match(migration, /public\.is_admin\(\)/);
  assert.doesNotMatch(migration, /for delete/);
});

test("dashboard card and general background use Global Current Venue", () => {
  const page = source("app/page.tsx");
  const hero = source("components/dashboard/HeroSection.tsx");
  const css = source("app/globals.css");

  assert.match(page, /loadPublicCurrentVenueId\(\)/);
  assert.match(page, /currentVenueId=\{currentVenueId\}/);
  assert.match(page, /--dashboard-venue-background/);
  assert.match(hero, /venue\.locationHeading/);
  assert.match(hero, /venue\.subtitle/);
  assert.match(hero, /src=\{venue\.backgroundAsset\}/);
  assert.match(css, /var\(--dashboard-venue-background/);
  assert.match(css, /dashboard-hero-venue-overlay--indoor/);
  assert.match(
    css,
    /dashboard-hero-venue-overlay--indoor[\s\S]*?rgba\(5, 8, 13, 0\.07\)[\s\S]*?rgba\(5, 8, 13, 0\.19\)/
  );
  assert.match(
    css,
    /lower-dashboard-bg\[data-venue-theme="indoor"\][\s\S]*?rgba\(5, 8, 13, 0\.52\)/
  );
  assert.doesNotMatch(css, /dashboard-hero-venue-overlay--outdoor/);
});

test("Create Match defaults from Global Current Venue and stores an explicit selection", () => {
  const page = source("app/matches/new/page.tsx");
  const form = source("components/matches/MockMatchEntryForm.tsx");

  assert.match(page, /loadPublicCurrentVenueId\(\)/);
  assert.match(page, /currentVenueId=\{currentVenueId\}/);
  assert.match(form, /venueId: currentVenueId/);
  assert.match(form, /name="venueId"/);
  assert.match(form, /VENUE_IDS\.map/);
  assert.match(form, /venueId: recordVenue\.id/);
  assert.match(form, /venue: recordVenue\.locationHeading/);
  assert.match(form, /disabled=\{isRosterLocked\}/);
});

test("match venue persists in the row and payload with legacy read fallback", () => {
  const writes = source("lib/supabase/match-write-repository.ts");
  const reads = source("lib/supabase/public-read-data.ts");
  const rows = source("lib/supabase/read-repositories.ts");
  const migration = source("supabase/migrations/20261104120000_venue_system.sql");

  assert.match(writes, /venue_id: venueId/);
  assert.match(writes, /venueId,/);
  assert.match(rows, /"venue_id"/);
  assert.match(reads, /resolveVenueId\(row\.venue_id \?\? result\.match\.venueId\)/);
  assert.match(migration, /set venue_id = 'open-field'/);
  assert.match(migration, /matches_venue_id_check/);
  assert.match(migration, /sync_match_venue_id/);
});

test("match-specific page background resolves from the saved match", () => {
  const page = source("app/matches/[matchId]/page.tsx");
  const background = source("components/venues/VenuePageBackground.tsx");

  assert.match(page, /getMatchVenueId\(match\)/);
  assert.match(page, /VenuePageBackground/);
  assert.match(background, /getVenueDefinition\(venueId\)/);
  assert.match(background, /--venue-page-background/);
});

test("legacy APK payloads remain accepted and always fall back to Open Field", () => {
  assert.equal(isAppSyncMatchPayload(legacyApkPayload), true);
  const assembled = assemblePendingImportMatch({ payload: legacyApkPayload });

  assert.equal(assembled.derivedMatch?.venueId, "open-field");
  assert.equal(assembled.derivedMatch?.venue, "ČZU Gully Arena");

  const indoorPayload = { ...legacyApkPayload, venueId: "indoor-dome" };
  assert.equal(isAppSyncMatchPayload(indoorPayload), true);
  assert.equal(
    assemblePendingImportMatch({ payload: indoorPayload }).derivedMatch?.venueId,
    "indoor-dome"
  );
  assert.equal(
    isAppSyncMatchPayload({ ...legacyApkPayload, venueId: "invalid-venue" }),
    false
  );
});

test("venue feature does not enter scoring or XP engines", () => {
  assert.doesNotMatch(source("lib/quick-scoring.ts"), /venueId|indoor-dome|open-field/);
  assert.doesNotMatch(source("lib/progression.ts"), /venueId|indoor-dome|open-field/);
});
