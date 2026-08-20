# Gully Legends Prague — Project Handoff / Metadata

**Purpose:** Upload this file at the start of a new ChatGPT/Codex conversation so the assistant can understand the project without needing the full old chat history.

**Last updated:** 20 August 2026

**Current overall status:** The project is in a stable state on Production `main`. The production website is live at the custom domain. APK Pending Review / Admin correction, Quick Scoring, simplified match setup, Supabase persistence, Gallery, Hall of Legends, Monthly Beasts, Fielding Helpers, private server-side Team Balance / Shuffle, Post-Match Celebration, Historical Match Celebration Replay, and the illustrated user manual are implemented. Current release validation: lint passed, typecheck passed, tests passed `493/493`, production build passed. Vercel Preview passed, Production deployment passed, and smoke testing on `https://www.gullylegends.eu` passed.

**Privacy note for agents:** Automatic Team Balance / Shuffle uses private server-side inputs. Do not expose balancing weights, groups, totals, pair rules, or separation reasons in UI copy, public API responses, README text, screenshots, accessibility labels, or public-facing docs.

---

## 1. Project identity

- **Project name:** Gully Legends Prague
- **Tagline:** No Rules. Only Fun!
- **Purpose:** Private/community cricket website for a Prague gully-cricket group.
- **Location/context:** Prague, Czechia; matches are typically played around CZU / Prague 6 / Suchdol.
- **Approx. player count:** 21 configured players.
- **Audience:** Friends/players can view public content without logging in.
- **Admin model:** Exactly one authorized admin. No public signup page.

---

## 2. Production URLs

### Canonical public domain
`https://www.gullylegends.eu`

### Apex/root domain
`https://gullylegends.eu`

Configured in Vercel as a **308 redirect** to:

`https://www.gullylegends.eu`

### Original Vercel production domain
`https://gully-legends-prague.vercel.app`

This may remain active, but the public URL to share is:

`https://www.gullylegends.eu`

### Preview deployments
Vercel Preview URLs are branch-specific and may change.

A previously used Preview URL was:

`https://gully-legends-prague-git-feature-supabase-data-dip6688.vercel.app`

Future feature branches will receive their own Preview URLs.

---

## 3. Hosting, source control, backend, DNS

### Frontend / hosting
- **Framework:** Next.js App Router
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Hosting:** Vercel

### Source control
- **Repository:** GitHub
- **Production branch:** `main`
- Production is deployed from `main`.
- Safe workflow: feature branch → Vercel Preview → test → merge to `main` → Production.

### Current branch
At the time of this handoff:

`main`

Production `main` HEAD:

`6e41645 Add historical match celebration replay`

The current local project state is stable and validated. Use a new feature branch for future changes unless the user explicitly asks to work directly on `main`.

### Backend
- **Database/Auth/Storage:** Supabase
- **Runtime data mode:** Supabase
- Public users have read access to intended public data.
- Protected writes require the authorized admin.

### DNS
- **Registrar / DNS provider:** Porkbun
- Domain: `gullylegends.eu`
- Vercel DNS currently valid.
- Routing:
  - `gullylegends.eu` → 308 → `www.gullylegends.eu`
  - `www.gullylegends.eu` → Vercel Production

---

## 4. Important Vercel environment variables

Do not expose secret values in chat.

Required variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `ADMIN_LOGIN_ID`
- `ADMIN_LOGIN_EMAIL`
- `NEXT_PUBLIC_DATA_SOURCE`
- `NEXT_PUBLIC_SITE_URL`

### Production
- `NEXT_PUBLIC_DATA_SOURCE=supabase`
- `NEXT_PUBLIC_SITE_URL=https://www.gullylegends.eu`

### Preview
- `NEXT_PUBLIC_DATA_SOURCE=supabase`
- `NEXT_PUBLIC_SITE_URL=<current branch Preview URL>`

### Security rules
- Never commit `.env.local`.
- Never expose admin password.
- Never expose Supabase database password.
- Never expose service-role/secret keys.
- Never place service-role credentials in client-side `NEXT_PUBLIC_*` variables.

