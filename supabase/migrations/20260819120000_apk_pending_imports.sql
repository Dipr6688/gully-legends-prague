create table if not exists public.apk_match_imports (
  id uuid primary key default gen_random_uuid(),
  offline_match_id text not null,
  source text not null default 'apk',
  is_demo boolean not null default false,
  sync_version integer not null default 1,
  review_status text not null default 'pending_review',
  started_at timestamptz,
  completed_at timestamptz,
  match_date date,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  raw_payload jsonb not null,
  derived_match_payload jsonb,
  validation_result jsonb,
  finalised_match_id text references public.matches(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint apk_match_imports_source_not_empty
    check (btrim(source) <> ''),
  constraint apk_match_imports_offline_match_id_not_empty
    check (btrim(offline_match_id) <> ''),
  constraint apk_match_imports_sync_version_positive
    check (sync_version > 0),
  constraint apk_match_imports_review_status_check
    check (review_status in ('pending_review', 'correction_pending', 'finalised', 'rejected')),
  constraint apk_match_imports_raw_payload_is_object
    check (jsonb_typeof(raw_payload) = 'object'),
  constraint apk_match_imports_derived_payload_is_object
    check (derived_match_payload is null or jsonb_typeof(derived_match_payload) = 'object'),
  constraint apk_match_imports_validation_result_is_object
    check (validation_result is null or jsonb_typeof(validation_result) = 'object'),
  constraint apk_match_imports_completed_after_started
    check (completed_at is null or started_at is null or completed_at >= started_at),
  constraint apk_match_imports_finalised_link_required
    check (review_status <> 'finalised' or finalised_match_id is not null)
);

create unique index if not exists apk_match_imports_source_offline_match_id_idx
  on public.apk_match_imports (source, offline_match_id);

create index if not exists apk_match_imports_review_status_idx
  on public.apk_match_imports (review_status);

create index if not exists apk_match_imports_match_date_idx
  on public.apk_match_imports (match_date);

create index if not exists apk_match_imports_started_at_idx
  on public.apk_match_imports (started_at);

create index if not exists apk_match_imports_finalised_match_id_idx
  on public.apk_match_imports (finalised_match_id);

drop trigger if exists set_apk_match_imports_updated_at on public.apk_match_imports;
create trigger set_apk_match_imports_updated_at
before update on public.apk_match_imports
for each row execute function public.set_updated_at();

alter table public.apk_match_imports enable row level security;

grant select, insert, update on public.apk_match_imports to authenticated;
revoke delete on public.apk_match_imports from authenticated;

drop policy if exists "Admins can read APK match imports" on public.apk_match_imports;
create policy "Admins can read APK match imports"
on public.apk_match_imports
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can insert APK match imports" on public.apk_match_imports;
create policy "Admins can insert APK match imports"
on public.apk_match_imports
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update APK match imports" on public.apk_match_imports;
create policy "Admins can update APK match imports"
on public.apk_match_imports
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete APK match imports" on public.apk_match_imports;

create or replace function public.upsert_apk_match_import_atomic(
  import_payload jsonb,
  derived_payload jsonb,
  import_validation_result jsonb,
  import_match_date date,
  import_source text default 'apk'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source text := coalesce(nullif(btrim(import_source), ''), 'apk');
  v_offline_match_id text := import_payload->>'offlineMatchId';
  v_sync_version integer := (import_payload->>'syncVersion')::integer;
  v_existing public.apk_match_imports%rowtype;
  v_row public.apk_match_imports%rowtype;
  v_changed boolean := false;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  if import_payload is null or jsonb_typeof(import_payload) is distinct from 'object' then
    raise exception 'invalid_import_payload';
  end if;

  if derived_payload is not null and jsonb_typeof(derived_payload) is distinct from 'object' then
    raise exception 'invalid_derived_payload';
  end if;

  if import_validation_result is not null and
     jsonb_typeof(import_validation_result) is distinct from 'object' then
    raise exception 'invalid_validation_result';
  end if;

  if v_offline_match_id is null or btrim(v_offline_match_id) = '' then
    raise exception 'missing_offline_match_id';
  end if;

  if v_sync_version is null or v_sync_version <= 0 then
    raise exception 'invalid_sync_version';
  end if;

  insert into public.apk_match_imports (
    source,
    offline_match_id,
    is_demo,
    sync_version,
    review_status,
    started_at,
    completed_at,
    match_date,
    raw_payload,
    derived_match_payload,
    validation_result,
    created_by,
    updated_by
  )
  values (
    v_source,
    v_offline_match_id,
    coalesce((import_payload->>'isDemo')::boolean, false),
    v_sync_version,
    'pending_review',
    nullif(import_payload->>'startedAt', '')::timestamptz,
    nullif(import_payload->>'completedAt', '')::timestamptz,
    import_match_date,
    import_payload,
    derived_payload,
    coalesce(import_validation_result, '{}'::jsonb),
    auth.uid(),
    auth.uid()
  )
  on conflict (source, offline_match_id) do update
  set
    is_demo = excluded.is_demo,
    sync_version = excluded.sync_version,
    review_status = case
      when public.apk_match_imports.review_status = 'finalised'
        then 'correction_pending'
      else 'pending_review'
    end,
    started_at = excluded.started_at,
    completed_at = excluded.completed_at,
    match_date = excluded.match_date,
    raw_payload = excluded.raw_payload,
    derived_match_payload = excluded.derived_match_payload,
    validation_result = excluded.validation_result,
    updated_by = auth.uid()
  where public.apk_match_imports.sync_version < excluded.sync_version
  returning *
  into v_row;

  if found then
    v_changed := true;
  else
    select *
    into v_existing
    from public.apk_match_imports
    where source = v_source
      and offline_match_id = v_offline_match_id;

    if not found then
      raise exception 'apk_import_upsert_lost_conflict';
    end if;

    v_row := v_existing;
  end if;

  return jsonb_build_object(
    'changed', v_changed,
    'ignored', not v_changed,
    'import_record', to_jsonb(v_row)
  );
end;
$$;

revoke all on function public.upsert_apk_match_import_atomic(jsonb, jsonb, jsonb, date, text) from public;
revoke all on function public.upsert_apk_match_import_atomic(jsonb, jsonb, jsonb, date, text) from anon;
grant execute on function public.upsert_apk_match_import_atomic(jsonb, jsonb, jsonb, date, text) to authenticated;

create or replace function public.finalize_apk_import_atomic(
  apk_import_id uuid,
  finalisation_plan jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import public.apk_match_imports%rowtype;
  v_existing_final_match public.matches%rowtype;
  v_finalisation_plan jsonb := finalisation_plan;
  v_final_match jsonb := finalisation_plan->'finalMatch';
  v_in_progress_match jsonb;
  v_match_id text := finalisation_plan->>'matchId';
  v_match_date date;
  v_match_number integer;
  v_inserted_match public.matches%rowtype;
  v_earlier_import_id uuid;
  v_finalisation_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  select *
  into v_import
  from public.apk_match_imports
  where id = apk_import_id
  for update;

  if not found then
    raise exception 'apk_import_not_found';
  end if;

  if v_import.review_status = 'finalised' and v_import.finalised_match_id is not null then
    select *
    into v_existing_final_match
    from public.matches
    where id = v_import.finalised_match_id
    for update;

    if found and
       v_existing_final_match.status = 'finalised' and
       v_existing_final_match.stats_applied_at is not null then
      return jsonb_build_object(
        'ok', true,
        'already_applied', true,
        'match_id', v_existing_final_match.id,
        'match_number', v_existing_final_match.match_sequence,
        'finalised_at', v_existing_final_match.finalised_at,
        'stats_applied_at', v_existing_final_match.stats_applied_at
      );
    end if;

    raise exception 'invalid_finalised_apk_import';
  end if;

  if v_import.review_status <> 'pending_review' then
    raise exception 'apk_import_not_pending_review';
  end if;

  if v_import.is_demo then
    raise exception 'demo_apk_import_not_allowed';
  end if;

  if v_import.finalised_match_id is not null then
    raise exception 'apk_import_finalised_link_conflict';
  end if;

  if v_match_id is null or btrim(v_match_id) = '' then
    raise exception 'missing_match_id';
  end if;

  if v_final_match is null or jsonb_typeof(v_final_match) is distinct from 'object' then
    raise exception 'invalid_final_match_payload';
  end if;

  if v_final_match->>'id' <> v_match_id then
    raise exception 'payload_match_id_mismatch';
  end if;

  if v_final_match->>'status' <> 'finalised' then
    raise exception 'payload_not_finalised';
  end if;

  if coalesce((v_final_match->>'isDemo')::boolean, false) then
    raise exception 'demo_final_match_not_allowed';
  end if;

  v_match_date := (v_final_match->>'matchDate')::date;

  if v_match_date is null then
    raise exception 'missing_match_date';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('gully-legends-apk-match-number'),
    pg_catalog.hashtext(v_match_date::text)
  );

  select candidate.id
  into v_earlier_import_id
  from public.apk_match_imports as candidate
  where candidate.id <> v_import.id
    and candidate.is_demo = false
    and candidate.review_status = 'pending_review'
    and candidate.match_date = v_match_date
    and (
      coalesce(candidate.started_at, candidate.completed_at, candidate.imported_at),
      coalesce(candidate.completed_at, candidate.imported_at),
      candidate.imported_at,
      candidate.offline_match_id
    ) < (
      coalesce(v_import.started_at, v_import.completed_at, v_import.imported_at),
      coalesce(v_import.completed_at, v_import.imported_at),
      v_import.imported_at,
      v_import.offline_match_id
    )
  order by
    coalesce(candidate.started_at, candidate.completed_at, candidate.imported_at),
    coalesce(candidate.completed_at, candidate.imported_at),
    candidate.imported_at,
    candidate.offline_match_id
  limit 1;

  if v_earlier_import_id is not null then
    raise exception 'same_day_pending';
  end if;

  select coalesce(max(match_sequence), 0) + 1
  into v_match_number
  from public.matches
  where match_date = v_match_date
    and is_demo = false
    and deleted_at is null
    and status in ('draft', 'in_progress', 'finalised')
    and match_sequence is not null;

  v_final_match :=
    jsonb_set(
      jsonb_set(v_final_match, '{matchDate}', to_jsonb(v_match_date::text), true),
      '{matchNumber}',
      to_jsonb(v_match_number),
      true
    );

  v_in_progress_match :=
    jsonb_set(v_final_match, '{status}', to_jsonb('in_progress'::text), true)
    - 'progressionAppliedAt'
    - 'appliedFinalisationVersion';

  insert into public.matches (
    id,
    match_date,
    start_time,
    match_sequence,
    name,
    venue,
    status,
    is_demo,
    payload,
    created_by,
    updated_by,
    finalised_at,
    stats_applied_at,
    deleted_at
  )
  values (
    v_match_id,
    v_match_date,
    nullif(v_final_match->>'startTime', '')::time,
    v_match_number,
    v_final_match->>'matchName',
    v_final_match->>'venue',
    'in_progress',
    false,
    v_in_progress_match,
    auth.uid(),
    auth.uid(),
    null,
    null,
    null
  )
  returning *
  into v_inserted_match;

  v_finalisation_plan :=
    jsonb_set(v_finalisation_plan, '{finalMatch}', v_final_match, true);
  v_finalisation_plan :=
    jsonb_set(
      v_finalisation_plan,
      '{expectedMatchUpdatedAt}',
      to_jsonb(v_inserted_match.updated_at::text),
      true
    );

  v_finalisation_result := public.finalize_match_atomic(v_finalisation_plan);

  update public.apk_match_imports
  set
    review_status = 'finalised',
    finalised_match_id = v_match_id,
    updated_by = auth.uid()
  where id = v_import.id
  returning *
  into v_import;

  return jsonb_build_object(
    'ok', true,
    'already_applied', false,
    'match_id', v_match_id,
    'match_number', v_match_number,
    'finalised_at', v_finalisation_result->>'finalised_at',
    'stats_applied_at', v_finalisation_result->>'stats_applied_at'
  );
end;
$$;

revoke all on function public.finalize_apk_import_atomic(uuid, jsonb) from public;
revoke all on function public.finalize_apk_import_atomic(uuid, jsonb) from anon;
grant execute on function public.finalize_apk_import_atomic(uuid, jsonb) to authenticated;
