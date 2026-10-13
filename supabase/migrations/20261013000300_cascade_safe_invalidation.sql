-- Trigger-only definer derives owner from the RLS-authorized row, never caller arguments.
-- Auth cascades run as the Auth database role; do not require that role to query public CRM tables.
begin;
create or replace function public.invalidate_screening() returns trigger language plpgsql security definer set search_path='' as $$
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
    if TG_OP='DELETE' and not found then return old; end if;
    update public.eligibility_checks set is_current=false where user_id=owner_id and is_current;
  end if;
  return case when TG_OP='DELETE' then old else new end;
end;
$$;

commit;
