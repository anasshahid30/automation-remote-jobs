begin;
alter table public.eligibility_checks add column valid_until timestamptz;
alter table public.action_limits drop constraint action_limits_action_check;
alter table public.action_limits add constraint action_limits_action_check check(action in ('upload','mutation','classification'));
create or replace function public.consume_action_budget(p_action text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare budget_time timestamptz := clock_timestamp(); current_count integer; window_size interval; max_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_action='upload' then window_size:=interval '1 hour'; max_count:=10;
  elsif p_action='classification' then window_size:=interval '1 hour'; max_count:=10;
  elsif p_action='mutation' then window_size:=interval '5 minutes'; max_count:=120;
  else raise exception 'Unsupported action' using errcode='22023'; end if;
  insert into public.action_limits as limits(user_id,action,window_start,request_count)
  values(auth.uid(),p_action,budget_time,1)
  on conflict (user_id,action) do update set
    request_count=case when limits.window_start+window_size<=budget_time then 1 else limits.request_count+1 end,
    window_start=case when limits.window_start+window_size<=budget_time then budget_time else limits.window_start end
  returning request_count into current_count;
  return current_count<=max_count;
end;
$$;


create or replace function public.record_job_screening(p_job_id uuid,p_job_updated_at timestamptz,p_profile_updated_at timestamptz,p_resume_snapshot jsonb,p_review jsonb,p_result jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare job public.jobs; profile public.candidate_profiles; current_resumes jsonb; citation jsonb; check_id uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into job from public.jobs where id=p_job_id and user_id=auth.uid() for update;
 if not found then raise exception 'Job unavailable' using errcode='42501'; end if;
 select * into profile from public.candidate_profiles where user_id=auth.uid() for update;
 if not found then raise exception 'Profile required' using errcode='23514'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'updated_at',updated_at) order by id),'[]') into current_resumes
   from public.resumes where user_id=auth.uid() and is_master;
 if job.updated_at is distinct from p_job_updated_at or profile.updated_at is distinct from p_profile_updated_at or current_resumes is distinct from p_resume_snapshot then
   raise exception 'Screening inputs changed; reload and reevaluate' using errcode='40001';
 end if;
 if jsonb_typeof(p_review)<>'object' or jsonb_typeof(p_review->'citations')<>'array' or jsonb_array_length(p_review->'citations')>9 or octet_length(p_review::text)>50000 then
   raise exception 'Invalid source review' using errcode='23514';
 end if;
 for citation in select value from jsonb_array_elements(p_review->'citations') loop
  if length(citation->>'quote') not between 3 and 3000 or citation->>'quote' is null or citation->>'url' is null or
    position(citation->>'quote' in job.job_title||E'\n'||job.description)=0 or public.normalize_job_url(citation->>'url') is null then
    raise exception 'Source quotes must be grounded in the saved listing' using errcode='23514';
  end if;
 end loop;
 if p_result->>'decision'='ELIGIBLE' and (p_review->>'source_checked'<>'true' or p_review->>'listing_checked'<>'true'
    or p_review->>'qualifications'<>'met' or p_review->>'authorization'<>'met' or jsonb_array_length(p_review->'citations')<7
    or job.listing_status<>'active' or job.expires_at<=clock_timestamp()) then
   raise exception 'Affirmative screening requires complete source review' using errcode='23514';
 end if;
 update public.eligibility_checks set is_current=false where user_id=auth.uid() and job_id=job.id and is_current;
 insert into public.job_reviews(user_id,job_id,review,reviewed_at) values(auth.uid(),job.id,p_review,clock_timestamp())
   on conflict(user_id,job_id) do update set review=excluded.review,reviewed_at=excluded.reviewed_at;
 insert into public.eligibility_checks(user_id,job_id,decision,remote_check,pakistan_eligibility,salary_check,match_score,confidence,reasons,evidence_urls,factors,evaluation_version,
   is_current,job_updated_at,profile_updated_at,resume_snapshot,evidence_snapshot,valid_until)
 values(auth.uid(),job.id,p_result->>'decision',p_result->>'remote_check',p_result->>'pakistan_eligibility',p_result->>'salary_check',
   (p_result->>'match_score')::numeric,(p_result->>'confidence')::numeric,array(select jsonb_array_elements_text(p_result->'reasons')),
   array(select jsonb_array_elements_text(p_result->'evidence_urls')),p_result->'factors',p_result->>'evaluation_version',
   true,job.updated_at,profile.updated_at,current_resumes,p_review,(p_result#>>'{factors,valid_until}')::timestamptz) returning id into check_id;
 return check_id;
end;
$$;

create or replace view public.job_screening_summary with (security_invoker=true) as
 select j.*,
   c.id as check_id,c.match_score,c.checked_at,c.reasons,
   case when c.id is null then null
        when j.listing_status in ('closed','expired') or j.expires_at<=now() then 'INELIGIBLE'
        when not c.is_current or c.checked_at<now()-interval '7 days' or c.valid_until<=now() or c.evaluation_version<>'phase3.1' or c.profile_updated_at is distinct from (select updated_at from public.candidate_profiles where user_id=j.user_id) or c.resume_snapshot is distinct from (select coalesce(jsonb_agg(jsonb_build_object('id',id,'updated_at',updated_at) order by id),'[]') from public.resumes where user_id=j.user_id and is_master) then 'NEEDS_REVIEW'
        else c.decision end as effective_decision,
   case when c.id is null then false else coalesce((not c.is_current or c.checked_at<now()-interval '7 days' or c.valid_until<=now() or c.evaluation_version<>'phase3.1' or c.profile_updated_at is distinct from (select updated_at from public.candidate_profiles where user_id=j.user_id) or c.resume_snapshot is distinct from (select coalesce(jsonb_agg(jsonb_build_object('id',id,'updated_at',updated_at) order by id),'[]') from public.resumes where user_id=j.user_id and is_master)),false) end as screening_stale,
   case when c.is_current and not coalesce((not c.is_current or c.checked_at<now()-interval '7 days' or c.valid_until<=now() or c.evaluation_version<>'phase3.1' or c.profile_updated_at is distinct from (select updated_at from public.candidate_profiles where user_id=j.user_id) or c.resume_snapshot is distinct from (select coalesce(jsonb_agg(jsonb_build_object('id',id,'updated_at',updated_at) order by id),'[]') from public.resumes where user_id=j.user_id and is_master)),false) and jsonb_typeof(c.factors->'monthly_min')='number' then (c.factors->>'monthly_min')::numeric end as monthly_min_candidate,
   case when c.is_current then c.factors->>'currency' end as screening_currency,
   (select count(*) from public.jobs other where other.user_id=j.user_id and other.id<>j.id and other.duplicate_key=j.duplicate_key) as possible_duplicates
 from public.jobs j left join lateral
   (select * from public.eligibility_checks ec where ec.user_id=j.user_id and ec.job_id=j.id order by ec.checked_at desc,ec.id desc limit 1) c on true
 where j.user_id=auth.uid();

commit;
