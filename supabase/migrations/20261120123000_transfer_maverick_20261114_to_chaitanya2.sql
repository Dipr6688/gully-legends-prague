-- Guarded identity correction for eight explicitly approved 2026-11-14 APK matches.
-- This changes official reviewed ownership from MAVERICK (player-slot-3) to the
-- permanent Chaitanya profile (chaitanya-2). It does not re-finalise matches,
-- recalculate XP awards, or alter immutable APK source payloads.

begin;

create or replace function pg_temp.gully_transfer_match_player_ids(
  document jsonb,
  old_player_id text,
  new_player_id text
)
returns jsonb
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  entry record;
  next_value jsonb;
  result jsonb;
  scalar_keys constant text[] := array[
    'playerId',
    'sharedPlayerId',
    'strikerId',
    'nonStrikerId',
    'bowlerId',
    'dismissedPlayerId',
    'fielderId',
    'assistingFielderId',
    'newBatterId',
    'nextStrikerId',
    'nextNonStrikerId',
    'dismissedBatterId',
    'creditedBowlerId',
    'pomRecommendationPlayerId',
    'selectedPlayerOfMatchId'
  ];
  array_keys constant text[] := array[
    'playerIds',
    'teamAPlayerIds',
    'teamBPlayerIds',
    'everSharedPlayerIds',
    'fieldingHelperIds'
  ];
begin
  if jsonb_typeof(document) = 'object' then
    result := '{}'::jsonb;

    for entry in
      select object_entry.key, object_entry.value
      from jsonb_each(document) as object_entry(key, value)
    loop
      if entry.key = any(scalar_keys) and entry.value = to_jsonb(old_player_id) then
        next_value := to_jsonb(new_player_id);
      elsif entry.key = any(array_keys) and jsonb_typeof(entry.value) = 'array' then
        select coalesce(
          jsonb_agg(
            case
              when array_entry.value = to_jsonb(old_player_id) then to_jsonb(new_player_id)
              else array_entry.value
            end
            order by array_entry.ordinality
          ),
          '[]'::jsonb
        )
        into next_value
        from jsonb_array_elements(entry.value) with ordinality
          as array_entry(value, ordinality);
      else
        next_value := pg_temp.gully_transfer_match_player_ids(
          entry.value,
          old_player_id,
          new_player_id
        );
      end if;

      result := result || jsonb_build_object(entry.key, next_value);
    end loop;

    return result;
  end if;

  if jsonb_typeof(document) = 'array' then
    select coalesce(
      jsonb_agg(
        pg_temp.gully_transfer_match_player_ids(
          array_entry.value,
          old_player_id,
          new_player_id
        )
        order by array_entry.ordinality
      ),
      '[]'::jsonb
    )
    into result
    from jsonb_array_elements(document) with ordinality
      as array_entry(value, ordinality);

    return result;
  end if;

  return document;
end;
$$;

create or replace function pg_temp.gully_count_match_player_refs(
  document jsonb,
  player_id text
)
returns bigint
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  entry record;
  result bigint := 0;
  scalar_keys constant text[] := array[
    'playerId',
    'sharedPlayerId',
    'strikerId',
    'nonStrikerId',
    'bowlerId',
    'dismissedPlayerId',
    'fielderId',
    'assistingFielderId',
    'newBatterId',
    'nextStrikerId',
    'nextNonStrikerId',
    'dismissedBatterId',
    'creditedBowlerId',
    'pomRecommendationPlayerId',
    'selectedPlayerOfMatchId'
  ];
  array_keys constant text[] := array[
    'playerIds',
    'teamAPlayerIds',
    'teamBPlayerIds',
    'everSharedPlayerIds',
    'fieldingHelperIds'
  ];
begin
  if jsonb_typeof(document) = 'object' then
    for entry in
      select object_entry.key, object_entry.value
      from jsonb_each(document) as object_entry(key, value)
    loop
      if entry.key = any(scalar_keys) and entry.value = to_jsonb(player_id) then
        result := result + 1;
      elsif entry.key = any(array_keys) and jsonb_typeof(entry.value) = 'array' then
        select result + count(*)
        into result
        from jsonb_array_elements(entry.value) as array_entry(value)
        where array_entry.value = to_jsonb(player_id);
      else
        result := result + pg_temp.gully_count_match_player_refs(entry.value, player_id);
      end if;
    end loop;
  elsif jsonb_typeof(document) = 'array' then
    select result + coalesce(sum(
      pg_temp.gully_count_match_player_refs(array_entry.value, player_id)
    ), 0)
    into result
    from jsonb_array_elements(document) as array_entry(value);
  end if;

  return result;
