create or replace function public.crown_monthly_beasts_atomic(crown_plan jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month_key text := crown_plan->>'monthKey';
  v_batting jsonb := crown_plan->'batting';
  v_bowling jsonb := crown_plan->'bowling';
  v_fielding jsonb := crown_plan->'fielding';
  v_source_matches jsonb := coalesce(crown_plan->'sourceMatches', '[]'::jsonb);
  v_plan_is_demo boolean := coalesce((crown_plan->>'isDemo')::boolean, false);
  v_now timestamptz := transaction_timestamp();
  v_version integer;
  v_id text;
  v_plan_match_count integer;
  v_plan_distinct_match_count integer;
  v_current_match_count integer;
  v_missing_match_count integer;
  v_current_is_demo boolean;
  v_invalid_snapshot_count integer;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  if v_month_key is null or v_month_key !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'invalid_month_key';
  end if;

  if jsonb_typeof(v_batting) is distinct from 'object' or
     jsonb_typeof(v_bowling) is distinct from 'object' or
     jsonb_typeof(v_fielding) is distinct from 'object' then
    raise exception 'invalid_crown_snapshot';
  end if;

  select count(*)
  into v_invalid_snapshot_count
  from (
    values (v_batting), (v_bowling), (v_fielding)
  ) as snapshots(snapshot)
  where case
    when jsonb_typeof(snapshot->'playerIds') is distinct from 'array' then true
    when jsonb_typeof(snapshot->'xp') is distinct from 'number' then true
    when jsonb_array_length(snapshot->'playerIds') = 0 then true
    when (snapshot->>'xp')::numeric < 0 then true
    when (
      select count(*)
      from jsonb_array_elements_text(snapshot->'playerIds') as player_id(value)
      where btrim(player_id.value) <> ''
    ) <> jsonb_array_length(snapshot->'playerIds') then true
    when (
      select count(distinct player_id.value)
      from jsonb_array_elements_text(snapshot->'playerIds') as player_id(value)
    ) <> jsonb_array_length(snapshot->'playerIds') then true
    when exists (
      select 1
      from jsonb_array_elements_text(snapshot->'playerIds') as player_id(value)
      where not exists (
        select 1
        from public.players
        where id = player_id.value
      )
    ) then true
    else false
  end;

  if v_invalid_snapshot_count <> 0 then
    raise exception 'invalid_crown_snapshot';
  end if;

  if jsonb_typeof(v_source_matches) is distinct from 'array' then
    raise exception 'invalid_source_matches';
  end if;

  v_plan_match_count := jsonb_array_length(v_source_matches);

  select count(*)
  into v_plan_distinct_match_count
  from (
    select distinct source_match.value->>'id' as id
    from jsonb_array_elements(v_source_matches) as source_match(value)
    where coalesce(source_match.value->>'id', '') <> ''
  ) as source_match_ids;

  if v_plan_distinct_match_count <> v_plan_match_count then
    raise exception 'duplicate_or_missing_source_match';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('gully-legends-monthly-beasts'),
    pg_catalog.hashtext(v_month_key)
  );

  perform 1
  from public.monthly_beast_crowns
  where month_key = v_month_key
    and status = 'active'
  limit 1;

  if found then
    raise exception 'active_crown_exists';
  end if;

  select count(*), coalesce(bool_or(is_demo), false)
  into v_current_match_count, v_current_is_demo
  from public.matches
  where deleted_at is null
    and status = 'finalised'
    and pg_catalog.to_char(match_date, 'YYYY-MM') = v_month_key;

  if v_current_match_count = 0 then
    raise exception 'no_finalised_matches';
  end if;

  select count(*)
  into v_missing_match_count
  from jsonb_array_elements(v_source_matches) as source_match(value)
  where not exists (
    select 1
    from public.matches
    where id = source_match.value->>'id'
      and updated_at = (source_match.value->>'updatedAt')::timestamptz
      and deleted_at is null
      and status = 'finalised'
      and pg_catalog.to_char(match_date, 'YYYY-MM') = v_month_key
  );

  if v_missing_match_count <> 0 or v_plan_match_count <> v_current_match_count then
    raise exception 'month_match_set_changed';
  end if;

  if v_plan_is_demo is distinct from v_current_is_demo then
    raise exception 'crown_demo_flag_mismatch';
  end if;

  select coalesce(max(version), 0) + 1
  into v_version
  from public.monthly_beast_crowns
  where month_key = v_month_key;

  v_id :=
    'monthly-beasts-' ||
    v_month_key ||
    '-v' ||
    v_version::text ||
    '-' ||
    (floor(extract(epoch from v_now) * 1000))::bigint::text;

  insert into public.monthly_beast_crowns (
    id,
    month_key,
    version,
    status,
    batting,
    bowling,
    fielding,
    is_demo,
    crowned_at,
    crowned_by
  )
  values (
    v_id,
    v_month_key,
    v_version,
    'active',
    v_batting,
    v_bowling,
    v_fielding,
    v_current_is_demo,
    v_now,
    auth.uid()::text
  );

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'month_key', v_month_key,
    'version', v_version,
    'is_demo', v_current_is_demo
  );
