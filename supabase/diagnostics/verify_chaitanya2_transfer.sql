-- SELECT-only post-migration verification for the approved MAVERICK transfer.
-- This file performs no writes. The supplied IDs are exact official
-- public.matches IDs; APK source rows are joined through finalised_match_id.

with approved_match_ids(match_id) as (
  values
    ('apk-match-bb11ff68-faab-4fde-b41a-17f026642e71'),
    ('apk-match-f6017372-c6a3-40ee-b389-250545188b17'),
    ('apk-match-c085e45f-d735-45c2-af78-b91e3221419b'),
    ('apk-match-0536c6ad-d9ab-450e-b0a1-6f820c64944a'),
    ('apk-match-1d01a86f-cda4-42fa-9950-364981ed5d14'),
    ('apk-match-a67f35b8-bf7b-4da3-b3d6-385de8b24c0d'),
    ('apk-match-b9b53880-1ae7-472b-8624-4eb39a3a7bc9'),
    ('apk-match-cf138376-f06a-4f20-b860-c2b70f85a7f9')
)
select
  approved.match_id as approved_match_id,
  apk_import.id as import_id,
  apk_import.review_status,
  apk_import.finalised_match_id as official_match_id,
  official_match.match_sequence as game_number,
  official_match.match_date,
  official_match.status,
  official_match.is_demo,
  official_match.finalised_at,
  official_match.stats_applied_at,
  official_match.payload::text like '%"player-slot-3"%' as official_still_has_maverick_id,
  official_match.payload::text like '%"chaitanya-2"%' as official_has_chaitanya2_id,
  jsonb_path_query_array(
    official_match.payload,
    '$.finalisedPlayerRecords[*] ? (@.playerId == "chaitanya-2")'
  ) as transferred_finalised_record,
  jsonb_path_query_array(
    official_match.payload,
    '$.teams.*.playerPerformances[*] ? (@.playerId == "chaitanya-2")'
  ) as transferred_team_performances,
  jsonb_path_query_array(
    official_match.payload,
    '$.quickScoring.inningsAEvents[*] ? (@.strikerId == "chaitanya-2" || @.nonStrikerId == "chaitanya-2" || @.bowlerId == "chaitanya-2" || @.wicket.dismissedPlayerId == "chaitanya-2" || @.wicket.fielderId == "chaitanya-2" || @.wicket.assistingFielderId == "chaitanya-2")'
  ) || jsonb_path_query_array(
    official_match.payload,
    '$.quickScoring.inningsBEvents[*] ? (@.strikerId == "chaitanya-2" || @.nonStrikerId == "chaitanya-2" || @.bowlerId == "chaitanya-2" || @.wicket.dismissedPlayerId == "chaitanya-2" || @.wicket.fielderId == "chaitanya-2" || @.wicket.assistingFielderId == "chaitanya-2")'
  ) as transferred_quick_scoring_events,
  jsonb_path_query_array(
    official_match.payload,
    '$.rosterTransitions[*] ? (@.teamAPlayerIds[*] == "chaitanya-2" || @.teamBPlayerIds[*] == "chaitanya-2" || @.sharedPlayerId == "chaitanya-2" || @.fieldingHelperIds[*] == "chaitanya-2")'
  ) as transferred_roster_transitions
from approved_match_ids as approved
left join public.matches as official_match on official_match.id = approved.match_id
left join public.apk_match_imports as apk_import
  on apk_import.source = 'apk'
  and apk_import.finalised_match_id = approved.match_id
order by approved.match_id;

with protected_match_ids(match_id) as (
  values
    ('apk-match-56bf9697-2dd4-4f39-8710-47d7a47fcfff'),
    ('apk-match-2e62a6c9-8269-43df-96ef-0d490feef676'),
    ('apk-match-827d6036-eb7d-4c2b-9379-a78a20bcf20f')
)
select
  protected.match_id as protected_match_id,
  apk_import.finalised_match_id as official_match_id,
  official_match.match_sequence as game_number,
  official_match.match_date,
  official_match.status,
  official_match.payload::text like '%"player-slot-3"%' as still_has_maverick_id,
  official_match.payload::text like '%"chaitanya-2"%' as unexpectedly_has_chaitanya2_id,
  jsonb_path_query_array(
    official_match.payload,
    '$.finalisedPlayerRecords[*] ? (@.playerId == "player-slot-3")'
  ) as protected_finalised_record
