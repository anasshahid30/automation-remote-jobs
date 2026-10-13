-- Local synthetic fixtures only. Import, review, budgets and records are rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select ok(not has_table_privilege('anon','public.job_reviews','SELECT'),'anonymous source reviews denied');
select ok(not has_table_privilege('anon','public.job_classifications','SELECT'),'anonymous classifications denied');
select ok(not has_table_privilege('anon','public.job_screening_summary','SELECT'),'anonymous screening summary denied');
select ok(not has_function_privilege('anon','public.import_jobs(jsonb)','EXECUTE'),'anonymous import denied');
select ok(not has_function_privilege('anon','public.record_job_screening(uuid,timestamptz,timestamptz,jsonb,jsonb,jsonb)','EXECUTE'),'anonymous screening RPC denied');
select is(public.normalize_job_url('https://EXAMPLE.test/jobs/?z=2&utm_source=x&a=1#details'),'https://example.test/jobs?a=1&z=2','tracking URLs normalized consistently');
select is(public.normalize_job_url('https://boards.greenhouse.io/embed/job_app?for=acme&token=123'),'https://job-boards.greenhouse.io/acme/jobs/123','embedded Greenhouse identity normalized');
select is(public.normalize_job_url('https://jobs.lever.co/acme/abc/apply?lever-source=x'),'https://jobs.lever.co/acme/abc','Lever apply variant normalized');
select is(public.normalize_job_url('https://example.test/?job=123#/jobs/456'),'https://example.test/?job=123#/jobs/456','SPA identity retained');
select throws_ok($$select public.normalize_job_url('https://user:secret@example.test/job')$$,'23514',null,'credential-bearing URL denied at database boundary');

insert into auth.users(id,email) values
 ('13000000-0000-0000-0000-000000000001','import-one@example.test'),
 ('13000000-0000-0000-0000-000000000002','import-two@example.test');
insert into public.candidate_profiles(id,user_id,full_name,email) values
 ('23000000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000001','Synthetic Import One','import-one@example.test'),
 ('23000000-0000-0000-0000-000000000002','13000000-0000-0000-0000-000000000002','Synthetic Import Two','import-two@example.test');
set local role authenticated;
set local request.jwt.claim.sub='13000000-0000-0000-0000-000000000001';
create temporary table imported as select public.import_jobs('[{"canonical_url":"https://example.test/job?utm_source=first","company_name":"Synthetic Company","job_title":"Fixture Backend","description":"Synthetic source description; not a real listing."}]') result;
select is((select result->0->>'created' from imported),'true','first import creates actual owned record');
select is((public.import_jobs('[{"canonical_url":"https://EXAMPLE.test/job?utm_source=second#description","company_name":"Synthetic Company","job_title":"Fixture Backend","description":"Different duplicate text"}]')->0->>'created'),'false','tracking variant returns existing record');
select is((select count(*) from public.jobs),1::bigint,'normalized duplicates create only one listing');
select is((select description from public.jobs),'Synthetic source description; not a real listing.','duplicate import preserves existing description');
select is((public.import_jobs('[{"canonical_url":"https://example.test/another-opening","company_name":"Synthetic Company","job_title":"Fixture Backend","description":"Synthetic alternate opening"}]')->0->>'possible_duplicates'),'1','same title/company flags a possible duplicate');
select is((select count(*) from public.jobs),2::bigint,'possible semantic duplicates are not silently merged');
select throws_ok($$select public.import_jobs('[{"canonical_url":"https://example.test/rollback","company_name":"Fixture","job_title":"Fixture","description":"Fixture"},{"canonical_url":"http://insecure.example.test/job","company_name":"Fixture","job_title":"Fixture","description":"Fixture"}]')$$,'23514',null,'invalid batch rolls back entirely');
select is((select count(*) from public.jobs where canonical_url='https://example.test/rollback'),0::bigint,'batch has no partial writes');
select throws_ok($$select public.import_jobs('[]')$$,'22023',null,'empty batch denied');
select throws_ok($$update public.candidate_profiles set scoring_weights='{"relevance":100,"seniority":20,"geography":20,"compensation":15,"employment":10}'$$,'23514',null,'database enforces weight totals');
select lives_ok($$update public.candidate_profiles set scoring_weights='{"relevance":35,"seniority":20,"geography":20,"compensation":15,"employment":10}'$$,'valid weights accepted');