---

## 5. Supabase Auth URL configuration

### Site URL
`https://www.gullylegends.eu`

### Approved redirects include
- `https://www.gullylegends.eu/**`
- `https://gullylegends.eu/**`
- `https://gully-legends-prague.vercel.app/**`
- existing branch Preview URL(s)
- `http://localhost:3001/**`
- `http://localhost:3001/auth/callback`

When a new Vercel feature Preview requires Admin Auth, add that Preview URL to Supabase Redirect URLs if necessary.

---

## 6. Local development environment

### Windows project path
`C:\cricket_website\gully-legends-prague`

### npm / npx on this machine
PowerShell blocks `npm.ps1` / `npx.ps1`.

Use:

- `npm.cmd`
- `npx.cmd`

### Local dev port
`3001`

### REQUIRED exact restart procedure

Whenever instructing the user to restart Next.js, use the full procedure:

1. Find the process:

```powershell
netstat -ano | findstr :3001
```

2. Find the PID on the `LISTENING` line.

3. Kill it:

```powershell
taskkill /PID YOUR_PID /F
```

4. Verify nothing is listening:

```powershell
netstat -ano | findstr LISTENING | findstr :3001
```

It should return nothing.

5. Restart:

```powershell
npm.cmd run dev -- --port 3001
```

6. Wait for:

```text
Local: http://localhost:3001
```

Do not omit/simplify this sequence.

---

## 7. Public website sections

- Dashboard
- Players
- Player detail
- Matches
- Scorecards
- Match Celebration Replay from eligible official scorecards
- Hall of Legends (`/leaderboard`)
- Monthly Beasts
- Formula Room (`/stats`)
- Gallery
- Admin (protected)
- APK Pending Review / Admin correction screens under Admin

Public users do not need accounts.

---

## 8. Visual identity / important assets

Overall look:
- comic / gaming / street-cricket
- dark navy / black
- cream/yellow comic typography
- cyan/orange/lime/purple accents
- Prague + gully-cricket atmosphere

Important assets:
- `/public/backgrounds/prague-gully-arena.png`
- `/public/branding/gully-legends-emblem-tight.png`
- `/public/player-cards/...`

Existing player-card artwork should be preserved consistently unless explicitly changed.

---

## 9. XP system

### Match XP rules
- Played: `+20`
- Win: `+5`
- Player of the Match: `+15`
- Batting: `+1 XP per 2 runs`, ordinary batting XP capped at `30`
- 50+ runs: `+15`
- 100+ runs: additional `+25`
- Duck / out for 0: `-8`
- Bowler-credit wicket: `+10`
- Hat-trick: `+25`
- Maiden: `+5`
- Catch: `+6`
- Run-out: `+8`

### Expensive-over penalties
- 21–24 runs: `-5`
- 25–29 runs: `-8`
- 30+ runs: `-12`
- Bowling penalty cap: `-20` per match

### Fielding cap
Fielding XP cap: `24` per match.

### Match XP clamp
- Minimum: `-15`
- Maximum: `+120`

### Finalisation
Only **finalised matches** update career/progression, exactly once.

### Level requirement
`150 + 50*currentLevel + 10*currentLevel^2`

No level demotion.

---

## 10. Player Power / rating

Displayed powers:
- Blade Power / Batting
- Delivery Threat / Bowling
- Field Reflex / Fielding

### Clean no-data state
- Blade Power = `0/100`
- Delivery Threat = `0/100`
- Field Reflex = `0/100`

### Blade Power reset bug already fixed
Root cause:
- `calculatePlayerRatingSnapshots` used `percentileRank(...)`
- all-zero batting data tied, so percentile returned 50
- bowling/fielding already had no-data guards

Fix:
- `inningsBatted === 0` → Blade Power `0`
- `inningsBatted > 0` → existing formula unchanged

This is a TypeScript calculation fix, not a Supabase data change.

