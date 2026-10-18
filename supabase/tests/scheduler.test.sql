-- Synthetic lifecycle fixtures; no provider calls. All changes roll back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select ok(not has_table_privilege('authenticated','public.application_packages','UPDATE'),'package snapshots cannot be rewritten');
select ok(not has_table_privilege('authenticated','public.application_packages','DELETE'),'package history cannot be individually erased');
select ok(not has_table_privilege('anon','public.resume_facts','SELECT'),'resume text is private');
select ok(not has_function_privilege('anon','public.record_application_package(uuid,uuid,uuid,timestamptz,timestamptz,timestamptz,timestamptz,jsonb,jsonb)','EXECUTE'),'anonymous package generation denied');
insert into auth.users(id,email) values('17000000-0000-0000-0000-000000000001','prep-one@example.test'),('17000000-0000-0000-0000-000000000002','prep-two@example.test');
insert into public.candidate_profiles(id,user_id,full_name,email) values('27000000-0000-0000-0000-000000000001','17000000-0000-0000-0000-000000000001','Preparation Fixture','prep-one@example.test');
insert into public.resumes(id,user_id,profile_id,role_category,version_name,storage_path) values('37000000-0000-0000-0000-000000000001','17000000-0000-0000-0000-000000000001','27000000-0000-0000-0000-000000000001','backend','Synthetic v1','17000000-0000-0000-0000-000000000001/prep.txt');
insert into public.jobs(id,user_id,source_platform,canonical_url,company_name,job_title,description) values('47000000-0000-0000-0000-000000000001','17000000-0000-0000-0000-000000000001','manual','https://example.test/prep','Synthetic employer','Backend','Fully remote contract worldwide Pakistan USD monthly mid backend USA authorization Python');
insert into public.applications(id,user_id,job_id) values('57000000-0000-0000-0000-000000000001','17000000-0000-0000-0000-000000000001','47000000-0000-0000-0000-000000000001');
set local role authenticated;
set local request.jwt.claim.sub='17000000-0000-0000-0000-000000000001';
insert into public.resume_facts(resume_id,user_id,text_content) values('37000000-0000-0000-0000-000000000001',auth.uid(),'Synthetic factual resume text.');

update public.resume_facts set verified_by_candidate=true;
update public.jobs set listing_status='active';
create temporary table context as select j.id,j.updated_at job_time,p.updated_at profile_time from public.jobs j cross join public.candidate_profiles p where j.id='47000000-0000-0000-0000-000000000001';
create temporary table source_review as select '{"citations":[{"kind":"remote","quote":"Fully remote","url":"https://example.test/prep"},{"kind":"country","quote":"worldwide Pakistan","url":"https://example.test/prep"},{"kind":"salary","quote":"USD monthly","url":"https://example.test/prep"},{"kind":"role","quote":"backend","url":"https://example.test/prep"},{"kind":"employment","quote":"contract","url":"https://example.test/prep"},{"kind":"seniority","quote":"mid","url":"https://example.test/prep"},{"kind":"region","quote":"USA","url":"https://example.test/prep"},{"kind":"authorization","quote":"authorization","url":"https://example.test/prep"}],"source_checked":true,"listing_checked":true,"qualifications":"met","authorization":"met"}'::jsonb review;
create temporary table screen_result as select '{"decision":"ELIGIBLE","remote_check":"pass","pakistan_eligibility":"pass","salary_check":"pass","match_score":100,"confidence":1,"reasons":["Synthetic database fixture only"],"evidence_urls":["https://example.test/prep"],"factors":{"monthly_min":2000,"currency":"USD"},"evaluation_version":"phase3.1"}'::jsonb result;
select lives_ok($$select public.record_job_screening(id,job_time,profile_time,'[]',(select review from source_review),(select result from screen_result)) from context$$,'screening and review snapshot saved transactionally');

