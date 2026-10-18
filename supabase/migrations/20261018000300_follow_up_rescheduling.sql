begin;
-- A deliberate date change may reactivate that reminder; ordinary note/status edits may not.
create or replace function public.sync_follow_up_task() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.scheduler_attempts set finished_at=clock_timestamp(),outcome='cancelled' where finished_at is null and task_id in
  (select id from public.scheduled_tasks where application_id=new.id and user_id=new.user_id and kind='follow_up' and state='running'
   and (new.follow_up_at is distinct from due_at or new.applied_at is null or new.status not in ('submitted','responded','interview')));
 update public.scheduled_tasks set state='cancelled',result_code='obsolete',lease_token=null,lease_until=null,updated_at=clock_timestamp()
 where application_id=new.id and user_id=new.user_id and kind='follow_up' and state in ('queued','running','retry_wait','ready','needs_attention')
 and (new.follow_up_at is distinct from due_at or new.applied_at is null or new.status not in ('submitted','responded','interview'));
 if new.follow_up_at is not null and new.applied_at is not null and new.status in ('submitted','responded','interview')
  and (TG_OP='INSERT' or new.follow_up_at is distinct from old.follow_up_at or old.applied_at is null or old.status not in ('submitted','responded','interview')) then
  insert into public.scheduled_tasks(user_id,application_id,kind,due_at,next_attempt_at) values(new.user_id,new.id,'follow_up',new.follow_up_at,new.follow_up_at) on conflict(user_id,application_id,kind,due_at) do update set state='queued',attempts=0,next_attempt_at=excluded.due_at,result_code=null,lease_token=null,lease_until=null,updated_at=clock_timestamp()
  where public.scheduled_tasks.state in ('cancelled','skipped','failed','done');
 end if;return new;
end $$;

create or replace function public.record_application_response(p_application_id uuid,p_status text,p_note text,p_request_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare a public.applications; existing public.application_events; updated_notes text;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 perform 1 from public.candidate_profiles where user_id=auth.uid() for update;
 select * into a from public.applications where id=p_application_id and user_id=auth.uid() for update;
 if not found then raise exception 'Application unavailable' using errcode='42501';end if;
 select * into existing from public.application_events where user_id=auth.uid() and event_type='response' and details->>'request_id'=p_request_id::text limit 1;
 if found then
  if existing.application_id<>a.id or existing.details->>'status' is distinct from p_status or existing.details->>'note' is distinct from p_note then raise exception 'Request identity conflict' using errcode='23505';end if;return;
 end if;
 if p_status is null or p_status not in ('responded','interview','offer','rejected') or p_note is null or length(trim(p_note)) not between 3 and 3000 or p_request_id is null or a.applied_at is null then raise exception 'Actual submitted application and response details required' using errcode='23514';end if;
 updated_notes:=concat_ws(E'\n\n',nullif(a.notes,''),'Response recorded: '||p_note);
 if length(updated_notes)>20000 then raise exception 'Edit existing notes before adding more' using errcode='23514';end if;
 update public.applications set status=p_status,notes=updated_notes where id=a.id;
 insert into public.application_events(user_id,application_id,event_type,details) values(auth.uid(),a.id,'response',jsonb_build_object('status',p_status,'note',p_note,'request_id',p_request_id));
end $$;
commit;
