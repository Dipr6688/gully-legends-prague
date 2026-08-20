# Gully Legends Prague

Gaming/comic-style cricket website for the Gully Legends Prague group at
CZU Gully Arena.

The app is built with real responsive Next.js components. It now uses Supabase
for shared public data, secure Admin authentication, match management,
progression, Monthly Beasts, Demo Reset, and Gallery persistence.

Production website:

```text
https://www.gullylegends.eu
```

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS plus custom CSS in `app/globals.css`
- Supabase Auth
- Supabase Postgres with Row Level Security
- Supabase Storage public `gallery` bucket
- Local fallback mode for development when `NEXT_PUBLIC_DATA_SOURCE=local`
- Node test runner for project logic and source-level UI checks

## Current Status

Implemented:

- Public Supabase-backed website reads
- Secure Admin login with password reset
- Admin-only Create Match, match scoring, and atomic finalisation
- APK Pending Review / Admin correction workflow for APK-submitted matches
- Quick Scoring with single-batter/two-batter modes, innings breaks, undo, wides,
  no-balls, wickets, run-outs, and mobile-friendly scoring controls
- Post-Match Celebration after official finalisation, plus historical celebration
  replay from official scorecards
- Private server-side automatic Team Balance / Shuffle for Available Today
  players
- Match-day Fielding Helpers for catches and run-outs without changing team
  strength or bowling eligibility
- Career statistics, XP, Levels, Player Power, and progression ledger
- Hall of Legends rankings
- Monthly Beasts Crown/Reopen
- Reset Demo Data
- Admin-only demo test match helper
- Supabase-backed Gallery using Storage plus `public.gallery_photos`
- Illustrated match creation and scoring user manual under `docs/user-manual`
- Local fallback mode for match/gallery development data

Not done in this repository:

- Automatic deployment
- Manual Supabase data changes from code
- Seeding fabricated Gallery photos
- Post-finalisation Player of the Match correction is prepared as a migration
  file but should not be treated as active until manually applied and tested.

## Main Pages

- `/` - Dashboard with approved Prague hero image, next match, player browser,
  Monthly Beasts preview, Gully Rules, recent match preview, and Legend
  Spotlight.
- `/players` - Full roster browser with search, play-style filtering, and
  sorting.
- `/players/[playerId]` - Comic-style player dossier with complete approved
  player-card artwork, Player Power, Player File, stats, and special move.
- `/matches` - Today fixtures, scheduled matches, and finalised match archive.
- `/matches/new` - Admin Create Match workflow.
- `/matches/[matchId]` - Draft editor, live match-entry workflow, or finalised
  scorecard depending on match status.
- `/leaderboard` - Hall of Legends rankings.
- `/monthly-beasts` - Monthly discipline awards based on batting XP, bowling XP,
  and fielding XP.
- `/stats` - Formula Room explaining the real XP, Level, Player Power, and
  match-result calculations.
- `/gallery` - Shared Gully photo memory wall backed by Supabase Storage.
- `/admin` - Admin Control Room.
- `/admin/apk-imports` - Admin-only APK Pending Review and correction workflow.
- `/admin/apk-imports/[importId]` - Review, correct, reject, or finalise an APK
  import through the website engine.
- `/admin/supabase-data-check` - Admin-only Supabase data diagnostics.
- `/admin/import-local-data` - Admin-only local demo import utility.

## Current Roster

The canonical active roster has 21 players. Add players only through the shared
roster in `lib/data/players.ts`; do not add separate player lists per page.

| Player | Card Title | Role |
| --- | --- | --- |
| Aninda | Rulebook Rambo | Balanced All-Rounder |
| Arunabha | Turbo Technician | Pace All-Rounder |
| Atripan | Smiling Sniper | Spin All-Rounder |
| Biplab | Nerve Ninja | Mystery-Spin All-Rounder |
| Dipanjan | Cutter Commander | Seam All-Rounder |
| Gaurav | Slow Poison | Spin All-Rounder |
| Madhab | Sweep Samurai | Pace All-Rounder |
| Rohit | Skidball Sheriff | Fast-Bowling All-Rounder |
| Soman | Apex Crusher | Power All-Rounder |
| Utpal | Tempo Tactician | Adaptive All-Rounder |
| Jogi | Loopy Loyalist | Spin All-Rounder |
| Badhan | Quiet Quake | Spin All-Rounder |
| Debraj | Steady Sentinel | Spin All-Rounder |
| Dipayan | Dipayan the Destroyer | Tactical All-Rounder |
| Dheeraj | Surgical Chase Master | Leg-Spin All-Rounder |
| Saurav | Zen Sixsmith | Batting All-Rounder |
| Naeem | Calm Cannon | Power All-Rounder |
| Chaitanya | Steady Storm | Utility All-Rounder |
| Amrit | Looper Legend | Support-Spin All-Rounder |
| PritVi | Precision Pacer | Seam All-Rounder |
| Suprateem | Style Striker | Batting All-Rounder |

Every player starts with:

- Level `0`
- XP `0`
- Blade Power, Delivery Threat, and Field Reflex at `0/100`
- All-time statistics at `0`