---

# 11. Current match-management philosophy

The admin-facing match workflow is being simplified.

The user should not have to manually manage technical statuses such as:

- Draft
- In Progress
- Abandoned
- Cancelled

Normal user-facing flow should be approximately:

```text
Setup saved / Draft
        ↓
Quick Scoring
        ↓
Review & Finalise
        ↓
Finalised
```

Internal technical statuses may remain if required by the existing database/RPC architecture.

### Important
- Draft data should be safely saved.
- Quick Scoring should autosave through the existing non-finalised match-save path.
- Finalisation remains a single protected final step.

---

# 12. Quick Scoring - IMPLEMENTED STABLE WORKFLOW

The major Quick Scoring workflow is implemented in the current stable project state.
It makes scoring usable while players are also participating in the match.

## Core idea
During play, record delivery events; derive the detailed statistics automatically.

### Main live controls
- `0`
- `1`
- `2`
- `3`
- `4`
- `6`
- `WD`
- `NB`
- `WICKET`
- `UNDO LAST BALL`
- `SWAP STRIKERS`
- current-over event correction

### Main live display
- team score
- wickets
- overs
- current over
- striker
- non-striker
- bowler
- autosave indicator

### Event architecture
Versioned Quick Scoring event history is stored inside the existing `MatchRecord` payload.

Core implementation:
- `lib/quick-scoring.ts`

The reducer replays delivery events into existing match/stat structures instead of creating a separate conflicting statistics engine.

It derives/reuses:
- batter runs
- team total
- wickets
- legal balls
- overs
- batting participation
- batting positions
- dismissals
- extras
- bowler legal balls
- overs
- conceded runs
- wickets
- catches
- run-outs
- other structures needed by current finalisation

---

## 13. Quick Scoring — batting rules

### Active batters
Striker and non-striker must be different players.

Invariant:

`strikerId !== nonStrikerId`

UI and business/reducer validation enforce this.

If a player is selected as striker, they must not be available as non-striker, and vice versa.

### Eligible batters
Selectors should exclude:
- opposite-team players
- dismissed players
- the other active batter
- otherwise ineligible players

### Batting order
Opening batters get positions `#1` and `#2`.

New batter receives the next batting position on first entry.

Batting position is persisted and no longer inferred from roster order.

Admin still has Up/Down batting-order correction controls in review/detail UI.

### Did Bat vs Played
These are different concepts.

Current design:
- selected roster player → `played = true` automatically
- no visible Played checkbox
- selected player may still have `didBat = false`
- opening striker/non-striker become `didBat = true`
- a new batter becomes `didBat = true`
- player who never comes to the crease remains **did not bat**

If a selected person did not participate at all, remove them from the team before finalisation rather than toggling Played.

### Shared Player
Preserve:
- can appear on both teams
- one career match
- one Played XP award
- no win bonus
- no duplicate progression application

---

## 14. Quick Scoring — strike and runs

Normal run logic:
- 0 → no strike swap
- 1 → swap
- 2 → no swap
- 3 → swap
- 4 → no swap
- 6 → no swap

End of over handles strike according to cricket logic.

Manual `SWAP STRIKERS` exists for corrections/special gully situations.

---

## 15. Quick Scoring — extras

### Wide
- team extra
- bowler conceded
- not a legal delivery

### No-ball
- not a legal delivery
- supports batter runs in addition to no-ball extra
- derived totals/extras/bowler conceded should remain consistent with existing conventions

---

## 16. Quick Scoring — wickets

### Active dismissal choices
- Bowled
- Caught
- Run Out
- Other

### NO ACTIVE LBW
The group does not use LBW.

Legacy `lbw` type may remain readable for old data, but LBW must not appear in active match entry.

### Caught
- selected batter out
- bowler receives wicket
- catcher receives catch credit

