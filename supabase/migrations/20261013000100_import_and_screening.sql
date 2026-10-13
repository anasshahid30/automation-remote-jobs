-- Additive Phase 3 schema; existing candidate data and documents are preserved.
begin;

create function public.normalize_job_url(p_url text) returns text
language plpgsql immutable strict set search_path = '' as $$
declare parts text[]; host text; path text; query text; fragment text; id text; company text;
begin
  parts:=regexp_match(trim(p_url),'^https://([^/?#]+)([^?#]*)([?][^#]*)?(#.*)?$');
  if parts is null or parts[1] ~ '[@[:space:]\\]' or parts[1] !~ '^(\[[0-9a-fA-F:]+\]|[a-zA-Z0-9.-]+)(:[0-9]+)?$' then
    raise exception 'Invalid HTTPS listing URL' using errcode='23514';
  end if;
  host:=lower(regexp_replace(parts[1],':443$','')); path:=coalesce(nullif(regexp_replace(parts[2],'/+$',''),''),'/');
  query:=substring(coalesce(parts[3],'') from 2); fragment:=case when parts[4] ~ '^#(!/|/)' then parts[4] else '' end;
  if host in ('linkedin.com','www.linkedin.com','m.linkedin.com') and path ~ '^/jobs/view/([^/]*-)?[0-9]+$' then
    id:=substring(path from '([0-9]+)$'); host:='www.linkedin.com'; path:='/jobs/view/'||id; query:='';
  elsif host in ('jobs.lever.co','jobs.eu.lever.co') and path ~ '^/[^/]+/[^/]+(/apply)?$' then
    path:=regexp_replace(path,'/apply$',''); query:='';
  elsif host in ('boards.greenhouse.io','job-boards.greenhouse.io') then
    if path ~ '^/[A-Za-z0-9_-]+/jobs/[0-9]+$' then
      host:='job-boards.greenhouse.io'; query:='';
    elsif path='/embed/job_app' then
      company:=substring(query from '(?:^|&)for=([A-Za-z0-9_-]+)(?:&|$)'); id:=substring(query from '(?:^|&)token=([0-9]+)(?:&|$)');
      if company is not null and id is not null then host:='job-boards.greenhouse.io'; path:='/'||company||'/jobs/'||id; query:=''; end if;
    end if;
  elsif host in ('wellfound.com','www.wellfound.com') and path ~ '^/jobs/[0-9]+(-[^/]*)?$' then
    id:=substring(path from '^/jobs/([0-9]+)'); host:='wellfound.com'; path:='/jobs/'||id; query:='';
  end if;
  select string_agg(part,'&' order by split_part(part,'=',1),ordinality) into query
    from unnest(string_to_array(query,'&')) with ordinality as pieces(part,ordinality)
    where part<>'' and split_part(part,'=',1) !~* '^(utm_.*|fbclid|gclid|msclkid)$';
  return 'https://'||host||path||case when query is null or query='' then '' else '?'||query end||coalesce(fragment,'');
end;
$$;
revoke all on function public.normalize_job_url(text) from public,anon;
grant execute on function public.normalize_job_url(text) to authenticated,service_role;

alter table public.jobs
  add column original_url text,
  add column normalized_url text,
  add column employer_region text not null default 'unknown' check (employer_region in ('USA','UK','Europe','Australia','other','unknown')),
  add column disposition text not null default 'saved' check (disposition in ('saved','shortlisted','rejected')),
  add column duplicate_key text generated always as
    (md5(lower(regexp_replace(company_name,'[^[:alnum:]]','','g'))||chr(31)||lower(regexp_replace(job_title,'[^[:alnum:]]','','g')))) stored;
update public.jobs set normalized_url=public.normalize_job_url(canonical_url),original_url=canonical_url;
-- Pre-existing collisions fail visibly for review; never silently merge CRM history.
alter table public.jobs alter column normalized_url set not null;
create unique index jobs_normalized_identity on public.jobs(user_id,normalized_url);
create index jobs_possible_duplicates on public.jobs(user_id,duplicate_key);

create function public.set_job_identity() returns trigger language plpgsql set search_path='' as $$
begin
  new.normalized_url:=public.normalize_job_url(new.canonical_url);
  if TG_OP='INSERT' then new.original_url:=coalesce(new.original_url,new.canonical_url); end if;
  return new;