from protected_match_ids as protected
left join public.matches as official_match on official_match.id = protected.match_id
left join public.apk_match_imports as apk_import
  on apk_import.source = 'apk'
  and apk_import.finalised_match_id = protected.match_id
order by protected.match_id;

select
  id,
  slug,
  display_name,
  card_title,
  is_active
from public.players
where id in ('chaitanya', 'chaitanya-2', 'player-slot-3')
order by id;

with approved_match_ids(match_id) as (
  values
    ('apk-match-bb11ff68-faab-4fde-b41a-17f026642e71'),
    ('apk-match-f6017372-c6a3-40ee-b389-250545188b17'),
    ('apk-match-c085e45f-d735-45c2-af78-b91e3221419b'),
    ('apk-match-0536c6ad-d9ab-450e-b0a1-6f820c64944a'),
    ('apk-match-1d01a86f-cda4-42fa-9950-364981ed5d14'),
    ('apk-match-a67f35b8-bf7b-4da3-b3d6-385de8b24c0d'),
    ('apk-match-b9b53880-1ae7-472b-8624-4eb39a3a7bc9'),
    ('apk-match-cf138376-f06a-4f20-b860-c2b70f85a7f9')
)
select
  application.match_id,
  application.player_id,
  application.idempotency_key,
  application.xp_breakdown->>'awardedXP' as awarded_xp,
  application.applied_at,
  application.finalisation_version
from public.match_stat_applications as application
join approved_match_ids as approved on approved.match_id = application.match_id
where application.player_id in ('player-slot-3', 'chaitanya-2')
order by application.match_id, application.player_id;

select
  match_id,
  player_id,
  count(*) as ledger_row_count,
  count(distinct idempotency_key) as unique_idempotency_keys
from public.match_stat_applications
group by match_id, player_id
having count(*) <> 1 or count(distinct idempotency_key) <> 1
order by match_id, player_id;

