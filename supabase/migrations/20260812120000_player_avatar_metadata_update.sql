-- Gully Legends Prague player avatar/title metadata update.
-- Manual review/execution only: this script updates existing public.players
-- metadata and does not touch matches, career stats, XP ledger rows, auth, or storage.

begin;

do $$
declare
  expected_ids text[] := array[
    'aninda',
    'arunabha',
    'atripan',
    'biplab',
    'dipanjan',
    'gaurav',
    'madhab',
    'rohit',
    'soman',
    'utpal',
    'jogindar',
    'badhan',
    'debraj',
    'dipayan',
    'dheeraj',
    'saurav',
    'naim',
    'chaitanya',
    'amrit',
    'suprateem'
  ];
  missing_ids text[];
begin
  select coalesce(array_agg(expected_id order by expected_id), array[]::text[])
  into missing_ids
  from unnest(expected_ids) as expected_id
  left join public.players as player_row
    on player_row.id = expected_id
  where player_row.id is null;

  if array_length(missing_ids, 1) is not null then
    raise exception 'Player metadata update aborted. Missing player IDs: %', missing_ids;
  end if;
end $$;

update public.players as player_row
set
  card_title = approved.card_title,
  card_image = approved.card_image,
  profile_payload = jsonb_set(
    coalesce(player_row.profile_payload, '{}'::jsonb),
    '{avatar}',
    to_jsonb(approved.card_image),
    true
  )
from (
  values
    ('aninda', 'Rulebook Rambo', '/player-cards/rulebook-rambo.png'),
    ('arunabha', 'Turbo Technician', '/player-cards/turbo-technician.png'),
    ('atripan', 'Smiling Sniper', '/player-cards/smiling-sniper.png'),
    ('biplab', 'Nerve Ninja', '/player-cards/nerve-ninja.png'),
    ('dipanjan', 'Cutter Commander', '/player-cards/cutter-commander.png'),
    ('gaurav', 'Slow Poison', '/player-cards/slow-poison.png'),
    ('madhab', 'Sweep Samurai', '/player-cards/sweep-samurai.png'),
    ('rohit', 'Skidball Sheriff', '/player-cards/skidball-sheriff.png'),
    ('soman', 'Apex Crusher', '/player-cards/apex-crusher.png'),
    ('utpal', 'Tempo Tactician', '/player-cards/tempo-tactician.png'),
    ('jogindar', 'Loopy Loyalist', '/player-cards/loopy-loyalist.png'),
    ('badhan', 'Quiet Quake', '/player-cards/quiet-quake.png'),
    ('debraj', 'Steady Sentinel', '/player-cards/steady-sentinel.png'),
    ('dipayan', 'Dipayan the Destroyer', '/player-cards/dipayan-the-destroyer.png'),
    ('dheeraj', 'Surgical Chase Master', '/player-cards/surgical-chase-master.png'),
    ('saurav', 'Zen Sixsmith', '/player-cards/zen-sixsmith.png'),
    ('naim', 'Calm Cannon', '/player-cards/calm-cannon.png'),
    ('chaitanya', 'Steady Storm', '/player-cards/steady-storm.png'),
    ('amrit', 'Looper Legend', '/player-cards/looper-legend.png'),
    ('suprateem', 'Style Striker', '/player-cards/style-striker.png')
) as approved(id, card_title, card_image)
where player_row.id = approved.id;

commit;
