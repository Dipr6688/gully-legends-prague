# Gully Legends Prague — Codex Master Project Brief

> **Purpose of this file:** Give this entire file to Codex as the single source of truth for designing, building, testing, and deploying the Gully Legends Prague cricket website.
>
> **Project status:** New production rebuild. A visual prototype exists, but the production site must be implemented as a real responsive web application. Do not build invisible clickable areas over one large dashboard image.

---

# 1. Master instruction for Codex

Act as a senior full-stack engineer, product designer, database designer, and QA engineer.

Build a production-quality web application called **Gully Legends Prague** for a casual cricket group of approximately 18 people who play at **ČZU Gully Arena — Open Field, Prague**.

The site must have a humorous European/Prague gully-cricket gaming aesthetic. It must support several administrators, shared match data, player profiles, automatically calculated statistics, monthly leaderboards, funny titles, and gaming-style avatars.

Work in small, reviewable phases. Before making large changes, explain the plan briefly. After every phase:

1. Run linting, type checking, and tests.
2. Confirm the app builds successfully.
3. Summarize changed files.
4. Update the README when setup or behavior changes.
5. Never commit secrets.

## Non-negotiable implementation rules

- Use **real HTML/React components** for navigation, buttons, forms, cards, tables, modals, and admin controls.
- Do **not** use a screenshot as the entire website with transparent clickable overlays.
- The site must be responsive on desktop and mobile.
- All players start at **Level 0**, with batting, bowling, and fielding bars at **0/100**.
- Only **finalised matches** may update career statistics, ratings, XP, levels, and leaderboards.
- A match must support **Draft → Submitted for Review → Finalised** workflow.
- The fixed venue is **ČZU Gully Arena**, subtitle **Open Field, Prague**.
- The system will not record balls faced, balls bowled, or overs.
- Multiple approved administrators must work on the same shared database.
- Public visitors can view data without signing in.
- Editing requires authentication and role-based authorisation.
- Keep formulas and award rules in configuration files so they can be changed later.
- All destructive actions require confirmation.
- Editing a finalised match must recalculate derived statistics safely without double counting.
- Maintain an audit trail for important admin changes.

---

# 2. Product vision

Gully Legends Prague should feel like a humorous cricket video-game dashboard rather than a conventional sports statistics website.

The atmosphere should combine:

- Prague and Central European outdoor surroundings
- University/open-field cricket
- Arcade-style player cards
- Comic-book effects
- Neon gaming UI elements
- Humorous titles and achievement badges
- Friendly competition, not professional seriousness

The core message is:

> **Gully Legends — No Rules. Only Fun!**

Suggested supporting lines:

- “We don’t count balls, we count memories.”
- “It’s not cricket. It’s our gully. Our Prague.”
- “Play hard, but laugh harder.”
- “No pavilion. No boundaries. Only cricket.”

Avoid an Indian-street visual setting. The background and illustrations should clearly feel European/Prague-based, with elements such as:

- Prague-style rooftops or skyline silhouettes
- Central European university buildings
- Green open field
- Park benches, bicycles, tram-inspired details, European lamp posts
- Cool morning atmosphere
- Funny cricket graffiti

Do not use copyrighted club logos or unauthorised photographs.

---

# 3. Recommended technology

Use the following stack unless there is a strong technical reason to change it:

- **Frontend/framework:** Next.js with TypeScript and App Router
- **Styling:** Tailwind CSS
- **UI components:** Reusable custom components; a lightweight accessible component library may be used where appropriate
- **Animations:** Framer Motion and CSS animations
- **Database:** Supabase PostgreSQL
- **Authentication:** Supabase Auth
- **Image storage:** Supabase Storage or the Next.js `public` directory for static placeholders
- **Hosting:** Vercel
- **Source control:** GitHub
- **Validation:** Zod
- **Testing:** Vitest or Jest for unit tests; Playwright for important end-to-end flows
- **Date handling:** date-fns

Use current stable versions that are compatible with each other.

---

# 4. User roles and permissions

## 4.1 Public viewer

No login required.

Can:

- View dashboard
- View all player profiles
- View match archive and scorecards
- View career statistics
- View monthly awards
- View all-time leaderboard
- Search and filter public data

Cannot:

- Create or edit matches
- Add or edit players
- Manage funny titles
- Manage administrators
- Delete anything

## 4.2 Score Admin

Must log in.

Can:

- Create a new match
- Select players for Team A and Team B
- Enter team totals
- Enter individual performance data
- Save a draft
- Edit drafts they are authorised to edit
- Submit a match for review
- View audit details relevant to match entry

Cannot:

- Finalise matches unless explicitly granted that permission
- Add or remove administrators
- Delete finalised matches
- Manage system configuration

## 4.3 Main Admin

Must log in.

Can:

- Do everything a Score Admin can do
- Finalise submitted matches
- Reopen or correct finalised matches
- Add, edit, activate, or deactivate players
- Assign or remove Score Admin and Main Admin roles
- Add or remove funny titles
- Manage monthly award overrides
- Export backups
- View the full audit log

There should normally be only one or two Main Admins.

---

# 5. Main navigation

Desktop navigation should include:

1. Dashboard
2. Players
3. Matches
4. Leaderboard
5. Monthly Beasts
6. Stats
7. Gallery
8. Admin / Login

Mobile navigation should use a bottom bar, drawer, or compact menu.

Every navigation item must be a real route or real interactive control. No placeholder click regions.

Suggested routes:

```text
/
/players
/players/[playerId]
/matches
/matches/new
/matches/[matchId]
/matches/[matchId]/edit
/leaderboard
/monthly-beasts
/stats
/gallery
/login
/admin
/admin/players
/admin/users
/admin/audit
```

---

# 6. Dashboard requirements

The dashboard should follow the visual style of a fun gaming dashboard.

## Required dashboard sections

### Header

- Gully Legends logo/title
- Tagline: “No Rules. Only Fun!”
- Main navigation
- Login/Admin indicator

### Prague hero section

- European/Prague outdoor cricket background
- Fixed venue: **ČZU Gully Arena**
- Subtitle: **Open Field, Prague**
- Create Match button for authorised administrators
- Total matches
- Total active players
- Next match, if scheduled

### Gully Rules card

Use editable humorous rules such as:

- No Ball? We don’t care!
- Out or Not Out? Umpire’s mood!
- Over? When light is gone!
- Fight? Next ball, best friends!

These are visual jokes, not actual scoring logic.

### Monthly Beasts preview

Show:

- Batting Beast
- Bowling Beast
- Catching Beast
- All-Round Beast, when implemented

Before the first finalised match, show “Not decided yet”.

### Player card grid

Show active players with:

- Gaming avatar
- Level
- Display name
- Nickname
- Main role
- Batting bar
- Bowling bar
- Fielding bar
- Selected titles or badges

### Recent matches

Display the most recent finalised matches.

### All-time top performers

- Most runs
- Most wickets
- Most catches

Before any data exists, show zero/empty state.

---

# 7. Player profile requirements

Each player profile must include:

- Avatar
- Display name
- Nickname
- Short humorous biography
- Batting description
- Bowling description
- Fielding description
- Personality description
- Funny habits
- Multiple titles or badges
- Level and total XP
- Batting, bowling, and fielding bars
- Career totals
- Monthly totals
- Match-by-match history
- Recent form
- Best individual batting score
- Best bowling result by wickets; use fewer runs conceded as tie-breaker

## Career statistics

### Batting

- Matches selected
- Innings batted
- Total runs
- Highest score
- Average runs per innings
- Number of not-outs, when `was_out` is recorded
- Batting average where meaningful

### Bowling

- Matches bowled
- Total runs conceded
- Total wickets
- Wickets per match bowled
- Runs conceded per wicket when wickets > 0
- Best bowling by wickets, then lowest runs conceded

Do not display bowling economy because overs/balls are not recorded.

### Fielding

- Total catches
- Catches per match
- Run-outs if added later

---

# 8. Initial players

Seed the database with the following four unique players. Atripan was previously listed twice; include him only once.

All four start with:

```text
level = 0
xp = 0
batting_rating = 0
bowling_rating = 0
fielding_rating = 0
career_runs = 0
career_wickets = 0
career_catches = 0
```

## 8.1 Aninda

