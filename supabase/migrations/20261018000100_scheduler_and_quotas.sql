begin;

-- The worker inherits EXECUTE on four narrow RPCs, never candidate-table access.
do $$ begin
 if not exists(select 1 from pg_roles where rolname='remote_jobs_scheduler') then
  create role remote_jobs_scheduler nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
 end if;
end $$;
grant usage on schema public to remote_jobs_scheduler;

create table public.scheduler_settings (
 user_id uuid primary key references auth.users(id) on delete cascade,
 enabled boolean not null default false,
 max_concurrency integer not null default 1 check(max_concurrency between 1 and 3),
 updated_at timestamptz not null default clock_timestamp()
);
alter table public.scheduler_settings enable row level security;
create policy owner_scheduler_settings on public.scheduler_settings to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update on public.scheduler_settings to authenticated;
create trigger scheduler_settings_lock before insert or update on public.scheduler_settings for each row execute function public.lock_submission_control();
create trigger scheduler_settings_updated before update on public.scheduler_settings for each row execute function public.set_updated_at();

create table public.scheduled_tasks (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 application_id uuid not null,
 request_id uuid not null default gen_random_uuid(),
 kind text not null check(kind in ('review_application','follow_up')),
 due_at timestamptz not null,
 next_attempt_at timestamptz not null,
 state text not null default 'queued' check(state in ('queued','running','retry_wait','ready','needs_attention','done','cancelled','failed','skipped')),
 attempts integer not null default 0 check(attempts between 0 and 3),
 lease_token uuid,
 lease_until timestamptz,
 result_code text check(result_code in ('review_package','inputs_need_review','follow_up_due','obsolete','paused','lease_expired','temporary_database','permanent_database','acknowledged','cancelled')),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique(id,user_id),unique(user_id,request_id),unique(user_id,application_id,kind,due_at),
 foreign key(application_id,user_id) references public.applications(id,user_id) on delete cascade,
 check((state='running')=(lease_token is not null and lease_until is not null))
);
create index scheduler_due on public.scheduled_tasks(next_attempt_at,created_at) where state in ('queued','retry_wait');
create index scheduler_owner_history on public.scheduled_tasks(user_id,created_at desc);
alter table public.scheduled_tasks enable row level security;
create policy owner_scheduled_tasks on public.scheduled_tasks for select to authenticated using(user_id=auth.uid());
grant select on public.scheduled_tasks to authenticated;

create table public.scheduler_attempts (
 id uuid primary key,
 task_id uuid not null,
 user_id uuid not null references auth.users(id) on delete cascade,
 attempt integer not null check(attempt between 1 and 3),
 started_at timestamptz not null default clock_timestamp(),
 finished_at timestamptz,
 outcome text check(outcome in ('ready','needs_attention','skipped','cancelled','paused','lease_expired','temporary_database','permanent_database')),
 foreign key(task_id,user_id) references public.scheduled_tasks(id,user_id) on delete cascade
);
alter table public.scheduler_attempts enable row level security;
create policy owner_scheduler_attempts on public.scheduler_attempts for select to authenticated using(user_id=auth.uid());
grant select on public.scheduler_attempts to authenticated;

create table public.scheduler_workers (
 id uuid primary key,
 last_seen timestamptz not null default clock_timestamp(),
 status text not null check(status in ('running','stopped','degraded'))
);
alter table public.scheduler_workers enable row level security;
-- Worker IDs are not exposed to candidates; the metrics RPC returns only the last live pulse.
revoke all on public.scheduler_workers from anon,authenticated;
grant all on public.scheduler_settings,public.scheduled_tasks,public.scheduler_attempts,public.scheduler_workers to service_role;

