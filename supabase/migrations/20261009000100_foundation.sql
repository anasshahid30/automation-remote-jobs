-- Apply once through Supabase migration history. No resets or destructive changes.
begin;

create table public.candidate_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 1 and 200),
  email text not null check (length(email) between 3 and 254),
  phone text,
  country text not null default 'Pakistan',
  city text, -- User-supplied real location; no invented default.
  salary_min_monthly numeric(12,2) not null default 1500 check (salary_min_monthly >= 0),
  salary_currency text not null default 'USD' check (salary_currency ~ '^[A-Z]{3}$'),
  employment_types text[] not null default array['full_time','contract']
    check (cardinality(employment_types) > 0 and employment_types <@ array['full_time','contract']),
  target_regions text[] not null default array['USA','UK','Europe','Australia'],
  target_seniority text[] not null default array['junior','mid']
    check (cardinality(target_seniority) > 0 and target_seniority <@ array['junior','mid']),
  target_roles text[] not null default array['backend','ai_automation','full_stack']
    check (cardinality(target_roles) > 0 and target_roles <@ array['backend','ai_automation','full_stack']),
  remote_only boolean not null default true,
  work_authorization_notes text,
  sponsorship_preferences text,
  availability_notes text,
  daily_target integer not null default 30 check (daily_target between 1 and 30),
  timezone text not null default 'Asia/Karachi',
  salary_unknown_policy text not null default 'needs_review' check (salary_unknown_policy in ('needs_review','exclude')),
  automation_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id), unique (id, user_id)
);

create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  profile_id uuid not null,
  role_category text not null check (role_category in ('backend','ai_automation','full_stack')),
  version_name text not null check (length(trim(version_name)) between 1 and 200),
  storage_path text not null,
  skills text[] not null default '{}',
  experience_summary text,
  is_master boolean not null default false,
  parent_resume_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id), unique (user_id, storage_path),
  foreign key (profile_id, user_id) references public.candidate_profiles(id, user_id) on delete cascade,
  foreign key (parent_resume_id, user_id) references public.resumes(id, user_id),
  check (split_part(storage_path, '/', 1) = user_id::text),
  check (storage_path !~ '(^|/)\.\.(/|$)' and length(storage_path) <= 1024)
);
-- Multiple immutable versions may be retained, including old masters.
create unique index resumes_version_unique on public.resumes(profile_id, role_category, version_name);

create table public.source_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  platform text not null,
  account_label text not null,
  account_email_hint text,
  status text not null default 'not_connected' check (status in ('not_connected','active','disabled','error')),
  integration_method text not null default 'human_assisted' check (integration_method in ('manual','human_assisted','authorized_feed','documented_api')),
  last_checked_at timestamptz,
  notes text, -- Metadata only; never passwords, cookies, or tokens.
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_platform text not null,
  external_job_id text,
  canonical_url text not null check (canonical_url ~ '^https://[^[:space:]]+$'),
  company_name text not null,
  job_title text not null,
  description text not null,
  role_category text check (role_category in ('backend','ai_automation','full_stack','other')),
  employment_type text check (employment_type in ('full_time','contract','other','unknown')),
  seniority text check (seniority in ('junior','mid','senior','other','unknown')),
  workplace_type text not null default 'unknown' check (workplace_type in ('remote','hybrid','onsite','unknown')),
  remote_scope text not null default 'unknown' check (remote_scope in ('worldwide','country_restricted','region_restricted','unknown')),
  eligible_countries text[] not null default '{}',
  restricted_countries text[] not null default '{}',
  salary_min_annual numeric(14,2) check (salary_min_annual >= 0),
  salary_max_annual numeric(14,2) check (salary_max_annual >= 0),
  salary_currency text check (salary_currency ~ '^[A-Z]{3}$'),
  salary_period text not null default 'unknown' check (salary_period in ('hourly','monthly','annual','unknown')),
  -- Original rate is separate from normalized annual amounts; never assume hours/FX.
  salary_min_original numeric(14,2) check (salary_min_original >= 0),
  salary_max_original numeric(14,2) check (salary_max_original >= 0),
  posted_at timestamptz,
  expires_at timestamptz,
  discovered_at timestamptz not null default now(),
  last_checked_at timestamptz,
  listing_status text not null default 'unknown' check (listing_status in ('active','expired','closed','unknown')),
  raw_metadata jsonb not null default '{}' check (jsonb_typeof(raw_metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id), unique (user_id, canonical_url),
  check (salary_max_annual is null or salary_min_annual is null or salary_max_annual >= salary_min_annual),
  check (salary_max_original is null or salary_min_original is null or salary_max_original >= salary_min_original),
  check ((salary_min_annual is null and salary_max_annual is null and salary_min_original is null and salary_max_original is null) or salary_currency is not null)
);
create unique index jobs_source_identity_unique on public.jobs(user_id, source_platform, external_job_id) where external_job_id is not null;

