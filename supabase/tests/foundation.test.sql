-- Local/test databases only. All fixtures are rolled back; no real applications.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select ok(c.relrowsecurity, t || ' has RLS')
from unnest(array['candidate_profiles','resumes','source_accounts','jobs','eligibility_checks','applications','answer_library','application_events']) t
join pg_class c on c.oid = ('public.' || t)::regclass;
select ok(not has_table_privilege('anon', 'public.' || t, 'SELECT'), t || ' denies anonymous SELECT')
from unnest(array['candidate_profiles','resumes','source_accounts','jobs','eligibility_checks','applications','answer_library','application_events']) t;
select ok(not has_table_privilege('anon', 'public.' || t, 'INSERT'), t || ' denies anonymous writes')
from unnest(array['candidate_profiles','resumes','source_accounts','jobs','eligibility_checks','applications','answer_library','application_events']) t;
select ok(not has_function_privilege('anon', 'public.database_health()', 'EXECUTE'), 'anonymous health RPC is denied');
select ok(not public, 'resume bucket is private') from storage.buckets where id = 'resumes';
select is(file_size_limit, 10485760::bigint, 'resume uploads limited to 10 MiB') from storage.buckets where id = 'resumes';

insert into auth.users(id, email) values
('10000000-0000-0000-0000-000000000001','owner-one@example.test'),
('10000000-0000-0000-0000-000000000002','owner-two@example.test');
insert into public.candidate_profiles(id,user_id,full_name,email) values
('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Test Two','owner-two@example.test');
insert into public.jobs(id,user_id,source_platform,external_job_id,canonical_url,company_name,job_title,description) values
('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','manual','two','https://example.test/two','Fixture Employer','Fixture role','Test fixture, not a real listing.');
insert into storage.objects(bucket_id,name,owner_id) values
('resumes','10000000-0000-0000-0000-000000000002/master.txt','10000000-0000-0000-0000-000000000002');

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select is(public.database_health(), 'ok', 'authenticated schema health works');
select is((select count(*) from public.candidate_profiles), 0::bigint, 'another owner profile is invisible');
select is((select count(*) from public.jobs), 0::bigint, 'another owner job is invisible');
select lives_ok($$insert into public.candidate_profiles(id,full_name,email) values ('20000000-0000-0000-0000-000000000001','Test One','owner-one@example.test')$$, 'owner can create own profile');
select is((select count(*) from public.candidate_profiles), 1::bigint, 'owner sees own profile');
select is((select country from public.candidate_profiles), 'Pakistan', 'country default is truthful initial preference');
select is((select city from public.candidate_profiles), null::text, 'real city is not invented');
select is((select salary_min_monthly from public.candidate_profiles), 1500::numeric, 'monthly salary preference is initialized');
select is((select daily_target from public.candidate_profiles), 30, 'daily target defaults to 30');
select ok(not (select automation_enabled from public.candidate_profiles), 'automation defaults paused');
select throws_ok($$update public.candidate_profiles set user_id='10000000-0000-0000-0000-000000000002'$$,'42501',null,'owner cannot transfer record ownership');
select throws_ok($$insert into public.resumes(profile_id,role_category,version_name,storage_path) values ('20000000-0000-0000-0000-000000000002','backend','v1','10000000-0000-0000-0000-000000000001/test.txt')$$,'23503',null,'cross-owner profile reference denied');
select throws_ok($$insert into public.resumes(profile_id,role_category,version_name,storage_path) values ('20000000-0000-0000-0000-000000000001','backend','v1','10000000-0000-0000-0000-000000000002/test.txt')$$,'23514',null,'cross-owner storage path denied');
select lives_ok($$insert into public.jobs(id,source_platform,external_job_id,canonical_url,company_name,job_title,description) values ('30000000-0000-0000-0000-000000000001','manual','one','https://example.test/one','Fixture Employer','Fixture role','Test fixture, not a real listing.')$$, 'owner can create own job');
select throws_ok($$insert into public.jobs(source_platform,external_job_id,canonical_url,company_name,job_title,description) values ('manual','one','https://example.test/changed-url','Fixture Employer','Fixture role','Test fixture')$$,'23505',null,'source identity deduplicates alternate URLs');
select throws_ok($$insert into public.jobs(source_platform,canonical_url,company_name,job_title,description) values ('another_source','https://example.test/one','Fixture Employer','Fixture role','Test fixture')$$,'23505',null,'canonical URL deduplicates alternate sources');
select is((select salary_min_annual from public.jobs where id='30000000-0000-0000-0000-000000000001'), null::numeric,'undisclosed salary stays unknown');
select lives_ok($$insert into public.applications(id,job_id) values ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001')$$,'owner can create draft');
select throws_ok($$insert into public.applications(job_id) values ('30000000-0000-0000-0000-000000000001')$$,'23505',null,'duplicate application denied by unique constraint');
select throws_ok($$insert into public.applications(job_id) values ('30000000-0000-0000-0000-000000000002')$$,'23503',null,'cross-owner job reference denied');
select throws_ok($$update public.applications set status='submitted'$$,'23514',null,'submission without confirmation denied');
select throws_ok($$insert into public.eligibility_checks(job_id,decision,remote_check,pakistan_eligibility,salary_check,match_score,confidence,reasons,evaluation_version) values ('30000000-0000-0000-0000-000000000001','ELIGIBLE','pass','unknown','unknown',100,1,array['Test fixture'],'test')$$,'23514',null,'unknown eligibility cannot be affirmed by a score');
select throws_ok($$insert into public.answer_library(question_key,question_pattern,answer_text,category,requires_review) values ('test','test','Test fixture','routine',false)$$,'23514',null,'unverified routine answers require review');
select throws_ok($$insert into public.answer_library(question_key,question_pattern,answer_text,category,requires_review,verified_by_candidate,verified_at) values ('test','test','Test fixture','sponsorship',false,true,now())$$,'23514',null,'sponsorship answers always require review');
select lives_ok($$insert into public.application_events(application_id,event_type) values ('40000000-0000-0000-0000-000000000001','prepared')$$,'owner can append event');
select throws_ok($$delete from public.application_events$$,'42501',null,'events cannot be deleted directly by authenticated users');
select throws_ok($$update public.application_events set event_type='submitted'$$,'42501',null,'events cannot be rewritten by authenticated users');
select is((select count(*) from storage.objects where bucket_id='resumes'), 0::bigint,'another owner resume is invisible');
select throws_ok($$insert into storage.objects(bucket_id,name) values ('resumes','10000000-0000-0000-0000-000000000002/forbidden.txt')$$,'42501',null,'cross-owner resume upload denied');
select lives_ok($$insert into storage.objects(bucket_id,name) values ('resumes','10000000-0000-0000-0000-000000000001/version-one.txt')$$,'owner can add new resume version');
with changed as (update storage.objects set name='10000000-0000-0000-0000-000000000001/overwrite.txt' where bucket_id='resumes' returning id)
select is(count(*), 0::bigint,'existing resume objects cannot be overwritten') from changed;

reset role;
select * from finish();
rollback;
