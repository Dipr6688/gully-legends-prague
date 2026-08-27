# Gully Legends Prague

Gaming/comic-style cricket website for the Gully Legends Prague group at CZU Gully Arena.

Production website:

```text
https://www.gullylegends.eu
```

The website is a Next.js/Supabase application with public cricket pages, protected Admin match management, APK Pending Review, player progression, achievements, celebrations, Gallery, and the server-backed Balance Teams engine used by both website and APK flows.

## Current Production State

Website production branch: `main`

Current website production HEAD:

```text
651d5d1 Add server-backed Balance Teams
```

APK repository:

```text
https://github.com/Dipr6688/gully-legends-arena-apk.git
```

Current APK release:

```text
Gully Legends Arena v1.3.0
applicationId: com.gullylegends.arena
versionCode: 6
versionName: 1.3.0
minSdk: 24
targetSdk: 34
tag: v1.3.0
release commit: dd75200 Release Gully Legends Arena v1.3.0
```

Recent validation:

- Website: `619/619` tests passing, lint passed, typecheck passed, build passed for the current Balance Teams release.
- APK: match setup parity test passed, app-sync contract smoke test passed, Gradle test passed, `lintDebug` passed, `assembleDebug` passed, `assembleRelease` passed.
- APK signer SHA-256 verified: `2fb53fff5b42b31f63716f8d9da78f87058bcca96f6b9ee678e6f9503431d2e2`.

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS plus custom CSS in `app/globals.css`
- Supabase Auth
- Supabase Postgres with Row Level Security
- Supabase Storage public `gallery` bucket
- Local fallback mode for development when `NEXT_PUBLIC_DATA_SOURCE=local`
- Node test runner for project logic and source-level UI checks

## Main Features

- Public Supabase-backed website reads
- Secure Admin login with password reset
- Admin-only Create Match, Quick Scoring, and atomic finalisation
- APK Pending Review / Admin correction workflow for APK-submitted matches
- Website and APK server-backed Balance Teams
- Quick Scoring with single-batter/two-batter modes, innings breaks, undo, wides, no-balls, wickets, run-outs, stumpings, and mobile-friendly scoring controls
- Explicit Match Date support for APK sync
- APK Player of the Match recommendation as recommendation only
- Post-Match Celebration after official finalisation
- Historical Match Celebration Replay from official scorecards
- Share Match Card export/share flow
- Trophy Cabinet achievements and milestones
- Gully Face-Off player comparison arena
- Match-day Fielding Helpers
- Career statistics, XP, Levels, Player Power, and progression ledger
- Hall of Legends rankings
- Monthly Beasts Crown/Reopen
- Reset Demo Data
- Supabase-backed Gallery
- Illustrated user manual under `docs/user-manual`

## Website / APK Authority Model

The APK is a recorder and setup client. The website/Admin system is authoritative.

```text
APK offline/local match
-> sync
-> website authentication
-> server re-derives and validates
-> apk_match_imports Pending Review
-> Admin review/correction
-> Admin POM confirmation
-> official finalisation
-> official match/stats/XP/Game Number
```

APK upload is not finalisation. APK never directly applies official career stats, XP, Game Number, official POM, progression, Hall of Legends, Monthly Beasts, or Archive effects.

## Balance Teams

v1.3.0 adds server-backed Balance Teams for the website and APK.

Production endpoint used by APK:

```text
POST /api/app-sync/team-balance
```

APK sends setup information only:

```text
playerIds
sharedPlayerId
```

Server returns only:

```text
teamAPlayerIds
teamBPlayerIds
sharedPlayerId
```

Balance Teams:

- considers batting, bowling, and fielding strength at a high level
- protects distribution of stronger batting/bowling resources
- preserves private server-side automatic balancing constraints
- produces equal exclusive-team sizes
- supports Balance Again among best/equivalent candidates
- supports odd attendance with a manually selected Shared Player
- keeps balanced teams manually editable
- works alongside Use Previous Teams and manual setup
- keeps Fielding Helper semantics intact
- fails safely offline and leaves manual setup available

Private Balance Teams ratings, hidden weights, private pair/separation rules, candidate scores, and selection internals must never be exposed in APK assets, browser payloads, README text, public documentation, UI labels, logs, or public API responses.

## APK v1.2 Features Retained in v1.3.0

v1.3.0 includes all completed v1.2 functionality:

- full Run Out handling
- completed runs on Run Out
- striker/non-striker dismissal selection
- new batter selection
- explicit next striker/non-striker
- finished-match Run Out correction
- replay-based correction
- end-of-over Undo
- undo after next-bowler selection
- final-over Undo
- Use Previous Teams
- editable reused teams
- Shared Player alignment
- Fielding Helper alignment
- consecutive-over bowler prevention
- explicit Match Date
- APK POM recommendation
- offline-first recording
- Pending Review sync

## Main Pages

- `/` - Dashboard
- `/players` - Full roster browser
- `/players/[playerId]` - Comic-style player dossier with Trophy Cabinet
- `/matches` - Fixtures and finalised match archive
- `/matches/new` - Admin Create Match workflow
- `/matches/[matchId]` - Draft editor, live match entry, or finalised scorecard
- `/leaderboard` - Hall of Legends
- `/face-off` - Gully Face-Off
- `/monthly-beasts` - Monthly discipline awards
- `/stats` - Formula Room
- `/gallery` - Supabase-backed photo wall
- `/admin` - Admin Control Room
- `/admin/apk-imports` - APK Pending Review
- `/admin/apk-imports/[importId]` - APK review/correction/finalisation

