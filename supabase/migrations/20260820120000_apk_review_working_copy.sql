alter table public.apk_match_imports
  add column if not exists review_payload jsonb,
  add column if not exists review_derived_match_payload jsonb,
  add column if not exists review_validation_result jsonb,
  add column if not exists review_source_sync_version integer,
  add column if not exists review_version integer not null default 0,
  add column if not exists review_updated_at timestamptz,
  add column if not exists review_is_stale boolean not null default false;

alter table public.apk_match_imports
  drop constraint if exists apk_match_imports_review_payload_is_object,
  add constraint apk_match_imports_review_payload_is_object
    check (review_payload is null or jsonb_typeof(review_payload) = 'object'),
  drop constraint if exists apk_match_imports_review_derived_payload_is_object,
  add constraint apk_match_imports_review_derived_payload_is_object
    check (review_derived_match_payload is null or jsonb_typeof(review_derived_match_payload) = 'object'),
  drop constraint if exists apk_match_imports_review_validation_result_is_object,
  add constraint apk_match_imports_review_validation_result_is_object
    check (review_validation_result is null or jsonb_typeof(review_validation_result) = 'object'),
  drop constraint if exists apk_match_imports_review_source_sync_version_positive,
  add constraint apk_match_imports_review_source_sync_version_positive
    check (review_source_sync_version is null or review_source_sync_version > 0),
  drop constraint if exists apk_match_imports_review_version_non_negative,
  add constraint apk_match_imports_review_version_non_negative
    check (review_version >= 0);

create index if not exists apk_match_imports_review_stale_idx
  on public.apk_match_imports (review_is_stale)
  where review_is_stale = true;

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
    review_payload,
    review_derived_match_payload,
    review_validation_result,
    review_source_sync_version,
    review_version,
    review_updated_at,
    review_is_stale,
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
    null,
    null,
    null,
    null,
    0,
    null,
    false,
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
    review_is_stale = public.apk_match_imports.review_payload is not null,
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
