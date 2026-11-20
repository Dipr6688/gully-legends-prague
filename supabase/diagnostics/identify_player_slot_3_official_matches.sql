-- SELECT-only diagnostic for identifying official matches where MAVERICK
-- (player-slot-3) participated. Run manually in the Supabase SQL Editor.
-- This file performs no writes and intentionally does not guess transfer IDs.

with candidate_matches as (
  select
    m.*,
    jsonb_path_query_first(
      m.payload,
      '$.finalisedPlayerRecords[*] ? (@.playerId == "player-slot-3")'
    ) as finalised_record
  from public.matches as m
  where m.status = 'finalised'
    and m.is_demo = false
    and m.deleted_at is null
    and m.payload::text like '%"player-slot-3"%'
)
select
  id as match_id,
  match_sequence as game_number,
  match_date,
  name as match_name,
  status,
  is_demo,
  finalised_at,
  stats_applied_at,
  payload #>> '{teams,teamA,teamName}' as team_a_name,
  payload #> '{teams,teamA,playerIds}' as team_a_player_ids,
  payload #>> '{teams,teamB,teamName}' as team_b_name,
  payload #> '{teams,teamB,playerIds}' as team_b_player_ids,
  payload->>'sharedPlayerId' as shared_player_id,
  payload->'everSharedPlayerIds' as ever_shared_player_ids,
  payload->'fieldingHelperIds' as fielding_helper_ids,
  finalised_record->>'teamId' as represented_team_id,
  finalised_record->>'played' as played,
  finalised_record->>'didBat' as did_bat,
  finalised_record->>'runs' as runs,
  finalised_record->>'wasOut' as was_out,
  finalised_record->>'wickets' as wickets,
  finalised_record->>'catches' as catches,
  finalised_record->>'runOuts' as run_outs,
  finalised_record->>'stumpings' as stumpings,
  finalised_record->>'playerOfMatch' as player_of_match,
  finalised_record->'xpBreakdown'->>'awardedXP' as awarded_xp,
  jsonb_path_query_array(
    payload,
    '$.teams.*.playerPerformances[*] ? (@.playerId == "player-slot-3")'
  ) as team_performance_records,
  jsonb_path_query_array(
    payload,
    '$.innings.*.battingPerformances[*] ? (@.playerId == "player-slot-3")'
  ) as innings_batting_records,
  jsonb_path_query_array(
    payload,
    '$.teams.*.bowlingOvers[*] ? (@.bowlerId == "player-slot-3" || @.dismissals[*].dismissedBatterId == "player-slot-3" || @.dismissals[*].creditedBowlerId == "player-slot-3" || @.dismissals[*].fielderId == "player-slot-3")'
  ) as bowling_and_dismissal_records,
  jsonb_path_query_array(
    payload,
    '$.quickScoring.inningsAEvents[*] ? (@.strikerId == "player-slot-3" || @.nonStrikerId == "player-slot-3" || @.bowlerId == "player-slot-3" || @.wicket.dismissedPlayerId == "player-slot-3" || @.wicket.fielderId == "player-slot-3" || @.wicket.assistingFielderId == "player-slot-3" || @.wicket.newBatterId == "player-slot-3" || @.wicket.nextStrikerId == "player-slot-3" || @.wicket.nextNonStrikerId == "player-slot-3")'
  ) || jsonb_path_query_array(
    payload,
    '$.quickScoring.inningsBEvents[*] ? (@.strikerId == "player-slot-3" || @.nonStrikerId == "player-slot-3" || @.bowlerId == "player-slot-3" || @.wicket.dismissedPlayerId == "player-slot-3" || @.wicket.fielderId == "player-slot-3" || @.wicket.assistingFielderId == "player-slot-3" || @.wicket.newBatterId == "player-slot-3" || @.wicket.nextStrikerId == "player-slot-3" || @.wicket.nextNonStrikerId == "player-slot-3")'
  ) as quick_scoring_events,
  jsonb_path_query_array(
    payload,
    '$.rosterTransitions[*] ? (@.teamAPlayerIds[*] == "player-slot-3" || @.teamBPlayerIds[*] == "player-slot-3" || @.sharedPlayerId == "player-slot-3" || @.fieldingHelperIds[*] == "player-slot-3")'
  ) as roster_transitions,
  finalised_record
from candidate_matches
order by match_date, match_sequence, id;

select
  application.match_id,
  match_row.match_sequence as game_number,
  match_row.match_date,
  application.player_id,
  application.idempotency_key,
  application.xp_breakdown->>'awardedXP' as awarded_xp,
  application.applied_at,
  application.finalisation_version
from public.match_stat_applications as application
join public.matches as match_row on match_row.id = application.match_id
where application.player_id = 'player-slot-3'
order by match_row.match_date, match_row.match_sequence, application.match_id;

select
  id as crown_id,
  month_key,
  version,
  status,
  batting,
  bowling,
  fielding,
  crowned_at,
  revoked_at
from public.monthly_beast_crowns
where is_demo = false
  and (
    batting::text like '%"player-slot-3"%' or
    bowling::text like '%"player-slot-3"%' or
    fielding::text like '%"player-slot-3"%'
  )
order by month_key, version;

select
  story.match_id,
  match_row.match_sequence as game_number,
  match_row.match_date,
  story.title,
  story.story_text,
  story.story_version,
  story.story_signature,
  story.generated_at
from public.match_stories as story
join public.matches as match_row on match_row.id = story.match_id
where match_row.status = 'finalised'
  and match_row.is_demo = false
  and match_row.deleted_at is null
  and match_row.payload::text like '%"player-slot-3"%'
order by match_row.match_date, match_row.match_sequence, story.match_id;

select
  apk_import.id as import_id,
  apk_import.offline_match_id,
  apk_import.review_status,
  apk_import.finalised_match_id,
  match_row.match_sequence as game_number,
  match_row.match_date,
  apk_import.raw_payload,
  apk_import.derived_match_payload,
  apk_import.review_payload,
  apk_import.review_derived_match_payload
from public.apk_match_imports as apk_import
left join public.matches as match_row on match_row.id = apk_import.finalised_match_id
where apk_import.finalised_match_id in (
    select id
    from public.matches
    where status = 'finalised'
      and is_demo = false
      and deleted_at is null
      and payload::text like '%"player-slot-3"%'
  )
  or apk_import.raw_payload::text like '%"player-slot-3"%'
  or coalesce(apk_import.derived_match_payload::text, '') like '%"player-slot-3"%'
  or coalesce(apk_import.review_payload::text, '') like '%"player-slot-3"%'
  or coalesce(apk_import.review_derived_match_payload::text, '') like '%"player-slot-3"%'
order by match_row.match_date, match_row.match_sequence, apk_import.id;
