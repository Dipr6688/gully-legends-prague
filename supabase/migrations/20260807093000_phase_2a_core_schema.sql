create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.players (
  id text primary key,
  slug text not null unique,
  display_name text not null,
  card_title text not null,
  role text not null,
  card_image text not null,
  play_styles text[] not null default '{}',
  tags text[] not null default '{}',
  profile_payload jsonb not null default '{}'::jsonb,
  accent text,
  accent_color text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint players_profile_payload_is_object
    check (jsonb_typeof(profile_payload) = 'object')
);

drop trigger if exists set_players_updated_at on public.players;
create trigger set_players_updated_at
before update on public.players
for each row execute function public.set_updated_at();

create table if not exists public.matches (
  id text primary key,
  match_date date not null,
  start_time time,
  match_sequence integer,
  name text not null,
  venue text not null default 'CZU Gully Arena',
  status text not null,
  is_demo boolean not null default false,
  payload jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalised_at timestamptz,
  stats_applied_at timestamptz,
  deleted_at timestamptz,
  constraint matches_status_check
    check (status in ('draft', 'in_progress', 'finalised', 'abandoned', 'cancelled')),
  constraint matches_match_sequence_positive
    check (match_sequence is null or match_sequence > 0),
  constraint matches_payload_is_object
    check (jsonb_typeof(payload) = 'object')
);

create index if not exists matches_match_date_idx
  on public.matches (match_date desc);

create index if not exists matches_status_idx
  on public.matches (status);

create index if not exists matches_demo_idx
  on public.matches (is_demo);

create index if not exists matches_deleted_at_idx
  on public.matches (deleted_at);

create index if not exists matches_fixture_order_idx
  on public.matches (match_date, match_sequence, start_time, id)
  where deleted_at is null;

drop trigger if exists set_matches_updated_at on public.matches;
create trigger set_matches_updated_at
before update on public.matches
for each row execute function public.set_updated_at();

create table if not exists public.player_career_stats (
  player_id text primary key references public.players(id) on delete cascade,
  matches integer not null default 0,
  innings_batted integer not null default 0,
  runs integer not null default 0,
  fifties integer not null default 0,
  centuries integer not null default 0,
  dismissed_ducks integer not null default 0,
  wickets integer not null default 0,
  catches integer not null default 0,
  run_outs integer not null default 0,
  stumpings integer not null default 0,
  hat_tricks integer not null default 0,
  three_wicket_hauls integer not null default 0,
  matches_bowled integer not null default 0,
  completed_overs integer not null default 0,
  total_runs_conceded integer not null default 0,
  total_xp integer not null default 0,
  level integer not null default 0,
  stats_payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint player_career_stats_non_negative
    check (
      matches >= 0 and
      innings_batted >= 0 and
      runs >= 0 and
      fifties >= 0 and
      centuries >= 0 and
      dismissed_ducks >= 0 and
      wickets >= 0 and
      catches >= 0 and
      run_outs >= 0 and
      stumpings >= 0 and
      hat_tricks >= 0 and
      three_wicket_hauls >= 0 and
      matches_bowled >= 0 and
      completed_overs >= 0 and
      total_runs_conceded >= 0 and
      total_xp >= 0 and
      level >= 0
    ),
  constraint player_career_stats_payload_is_object
    check (jsonb_typeof(stats_payload) = 'object')
);

drop trigger if exists set_player_career_stats_updated_at on public.player_career_stats;
create trigger set_player_career_stats_updated_at
before update on public.player_career_stats
for each row execute function public.set_updated_at();

create table if not exists public.match_stat_applications (
  match_id text not null references public.matches(id) on delete cascade,
  player_id text not null references public.players(id) on delete cascade,
  idempotency_key text not null unique,
  xp_breakdown jsonb not null,
  applied_at timestamptz not null default now(),
  finalisation_version integer not null default 1,
  primary key (match_id, player_id),
  constraint match_stat_applications_version_positive
    check (finalisation_version > 0),
  constraint match_stat_applications_xp_breakdown_is_object
    check (jsonb_typeof(xp_breakdown) = 'object')
);