## Current Roster

The canonical active roster has 21 players. Add players only through the shared roster in `lib/data/players.ts`; do not add separate player lists per page.

Stable display notes:

- stable ID `jogindar` displays as `Jogi`
- stable ID `naim` displays as `Naeem`
- Gaurav card title is `Slow Poison`
- Soman card title is `Apex Crusher`
- Dipayan card title is `Dipayan the Destroyer`
- Dheeraj card title is `Surgical Chase Master`

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
- `public.apk_match_imports`

Important RPCs:

- `public.finalize_match_atomic(finalisation_plan jsonb)`
- `public.crown_monthly_beasts_atomic(crown_plan jsonb)`
- `public.reopen_monthly_beast_crown(month_key text)`
- `public.reset_demo_data_atomic(reset_plan jsonb)`
- `public.upsert_apk_match_import_atomic(jsonb, jsonb, jsonb, date, text)`
- `public.finalize_apk_import_atomic(uuid, jsonb)`

Security rules:

- public visitors can read approved public data
- protected writes require authenticated Admin
- Admin authorization uses `public.admin_users` and `public.is_admin()`
- SECURITY DEFINER functions use controlled `search_path`
- no service-role credentials in browser-facing code
- APK imports are Admin-only and have no public/anonymous access

## APK Pending Review and Demo Safety

APK review/correction functionality is in Production `main`.

- APK-submitted matches land in Pending Review.
- Admin can inspect raw APK payload data.
- Admin can edit the website-side working copy.
- Admin can reject an import.
- Admin can finalise a valid non-demo import through the website finalisation engine.
- Demo APK imports cannot create official matches.
- Raw APK payload data remains preserved separately from Admin review copies.
- `pending_review`, `correction_pending`, `finalised`, and `rejected` statuses are preserved.

Pending Review has explicit finalisation safety:

- real imports require a `FINALISE OFFICIAL MATCH` confirmation
- Demo imports show `DEMO MATCH - CANNOT BE FINALISED AS OFFICIAL`
- server/database Demo guards remain authoritative

## XP, Levels, Player Power, and Awards

The calculation source is `lib/progression.ts`. Formula Room displays values from the same constants/utilities used by the app.

Core XP rules include Played XP, Win XP, Player of the Match XP, batting runs, milestone bonuses, duck penalty, wicket XP, hat-tricks, maidens, expensive-over penalties, catches, run-outs, stumpings, fielding cap, and match XP clamp.

Level progression uses:

```ts
150 + 50 * currentLevel + 10 * currentLevel * currentLevel
```

Once achieved, a player's Level cannot be reduced by later penalties.

A clean zero-career player shows `0/100` for Blade Power, Delivery Threat, and Field Reflex.

## Post-Match Celebration and Share Match Card

Production `main` includes the Post-Match Celebration system.

Core files:

- `lib/post-match-celebration.ts`
- `components/matches/PostMatchCelebration.tsx`
- `components/matches/MatchShareCard.tsx`
- `lib/match-share-card.ts`
- `components/matches/MatchScorecard.tsx`
- `public/ui/post-match-celebration/*-v2.png`

Architecture:

- `PostMatchCelebrationSummary` is created only after successful official Admin finalisation.
- Existing finalisation, XP, result, and POM engines remain authoritative.
- There is no second XP engine.
- Demo completion, failed finalisation, pending APK imports, and idempotent retries without progression snapshots do not replay fake progression.

Historical replay is read-only and available from official scorecards through `VIEW MATCH CELEBRATION`. Historical baselines use only official finalised matches before the target, same-day ordering uses official Game Number, later matches never affect earlier replay, equal records are not broken, and missing legacy event-backed data is never fabricated.

Share Match Card exports a `1080x1350` PNG, supports native Web Share where available, and uses Save Image/download fallback.

## Gully Face-Off

`/face-off` compares two different players without declaring an artificial overall winner.

- URL state supported
- same-player comparison prevented
- dedicated premium VS artwork used
- full-career metrics use reliable official history
- tracked-only advanced metrics compare valid ball-by-ball subsets only
- legacy missing ball-by-ball data is not fabricated
- no private Team Balance inputs are used

## Demo Data

Demo Test Match is safe for Preview/testing and uses `is_demo=true`.

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

Use the publishable Supabase key only. Do not put service-role credentials in browser code or `.env.local`.

## Local Development

```powershell
npm.cmd install
npm.cmd run dev -- --port 3001
```

Open:

```text
http://localhost:3001
```

Use `npm.cmd` in Windows PowerShell because `npm.ps1` may be blocked.

## Verification

Run before committing website changes:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
```

For this documentation refresh, `npm.cmd run test` passed `619/619`; post-edit lint and typecheck were also run.

## Agent Handoff

Detailed metadata for future agents is stored in:

```text
AGENT_PROJECT_METADATA.json
GULLY_LEGENDS_PROJECT_HANDOFF_METADATA_UPDATED.md
C:\cricket_website\GULLY_LEGENDS_APK_INTEGRATION_HANDOFF_CURRENT.md
```

Future agents should read those files before broad changes.