insert into public.jobs(id,canonical_url,source_platform,company_name,job_title,description,listing_status)
values('43000000-0000-0000-0000-000000000001','https://example.test/screen','manual','Synthetic Screen Company','Synthetic Screen Role','Fully remote contract worldwide Pakistan USD monthly mid backend USA authorization Python','active');
create temporary table context as select j.id,j.updated_at job_time,p.updated_at profile_time from public.jobs j cross join public.candidate_profiles p where j.id='43000000-0000-0000-0000-000000000001';
create temporary table source_review as select '{"citations":[{"kind":"remote","quote":"Fully remote","url":"https://example.test/screen"},{"kind":"country","quote":"worldwide Pakistan","url":"https://example.test/screen"},{"kind":"salary","quote":"USD monthly","url":"https://example.test/screen"},{"kind":"role","quote":"backend","url":"https://example.test/screen"},{"kind":"employment","quote":"contract","url":"https://example.test/screen"},{"kind":"seniority","quote":"mid","url":"https://example.test/screen"},{"kind":"region","quote":"USA","url":"https://example.test/screen"},{"kind":"authorization","quote":"authorization","url":"https://example.test/screen"}],"source_checked":true,"listing_checked":true,"qualifications":"met","authorization":"met"}'::jsonb review;
create temporary table screen_result as select '{"decision":"ELIGIBLE","remote_check":"pass","pakistan_eligibility":"pass","salary_check":"pass","match_score":100,"confidence":1,"reasons":["Synthetic database fixture only"],"evidence_urls":["https://example.test/screen"],"factors":{"monthly_min":2000,"currency":"USD"},"evaluation_version":"phase3.1"}'::jsonb result;
select lives_ok($$select public.record_job_screening(id,job_time,profile_time,'[]',(select review from source_review),(select result from screen_result)) from context$$,'screening and review snapshot saved transactionally');
select is((select effective_decision from public.job_screening_summary where id='43000000-0000-0000-0000-000000000001'),'ELIGIBLE','current evaluation visible in summary');
select is(public.dashboard_metrics()->>'eligible_jobs','1','dashboard eligible count uses current results');
select is((select count(*) from public.job_reviews),1::bigint,'source review retained');
select throws_ok($$update public.eligibility_checks set reasons=array['rewritten']$$,'42501',null,'authenticated users cannot rewrite screening history');
select throws_ok($$select public.record_job_screening(id,job_time,profile_time,'[]',jsonb_set((select review from source_review),'{citations,0,quote}','"Invented quote"'),(select result from screen_result)) from context$$,'23514',null,'database rejects invented source quote');
select is((select count(*) from public.eligibility_checks),1::bigint,'failed review creates no phantom history');
select throws_ok($$select public.record_job_screening(id,job_time,profile_time,'[]',(select review-'source_checked' from source_review),(select result from screen_result)) from context$$,'23514',null,'missing source verification cannot create positive check');
select lives_ok($$update public.jobs set disposition='shortlisted' where id='43000000-0000-0000-0000-000000000001'$$,'shortlisting records manual preference');
select is((select effective_decision from public.job_screening_summary where id='43000000-0000-0000-0000-000000000001'),'ELIGIBLE','disposition does not alter eligibility facts');
select lives_ok($$update public.jobs set description=description||' changed' where id='43000000-0000-0000-0000-000000000001'$$,'source edit saved');
select is((select effective_decision from public.job_screening_summary where id='43000000-0000-0000-0000-000000000001'),'NEEDS_REVIEW','source change invalidates old eligibility');
select is(public.dashboard_metrics()->>'eligible_jobs','0','stale positive result excluded from eligible dashboard count');
select throws_ok($$select public.record_job_screening(id,job_time,profile_time,'[]',(select review from source_review),(select result from screen_result)) from context$$,'40001',null,'stale expected input snapshot denied');
update context set job_time=(select updated_at from public.jobs where id=context.id);
select lives_ok($$select public.record_job_screening(id,job_time,profile_time,'[]',(select review from source_review),(select result from screen_result)) from context$$,'fresh reevaluation replaces current status and retains history');
select is((select count(*) from public.eligibility_checks where is_current),1::bigint,'only one current evaluation per listing');
select is((select count(*) from public.eligibility_checks),2::bigint,'prior screening retained');
reset role;
update public.eligibility_checks set valid_until=now()-interval '1 minute' where job_id='43000000-0000-0000-0000-000000000001' and is_current;
set local role authenticated;
select is((select effective_decision from public.job_screening_summary where id='43000000-0000-0000-0000-000000000001'),'NEEDS_REVIEW','expiry of a dated conversion invalidates a positive result without a write');
select throws_ok($$update public.eligibility_checks set valid_until=now()+interval '1 day'$$,'42501',null,'users cannot rewrite evidence expiry directly');
reset role;
update public.eligibility_checks set valid_until=now()+interval '1 day' where job_id='43000000-0000-0000-0000-000000000001' and is_current;
set local role authenticated;
select ok(public.consume_action_budget('classification'),'AI has a separate bounded action budget');
select public.consume_action_budget('classification') from generate_series(1,9);
select ok(not public.consume_action_budget('classification'),'eleventh AI attempt in the hour is denied');
select lives_ok($$update public.candidate_profiles set salary_min_monthly=2500$$,'change compensation preference');
select is((select effective_decision from public.job_screening_summary where id='43000000-0000-0000-0000-000000000001'),'NEEDS_REVIEW','profile change invalidates eligibility');
insert into public.resumes(profile_id,role_category,version_name,storage_path,skills)
 values('23000000-0000-0000-0000-000000000001','backend','Synthetic cascade fixture','13000000-0000-0000-0000-000000000001/cascade.txt',array['Python']);

set local request.jwt.claim.sub='13000000-0000-0000-0000-000000000002';
select is((select count(*) from public.job_screening_summary),0::bigint,'summary does not expose other owner records');
select is((select count(*) from public.job_reviews),0::bigint,'review evidence is owner-isolated');
select throws_ok($$select public.record_job_screening('43000000-0000-0000-0000-000000000001',now(),now(),'[]','{"citations":[]}','{}')$$,'42501',null,'other owner cannot screen known foreign UUID');
select throws_ok($$insert into public.job_classifications(job_id,job_updated_at,provider,model,suggestion) values('43000000-0000-0000-0000-000000000001',now(),'openai','fixture','{}')$$,'23503',null,'other owner cannot attach classification to foreign job');
reset role;
select ok((select prosecdef from pg_proc where oid='public.invalidate_screening()'::regprocedure),'trigger-only definer supports Auth cascade permissions');
select ok(not has_function_privilege('authenticated','public.invalidate_screening()','EXECUTE'),'users cannot invoke privileged invalidation trigger directly');
select lives_ok($$delete from auth.users where id='13000000-0000-0000-0000-000000000001'$$,'account cascade removes resume and screening history');
select is((select count(*) from public.job_reviews where user_id='13000000-0000-0000-0000-000000000001'),0::bigint,'account deletion removes source review data');
select * from finish();
rollback;
