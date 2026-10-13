begin;

create table public.submission_controls (
 user_id uuid not null references auth.users(id) on delete cascade,
 scope text not null check(scope='global' or scope ~ '^source:[a-z][a-z0-9_]{0,40}$'),
 paused boolean not null default true,
 updated_at timestamptz not null default clock_timestamp(),
 primary key(user_id,scope)
);
alter table public.submission_controls enable row level security;
create policy owner_submission_controls on public.submission_controls to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update on public.submission_controls to authenticated;
grant all on public.submission_controls to service_role;
create trigger submission_controls_updated before update on public.submission_controls for each row execute function public.set_updated_at();
create function public.lock_submission_control() returns trigger language plpgsql set search_path='' as $$
begin perform 1 from public.candidate_profiles where user_id=new.user_id for update; return new; end;
$$;
create trigger lock_submission_control before insert or update on public.submission_controls for each row execute function public.lock_submission_control();

create table public.submission_runs (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 application_id uuid not null,
 package_id uuid not null,
 request_id uuid not null,
 mode text not null check(mode in ('dry_run','human_assisted')),
 state text not null check(state in ('blocked','dry_run_passed','handoff_ready','uncertain','candidate_reported','cancelled')),
 source_platform text not null,
 source_url text not null check(source_url ~ '^https://[^[:space:]]+$'),
 input_snapshot jsonb not null check(jsonb_typeof(input_snapshot)='object'),
 report jsonb not null check(jsonb_typeof(report)='object' and octet_length(report::text)<=30000),
 outcome_note text check(length(outcome_note)<=3000),
 outcome_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique(user_id,request_id), unique(id,user_id),
 foreign key(application_id,user_id) references public.applications(id,user_id),
 foreign key(package_id,user_id) references public.application_packages(id,user_id),
 check((mode='dry_run' and state in ('blocked','dry_run_passed')) or (mode='human_assisted' and state in ('handoff_ready','uncertain','candidate_reported','cancelled'))),
 check(state not in ('uncertain','candidate_reported','cancelled') or (outcome_note is not null and length(trim(outcome_note))>0 and outcome_at is not null))
);
alter table public.submission_runs enable row level security;
create policy owner_submission_runs on public.submission_runs for select to authenticated using(user_id=auth.uid());
grant select on public.submission_runs to authenticated;
grant all on public.submission_runs to service_role;
create unique index one_active_handoff on public.submission_runs(application_id) where mode='human_assisted' and state in ('handoff_ready','uncertain','candidate_reported');
create index submission_run_history on public.submission_runs(user_id,application_id,created_at desc);

alter table public.application_events drop constraint application_events_event_type_check;
alter table public.application_events add constraint application_events_event_type_check check(event_type in ('discovered','screened','prepared','approved','submission_attempted','submitted','error','response','follow_up','status_changed','record_created','record_updated','package_generated','package_reviewed','submission_checked','handoff_started','handoff_uncertain','handoff_cancelled','handoff_reported'));

-- This fingerprint is an input revision, never proof of authorization or provider receipt.
create function public.submission_snapshot(p_application_id uuid,p_package_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('application',a.updated_at,'job',j.updated_at,'profile',p.updated_at,'facts',f.updated_at,
  'answers',public.answer_version_snapshot(),
  'masters',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'updated_at',r.updated_at) order by r.id),'[]') from public.resumes r where r.user_id=auth.uid() and r.is_master),
  'review',(select reviewed_at from public.job_reviews where job_id=j.id and user_id=auth.uid()),
  'package_review',(select max(reviewed_at) from public.package_reviews where package_id=pack.id and user_id=auth.uid()))
 from public.applications a join public.jobs j on j.id=a.job_id and j.user_id=a.user_id
 join public.candidate_profiles p on p.user_id=a.user_id
 join public.application_packages pack on pack.application_id=a.id and pack.user_id=a.user_id and pack.id=p_package_id
 left join public.resume_facts f on f.resume_id=pack.resume_id and f.user_id=a.user_id
 where a.id=p_application_id and a.user_id=auth.uid();
