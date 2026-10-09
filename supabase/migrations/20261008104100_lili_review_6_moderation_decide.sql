create or replace function public.lili_moderation_decide(p_case uuid, p_decision text, p_reason text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  c public.lili_moderation_cases%rowtype;
  v_strike int; v_label text; v_owner uuid; v_strikes int;
  v_current text; v_shopstatus text; v_record jsonb;
begin
  if not public.lili_is_moderator() then
    raise exception 'Moderator access required' using errcode = '42501';
  end if;

  select case p_decision
    when 'dismiss' then 0 when 'remove_listing' then 1
    when 'remove_and_warn' then 1 when 'suspend_seller' then 2
    when 'close_shop' then 3 else null end into v_strike;
  if v_strike is null then
    raise exception 'Unknown decision: %. Use dismiss, remove_listing, remove_and_warn, suspend_seller or close_shop', p_decision
      using errcode = '22023';
  end if;
  if coalesce(length(btrim(p_reason)), 0) < 10 then
    raise exception 'A reason of at least 10 characters is required — it is sent to both parties'
      using errcode = '22023';
  end if;

  -- locked, so two moderators cannot decide the same case at once
  select * into c from public.lili_moderation_cases where id = p_case for update;
  if not found then raise exception 'No such case' using errcode = 'P0002'; end if;
  if c.decision is not null then
    raise exception 'Already decided — record a new case instead' using errcode = '55000';
  end if;

  select owner_uid, status into v_owner, v_current from public.lili_shops where id = c.shop_id;

  -- Every sanction acts on a shop. If the person reported is not its owner
  -- (a seller reporting a buyer), it would punish the reporter.
  if v_strike > 0 and c.reported_uid is not null and v_owner is distinct from c.reported_uid then
    raise exception 'This report is about the buyer, not the shop owner. A shop sanction would fall on the wrong person. Dismiss it here and act on the buyer''s account directly.'
      using errcode = '22023';
  end if;

  v_label := case p_decision
    when 'dismiss' then 'No breach found' when 'remove_listing' then 'Listing removed'
    when 'remove_and_warn' then 'Listing removed and seller warned'
    when 'suspend_seller' then 'Seller suspended' else 'Shop closed' end;
  v_record := jsonb_build_object('decision', p_decision, 'label', v_label, 'reason', btrim(p_reason),
    'strike_applied', v_strike, 'decided_by', auth.uid(), 'at', now());

  update public.lili_moderation_cases
     set state = case when p_decision = 'dismiss' then 'dismissed' else 'upheld' end,
         decision = v_record, decided_at = now()
   where id = p_case;

  if c.target_item_id is not null then
    if p_decision = 'dismiss' then
      -- only what screening or a report held back; a sold piece stays sold
      update public.lili_items set status = 'live'
       where id = c.target_item_id and status in ('in_review', 'removed');
    else
      update public.lili_items set status = 'removed' where id = c.target_item_id;
    end if;
  end if;

  if v_strike > 0 and c.shop_id is not null then
    select coalesce(strikes, 0) + v_strike into v_strikes from public.lili_shops where id = c.shop_id;
    v_shopstatus := case when v_strikes >= 3 then 'closed'
                         when v_strike >= 2 then 'suspended' else 'active' end;
    -- a strike never improves a shop's standing
    v_shopstatus := case
      when 'closed' in (v_shopstatus, v_current) then 'closed'
      when 'suspended' in (v_shopstatus, v_current) then 'suspended'
      else 'active' end;
    update public.lili_shops set strikes = v_strikes, status = v_shopstatus where id = c.shop_id;
  end if;

  insert into public.lili_audit (kind, actor_uid, subject, meta)
  values ('moderation.decided', auth.uid(), p_case::text,
          jsonb_build_object('decision', p_decision, 'strike', v_strike,
                             'item', c.target_item_id, 'shop', c.shop_id, 'reported', c.reported_uid));

  return jsonb_build_object('ok', true, 'decision', v_record,
    'statement_of_reasons', jsonb_build_object(
      'to_reporter', 'We reviewed your report. Outcome: ' || v_label || '. ' || btrim(p_reason),
      'to_seller', case when p_decision = 'dismiss'
        then 'A report about your listing was reviewed and no action was taken. ' || btrim(p_reason)
        else v_label || '. ' || btrim(p_reason) || ' You can appeal this from Privacy & Safety.' end));
end; $$;