### Run Out
Current approved Quick Scoring design:
- one fielder only
- no assisting fielder in active UI
- scorer selects whether striker or non-striker was run out
- scorer selects completed runs
- scorer selects run-out fielder
- scorer selects new batter
- scorer confirms next striker/non-striker
- bowler receives **no wicket**
- fielding run-out credit goes to exactly one player
- new batter gets next batting position
- legal-ball logic must remain correct

Legacy optional `assistingFielderId` may remain readable for old payload compatibility, but must not be used in new active scoring.

---

## 17. Quick Scoring — over management

### End of Over
After six legal deliveries:
- show a large/high-visibility End of Over UI
- show score/over/current over information
- request/select next bowler before continuing

### Consecutive bowler rule
Normal cricket logic is enforced:

If Naeem bowls Over 1:
- Naeem cannot bowl Over 2

If Saurav bowls Over 2:
- Saurav cannot bowl Over 3
- Naeem can bowl Over 3 again

Only the **immediately previous over bowler** is excluded, subject to other eligibility rules.

### Sixth-ball Undo
If the sixth legal delivery was entered incorrectly, `UNDO LAST BALL` must:
- remove that event
- reopen the over
- reverse team score
- reverse batter stats
- reverse extras
- reverse wickets if applicable
- reverse bowler figures
- restore striker/non-striker
- remove End-of-Over state
- clear/revert next-bowler selection caused by that completed over

This must also work on the final scheduled over.

### Current-over correction
Current-over events can be corrected and the innings state is recalculated from event history.

Do not manually patch dependent totals.

---

## 18. Quick Scoring — autosave / recovery

Quick Scoring autosaves through the existing non-finalised match save path.

Desired UX:
- `Saving...`
- `Saved ✓`

Manual Save Draft remains available.

Supabase remains authoritative. Any local browser recovery cache, if used, is only a recovery layer, not a second data source.

---

# 19. Player of the Match — CURRENT DESIGN

### Per-player controls
There must be:
- **no POM checkbox inside player cards**
- **no POM toggle inside Team Player Records**

There should be exactly one POM section in **Review & Finalise**.

### Automatic recommendation
Player of the Match is suggested based on the **highest match XP before adding the +15 POM bonus**.

Authoritative XP functions reused:
- `calculatePlayerMatchXP`
- `calculateSharedPlayerMatchXP`

Conceptually:

1. calculate existing match XP
2. force `playerOfMatch=false`
3. compare pre-POM XP
4. unique highest → suggested/default POM
5. exact tie → no arbitrary winner; leave None/manual choice
6. admin may override before finalisation
7. final selected POM receives +15 exactly once

### Manual override
Admin may change:
- suggested player → another player
- suggested player → None
- None → player

Manual choice should not be overwritten on ordinary re-render.

### Final confirmation
Final confirmation should show the selected POM or None before the existing atomic finalisation runs.

---

# 20. Post-finalisation POM correction — PREPARED BUT NOT ACTIVE

A future Admin-only feature has been designed to safely correct POM after finalisation because POM contributes +15 XP.

Examples:
- Rohit → Naeem
- Rohit → None
- None → Naeem

### Prepared files
- `lib/player-of-match.ts`
- `supabase/migrations/20260807113000_player_of_match_correction.sql`

### IMPORTANT
The migration has **NOT been executed** against Supabase.

The current stable production flow must **not depend on this RPC** until the migration is manually applied and tested.

Current normal match flow uses only:
- POM recommendation before finalisation
- manual override before finalisation
- normal +15 POM XP during existing atomic finalisation

### Migration safety work
The prepared RPC design:
- updates match POM metadata
- updates affected `player_career_stats`
- updates `match_stat_applications`
- uses stale-state checks including expected current POM / expected XP breakdown
- changes only the POM XP component plus affected awarded total/level logic
- preserves cricket stats
- transactionally keeps match payload / career / ledger consistent
- preserves no-level-demotion behavior
- admin-only / SECURITY DEFINER / controlled search path / restricted grants

### Do not run yet
Before activation, the migration must be manually reviewed/applied and the caller tested against the installed RPC.

---