create function public.handoff_quota_for(p_owner uuid,p_at timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare tz text; cap integer; day_start timestamptz; day_end timestamptz; actual integer; pending integer;
begin
 select timezone,daily_target into tz,cap from public.candidate_profiles where user_id=p_owner;
 tz:=coalesce(tz,'Asia/Karachi');cap:=coalesce(cap,30);
 day_start:=date_trunc('day',p_at at time zone tz) at time zone tz;
 day_end:=(date_trunc('day',p_at at time zone tz)+interval '1 day') at time zone tz;
 select count(*) into actual from (
  select id from public.applications where user_id=p_owner and applied_at>=day_start and applied_at<day_end and applied_at<=p_at
  union select application_id from public.submission_runs where user_id=p_owner and state='candidate_reported' and outcome_at>=day_start and outcome_at<day_end and outcome_at<=p_at
 ) completed;
 select count(*) into pending from public.submission_runs r where r.user_id=p_owner and r.state in ('handoff_ready','uncertain')
  and not exists(select 1 from public.applications a where a.id=r.application_id and a.applied_at is not null);
 return jsonb_build_object('timezone',tz,'limit',cap,'completed_today',actual,'pending_handoffs',pending,'remaining',greatest(0,cap-actual-pending),'resets_at',day_end);
end $$;
revoke all on function public.handoff_quota_for(uuid,timestamptz) from public,anon,authenticated;
create function public.handoff_quota() returns jsonb language plpgsql security definer set search_path='' as $$
begin if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 return public.handoff_quota_for(auth.uid(),clock_timestamp());end $$;
revoke all on function public.handoff_quota() from public,anon;
grant execute on function public.handoff_quota() to authenticated;

create function public.enforce_handoff_quota() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.mode='human_assisted' and new.state='handoff_ready' then
  perform 1 from public.candidate_profiles where user_id=new.user_id for update;
  if (public.handoff_quota_for(new.user_id,clock_timestamp())->>'remaining')::integer<=0 then raise exception 'Daily handoff limit reached; resolve pending outcomes or wait for the next local day' using errcode='P0001'; end if;
 end if;return new;
end $$;
revoke all on function public.enforce_handoff_quota() from public,anon,authenticated;
create trigger enforce_handoff_quota before insert on public.submission_runs for each row execute function public.enforce_handoff_quota();

-- Actual reports remain recordable at any time, even above the allocation cap.
create function public.serialize_actual_report() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.applied_at is distinct from old.applied_at then perform 1 from public.candidate_profiles where user_id=new.user_id for update; end if;return new;
end $$;
revoke all on function public.serialize_actual_report() from public,anon,authenticated;
create trigger serialize_actual_report before update on public.applications for each row execute function public.serialize_actual_report();

create function public.schedule_application_review(p_application_id uuid,p_due_at timestamptz,p_request_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.applications; existing public.scheduled_tasks; result uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 perform 1 from public.candidate_profiles where user_id=auth.uid() for update;
 select * into a from public.applications where id=p_application_id and user_id=auth.uid() for update;
 if not found then raise exception 'Application unavailable' using errcode='42501';end if;
 select * into existing from public.scheduled_tasks where user_id=auth.uid() and request_id=p_request_id;
 if found then
  if existing.application_id<>a.id or existing.kind<>'review_application' or existing.due_at is distinct from p_due_at then raise exception 'Request identity conflict' using errcode='23505';end if;return existing.id;
 end if;
 if p_due_at is null or p_due_at<clock_timestamp()-interval '5 minutes' or p_due_at>clock_timestamp()+interval '366 days' or p_request_id is null or a.applied_at is not null or a.status not in ('draft','needs_review','prepared','approved') then raise exception 'Choose a pending application and a time within the next year' using errcode='23514';end if;
 if (select count(*) from public.scheduled_tasks where user_id=auth.uid() and state in ('queued','running','retry_wait'))>=100 then raise exception 'Resolve queued tasks first' using errcode='23514';end if;
 insert into public.scheduled_tasks(user_id,application_id,request_id,kind,due_at,next_attempt_at) values(auth.uid(),a.id,p_request_id,'review_application',p_due_at,p_due_at)
 on conflict(user_id,application_id,kind,due_at) do update set application_id=excluded.application_id returning id into result;
 return result;
end $$;
revoke all on function public.schedule_application_review(uuid,timestamptz,uuid) from public,anon;
grant execute on function public.schedule_application_review(uuid,timestamptz,uuid) to authenticated;

-- Follow-up dates already entered in the tracker become local reminders, never sent messages.
create function public.sync_follow_up_task() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.scheduler_attempts set finished_at=clock_timestamp(),outcome='cancelled' where finished_at is null and task_id in
  (select id from public.scheduled_tasks where application_id=new.id and user_id=new.user_id and kind='follow_up' and state='running'
   and (new.follow_up_at is distinct from due_at or new.applied_at is null or new.status not in ('submitted','responded','interview')));
 update public.scheduled_tasks set state='cancelled',result_code='obsolete',lease_token=null,lease_until=null,updated_at=clock_timestamp()
 where application_id=new.id and user_id=new.user_id and kind='follow_up' and state in ('queued','running','retry_wait','ready','needs_attention')
 and (new.follow_up_at is distinct from due_at or new.applied_at is null or new.status not in ('submitted','responded','interview'));
 if new.follow_up_at is not null and new.applied_at is not null and new.status in ('submitted','responded','interview') then
  insert into public.scheduled_tasks(user_id,application_id,kind,due_at,next_attempt_at) values(new.user_id,new.id,'follow_up',new.follow_up_at,new.follow_up_at) on conflict(user_id,application_id,kind,due_at) do nothing;
 end if;return new;
end $$;
revoke all on function public.sync_follow_up_task() from public,anon,authenticated;
create trigger sync_follow_up_task after insert or update of follow_up_at,status,applied_at on public.applications for each row execute function public.sync_follow_up_task();
insert into public.scheduled_tasks(user_id,application_id,kind,due_at,next_attempt_at)
 select user_id,id,'follow_up',follow_up_at,follow_up_at from public.applications where follow_up_at is not null and applied_at is not null and status in ('submitted','responded','interview');

create function public.resolve_scheduled_task(p_task_id uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$
declare t public.scheduled_tasks;
begin
 if auth.uid() is null or p_action is null or p_action not in ('done','cancelled') then raise exception 'Invalid action' using errcode='22023';end if;
 perform 1 from public.candidate_profiles where user_id=auth.uid() for update;
 -- Application-before-task is shared by follow-up edits and worker completion.
 perform 1 from public.applications a join public.scheduled_tasks s on s.application_id=a.id and s.user_id=a.user_id where s.id=p_task_id and s.user_id=auth.uid() for update of a;
 select * into t from public.scheduled_tasks where id=p_task_id and user_id=auth.uid() for update;
 if not found then raise exception 'Task unavailable' using errcode='42501';end if;
 if t.state=p_action then return;end if;
 if t.state in ('done','cancelled','skipped') or (p_action='done' and t.state not in ('ready','needs_attention','failed')) then raise exception 'Task changed; reload it' using errcode='23514';end if;
 update public.scheduler_attempts set finished_at=clock_timestamp(),outcome='cancelled' where id=t.lease_token and finished_at is null;
 update public.scheduled_tasks set state=p_action,result_code=case when p_action='done' then 'acknowledged' else 'cancelled' end,lease_token=null,lease_until=null,updated_at=clock_timestamp() where id=t.id;
 if p_action='done' and t.kind='follow_up' then update public.applications set follow_up_at=null where id=t.application_id and follow_up_at=t.due_at;end if;
end $$;
revoke all on function public.resolve_scheduled_task(uuid,text) from public,anon;
grant execute on function public.resolve_scheduled_task(uuid,text) to authenticated;

create function public.scheduler_heartbeat(p_worker_id uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_worker_id is null or p_status is null or p_status not in ('running','stopped','degraded') then raise exception 'Invalid pulse' using errcode='22023';end if;
 insert into public.scheduler_workers(id,status) values(p_worker_id,p_status) on conflict(id) do update set last_seen=clock_timestamp(),status=excluded.status;
end $$;

create function public.claim_scheduled_task() returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid; t public.scheduled_tasks; lease uuid; expired public.scheduled_tasks;
begin
 -- Only these idempotent local tasks recover leases. Submission runs are never reclaimed.
 for expired in select * from public.scheduled_tasks where state='running' and lease_until<clock_timestamp() order by lease_until limit 50 for update skip locked loop
  update public.scheduler_attempts set finished_at=clock_timestamp(),outcome='lease_expired' where id=expired.lease_token and finished_at is null;
  update public.scheduled_tasks set state=case when attempts>=3 then 'failed' else 'retry_wait' end,result_code='lease_expired',next_attempt_at=clock_timestamp()+interval '60 seconds',lease_token=null,lease_until=null,updated_at=clock_timestamp() where id=expired.id;
 end loop;
 select p.user_id into owner_id from public.candidate_profiles p join public.scheduler_settings s on s.user_id=p.user_id
 where s.enabled and exists(select 1 from public.submission_controls c where c.user_id=p.user_id and c.scope='global' and not c.paused)
 and (select count(*) from public.scheduled_tasks where user_id=p.user_id and state='running')<s.max_concurrency
 and exists(select 1 from public.scheduled_tasks q join public.applications a on a.id=q.application_id join public.jobs j on j.id=a.job_id
  where q.user_id=p.user_id and q.state in ('queued','retry_wait') and q.next_attempt_at<=clock_timestamp() and q.attempts<3
  and not exists(select 1 from public.submission_controls c where c.user_id=p.user_id and c.scope='source:'||j.source_platform and c.paused))
 order by (select min(next_attempt_at) from public.scheduled_tasks where user_id=p.user_id and state in ('queued','retry_wait'))
 limit 1 for update of p skip locked;
 if owner_id is null then return null;end if;
 select q.* into t from public.scheduled_tasks q join public.applications a on a.id=q.application_id join public.jobs j on j.id=a.job_id
 where q.user_id=owner_id and q.state in ('queued','retry_wait') and q.next_attempt_at<=clock_timestamp() and q.attempts<3
 and not exists(select 1 from public.submission_controls c where c.user_id=owner_id and c.scope='source:'||j.source_platform and c.paused)
 order by q.next_attempt_at,q.created_at limit 1 for update of q skip locked;
 if not found then return null;end if;
 lease:=gen_random_uuid();
 update public.scheduled_tasks set state='running',attempts=attempts+1,lease_token=lease,lease_until=clock_timestamp()+interval '90 seconds',updated_at=clock_timestamp() where id=t.id;
 insert into public.scheduler_attempts(id,task_id,user_id,attempt) values(lease,t.id,t.user_id,t.attempts+1);
 return jsonb_build_object('id',t.id,'lease',lease);
end $$;

create function public.process_scheduled_task(p_task_id uuid,p_lease uuid) returns text language plpgsql security definer set search_path='' as $$
declare t public.scheduled_tasks; a public.applications; j public.jobs; p public.candidate_profiles; pack public.application_packages; facts public.resume_facts; decision text; result text; code text; previous_sub text;
begin
 select * into t from public.scheduled_tasks where id=p_task_id;
 if not found then return 'obsolete';end if;
 select * into a from public.applications where id=t.application_id;
 select * into j from public.jobs where id=a.job_id for update;
 select * into p from public.candidate_profiles where user_id=t.user_id for update;
 select * into a from public.applications where id=t.application_id for update;
 select * into t from public.scheduled_tasks where id=p_task_id for update;
 if t.state<>'running' or t.lease_token is distinct from p_lease or t.lease_until<=clock_timestamp() then return 'obsolete';end if;
 if not coalesce((select enabled from public.scheduler_settings where user_id=t.user_id),false)
 or not exists(select 1 from public.submission_controls where user_id=t.user_id and scope='global' and not paused)
 or exists(select 1 from public.submission_controls where user_id=t.user_id and scope='source:'||j.source_platform and paused) then
  update public.scheduler_attempts set finished_at=clock_timestamp(),outcome='paused' where id=p_lease;
  update public.scheduled_tasks set state='queued',attempts=greatest(0,attempts-1),lease_token=null,lease_until=null,result_code='paused',updated_at=clock_timestamp() where id=t.id;
  return 'paused';
 end if;
 if t.kind='follow_up' then
  if a.follow_up_at=t.due_at and a.applied_at is not null and a.status in ('submitted','responded','interview') then result:='ready';code:='follow_up_due';
  else result:='skipped';code:='obsolete';end if;
 else
  if a.applied_at is not null or a.status not in ('draft','needs_review','prepared','approved') then result:='skipped';code:='obsolete';
  else
   -- Scope existing freshness helpers to the task's immutable owner. This context is
   -- transaction-local and restored; the worker never receives an impersonation token.
   previous_sub:=current_setting('request.jwt.claim.sub',true);perform set_config('request.jwt.claim.sub',t.user_id::text,true);
   select effective_decision into decision from public.job_screening_summary where id=j.id and user_id=t.user_id;
   select * into pack from public.application_packages where id::text=a.answers->>'package_id' and application_id=a.id and user_id=t.user_id;
   select * into facts from public.resume_facts where resume_id=pack.resume_id and user_id=t.user_id;
   if decision='ELIGIBLE' and a.status in ('approved','prepared') and pack.id is not null and pack.job_updated_at=j.updated_at and pack.profile_updated_at=p.updated_at and pack.facts_updated_at=facts.updated_at and facts.verified_by_candidate
    and pack.answer_snapshot=public.answer_version_snapshot() and exists(select 1 from public.package_reviews where package_id=pack.id and user_id=t.user_id)
    and not exists(select 1 from public.submission_runs where application_id=a.id and state in ('handoff_ready','uncertain','candidate_reported')) then result:='ready';code:='review_package';
   else result:='needs_attention';code:='inputs_need_review';end if;
   perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
  end if;
 end if;
 update public.scheduled_tasks set state=result,result_code=code,lease_token=null,lease_until=null,updated_at=clock_timestamp() where id=t.id;
 update public.scheduler_attempts set finished_at=clock_timestamp(),outcome=result where id=p_lease;
 return result;
end $$;

create function public.fail_scheduled_task(p_task_id uuid,p_lease uuid,p_code text) returns void language plpgsql security definer set search_path='' as $$
declare t public.scheduled_tasks;
begin
 if p_code is null or p_code not in ('temporary_database','permanent_database') then raise exception 'Invalid failure code' using errcode='22023';end if;
 select * into t from public.scheduled_tasks where id=p_task_id for update;
 if not found or t.state<>'running' or t.lease_token is distinct from p_lease then return;end if;
 update public.scheduled_tasks set state=case when attempts>=3 or p_code='permanent_database' then 'failed' else 'retry_wait' end,result_code=p_code,
  next_attempt_at=clock_timestamp()+make_interval(secs=>least(900,60*power(2,attempts-1)::integer)+floor(random()*21)::integer),lease_token=null,lease_until=null,updated_at=clock_timestamp() where id=t.id;
 update public.scheduler_attempts set finished_at=clock_timestamp(),outcome=p_code where id=p_lease;
end $$;

revoke all on function public.scheduler_heartbeat(uuid,text),public.claim_scheduled_task(),public.process_scheduled_task(uuid,uuid),public.fail_scheduled_task(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.scheduler_heartbeat(uuid,text),public.claim_scheduled_task(),public.process_scheduled_task(uuid,uuid),public.fail_scheduled_task(uuid,uuid,text) to remote_jobs_scheduler;

create function public.scheduler_metrics() returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid();tz text; days jsonb;
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='42501';end if;
 select timezone into tz from public.candidate_profiles where user_id=owner_id;tz:=coalesce(tz,'Asia/Karachi');
 select jsonb_agg(jsonb_build_object('day',day::date,'manual',(select count(*) from public.applications where user_id=owner_id and submission_method='human_assisted' and confirmation_evidence->>'kind'='candidate_reported' and (applied_at at time zone tz)::date=day::date),'verified',(select count(*) from public.applications where user_id=owner_id and submission_method='authorized_api' and confirmation_evidence->>'kind'='provider_verified' and (applied_at at time zone tz)::date=day::date)) order by day) into days from generate_series((clock_timestamp() at time zone tz)::date-13,(clock_timestamp() at time zone tz)::date,interval '1 day') day;
 return jsonb_build_object('quota',public.handoff_quota_for(owner_id,clock_timestamp()),
 'last_worker_seen',(select max(last_seen) from public.scheduler_workers where status='running'),
 'worker_live',exists(select 1 from public.scheduler_workers where status='running' and last_seen>clock_timestamp()-interval '2 minutes'),
 'queued',(select count(*) from public.scheduled_tasks where user_id=owner_id and state in ('queued','retry_wait')),
 'running',(select count(*) from public.scheduled_tasks where user_id=owner_id and state='running'),
 'failed',(select count(*) from public.scheduled_tasks where user_id=owner_id and state='failed'),
 'attention',(select count(*) from public.scheduled_tasks where user_id=owner_id and state in ('ready','needs_attention')),
 'unique_jobs',(select count(*) from public.jobs where user_id=owner_id),
 'ineligible_jobs',(select count(*) from public.job_screening_summary where user_id=owner_id and effective_decision='INELIGIBLE'),
 'packages',(select count(*) from public.application_packages where user_id=owner_id),
 'awaiting_approval',(select count(*) from public.applications where user_id=owner_id and applied_at is null and status in ('needs_review','draft')),
 'uncertain',(select count(*) from public.submission_runs where user_id=owner_id and state='uncertain'),
 'responses',(select count(*) from public.applications where user_id=owner_id and applied_at is not null and status in ('responded','interview','offer','rejected')),
 'interviews',(select count(*) from public.applications where user_id=owner_id and status='interview'),
 'days',days);
end $$;
revoke all on function public.scheduler_metrics() from public,anon;
grant execute on function public.scheduler_metrics() to authenticated;
commit;
