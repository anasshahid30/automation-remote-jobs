begin;
create or replace function public.guard_preparation_facts() returns trigger language plpgsql set search_path='' as $$
begin
 perform 1 from public.candidate_profiles where user_id=new.user_id for update;
 -- Separate table dispatch before accessing columns absent from resume_facts.
 if tg_table_name='answer_library' then
   if not new.requires_review and new.question_pattern ~* '(visa|sponsor|authori[sz]|right to work|legally|legal|clearance|attest|certify|assessment|test|relocat|salary|compensation|pay expectation|criminal|disabilit|gender|ethnic|veteran|medical|consent|agree|declar|citizen|residen|willing|commit|availability|start date|notice period|reference|background)' then
     raise exception 'Sensitive answers always require review' using errcode='23514';
   end if;
 end if;
 return new;
end;
$$;
commit;