```yaml
display_name: Aninda
nickname: Rulebook Rambo
primary_role: All-Rounder
batting_description: Aggressive; sometimes sensitive and controlled, sometimes wild.
bowling_description: Medium pace.
fielding_description: Fast runner; accuracy varies; mostly good hands.
funny_habits: Loves giving advice, sledging, and becoming extremely competitive.
personality: Funny, friendly, always active, and always ready to go.
appearance: Approximately 5 ft 3 in; healthy fit body; smiley face; slightly darker skin tone.
inside_joke: Always argues about rules.
short_bio: Aggressive spark, competitive sledge commander, and full-time rules debater.
quote: Why play quietly when you can advise, sledge, and appeal at the same time?
titles:
  - Advice Overlord
  - Sledge Commander
  - Rules Advocate
  - Chaos Sprinter
```

## 8.2 Arunabha

```yaml
display_name: Arunabha
nickname: Turbo Technician
primary_role: All-Rounder
batting_description: Technical; sometimes aggressive; prefers running and controlling the middle part of the game.
bowling_description: Very fast bowler.
fielding_description: Fast runner with good hands.
funny_habits: Highly competitive, serious during the game, and gives everything on the field.
personality: Funny, friendly, loves making jokes, and enjoys alcohol socially.
appearance: Approximately 5 ft 6 in; very slim but fit; medium skin tone.
inside_joke: Loves using slang words and is highly competitive.
short_bio: Technical controller with express pace and an all-or-nothing match engine.
quote: Runs hard, bowls faster, and treats every friendly match like a final.
titles:
  - Pace Demon
  - Midgame Maestro
  - Full-Throttle
  - Slang Slinger
```

## 8.3 Atripan

```yaml
display_name: Atripan
nickname: The Smiling Sniper
primary_role: All-Rounder
batting_description: Defensive, but suddenly attempts wild big shots and sometimes outperforms everyone.
bowling_description: Slow spin.
fielding_description: Safe hands but a slow runner.
funny_habits: Smiles from the back when a joke happens, makes witty comments, and keeps the mood light.
personality: Friendly, calm, and easy-going.
appearance: Approximately 5 ft 4 in; healthy body; glasses; short hair; smiley face; medium skin tone.
inside_joke: Makes jokes from the back.
short_bio: Calm defensive wall who suddenly launches a surprise attack and jokes from the back.
quote: Quiet at first. Then comes the joke, the big shot, and the smug smile.
titles:
  - Quiet Storm
  - Safe Hands
  - Surprise Sixer
  - Backline Comedian
```

## 8.4 Biplab

```yaml
display_name: Biplab
nickname: Nerve Ninja
primary_role: All-Rounder
batting_description: Defensive but occasionally attempts wild big shots; technically sound.
bowling_description: Slow spin and behaves like a mystery spinner.
fielding_description: Slow runner with mostly good hands.
funny_habits: Competitive; jokingly tries to get on Aninda’s nerves; likes making the game funny.
personality: Calm, friendly, and genuinely nice.
appearance: Approximately 5 ft 7 in; slightly bulky build; glasses; slightly darker skin tone.
inside_joke: Loves getting on Aninda’s nerves and uses funny slang.
short_bio: Technical defender, mystery spinner, and certified specialist in disturbing Aninda’s peace.
quote: The ball may turn slowly, but the banter arrives instantly.
titles:
  - Spin Illusionist
  - Technical Wall
  - Aninda’s Nemesis
  - Slang Spinner
```

Avatar images may initially be stylised placeholders. Later, real photos may be used only with each player’s consent.

---

# 9. Match creation and scoring

## 9.1 Match information

The match form should collect:

- Match date
- Match name or series name
- Team A name
- Team B name
- Players selected for Team A
- Players selected for Team B
- Optional captain for each team
- Team A total
- Team B total
- Winner or tie
- Optional Player of the Match
- Optional notes

The venue is not editable in normal match entry. It is automatically:

```text
ČZU Gully Arena
Open Field, Prague
```

## 9.2 Individual player performance

For every selected player, collect:

- Did bat: yes/no
- Runs scored
- Was out: yes/no/unknown
- Did bowl: yes/no
- Runs conceded
- Wickets taken
- Catches taken
- Run-outs, optional future field

Do not require:

- Balls faced
- Balls bowled
- Overs
- Fours
- Sixes
- Strike rate
- Economy rate

## 9.3 Validation rules

- A player cannot be selected for both teams.
- Only active players can be selected.
- Runs, runs conceded, wickets, catches, and team totals cannot be negative.
- A finalised match must have at least one player on each team.
- Team totals and individual runs do not need to match exactly because extras may exist.
- Warn, but do not necessarily block, when the difference appears unrealistic.
- A match cannot be finalised without a result or explicit tie/no-result value.
- Saving a draft may allow incomplete data.
- Finalising requires complete validation.

