-- The moderation queue lists cases without their decisions, so an appealed
-- case reached the screen with no grounds and no original decision to weigh.
-- Moderator-only: the appealed cases, the decision under appeal, the grounds.
create or replace function public.lili_moderation_appeals()
returns table(id uuid, decision jsonb, appeal jsonb, decided_at timestamptz, decided_by uuid)
language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $$
begin
  if not public.lili_is_moderator() then
    raise exception 'Moderator access required' using errcode = '42501';
  end if;
  return query
  select c.id, c.decision - 'appeal', c.decision -> 'appeal', c.decided_at,
         nullif(c.decision ->> 'decided_by', '')::uuid
    from public.lili_moderation_cases c
   where c.state = 'appealed'
   order by (c.decision -> 'appeal' ->> 'at') asc
   limit 200;
end; $$;
revoke all on function public.lili_moderation_appeals() from public, anon;
grant execute on function public.lili_moderation_appeals() to authenticated;