end;
$$;
revoke all on function public.set_job_identity() from public,anon,authenticated;
create trigger job_identity before insert or update on public.jobs for each row execute function public.set_job_identity();

create function public.valid_scoring_weights(p_weights jsonb) returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(p_weights)='object' and
   (select count(*)=5 and bool_and(key=any(array['relevance','seniority','geography','compensation','employment']))
    and bool_and(jsonb_typeof(value)='number') and bool_and(case when jsonb_typeof(value)='number' then value::text::numeric between 0 and 100 else false end)
    and abs(sum(case when jsonb_typeof(value)='number' then value::text::numeric else 0 end)-100)<0.001
    from jsonb_each(case when jsonb_typeof(p_weights)='object' then p_weights else '{}'::jsonb end));
$$;
revoke all on function public.valid_scoring_weights(jsonb) from public,anon;
grant execute on function public.valid_scoring_weights(jsonb) to authenticated,service_role;
alter table public.candidate_profiles add column scoring_weights jsonb not null
  default '{"relevance":35,"seniority":20,"geography":20,"compensation":15,"employment":10}'
  check (public.valid_scoring_weights(scoring_weights));

alter table public.eligibility_checks
  add column is_current boolean not null default false,
  add column job_updated_at timestamptz,
  add column profile_updated_at timestamptz,
  add column resume_snapshot jsonb not null default '[]',
  add column evidence_snapshot jsonb not null default '{}';
create unique index eligibility_current on public.eligibility_checks(user_id,job_id) where is_current;
revoke update on public.eligibility_checks from authenticated;
grant update(is_current) on public.eligibility_checks to authenticated;