---

# 10. Match workflow

Use these statuses:

```text
draft
submitted
finalised
reopened
cancelled
```

Workflow:

1. Score Admin creates a draft.
2. Score Admin enters teams and scores.
3. Score Admin submits for review.
4. Main Admin reviews.
5. Main Admin finalises.
6. Finalisation triggers statistics recalculation.
7. If a correction is required, Main Admin reopens the match.
8. After correction, the match is finalised again.
9. Recalculation must be idempotent and must not double-count prior values.

Recommended implementation: derive aggregate statistics from finalised `match_player_performances` instead of permanently incrementing totals. Use database views or server-side aggregate queries. If cached aggregate tables are used, rebuild them transactionally.

---

# 11. Level and rating system

## 11.1 Level system

All players start at Level 0.

Use an XP system that is easy to understand and configurable.

Suggested initial XP formula per finalised match:

```text
Participation XP = 5 if selected in the match
Batting XP = runs scored × 1
Bowling XP = wickets × 25
Fielding XP = catches × 10
Run-out XP = run-outs × 12
Player of the Match bonus = 20
Winning team bonus = 5
```

Suggested level formula:

```text
level = floor(total_xp / 100)
```

Cap the displayed level at 99 unless the configuration changes.

Keep XP weights in a configuration module or database settings table.

## 11.2 Batting, bowling, and fielding ratings

All ratings start at 0/100 and are recalculated after finalised matches.

The ratings should compare active players while avoiding unfairly rewarding only high match counts.

Suggested initial rating logic:

### Batting rating

```text
50% = percentile rank of total runs
30% = percentile rank of runs per batting innings
20% = percentile rank of highest score
```

### Bowling rating

```text
50% = percentile rank of total wickets
30% = percentile rank of wickets per bowling match
20% = inverse percentile of runs conceded per wicket
```

For players with zero wickets, the runs-conceded-per-wicket component is zero.

### Fielding rating

```text
70% = percentile rank of total catches
30% = percentile rank of catches per match
```

Rules:

- If no finalised matches exist, every rating is zero.
- Clamp ratings to 0–100.
- Round to a whole number for display.
- Keep formulas in a dedicated calculation module with unit tests.
- Provide a short “How ratings work” explanation on the Stats page.

---

# 12. Leaderboards and Monthly Beasts

## 12.1 Monthly awards

Calculate from finalised matches within each calendar month.

Required awards:

- **Batting Beast:** Most runs
- **Bowling Beast:** Most wickets; tie-breaker = fewer runs conceded
- **Catching Beast:** Most catches
- **All-Round Beast:** Highest configurable combined points

Suggested all-round monthly points:

```text
runs + wickets × 25 + catches × 10 + run-outs × 12
```

Before a month has a finalised match, show “Not decided yet”.

## 12.2 All-time leaderboard

Show:

- Most runs
- Highest individual score
- Most wickets
- Best bowling result
- Most catches
- Most matches
- Highest XP
- Highest level

Support filtering by month, year, and all-time where relevant.

---

# 13. Funny titles and badges

Support multiple titles for every player.

Title types:

```text
personality
performance
monthly_award
match_award
manual_funny
```

Requirements:

- Main Admin can add, edit, activate, or deactivate titles.
- Titles may be permanent or temporary.
- Performance titles can be generated automatically.
- Teasing titles must be hideable.
- Avoid abusive or discriminatory content.

Examples:

- Run Machine
- Wicket Hunter
- Catching Beast
- Safe Hands
- The Wall
- Golden Arm
- Partnership Breaker
- Duck Collector
- Boundary Donor
- Butter Fingers
- Unbeaten on Zero
- Sunday Morning Specialist

---

# 14. Gallery

The Gallery page can be implemented after the core match and statistics system.

Future features:

- Group photos
- Match photos
- Monthly award posters
- Funny generated graphics
- Shareable result cards

Only authorised administrators should upload images.

---

# 15. Database design

Use Supabase PostgreSQL.

Use UUID primary keys and timestamps with time zone.

## 15.1 Suggested SQL schema

Codex should create versioned migrations under `supabase/migrations/`.

