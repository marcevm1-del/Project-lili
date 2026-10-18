-- Appeals, server-side.
--
-- Every sanction told the seller "You can appeal this from Privacy & Safety",
-- and the Reports, Strikes & Appeals Policy promises a 14-day appeal decided
-- by a different person. Neither existed: appeals lived only in the device
-- mock, and a seller could not even see the decisions made about her shop
-- (lili_my_cases returns the reports she FILED). Three functions:
--
--   lili_decisions_about_me()                 what was decided about me, and can I appeal
--   lili_moderation_appeal(case, grounds)     the person sanctioned contests it, within 14 days
--   lili_moderation_resolve_appeal(case, overturn, reason)
--                                             a moderator OTHER than the one who decided rules on it;
--                                             overturning removes the strike and restores what it took

create or replace function public.lili_decisions_about_me()
returns table(id uuid, kind text, target_item_id uuid, shop_id uuid, state text,
              decided_at timestamptz, label text, reason text, strike integer,
              appeal_by timestamptz, can_appeal boolean, appeal jsonb)
language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select c.id, c.kind, c.target_item_id, c.shop_id, c.state, c.decided_at,
         c.decision ->> 'label', c.decision ->> 'reason',
         coalesce((c.decision ->> 'strike_applied')::int, 0),
         c.decided_at + interval '14 days',
         (c.state = 'upheld' and coalesce((c.decision ->> 'strike_applied')::int, 0) > 0
          and now() < c.decided_at + interval '14 days'),
         c.decision -> 'appeal'
    from public.lili_moderation_cases c
   where c.decision is not null
     and (c.reported_uid = auth.uid()
          or c.shop_id in (select s.id from public.lili_shops s where s.owner_uid = auth.uid()))
   order by c.decided_at desc
   limit 100;
$$;

