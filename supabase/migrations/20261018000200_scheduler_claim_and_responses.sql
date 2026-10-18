begin;
create or replace function public.claim_scheduled_task() returns jsonb language plpgsql security definer set search_path='' as $$
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
 -- Re-read after taking the owner lock: another worker may have committed a claim
 -- since this SQL statement's initial scan began.
 if not exists(select 1 from public.scheduler_settings s where s.user_id=owner_id and s.enabled
  and (select count(*) from public.scheduled_tasks where user_id=owner_id and state='running')<s.max_concurrency)
  or not exists(select 1 from public.submission_controls where user_id=owner_id and scope='global' and not paused) then return null;end if;
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


create function public.schedule_follow_up(p_application_id uuid,p_due_at timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare a public.applications;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 perform 1 from public.candidate_profiles where user_id=auth.uid() for update;
 select * into a from public.applications where id=p_application_id and user_id=auth.uid() for update;
 if not found then raise exception 'Application unavailable' using errcode='42501';end if;
 if p_due_at is null or p_due_at<clock_timestamp()-interval '5 minutes' or p_due_at>clock_timestamp()+interval '366 days' or a.applied_at is null or a.status not in ('submitted','responded','interview') then raise exception 'Choose an active submitted application and a time within the next year' using errcode='23514';end if;
 if a.follow_up_at=p_due_at then return;end if;
 update public.applications set follow_up_at=p_due_at where id=a.id;
 insert into public.application_events(user_id,application_id,event_type,details) values(auth.uid(),a.id,'follow_up',jsonb_build_object('kind','reminder_scheduled','due_at',p_due_at));
end $$;
revoke all on function public.schedule_follow_up(uuid,timestamptz) from public,anon;
grant execute on function public.schedule_follow_up(uuid,timestamptz) to authenticated;

create function public.record_application_response(p_application_id uuid,p_status text,p_note text,p_request_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare a public.applications; existing uuid; updated_notes text;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 perform 1 from public.candidate_profiles where user_id=auth.uid() for update;
 select * into a from public.applications where id=p_application_id and user_id=auth.uid() for update;
 if not found then raise exception 'Application unavailable' using errcode='42501';end if;
 select application_id into existing from public.application_events where user_id=auth.uid() and event_type='response' and details->>'request_id'=p_request_id::text limit 1;
 if found then
  if existing<>a.id then raise exception 'Request identity conflict' using errcode='23505';end if;return;
 end if;
 if p_status is null or p_status not in ('responded','interview','offer','rejected') or p_note is null or length(trim(p_note)) not between 3 and 3000 or p_request_id is null or a.applied_at is null then raise exception 'Actual submitted application and response details required' using errcode='23514';end if;
 updated_notes:=concat_ws(E'\n\n',nullif(a.notes,''),'Response recorded: '||p_note);
 if length(updated_notes)>20000 then raise exception 'Edit existing notes before adding more' using errcode='23514';end if;
 update public.applications set status=p_status,notes=updated_notes where id=a.id;
 insert into public.application_events(user_id,application_id,event_type,details) values(auth.uid(),a.id,'response',jsonb_build_object('status',p_status,'note',p_note,'request_id',p_request_id));
end $$;
revoke all on function public.record_application_response(uuid,text,text,uuid) from public,anon;
grant execute on function public.record_application_response(uuid,text,text,uuid) to authenticated;
commit;
