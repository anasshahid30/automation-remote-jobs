-- Additive Phase 2 migration. Never resets data or overwrites resume files.
begin;

alter table public.resumes
  add column original_filename text check (length(original_filename) between 1 and 255),
  add column mime_type text check (mime_type in ('application/pdf','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  add column file_size integer check (file_size between 1 and 10485760),
  add column sha256 text check (sha256 ~ '^[a-f0-9]{64}$');
alter table public.applications add column notes text not null default '' check (length(notes) <= 20000);

-- Fail visibly if an existing project has conflicting masters; do not silently change them.
create unique index resumes_current_master on public.resumes(profile_id, role_category) where is_master;

-- Deleting a listing must not erase its CRM history. Account deletion can still cascade.
alter table public.applications drop constraint applications_job_id_user_id_fkey;
alter table public.applications add constraint applications_job_id_user_id_fkey
  foreign key (job_id,user_id) references public.jobs(id,user_id) on delete no action;

create or replace function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = clock_timestamp(); return new; end;
$$;

create function public.protect_resume_version() returns trigger language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - array['is_master','updated_at']) is distinct from
     (to_jsonb(old) - array['is_master','updated_at']) then
    raise exception 'Upload a new resume version instead of editing an existing document' using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_resume_version() from public, anon, authenticated;
create trigger protect_version before update on public.resumes for each row execute function public.protect_resume_version();

create function public.select_resume_master(p_resume_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare r public.resumes;
begin
  select * into r from public.resumes where id=p_resume_id and user_id=auth.uid();
  if not found then raise exception 'Resume not found' using errcode='42501'; end if;
  -- Serialize changes to all masters belonging to this profile, including concurrent calls.
  perform 1 from public.candidate_profiles where id=r.profile_id and user_id=auth.uid() for update;
  update public.resumes set is_master=false where profile_id=r.profile_id and role_category=r.role_category and is_master;
  update public.resumes set is_master=true where id=p_resume_id and user_id=auth.uid();
end;
$$;
revoke all on function public.select_resume_master(uuid) from public, anon;
grant execute on function public.select_resume_master(uuid) to authenticated;

drop policy resume_delete on storage.objects;
create policy resume_delete on storage.objects for delete to authenticated using (
  bucket_id='resumes' and (storage.foldername(name))[1]=(select auth.uid())::text
  and not exists (select 1 from public.resumes r where r.user_id=(select auth.uid()) and r.storage_path=name)
);

create function public.check_profile_timezone() returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then
    raise exception 'Invalid profile timezone' using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function public.check_profile_timezone() from public, anon, authenticated;
create trigger valid_timezone before insert or update on public.candidate_profiles
  for each row execute function public.check_profile_timezone();

create function public.local_time_to_utc(p_value text) returns timestamptz
language plpgsql stable security invoker set search_path = '' as $$
declare tz text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$' then
    raise exception 'Invalid local date and time' using errcode='22007';
  end if;
  select timezone into tz from public.candidate_profiles where user_id=auth.uid();
  return p_value::timestamp at time zone coalesce(tz,'Asia/Karachi');
end;
$$;
revoke all on function public.local_time_to_utc(text) from public, anon;
grant execute on function public.local_time_to_utc(text) to authenticated;

create function public.audit_application_change() returns trigger language plpgsql set search_path = '' as $$
begin
  insert into public.application_events(user_id,application_id,event_type,details)
  values (new.user_id,new.id,
    case when TG_OP='INSERT' then 'status_changed'
         when old.status is distinct from new.status then 'status_changed'
         else 'prepared' end,
    case when TG_OP='INSERT' then jsonb_build_object('operation','created','status',new.status)
         else jsonb_build_object('operation','edited','previous_status',old.status,'status',new.status) end);
  return new;
end;
$$;
revoke all on function public.audit_application_change() from public, anon, authenticated;
create trigger application_audit after insert or update on public.applications
  for each row execute function public.audit_application_change();

-- Atomic shared budgets; browser users cannot clear their counters or choose a larger limit.
create table public.action_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('upload','mutation')),
  window_start timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (user_id,action)
);
alter table public.action_limits enable row level security;
revoke all on public.action_limits from public, anon, authenticated;
grant all on public.action_limits to service_role;

create function public.consume_action_budget(p_action text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare current_time timestamptz := clock_timestamp(); current_count integer; window_size interval; max_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_action='upload' then window_size:=interval '1 hour'; max_count:=10;
  elsif p_action='mutation' then window_size:=interval '5 minutes'; max_count:=120;
  else raise exception 'Unsupported action' using errcode='22023'; end if;
  insert into public.action_limits as limits(user_id,action,window_start,request_count)
  values(auth.uid(),p_action,current_time,1)
  on conflict (user_id,action) do update set
    request_count=case when limits.window_start+window_size<=current_time then 1 else limits.request_count+1 end,
    window_start=case when limits.window_start+window_size<=current_time then current_time else limits.window_start end
  returning request_count into current_count;
  return current_count<=max_count;
end;
$$;
revoke all on function public.consume_action_budget(text) from public, anon;
grant execute on function public.consume_action_budget(text) to authenticated;

create function public.dashboard_metrics() returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare tz text; start_of_day timestamptz; end_of_day timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select timezone into tz from public.candidate_profiles where user_id=auth.uid();
  tz:=coalesce(tz,'Asia/Karachi');
  start_of_day:=date_trunc('day',now() at time zone tz) at time zone tz;
  end_of_day:=(date_trunc('day',now() at time zone tz)+interval '1 day') at time zone tz;
  return jsonb_build_object(
    'jobs',(select count(*) from public.jobs where user_id=auth.uid()),
    'applications',(select count(*) from public.applications where user_id=auth.uid()),
    'needs_review',(select count(*) from public.applications where user_id=auth.uid() and status='needs_review'),
    'failed',(select count(*) from public.applications where user_id=auth.uid() and status='failed'),
    'responses',(select count(*) from public.applications where user_id=auth.uid() and status in ('responded','interview','offer','rejected') and applied_at is not null),
    'interviews',(select count(*) from public.applications where user_id=auth.uid() and status='interview'),
    'manual_today',(select count(*) from public.applications where user_id=auth.uid()
      and submission_method='human_assisted' and confirmation_evidence->>'kind'='candidate_reported'
      and applied_at>=start_of_day and applied_at<end_of_day and applied_at<=now()),
    'follow_ups_due',(select count(*) from public.applications where user_id=auth.uid()
      and follow_up_at<=now() and status in ('submitted','responded','interview')),
    'masters',(select count(*) from public.resumes where user_id=auth.uid() and is_master),
    'timezone',tz);
end;
$$;
revoke all on function public.dashboard_metrics() from public, anon;
grant execute on function public.dashboard_metrics() to authenticated;

commit;