end;
$$;

create or replace function public.reopen_monthly_beast_crown(month_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month_key text := month_key;
  v_now timestamptz := transaction_timestamp();
  v_crown public.monthly_beast_crowns%rowtype;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  if v_month_key is null or v_month_key !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'invalid_month_key';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('gully-legends-monthly-beasts'),
    pg_catalog.hashtext(v_month_key)
  );

  select *
  into v_crown
  from public.monthly_beast_crowns
  where monthly_beast_crowns.month_key = v_month_key
    and status = 'active'
  for update;

  if not found then
    raise exception 'no_active_crown';
  end if;

  update public.monthly_beast_crowns
  set
    status = 'revoked',
    revoked_at = v_now,
    revoked_by = auth.uid()::text
  where id = v_crown.id;

  return jsonb_build_object(
    'ok', true,
    'id', v_crown.id,
    'month_key', v_crown.month_key,
    'version', v_crown.version
  );
end;
$$;

create or replace function public.reset_demo_data_atomic(reset_plan jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected_demo_matches jsonb :=
    coalesce(reset_plan->'expectedDemoMatches', '[]'::jsonb);
  v_expected_real_matches jsonb :=
    coalesce(reset_plan->'expectedRealFinalisedMatches', '[]'::jsonb);
  v_replacement_careers jsonb :=
    coalesce(reset_plan->'replacementCareers', '[]'::jsonb);
  v_expected_demo_count integer;
  v_expected_demo_distinct_count integer;
  v_current_demo_count integer;
  v_missing_demo_count integer;
  v_expected_real_count integer;
  v_expected_real_distinct_count integer;
  v_current_real_count integer;
  v_missing_real_count integer;
  v_career_plan_count integer;
  v_career_distinct_count integer;
  v_career_plan jsonb;
  v_expected_career jsonb;
  v_next_career jsonb;
  v_player_id text;
  v_existing_career public.player_career_stats%rowtype;
  v_demo_matches_removed integer := 0;
  v_demo_progressions_removed integer := 0;
  v_demo_crowns_removed integer := 0;
  v_demo_gallery_records_removed integer := 0;
  v_career_rows_rebuilt integer := 0;
  v_real_matches_preserved integer := 0;
  v_month_key text;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  if jsonb_typeof(v_expected_demo_matches) is distinct from 'array' or
     jsonb_typeof(v_expected_real_matches) is distinct from 'array' or
     jsonb_typeof(v_replacement_careers) is distinct from 'array' then
    raise exception 'invalid_reset_plan';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('gully-legends-reset-demo-data'),
    0
  );

  for v_month_key in
    select distinct month_key
    from (
      select pg_catalog.to_char(match_date, 'YYYY-MM') as month_key
      from public.matches
      where is_demo = true
         or (deleted_at is null and status = 'finalised')
      union
      select month_key
      from public.monthly_beast_crowns
      where is_demo = true
    ) as reset_months
    where month_key is not null
    order by month_key
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext('gully-legends-monthly-beasts'),
      pg_catalog.hashtext(v_month_key)
    );
  end loop;

  v_expected_demo_count := jsonb_array_length(v_expected_demo_matches);
  v_expected_real_count := jsonb_array_length(v_expected_real_matches);
  v_career_plan_count := jsonb_array_length(v_replacement_careers);

  select count(*)
  into v_expected_demo_distinct_count
  from (
    select distinct expected_match.value->>'id' as id
    from jsonb_array_elements(v_expected_demo_matches) as expected_match(value)
    where coalesce(expected_match.value->>'id', '') <> ''
  ) as expected_demo_match_ids;

  select count(*)
  into v_expected_real_distinct_count
  from (
    select distinct expected_match.value->>'id' as id
    from jsonb_array_elements(v_expected_real_matches) as expected_match(value)
    where coalesce(expected_match.value->>'id', '') <> ''
  ) as expected_real_match_ids;

  if v_expected_demo_distinct_count <> v_expected_demo_count or
     v_expected_real_distinct_count <> v_expected_real_count then
    raise exception 'duplicate_or_missing_expected_match';
  end if;

  select count(*)
  into v_career_distinct_count
  from (
    select distinct career.value->>'playerId' as player_id
    from jsonb_array_elements(v_replacement_careers) as career(value)
    where coalesce(career.value->>'playerId', '') <> ''
  ) as career_players;

  if v_career_distinct_count <> v_career_plan_count then
    raise exception 'duplicate_or_missing_career_player';
  end if;

  perform 1
  from public.matches
  where is_demo = true
  for update;

  perform 1
  from public.matches
  where deleted_at is null
    and status = 'finalised'
    and is_demo = false
  for update;

  perform 1
  from public.monthly_beast_crowns
  where is_demo = true
  for update;

  select count(*)
  into v_current_demo_count
  from public.matches
  where is_demo = true;

  select count(*)
  into v_missing_demo_count
  from jsonb_array_elements(v_expected_demo_matches) as expected_match(value)
  where not exists (
    select 1
    from public.matches
    where id = expected_match.value->>'id'
      and is_demo = true
      and updated_at = (expected_match.value->>'updatedAt')::timestamptz
  );

  if v_current_demo_count <> v_expected_demo_count or v_missing_demo_count <> 0 then
    raise exception 'demo_match_set_changed';
  end if;

  select count(*)
  into v_current_real_count
  from public.matches
  where deleted_at is null
    and status = 'finalised'
    and is_demo = false;

  select count(*)
  into v_missing_real_count
  from jsonb_array_elements(v_expected_real_matches) as expected_match(value)
  where not exists (
    select 1
    from public.matches
    where id = expected_match.value->>'id'
      and deleted_at is null
      and status = 'finalised'
      and is_demo = false
      and updated_at = (expected_match.value->>'updatedAt')::timestamptz
  );

  if v_current_real_count <> v_expected_real_count or v_missing_real_count <> 0 then
    raise exception 'real_match_set_changed';
  end if;

  for v_career_plan in
    select value
    from jsonb_array_elements(v_replacement_careers) as career(value)
    order by value->>'playerId'
  loop
    v_player_id := v_career_plan->>'playerId';
    v_expected_career := v_career_plan->'expectedCareer';
    v_next_career := v_career_plan->'nextCareer';

    if v_player_id is null or btrim(v_player_id) = '' then
      raise exception 'missing_player_id';
    end if;

    if jsonb_typeof(v_next_career) is distinct from 'object' then
      raise exception 'invalid_next_career';
    end if;

    perform 1
    from public.players
    where id = v_player_id;

    if not found then
      raise exception 'unknown_player';
    end if;

    select *
    into v_existing_career
    from public.player_career_stats
    where player_id = v_player_id
    for update;

    if found then
      if jsonb_typeof(v_expected_career) is distinct from 'object' then
        raise exception 'stale_career';
      end if;

      if v_existing_career.updated_at is distinct from (v_expected_career->>'updatedAt')::timestamptz or
         v_existing_career.matches is distinct from (v_expected_career->>'matches')::integer or
         v_existing_career.innings_batted is distinct from (v_expected_career->>'inningsBatted')::integer or
         v_existing_career.runs is distinct from (v_expected_career->>'runs')::integer or
         v_existing_career.fifties is distinct from (v_expected_career->>'fifties')::integer or
         v_existing_career.centuries is distinct from (v_expected_career->>'centuries')::integer or
         v_existing_career.dismissed_ducks is distinct from (v_expected_career->>'dismissedDucks')::integer or
         v_existing_career.wickets is distinct from (v_expected_career->>'wickets')::integer or
         v_existing_career.catches is distinct from (v_expected_career->>'catches')::integer or
         v_existing_career.run_outs is distinct from (v_expected_career->>'runOuts')::integer or
         v_existing_career.stumpings is distinct from (v_expected_career->>'stumpings')::integer or
         v_existing_career.hat_tricks is distinct from (v_expected_career->>'hatTricks')::integer or
         v_existing_career.three_wicket_hauls is distinct from (v_expected_career->>'threeWicketHauls')::integer or
         v_existing_career.matches_bowled is distinct from (v_expected_career->>'matchesBowled')::integer or
         v_existing_career.completed_overs is distinct from (v_expected_career->>'completedOvers')::integer or
         v_existing_career.total_runs_conceded is distinct from (v_expected_career->>'totalRunsConceded')::integer or
         v_existing_career.total_xp is distinct from (v_expected_career->>'totalXP')::integer or
         v_existing_career.level is distinct from (v_expected_career->>'level')::integer then
        raise exception 'stale_career';
      end if;
    elsif v_expected_career is not null and jsonb_typeof(v_expected_career) <> 'null' then
      raise exception 'stale_career';
    end if;

    insert into public.player_career_stats (
      player_id,
      matches,
      innings_batted,
      runs,
      fifties,
      centuries,
      dismissed_ducks,
      wickets,
      catches,
      run_outs,
      stumpings,
      hat_tricks,
      three_wicket_hauls,
      matches_bowled,
      completed_overs,
      total_runs_conceded,
      total_xp,
      level
    )
    values (
      v_player_id,
      (v_next_career->>'matches')::integer,
      (v_next_career->>'inningsBatted')::integer,
      (v_next_career->>'runs')::integer,
      (v_next_career->>'fifties')::integer,
      (v_next_career->>'centuries')::integer,
      (v_next_career->>'dismissedDucks')::integer,
      (v_next_career->>'wickets')::integer,
      (v_next_career->>'catches')::integer,
      (v_next_career->>'runOuts')::integer,
      (v_next_career->>'stumpings')::integer,
      (v_next_career->>'hatTricks')::integer,
      (v_next_career->>'threeWicketHauls')::integer,
      (v_next_career->>'matchesBowled')::integer,
      (v_next_career->>'completedOvers')::integer,
      (v_next_career->>'totalRunsConceded')::integer,
      (v_next_career->>'totalXP')::integer,
      (v_next_career->>'level')::integer
    )
    on conflict (player_id) do update
    set
      matches = excluded.matches,
      innings_batted = excluded.innings_batted,
      runs = excluded.runs,
      fifties = excluded.fifties,
      centuries = excluded.centuries,
      dismissed_ducks = excluded.dismissed_ducks,
      wickets = excluded.wickets,
      catches = excluded.catches,
      run_outs = excluded.run_outs,
      stumpings = excluded.stumpings,
      hat_tricks = excluded.hat_tricks,
      three_wicket_hauls = excluded.three_wicket_hauls,
      matches_bowled = excluded.matches_bowled,
      completed_overs = excluded.completed_overs,
      total_runs_conceded = excluded.total_runs_conceded,
      total_xp = excluded.total_xp,
      level = excluded.level;

    v_career_rows_rebuilt := v_career_rows_rebuilt + 1;
  end loop;

  select count(*)
  into v_demo_progressions_removed
  from public.match_stat_applications
  inner join public.matches on matches.id = match_stat_applications.match_id
  where matches.is_demo = true;

  delete from public.gallery_photos
  where is_demo = true;
  get diagnostics v_demo_gallery_records_removed = row_count;

  delete from public.monthly_beast_crowns
  where is_demo = true;
  get diagnostics v_demo_crowns_removed = row_count;

  delete from public.matches
  where is_demo = true;
  get diagnostics v_demo_matches_removed = row_count;

  v_real_matches_preserved := v_current_real_count;

  return jsonb_build_object(
    'ok', true,
    'demo_matches_removed', v_demo_matches_removed,
    'demo_progressions_removed', v_demo_progressions_removed,
    'demo_crowns_removed', v_demo_crowns_removed,
    'demo_gallery_records_removed', v_demo_gallery_records_removed,
    'career_rows_rebuilt', v_career_rows_rebuilt,
    'real_matches_preserved', v_real_matches_preserved
  );
end;
$$;

revoke all on function public.crown_monthly_beasts_atomic(jsonb) from public;
revoke all on function public.crown_monthly_beasts_atomic(jsonb) from anon;
grant execute on function public.crown_monthly_beasts_atomic(jsonb) to authenticated;

revoke all on function public.reopen_monthly_beast_crown(text) from public;
revoke all on function public.reopen_monthly_beast_crown(text) from anon;
grant execute on function public.reopen_monthly_beast_crown(text) to authenticated;

revoke all on function public.reset_demo_data_atomic(jsonb) from public;
revoke all on function public.reset_demo_data_atomic(jsonb) from anon;
grant execute on function public.reset_demo_data_atomic(jsonb) to authenticated;
