begin;
-- Require valid public original URLs; the canonical form remains a separate identity.
alter table public.jobs alter column normalized_url set default '';
alter table public.jobs add constraint jobs_original_url_valid check
 (original_url is null or length(original_url)<=2048 and public.normalize_job_url(original_url) is not null) not valid;

-- Reject incomplete affirmative reviews, including SQL NULL/missing boolean fields.
create function public.check_affirmative_review() returns trigger language plpgsql set search_path='' as $$
begin
 if new.decision='ELIGIBLE' and new.evaluation_version='phase3.1' then
  if not coalesce((new.evidence_snapshot->>'source_checked')='true',false)
    or not coalesce((new.evidence_snapshot->>'listing_checked')='true',false)
    or not coalesce((new.evidence_snapshot->>'qualifications')='met',false)
    or not coalesce((new.evidence_snapshot->>'authorization')='met',false)
    or new.job_updated_at is null or new.profile_updated_at is null then
   raise exception 'Affirmative screening requires a complete source review' using errcode='23514';
  end if;
 end if;
 return new;
end;
$$;
revoke all on function public.check_affirmative_review() from public,anon,authenticated;
create trigger affirmative_review before insert on public.eligibility_checks
 for each row execute function public.check_affirmative_review();

create or replace function public.dashboard_metrics() returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare tz text; start_of_day timestamptz; end_of_day timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select timezone into tz from public.candidate_profiles where user_id=auth.uid();
  tz:=coalesce(tz,'Asia/Karachi');
  start_of_day:=date_trunc('day',now() at time zone tz) at time zone tz;
  end_of_day:=(date_trunc('day',now() at time zone tz)+interval '1 day') at time zone tz;
  return jsonb_build_object(
    'jobs',(select count(*) from public.jobs where user_id=auth.uid()),
    'applications',(select count(*) from public.applications where user_id=auth.uid()),
    'needs_review',(select count(*) from public.applications where user_id=auth.uid() and status='needs_review'),
    'failed',(select count(*) from public.applications where user_id=auth.uid() and status='failed'),
    'responses',(select count(*) from public.applications where user_id=auth.uid() and status in ('responded','interview','offer','rejected') and applied_at is not null),
    'interviews',(select count(*) from public.applications where user_id=auth.uid() and status='interview'),
    'manual_today',(select count(*) from public.applications where user_id=auth.uid()
      and submission_method='human_assisted' and confirmation_evidence->>'kind'='candidate_reported'
      and applied_at>=start_of_day and applied_at<end_of_day and applied_at<=now()),
    'follow_ups_due',(select count(*) from public.applications where user_id=auth.uid()
      and follow_up_at<=now() and status in ('submitted','responded','interview')),
    'masters',(select count(*) from public.resumes where user_id=auth.uid() and is_master),
    'eligible_jobs',(select count(*) from public.job_screening_summary where effective_decision='ELIGIBLE' and disposition<>'rejected'),
    'review_jobs',(select count(*) from public.job_screening_summary where effective_decision='NEEDS_REVIEW' and disposition<>'rejected'),
    'unassessed_jobs',(select count(*) from public.job_screening_summary where effective_decision is null and disposition<>'rejected'),
    'timezone',tz);
end;
$$;

commit;
