# Gully Legends Prague - Project Handoff / Metadata

Purpose: upload this file at the start of a new ChatGPT/Codex conversation so the assistant can understand the project without needing the full old chat history.

Last updated: 2026-08-27

Current overall status: stable on website `main`. Production website is live at `https://www.gullylegends.eu`. APK v1.3.0 has its own GitHub repository, is tagged, production-signed, and includes server-backed Balance Teams.

Privacy rule: Automatic Balance Teams uses private server-side information. Do not expose player BAT/BOWL/FIELD ratings, hidden weights, private pair/separation rules, candidate scores, or balancing internals in APK assets, public API responses, UI text, README, public docs, screenshots, logs, labels, or accessibility text.

## 1. Repositories and Current State

Website repo:

```text
C:\cricket_website\gully-legends-prague
https://github.com/Dipr6688/gully-legends-prague.git
```

Website branch:

```text
main
```

Website production HEAD:

```text
651d5d1 Add server-backed Balance Teams
```

Website `origin/main` currently points at the same commit.

APK repo:

```text
C:\cricket_website\apk-integration\GullyLegendsArena-source
https://github.com/Dipr6688/gully-legends-arena-apk.git
```

APK branch:

```text
main
```

APK production/release HEAD:

```text
dd75200 Release Gully Legends Arena v1.3.0
```

APK tags present:

```text
v1.3.0
v1.2.0
```

## 2. Production URLs

Canonical public domain:

```text
https://www.gullylegends.eu
```

Apex/root domain redirects to the www domain. Vercel deploys Production from website `main`.

If Vercel deployment state cannot be inspected from tooling, state `main pushed / Production previously user-verified` instead of inventing fresh deployment evidence.

## 3. Website Overview

The website is a private/community cricket platform for Gully Legends Prague.

Stack:

- Next.js App Router
- TypeScript
- Tailwind CSS plus custom CSS
- Supabase Auth
- Supabase Postgres with RLS
- Supabase Storage public `gallery` bucket

Implemented public/admin features:

- Dashboard
- Players and player profiles
- Trophy Cabinet achievements
- Matches, scorecards, archive, and scheduled fixtures
- Quick Scoring
- APK Pending Review and Admin correction
- Server-backed Balance Teams
- Hall of Legends
- Monthly Beasts
- Formula Room
- Gallery
- Gully Face-Off
- Post-Match Celebration
- Historical Match Celebration Replay
- Share Match Card export/share
- Demo Test Match and Reset Demo Data

## 4. APK v1.3.0 Release Facts

APK release:

```text
Gully Legends Arena v1.3.0
```

Android configuration:

```text
applicationId: com.gullylegends.arena
versionCode: 6
versionName: 1.3.0
minSdk: 24
targetSdk: 34
```

Release APK:

```text
C:\cricket_website\apk-integration\GullyLegendsArena-source\app\build\outputs\apk\release\app-release.apk
```

Verified release APK size:

```text
1,036,529 bytes
```

Signing:

- release APK verifies successfully
- APK Signature Scheme v2: true
- number of signers: 1
- signer SHA-256: `2fb53fff5b42b31f63716f8d9da78f87058bcca96f6b9ee678e6f9503431d2e2`
- signer matches previous v1.2.0 production APK

Upgrade compatibility:

- same `applicationId`
- same production signer
- versionCode `6 > 5`
- Android should install v1.3.0 over v1.2.0 without uninstall

Do not expose keystore password, key password, alias, private key, or secret environment variables.

## 5. APK v1.3.0 Balance Teams

v1.3.0 adds Balance Teams.

Architecture:

```text
APK setup selection
-> authenticated website endpoint
-> server-side Balance Teams engine
-> Team A / Team B result
-> APK applies result locally
```

Production endpoint:

```text
POST /api/app-sync/team-balance
```

APK request contains setup information only:

```text
playerIds
sharedPlayerId
```

Server response contains only:

```text
teamAPlayerIds
teamBPlayerIds
sharedPlayerId
```

User-facing behavior:

- requires internet and Admin login
- manual setup remains available
- Use Previous Teams remains available
- balanced result remains manually editable
- Balance Again can request another optimal/equivalent split
- odd attendance supports manually selected Shared Player
- even attendance uses equal exclusive teams
- offline/network failure does not clear setup
- Fielding Helper semantics remain intact after balancing

High-level engine behavior only:

- considers batting strength
- considers bowling strength
- considers fielding strength
- protects distribution of stronger batting/bowling resources
- produces equal exclusive-team sizes
- chooses only among best/equivalent candidates for Balance Again
- does not deliberately worsen teams just for variety

Do not document individual ratings, hidden weights, private hard constraints, or candidate scores.

Balance-quality acceptance verified:

- 10-player selection -> 5/5
- 12-player selection -> 6/6
- odd attendance + Shared -> equal exclusive teams + Shared
- no selected player lost
- no selected player duplicated
- unknown/duplicate IDs rejected
- even attendance + Shared rejected
- odd attendance without Shared handled safely
- Balance Again varies only among optimal/equivalent candidates
- website Create Match continues using the same server-side engine
- APK contains no private balance configuration

## 6. v1.2 Features Retained in APK v1.3.0

v1.3.0 includes all previous v1.2 match setup/scoring work:

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

## 7. APK Sync Authority Model

APK is a recorder/setup client, not official authority.

```text
APK offline/local match
-> sync
-> website authentication
-> server re-derives
-> validates
-> apk_match_imports
-> Pending Review
-> STOP

Admin
-> review
-> correct if needed
-> confirm/select POM
-> finalise
-> official match/stats/XP/Game Number
```

APK never directly applies:

- official career stats
- XP
- Game Number
- official POM
- progression
- Hall of Legends
- Monthly Beasts
- Archive effects

## 8. APK Login and Network Contract

APK uses AndroidX WebViewAssetLoader and serves local assets from:

```text
https://www.gullylegends.eu/__arena_assets__/index.html
```

Real APIs remain network-backed:

```text
POST /api/app-sync/login
POST /api/app-sync/refresh
GET  /api/app-sync/roster
POST /api/app-sync/team-balance
POST /api/app-sync/match
```

Login request:

```json
{
  "adminId": "...",
  "password": "..."
}
```

Website resolves the configured Admin email server-side and verifies Admin authorization. Password is not persisted. Logout clears tokens.

Remaining security improvement: encrypted native token storage is still future work; current tokens live in WebView/localStorage.

## 9. APK POM Recommendation

Current APK sync includes:

```text
pomRecommendationPlayerId
```

Semantics:

- recommendation only
- unique highest pre-POM XP -> recommendation
- exact tie -> no recommendation
- website Admin remains authoritative
- final selected website POM alone receives official POM XP

Do not describe APK POM as official.

## 10. Explicit Match Date

Current APK sync includes:

```text
matchDate: YYYY-MM-DD
```

Website behavior:

- current APK payloads use explicit `matchDate`
- legacy payloads without it fall back safely to `startedAt` in Europe/Prague
- website still owns official Game Number allocation

## 11. Run Out Current Contract

Run Out includes:

- `dismissedPlayerId`
- `completedRuns`
- `fielderId`
- `newBatterId`
- `nextStrikerId`
- `nextNonStrikerId` in two-batter mode

Bowler receives no wicket for Run Out.

Undo/replay must restore score, batter runs, wicket, fielder credit, striker/non-striker, and batter state. Finished-match editor supports the same semantic correction.

## 12. End-of-Over Undo

If the sixth legal delivery completes an over and next bowler is selected but the next over has not started:

- Undo clears the empty next-bowler selection
- removes the actual previous sixth delivery
- reopens the previous over at `x.5`
- replays dependent score/batter/bowler/wicket state

If next-over Ball 1 already exists, Undo removes only the actual latest delivery. Final scheduled over can also be reopened safely.

## 13. Use Previous Teams

New Match can reuse the most recent suitable completed real local match setup.

Carries:

- Team A/B assignment
- Shared Player
- valid Fielding Helpers
- overs
- batting mode

Does not clone:

- `offlineMatchId`
- `syncVersion`
- timestamps
- score/events
- result
- POM
- toss/openers
- old Match Date

New match receives a new identity and current/default Match Date. Reused teams remain editable.

## 14. APK Pending Review / Working Copy

Supabase table:

```text
public.apk_match_imports
```

Statuses:

```text
pending_review
correction_pending
finalised
rejected
```

Rejected imports remain in DB for audit and disappear from normal Pending Review UI.

Raw APK source payload is preserved separately from Admin review working copy.

Working-copy fields include:

- `review_version`
- `review_is_stale`
- review payload
- review derived payload
- review validation result

If a newer APK sync arrives while Admin is editing:

- raw APK source can update
- Admin copy remains
- review becomes stale
- editing/finalisation is blocked
- Admin must reload/reset/rebase
- no silent merge occurs

## 15. Demo / Finalisation Safety

APK has Demo Test Match.

Demo:

- may test sync/review
- must never affect official stats, XP, Game Number, Hall of Legends, Monthly Beasts, or Archive as an official match

Website Pending Review finalisation safety:

- real imports require explicit `FINALISE OFFICIAL MATCH` confirmation
- Demo imports show `DEMO MATCH - CANNOT BE FINALISED AS OFFICIAL`
- existing server-side/RPC Demo guards remain authoritative

## 16. Accidental Test Match Incident

Internal note only: during acceptance testing, one accidental non-demo test match was finalised. It was identified precisely, rolled back with a guarded targeted rollback, match/application effects were removed, player career stats were rebuilt from remaining legitimate official matches, four legitimate 22-Aug matches remained intact, and no August Monthly Beast crown cleanup was required.