```sql
create type public.user_role as enum ('viewer', 'score_admin', 'main_admin');
create type public.match_status as enum ('draft', 'submitted', 'finalised', 'reopened', 'cancelled');
create type public.title_type as enum ('personality', 'performance', 'monthly_award', 'match_award', 'manual_funny');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role public.user_role not null default 'viewer',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  display_name text not null unique,
  nickname text,
  primary_role text not null default 'All-Rounder',
  batting_description text,
  bowling_description text,
  fielding_description text,
  funny_habits text,
  personality text,
  appearance text,
  inside_joke text,
  short_bio text,
  quote text,
  avatar_url text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.player_titles (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  title text not null,
  title_type public.title_type not null default 'personality',
  is_active boolean not null default true,
  awarded_on date,
  expires_on date,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  match_date date not null,
  match_name text not null,
  venue_name text not null default 'ČZU Gully Arena',
  venue_subtitle text not null default 'Open Field, Prague',
  team_a_name text not null,
  team_b_name text not null,
  team_a_total integer,
  team_b_total integer,
  result_type text,
  winner_team text,
  player_of_match_id uuid references public.players(id),
  notes text,
  status public.match_status not null default 'draft',
  created_by uuid not null references public.profiles(id),
  submitted_by uuid references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  finalised_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matches_totals_nonnegative check (
    (team_a_total is null or team_a_total >= 0)
    and (team_b_total is null or team_b_total >= 0)
  )
);

create table public.match_player_performances (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id),
  team_code text not null check (team_code in ('A', 'B')),
  did_bat boolean not null default true,
  runs_scored integer not null default 0 check (runs_scored >= 0),
  was_out boolean,
  did_bowl boolean not null default false,
  runs_conceded integer not null default 0 check (runs_conceded >= 0),
  wickets integer not null default 0 check (wickets >= 0),
  catches integer not null default 0 check (catches >= 0),
  run_outs integer not null default 0 check (run_outs >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(match_id, player_id)
);

create table public.monthly_awards (
  id uuid primary key default gen_random_uuid(),
  award_month date not null,
  category text not null,
  player_id uuid not null references public.players(id),
  stat_value numeric,
  is_manual_override boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(award_month, category)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  entity_type text not null,
  entity_id text,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
```

## 15.2 Recommended views or server queries

Create database views or secure server-side queries for:

- Player career totals from finalised matches
- Player monthly totals
- Batting leaderboard
- Bowling leaderboard
- Fielding leaderboard
- Monthly award candidates
- XP totals
- Level calculations

Avoid trusting client-side calculations for authoritative statistics.

---

# 16. Supabase Row Level Security

Enable RLS on every public table.

Policy intent:

## Public read

Anonymous and authenticated users may read:

- Active players
- Active player titles
- Finalised matches
- Performances belonging to finalised matches
- Published monthly awards
- Public settings

## Score Admin write

Authenticated active users with role `score_admin` or `main_admin` may:

- Insert matches
- Update draft or submitted matches according to workflow
- Insert or update match-player performances before finalisation

## Main Admin write

Only active `main_admin` users may:

- Finalise or reopen matches
- Add/edit/deactivate players
- Manage titles
- Manage user roles
- Override monthly awards
- Read full audit logs

Never expose the Supabase service-role key to the browser.

Use server-side code for privileged operations.

---

# 17. Authentication flow

Use invitation-only admin access.

Recommended flow:

1. Public users browse without login.
2. Main Admin invites a user by email.
3. User receives an authentication email.
4. User creates a password or uses a magic link.
5. A profile row is created and assigned a role.
6. Middleware protects admin routes.
7. UI actions are hidden or disabled when the user lacks permission.
8. Server-side checks enforce permissions regardless of UI state.

Do not allow unrestricted public signup unless explicitly enabled later.

---

# 18. Recommended project structure

```text
gully-legends-prague/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── globals.css
│   ├── players/
│   │   ├── page.tsx
│   │   └── [playerId]/page.tsx
│   ├── matches/
│   │   ├── page.tsx
│   │   ├── new/page.tsx
│   │   └── [matchId]/
│   │       ├── page.tsx
│   │       └── edit/page.tsx
│   ├── leaderboard/page.tsx
│   ├── monthly-beasts/page.tsx
│   ├── stats/page.tsx
│   ├── gallery/page.tsx
│   ├── login/page.tsx
│   ├── admin/
│   │   ├── page.tsx
│   │   ├── players/page.tsx
│   │   ├── users/page.tsx
│   │   └── audit/page.tsx
│   └── api/
├── components/
│   ├── navigation/
│   ├── dashboard/
│   ├── players/
│   ├── matches/
│   ├── leaderboard/
│   ├── admin/
│   └── ui/
├── lib/
│   ├── supabase/
│   ├── auth/
│   ├── calculations/
│   ├── validation/
│   └── constants/
├── public/
│   ├── avatars/
│   ├── backgrounds/
│   └── icons/
├── supabase/
│   ├── migrations/
│   └── seed.sql
├── tests/
├── middleware.ts
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── CODEX_PROJECT_BRIEF.md
```

