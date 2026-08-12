-- Gully Legends Prague player display-name update.
-- Manual review/execution only: updates existing public.players display_name
-- for two stable player IDs. Does not touch stats, matches, XP, ledger rows,
-- card metadata, auth, or storage.

begin;

do $$
declare
  expected_ids text[] := array[
    'jogindar',
    'naim'
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
    raise exception 'Player display-name update aborted. Missing player IDs: %', missing_ids;
  end if;
end $$;

update public.players as player_row
set display_name = approved.display_name
from (
  values
    ('jogindar', 'Jogi'),
    ('naim', 'Naeem')
) as approved(id, display_name)
where player_row.id = approved.id;

commit;