create index if not exists match_stat_applications_player_idx
  on public.match_stat_applications (player_id);

create table if not exists public.monthly_beast_crowns (
  id text primary key,
  month_key text not null,
  version integer not null,
  status text not null,
  batting jsonb not null,
  bowling jsonb not null,
  fielding jsonb not null,
  is_demo boolean not null default false,
  crowned_at timestamptz not null,
  crowned_by text,
  revoked_at timestamptz,
  revoked_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_beast_crowns_month_key_format
    check (month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  constraint monthly_beast_crowns_version_positive
    check (version > 0),
  constraint monthly_beast_crowns_status_check
    check (status in ('active', 'revoked')),
  constraint monthly_beast_crowns_unique_month_version
    unique (month_key, version),
  constraint monthly_beast_crowns_batting_is_object
    check (jsonb_typeof(batting) = 'object'),
  constraint monthly_beast_crowns_bowling_is_object
    check (jsonb_typeof(bowling) = 'object'),
  constraint monthly_beast_crowns_fielding_is_object
    check (jsonb_typeof(fielding) = 'object')
);

create unique index if not exists monthly_beast_crowns_one_active_per_month_idx
  on public.monthly_beast_crowns (month_key)
  where status = 'active';

create index if not exists monthly_beast_crowns_month_history_idx
  on public.monthly_beast_crowns (month_key, version desc);

create index if not exists monthly_beast_crowns_status_demo_idx
  on public.monthly_beast_crowns (status, is_demo);

drop trigger if exists set_monthly_beast_crowns_updated_at on public.monthly_beast_crowns;
create trigger set_monthly_beast_crowns_updated_at
before update on public.monthly_beast_crowns
for each row execute function public.set_updated_at();

create table if not exists public.gallery_photos (
  id text primary key,
  storage_path text,
  title text,
  caption text,
  category text not null,
  taken_on date,
  related_match_id text references public.matches(id) on delete set null,
  album_title text,
  mime_type text not null,
  file_size bigint,
  width integer,
  height integer,
  original_file_name text,
  is_featured boolean not null default false,
  is_demo boolean not null default false,
  sort_order bigint,
  image_payload jsonb not null default '{}'::jsonb,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint gallery_photos_category_check
    check (category in ('match-day', 'celebration', 'group', 'off-field', 'other')),
  constraint gallery_photos_dimensions_non_negative
    check (
      (file_size is null or file_size >= 0) and
      (width is null or width >= 0) and
      (height is null or height >= 0)
    ),
  constraint gallery_photos_image_payload_is_object
    check (jsonb_typeof(image_payload) = 'object')
);

create index if not exists gallery_photos_uploaded_at_idx
  on public.gallery_photos (uploaded_at desc);

create index if not exists gallery_photos_category_idx
  on public.gallery_photos (category);

create index if not exists gallery_photos_demo_idx
  on public.gallery_photos (is_demo);

create index if not exists gallery_photos_related_match_idx
  on public.gallery_photos (related_match_id);

create unique index if not exists gallery_photos_one_featured_visible_idx
  on public.gallery_photos (is_featured)
  where is_featured = true and deleted_at is null;

drop trigger if exists set_gallery_photos_updated_at on public.gallery_photos;
create trigger set_gallery_photos_updated_at
before update on public.gallery_photos
for each row execute function public.set_updated_at();

alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.player_career_stats enable row level security;
alter table public.match_stat_applications enable row level security;
alter table public.monthly_beast_crowns enable row level security;
alter table public.gallery_photos enable row level security;

grant select on public.players to anon, authenticated;
grant select on public.matches to anon, authenticated;
grant select on public.player_career_stats to anon, authenticated;
grant select on public.monthly_beast_crowns to anon, authenticated;
grant select on public.gallery_photos to anon, authenticated;

grant select, insert, update, delete on public.match_stat_applications to authenticated;
grant insert, update, delete on public.players to authenticated;
grant insert, update, delete on public.matches to authenticated;
grant insert, update, delete on public.player_career_stats to authenticated;
grant insert, update, delete on public.monthly_beast_crowns to authenticated;
grant insert, update, delete on public.gallery_photos to authenticated;

drop policy if exists "Public can read active players" on public.players;
create policy "Public can read active players"
on public.players
for select
to anon, authenticated
using (is_active = true);

drop policy if exists "Admins can read all players" on public.players;
create policy "Admins can read all players"
on public.players
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can insert players" on public.players;
create policy "Admins can insert players"
on public.players
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update players" on public.players;
create policy "Admins can update players"
on public.players
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete players" on public.players;
create policy "Admins can delete players"
on public.players
for delete
to authenticated
using (public.is_admin());

drop policy if exists "Public can read visible matches" on public.matches;
create policy "Public can read visible matches"
on public.matches
for select
to anon, authenticated
using (
  deleted_at is null and
  (
    status in ('finalised', 'in_progress') or
    (
      status = 'draft' and
      match_date >= current_date and
      btrim(name) <> '' and
      btrim(venue) <> ''
    )
  )
);

drop policy if exists "Admins can read all matches" on public.matches;
create policy "Admins can read all matches"
on public.matches
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can insert matches" on public.matches;
create policy "Admins can insert matches"
on public.matches
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update matches" on public.matches;
create policy "Admins can update matches"
on public.matches
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete matches" on public.matches;
create policy "Admins can delete matches"
on public.matches
for delete
to authenticated
using (public.is_admin());

drop policy if exists "Public can read career stats" on public.player_career_stats;
create policy "Public can read career stats"
on public.player_career_stats
for select
to anon, authenticated
using (true);

drop policy if exists "Admins can insert career stats" on public.player_career_stats;
create policy "Admins can insert career stats"
on public.player_career_stats
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update career stats" on public.player_career_stats;
create policy "Admins can update career stats"
on public.player_career_stats
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete career stats" on public.player_career_stats;
create policy "Admins can delete career stats"
on public.player_career_stats
for delete
to authenticated
using (public.is_admin());

drop policy if exists "Admins can read match stat applications" on public.match_stat_applications;
create policy "Admins can read match stat applications"
on public.match_stat_applications
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can insert match stat applications" on public.match_stat_applications;
create policy "Admins can insert match stat applications"
on public.match_stat_applications
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update match stat applications" on public.match_stat_applications;
create policy "Admins can update match stat applications"
on public.match_stat_applications
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete match stat applications" on public.match_stat_applications;
create policy "Admins can delete match stat applications"
on public.match_stat_applications
for delete
to authenticated
using (public.is_admin());

drop policy if exists "Public can read active monthly crowns" on public.monthly_beast_crowns;
create policy "Public can read active monthly crowns"
on public.monthly_beast_crowns
for select
to anon, authenticated
using (status = 'active');

drop policy if exists "Admins can read all monthly crowns" on public.monthly_beast_crowns;
create policy "Admins can read all monthly crowns"
on public.monthly_beast_crowns
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can insert monthly crowns" on public.monthly_beast_crowns;
create policy "Admins can insert monthly crowns"
on public.monthly_beast_crowns
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update monthly crowns" on public.monthly_beast_crowns;
create policy "Admins can update monthly crowns"
on public.monthly_beast_crowns
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete monthly crowns" on public.monthly_beast_crowns;
create policy "Admins can delete monthly crowns"
on public.monthly_beast_crowns
for delete
to authenticated
using (public.is_admin());

drop policy if exists "Public can read visible gallery photos" on public.gallery_photos;
create policy "Public can read visible gallery photos"
on public.gallery_photos
for select
to anon, authenticated
using (deleted_at is null);

drop policy if exists "Admins can insert gallery photos" on public.gallery_photos;
create policy "Admins can insert gallery photos"
on public.gallery_photos
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update gallery photos" on public.gallery_photos;
create policy "Admins can update gallery photos"
on public.gallery_photos
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete gallery photos" on public.gallery_photos;
create policy "Admins can delete gallery photos"
on public.gallery_photos
for delete
to authenticated
using (public.is_admin());
