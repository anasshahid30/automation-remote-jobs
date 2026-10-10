-- Explicitly synthetic local fixtures. Everything, including budgets and audit events, rolls back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select ok(not has_table_privilege('authenticated','public.action_limits','UPDATE'),'users cannot reset shared action budgets');
select ok(not has_function_privilege('anon','public.consume_action_budget(text)','EXECUTE'),'anonymous budget RPC denied');
select ok(not has_function_privilege('anon','public.dashboard_metrics()','EXECUTE'),'anonymous metrics RPC denied');
select ok(not has_function_privilege('anon','public.select_resume_master(uuid)','EXECUTE'),'anonymous master selection denied');

insert into auth.users(id,email) values
 ('11000000-0000-0000-0000-000000000001','crm-one@example.test'),
 ('11000000-0000-0000-0000-000000000002','crm-two@example.test');
insert into public.candidate_profiles(id,user_id,full_name,email) values
 ('21000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','CRM Test One','crm-one@example.test'),
 ('21000000-0000-0000-0000-000000000002','11000000-0000-0000-0000-000000000002','CRM Test Two','crm-two@example.test');
insert into public.resumes(id,user_id,profile_id,role_category,version_name,storage_path) values
 ('31000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','backend','fixture v1','11000000-0000-0000-0000-000000000001/v1.txt'),
 ('31000000-0000-0000-0000-000000000003','11000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','backend','fixture v2','11000000-0000-0000-0000-000000000001/v2.txt'),
 ('31000000-0000-0000-0000-000000000002','11000000-0000-0000-0000-000000000002','21000000-0000-0000-0000-000000000002','backend','fixture v1','11000000-0000-0000-0000-000000000002/v1.txt');
insert into public.jobs(id,user_id,source_platform,canonical_url,company_name,job_title,description) values
 ('41000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','manual','https://example.test/crm-one','Fixture Employer','Fixture Job','Synthetic test, not a real listing'),
 ('41000000-0000-0000-0000-000000000002','11000000-0000-0000-0000-000000000002','manual','https://example.test/crm-two','Fixture Employer','Fixture Job','Synthetic test, not a real listing');

set local role authenticated;
set local request.jwt.claim.sub = '11000000-0000-0000-0000-000000000001';
select is(public.local_time_to_utc('2026-10-10T00:15'),'2026-10-09T19:15:00Z'::timestamptz,'Pakistan local time converts across UTC day boundary');
select throws_ok($$select public.local_time_to_utc('2026-02-30T12:00')$$,'22008',null,'invalid calendar date is denied by Postgres');
select throws_ok($$update public.candidate_profiles set timezone='invented/timezone'$$,'23514',null,'database enforces a real timezone');
select lives_ok($$select public.select_resume_master('31000000-0000-0000-0000-000000000001')$$,'select first master');
select lives_ok($$select public.select_resume_master('31000000-0000-0000-0000-000000000003')$$,'switch master atomically');
select is((select count(*) from public.resumes),2::bigint,'switching masters preserves old resume versions');
select is((select id from public.resumes where is_master),'31000000-0000-0000-0000-000000000003'::uuid,'new version is the only current master');
select throws_ok($$update public.resumes set is_master=true where id='31000000-0000-0000-0000-000000000001'$$,'23505',null,'partial index prevents two masters');
select throws_ok($$update public.resumes set version_name='edited' where id='31000000-0000-0000-0000-000000000001'$$,'23514',null,'resume metadata cannot rewrite a version');
select throws_ok($$update public.resumes set storage_path='11000000-0000-0000-0000-000000000001/changed.txt'$$,'23514',null,'private version file path is immutable');
select throws_ok($$select public.select_resume_master('31000000-0000-0000-0000-000000000002')$$,'42501',null,'other owner master RPC denied');
select lives_ok($$insert into public.applications(id,job_id,resume_id) values ('51000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000001')$$,'create own draft linked to older version');
select is((select event_type from public.application_events),'record_created','draft insert creates truthful transactional audit');
select lives_ok($$update public.applications set notes='Synthetic notes edit'$$,'edit notes');
select is((select count(*) from public.application_events where event_type='record_updated'),1::bigint,'notes edits have a separate audit label');
select throws_ok($$update public.applications set status='prepared',resume_id=null$$,'23514',null,'prepared package requires a resume through Data API too');
select throws_ok($$update public.applications set status='failed',last_error=null$$,'23514',null,'failure requires an actual reason');
select throws_ok($$update public.applications set status='failed',last_error='  '$$,'23514',null,'blank failure reason denied');
select throws_ok($$update public.applications set status='submitted',applied_at=now()+interval '1 day',confirmation_evidence='{"kind":"candidate_reported"}'$$,'23514',null,'future submission date denied at database boundary');
select is((select count(*) from public.application_events),2::bigint,'failed writes create no phantom activity events');
select lives_ok($$update public.applications set status='submitted',applied_at=date_trunc('day',now() at time zone 'Asia/Karachi') at time zone 'Asia/Karachi',confirmation_evidence='{"kind":"candidate_reported","note":"Synthetic fixture confirmation"}',follow_up_at=now()-interval '1 minute'$$,'record explicit synthetic manual confirmation');
select is(public.dashboard_metrics()->>'manual_today','1','reported submissions counted in profile local day');
select is(public.dashboard_metrics()->>'follow_ups_due','1','past follow-up is due on submitted record');
select is(public.dashboard_metrics()->>'jobs','1','metrics exclude another owner job');
select is(public.dashboard_metrics()->>'masters','1','metrics reflect actual master selection');
select lives_ok($$update public.applications set applied_at=(date_trunc('day',now() at time zone 'Asia/Karachi') at time zone 'Asia/Karachi')-interval '1 second'$$,'move fixture to previous local day');
select is(public.dashboard_metrics()->>'manual_today','0','previous local day excluded from today');
select lives_ok($$update public.applications set status='interview'$$,'record interview after a confirmed submission');
select is(public.dashboard_metrics()->>'interviews','1','interview metric uses saved status');
select is(public.dashboard_metrics()->>'responses','1','response metric requires actual submission date');
select throws_ok($$delete from public.jobs where id='41000000-0000-0000-0000-000000000001'$$,'23503',null,'listing deletion cannot erase CRM history');
select is((select resume_id from public.applications),'31000000-0000-0000-0000-000000000001'::uuid,'master switch does not change an application resume');

create temporary table stale_version as select updated_at from public.applications;
select lives_ok($$update public.applications set notes='Another edit'$$,'update changes concurrency token');
with changed as (update public.applications set notes='Stale overwrite' where updated_at=(select updated_at from stale_version) returning id)
select is(count(*),0::bigint,'stale expected timestamp cannot overwrite new data') from changed;

select ok(public.consume_action_budget('upload'),'first upload consumes shared budget');
select public.consume_action_budget('upload') from generate_series(1,9);
select ok(not public.consume_action_budget('upload'),'eleventh upload request is denied');
select throws_ok($$select public.consume_action_budget('invented')$$,'22023',null,'cannot select a custom higher-limit action');
select throws_ok($$delete from public.action_limits$$,'42501',null,'authenticated users cannot clear budget rows');

set local request.jwt.claim.sub = '11000000-0000-0000-0000-000000000002';
select is((select count(*) from public.applications),0::bigint,'other account cannot see the first owner application');
select is((select count(*) from public.application_events),0::bigint,'other account cannot see first owner audit history');
select ok(public.consume_action_budget('upload'),'other account has an independent budget');
select is(public.dashboard_metrics()->>'applications','0','other account metrics contain no foreign application');

reset role;
select * from finish();
rollback;
