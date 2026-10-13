begin;
-- Trigger-only definer handles Auth-admin cascades without granting it profile access.
create function public.lock_answer_delete() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.candidate_profiles where user_id=old.user_id for update;
 return old;
end;
$$;
revoke all on function public.lock_answer_delete() from public,anon,authenticated;
create trigger lock_answer_delete before delete on public.answer_library for each row execute function public.lock_answer_delete();
commit;
