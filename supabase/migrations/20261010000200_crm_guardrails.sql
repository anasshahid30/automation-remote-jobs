begin;

-- These guards also apply to direct authenticated Data API writes.
alter table public.applications
  add constraint applications_prepared_resume check (status <> 'prepared' or resume_id is not null) not valid,
  add constraint applications_failed_reason check (status <> 'failed' or length(trim(last_error)) > 0 and last_error is not null) not valid,
  add constraint applications_actual_submission_time check (applied_at is null or applied_at <= clock_timestamp()) not valid;
-- Existing rows are retained. NOT VALID still enforces these rules for new/updated rows.

alter table public.application_events drop constraint application_events_event_type_check;
alter table public.application_events add constraint application_events_event_type_check
  check (event_type in ('discovered','screened','prepared','approved','submission_attempted','submitted','error','response','follow_up','status_changed','record_created','record_updated'));

create or replace function public.audit_application_change() returns trigger language plpgsql set search_path = '' as $$
begin
  insert into public.application_events(user_id,application_id,event_type,details)
  values (new.user_id,new.id,
    case when TG_OP='INSERT' then 'record_created'
         when old.status is distinct from new.status then 'status_changed'
         else 'record_updated' end,
    case when TG_OP='INSERT' then jsonb_build_object('operation','created','status',new.status)
         else jsonb_build_object('operation','edited','previous_status',old.status,'status',new.status) end);
  return new;
end;
$$;

commit;
