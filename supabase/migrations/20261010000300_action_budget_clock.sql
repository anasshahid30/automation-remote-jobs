-- Avoid SQL CURRENT_TIME keyword shadowing the PL/pgSQL timestamp variable.
begin;

create or replace function public.consume_action_budget(p_action text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare budget_time timestamptz := clock_timestamp(); current_count integer; window_size interval; max_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_action='upload' then window_size:=interval '1 hour'; max_count:=10;
  elsif p_action='mutation' then window_size:=interval '5 minutes'; max_count:=120;
  else raise exception 'Unsupported action' using errcode='22023'; end if;
  insert into public.action_limits as limits(user_id,action,window_start,request_count)
  values(auth.uid(),p_action,budget_time,1)
  on conflict (user_id,action) do update set
    request_count=case when limits.window_start+window_size<=budget_time then 1 else limits.request_count+1 end,
    window_start=case when limits.window_start+window_size<=budget_time then budget_time else limits.window_start end
  returning request_count into current_count;
  return current_count<=max_count;
end;
$$;

commit;
