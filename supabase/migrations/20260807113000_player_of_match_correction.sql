create or replace function public.correct_player_of_match_atomic(correction_plan jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match_id text := correction_plan->>'matchId';
  v_expected_match_updated_at timestamptz :=
    nullif(correction_plan->>'expectedMatchUpdatedAt', '')::timestamptz;
  v_expected_player_of_match_id text :=
    nullif(correction_plan->>'expectedPlayerOfMatchId', '');
  v_corrected_match jsonb := correction_plan->'correctedMatch';
  v_affected jsonb := coalesce(correction_plan->'affectedApplications', '[]'::jsonb);
  v_application jsonb;
  v_player_id text;
  v_expected_career jsonb;
  v_next_career jsonb;
  v_expected_xp_breakdown jsonb;
  v_next_xp_breakdown jsonb;
  v_match public.matches%rowtype;
  v_career public.player_career_stats%rowtype;
  v_current_xp_breakdown jsonb;
  v_current_player_of_match_id text;
  v_corrected_player_of_match_id text;
  v_corrected_pom_count integer;
  v_missing_required_application_count integer;
  v_unexpected_application_count integer;
  v_expected_pom_xp integer;
  v_next_pom_xp integer;
  v_pom_xp_delta integer;
  v_raw_xp_delta integer;
  v_awarded_xp_delta integer;
  v_now timestamptz := transaction_timestamp();
begin
  if not public.is_admin() then
    raise exception 'admin_required';
  end if;

  if v_match_id is null or v_match_id = '' then
    raise exception 'match_id_required';
  end if;

  if jsonb_typeof(v_corrected_match) is distinct from 'object' then
    raise exception 'corrected_match_required';
  end if;

  if jsonb_typeof(v_affected) is distinct from 'array' then
    raise exception 'invalid_affected_applications';
  end if;

  if not (correction_plan ? 'expectedPlayerOfMatchId') then
    raise exception 'expected_player_of_match_required';
  end if;

  select *
  into v_match
  from public.matches
  where id = v_match_id
  for update;

  if not found then
    raise exception 'match_not_found';
  end if;

  if v_match.status is distinct from 'finalised' then
    raise exception 'match_not_finalised';
  end if;

  if v_expected_match_updated_at is not null and
     v_match.updated_at is distinct from v_expected_match_updated_at then
    raise exception 'stale_match';
  end if;

  if v_corrected_match->>'id' <> v_match_id then
    raise exception 'payload_match_id_mismatch';
  end if;

  if v_corrected_match->>'status' <> 'finalised' then
    raise exception 'payload_not_finalised';
  end if;

  if jsonb_typeof(v_corrected_match->'finalisedPlayerRecords') is distinct from 'array' then
    raise exception 'invalid_finalised_player_records';
  end if;

  select record.value->>'playerId'
  into v_current_player_of_match_id
  from jsonb_array_elements(
    coalesce(v_match.payload->'finalisedPlayerRecords', '[]'::jsonb)
  ) as record(value)
  where record.value->>'playerOfMatch' = 'true'
    and coalesce(record.value->>'playerId', '') <> ''
  limit 1;

  if v_current_player_of_match_id is null then
    select record.value->>'playerId'
    into v_current_player_of_match_id
    from (
      select value
      from jsonb_array_elements(
        coalesce(v_match.payload #> '{teams,teamA,playerPerformances}', '[]'::jsonb)
      )
      union all
      select value
      from jsonb_array_elements(
        coalesce(v_match.payload #> '{teams,teamB,playerPerformances}', '[]'::jsonb)
      )
    ) as record(value)
    where record.value->>'playerOfMatch' = 'true'
      and coalesce(record.value->>'playerId', '') <> ''
    limit 1;
  end if;

  if v_current_player_of_match_id is distinct from v_expected_player_of_match_id then
    raise exception 'stale_player_of_match';
  end if;

  select count(*), min(record.value->>'playerId')
  into v_corrected_pom_count, v_corrected_player_of_match_id
  from jsonb_array_elements(v_corrected_match->'finalisedPlayerRecords') as record(value)
  where record.value->>'playerOfMatch' = 'true'
    and coalesce(record.value->>'playerId', '') <> '';

  if v_corrected_pom_count > 1 then
    raise exception 'multiple_player_of_match';
  end if;

  if v_current_player_of_match_id is not distinct from v_corrected_player_of_match_id then
    if jsonb_array_length(v_affected) <> 0 then
      raise exception 'no_op_correction_has_applications';
    end if;
  else
    select count(*)
    into v_missing_required_application_count
    from (
      select v_current_player_of_match_id as player_id
      where v_current_player_of_match_id is not null
      union
      select v_corrected_player_of_match_id as player_id
      where v_corrected_player_of_match_id is not null
    ) as required_players
    where not exists (
      select 1
      from jsonb_array_elements(v_affected) as application(value)
      where application.value->>'playerId' = required_players.player_id
    );

    if v_missing_required_application_count <> 0 then
      raise exception 'missing_affected_player_application';
    end if;

    select count(*)
    into v_unexpected_application_count
    from jsonb_array_elements(v_affected) as application(value)
    where coalesce(application.value->>'playerId', '') <> coalesce(v_current_player_of_match_id, '')
      and coalesce(application.value->>'playerId', '') <> coalesce(v_corrected_player_of_match_id, '');

    if v_unexpected_application_count <> 0 then
      raise exception 'unexpected_affected_player_application';
    end if;
  end if;

  for v_application in
    select value
    from jsonb_array_elements(v_affected) as application(value)
    order by value->>'playerId'
  loop
    v_player_id := v_application->>'playerId';
    v_expected_career := v_application->'expectedCareer';
    v_next_career := v_application->'nextCareer';
    v_expected_xp_breakdown := v_application->'expectedXpBreakdown';
    v_next_xp_breakdown := v_application->'nextXpBreakdown';

    if v_player_id is null or v_player_id = '' then
      raise exception 'player_id_required';
    end if;

    if jsonb_typeof(v_expected_career) is distinct from 'object' or
       jsonb_typeof(v_next_career) is distinct from 'object' or
       jsonb_typeof(v_expected_xp_breakdown) is distinct from 'object' or
       jsonb_typeof(v_next_xp_breakdown) is distinct from 'object' then
      raise exception 'invalid_correction_application';
    end if;

    if not (v_expected_xp_breakdown ?& array[
      'playerOfMatchXP',
      'rawTotalXP',
      'awardedXP'
    ]) or not (v_next_xp_breakdown ?& array[
      'playerOfMatchXP',
      'rawTotalXP',
      'awardedXP'
    ]) then
      raise exception 'invalid_xp_breakdown';
    end if;

    select match_stat_applications.xp_breakdown
    into v_current_xp_breakdown
    from public.match_stat_applications
    where match_id = v_match_id
      and player_id = v_player_id
    for update;

    if not found then
      raise exception 'application_missing';
    end if;

    if v_current_xp_breakdown is distinct from v_expected_xp_breakdown then
      raise exception 'stale_application';
    end if;

    if (v_expected_xp_breakdown - 'playerOfMatchXP' - 'rawTotalXP' - 'awardedXP')
       is distinct from
       (v_next_xp_breakdown - 'playerOfMatchXP' - 'rawTotalXP' - 'awardedXP') then
      raise exception 'invalid_xp_component_change';
    end if;

    v_expected_pom_xp := (v_expected_xp_breakdown->>'playerOfMatchXP')::integer;
    v_next_pom_xp := (v_next_xp_breakdown->>'playerOfMatchXP')::integer;
    v_pom_xp_delta := v_next_pom_xp - v_expected_pom_xp;
    v_raw_xp_delta :=
      (v_next_xp_breakdown->>'rawTotalXP')::integer -
      (v_expected_xp_breakdown->>'rawTotalXP')::integer;
    v_awarded_xp_delta :=
      (v_next_xp_breakdown->>'awardedXP')::integer -
      (v_expected_xp_breakdown->>'awardedXP')::integer;

    if v_expected_pom_xp not in (0, 15) or v_next_pom_xp not in (0, 15) then
      raise exception 'invalid_player_of_match_xp';
    end if;

    if v_pom_xp_delta not in (-15, 0, 15) then
      raise exception 'invalid_player_of_match_xp_delta';
    end if;

    if v_raw_xp_delta <> v_pom_xp_delta then
      raise exception 'invalid_raw_xp_delta';
    end if;

    if v_pom_xp_delta = 15 and v_awarded_xp_delta not between 0 and 15 then
      raise exception 'invalid_awarded_xp_delta';
    end if;

    if v_pom_xp_delta = -15 and v_awarded_xp_delta not between -15 and 0 then
      raise exception 'invalid_awarded_xp_delta';
    end if;

    if v_pom_xp_delta = 0 and v_awarded_xp_delta <> 0 then
      raise exception 'invalid_awarded_xp_delta';
    end if;

    select *
    into v_career
    from public.player_career_stats
    where player_id = v_player_id
    for update;

    if not found then
      raise exception 'career_missing';
    end if;

    if v_career.updated_at is distinct from (v_expected_career->>'updatedAt')::timestamptz or
       v_career.total_xp is distinct from (v_expected_career->>'totalXP')::integer or
       v_career.level is distinct from (v_expected_career->>'level')::integer then
      raise exception 'stale_career';
    end if;

    update public.player_career_stats
    set
      total_xp = (v_next_career->>'totalXP')::integer,
      level = (v_next_career->>'level')::integer
    where player_id = v_player_id;

    update public.match_stat_applications
    set
      xp_breakdown = v_next_xp_breakdown,
      applied_at = coalesce((v_application->>'correctedAt')::timestamptz, v_now)
    where match_id = v_match_id
      and player_id = v_player_id;
  end loop;

  update public.matches
  set
    payload = v_corrected_match,
    updated_at = v_now,
    updated_by = auth.uid()
  where id = v_match_id;

  return jsonb_build_object(
    'ok', true,
    'match_id', v_match_id,
    'corrected_at', v_now
  );
end;
$$;

revoke all on function public.correct_player_of_match_atomic(jsonb) from public;
revoke all on function public.correct_player_of_match_atomic(jsonb) from anon;
grant execute on function public.correct_player_of_match_atomic(jsonb) to authenticated;
