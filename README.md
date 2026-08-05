# Gully Legends Prague

Gaming-style cricket dashboard and match-entry website for the Gully Legends
Prague group at CZU Gully Arena.

## Current Status

This is a local mock-data Next.js application using:

- Next.js App Router
- TypeScript
- Tailwind CSS
- Real responsive React components
- Approved dashboard and player-card image assets
- Local typed player data
- Local mock match-entry state
- Server-only team balancing logic
- Progression and rating utilities with tests

Supabase, persistent database writes, and production authentication are not
connected yet.

## Players

The project currently includes 16 approved players:

- Aninda - Rulebook Rambo
- Arunabha - Turbo Technician
- Atripan - Smiling Sniper
- Biplab - Nerve Ninja
- Dipanjan - Cutter Commander
- Gaurav - Loopy Lightning
- Madhab - Sweep Samurai
- Rohit - Skidball Sheriff
- Soman - Silent Sixer
- Utpal - Tempo Tactician
- Jogindar - Loopy Loyalist
- Badhan - Quiet Quake
- Debraj - Steady Sentinel
- Dipayan - Chessboard Charger
- Dheeraj - Leg-Break Jester
- Saurav - Zen Sixsmith

Every player starts with:

- Level `0`
- XP `0`
- Blade Power / batting rating `0/100`
- Delivery Threat / bowling rating `0/100`
- Field Reflex / fielding rating `0/100`
- All-time matches, runs, wickets, and catches at `0`

Monthly awards show `Not decided yet` until finalised match data exists.

## Approved Visual Assets

The dashboard uses the approved Prague background:

```text
public/backgrounds/prague-gully-arena.png
```

This image must be used directly. Do not regenerate, repaint, replace, blur
heavily, or remove the baked-in signboards and wall text.

Player cards use approved 2:3 PNG artwork from:

```text
public/images/player-cards
```

The player-card title is already printed in each PNG. The app renders the
complete artwork with `object-fit: contain` and keeps dynamic data such as
name, role, level, ratings, and statistics as HTML.

## Player Progression

Progression logic lives in:

```text
lib/progression.ts
```

Match XP uses simple live-scorecard data only. It does not require balls faced,
strike rate, dot balls, ball-by-ball bowling, or individual fielding chances.

XP rules:

- Played: `20 XP`
- Team win: `5 XP`
- Player of the Match: `15 XP`
- Batting runs: `floor(runs / 2)`, capped at `30 XP`
- Fifty: `15 XP`
- Century: `25 XP`
- A century also receives the fifty bonus
- Dismissed duck: `-8 XP`
- Wicket: `10 XP` each
- Hat-trick: `25 XP` each, entered manually
- Maiden over: `5 XP`
- Expensive over penalties:
  - 21-24 runs: `-5 XP`
  - 25-29 runs: `-8 XP`
  - 30+ runs: `-12 XP`
  - total expensive-over penalty capped at `-20 XP`
- Fielding:
  - Catch: `6 XP`
  - Run-out: `8 XP`
  - Stumping: `8 XP`
  - total fielding XP capped at `24 XP`
- Match XP is clamped to a minimum of `-15 XP`

Level progression uses increasing XP requirements:

```ts
100 + 50 * currentLevel + 20 * currentLevel * currentLevel
```

Once a player earns a level, penalties cannot reduce that achieved level.

## Ratings

Player Power contains three rating categories:

- Blade Power
- Delivery Threat
- Field Reflex

Ratings use sample-size protection:

- `0` finalised matches: `UNRATED`
- `1-2` finalised matches: `SCOUTING`
- `3-7` finalised matches: `PROVISIONAL`
- `8+` finalised matches: `ESTABLISHED`

Numeric ratings are shown only after at least three finalised matches.

## Create Match Workflow

Create Match is a local mock workflow in:

```text
components/matches/MockMatchEntryForm.tsx
```

It supports:

- Available Today selection
- Manual Team A and Team B selection
- Mutual exclusion between teams
- Server-side auto-balancing from available player IDs
- Shuffle Again
- Clear Teams
- Player match records only for selected players
- Automatic Team A and Team B totals from player runs
- Server-side validation and total recalculation before mock save/submit

Private team-balancing weights live only in:

```text
server/team-balancing.ts
```

The client sends only available player IDs and receives only Team A and Team B
player IDs. Hidden balancing data is not exposed in public player profiles,
HTML, labels, tooltips, logs, or API responses.

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

Use `npm.cmd` on Windows PowerShell because `npm.ps1` may be blocked by the
system execution policy.

## Verification

Run before committing changes:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
```

The test suite covers progression, expensive-over penalties, level protection,
rating safety, team balancing, mutual exclusion, and automatic team totals.

## Agent Handoff

Detailed implementation metadata for future agents is stored in:

```text
AGENT_PROJECT_METADATA.json
```