with official_performances as (
  select
    record.value->>'playerId' as player_id,
    count(*) filter (where record.value->>'played' = 'true')::integer as matches,
    count(*) filter (
      where record.value->>'played' = 'true'
        and record.value->>'didBat' = 'true'
    )::integer as innings_batted,
    coalesce(sum(
      case when record.value->>'didBat' = 'true'
        then coalesce(nullif(record.value->>'runs', '')::integer, 0)
        else 0
      end
    ), 0)::integer as runs,
    count(*) filter (
      where record.value->>'didBat' = 'true'
        and coalesce(nullif(record.value->>'runs', '')::integer, 0) between 50 and 99
    )::integer as fifties,
    count(*) filter (
      where record.value->>'didBat' = 'true'
        and coalesce(nullif(record.value->>'runs', '')::integer, 0) >= 100
    )::integer as centuries,
    count(*) filter (
      where record.value->>'didBat' = 'true'
        and record.value->>'wasOut' = 'true'
        and coalesce(nullif(record.value->>'runs', '')::integer, 0) = 0
    )::integer as dismissed_ducks,
    coalesce(sum((record.value->>'wickets')::integer), 0)::integer as wickets,
    coalesce(sum((record.value->>'catches')::integer), 0)::integer as catches,
    coalesce(sum((record.value->>'runOuts')::integer), 0)::integer as run_outs,
    coalesce(sum(coalesce((record.value->>'stumpings')::integer, 0)), 0)::integer as stumpings,
    coalesce(sum((record.value->>'hatTricks')::integer), 0)::integer as hat_tricks,
    count(*) filter (where (record.value->>'wickets')::integer >= 3)::integer as three_wicket_hauls
  from public.matches as official_match
  cross join lateral jsonb_array_elements(
    official_match.payload->'finalisedPlayerRecords'
  ) as record(value)
  where official_match.status = 'finalised'
    and official_match.is_demo = false
    and official_match.deleted_at is null
    and record.value->>'playerId' in ('player-slot-3', 'chaitanya-2')
    and record.value->>'played' = 'true'
  group by record.value->>'playerId'
), bowling_totals as (
  select
    bowling_over.value->>'bowlerId' as player_id,
    count(distinct official_match.id)::integer as matches_bowled,
    count(*)::integer as completed_overs,
    coalesce(sum(coalesce(nullif(bowling_over.value->>'runsConceded', '')::integer, 0)), 0)::integer as total_runs_conceded
  from public.matches as official_match
  cross join lateral (
    select team_over.value
    from jsonb_array_elements(
      coalesce(official_match.payload #> '{teams,teamA,bowlingOvers}', '[]'::jsonb)
    ) as team_over(value)
    union all
    select team_over.value
    from jsonb_array_elements(
      coalesce(official_match.payload #> '{teams,teamB,bowlingOvers}', '[]'::jsonb)
    ) as team_over(value)
  ) as bowling_over
  where official_match.status = 'finalised'
    and official_match.is_demo = false
    and official_match.deleted_at is null
    and bowling_over.value->>'bowlerId' in ('player-slot-3', 'chaitanya-2')
  group by bowling_over.value->>'bowlerId'
)
select
  career.player_id,
  career.matches as stored_matches,
  coalesce(performance.matches, 0) as derived_matches,
  career.innings_batted as stored_innings_batted,
  coalesce(performance.innings_batted, 0) as derived_innings_batted,
  career.runs as stored_runs,
  coalesce(performance.runs, 0) as derived_runs,
  career.wickets as stored_wickets,
  coalesce(performance.wickets, 0) as derived_wickets,
  career.catches as stored_catches,
  coalesce(performance.catches, 0) as derived_catches,
  career.run_outs as stored_run_outs,
  coalesce(performance.run_outs, 0) as derived_run_outs,
  career.stumpings as stored_stumpings,
  coalesce(performance.stumpings, 0) as derived_stumpings,
  career.matches_bowled as stored_matches_bowled,
  coalesce(bowling.matches_bowled, 0) as derived_matches_bowled,
  career.completed_overs as stored_completed_overs,
  coalesce(bowling.completed_overs, 0) as derived_completed_overs,
  career.total_runs_conceded as stored_runs_conceded,
  coalesce(bowling.total_runs_conceded, 0) as derived_runs_conceded,
  career.total_xp,
  career.level,
  coalesce((
    select sum((application.xp_breakdown->>'awardedXP')::integer)
    from public.match_stat_applications as application
    where application.player_id = career.player_id
  ), 0) as ledger_awarded_xp_sum
from public.player_career_stats as career
left join official_performances as performance on performance.player_id = career.player_id
left join bowling_totals as bowling on bowling.player_id = career.player_id
where career.player_id in ('player-slot-3', 'chaitanya-2')
order by career.player_id;

with approved_match_ids(match_id) as (
  values
    ('apk-match-bb11ff68-faab-4fde-b41a-17f026642e71'),
    ('apk-match-f6017372-c6a3-40ee-b389-250545188b17'),
    ('apk-match-c085e45f-d735-45c2-af78-b91e3221419b'),
    ('apk-match-0536c6ad-d9ab-450e-b0a1-6f820c64944a'),
    ('apk-match-1d01a86f-cda4-42fa-9950-364981ed5d14'),
    ('apk-match-a67f35b8-bf7b-4da3-b3d6-385de8b24c0d'),
    ('apk-match-b9b53880-1ae7-472b-8624-4eb39a3a7bc9'),
    ('apk-match-cf138376-f06a-4f20-b860-c2b70f85a7f9')
)
select
  count(*) as approved_ledger_rows,
  count(*) filter (where application.player_id = 'chaitanya-2') as chaitanya2_rows,
  count(*) filter (where application.player_id = 'player-slot-3') as remaining_maverick_rows,
  coalesce(sum((application.xp_breakdown->>'awardedXP')::integer), 0) as conserved_awarded_xp
from approved_match_ids as approved
join public.match_stat_applications as application
  on application.match_id = approved.match_id
where application.player_id in ('player-slot-3', 'chaitanya-2');

select
  count(*) as november_official_matches_for_chaitanya2,
  coalesce(sum(coalesce(nullif(record.value->>'runs', '')::integer, 0)), 0) as november_runs,
  coalesce(sum((record.value->>'wickets')::integer), 0) as november_wickets,
  coalesce(sum((record.value->>'catches')::integer), 0) as november_catches,
  coalesce(sum((record.value->>'runOuts')::integer), 0) as november_run_outs,
  coalesce(sum(coalesce((record.value->>'stumpings')::integer, 0)), 0) as november_stumpings
from public.matches as official_match
cross join lateral jsonb_array_elements(
  official_match.payload->'finalisedPlayerRecords'
) as record(value)
where official_match.status = 'finalised'
  and official_match.is_demo = false
  and official_match.deleted_at is null
  and official_match.match_date >= date '2026-11-01'
  and official_match.match_date < date '2026-12-01'
  and record.value->>'playerId' = 'chaitanya-2'
  and record.value->>'played' = 'true';

select
  id as crown_id,
  month_key,
  version,
  status,
  batting,
  bowling,
  fielding
from public.monthly_beast_crowns
where is_demo = false
  and month_key = '2026-11'
order by version;

with approved_match_ids(match_id) as (
  values
    ('apk-match-bb11ff68-faab-4fde-b41a-17f026642e71'),
    ('apk-match-f6017372-c6a3-40ee-b389-250545188b17'),
    ('apk-match-c085e45f-d735-45c2-af78-b91e3221419b'),
    ('apk-match-0536c6ad-d9ab-450e-b0a1-6f820c64944a'),
    ('apk-match-1d01a86f-cda4-42fa-9950-364981ed5d14'),
    ('apk-match-a67f35b8-bf7b-4da3-b3d6-385de8b24c0d'),
    ('apk-match-b9b53880-1ae7-472b-8624-4eb39a3a7bc9'),
    ('apk-match-cf138376-f06a-4f20-b860-c2b70f85a7f9')
)
select
  apk_import.offline_match_id,
  apk_import.finalised_match_id,
  apk_import.sync_version,
  apk_import.raw_payload::text like '%"player-slot-3"%' as raw_source_preserves_maverick_id,
  apk_import.derived_match_payload::text like '%"player-slot-3"%' as source_derived_preserves_maverick_id,
  apk_import.review_payload::text like '%"player-slot-3"%' as review_payload_preserves_original_review,
  apk_import.review_derived_match_payload::text like '%"player-slot-3"%' as review_derived_preserves_original_review,
  official_match.payload::text like '%"chaitanya-2"%' as official_match_has_corrected_identity
from approved_match_ids as approved
join public.apk_match_imports as apk_import
  on apk_import.source = 'apk'
  and apk_import.finalised_match_id = approved.match_id
join public.matches as official_match on official_match.id = approved.match_id
order by apk_import.offline_match_id;

with approved_match_ids(match_id) as (
  values
    ('apk-match-bb11ff68-faab-4fde-b41a-17f026642e71'),
    ('apk-match-f6017372-c6a3-40ee-b389-250545188b17'),
    ('apk-match-c085e45f-d735-45c2-af78-b91e3221419b'),
    ('apk-match-0536c6ad-d9ab-450e-b0a1-6f820c64944a'),
    ('apk-match-1d01a86f-cda4-42fa-9950-364981ed5d14'),
    ('apk-match-a67f35b8-bf7b-4da3-b3d6-385de8b24c0d'),
    ('apk-match-b9b53880-1ae7-472b-8624-4eb39a3a7bc9'),
    ('apk-match-cf138376-f06a-4f20-b860-c2b70f85a7f9')
)
select
  apk_import.offline_match_id,
  story.match_id,
  story.title,
  story.story_text,
  story.story_text ilike '%MAVERICK%' as mentions_maverick_and_needs_manual_story_review
from approved_match_ids as approved
join public.apk_match_imports as apk_import
  on apk_import.source = 'apk'
  and apk_import.finalised_match_id = approved.match_id
left join public.match_stories as story on story.match_id = approved.match_id
order by apk_import.offline_match_id;