select public.record_application_package((select id from public.applications),(select id from public.resumes),gen_random_uuid(),(select updated_at from public.applications),(select updated_at from public.jobs),(select updated_at from public.candidate_profiles),(select updated_at from public.resume_facts),'[]','{"answers":[],"cover_letter":"Synthetic letter"}');
select public.review_application_package((select id from public.application_packages),(select updated_at from public.applications));

select ok(not has_function_privilege('authenticated','public.claim_scheduled_task()','EXECUTE'),'candidate cannot claim worker jobs');
select ok(not has_function_privilege('service_role','public.process_scheduled_task(uuid,uuid)','EXECUTE'),'generic API service cannot execute worker tasks');
select ok(not has_function_privilege('anon','public.scheduler_metrics()','EXECUTE'),'anonymous operations metrics denied');
select ok(not has_table_privilege('remote_jobs_scheduler','public.applications','SELECT'),'worker cannot read application records');
select ok(not has_table_privilege('remote_jobs_scheduler','public.resume_facts','SELECT'),'worker cannot read resume facts');
select ok(not has_function_privilege('remote_jobs_scheduler','public.record_submission_run(uuid,uuid,uuid,text,jsonb,jsonb)','EXECUTE'),'worker cannot open or dispatch submissions');
select ok(not has_table_privilege('authenticated','public.scheduled_tasks','INSERT'),'queue cannot be forged directly');
select ok(not has_table_privilege('authenticated','public.scheduled_tasks','UPDATE'),'leases cannot be rewritten directly');
select ok(not has_table_privilege('authenticated','public.scheduler_attempts','DELETE'),'attempt history cannot be deleted directly');
select throws_ok($$select public.handoff_quota_for(auth.uid(),now())$$,'42501',null,'private quota helper cannot query a foreign owner');
select is(public.handoff_quota()->>'remaining','30','initial actual owner budget is available');
create temporary table task_parameters as select clock_timestamp() due,gen_random_uuid() request;
select lives_ok($$select public.schedule_application_review((select id from public.applications),due,request) from task_parameters$$,'candidate schedules readiness review');
select lives_ok($$select public.schedule_application_review((select id from public.applications),due,request) from task_parameters$$,'same schedule request retries idempotently');
select is((select count(*) from public.scheduled_tasks),1::bigint,'one task across request retry');
select throws_ok($$select public.schedule_application_review((select id from public.applications),due+interval '1 day',request) from task_parameters$$,'23505',null,'request cannot move its due time silently');
select throws_ok($$select public.schedule_application_review((select id from public.applications),now()+interval '2 years',gen_random_uuid())$$,'23514',null,'unbounded future schedule denied');
select throws_ok($$insert into public.scheduler_settings(user_id,max_concurrency) values(auth.uid(),4)$$,'23514',null,'concurrency cap cannot exceed three');
insert into public.scheduler_settings(user_id,enabled,max_concurrency) values(auth.uid(),true,1);
reset role;
-- Lifecycle RPC runs as its owner; the integration suite uses the actual restricted login.
select is(public.claim_scheduled_task(),null::jsonb,'global pause defaults to blocking workers');
reset role;
insert into public.submission_controls(user_id,scope,paused) values('17000000-0000-0000-0000-000000000001','global',false);
-- Lifecycle RPC runs as its owner; the integration suite uses the actual restricted login.
create temporary table claim as select public.claim_scheduled_task() value;
select ok((select value is not null from claim),'enabled worker claims due work');
select is(public.claim_scheduled_task(),null::jsonb,'single owner concurrency slot is reserved');
reset role;
select is((select count(*) from public.scheduler_attempts),1::bigint,'lease atomically records attempt');
update public.submission_controls set paused=true;
-- Lifecycle RPC runs as its owner; the integration suite uses the actual restricted login.
select is(public.process_scheduled_task((select (value->>'id')::uuid from claim),(select (value->>'lease')::uuid from claim)),'paused','pause after claim prevents processing');
reset role;
select is((select attempts from public.scheduled_tasks),0,'pausing returns unused attempt budget');
update public.submission_controls set paused=false;
-- Lifecycle RPC runs as its owner; the integration suite uses the actual restricted login.
update claim set value=public.claim_scheduled_task();
select is(public.process_scheduled_task((select (value->>'id')::uuid from claim),(select (value->>'lease')::uuid from claim)),'ready','current eligible package becomes a manual review notification');
select is(public.process_scheduled_task((select (value->>'id')::uuid from claim),(select (value->>'lease')::uuid from claim)),'obsolete','response-loss retry cannot process completion twice');
reset role;
select is((select count(*) from public.submission_runs),0::bigint,'scheduler never creates handoff or submission');
select is((select applied_at from public.applications),null::timestamptz,'scheduler never claims employer receipt');
set local role authenticated;
select lives_ok($$select public.resolve_scheduled_task((select id from public.scheduled_tasks),'done')$$,'candidate dismisses review notification');
select public.schedule_application_review((select id from public.applications),clock_timestamp()+interval '1 second',gen_random_uuid());
reset role;
update public.scheduled_tasks set next_attempt_at=clock_timestamp()-interval '1 second' where state='queued';
-- Lifecycle RPC runs as its owner; the integration suite uses the actual restricted login.
update claim set value=public.claim_scheduled_task();
select lives_ok($$select public.fail_scheduled_task((select (value->>'id')::uuid from claim),(select (value->>'lease')::uuid from claim),'temporary_database')$$,'transient failure scheduled for bounded retry');
reset role;
select is((select state from public.scheduled_tasks where state='retry_wait'),'retry_wait','temporary failure is not success');
select ok((select next_attempt_at>clock_timestamp()+interval '59 seconds' and next_attempt_at<clock_timestamp()+interval '82 seconds' from public.scheduled_tasks where state='retry_wait'),'first retry uses sixty seconds plus bounded jitter');
update public.scheduled_tasks set next_attempt_at=clock_timestamp()-interval '1 second' where state='retry_wait';
-- Lifecycle RPC runs as its owner; the integration suite uses the actual restricted login.
update claim set value=public.claim_scheduled_task();
select lives_ok($$select public.fail_scheduled_task((select (value->>'id')::uuid from claim),(select (value->>'lease')::uuid from claim),'temporary_database')$$,'second temporary failure recorded');
reset role;
select ok((select next_attempt_at>clock_timestamp()+interval '119 seconds' from public.scheduled_tasks where state='retry_wait'),'retry delay increases after second failure');
update public.scheduled_tasks set next_attempt_at=clock_timestamp()-interval '1 second' where state='retry_wait';
-- Lifecycle RPC runs as its owner; the integration suite uses the actual restricted login.
update claim set value=public.claim_scheduled_task();
select public.fail_scheduled_task((select (value->>'id')::uuid from claim),(select (value->>'lease')::uuid from claim),'temporary_database');
reset role;
select is((select attempts from public.scheduled_tasks where state='failed'),3,'third failure stops retries');
-- Lifecycle RPC runs as its owner; the integration suite uses the actual restricted login.
select is(public.claim_scheduled_task(),null::jsonb,'terminal failed task cannot auto-retry');
reset role;
set local role authenticated;
select public.schedule_application_review((select id from public.applications),clock_timestamp()+interval '2 seconds',gen_random_uuid());
reset role;
update public.scheduled_tasks set next_attempt_at=clock_timestamp()-interval '1 second' where state='queued';
-- Lifecycle RPC runs as its owner; the integration suite uses the actual restricted login.
update claim set value=public.claim_scheduled_task();
reset role;
update public.scheduled_tasks set lease_until=clock_timestamp()-interval '1 second' where state='running';
-- Lifecycle RPC runs as its owner; the integration suite uses the actual restricted login.
select is(public.claim_scheduled_task(),null::jsonb,'expired lease enters delayed recovery rather than immediate resend');
select is(public.process_scheduled_task((select (value->>'id')::uuid from claim),(select (value->>'lease')::uuid from claim)),'obsolete','expired worker cannot complete a reclaimed task');
reset role;
select is((select result_code from public.scheduled_tasks where state='retry_wait'),'lease_expired','lease recovery is visible in history');
select ok((select finished_at is not null from public.scheduler_attempts where outcome='lease_expired'),'expired attempt records its ending');
set local role authenticated;
select public.resolve_scheduled_task((select id from public.scheduled_tasks where state='retry_wait'),'cancelled');
select is(public.scheduler_metrics()->>'failed','1','monitoring counts real failures');
select is(jsonb_array_length(public.scheduler_metrics()->'days'),14,'report contains fourteen local days including zeros');
select throws_ok($$select public.schedule_follow_up((select id from public.applications),now())$$,'23514',null,'unsubmitted application cannot receive a follow-up schedule');
select throws_ok($$select public.record_application_response((select id from public.applications),'interview','Synthetic response',gen_random_uuid())$$,'23514',null,'unsubmitted application cannot claim response');
reset role;
-- Quota tests exercise the trigger independently of package readiness (trusted fixtures).
update public.candidate_profiles set daily_target=1;
insert into public.jobs(id,user_id,source_platform,canonical_url,company_name,job_title,description) values('47000000-0000-0000-0000-000000000002','17000000-0000-0000-0000-000000000001','manual','https://example.test/quota2','Fixture employer','Fixture role','Synthetic quota fixture.');
insert into public.applications(id,user_id,job_id) values('57000000-0000-0000-0000-000000000002','17000000-0000-0000-0000-000000000001','47000000-0000-0000-0000-000000000002');
create function pg_temp.handoff(app uuid) returns void language sql as $$
 insert into public.submission_runs(user_id,application_id,package_id,request_id,mode,state,source_platform,source_url,input_snapshot,report)
 values('17000000-0000-0000-0000-000000000001',app,(select id from public.application_packages),gen_random_uuid(),'human_assisted','handoff_ready','manual','https://example.test/fixture','{}','{}');