create or replace function public.lili_moderation_appeal(p_case uuid, p_grounds text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare c public.lili_moderation_cases%rowtype; v_owner uuid; me uuid := auth.uid();
begin
  if me is null then
    return jsonb_build_object('ok', false, 'reason', 'sign_in_required');
  end if;
  if coalesce(length(btrim(p_grounds)), 0) < 10 then
    raise exception 'Tell us in a sentence or two why the decision was wrong.' using errcode = '22023';
  end if;
  if not public.lili_rate_ok('appeal', 5, interval '24 hours') then
    raise exception 'You have sent several appeals today. Try again tomorrow.' using errcode = '54000';
  end if;

  select * into c from public.lili_moderation_cases where id = p_case for update;
  if not found then raise exception 'No such decision' using errcode = 'P0002'; end if;
  select owner_uid into v_owner from public.lili_shops where id = c.shop_id;
  if me is distinct from c.reported_uid and me is distinct from v_owner then
    raise exception 'Only the person the decision was about can appeal it' using errcode = '42501';
  end if;
  if c.state <> 'upheld' or coalesce((c.decision ->> 'strike_applied')::int, 0) = 0 then
    raise exception 'This decision can''t be appealed' using errcode = '55000';
  end if;
  if now() >= c.decided_at + interval '14 days' then
    raise exception 'The 14 days to appeal this decision have passed' using errcode = '55000';
  end if;

  update public.lili_moderation_cases
     set state = 'appealed',
         decision = decision || jsonb_build_object('appeal', jsonb_build_object(
           'grounds', left(btrim(p_grounds), 2000), 'at', now(), 'outcome', null))
   where id = p_case;

  insert into public.lili_audit (kind, actor_uid, subject, meta)
  values ('moderation.appealed', me, p_case::text, '{}'::jsonb);

  return jsonb_build_object('ok', true, 'state', 'appealed');
end; $$;

create or replace function public.lili_moderation_resolve_appeal(p_case uuid, p_overturn boolean, p_reason text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  c public.lili_moderation_cases%rowtype; me uuid := auth.uid();
  v_strike int; v_owner uuid; v_strikes int; v_status text; v_still boolean; v_target uuid;
begin
  if not public.lili_is_moderator() then
    raise exception 'Moderator access required' using errcode = '42501';
  end if;
  if coalesce(length(btrim(p_reason)), 0) < 10 then
    raise exception 'A reason of at least 10 characters is required — it is sent to the seller'
      using errcode = '22023';
  end if;

  select * into c from public.lili_moderation_cases where id = p_case for update;
  if not found then raise exception 'No such case' using errcode = 'P0002'; end if;
  if c.state <> 'appealed' then
    raise exception 'This case is not under appeal' using errcode = '55000';
  end if;
  if (c.decision ->> 'decided_by') = me::text then
    raise exception 'A different moderator must decide the appeal' using errcode = '42501';
  end if;

  v_strike := coalesce((c.decision ->> 'strike_applied')::int, 0);

  update public.lili_moderation_cases
     set state = case when p_overturn then 'overturned' else 'upheld' end,
         decision = jsonb_set(decision, '{appeal}', coalesce(decision -> 'appeal', '{}'::jsonb)
           || jsonb_build_object('outcome', case when p_overturn then 'overturned' else 'upheld' end,
                                 'reason', btrim(p_reason), 'by', me, 'decided_at', now()))
   where id = p_case;

  if p_overturn then
    if c.shop_id is not null and v_strike > 0 then
      select owner_uid, greatest(coalesce(strikes, 0) - v_strike, 0), status
        into v_owner, v_strikes, v_status
        from public.lili_shops where id = c.shop_id;
      -- another standing suspension or closure on this shop keeps it in force
      select exists (select 1 from public.lili_moderation_cases o
                      where o.shop_id = c.shop_id and o.id <> c.id and o.state in ('upheld', 'appealed')
                        and o.decision ->> 'decision' in ('suspend_seller', 'close_shop')) into v_still;
      v_status := case when v_strikes >= 3 then 'closed'
                       when v_still then v_status
                       else 'active' end;
      update public.lili_shops set strikes = v_strikes, status = v_status where id = c.shop_id;
    end if;
    if c.target_item_id is not null then
      update public.lili_items set status = 'live'
       where id = c.target_item_id and status = 'removed'
         and not coalesce((screening ->> 'withdrawn_by_owner')::boolean, false)
         and coalesce(screening ->> 'verdict', 'ok') <> 'block';
    end if;
  end if;

  v_target := c.reported_uid;
  if v_target is null then
    select owner_uid into v_target from public.lili_shops where id = c.shop_id;
  end if;
  if v_target is not null then
    insert into public.lili_notifications (user_id, kind, title, body, link_kind, link_id)
    values (v_target, 'moderation_outcome',
            case when p_overturn then 'Your appeal succeeded' else 'Your appeal was not upheld' end,
            btrim(p_reason) || case when p_overturn
              then ' The strike has been removed.' else ' The original decision stands.' end,
            'item', c.target_item_id);
  end if;

  insert into public.lili_audit (kind, actor_uid, subject, meta)
  values ('moderation.appeal_resolved', me, p_case::text,
          jsonb_build_object('overturned', p_overturn, 'strike', v_strike));

  return jsonb_build_object('ok', true, 'state', case when p_overturn then 'overturned' else 'upheld' end);
end; $$;

revoke all on function public.lili_decisions_about_me() from public, anon;
revoke all on function public.lili_moderation_appeal(uuid, text) from public, anon;
revoke all on function public.lili_moderation_resolve_appeal(uuid, boolean, text) from public, anon;
grant execute on function public.lili_decisions_about_me() to authenticated;
grant execute on function public.lili_moderation_appeal(uuid, text) to authenticated;
grant execute on function public.lili_moderation_resolve_appeal(uuid, boolean, text) to authenticated;

-- A2-6 from the second audit, in the same change: client roles never need
-- TRUNCATE (which skips row-level security), REFERENCES or TRIGGER on lili's
-- tables, nor DELETE where no policy permits one.
do $$
declare t text;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'lili\_%'
  loop
    execute format('revoke truncate, references, trigger on public.%I from anon, authenticated', t);
  end loop;
end $$;
revoke delete on public.lili_conversations, public.lili_messages, public.lili_offers,
                 public.lili_notifications from anon, authenticated;
