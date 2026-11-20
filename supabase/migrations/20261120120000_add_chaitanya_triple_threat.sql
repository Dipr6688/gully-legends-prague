-- Gully Legends Prague permanent player metadata insert.
-- Manual review/execution only: this script inserts/updates the new Chaitanya
-- profile and creates a zero career row. It deliberately does not transfer any
-- MAVERICK match, progression, crown, story, achievement, or scorecard data.

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
  'chaitanya-2',
  'chaitanya-2',
  'Chaitanya',
  'TRIPLE THREAT',
  'COMPLETE ALL-ROUNDER',
  '/player-cards/triple-threat.png',
  array['batting', 'utility']::text[],
  array['all-rounder', 'batting', 'fielding']::text[],
  jsonb_build_object(
    'battingProfile',
    'A capable batter who can contribute meaningfully and adapt to the needs of the innings.',
    'bowlingProfile',
    'A dependable bowling option who gives the team another genuine way to create pressure and wickets.',
    'fieldingProfile',
    'An involved and reliable fielder who can influence the game away from bat and ball as well.',
    'heroSummary',
    'A complete cricketer who can influence the game with the bat, the ball and in the field.',
    'specialMoveName',
    'THREE-WAY IMPACT',
    'specialMoveDescription',
    'Can change the direction of a match through batting, bowling or a decisive piece of fielding.',
    'funTrait',
    'Batting, bowling and fielding impact in one complete package.',
    'avatar',
    '/player-cards/triple-threat.png'
  ),
  'yellow',
  '#ffd21c',
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
values ('chaitanya-2')
on conflict (player_id) do nothing;

commit;