$$;
select lives_ok($$select pg_temp.handoff('57000000-0000-0000-0000-000000000001')$$,'first handoff reserves the only daily slot');
select throws_ok($$select pg_temp.handoff('57000000-0000-0000-0000-000000000002')$$,'P0001',null,'another application cannot exceed daily quota');
update public.submission_runs set state='uncertain',outcome_note='Synthetic uncertainty',outcome_at=clock_timestamp()-interval '2 days',created_at=clock_timestamp()-interval '2 days';
select is(public.handoff_quota_for('17000000-0000-0000-0000-000000000001',clock_timestamp()+interval '1 day')->>'remaining','0','uncertain prior-day handoff still reserves capacity tomorrow');
update public.submission_runs set state='cancelled',outcome_note='Verified no submission',outcome_at=clock_timestamp();
select lives_ok($$select pg_temp.handoff('57000000-0000-0000-0000-000000000002')$$,'confirmed cancellation releases capacity');
update public.applications set status='submitted',applied_at=clock_timestamp(),confirmation_evidence='{"kind":"candidate_reported"}',submission_reference='Synthetic receipt' where id='57000000-0000-0000-0000-000000000002';
select is(public.handoff_quota_for('17000000-0000-0000-0000-000000000001',clock_timestamp())->>'completed_today','1','tracker plus reconciled handoff counts one actual completion');
select is(public.handoff_quota_for('17000000-0000-0000-0000-000000000001',clock_timestamp())->>'pending_handoffs','0','completed handoff releases its pending reservation');
update public.applications set status='submitted',applied_at=clock_timestamp(),confirmation_evidence='{"kind":"candidate_reported"}',submission_reference='Actual external receipt' where id='57000000-0000-0000-0000-000000000001';
select is(public.handoff_quota_for('17000000-0000-0000-0000-000000000001',clock_timestamp())->>'completed_today','2','truthful actual reports remain recordable above allocation cap');
update public.candidate_profiles set timezone='America/New_York';
select is((public.handoff_quota_for('17000000-0000-0000-0000-000000000001','2026-11-01T04:30:00Z')->>'resets_at')::timestamptz,'2026-11-02T05:00:00Z'::timestamptz,'fall DST quota day is twenty-five hours');
select is((public.handoff_quota_for('17000000-0000-0000-0000-000000000001','2026-03-08T05:30:00Z')->>'resets_at')::timestamptz,'2026-03-09T04:00:00Z'::timestamptz,'spring DST quota day is twenty-three hours');
update public.candidate_profiles set timezone='Asia/Karachi';
select is((public.handoff_quota_for('17000000-0000-0000-0000-000000000001','2026-10-17T19:01:00Z')->>'resets_at')::timestamptz,'2026-10-18T19:00:00Z'::timestamptz,'Pakistan quota boundary uses local midnight');
set local role authenticated;
select lives_ok($$select public.schedule_follow_up('57000000-0000-0000-0000-000000000002',now())$$,'actual submitted application can schedule follow-up');
select is((select count(*) from public.scheduled_tasks where kind='follow_up'),1::bigint,'follow-up date creates one local task');
select lives_ok($$select public.schedule_follow_up('57000000-0000-0000-0000-000000000002',now())$$,'same follow-up date retry is idempotent');
select is((select count(*) from public.scheduled_tasks where kind='follow_up'),1::bigint,'follow-up retry creates no duplicates');
select public.schedule_follow_up('57000000-0000-0000-0000-000000000002',now()+interval '1 day');
select public.schedule_follow_up('57000000-0000-0000-0000-000000000002',now());
select is((select state from public.scheduled_tasks where kind='follow_up' and due_at=now()),'queued','moving a reminder date back reactivates it');
select public.resolve_scheduled_task((select id from public.scheduled_tasks where kind='follow_up' and due_at=now()),'cancelled');
update public.applications set status='responded' where id='57000000-0000-0000-0000-000000000002';
select is((select state from public.scheduled_tasks where kind='follow_up' and due_at=now()),'cancelled','status edits do not resurrect a deliberately cancelled reminder');