# 20A. Post-Match Celebration — PRODUCTION

Post-Match Celebration is implemented, committed, fast-forward merged into
Production `main`, deployed, and smoke-tested successfully.

Important commits:

- `be0cc79 Add post-match celebration foundation`
- `2e5902c Add post-match celebration experience`
- `6e41645 Add historical match celebration replay`

Core implementation:

- `lib/post-match-celebration.ts`
- `components/matches/PostMatchCelebration.tsx`
- `components/matches/MatchScorecard.tsx`
- `app/api/admin/matches/finalize/route.ts`
- `public/ui/post-match-celebration/*.svg`

### Celebration architecture

- `PostMatchCelebrationSummary` is the typed summary passed to the UI.
- A live celebration summary is created only after successful official Admin
  finalisation.
- Existing finalisation, XP, result, POM, progression, and scorecard engines
  remain authoritative.
- There is no second XP engine and no duplicate result/POM calculation engine.
- The celebration is UI/read-model work; it does not write cricket data.
- Demo completion, failed finalisation, pending APK imports, rejected imports,
  and correction-pending APK states must not trigger the live celebration.
- Exact `alreadyApplied` retries must not replay unavailable progression
  snapshots or fabricate XP/level movement.

### Live celebration

The live celebration includes:

- Winner/result hero
- official Game Number
- official team scores and result text
- official Player of the Match
- Gully Records
- Personal Bests
- Level-up cards when authoritative before/after progression snapshots exist
- XP earned
- responsive mobile-friendly overlay
- custom celebration SVG assets

### Historical Match Celebration Replay

Historical replay is available from eligible official finalised scorecards via:

`VIEW MATCH CELEBRATION`

Rules:

- read-only
- uses the same `PostMatchCelebration` UI in historical mode
- baseline contains only official finalised matches before the target match
- same-day chronology uses official `matchNumber` / Game Number
- target match is excluded from its own baseline
- later matches never affect earlier historical celebration
- strict record improvement = broken
- equal record = not broken
- no earlier record = `firstRecord`
- Personal Best requires strict improvement
- first qualifying Personal Best is supported

### Historical XP and level safety

- Historical XP display uses only stored `xpBreakdown.awardedXP`.
- Missing XP is omitted and is never treated as zero.
- Historical before/after levels are not reconstructed when not provable.
- No fake historical level-up or XP progress bar should be shown.
- Live finalisation still supports authoritative before/after progression
  snapshots.
- Already-applied retry paths must not replay unavailable progression.

### Legacy-data safety

- Missing event-backed fours, sixes, strike-rate, economy, or related data is
  unknown, not zero.
- Event-backed historical comparisons run only when stored data supports them.
- Do not fabricate legacy metrics.

### Personal Best UI

- `matchXP` is intentionally not shown as a Personal Best card.
- Cricket Personal Best metrics remain: runs, wickets, catches, run-outs,
  stumpings, fours, and sixes.
- XP has its own Match XP section.
- Celebration metric text uses correct singular/plural labels such as
  `1 Run`, `2 Runs`, `1 Wicket`, `2 Wickets`, `1 Catch`, `2 Catches`.

### Verification

- Vercel Preview passed.
- Production deployment passed.
- Historical celebrations tested successfully on `https://www.gullylegends.eu`.
- Localhost historical replay was visually inspected.
- Desktop/mobile visual QA passed.

---

# 21. Finalisation architecture

Normal finalisation must continue using:

`public.finalize_match_atomic(finalisation_plan jsonb)`

Do not create a second finalisation path.

Review/Finalise should:
- validate required data
- show human-readable missing information
- show final score/result
- show selected POM
- confirm once
- call the existing atomic finalisation path

Finalisation updates:
- career statistics
- XP
- progression ledger
- Hall of Legends
- Monthly Beasts
- other existing derived systems
- live Post-Match Celebration summary only after successful official
  finalisation

---

## 22. Match result

Result is only official after finalisation.

Existing concepts:
- chase win → by wickets remaining
- defending win → by runs
- equal scores → tie

