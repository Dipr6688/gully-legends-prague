create table if not exists public.site_settings (
  id text primary key,
  current_venue_id text not null default 'open-field',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_settings_global_singleton
    check (id = 'global'),
  constraint site_settings_current_venue_id_check
    check (current_venue_id in ('open-field', 'indoor-dome'))
);

insert into public.site_settings (id, current_venue_id)
values ('global', 'open-field')
on conflict (id) do nothing;

drop trigger if exists set_site_settings_updated_at on public.site_settings;
create trigger set_site_settings_updated_at
before update on public.site_settings
for each row execute function public.set_updated_at();

alter table public.site_settings enable row level security;

drop policy if exists "Public can read site settings" on public.site_settings;
create policy "Public can read site settings"
on public.site_settings
for select
to anon, authenticated
using (id = 'global');

drop policy if exists "Admins can insert site settings" on public.site_settings;
create policy "Admins can insert site settings"
on public.site_settings
for insert
to authenticated
with check (public.is_admin() and id = 'global');

drop policy if exists "Admins can update site settings" on public.site_settings;
create policy "Admins can update site settings"
on public.site_settings
for update
to authenticated
using (public.is_admin() and id = 'global')
with check (public.is_admin() and id = 'global');

grant select on public.site_settings to anon, authenticated;
grant insert, update on public.site_settings to authenticated;
revoke delete, truncate on public.site_settings from anon, authenticated;

alter table public.matches
add column if not exists venue_id text;

update public.matches
set venue_id = 'open-field'
where venue_id is null;

alter table public.matches
alter column venue_id set default 'open-field';

alter table public.matches
alter column venue_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.matches'::regclass
      and conname = 'matches_venue_id_check'
  ) then
    alter table public.matches
    add constraint matches_venue_id_check
    check (venue_id in ('open-field', 'indoor-dome'));
  end if;
end;
$$;

create index if not exists matches_venue_id_idx
on public.matches (venue_id);

create or replace function public.sync_match_venue_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.payload->>'venueId' in ('open-field', 'indoor-dome') then
    new.venue_id := new.payload->>'venueId';
  else
    new.venue_id := coalesce(new.venue_id, 'open-field');
  end if;

  return new;
end;
$$;

drop trigger if exists sync_matches_venue_id on public.matches;
create trigger sync_matches_venue_id
before insert or update of payload, venue_id on public.matches
for each row execute function public.sync_match_venue_id();