end;
$$;

do $migration$
declare
  approved_match_ids constant text[] := array[
    'apk-match-bb11ff68-faab-4fde-b41a-17f026642e71',
    'apk-match-f6017372-c6a3-40ee-b389-250545188b17',
    'apk-match-c085e45f-d735-45c2-af78-b91e3221419b',
    'apk-match-0536c6ad-d9ab-450e-b0a1-6f820c64944a',
    'apk-match-1d01a86f-cda4-42fa-9950-364981ed5d14',
    'apk-match-a67f35b8-bf7b-4da3-b3d6-385de8b24c0d',
    'apk-match-b9b53880-1ae7-472b-8624-4eb39a3a7bc9',
    'apk-match-cf138376-f06a-4f20-b860-c2b70f85a7f9'
  ];
  protected_match_ids constant text[] := array[
    'apk-match-56bf9697-2dd4-4f39-8710-47d7a47fcfff',
    'apk-match-2e62a6c9-8269-43df-96ef-0d490feef676',
    'apk-match-827d6036-eb7d-4c2b-9379-a78a20bcf20f'
  ];
  old_player_id constant text := 'player-slot-3';
  new_player_id constant text := 'chaitanya-2';
  existing_chaitanya_id constant text := 'chaitanya';
  approved_date constant date := date '2026-11-14';
  protected_date constant date := date '2026-10-28';
  current_player_id text;
  match_record record;
  progression_record record;
  old_ref_count bigint;
  new_ref_count bigint;
  expected_new_ref_counts jsonb;
  protected_payloads jsonb;
  apk_import_snapshots jsonb;
  existing_chaitanya_career jsonb;
  approved_totals_before jsonb;
  approved_totals_after jsonb;
  current_matches integer;
  current_innings_batted integer;
  current_runs integer;
  current_fifties integer;
  current_centuries integer;
  current_dismissed_ducks integer;
  current_wickets integer;
  current_catches integer;
  current_run_outs integer;
  current_stumpings integer;
  current_hat_tricks integer;
  current_three_wicket_hauls integer;
  current_matches_bowled integer;
  current_completed_overs integer;
  current_runs_conceded integer;
  current_total_xp integer;
  current_level integer;
  current_level_floor integer;
  candidate_level integer;
  candidate_threshold integer;
  level_index integer;
  awarded_xp integer;
  performance jsonb;
  affected_rows integer;
