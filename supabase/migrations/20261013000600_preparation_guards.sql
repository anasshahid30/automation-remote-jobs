begin;
alter table public.application_events drop constraint application_events_event_type_check;
alter table public.application_events add constraint application_events_event_type_check check(event_type in ('discovered','screened','prepared','approved','submission_attempted','submitted','error','response','follow_up','status_changed','record_created','record_updated','package_generated','package_reviewed'));

create function public.guard_preparation_facts() returns trigger language plpgsql set search_path='' as $$
begin
 -- Serializes answer/text edits with preparation snapshots, including direct API edits.
 perform 1 from public.candidate_profiles where user_id=new.user_id for update;
 if tg_table_name='answer_library' then
   if new.question_pattern ~* '(visa|sponsor|authori[sz]|right to work|legally|legal|clearance|attest|certify|assessment|test|relocat|salary|compensation|pay expectation|criminal|disabilit|gender|ethnic|veteran|medical|consent|agree|declar|citizen|residen|willing|commit|availability|start date|notice period|reference|background)' then
      new.requires_review:=true;
   end if;
 end if;
 return new;
end;
$$;
create trigger guard_answer_preparation before insert or update on public.answer_library for each row execute function public.guard_preparation_facts();
create trigger guard_facts_preparation before insert or update on public.resume_facts for each row execute function public.guard_preparation_facts();
commit;