---

# 19. Environment variables

Create `.env.example` containing names only:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Rules:

- Never commit `.env.local`.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to client components.
- Configure secrets separately in Vercel.

---

# 20. GitHub setup instructions

The user already has a GitHub account.

## 20.1 Create the repository

Create a new private repository:

```text
Repository name: gully-legends-prague
Description: Shared cricket statistics website for ČZU Gully Arena
Visibility: Private
README: Yes
.gitignore: Node
License: None
```

## 20.2 Local project creation

One possible setup:

```bash
git clone <REPOSITORY_URL>
cd gully-legends-prague
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*"
npm install @supabase/ssr @supabase/supabase-js zod date-fns framer-motion
```

Install test tools as development dependencies:

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom playwright
```

Commit after the initial scaffold:

```bash
git add .
git commit -m "Initialize Gully Legends Prague application"
git push origin main
```

If Codex is operating directly in the repository, it may perform these tasks itself.

---

# 21. Supabase setup instructions

1. Create a Supabase account.
2. Create a project named `gully-legends-prague`.
3. Choose an EU region close to Prague when available.
4. Store the generated database password securely.
5. Open the SQL editor or use Supabase CLI migrations.
6. Apply the schema migrations.
7. Enable RLS.
8. Apply the policies.
9. Add the four seed players and titles.
10. Configure invitation-only authentication.
11. Copy the project URL and publishable key into local environment variables.
12. Keep the service-role key private and server-side only.

Recommended local `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=<project-url>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
SUPABASE_SERVICE_ROLE_KEY=<server-only-service-role-key>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

---

# 22. Vercel deployment instructions

1. Create a Vercel account using GitHub login.
2. Select **Add New → Project**.
3. Import `gully-legends-prague`.
4. Confirm framework = Next.js.
5. Add environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SITE_URL
```

6. Deploy.
7. Set `NEXT_PUBLIC_SITE_URL` to the Vercel production URL.
8. Redeploy after changing environment variables.
9. Add the Vercel production URL to Supabase Auth redirect URLs.
10. Share the final `vercel.app` link in WhatsApp.

The initial setup should fit within free plans for a small non-commercial group, subject to each provider’s current plan limits.

---

# 23. Development phases

## Phase 1 — Foundation

Deliverables:

- Next.js application scaffold
- Tailwind theme
- Responsive navigation
- Prague gaming dashboard layout
- Four seeded player cards at Level 0
- Empty states for matches and leaderboards
- Supabase client setup
- README and environment template

Acceptance criteria:

- App runs locally
- No console errors
- Mobile and desktop layouts work
- No screenshot overlay navigation
- Every visible navigation item works

## Phase 2 — Database and public pages

Deliverables:

- Database migrations
- Seed data
- Player list and profile pages
- Match archive
- Match details
- Public leaderboards
- Monthly Beast empty and populated states

Acceptance criteria:

- Public data is fetched from Supabase
- Finalised match filtering works
- Statistics are server-calculated

## Phase 3 — Authentication and roles

Deliverables:

- Login
- Invitation-only admin flow
- Role-aware UI
- Protected routes
- RLS policies
- Admin dashboard

Acceptance criteria:

- Public visitors cannot edit data
- Score Admin cannot manage roles
- Main Admin can manage authorised users
- Server rejects unauthorised operations

## Phase 4 — Match workflow

Deliverables:

- Create match
- Team selection
- Individual score entry
- Save draft
- Submit for review
- Finalise
- Reopen and correct
- Audit logging

Acceptance criteria:

- Same player cannot be in both teams
- Only finalised matches affect stats
- Re-finalising does not double-count
- Editing workflow is reliable

## Phase 5 — Ratings, XP, and awards

Deliverables:

- XP calculation
- Level calculation
- Batting/bowling/fielding ratings
- Monthly awards
- All-time leaderboard
- Formula explanation page
- Unit tests for calculations

Acceptance criteria:

- All start at zero
- Ratings update after finalisation
- Tie-breakers are deterministic
- Tests cover zero-data and edge cases

## Phase 6 — Visual polish and sharing

Deliverables:

- Gaming animations
- Funny badges
- Enhanced Prague background
- Player profile modal or page transitions
- Shareable result image/card
- Gallery foundation
- Accessibility and performance review

---

# 24. Testing requirements

At minimum, test:

- Rating calculations with no matches
- XP and level calculation
- Monthly date filtering
- Bowling tie-breaker
- Player cannot be on two teams
- Draft does not affect stats
- Finalised match affects stats exactly once
- Reopened match is excluded until re-finalised
- Public user cannot edit
- Score Admin cannot manage roles
- Main Admin can finalise
- Mobile navigation
- Form validation

Recommended commands:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npx playwright test
```