Do not change the existing winner/result calculations unless explicitly requested.

---

# 23. Dashboard Recent Matches

Dashboard Recent Matches should show the **latest finalised played match**, not simply the most recently updated/entered record.

Ordering:
1. `matchDate` descending
2. same-day `matchNumber` descending
3. `progressionAppliedAt` / `supabaseUpdatedAt` deterministic fallback
4. `id` fallback

Draft/live/no-result/deleted fixtures remain excluded.

Matches Archive reuses consistent finalised-match ordering.

Files involved:
- `lib/match-repository.ts`
- `lib/match-archive.ts`

This behavior is part of the current stable match display.

---

# 24. Next Battle

Existing priority logic historically included:
1. In Progress
2. Today
3. nearest future scheduled Draft
4. empty

The admin UX is structured around Setup / Quick Scoring / Review / Finalised. Do not casually break Next Battle selection behavior.

---

# 25. Matches archive

Includes:
- Today’s Fixtures
- Finalised archive
- Full read-only scorecards
- Search/filter
- pagination: 6 archive matches/page

Filters may include:
- player
- team
- venue
- date
- etc.

---

# 26. Hall of Legends

Categories:
- Runs
- Wickets
- Catches
- XP
- Level

Features:
- podium
- competition ranking
- ties supported

---

# 27. Monthly Beasts

Uses current-month XP from **finalised matches only**.

Categories:
- Batting Beast = monthly batting-category XP
- Bowling Beast = monthly bowling-category XP
- Fielding Beast = catch/run-out fielding XP

Features:
- joint winners
- Current Race
- official Crown
- Crown snapshot
- Admin crown confirmation
- Reopen month
- versioned active/revoked crown history
- active Crown blocks late finalisation until reopened

---

# 28. Gallery

Supabase-backed Gallery is implemented.

### Storage
- bucket: `gallery`
- public bucket
- max upload target: ~6 MB
- JPG / PNG / WebP

### Upload
- authenticated Admin browser upload
- `upsert:false`
- path:
  `gallery/YYYY/MM/<uuid>-<sanitised-file-name>.<ext>`
- image optimization target around 2048 px
- metadata in `public.gallery_photos`
- storage cleanup attempted if metadata insert fails
- real uploads: `is_demo=false`

### Public
- public read
- featured photos
- lightbox
- filters
- real Gallery photos must survive Demo Reset

---

# 29. Supabase tables

Core:
- `admin_users`
- `players`
- `matches`
- `player_career_stats`
- `match_stat_applications`
- `monthly_beast_crowns`
- `gallery_photos`
- `apk_match_imports`

Important:
- `matches.is_demo`
- `apk_match_imports.review_status`
- `apk_match_imports.raw_payload`
- `apk_match_imports.derived_payload`
- `monthly_beast_crowns.is_demo`
- `gallery_photos.is_demo`
- progression ledger is `match_stat_applications`
- RLS allows intended public reads and Admin-only writes

---

# 30. Admin authorization

- exactly one authorized Admin
- Supabase Auth user manually created
- authorization:
  - `public.admin_users`
  - `public.is_admin()`
- `public.is_admin()` is SECURITY DEFINER with controlled search path
- public visitors need no account
- no signup page
- never change the design to “all authenticated users are admins”

---

# 30A. APK Pending Review / Admin correction — PRODUCTION

APK Pending Review and Admin correction functionality is included in Production
`main`. Do not treat it as feature-branch-only work.

Implemented behavior:

- APK-submitted matches land in Pending Review.
- Admin can inspect raw APK payload data.
- Admin can edit the website-side working copy.
- Admin can reject an import.
- Admin can finalise a valid non-demo import through the website finalisation
  engine.
- Demo APK imports cannot create official matches.
- Finalised APK imports use the same authoritative website scoring, result,
  POM, XP, progression ledger, and archive systems as normal website matches.
- Raw APK payload data is preserved separately from the Admin working copy.
- Newer APK revisions can mark older working copies stale.

