# Gully Legends Prague

Gaming/comic-style cricket website for the Gully Legends Prague group at
CZU Gully Arena.

The app is built with real responsive Next.js components, typed local data, and
local browser persistence. It is currently local-first: Supabase, production
authentication, and hosted database storage are intentionally not connected yet.

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS plus custom CSS in `app/globals.css`
- Local TypeScript roster data
- Browser `localStorage` for local match history and career progress
- Browser IndexedDB for local Gallery photo blobs and metadata
- Server routes for team balancing and match validation
- Node test runner for project logic and source-level UI checks

## Main Pages

- `/` - Dashboard with approved Prague hero image, next match, player browser,
  Monthly Beasts preview, Gully Rules, recent match preview, and Top Performers.
- `/players` - Full roster browser with search, play-style filtering, and
  sorting.
- `/players/[playerId]` - Comic-style player dossier with complete approved
  player-card artwork, Player Power, Player File, stats, and special move.
- `/matches` - Today fixtures, scheduled matches, and finalised match archive.
- `/matches/new` - Create Match workflow.
- `/matches/[matchId]` - Draft editor, live match-entry workflow, or finalised
  scorecard depending on match status.
- `/leaderboard` - Hall of Legends rankings.
- `/monthly-beasts` - Monthly discipline awards based on batting XP, bowling XP,
  and fielding XP.
- `/stats` - Formula Room explaining the real XP, Level, Player Power, and
  match-result calculations.
- `/gallery` - Local-first Gully photo memory wall.

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
| Gaurav | Loopy Lightning | Spin All-Rounder |
| Madhab | Sweep Samurai | Pace All-Rounder |
| Rohit | Skidball Sheriff | Fast-Bowling All-Rounder |
| Soman | Silent Sixer | Power All-Rounder |
| Utpal | Tempo Tactician | Adaptive All-Rounder |
| Jogindar | Loopy Loyalist | Spin All-Rounder |
| Badhan | Quiet Quake | Spin All-Rounder |
| Debraj | Steady Sentinel | Spin All-Rounder |
| Dipayan | Chessboard Charger | Tactical All-Rounder |
| Dheeraj | Leg-Break Jester | Leg-Spin All-Rounder |
| Saurav | Zen Sixsmith | Batting All-Rounder |
| Naim | Calm Cannon | Power All-Rounder |
| Chaitanya | Steady Storm | Utility All-Rounder |
| Amrit | Looper Legend | Support-Spin All-Rounder |
| PritVi | Precision Pacer | Seam All-Rounder |
| Suprateem | Style Striker | Batting All-Rounder |

Every player starts with:

- Level `0`
- XP `0`
- Batting, bowling, and fielding ratings at `0/100`
- All-time matches, runs, wickets, catches, run-outs, stumpings, wins, and
  Player of the Match awards at `0`

## Approved Visual Assets

The dashboard hero uses:

```text
public/backgrounds/prague-gully-arena.png
```

Use this image directly. Do not regenerate, repaint, replace, blur heavily, or
remove the signboards and wall text baked into the image.

The navbar brand uses:

```text
public/branding/gully-legends-emblem-tight.png
```

The emblem already includes the `No Rules. Only Fun!` tagline, so the app must
not render a duplicate tagline beside it.

Player cards use approved 2:3 PNG artwork. The comic card title is already
printed inside each PNG. The app renders the full image with `object-fit:
contain` and renders only dynamic values such as player name, role, Level, XP,
ratings, and statistics in HTML.

## Match Workflow

The match workflow is local-first but no longer a mock placeholder in the UI.
It supports:

- Scheduled draft fixtures
- Available Today selection
- Manual team selection with cross-team mutual exclusion
- Server-side auto-balancing from available player IDs
- Odd-player support through a single Shared Player
- Draft saving without requiring complete scorecard data
- Live match entry
- Team Bowling over entry
- Player Match Records under each team
- Dismissal details for wickets that have actually occurred
- Automatic innings stop rules
- Final result calculation on finalisation
- Read-only finalised scorecard view
- Scheduled fixture deletion before play starts

Result rules:

- First-batting team wins by run margin.
- Chasing team wins by wickets remaining.
- Equal final totals mean a tie.
- No Result is only for abandoned or cancelled matches.

## XP, Levels, Ratings, and Awards

The real calculation source is `lib/progression.ts`. Formula Room displays
values from the same constants and utilities used by the app; it does not keep
separate display-only formulas.

Core XP rules include:

- Played: `20 XP`
- Team win: `5 XP`
- Player of the Match: `15 XP`
- Batting runs: `floor(runs / 2)`, capped at `30 XP`
- Fifty: `15 XP`
- Century: `25 XP`
- Dismissed duck: `-8 XP`
- Wicket: `10 XP`
- Hat-trick: `25 XP`
- Maiden over: `5 XP`
- Expensive-over penalties, capped at `-20 XP`
- Catch: `6 XP`
- Run-out: `8 XP`
- Stumping: `8 XP`
- Fielding XP capped at `24 XP`
- Match XP clamped to a minimum of `-15 XP`

Level progression uses:

```ts
100 + 50 * currentLevel + 20 * currentLevel * currentLevel
```

Once achieved, a player's Level cannot be reduced by later penalties.

Monthly Beasts are discipline awards:

- Batting Beast: batting XP
- Bowling Beast: bowling XP
- Catching Beast: fielding XP

Hall of Legends is separate from Monthly Beasts. It ranks raw statistical and
career leaders such as runs, bowler wickets, catches, XP, and Level.

## Gallery

The Gallery at `/gallery` is a local-first Gully memory wall for group photos,
match days, celebrations, awards, Prague outings, and off-field moments.

Normal viewers can browse photos. Admin controls are hidden unless local admin
mode is active. For local development, open:

```text
http://localhost:3001/gallery?admin=1
```

Gallery storage uses:

- `lib/gallery.ts` for the typed `GalleryRepository` interface
- `lib/gallery-repository.ts` for the local IndexedDB implementation
- `lib/gallery-image.ts` for browser canvas image optimisation

Local Gallery uploads are stored only in the browser/device where they are
added. A future Supabase adapter can use a `gallery` storage bucket and
`gallery_photos` metadata table without redesigning the UI.

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

The current test suite covers progression, ratings, team balancing, match
records, scorecard validation, Hall of Legends, Monthly Beasts, Formula Room,
Dashboard behavior, and Gallery source/workflow checks.

## Data and Persistence Status

Current local persistence:

- Career progress: browser `localStorage`
- Match history: browser `localStorage`
- Gallery photos: browser IndexedDB

Not connected yet:

- Supabase
- Production authentication
- Production photo storage
- Shared multi-device database state

## Agent Handoff

Detailed project metadata for future agents is stored in:

```text
AGENT_PROJECT_METADATA.json
```

Future agents should read that file before making broad changes.