Do not place reusable destructive SQL in public README.

## 17. Post-Match Celebration

Production website includes Post-Match Celebration and Historical Match Celebration Replay.

Core architecture:

- `lib/post-match-celebration.ts`
- `PostMatchCelebrationSummary`
- summary is created only after successful official finalisation
- existing finalisation, XP, result, POM, and progression engines remain authoritative
- no second XP engine
- no database migration required for celebration UI

Live celebration includes winner/result hero, official Game Number/scores/result, official POM, Gully Records, Personal Bests, level-ups when authoritative before/after progression exists, XP earned, responsive UI, and premium custom assets.

Historical replay is read-only from official scorecards. Baselines contain only prior official finalised matches, target match is excluded, same-day chronology uses official Game Number, later matches never affect earlier replay, equal records are not broken, and missing legacy event-backed data is unknown rather than fabricated.

## 18. Gully Face-Off

Gully Face-Off is implemented on website `main` at `/face-off`.

Rules:

- compares two different players
- same-player comparison is prevented
- URL state works
- no artificial overall winner
- reliable full-career metrics use official history
- event-backed metrics compare tracked subsets only
- missing legacy ball-by-ball data is not fabricated
- no private Team Balance inputs are used

## 19. Current Validation

Website current validation on 2026-08-27:

```text
npm.cmd run test -> 619/619 passing
```

Recent Balance Teams release validation also included:

```text
npm.cmd run lint -> passed
npm.cmd run typecheck -> passed
npm.cmd run build -> passed
```

APK v1.3.0 release validation:

```text
node tools\match-setup-parity-test.js -> passed
node tools\phase2-contract-smoke-test.js -> passed
Gradle 8.7 with JDK 17.0.20.1 -> verified
.\gradlew.bat test -> passed
.\gradlew.bat lintDebug -> passed
.\gradlew.bat assembleDebug -> passed
.\gradlew.bat assembleRelease -> passed
apksigner verify -> passed
```

## 20. Supabase and Migrations

Installed/working RPCs include:

- `public.finalize_match_atomic(finalisation_plan jsonb)`
- `public.crown_monthly_beasts_atomic(crown_plan jsonb)`
- `public.reopen_monthly_beast_crown(month_key text)`
- `public.reset_demo_data_atomic(reset_plan jsonb)`
- `public.upsert_apk_match_import_atomic(jsonb, jsonb, jsonb, date, text)`
- `public.finalize_apk_import_atomic(uuid, jsonb)`

Do not blindly run deferred migrations or use blanket `supabase db push` while manually applied migration history remains unreconciled.

Prepared but not active:

```text
supabase/migrations/20260807113000_player_of_match_correction.sql
```

## 21. Important Do-Not-Forget Rules

- Supabase/website Admin finalisation is authoritative.
- APK upload is not finalisation.
- Preserve raw APK payload.
- No direct official XP/stat writes from APK.
- Never expose/copy private Balance Teams configuration into APK.
- Never rename stable player IDs casually.
- Jogi stable ID = `jogindar`.
- Naeem stable ID = `naim`.
- Same bowler cannot bowl consecutive overs.
- No active LBW.
- Demo never affects official progression.
- Do not blindly run deferred migrations.
- Do not use blanket Supabase migration pushes while manual migration history is unreconciled.
- Do not use `git add .` when unrelated files exist.
- Signing secrets stay outside Git.
- Uninstalling APK can delete local WebView data.
- Do not touch `docs/user-manual/screenshots/03-team-assignment.zip` unless explicitly instructed.

## 22. Remaining Open Items

Verify from code before implementing, but currently plausible open items include:

- encrypted native token storage
- direct Admin striker/non-striker correction if still absent
- empty-innings add-first-event correction if still absent
- APK polling/status feedback if still absent
- post-finalisation POM correction RPC activation after manual migration review/application

Completed items that should not be listed as deferred:

- APK Match Date
- APK POM recommendation
- Use Previous Teams
- Run Out parity
- Balance Teams
- APK finalisation confirmation
- Match Records Broken / Personal Best celebration support
- Share Match Card export/share
- Gully Face-Off

## 23. Local Development Notes

Use `npm.cmd` / `npx.cmd` on Windows PowerShell.

Website dev server:

```powershell
npm.cmd run dev -- --port 3001
```

Before major website commits:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
```

Use feature branch -> validation -> explicit-file commit -> push -> Preview -> test -> fast-forward merge to main -> push main.

Never use `git add .` while unrelated/untracked files exist.

## 24. Suggested First Message for a New Agent

Upload this file and say:

> I am continuing my Gully Legends Prague website and Gully Legends Arena APK project. Please read the attached handoff completely before suggesting or changing anything. The website is live at https://www.gullylegends.eu. Website main is at 651d5d1. APK main is tagged v1.3.0 at dd75200. Preserve the authority model and never expose private Balance Teams configuration. I now want to work on: [describe the change].
