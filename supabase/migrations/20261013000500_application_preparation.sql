begin;

create table public.resume_facts (
  resume_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  text_content text not null check (length(text_content) between 1 and 60000),
  verified_by_candidate boolean not null default false,
  verified_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  foreign key(resume_id,user_id) references public.resumes(id,user_id) on delete cascade,
  check (not verified_by_candidate or verified_at is not null)
);
alter table public.resume_facts enable row level security;
create policy owner_facts on public.resume_facts to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update on public.resume_facts to authenticated;
grant all on public.resume_facts to service_role;
create trigger facts_updated before update on public.resume_facts for each row execute function public.set_updated_at();

-- Verification must accompany the current text, including direct Data API writes.
create function public.verify_candidate_text() returns trigger language plpgsql set search_path='' as $$
begin
 if new.verified_by_candidate then new.verified_at:=clock_timestamp(); else new.verified_at:=null; end if;
 return new;
end;
$$;
create trigger verify_facts before insert or update on public.resume_facts for each row execute function public.verify_candidate_text();
create trigger verify_answers before insert or update on public.answer_library for each row execute function public.verify_candidate_text();

create table public.application_packages (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 application_id uuid not null,
 resume_id uuid not null,
 request_id uuid not null,
 job_updated_at timestamptz not null,
 profile_updated_at timestamptz not null,
 facts_updated_at timestamptz not null,
 answer_snapshot jsonb not null check(jsonb_typeof(answer_snapshot)='array'),
 content jsonb not null check(jsonb_typeof(content)='object' and octet_length(content::text)<=200000),
 created_at timestamptz not null default clock_timestamp(),
 unique(id,user_id), unique(user_id,request_id),
 foreign key(application_id,user_id) references public.applications(id,user_id) on delete cascade,
 foreign key(resume_id,user_id) references public.resumes(id,user_id)
);
alter table public.application_packages enable row level security;
create policy owner_packages on public.application_packages to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert on public.application_packages to authenticated;
grant all on public.application_packages to service_role;
create index package_application on public.application_packages(application_id,created_at desc);

create table public.package_reviews (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 package_id uuid not null,
 reviewed_at timestamptz not null default clock_timestamp(),
 foreign key(package_id,user_id) references public.application_packages(id,user_id) on delete cascade
);
alter table public.package_reviews enable row level security;
create policy owner_package_reviews on public.package_reviews to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert on public.package_reviews to authenticated;
grant all on public.package_reviews to service_role;

create function public.answer_version_snapshot() returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'updated_at',updated_at) order by id),'[]') from public.answer_library where user_id=auth.uid();
$$;
revoke all on function public.answer_version_snapshot() from public,anon;
grant execute on function public.answer_version_snapshot() to authenticated;

create function public.record_application_package(p_application_id uuid,p_resume_id uuid,p_request_id uuid,p_application_updated_at timestamptz,p_job_updated_at timestamptz,p_profile_updated_at timestamptz,p_facts_updated_at timestamptz,p_answer_snapshot jsonb,p_content jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare a public.applications; j public.jobs; p public.candidate_profiles; f public.resume_facts; result uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 -- Match the screening engine's job/profile lock order; serialize preparations per owner.
 select * into a from public.applications where id=p_application_id and user_id=auth.uid();
 if not found then raise exception 'Application unavailable' using errcode='42501'; end if;
 select * into j from public.jobs where id=a.job_id and user_id=auth.uid() for update;
 select * into p from public.candidate_profiles where user_id=auth.uid() for update;
 select * into a from public.applications where id=p_application_id and user_id=auth.uid() for update;
 select id into result from public.application_packages where user_id=auth.uid() and request_id=p_request_id and application_id=a.id;
 if found then return result; end if;
 select * into f from public.resume_facts where resume_id=p_resume_id and user_id=auth.uid() for update;
 if not found or not f.verified_by_candidate then raise exception 'Verified resume text required' using errcode='23514'; end if;
 if a.updated_at is distinct from p_application_updated_at or j.updated_at is distinct from p_job_updated_at or p.updated_at is distinct from p_profile_updated_at or f.updated_at is distinct from p_facts_updated_at or public.answer_version_snapshot() is distinct from p_answer_snapshot then
   raise exception 'Preparation inputs changed; reload' using errcode='40001';
 end if;
 insert into public.application_packages(user_id,application_id,resume_id,request_id,job_updated_at,profile_updated_at,facts_updated_at,answer_snapshot,content)
 values(auth.uid(),a.id,p_resume_id,p_request_id,j.updated_at,p.updated_at,f.updated_at,p_answer_snapshot,p_content) returning id into result;
 insert into public.application_events(user_id,application_id,event_type,details) values(auth.uid(),a.id,'package_generated',jsonb_build_object('package_id',result,'resume_id',p_resume_id));
 return result;
end;
$$;
revoke all on function public.record_application_package(uuid,uuid,uuid,timestamptz,timestamptz,timestamptz,timestamptz,jsonb,jsonb) from public,anon;
grant execute on function public.record_application_package(uuid,uuid,uuid,timestamptz,timestamptz,timestamptz,timestamptz,jsonb,jsonb) to authenticated;

create function public.review_application_package(p_package_id uuid,p_application_updated_at timestamptz)
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
 update public.applications set resume_id=pack.resume_id,cover_letter=pack.content->>'cover_letter',answers=pack.content->'answers',status=case when decision='ELIGIBLE' then 'prepared' else 'needs_review' end where id=a.id;
 insert into public.package_reviews(user_id,package_id) values(auth.uid(),pack.id);
 insert into public.application_events(user_id,application_id,event_type,details) values(auth.uid(),a.id,'package_reviewed',jsonb_build_object('package_id',pack.id,'screening_decision',decision));
end;
$$;
revoke all on function public.review_application_package(uuid,timestamptz) from public,anon;
grant execute on function public.review_application_package(uuid,timestamptz) to authenticated;
commit;
