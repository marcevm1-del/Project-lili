create or replace function lili.notify_moderation()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare target uuid; label text; reason text; dismissed boolean;
begin
  if new.decision is null or old.decision is not null then return null; end if;
  label := new.decision ->> 'label';
  reason := new.decision ->> 'reason';
  dismissed := (new.decision ->> 'decision') = 'dismiss';

  target := new.reported_uid;
  if target is null then
    select owner_uid into target from public.lili_shops where id = new.shop_id;
  end if;

  -- the person the case was about (never the reporter herself); a dismissed
  -- conversation report tells her nothing, as she never learnt of it
  if target is not null and target is distinct from new.reported_by
     and not (dismissed and new.kind = 'conversation') then
    insert into public.lili_notifications (user_id, kind, title, body, link_kind, link_id)
    values (target,
            case when dismissed then 'moderation_outcome' else 'shop_action' end,
            case when dismissed then 'A report about your listing was dismissed' else label end,
            reason || case when dismissed then '' else '  You can appeal this from Privacy & Safety.' end,
            'item', new.target_item_id);
  end if;

  if new.reported_by is not null then
    insert into public.lili_notifications (user_id, kind, title, body, link_kind, link_id)
    values (new.reported_by, 'moderation_report_outcome',
            'We reviewed your report', 'Outcome: ' || label || '. ' || reason,
            'item', new.target_item_id);
  end if;
  return null;
end; $$;

alter policy items_read on public.lili_items
  using (((status = 'live'::text) AND (EXISTS ( SELECT 1 FROM public.lili_shops s
            WHERE ((s.id = lili_items.shop_id) AND (s.status = 'active'::text)))))
         OR (owner_uid = ( SELECT auth.uid() AS uid)));

create or replace function public.lili_meet_guard()
returns trigger language plpgsql set search_path to 'public', 'pg_temp'
as $$
declare me uuid := auth.uid();
begin
  if current_user in ('postgres', 'service_role') then return new; end if;

  new.id := old.id; new.conversation_id := old.conversation_id; new.item_id := old.item_id;
  new.proposed_by := old.proposed_by; new.created_at := old.created_at;
  new.confirmed_at := old.confirmed_at; new.cancelled_by := old.cancelled_by;
  new.checkin_by := old.checkin_by; new.checkin_at := old.checkin_at;

  -- the time and place are what was agreed
  if new.meet_at is distinct from old.meet_at
  or new.place_key is distinct from old.place_key
  or new.place_note is distinct from old.place_note then
    if old.state <> 'proposed' then
      raise exception 'an answered plan is not edited; cancel it and propose another' using errcode = '42501';
    end if;
    if me is distinct from old.proposed_by then
      raise exception 'suggest a different time with a proposal of your own' using errcode = '42501';
    end if;
  end if;

  if new.state is distinct from old.state then
    if old.state = 'proposed' and new.state in ('confirmed', 'declined') then
      if me = old.proposed_by then
        raise exception 'the other person answers a proposal, not the one who made it' using errcode = '42501';
      end if;
      if new.state = 'confirmed' then new.confirmed_at := now(); end if;
    elsif old.state in ('proposed', 'confirmed') and new.state = 'cancelled' then
      new.cancelled_by := me;
    elsif old.state = 'confirmed' and new.state = 'done' then
      null;
    else
      raise exception 'a % meet cannot become %', old.state, new.state using errcode = '22023';
    end if;
  end if;

  if new.checkin_state is distinct from old.checkin_state then
    if old.checkin_state is not null then
      raise exception 'a check-in is not edited afterwards' using errcode = '42501';
    end if;
    if new.state not in ('confirmed', 'done') then
      raise exception 'check in after a meet that was agreed' using errcode = '22023';
    end if;
    new.checkin_by := me; new.checkin_at := now();
  end if;
  return new;
end; $$;
