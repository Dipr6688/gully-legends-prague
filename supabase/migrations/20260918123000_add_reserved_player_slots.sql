-- Gully Legends Prague permanent reserved player slots.
-- Manual review/execution only: this script inserts/updates public.players
-- metadata for ACE, BLAZE and MAVERICK plus required zero career rows.
-- It does not touch matches, XP ledger rows, monthly crowns, APK imports,
-- stories, auth, storage, or historical scorecards.

begin;

with approved_players as (
  select *
  from (
    values
      (
        'player-slot-1',
        'player-slot-1',
        'ACE',
        'THE WILDCARD',
        'UTILITY ALL-ROUNDER',
        '/player-cards/ace.png',
        array['utility']::text[],
        array['all-rounder']::text[],
        jsonb_build_object(
          'battingProfile',
          'Keeps things adaptable at the crease, looking to play the role the innings requires.',
          'bowlingProfile',
          'A flexible bowling option whose real strengths will emerge with match experience.',
          'fieldingProfile',
          'Ready to contribute wherever needed and stay involved in the game.',
          'heroSummary',
          'A wildcard entrant with a clean slate, ready to contribute wherever the game needs him.',
          'specialMoveName',
          'PLAY THE MOMENT',
          'specialMoveDescription',
          'Reads the situation and adapts to whatever role the match demands.',
          'funTrait',
          'Clean-slate versatility with a play-the-moment mindset.',
          'avatar',
          '/player-cards/ace.png'
        ),
        'green',
        '#9cff24',
        true
      ),
      (
        'player-slot-2',
        'player-slot-2',
        'BLAZE',
        'THE SPARK',
        'UTILITY ALL-ROUNDER',
        '/player-cards/blaze.png',
        array['utility']::text[],
        array['all-rounder']::text[],
        jsonb_build_object(
          'battingProfile',
          'Positive and uncomplicated, with the freedom to develop a natural batting identity.',
          'bowlingProfile',
          'Starts with a clean slate and the opportunity to build a bowling style through match experience.',
          'fieldingProfile',
          'Energetic around the field and ready to make an impact wherever required.',
          'heroSummary',
          'A fresh spark in the squad, bringing energy and intent from the moment the game begins.',
          'specialMoveName',
          'IGNITE THE GAME',
          'specialMoveDescription',
          'Looks for the moment when a burst of energy can change the tempo of the contest.',
          'funTrait',
          'Fresh energy, clean-slate intent and tempo-changing enthusiasm.',
          'avatar',
          '/player-cards/blaze.png'
        ),
        'orange',
        '#ff7a18',
        true
      ),
      (
        'player-slot-3',
        'player-slot-3',
        'MAVERICK',
        'THE CHALLENGER',
        'UTILITY ALL-ROUNDER',
        '/player-cards/maverick.png',
        array['utility']::text[],
        array['all-rounder']::text[],
        jsonb_build_object(
          'battingProfile',
          'Plays with freedom while gradually building a clear role at the crease.',
          'bowlingProfile',
          'A flexible option whose bowling identity will be shaped by real match performances.',
          'fieldingProfile',
          'Competitive and involved, looking to influence the game from anywhere on the field.',
          'heroSummary',
          'An unpredictable challenger with a clean slate and the freedom to build his own Gully Legends identity.',
          'specialMoveName',
          'BREAK THE PATTERN',
          'specialMoveDescription',
          'Looks for an unexpected way to tilt the contest when the game becomes predictable.',
          'funTrait',
          'Unpredictable challenge energy with a clean-slate Gully identity.',
          'avatar',
          '/player-cards/maverick.png'
        ),
        'violet',
        '#b24cff',
        true
      )
  ) as player_rows(
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
)
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
select
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
from approved_players
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
values
  ('player-slot-1'),
  ('player-slot-2'),
  ('player-slot-3')
on conflict (player_id) do nothing;

commit;