$$;
revoke all on function public.submission_snapshot(uuid,uuid) from public,anon;
grant execute on function public.submission_snapshot(uuid,uuid) to authenticated;

-- Public writes can create only dry runs or candidate-operated handoffs, never API receipts.
create function public.record_submission_run(p_application_id uuid,p_package_id uuid,p_request_id uuid,p_mode text,p_snapshot jsonb,p_report jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); a public.applications; j public.jobs; p public.candidate_profiles; pack public.application_packages; f public.resume_facts; existing public.submission_runs; result uuid; eligible boolean;
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_mode not in ('dry_run','human_assisted') or p_mode is null then raise exception 'Unsupported submission route' using errcode='22023'; end if;
 select * into a from public.applications where id=p_application_id and user_id=owner_id;
 if not found then raise exception 'Application unavailable' using errcode='42501'; end if;
 select * into j from public.jobs where id=a.job_id and user_id=owner_id for update;
 select * into p from public.candidate_profiles where user_id=owner_id for update;
 select * into a from public.applications where id=p_application_id and user_id=owner_id for update;
 select * into existing from public.submission_runs where user_id=owner_id and request_id=p_request_id;
 if found then
  if existing.application_id<>a.id or existing.package_id<>p_package_id or existing.mode<>p_mode then raise exception 'Request identity conflict' using errcode='23505'; end if;
  return existing.id;
 end if;
 select * into pack from public.application_packages where id=p_package_id and application_id=a.id and user_id=owner_id;
 if not found then raise exception 'Package unavailable' using errcode='42501'; end if;
 if p_snapshot is distinct from public.submission_snapshot(a.id,pack.id) then raise exception 'Inputs changed; check again' using errcode='40001'; end if;
 if jsonb_typeof(p_report) is distinct from 'object' or jsonb_typeof(p_report->'ready') is distinct from 'boolean' or jsonb_typeof(p_report->'checks') is distinct from 'array' or p_report->>'version' is distinct from 'phase5.1' or octet_length(p_report::text)>30000 then raise exception 'Invalid validation report' using errcode='23514'; end if;
 if p_mode='human_assisted' then
  -- Global handoffs start paused. Source overrides may pause individual platforms too.
  insert into public.submission_controls(user_id,scope,paused) values(owner_id,'global',true) on conflict do nothing;
  perform 1 from public.submission_controls where user_id=owner_id order by scope for update;
  if (select paused from public.submission_controls where user_id=owner_id and scope='global') or coalesce((select paused from public.submission_controls where user_id=owner_id and scope='source:'||j.source_platform),false) then raise exception 'Submission handoffs are paused' using errcode='23514'; end if;
  select * into existing from public.submission_runs where application_id=a.id and user_id=owner_id and mode='human_assisted' and state in ('handoff_ready','uncertain','candidate_reported');
  if found then return existing.id; end if;
  select * into f from public.resume_facts where resume_id=pack.resume_id and user_id=owner_id for update;
  select effective_decision='ELIGIBLE' into eligible from public.job_screening_summary where id=j.id and user_id=owner_id;
  if p_report->>'ready'<>'true' or not coalesce(eligible,false) or a.applied_at is not null or a.status not in ('approved','prepared') or a.submission_method<>'human_assisted'
   or not coalesce(f.verified_by_candidate,false) or pack.job_updated_at is distinct from j.updated_at or pack.profile_updated_at is distinct from p.updated_at or pack.facts_updated_at is distinct from f.updated_at or pack.answer_snapshot is distinct from public.answer_version_snapshot()
   or not exists(select 1 from public.package_reviews where package_id=pack.id and user_id=owner_id)
   or a.resume_id is distinct from pack.resume_id or a.cover_letter is distinct from pack.content->>'cover_letter' or a.answers->>'package_id' is distinct from pack.id::text
   or j.listing_status<>'active' or j.expires_at<=clock_timestamp() then raise exception 'Current approved eligible package required' using errcode='23514'; end if;
 end if;
 insert into public.submission_runs(user_id,application_id,package_id,request_id,mode,state,source_platform,source_url,input_snapshot,report)
 values(owner_id,a.id,pack.id,p_request_id,p_mode,case when p_mode='human_assisted' then 'handoff_ready' when p_report->>'ready'='true' then 'dry_run_passed' else 'blocked' end,j.source_platform,j.canonical_url,p_snapshot,p_report) returning id into result;
 insert into public.application_events(user_id,application_id,event_type,details) values(owner_id,a.id,case when p_mode='human_assisted' then 'handoff_started' else 'submission_checked' end,jsonb_build_object('run_id',result,'package_id',pack.id,'mode',p_mode,'ready',p_report->'ready'));
 return result;
