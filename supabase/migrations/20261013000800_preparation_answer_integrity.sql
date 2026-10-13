begin;
create or replace function public.review_application_package(p_package_id uuid,p_application_updated_at timestamptz)
returns void language plpgsql security invoker set search_path='' as $$
declare pack public.application_packages; a public.applications; j public.jobs; p public.candidate_profiles; f public.resume_facts; decision text;
begin
 select * into pack from public.application_packages where id=p_package_id and user_id=auth.uid();
 if not found then raise exception 'Package unavailable' using errcode='42501'; end if;
 select * into a from public.applications where id=pack.application_id and user_id=auth.uid();
 select * into j from public.jobs where id=a.job_id for update;
 select * into p from public.candidate_profiles where user_id=auth.uid() for update;
 select * into a from public.applications where id=pack.application_id and user_id=auth.uid() for update;
 select * into f from public.resume_facts where resume_id=pack.resume_id and user_id=auth.uid() for update;
 if a.updated_at is distinct from p_application_updated_at or j.updated_at is distinct from pack.job_updated_at or p.updated_at is distinct from pack.profile_updated_at or f.updated_at is distinct from pack.facts_updated_at or not f.verified_by_candidate or public.answer_version_snapshot() is distinct from pack.answer_snapshot then
   raise exception 'Package is stale; regenerate' using errcode='40001';
 end if;
 if a.submission_method<>'human_assisted' or a.status not in ('draft','needs_review','approved','prepared') or a.applied_at is not null then
   raise exception 'Already submitted or integration record cannot be replaced' using errcode='23514';
 end if;
 if jsonb_typeof(pack.content->'answers') is distinct from 'array' or exists(select 1 from jsonb_array_elements(pack.content->'answers') answer where nullif(trim(answer->>'answer'),'') is null) then
   raise exception 'Unanswered questions must be resolved first' using errcode='23514';
 end if;
 select effective_decision into decision from public.job_screening_summary where id=j.id;
 update public.applications set resume_id=pack.resume_id,cover_letter=pack.content->>'cover_letter',answers=jsonb_build_object('package_id',pack.id,'questions',pack.content->'answers'),status=case when decision='ELIGIBLE' then 'prepared' else 'needs_review' end where id=a.id;
 insert into public.package_reviews(user_id,package_id) values(auth.uid(),pack.id);
 insert into public.application_events(user_id,application_id,event_type,details) values(auth.uid(),a.id,'package_reviewed',jsonb_build_object('package_id',pack.id,'screening_decision',decision));
end;
$$;

create or replace function public.guard_preparation_facts() returns trigger language plpgsql set search_path='' as $$
begin
 perform 1 from public.candidate_profiles where user_id=new.user_id for update;
 if tg_table_name='answer_library' and not new.requires_review and
   new.question_pattern ~* '(visa|sponsor|authori[sz]|right to work|legally|legal|clearance|attest|certify|assessment|test|relocat|salary|compensation|pay expectation|criminal|disabilit|gender|ethnic|veteran|medical|consent|agree|declar|citizen|residen|willing|commit|availability|start date|notice period|reference|background)' then
   raise exception 'Sensitive answers always require review' using errcode='23514';
 end if;
 return new;
end;
$$;
commit;
