-- Gully Legends Prague permanent player metadata insert.
-- Manual review/execution only: this script inserts/updates public.players
-- metadata for Dileep plus the required zero career row. It does not touch
-- matches, XP ledger rows, monthly crowns, APK imports, stories, auth, or storage.

begin;

insert into public.players (
  id,
  slug,
  display_name,
  card_title,
  role,
  card_image,
  play_styles,
  tags,
  profile_payload,
  accent,
  accent_color,
  is_active
)
values (
  'dileep',
  'dileep',
  'Dileep',
  'SEAM MAESTRO',
  'SEAM ALL-ROUNDER',
  '/player-cards/seam-maestro.png',
  array['pace', 'utility']::text[],
  array['all-rounder', 'pace', 'fielding']::text[],
  jsonb_build_object(
    'battingProfile',
    'Keeps the batting uncomplicated and looks to support the innings rather than force the game.',
    'bowlingProfile',
    'A reliable seam bowler who attacks with control, consistency and wicket-taking intent.',
    'fieldingProfile',
    'Alert and dependable in the field, with safe hands and a competitive attitude.',
    'heroSummary',
    'A cheerful seam-bowling all-rounder who keeps things simple with the bat, stays dependable in the field, and does his best work with the ball.',
    'specialMoveName',
    'QUIET PRESSURE',
    'specialMoveDescription',
    'Keeps coming at the batter with calm, disciplined bowling until a mistake appears.',
    'funTrait',
    'Simple batting support, disciplined seam bowling and dependable fielding.',
    'avatar',
    '/player-cards/seam-maestro.png'
  ),
  'green',
  '#9cff24',
  true
)
on conflict (id) do update
set
  slug = excluded.slug,
  display_name = excluded.display_name,
  card_title = excluded.card_title,
  role = excluded.role,
  card_image = excluded.card_image,
  play_styles = excluded.play_styles,
  tags = excluded.tags,
  profile_payload = excluded.profile_payload,
  accent = excluded.accent,
  accent_color = excluded.accent_color,
  is_active = excluded.is_active;

insert into public.player_career_stats (player_id)
values ('dileep')
on conflict (player_id) do nothing;

commit;