## Approved Visual Assets

Dashboard hero:

```text
public/backgrounds/prague-gully-arena.png
```

Use this approved image directly. Do not regenerate, repaint, replace, blur
heavily, or remove the signboards and wall text baked into the image.

Navbar brand:

```text
public/branding/gully-legends-emblem-tight.png
```

The emblem already includes the `No Rules. Only Fun!` tagline, so the app must
not render a duplicate tagline beside it.

Player cards use approved 2:3 PNG artwork. The comic card title is already
printed inside each PNG. The app renders the complete artwork and keeps dynamic
values such as name, role, Level, XP, ratings, and statistics in HTML.

## Supabase Architecture

Core schema lives in `supabase/migrations`.

Main tables:

- `public.admin_users`
- `public.players`
- `public.matches`
- `public.player_career_stats`
- `public.match_stat_applications`
- `public.monthly_beast_crowns`
- `public.gallery_photos`

Key security rules:

- Public visitors can read approved public data.
- Only authenticated Admin users can write protected data.
- Admin authorization is checked by `public.is_admin()`.
- Security-definer RPCs use `set search_path = ''`.
- Normal visitors cannot upload, edit, delete, feature photos, or modify match
  data.

Important RPCs:

- `public.finalize_match_atomic(finalisation_plan jsonb)`
- `public.crown_monthly_beasts_atomic(crown_plan jsonb)`
- `public.reopen_monthly_beast_crown(month_key text)`
- `public.reset_demo_data_atomic(reset_plan jsonb)`

The match finalisation RPC applies career stats and progression atomically and
preserves idempotency through `match_stat_applications`.

## APK Pending Review

APK review/correction functionality is included in Production `main`.

The APK can upload match payloads to the website for Admin review. Imports land
in Pending Review rather than becoming official immediately. The website Admin
can inspect the raw APK data, edit the Admin working copy, reject the import, or
finalise it through the existing website finalisation engine.

Key rules:

- APK imports are Admin-only and have no public/anonymous access.
- Demo APK imports cannot create official matches.
- Corrections use the Admin working copy and preserve the raw payload.
- Finalising an APK import still uses the website's authoritative scoring,
  result, POM, XP, progression, and ledger architecture.
- The APK integration does not replace normal Create Match / Quick Scoring.

## Admin Authentication

Admin login uses:

- Supabase Auth user
- `public.admin_users`
- `ADMIN_LOGIN_ID`
- `ADMIN_LOGIN_EMAIL`

Password recovery flow:

```text
Admin Login
Forgot password?
Supabase email link
/admin/reset-password
New password + confirmation
Back to Admin Login
```

The public UI does not expose signup or private admin email addresses.

## Match Workflow

The match workflow supports:

- Scheduled draft fixtures
- Available Today selection
- Manual team selection with cross-team mutual exclusion
- Private server-side auto-balancing from available player IDs
- Balance Teams and Shuffle use the same server-side constrained partition
  search and return only Team A / Team B IDs to the browser
- Odd-player support through one Shared Player
- Single Batter and Two Batter scoring modes
- Fielding Helpers for selected non-bowling fielders
- Draft saving without requiring complete scorecard data
- Live match entry
- Quick Scoring event history with autosave and Undo Last Ball
- Team Bowling over entry
- Player Match Records under each team
- Dismissal details only for wickets that have actually occurred
- Automatic innings stop rules
- Atomic Supabase finalisation
- Post-finalisation celebration for newly finalised official matches
- Read-only finalised scorecard view
- Read-only historical celebration replay from official scorecards
- Scheduled fixture deletion before play starts

Result rules:

- First-batting team wins by run margin.
- Chasing team wins by wickets remaining.
- Equal final totals mean a tie.
- No Result is only for abandoned or cancelled matches.

## Demo Data Tools

The Admin Control Room includes:

- Reset Demo Data
- Create Demo Test Match

Demo test matches are created server-side with `is_demo = true`. They use the
same normal match workflow and atomic finalisation path as real matches, then
Reset Demo Data can remove them later.

Normal Create Match remains `is_demo = false`; there is no public demo checkbox.

## XP, Levels, Player Power, and Awards

The calculation source is `lib/progression.ts`. Formula Room displays values
from the same constants and utilities used by the app.

Core XP rules include:

- Played: `20 XP`
- Team win: `5 XP`
- Player of the Match: `15 XP`
- Batting runs: `floor(runs / 2)`, capped at `30 XP`
- Fifty: `15 XP`
- Century additional bonus: `25 XP`
- Dismissed duck: `-8 XP`
- Wicket: `10 XP`
- Hat-trick: `25 XP`
- Maiden over: `5 XP`
- Expensive-over penalties, capped at `-20 XP`
- Catch: `6 XP`
- Run-out: `8 XP`
- Stumping: `8 XP`
- Fielding XP capped at `24 XP`
- Match XP clamped to a minimum of `-15 XP` and maximum of `120 XP`

Level progression uses:

```ts
150 + 50 * currentLevel + 10 * currentLevel * currentLevel
```

Once achieved, a player's Level cannot be reduced by later penalties.

Player Power:

- Blade Power: batting performance
- Delivery Threat: bowling performance
- Field Reflex: fielding performance

A clean zero-career player shows `0/100` for all three Player Power values.

Monthly Beasts are discipline awards:

- Batting Beast: batting XP
- Bowling Beast: bowling XP
- Catching Beast: fielding XP

Hall of Legends is separate from Monthly Beasts. It ranks raw statistical and
career leaders such as runs, bowler wickets, catches, XP, and Level.

## Post-Match Celebration

Production `main` includes the Post-Match Celebration system.

Core files:

- `lib/post-match-celebration.ts`
- `components/matches/PostMatchCelebration.tsx`
- `components/matches/MatchScorecard.tsx`
- `public/ui/post-match-celebration/*.svg`

Architecture:

- `PostMatchCelebrationSummary` is the typed celebration payload.
- A live summary is created only after successful official Admin finalisation.
- Existing finalisation, XP, result, and POM engines remain authoritative.
- There is no second XP engine.
- Demo completion, failed finalisation, pending APK imports, and idempotent
  retries without progression snapshots do not replay fake progression.

Live celebration includes:

- winner/result hero
- official Game Number, scores, and result text
- official Player of the Match
- Gully Records
- Personal Bests
- level-up cards when authoritative before/after progression exists
- XP earned
- responsive celebration UI with custom SVG assets

Historical Match Celebration Replay:

- available from official historical scorecards through `VIEW MATCH CELEBRATION`
- read-only
- reuses the same UI in historical mode
- baseline contains only official finalised matches before the target match
- same-day chronology uses official `matchNumber` / Game Number
- target match is excluded from its own baseline
- later matches never affect earlier historical celebrations
- strict record improvement means broken; equal record is not broken; no earlier
  record is `firstRecord`
- Personal Best requires strict improvement, with first qualifying PB supported

Historical XP and legacy-data safety:

- only stored `xpBreakdown.awardedXP` is displayed
- missing XP is omitted, never treated as zero
- historical before/after levels are not reconstructed when not provable
- no fake level-up or XP progress bar is shown
- missing event-backed fours, sixes, and related metrics remain unknown and are
  not fabricated as zero

Personal Best UI:

- cricket PB metrics remain: runs, wickets, catches, run-outs, stumpings, fours,
  and sixes
- `matchXP` is intentionally not shown as a Personal Best card
- XP has its own Match XP section
- cricket metric singular/plural formatting is handled in the celebration UI

## Gallery

The Gallery at `/gallery` is backed by:

- Supabase Storage public bucket: `gallery`
- Metadata table: `public.gallery_photos`
- Repository: `lib/gallery-repository.ts`
- Browser image optimisation: `lib/gallery-image.ts`

Admin upload flow:

1. Select one or more images.
2. Review previews and metadata.
3. Optimise image in the browser.
4. Upload directly to Supabase Storage with authenticated Admin JWT.
5. Insert `gallery_photos` metadata.
6. If metadata insert fails, attempt Storage cleanup.

Storage paths use:

```text
gallery/YYYY/MM/<uuid>-<sanitised-file-name>.<jpg|png|webp>
```

Uploads use `upsert: false`.

Public visitors can browse photos, use filters, open the lightbox, and follow
related match scorecard links. They cannot upload, edit, delete, or feature
photos.

When `NEXT_PUBLIC_DATA_SOURCE=local`, the Gallery can still use the existing
IndexedDB implementation. In Supabase mode, it does not silently fall back to
IndexedDB.

## Environment Variables

Create `.env.local` in the project root.

```powershell
NEXT_PUBLIC_SITE_URL=http://localhost:3001
NEXT_PUBLIC_DATA_SOURCE=supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
ADMIN_LOGIN_ID=your-admin-id
ADMIN_LOGIN_EMAIL=your-admin-email@example.com
```

For local fallback mode:

```powershell
NEXT_PUBLIC_DATA_SOURCE=local
```

Use the publishable Supabase key only. Do not put service-role credentials in
the browser or `.env.local`.

## Local Development

Install dependencies:

```powershell
npm.cmd install
```

Start the development server:

```powershell
npm.cmd run dev -- --port 3001
```

Open:

```text
http://localhost:3001
```

Use `npm.cmd` in Windows PowerShell because `npm.ps1` may be blocked by the
system execution policy.

## Verification

Run before committing changes:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
```

The current test suite covers progression, Player Power reset behavior, team
balancing, match records, scorecard validation, APK review safety, Hall of
Legends, Monthly Beasts, Formula Room, Dashboard behavior, Gallery persistence,
Post-Match Celebration, historical celebration replay, and Admin security
checks.

Current production release verification:

- `493/493` tests passing
- lint passed
- typecheck passed
- build passed
- Vercel Preview passed
- Production deployment passed
- smoke-tested successfully on `https://www.gullylegends.eu`

## Agent Handoff

Detailed project metadata for future agents is stored in:

```text
AGENT_PROJECT_METADATA.json
GULLY_LEGENDS_PROJECT_HANDOFF_METADATA_UPDATED.md
```

Future agents should read those files before making broad changes.
