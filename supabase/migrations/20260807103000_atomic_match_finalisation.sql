create or replace function public.finalize_match_atomic(finalisation_plan jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match_id text := finalisation_plan->>'matchId';
  v_expected_match_updated_at timestamptz :=
    nullif(finalisation_plan->>'expectedMatchUpdatedAt', '')::timestamptz;
  v_final_match jsonb := finalisation_plan->'finalMatch';
  v_applications jsonb := coalesce(finalisation_plan->'applications', '[]'::jsonb);
  v_application jsonb;
  v_expected_career jsonb;
  v_next_career jsonb;
  v_progression jsonb;
  v_player_id text;
  v_now timestamptz := transaction_timestamp();
  v_match public.matches%rowtype;
  v_career public.player_career_stats%rowtype;
  v_missing_application_count integer;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  if v_match_id is null or btrim(v_match_id) = '' then
    raise exception 'missing_match_id';
  end if;

  if v_final_match is null or jsonb_typeof(v_final_match) <> 'object' then
    raise exception 'invalid_final_match_payload';
  end if;

  select *
  into v_match
  from public.matches
  where id = v_match_id
  for update;

  if not found then
    raise exception 'match_not_found';
  end if;

  if v_match.deleted_at is not null then
    raise exception 'match_deleted';
  end if;

  if v_match.status = 'finalised' and v_match.stats_applied_at is not null then
    select count(*)
    into v_missing_application_count
    from jsonb_array_elements(v_applications) as application(value)
    where not exists (
      select 1
      from public.match_stat_applications
      where match_id = v_match_id
        and player_id = application.value->>'playerId'
        and idempotency_key = application.value->'progression'->>'idempotencyKey'
    );

    if v_missing_application_count = 0 then
      return jsonb_build_object(
        'ok', true,
        'already_applied', true,
        'match_id', v_match.id,
        'finalised_at', v_match.finalised_at,
        'stats_applied_at', v_match.stats_applied_at
      );
    end if;

    raise exception 'already_applied_incomplete';
  end if;

  if v_match.status = 'finalised' or v_match.stats_applied_at is not null then
    raise exception 'already_applied_conflict';
  end if;

  if v_expected_match_updated_at is not null and
     v_match.updated_at <> v_expected_match_updated_at then
    raise exception 'stale_match';
  end if;

  if v_final_match->>'id' <> v_match_id then
    raise exception 'payload_match_id_mismatch';
  end if;

  if v_final_match->>'status' <> 'finalised' then
    raise exception 'payload_not_finalised';
  end if;

  for v_application in
    select value
    from jsonb_array_elements(v_applications) as application(value)
    order by value->>'playerId'
  loop
    v_player_id := v_application->>'playerId';
    v_expected_career := v_application->'expectedCareer';
    v_next_career := v_application->'nextCareer';
    v_progression := v_application->'progression';

    if v_player_id is null or btrim(v_player_id) = '' then
      raise exception 'missing_player_id';
    end if;

    select *
    into v_career
    from public.player_career_stats
    where player_id = v_player_id
    for update;

    if not found then
      raise exception 'career_missing';
    end if;

    if v_career.updated_at <> (v_expected_career->>'updatedAt')::timestamptz or
       v_career.matches <> (v_expected_career->>'matches')::integer or
       v_career.innings_batted <> (v_expected_career->>'inningsBatted')::integer or
       v_career.runs <> (v_expected_career->>'runs')::integer or
       v_career.fifties <> (v_expected_career->>'fifties')::integer or
       v_career.centuries <> (v_expected_career->>'centuries')::integer or
       v_career.dismissed_ducks <> (v_expected_career->>'dismissedDucks')::integer or
       v_career.wickets <> (v_expected_career->>'wickets')::integer or
       v_career.catches <> (v_expected_career->>'catches')::integer or
       v_career.run_outs <> (v_expected_career->>'runOuts')::integer or
       v_career.stumpings <> (v_expected_career->>'stumpings')::integer or
       v_career.hat_tricks <> (v_expected_career->>'hatTricks')::integer or
       v_career.three_wicket_hauls <> (v_expected_career->>'threeWicketHauls')::integer or
       v_career.matches_bowled <> (v_expected_career->>'matchesBowled')::integer or
       v_career.completed_overs <> (v_expected_career->>'completedOvers')::integer or
       v_career.total_runs_conceded <> (v_expected_career->>'totalRunsConceded')::integer or
       v_career.total_xp <> (v_expected_career->>'totalXP')::integer or
       v_career.level <> (v_expected_career->>'level')::integer then
      raise exception 'stale_career';
    end if;

    update public.player_career_stats
    set
      matches = (v_next_career->>'matches')::integer,
      innings_batted = (v_next_career->>'inningsBatted')::integer,
      runs = (v_next_career->>'runs')::integer,
      fifties = (v_next_career->>'fifties')::integer,
      centuries = (v_next_career->>'centuries')::integer,
      dismissed_ducks = (v_next_career->>'dismissedDucks')::integer,
      wickets = (v_next_career->>'wickets')::integer,
      catches = (v_next_career->>'catches')::integer,
      run_outs = (v_next_career->>'runOuts')::integer,
      stumpings = (v_next_career->>'stumpings')::integer,
      hat_tricks = (v_next_career->>'hatTricks')::integer,
      three_wicket_hauls = (v_next_career->>'threeWicketHauls')::integer,
      matches_bowled = (v_next_career->>'matchesBowled')::integer,
      completed_overs = (v_next_career->>'completedOvers')::integer,
      total_runs_conceded = (v_next_career->>'totalRunsConceded')::integer,
      total_xp = (v_next_career->>'totalXP')::integer,
      level = (v_next_career->>'level')::integer
    where player_id = v_player_id;
  end loop;

  for v_application in
    select value
    from jsonb_array_elements(v_applications) as application(value)
    order by value->>'playerId'
  loop
    v_progression := v_application->'progression';

    insert into public.match_stat_applications (
      match_id,
      player_id,
      idempotency_key,
      xp_breakdown,
      applied_at,
      finalisation_version
    )
    values (
      v_match_id,
      v_progression->>'playerId',
      v_progression->>'idempotencyKey',
      v_progression->'xpBreakdown',
      coalesce((v_progression->>'progressionAppliedAt')::timestamptz, v_now),
      coalesce((v_progression->>'appliedFinalisationVersion')::integer, 1)
    );
  end loop;

  update public.matches
  set
    match_date = (v_final_match->>'matchDate')::date,
    start_time = nullif(v_final_match->>'startTime', '')::time,
    match_sequence = nullif(v_final_match->>'matchNumber', '')::integer,
    name = v_final_match->>'matchName',
    venue = v_final_match->>'venue',
    status = 'finalised',
    payload = v_final_match,
    finalised_at = v_now,
    stats_applied_at = v_now,
    updated_at = v_now,
    updated_by = auth.uid()
  where id = v_match_id;

  return jsonb_build_object(
    'ok', true,
    'already_applied', false,
    'match_id', v_match_id,
    'finalised_at', v_now,
    'stats_applied_at', v_now
  );
end;
$$;

revoke all on function public.finalize_match_atomic(jsonb) from public;
revoke all on function public.finalize_match_atomic(jsonb) from anon;
grant execute on function public.finalize_match_atomic(jsonb) to authenticated;