create table public.job_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id uuid not null,
  review jsonb not null check (jsonb_typeof(review)='object' and octet_length(review::text)<=50000),
  reviewed_at timestamptz not null default now(),
  unique(user_id,job_id),
  foreign key(job_id,user_id) references public.jobs(id,user_id) on delete cascade
);
create table public.job_classifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id uuid not null,
  job_updated_at timestamptz not null,
  provider text not null check (provider='openai'),
  model text not null check (length(model) between 1 and 100),
  suggestion jsonb not null check (jsonb_typeof(suggestion)='object' and octet_length(suggestion::text)<=10000),
  created_at timestamptz not null default now(),
  foreign key(job_id,user_id) references public.jobs(id,user_id) on delete cascade
);
do $$ declare t text; begin
 foreach t in array array['job_reviews','job_classifications'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('create policy own_select on public.%I for select to authenticated using ((select auth.uid())=user_id)',t);
  execute format('create policy own_insert on public.%I for insert to authenticated with check ((select auth.uid())=user_id)',t);
  execute format('create policy own_update on public.%I for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id)',t);
  execute format('create policy own_delete on public.%I for delete to authenticated using ((select auth.uid())=user_id)',t);
 end loop;
end $$;

create function public.invalidate_screening() returns trigger language plpgsql set search_path='' as $$
declare owner_id uuid;
begin
  if TG_TABLE_NAME='jobs' then
    if (to_jsonb(new)-array['updated_at','disposition','last_checked_at']) is distinct from
       (to_jsonb(old)-array['updated_at','disposition','last_checked_at']) then
      update public.eligibility_checks set is_current=false where user_id=new.user_id and job_id=new.id and is_current;
    end if;
  else
    owner_id:=case when TG_OP='DELETE' then old.user_id else new.user_id end;
    -- Same profile lock as master selection/screening; serialize changes to verified skills.
    perform 1 from public.candidate_profiles where user_id=owner_id for update;
    update public.eligibility_checks set is_current=false where user_id=owner_id and is_current;
  end if;
  return case when TG_OP='DELETE' then old else new end;
end;
$$;
revoke all on function public.invalidate_screening() from public,anon,authenticated;
create trigger invalidate_job_screen after update on public.jobs for each row execute function public.invalidate_screening();
create trigger invalidate_profile_screen after update on public.candidate_profiles for each row execute function public.invalidate_screening();
create trigger invalidate_resume_screen after insert or update or delete on public.resumes for each row execute function public.invalidate_screening();

create function public.import_jobs(p_jobs jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare item jsonb; new_id uuid; existing_ids uuid[]; result jsonb:='[]'; created boolean; normalized text; platform text; external_id text; duplicate_count integer;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if jsonb_typeof(p_jobs)<>'array' or jsonb_array_length(p_jobs) not between 1 and 20 then raise exception 'Import 1 to 20 jobs' using errcode='22023'; end if;
 for item in select value from jsonb_array_elements(p_jobs) loop
  if length(trim(item->>'company_name')) not between 1 and 200 or length(trim(item->>'job_title')) not between 1 and 200
    or length(item->>'description') not between 1 and 100000 or item->>'company_name' is null or item->>'job_title' is null or item->>'description' is null then
    raise exception 'Invalid job import' using errcode='22023';
  end if;
  normalized:=public.normalize_job_url(item->>'canonical_url'); platform:=coalesce(item->>'source_platform','manual'); external_id:=nullif(item->>'external_job_id','');
  if normalized is null or platform not in ('manual','linkedin','wellfound','greenhouse','lever','career_page','other') or length(external_id)>300 then
    raise exception 'Invalid source identity' using errcode='22023';
  end if;
  new_id:=null;
  insert into public.jobs(user_id,canonical_url,original_url,source_platform,external_job_id,company_name,job_title,description)
    values(auth.uid(),normalized,coalesce(item->>'original_url',item->>'canonical_url'),platform,external_id,item->>'company_name',item->>'job_title',item->>'description')
    on conflict do nothing returning id into new_id;
  created:=new_id is not null;
  select array_agg(id order by id) into existing_ids from public.jobs where user_id=auth.uid() and
    (normalized_url=normalized or (external_id is not null and source_platform=platform and external_job_id=external_id));
  if cardinality(existing_ids)<>1 then raise exception 'Conflicting URL and source identities; review existing records' using errcode='23505'; end if;
  new_id:=existing_ids[1];
  select count(*) into duplicate_count from public.jobs j where j.user_id=auth.uid() and j.id<>new_id and
    j.duplicate_key=(select duplicate_key from public.jobs where id=new_id and user_id=auth.uid());
  result:=result||jsonb_build_array(jsonb_build_object('id',new_id,'title',item->>'job_title','created',created,'possible_duplicates',duplicate_count));
 end loop;
 return result;
end;
$$;
revoke all on function public.import_jobs(jsonb) from public,anon;
grant execute on function public.import_jobs(jsonb) to authenticated;

create function public.record_job_screening(p_job_id uuid,p_job_updated_at timestamptz,p_profile_updated_at timestamptz,p_resume_snapshot jsonb,p_review jsonb,p_result jsonb)
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
   is_current,job_updated_at,profile_updated_at,resume_snapshot,evidence_snapshot)
 values(auth.uid(),job.id,p_result->>'decision',p_result->>'remote_check',p_result->>'pakistan_eligibility',p_result->>'salary_check',
   (p_result->>'match_score')::numeric,(p_result->>'confidence')::numeric,array(select jsonb_array_elements_text(p_result->'reasons')),
   array(select jsonb_array_elements_text(p_result->'evidence_urls')),p_result->'factors',p_result->>'evaluation_version',
   true,job.updated_at,profile.updated_at,current_resumes,p_review) returning id into check_id;
 return check_id;
end;
$$;
revoke all on function public.record_job_screening(uuid,timestamptz,timestamptz,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.record_job_screening(uuid,timestamptz,timestamptz,jsonb,jsonb,jsonb) to authenticated;

create view public.job_screening_summary with (security_invoker=true) as
 select j.*,
   c.id as check_id,c.match_score,c.checked_at,c.reasons,
   case when c.id is null then null
        when j.listing_status in ('closed','expired') or j.expires_at<=now() then 'INELIGIBLE'
        when not c.is_current or c.checked_at<now()-interval '7 days' then 'NEEDS_REVIEW'
        else c.decision end as effective_decision,
   coalesce(not c.is_current or c.checked_at<now()-interval '7 days',false) as screening_stale,
   case when c.is_current then (c.factors->>'monthly_min')::numeric end as monthly_min_candidate,
   case when c.is_current then c.factors->>'currency' end as screening_currency,
   (select count(*) from public.jobs other where other.user_id=j.user_id and other.id<>j.id and other.duplicate_key=j.duplicate_key) as possible_duplicates
 from public.jobs j left join lateral
   (select * from public.eligibility_checks ec where ec.user_id=j.user_id and ec.job_id=j.id order by ec.checked_at desc,ec.id desc limit 1) c on true
 where j.user_id=auth.uid();
revoke all on public.job_screening_summary from public,anon;
grant select on public.job_screening_summary to authenticated;

commit;