create table public.eligibility_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id uuid not null,
  decision text not null check (decision in ('ELIGIBLE','INELIGIBLE','NEEDS_REVIEW')),
  remote_check text not null check (remote_check in ('pass','fail','unknown')),
  pakistan_eligibility text not null check (pakistan_eligibility in ('pass','fail','unknown')),
  salary_check text not null check (salary_check in ('pass','fail','unknown')),
  match_score numeric(5,2) not null check (match_score between 0 and 100),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  reasons text[] not null check (cardinality(reasons) > 0),
  evidence_urls text[] not null default '{}',
  factors jsonb not null default '{}' check (jsonb_typeof(factors) = 'object'),
  evaluation_version text not null,
  checked_at timestamptz not null default now(),
  foreign key (job_id, user_id) references public.jobs(id, user_id) on delete cascade,
  check (decision <> 'ELIGIBLE' or (remote_check = 'pass' and pakistan_eligibility = 'pass' and salary_check = 'pass' and cardinality(evidence_urls) > 0))
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id uuid not null,
  resume_id uuid,
  source_account_id uuid,
  status text not null default 'draft' check (status in ('draft','needs_review','approved','prepared','submitted','failed','responded','interview','offer','rejected','withdrawn')),
  cover_letter text,
  answers jsonb not null default '{}' check (jsonb_typeof(answers) = 'object'),
  submission_method text not null default 'human_assisted' check (submission_method in ('human_assisted','authorized_api')),
  submission_reference text,
  confirmation_evidence jsonb check (jsonb_typeof(confirmation_evidence) = 'object' and confirmation_evidence <> '{}'),
  applied_at timestamptz,
  follow_up_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id), unique (user_id, job_id),
  foreign key (job_id, user_id) references public.jobs(id, user_id) on delete cascade,
  foreign key (resume_id, user_id) references public.resumes(id, user_id),
  foreign key (source_account_id, user_id) references public.source_accounts(id, user_id),
  check (status not in ('submitted','responded','interview','offer') or (applied_at is not null and confirmation_evidence is not null)),
  check (applied_at is null or confirmation_evidence is not null)
);

create table public.answer_library (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  question_key text not null,
  question_pattern text not null,
  answer_text text not null,
  category text not null check (category in ('routine','experience','salary','sponsorship','legal','assessment','personal')),
  requires_review boolean not null default true,
  verified_by_candidate boolean not null default false,
  verified_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, question_key),
  check (not verified_by_candidate or verified_at is not null),
  check (requires_review or (verified_by_candidate and category in ('routine','experience')))
);

create table public.application_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  application_id uuid not null,
  event_type text not null check (event_type in ('discovered','screened','prepared','approved','submission_attempted','submitted','error','response','follow_up','status_changed')),
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object'),
  occurred_at timestamptz not null default now(),
  foreign key (application_id, user_id) references public.applications(id, user_id) on delete cascade
);

create index jobs_filters on public.jobs(user_id, listing_status, role_category);
create index jobs_expiry on public.jobs(user_id, expires_at) where expires_at is not null;
create index resumes_profile on public.resumes(user_id, profile_id);
create index eligibility_job on public.eligibility_checks(user_id, job_id, checked_at desc);
create index eligibility_queue on public.eligibility_checks(user_id, decision);
create index applications_status on public.applications(user_id, status);
create index applications_resume on public.applications(user_id, resume_id);
create index applications_source on public.applications(user_id, source_account_id);
create index applications_follow_up on public.applications(user_id, follow_up_at) where follow_up_at is not null;
create index events_application on public.application_events(user_id, application_id, occurred_at desc);

create function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
revoke all on function public.set_updated_at() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['candidate_profiles','resumes','source_accounts','jobs','eligibility_checks','applications','answer_library','application_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select, insert on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('create policy own_select on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy own_insert on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    if t <> 'application_events' then
      execute format('grant update, delete on table public.%I to authenticated', t);
      execute format('create policy own_update on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
      execute format('create policy own_delete on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t);
    end if;
  end loop;
  foreach t in array array['candidate_profiles','resumes','jobs','applications','answer_library'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- Authenticated health probe verifies the expected schema; exposes no candidate data.
create function public.database_health() returns text language sql stable security invoker set search_path = '' as $$
  select case when to_regclass('public.candidate_profiles') is not null
    and to_regclass('public.application_events') is not null then 'ok' else 'incomplete' end;
$$;
revoke all on function public.database_health() from public, anon;
grant execute on function public.database_health() to authenticated, service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('resumes', 'resumes', false, 10485760, array['application/pdf','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document']);

create policy resume_read on storage.objects for select to authenticated
using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy resume_insert on storage.objects for insert to authenticated
with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- No UPDATE policy: document versions must use new paths; masters cannot be overwritten through the API.
create policy resume_delete on storage.objects for delete to authenticated
using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;
