create table if not exists public.match_stories (
  match_id text primary key references public.matches(id) on delete cascade,
  title text not null,
  story_text text not null,
  story_version integer not null default 1,
  story_style text not null,
  story_signature text not null,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint match_stories_title_not_blank
    check (btrim(title) <> ''),
  constraint match_stories_story_text_not_blank
    check (btrim(story_text) <> ''),
  constraint match_stories_story_version_positive
    check (story_version > 0),
  constraint match_stories_story_style_not_blank
    check (btrim(story_style) <> ''),
  constraint match_stories_story_signature_not_blank
    check (btrim(story_signature) <> '')
);

create unique index if not exists match_stories_story_signature_idx
  on public.match_stories (story_signature);

create index if not exists match_stories_generated_at_idx
  on public.match_stories (generated_at desc);

drop trigger if exists set_match_stories_updated_at on public.match_stories;
create trigger set_match_stories_updated_at
before update on public.match_stories
for each row execute function public.set_updated_at();

alter table public.match_stories enable row level security;

grant select on public.match_stories to anon, authenticated;
grant insert, update, delete on public.match_stories to authenticated;

drop policy if exists "Public can read official match stories" on public.match_stories;
create policy "Public can read official match stories"
on public.match_stories
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.matches
    where matches.id = match_stories.match_id
      and matches.deleted_at is null
      and matches.status = 'finalised'
      and matches.is_demo = false
  )
);

drop policy if exists "Admins can insert match stories" on public.match_stories;
create policy "Admins can insert match stories"
on public.match_stories
for insert
to authenticated
with check (
  public.is_admin() and
  exists (
    select 1
    from public.matches
    where matches.id = match_stories.match_id
      and matches.deleted_at is null
      and matches.status = 'finalised'
      and matches.is_demo = false
  )
);

drop policy if exists "Admins can update match stories" on public.match_stories;
create policy "Admins can update match stories"
on public.match_stories
for update
to authenticated
using (public.is_admin())
with check (
  public.is_admin() and
  exists (
    select 1
    from public.matches
    where matches.id = match_stories.match_id
      and matches.deleted_at is null
      and matches.status = 'finalised'
      and matches.is_demo = false
  )
);

drop policy if exists "Admins can delete match stories" on public.match_stories;
create policy "Admins can delete match stories"
on public.match_stories
for delete
to authenticated
using (public.is_admin());