Add scripts to `package.json` if they do not exist.

---

# 25. Accessibility and usability

- Use semantic headings and landmarks.
- Ensure keyboard navigation works.
- Use visible focus styles.
- Do not communicate status using colour alone.
- Add labels to form fields.
- Add accessible text to icons.
- Ensure sufficient colour contrast.
- Make match entry comfortable on mobile.
- Use large tap targets.
- Confirm destructive actions.
- Show clear loading, empty, success, and error states.

---

# 26. Backup and maintenance

Implement:

- Admin export of players, matches, performances, and titles as JSON or CSV
- Import only after strong validation and Main Admin confirmation
- Audit log for create/update/finalise/reopen/delete actions
- Soft deactivation of players instead of destructive deletion where possible
- Database migrations committed to GitHub
- README instructions for local development and deployment

The website source is stored in GitHub. Shared cricket data is stored in Supabase. Deployments through Vercel must not erase the Supabase data.

---

# 27. Important design correction from the prototype

A previous prototype visually matched a generated dashboard picture by using a full-screen background image and transparent clickable coordinates. That approach created alignment problems at different browser sizes.

The production rebuild must:

- Recreate the visual composition with CSS and React components.
- Use the Prague image only as a decorative background layer.
- Place real cards, navigation, buttons, and text over it using responsive layout.
- Avoid hard-coded pixel hotspot maps.
- Avoid absolute positioning for major page structure unless necessary for decorative elements.

---

# 28. Definition of done for the first usable release

The release is usable when:

- A WhatsApp-shareable public URL exists.
- Public visitors can view the site without login.
- Four initial players are visible at Level 0.
- A Main Admin can invite multiple Score Admins.
- A Score Admin can create and submit a match.
- A Main Admin can finalise it.
- Finalisation updates player statistics and leaderboards.
- A corrected finalised match recalculates correctly.
- Monthly Beasts are calculated.
- The site works on mobile and desktop.
- The Prague gaming design is retained.
- No credentials are committed to GitHub.

---

# 29. Codex execution prompt

Use the following as the immediate starting instruction after this file is placed in the repository:

> Read `GULLY_LEGENDS_CODEX_MASTER_BRIEF.md` completely. Inspect the repository. Then propose a phased implementation plan for Phase 1 only. Do not implement yet. Identify any existing prototype assets that can be reused safely, but do not use a full-page screenshot with invisible click hotspots. After I approve the Phase 1 plan, implement it, run lint/typecheck/tests/build, and summarize every changed file.

After Phase 1 is complete, use:

> Continue with Phase 2 from `GULLY_LEGENDS_CODEX_MASTER_BRIEF.md`. Preserve the existing visual design and do not weaken authentication, RLS, or validation requirements. Implement migrations and seed data in version-controlled files. Run all required checks before finishing.

---

# 30. Information still to be supplied later

The project owner will later provide:

- Remaining approximately 14 player profiles
- Optional player photographs or approved avatar references
- Initial administrator email addresses
- Final decision on automatic funny titles
- Optional team naming conventions
- Optional actual next-match scheduling
- Any changes to rating or XP formulas after real matches are entered

The application must make it easy to add these later without redesigning the database.

---

# 31. Final instruction to Codex

Prioritise data integrity, responsive layout, and maintainability over visual shortcuts. Recreate the humorous Prague gaming dashboard faithfully, but build it as a genuine web application with shared data, secure roles, and testable calculations.