Security and architecture:

- APK imports are Admin-only.
- No public/anonymous access should exist for `apk_match_imports`.
- There is no normal public delete flow.
- Do not bypass the website finalisation engine.
- Do not expose admin credentials, sync tokens, or private implementation
  details in APK UI, website UI, public APIs, logs, or documentation.

---

# 31. Atomic Supabase operations currently installed

Installed/working RPCs include:

- `public.finalize_match_atomic(finalisation_plan jsonb)`
- `public.crown_monthly_beasts_atomic(crown_plan jsonb)`
- `public.reopen_monthly_beast_crown(month_key text)`
- `public.reset_demo_data_atomic(reset_plan jsonb)`
- `public.upsert_apk_match_import_atomic(jsonb, jsonb, jsonb, date, text)`
- `public.finalize_apk_import_atomic(uuid, jsonb)`

General design:
- SECURITY DEFINER
- admin checks
- restricted execution
- row locks/stale checks
- idempotency/progression ledger
- monthly crown protection
- advisory locking where required

Do not replace with unsafe multi-step browser writes.

### Not installed yet
`correct_player_of_match_atomic` from:

`supabase/migrations/20260807113000_player_of_match_correction.sql`

is prepared but not yet executed.

---

# 32. Demo data / real data

Historical sample/demo matches existed for demonstrations.

Protected Reset Demo Data is implemented.

The demo reset was executed before real tracking began.

### Preserve real data
Current real match data is now important and must not be deleted by demo cleanup.

Normal matches:
- `is_demo=false`

Demo helper:
- must force `is_demo=true`

### Preview warning
Preview and Production may use the same Supabase project.

Therefore use **DEMO TEST MATCH** for Preview/testing, not a normal real match.

After testing, Reset Demo Data may be used to remove demo activity while preserving real matches / gallery / players / admin.

---

# 33. Current player display metadata

Current notable display metadata:

- Stable ID `jogindar` displays as `Jogi`.
- Stable ID `naim` displays as `Naeem`.
- Gaurav card title is `Slow Poison`.
- Soman card title is `Apex Crusher` and uses `/player-cards/apex-crusher.png`.
- Dipayan card title is `Dipayan the Destroyer`.
- Dheeraj card title is `Surgical Chase Master`.

### Open metadata-source question

Earlier local/static metadata changes did not appear across Supabase-mode pages.

Before implementing these changes later, audit the actual authoritative source in Supabase mode (e.g. `public.players` / `profile_payload` vs `lib/data/players.ts`) so names/avatar/title update everywhere without creating duplicate players or splitting career data.

Stable player IDs must be preserved.

---

# 34. Current stable worktree state

Current branch:

`main`

Latest stable validation:

- lint: passed
- typecheck: passed
- tests: **493 passing**
- build: passed
- Vercel Preview: passed
- Production deployment: passed
- Production smoke test: passed on `https://www.gullylegends.eu`

Production HEAD:

`6e41645 Add historical match celebration replay`

### Current metadata update scope
This handoff metadata, `README.md`, and `AGENT_PROJECT_METADATA.json` describe the stable project state. Do not infer that unrelated untracked files are automatically approved for release unless the user says so.

### Prepared but not active
The post-finalisation POM correction migration remains a prepared database change until manually reviewed, applied, and tested in Supabase.

Do not blindly `git add .` when deferred/untracked files must stay out.

---

# 35. Git / deployment workflow

Safe future workflow:

```text
main
  ↓
feature branch
  ↓
Codex/code changes
  ↓
lint/typecheck/test/build
  ↓
commit + push branch
  ↓
Vercel Preview
  ↓
desktop + phone test
  ↓
merge to main
  ↓
push main
  ↓
Vercel Production
```

### Example
```powershell
git switch main
git pull origin main
git switch -c feature/example
```

After changes:
```powershell
git status
git add <explicit-files>
git commit -m "..."
git push -u origin feature/example
```

