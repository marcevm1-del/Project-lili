-- ═══════════════════════════════════════════════════════════════════════════
--  MODERATION
--
--  The queue is deliberately unreadable from the app — no key that ships to a
--  phone can list cases or decide one. These functions are the only way in.
--  They run SECURITY DEFINER (so they bypass RLS) but check the caller's claim
--  first, and that claim lives in app_metadata, which only the service role can
--  write. A user cannot grant it to herself by editing a request.
--
--  Three things enforced here that a client structurally cannot be trusted to do:
--    · decisions are immutable — a wrong call is corrected by recording a NEW
--      one, never by editing the old. A trail you can rewrite is not a trail.
--    · a statement of reasons is REQUIRED, and is produced for both sides.
--    · strikes and shop status are computed here, not sent by anyone.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.lili_is_moderator()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'moderator')::boolean, false);
$$;

-- ── list ───────────────────────────────────────────────────────────────────
create or replace function public.lili_moderation_list(p_state text default null)
returns table (
  id uuid, kind text, source text, target_item_id uuid, shop_id uuid,
  reasons text[], detail text, state text, sla_hours int,
  created_at timestamptz, due_at timestamptz, overdue boolean
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.lili_is_moderator() then
    raise exception 'Moderator access required' using errcode = '42501';
  end if;

  return query
  select c.id, c.kind, c.source, c.target_item_id, c.shop_id,
         c.reasons, c.detail, c.state, c.sla_hours, c.created_at,
         c.created_at + (c.sla_hours || ' hours')::interval as due_at,
         (c.state = 'pending'
          and now() > c.created_at + (c.sla_hours || ' hours')::interval) as overdue
  from public.lili_moderation_cases c
  where p_state is null or c.state = p_state
  -- overdue first: an SLA nobody surfaces is just a number in a column
  order by (c.state = 'pending'
            and now() > c.created_at + (c.sla_hours || ' hours')::interval) desc,
           c.created_at asc
  limit 200;
end; $$;

-- ── claim ──────────────────────────────────────────────────────────────────
create or replace function public.lili_moderation_claim(p_case uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare updated int;
begin
  if not public.lili_is_moderator() then
    raise exception 'Moderator access required' using errcode = '42501';
  end if;
  update public.lili_moderation_cases
     set state = 'reviewing'
   where id = p_case and state = 'pending';
  get diagnostics updated = row_count;
  if updated = 0 then
    raise exception 'Already claimed or decided' using errcode = '55000';
  end if;
  return jsonb_build_object('ok', true, 'state', 'reviewing');
end; $$;

-- ── decide ─────────────────────────────────────────────────────────────────
create or replace function public.lili_moderation_decide(
  p_case uuid, p_decision text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c            public.lili_moderation_cases%rowtype;
  v_strike     int;
  v_status     text;
  v_label      text;
  v_strikes    int;
  v_shopstatus text;
  v_record     jsonb;
begin
  if not public.lili_is_moderator() then
    raise exception 'Moderator access required' using errcode = '42501';
  end if;

  select case p_decision
    when 'dismiss'         then 0 when 'remove_listing' then 1
    when 'remove_and_warn' then 1 when 'suspend_seller' then 2
    when 'close_shop'      then 3 else null end into v_strike;
  if v_strike is null then
    raise exception 'Unknown decision: %. Use dismiss, remove_listing, remove_and_warn, suspend_seller or close_shop', p_decision
      using errcode = '22023';
  end if;

  -- The statement of reasons is the point of the process, not paperwork around
  -- it. Both parties receive it, so it cannot be left blank.
  if coalesce(length(btrim(p_reason)), 0) < 10 then
    raise exception 'A reason of at least 10 characters is required — it is sent to both parties'
      using errcode = '22023';
  end if;

  select * into c from public.lili_moderation_cases where id = p_case;
  if not found then raise exception 'No such case' using errcode = 'P0002'; end if;
  if c.decision is not null then
    raise exception 'Already decided — record a new case instead' using errcode = '55000';
  end if;

  v_label  := case p_decision
    when 'dismiss' then 'No breach found' when 'remove_listing' then 'Listing removed'
    when 'remove_and_warn' then 'Listing removed and seller warned'
    when 'suspend_seller' then 'Seller suspended' else 'Shop closed' end;
  v_status := case when p_decision = 'dismiss' then 'live' else 'removed' end;

  v_record := jsonb_build_object(
    'decision', p_decision, 'label', v_label, 'reason', btrim(p_reason),
    'strike_applied', v_strike, 'decided_by', auth.uid(), 'at', now());

  update public.lili_moderation_cases
     set state = case when p_decision = 'dismiss' then 'dismissed' else 'upheld' end,
         decision = v_record, decided_at = now()
   where id = p_case;

  if c.target_item_id is not null then
    update public.lili_items set status = v_status where id = c.target_item_id;
  end if;

  if v_strike > 0 and c.shop_id is not null then
    select coalesce(strikes,0) + v_strike into v_strikes
      from public.lili_shops where id = c.shop_id;
    v_shopstatus := case when v_strikes >= 3 then 'closed'
                         when v_strike >= 2 then 'suspended' else 'active' end;
    update public.lili_shops set strikes = v_strikes, status = v_shopstatus
     where id = c.shop_id;
  end if;

  insert into public.lili_audit (kind, actor_uid, subject, meta)
  values ('moderation.decided', auth.uid(), p_case::text,
          jsonb_build_object('decision', p_decision, 'strike', v_strike,
                             'item', c.target_item_id, 'shop', c.shop_id));

  return jsonb_build_object(
    'ok', true, 'decision', v_record,
    'statement_of_reasons', jsonb_build_object(
      'to_reporter', 'We reviewed your report. Outcome: ' || v_label || '. ' || btrim(p_reason),
      'to_seller', case when p_decision = 'dismiss'
        then 'A report about your listing was reviewed and no action was taken. ' || btrim(p_reason)
        else v_label || '. ' || btrim(p_reason) || ' You can appeal this from Privacy & Safety.' end));
end; $$;

revoke all on function public.lili_moderation_list(text) from public, anon;
revoke all on function public.lili_moderation_claim(uuid) from public, anon;
revoke all on function public.lili_moderation_decide(uuid, text, text) from public, anon;
grant execute on function public.lili_moderation_list(text) to authenticated;
grant execute on function public.lili_moderation_claim(uuid) to authenticated;
grant execute on function public.lili_moderation_decide(uuid, text, text) to authenticated;
grant execute on function public.lili_is_moderator() to authenticated;