select public.record_application_response('57000000-0000-0000-0000-000000000002','interview','Actual synthetic interview invitation','67000000-0000-0000-0000-000000000001');
select public.record_application_response('57000000-0000-0000-0000-000000000002','interview','Actual synthetic interview invitation','67000000-0000-0000-0000-000000000001');
select is((select count(*) from public.application_events where event_type='response'),1::bigint,'response retries keep one actual audit record');
select is(public.scheduler_metrics()->>'interviews','1','interview report reflects actual tracker status');
select throws_ok($$select public.record_application_response('57000000-0000-0000-0000-000000000002','offer','Changed response','67000000-0000-0000-0000-000000000001')$$,'23505',null,'response request identity cannot change after commit');
select public.record_application_response('57000000-0000-0000-0000-000000000002','rejected','Actual synthetic rejection','67000000-0000-0000-0000-000000000002');
select is((select state from public.scheduled_tasks where kind='follow_up' and due_at=now()),'cancelled','terminal response cancels pending follow-up');
set local request.jwt.claim.sub='17000000-0000-0000-0000-000000000002';
select is((select count(*) from public.scheduled_tasks),0::bigint,'foreign queue history hidden');
select is((select count(*) from public.scheduler_attempts),0::bigint,'foreign attempt history hidden');
select throws_ok($$select public.schedule_application_review('57000000-0000-0000-0000-000000000001',now(),gen_random_uuid())$$,'42501',null,'foreign application cannot be scheduled');
select is(public.scheduler_metrics()->>'unique_jobs','0','aggregate reporting stays owner scoped');
reset role;
select lives_ok($$delete from auth.users where id='17000000-0000-0000-0000-000000000001'$$,'Auth deletion cascades tasks, attempts, pauses and handoff history');
select * from finish();
rollback;