end;
$$;
revoke all on function public.record_submission_run(uuid,uuid,uuid,text,jsonb,jsonb) from public,anon;
grant execute on function public.record_submission_run(uuid,uuid,uuid,text,jsonb,jsonb) to authenticated;

create function public.finish_submission_handoff(p_run_id uuid,p_outcome text,p_note text,p_applied_at timestamptz default null)
returns void language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); run public.submission_runs; a public.applications;
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_outcome not in ('uncertain','candidate_reported','cancelled') or p_outcome is null or length(trim(p_note)) not between 3 and 3000 or p_note is null then raise exception 'Actual outcome and explanation required' using errcode='23514'; end if;
 select * into run from public.submission_runs where id=p_run_id and user_id=owner_id and mode='human_assisted';
 if not found then raise exception 'Handoff unavailable' using errcode='42501'; end if;
 select * into a from public.applications where id=run.application_id and user_id=owner_id for update;
 select * into run from public.submission_runs where id=p_run_id and user_id=owner_id for update;
 if run.state=p_outcome and run.outcome_note=p_note then return; end if;
 if run.state not in ('handoff_ready','uncertain') or a.applied_at is not null then raise exception 'Outcome already recorded; review the existing record' using errcode='23514'; end if;
 if p_outcome='candidate_reported' then
  if p_applied_at is null or p_applied_at>clock_timestamp() or p_applied_at<run.created_at-interval '5 minutes' then raise exception 'Actual handoff submission time required' using errcode='23514'; end if;
  update public.applications set status='submitted',submission_method='human_assisted',submission_reference=p_note,applied_at=p_applied_at,
   confirmation_evidence=jsonb_build_object('kind','candidate_reported','note',p_note,'handoff_id',run.id,'package_id',run.package_id,'source_url',run.source_url),last_error=null where id=a.id;
 end if;
 update public.submission_runs set state=p_outcome,outcome_note=p_note,outcome_at=coalesce(p_applied_at,clock_timestamp()),updated_at=clock_timestamp() where id=run.id;
 insert into public.application_events(user_id,application_id,event_type,details) values(owner_id,a.id,case p_outcome when 'candidate_reported' then 'handoff_reported' when 'uncertain' then 'handoff_uncertain' else 'handoff_cancelled' end,jsonb_build_object('run_id',run.id,'kind',p_outcome));
end;
$$;
revoke all on function public.finish_submission_handoff(uuid,text,text,timestamptz) from public,anon;
grant execute on function public.finish_submission_handoff(uuid,text,text,timestamptz) to authenticated;

-- Manual tracker confirmations reconcile an open handoff, including when saved on another tab.
create function public.reconcile_handoff_report() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.applied_at is not null and new.confirmation_evidence->>'kind'='candidate_reported' and new.submission_method='human_assisted' then
  update public.submission_runs set state='candidate_reported',outcome_note=coalesce(nullif(new.submission_reference,''),'Candidate reported the actual submission in the tracker.'),outcome_at=new.applied_at,updated_at=clock_timestamp()
  where user_id=new.user_id and application_id=new.id and mode='human_assisted' and state in ('handoff_ready','uncertain');
 end if;
 return new;
end;
$$;
revoke all on function public.reconcile_handoff_report() from public,anon,authenticated;
create trigger reconcile_handoff_report after update on public.applications for each row execute function public.reconcile_handoff_report();
commit;