After Preview passes:
```powershell
git switch main
git pull origin main
git merge --ff-only feature/example
git push origin main
```

If merge conflicts occur, stop and inspect; do not randomly choose Accept Current/Incoming.

---

# 36. Validation commands

Before significant deploy:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
```

Do not deploy if critical validation fails.

---

# 37. Mobile status

Initial production site is usable on mobile but has had responsive issues.

Quick Scoring is specifically intended to improve live mobile scoring.

Important mobile UX:
- large scoring buttons
- prominent End of Over
- no cropped controls
- simple Run Out flow
- minimal live-entry form
- Review/Finalise after play

Always test Quick Scoring on a real phone through Vercel Preview before Production.

---

# 38. Current launch / release state

As of **20 August 2026**:

### Production
- Production site live and working
- Production branch: `main`
- Production HEAD: `6e41645 Add historical match celebration replay`
- custom domain working
- GitHub ↔ Vercel working
- Supabase working
- Porkbun DNS valid
- canonical site:
  `https://www.gullylegends.eu`
- Vercel Preview passed for the Post-Match Celebration release
- Production deployment passed
- smoke-tested successfully on `https://www.gullylegends.eu`
- historical celebrations tested successfully on Production

### Data
- demo data reset before real tracking
- real match tracking is active
- real data must be preserved
- Gallery preserved

### Current stable work
The current project state is stable on `main` and has passed:
- lint
- typecheck
- 493 tests
- build
- desktop/mobile visual QA for the celebration replay

Future changes should still use the normal branch / preview / validation flow unless the user explicitly chooses a direct `main` update.

### Prepared/deferred until later
- activation of post-finalisation POM correction RPC/migration
- shareable Match Result Card / export
- deeper focus-trap / keyboard-cycle accessibility polish
- historical level replay only if authoritative historical snapshots become available

### No longer wholly deferred
- Match Records Broken / Personal Best celebration support is implemented in
  the Post-Match Celebration system.

---

# 39. Guidance for future ChatGPT / Codex sessions

1. Treat this metadata as the current approved project state.
2. Do not redesign working systems unless explicitly requested.
3. Preserve Supabase RLS/admin protections.
4. Preserve atomic RPC architecture.
5. Preserve existing XP formulas unless explicitly changed.
6. Preserve progression ledger consistency.
7. Avoid silent local-data fallback in Supabase mode.
8. Never expose secrets.
9. Never commit `.env.local`.
10. Use `npm.cmd` / `npx.cmd` on this Windows environment.
11. Use the exact Next.js restart/PID sequence documented above.
12. Canonical Production URL is `https://www.gullylegends.eu`.
13. Real matches must not be marked demo.
14. Preview/Production may share Supabase; test with Demo Test Match.
15. Active Quick Scoring has **no LBW**.
16. Run Out uses **one fielder only**.
17. Striker and non-striker must always be different.
18. Selected roster players are automatically Played; no Played checkbox.
19. Did Bat is separate and remains false until a player enters the innings.
20. POM recommendation uses **pre-POM XP**; +15 is applied only to final selected POM.
21. Post-finalisation POM correction is not active until its migration/RPC is installed and tested.
22. APK Pending Review / Admin correction is included in Production `main`; do not describe it as feature-branch-only.
23. Post-Match Celebration and Historical Match Celebration Replay are included in Production `main`.
24. Historical celebration replay is read-only and must not fabricate missing XP, levels, or event-backed stats.
25. Deferred player name/avatar changes require a source-of-truth audit in Supabase mode before implementation.

---

# 40. Suggested first message in a new conversation

Upload this file and say:

> I am continuing my Gully Legends Prague cricket website project. Please read the attached `GULLY_LEGENDS_PROJECT_HANDOFF_METADATA.md` completely before suggesting or changing anything. The live website is https://www.gullylegends.eu. The project is stable on `main`; the metadata file explains what is implemented, what remains prepared/deferred, and the rules future agents must preserve. I now want to work on: [describe the change].