begin
  perform pg_advisory_xact_lock(
    hashtext('gully-legends-player-identity-transfer'),
    hashtext('2026-11-14-player-slot-3-chaitanya-2')
  );
  perform pg_advisory_xact_lock(hashtext('gully-legends-reset-demo-data'), 0);
  perform pg_advisory_xact_lock(
    hashtext('gully-legends-monthly-beasts'),
    hashtext('2026-11')
  );

  perform 1
  from public.players
  where id in (existing_chaitanya_id, new_player_id, old_player_id)
  order by id
  for update;

  if (select count(*) from public.players where id in (
    existing_chaitanya_id,
    new_player_id,
    old_player_id
  )) <> 3 then
    raise exception 'identity_transfer_missing_required_player';
  end if;

  if not exists (
    select 1
    from public.players
    where id = existing_chaitanya_id
      and display_name = 'Chaitanya'
  ) then
    raise exception 'identity_transfer_existing_chaitanya_mismatch';
  end if;

  if not exists (
    select 1
    from public.players
    where id = new_player_id
      and display_name = 'Chaitanya'
      and card_title = 'TRIPLE THREAT'
      and is_active = true
  ) then
    raise exception 'identity_transfer_new_chaitanya_mismatch';
  end if;

  if not exists (
    select 1
    from public.players
    where id = old_player_id
      and display_name = 'MAVERICK'
      and is_active = true
  ) then
    raise exception 'identity_transfer_maverick_mismatch';
  end if;

  perform 1
  from public.apk_match_imports
  where source = 'apk'
    and finalised_match_id = any(approved_match_ids || protected_match_ids)
  order by id
  for update;

  if (
    select count(*)
    from public.apk_match_imports
    where source = 'apk'
      and finalised_match_id = any(approved_match_ids)
      and review_status = 'finalised'
      and is_demo = false
      and match_date = approved_date
  ) <> 8 then
    raise exception 'identity_transfer_approved_apk_link_mismatch';
  end if;

  if (
    select count(*)
    from public.apk_match_imports
    where source = 'apk'
      and finalised_match_id = any(protected_match_ids)
      and review_status = 'finalised'
      and is_demo = false
      and match_date = protected_date
  ) <> 3 then
    raise exception 'identity_transfer_protected_apk_link_mismatch';
  end if;

  select jsonb_object_agg(
    id::text,
    jsonb_build_object(
      'offline_match_id', offline_match_id,
      'sync_version', sync_version,
      'raw_payload', raw_payload,
      'derived_match_payload', derived_match_payload,
      'validation_result', validation_result,
      'review_payload', review_payload,
      'review_derived_match_payload', review_derived_match_payload,
      'review_validation_result', review_validation_result,
      'review_source_sync_version', review_source_sync_version,
      'review_version', review_version,
      'finalised_match_id', finalised_match_id
    )
    order by id::text
  )
  into apk_import_snapshots
  from public.apk_match_imports
  where source = 'apk'
    and finalised_match_id = any(approved_match_ids || protected_match_ids);

  perform 1
  from public.matches
  where id = any(approved_match_ids || protected_match_ids)
  order by id
  for update;

  if (select count(*) from public.matches where id = any(approved_match_ids)) <> 8 then
    raise exception 'identity_transfer_approved_match_count_mismatch';
  end if;

  if exists (
    select 1
    from public.matches
    where id = any(approved_match_ids)
      and (
        match_date <> approved_date or
        status <> 'finalised' or
        is_demo or
        deleted_at is not null or
        finalised_at is null or
        stats_applied_at is null
      )
  ) then
    raise exception 'identity_transfer_approved_match_state_mismatch';
  end if;

  expected_new_ref_counts := '{}'::jsonb;
  for match_record in
    select id, payload
    from public.matches
    where id = any(approved_match_ids)
    order by id
  loop
    old_ref_count := pg_temp.gully_count_match_player_refs(
      match_record.payload,
      old_player_id
    );
    new_ref_count := pg_temp.gully_count_match_player_refs(
      match_record.payload,
      new_player_id
    );

    if old_ref_count = 0 then
      raise exception 'identity_transfer_maverick_missing_from_approved_match:%', match_record.id;
    end if;
    if new_ref_count <> 0 then
      raise exception 'identity_transfer_new_chaitanya_already_in_approved_match:%', match_record.id;
    end if;

    expected_new_ref_counts := expected_new_ref_counts ||
      jsonb_build_object(match_record.id, old_ref_count);
  end loop;

  if (select count(*) from public.matches where id = any(protected_match_ids)) <> 3 then
    raise exception 'identity_transfer_protected_match_count_mismatch';
  end if;

  if exists (
    select 1
    from public.matches
    where id = any(protected_match_ids)
      and (
        match_date <> protected_date or
        status <> 'finalised' or
        is_demo or
        deleted_at is not null or
        pg_temp.gully_count_match_player_refs(payload, old_player_id) = 0 or
        pg_temp.gully_count_match_player_refs(payload, new_player_id) <> 0
      )
  ) then
    raise exception 'identity_transfer_protected_match_state_mismatch';
  end if;

  select jsonb_object_agg(id, payload order by id)
  into protected_payloads
  from public.matches
  where id = any(protected_match_ids);

  perform 1
  from public.match_stat_applications
  where match_id = any(approved_match_ids)
    and player_id in (old_player_id, new_player_id)
  order by match_id, player_id
  for update;

  if (
    select count(*)
    from public.match_stat_applications
    where match_id = any(approved_match_ids)
      and player_id = old_player_id
  ) <> 8 then
    raise exception 'identity_transfer_maverick_ledger_count_mismatch';
  end if;

  if exists (
    select 1
    from public.match_stat_applications
    where match_id = any(approved_match_ids)
      and player_id = new_player_id
  ) then
    raise exception 'identity_transfer_duplicate_chaitanya_ledger';
  end if;

  if exists (
    select 1
    from public.match_stat_applications as application
    where application.match_id = any(approved_match_ids)
      and exists (
        select 1
        from public.match_stat_applications as conflict
        where conflict.idempotency_key = application.match_id || ':' || new_player_id
      )
  ) then
    raise exception 'identity_transfer_idempotency_key_conflict';
  end if;

  perform 1
  from public.player_career_stats
  where player_id in (existing_chaitanya_id, old_player_id, new_player_id)
  order by player_id
  for update;

  if (
    select count(*)
    from public.player_career_stats
    where player_id in (existing_chaitanya_id, old_player_id, new_player_id)
  ) <> 3 then
    raise exception 'identity_transfer_missing_career_row';
  end if;

  select to_jsonb(career)
  into existing_chaitanya_career
  from public.player_career_stats as career
  where player_id = existing_chaitanya_id;

  if exists (
    select 1
    from public.monthly_beast_crowns
    where month_key = '2026-11'
      and status = 'active'
      and is_demo = false
  ) then
    raise exception 'identity_transfer_active_november_crown_requires_review';
  end if;

  select jsonb_build_object(
    'runs', coalesce(sum(coalesce(nullif(record.value->>'runs', '')::integer, 0)), 0),
    'wickets', coalesce(sum((record.value->>'wickets')::integer), 0),
    'catches', coalesce(sum((record.value->>'catches')::integer), 0),
    'runOuts', coalesce(sum((record.value->>'runOuts')::integer), 0),
    'stumpings', coalesce(sum(coalesce((record.value->>'stumpings')::integer, 0)), 0),
    'awardedXP', coalesce(sum((record.value #>> '{xpBreakdown,awardedXP}')::integer), 0)
  )
  into approved_totals_before
  from public.matches as approved_match
  cross join lateral jsonb_array_elements(
    approved_match.payload->'finalisedPlayerRecords'
  ) as record(value)
  where approved_match.id = any(approved_match_ids)
    and record.value->>'playerId' = old_player_id
    and record.value->>'played' = 'true';

  update public.matches
  set payload = pg_temp.gully_transfer_match_player_ids(
    payload,
    old_player_id,
    new_player_id
  )
  where id = any(approved_match_ids);

  get diagnostics affected_rows = row_count;
  if affected_rows <> 8 then
    raise exception 'identity_transfer_match_update_count_mismatch:%', affected_rows;
  end if;

  for match_record in
    select id, payload
    from public.matches
    where id = any(approved_match_ids)
    order by id
  loop
    old_ref_count := pg_temp.gully_count_match_player_refs(
      match_record.payload,
      old_player_id
    );
    new_ref_count := pg_temp.gully_count_match_player_refs(
      match_record.payload,
      new_player_id
    );

    if old_ref_count <> 0 or
       new_ref_count <> (expected_new_ref_counts->>match_record.id)::bigint then
      raise exception 'identity_transfer_match_reference_verification_failed:%', match_record.id;
    end if;
  end loop;

  update public.match_stat_applications
  set
    player_id = new_player_id,
    idempotency_key = match_id || ':' || new_player_id
  where match_id = any(approved_match_ids)
    and player_id = old_player_id;

  get diagnostics affected_rows = row_count;
  if affected_rows <> 8 then
    raise exception 'identity_transfer_ledger_update_count_mismatch:%', affected_rows;
  end if;

  if (
    select count(*)
    from public.match_stat_applications
    where match_id = any(approved_match_ids)
      and player_id = new_player_id
      and idempotency_key = match_id || ':' || new_player_id
  ) <> 8 then
    raise exception 'identity_transfer_ledger_update_failed';
  end if;

  if exists (
    select 1
    from public.match_stat_applications as application
    join public.matches as official_match on official_match.id = application.match_id
    where application.player_id in (old_player_id, new_player_id)
      and official_match.status = 'finalised'
      and official_match.is_demo = false
      and official_match.deleted_at is null
      and (
        select count(*)
        from jsonb_array_elements(
          official_match.payload->'finalisedPlayerRecords'
        ) as record(value)
        where record.value->>'playerId' = application.player_id
          and record.value->>'played' = 'true'
      ) <> 1
  ) then
    raise exception 'identity_transfer_ledger_performance_mismatch';
  end if;

  if exists (
    select 1
    from public.matches as official_match
    cross join lateral jsonb_array_elements(
      official_match.payload->'finalisedPlayerRecords'
    ) as record(value)
    where official_match.status = 'finalised'
      and official_match.is_demo = false
      and official_match.deleted_at is null
      and official_match.payload #>> '{result,type}' <> 'no_result'
      and record.value->>'playerId' in (old_player_id, new_player_id)
      and record.value->>'played' = 'true'
      and not exists (
        select 1
        from public.match_stat_applications as application
        where application.match_id = official_match.id
          and application.player_id = record.value->>'playerId'
      )
  ) then
    raise exception 'identity_transfer_official_performance_missing_ledger';
  end if;

  foreach current_player_id in array array[old_player_id, new_player_id]
  loop
    current_matches := 0;
    current_innings_batted := 0;
    current_runs := 0;
    current_fifties := 0;
    current_centuries := 0;
    current_dismissed_ducks := 0;
    current_wickets := 0;
    current_catches := 0;
    current_run_outs := 0;
    current_stumpings := 0;
    current_hat_tricks := 0;
    current_three_wicket_hauls := 0;
    current_matches_bowled := 0;
    current_completed_overs := 0;
    current_runs_conceded := 0;
    current_total_xp := 0;
    current_level := 0;

    for progression_record in
      select
        application.match_id,
        application.xp_breakdown,
        application.applied_at,
        official_match.payload,
        (
          select count(*)
          from (
            select bowling_over.value
            from jsonb_array_elements(
              coalesce(official_match.payload #> '{teams,teamA,bowlingOvers}', '[]'::jsonb)
            ) as bowling_over(value)
            union all
            select bowling_over.value
            from jsonb_array_elements(
              coalesce(official_match.payload #> '{teams,teamB,bowlingOvers}', '[]'::jsonb)
            ) as bowling_over(value)
          ) as player_over
          where player_over.value->>'bowlerId' = current_player_id
        )::integer as completed_overs,
        (
          select coalesce(sum(coalesce(nullif(player_over.value->>'runsConceded', '')::integer, 0)), 0)
          from (
            select bowling_over.value
            from jsonb_array_elements(
              coalesce(official_match.payload #> '{teams,teamA,bowlingOvers}', '[]'::jsonb)
            ) as bowling_over(value)
            union all
            select bowling_over.value
            from jsonb_array_elements(
              coalesce(official_match.payload #> '{teams,teamB,bowlingOvers}', '[]'::jsonb)
            ) as bowling_over(value)
          ) as player_over
          where player_over.value->>'bowlerId' = current_player_id
        )::integer as runs_conceded
      from public.match_stat_applications as application
      join public.matches as official_match on official_match.id = application.match_id
      where application.player_id = current_player_id
        and official_match.status = 'finalised'
        and official_match.is_demo = false
        and official_match.deleted_at is null
      order by application.applied_at, application.match_id
    loop
      select record.value
      into performance
      from jsonb_array_elements(
        progression_record.payload->'finalisedPlayerRecords'
      ) as record(value)
      where record.value->>'playerId' = current_player_id
        and record.value->>'played' = 'true';

      if performance is null then
        raise exception 'identity_transfer_missing_finalised_performance:%:%',
          progression_record.match_id,
          current_player_id;
      end if;

      current_matches := current_matches + 1;
      if (performance->>'didBat')::boolean then
        current_innings_batted := current_innings_batted + 1;
        current_runs := current_runs + coalesce(nullif(performance->>'runs', '')::integer, 0);
        if coalesce(nullif(performance->>'runs', '')::integer, 0) >= 100 then
          current_centuries := current_centuries + 1;
        elsif coalesce(nullif(performance->>'runs', '')::integer, 0) >= 50 then
          current_fifties := current_fifties + 1;
        end if;
        if (performance->>'wasOut')::boolean and
           coalesce(nullif(performance->>'runs', '')::integer, 0) = 0 then
          current_dismissed_ducks := current_dismissed_ducks + 1;
        end if;
      end if;

      current_wickets := current_wickets + coalesce((performance->>'wickets')::integer, 0);
      current_catches := current_catches + coalesce((performance->>'catches')::integer, 0);
      current_run_outs := current_run_outs + coalesce((performance->>'runOuts')::integer, 0);
      current_stumpings := current_stumpings + coalesce((performance->>'stumpings')::integer, 0);
      current_hat_tricks := current_hat_tricks + coalesce((performance->>'hatTricks')::integer, 0);
      if coalesce((performance->>'wickets')::integer, 0) >= 3 then
        current_three_wicket_hauls := current_three_wicket_hauls + 1;
      end if;
      if progression_record.completed_overs > 0 then
        current_matches_bowled := current_matches_bowled + 1;
      end if;
      current_completed_overs := current_completed_overs + progression_record.completed_overs;
      current_runs_conceded := current_runs_conceded + progression_record.runs_conceded;

      awarded_xp := (progression_record.xp_breakdown->>'awardedXP')::integer;
      current_level_floor := 0;
      if current_level > 0 then
        for level_index in 0..current_level - 1
        loop
          current_level_floor := current_level_floor +
            150 + (50 * level_index) + (10 * level_index * level_index);
        end loop;
      end if;
      current_total_xp := greatest(
        current_level_floor,
        current_total_xp + awarded_xp
      );

      candidate_level := 0;
      candidate_threshold := 0;
      while current_total_xp >= candidate_threshold +
        150 + (50 * candidate_level) + (10 * candidate_level * candidate_level)
      loop
        candidate_threshold := candidate_threshold +
          150 + (50 * candidate_level) + (10 * candidate_level * candidate_level);
        candidate_level := candidate_level + 1;
      end loop;
      current_level := greatest(current_level, candidate_level);
    end loop;

    update public.player_career_stats
    set
      matches = current_matches,
      innings_batted = current_innings_batted,
      runs = current_runs,
      fifties = current_fifties,
      centuries = current_centuries,
      dismissed_ducks = current_dismissed_ducks,
      wickets = current_wickets,
      catches = current_catches,
      run_outs = current_run_outs,
      stumpings = current_stumpings,
      hat_tricks = current_hat_tricks,
      three_wicket_hauls = current_three_wicket_hauls,
      matches_bowled = current_matches_bowled,
      completed_overs = current_completed_overs,
      total_runs_conceded = current_runs_conceded,
      total_xp = current_total_xp,
      level = current_level
    where player_id = current_player_id;
  end loop;

  select jsonb_build_object(
    'runs', coalesce(sum(coalesce(nullif(record.value->>'runs', '')::integer, 0)), 0),
    'wickets', coalesce(sum((record.value->>'wickets')::integer), 0),
    'catches', coalesce(sum((record.value->>'catches')::integer), 0),
    'runOuts', coalesce(sum((record.value->>'runOuts')::integer), 0),
    'stumpings', coalesce(sum(coalesce((record.value->>'stumpings')::integer, 0)), 0),
    'awardedXP', coalesce(sum((record.value #>> '{xpBreakdown,awardedXP}')::integer), 0)
  )
  into approved_totals_after
  from public.matches as approved_match
  cross join lateral jsonb_array_elements(
    approved_match.payload->'finalisedPlayerRecords'
  ) as record(value)
  where approved_match.id = any(approved_match_ids)
    and record.value->>'playerId' = new_player_id
    and record.value->>'played' = 'true';

  if approved_totals_after is distinct from approved_totals_before then
    raise exception 'identity_transfer_match_totals_not_conserved';
  end if;

  if exists (
    select 1
    from public.match_stat_applications
    where match_id = any(approved_match_ids)
      and player_id = old_player_id
  ) then
    raise exception 'identity_transfer_old_ledger_ownership_remains';
  end if;

  if (
    select jsonb_object_agg(id, payload order by id)
    from public.matches
    where id = any(protected_match_ids)
  ) is distinct from protected_payloads then
    raise exception 'identity_transfer_protected_matches_changed';
  end if;

  if (
    select to_jsonb(career)
    from public.player_career_stats as career
    where player_id = existing_chaitanya_id
  ) is distinct from existing_chaitanya_career then
    raise exception 'identity_transfer_existing_chaitanya_changed';
  end if;

  if (
    select jsonb_object_agg(
      id::text,
      jsonb_build_object(
        'offline_match_id', offline_match_id,
        'sync_version', sync_version,
        'raw_payload', raw_payload,
        'derived_match_payload', derived_match_payload,
        'validation_result', validation_result,
        'review_payload', review_payload,
        'review_derived_match_payload', review_derived_match_payload,
        'review_validation_result', review_validation_result,
        'review_source_sync_version', review_source_sync_version,
        'review_version', review_version,
        'finalised_match_id', finalised_match_id
      )
      order by id::text
    )
    from public.apk_match_imports
    where source = 'apk'
      and finalised_match_id = any(approved_match_ids || protected_match_ids)
  ) is distinct from apk_import_snapshots then
    raise exception 'identity_transfer_apk_provenance_changed';
  end if;
end;
$migration$;

commit;
