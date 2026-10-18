-- ═══════════════════════════════════════════════════════════════════════════
--  NOTIFICATIONS
--
--  Built because something was already broken: moderation composes a statement
--  of reasons for the reporter AND the seller, and it was returned to the
--  moderator's own API call and thrown away. Nobody it was written for ever
--  read it. A right of reply that never arrives is not a right of reply.
--
--  This is the delivery layer. Push (FCM/APNs) can sit on top later; the record
--  of what someone is owed should not wait on a Firebase key.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.lili_notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in (
                'message','moderation_outcome','moderation_report_outcome',
                'listing_live','listing_blocked','shop_action')),
  title       text not null,
  body        text,
  link_kind   text,          -- 'conversation' | 'item' | 'shop' | 'case'
  link_id     uuid,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists lili_notif_user on public.lili_notifications(user_id, created_at desc);
create index if not exists lili_notif_unread on public.lili_notifications(user_id) where read_at is null;

alter table public.lili_notifications enable row level security;

-- Yours and nobody else's. Not the sender's, not a moderator's.
create policy notif_read on public.lili_notifications for select
  using (user_id = auth.uid());

-- Marking as read is the only change a person may make. Nobody can create a
-- notification from a client: that would be a channel for sending strangers
-- arbitrary text inside the app.
create policy notif_mark_read on public.lili_notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function lili.guard_notification()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user in ('postgres','service_role') then return new; end if;
  new.kind := old.kind; new.title := old.title; new.body := old.body;
  new.user_id := old.user_id; new.link_kind := old.link_kind;
  new.link_id := old.link_id; new.created_at := old.created_at;
  return new;   -- only read_at survives
end; $$;

drop trigger if exists guard_notif on public.lili_notifications;
create trigger guard_notif before update on public.lili_notifications
  for each row execute function lili.guard_notification();

grant select, update on public.lili_notifications to authenticated;
revoke all on public.lili_notifications from anon;

-- ── deliver a new message ──────────────────────────────────────────────────
create or replace function lili.notify_message()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.lili_conversations%rowtype; recipient uuid;
begin
  select * into c from public.lili_conversations where id = new.conversation_id;
  recipient := case when new.sender_uid = c.buyer_uid then c.seller_uid else c.buyer_uid end;
  if recipient is null then return null; end if;

  -- One unread notification per thread, refreshed. Twenty messages should not
  -- produce twenty badges.
  delete from public.lili_notifications
   where user_id = recipient and kind = 'message'
     and link_id = new.conversation_id and read_at is null;

  insert into public.lili_notifications (user_id, kind, title, body, link_kind, link_id)
  values (recipient, 'message', 'New message', left(new.body, 120),
          'conversation', new.conversation_id);
  return null;
end; $$;

drop trigger if exists notify_msg on public.lili_messages;
create trigger notify_msg after insert on public.lili_messages
  for each row execute function lili.notify_message();

-- ── deliver a moderation outcome to BOTH sides ─────────────────────────────
create or replace function lili.notify_moderation()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare seller uuid; label text; reason text; dismissed boolean;
begin
  if new.decision is null or old.decision is not null then return null; end if;

  label     := new.decision ->> 'label';
  reason    := new.decision ->> 'reason';
  dismissed := (new.decision ->> 'decision') = 'dismiss';

  select owner_uid into seller from public.lili_shops where id = new.shop_id;

  -- the seller: what happened, why, and that she may appeal
  if seller is not null then
    insert into public.lili_notifications (user_id, kind, title, body, link_kind, link_id)
    values (seller,
            case when dismissed then 'moderation_outcome' else 'shop_action' end,
            case when dismissed then 'A report about your listing was dismissed' else label end,
            reason || case when dismissed then ''
                     else '  You can appeal this from Privacy & Safety.' end,
            'item', new.target_item_id);
  end if;

  -- the person who reported: her report was read, and this is what came of it
  if new.reported_by is not null then
    insert into public.lili_notifications (user_id, kind, title, body, link_kind, link_id)
    values (new.reported_by, 'moderation_report_outcome',
            'We reviewed your report', 'Outcome: ' || label || '. ' || reason,
            'item', new.target_item_id);
  end if;
  return null;
end; $$;

drop trigger if exists notify_mod on public.lili_moderation_cases;
create trigger notify_mod after update on public.lili_moderation_cases
  for each row execute function lili.notify_moderation();

-- ── tell a seller her listing was screened out ─────────────────────────────
create or replace function lili.notify_screening()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status = 'live' then return null; end if;
  insert into public.lili_notifications (user_id, kind, title, body, link_kind, link_id)
  values (new.owner_uid,
          case when new.status = 'removed' then 'listing_blocked' else 'listing_live' end,
          case when new.status = 'removed' then 'That listing can''t go up'
               else 'Your listing is being checked' end,
          case when new.status = 'removed'
               then 'It looks like it breaks our selling rules. Privacy & Safety explains what can and cannot be listed.'
               else 'Someone will look at it shortly — usually within a day. Nothing more to do.' end,
          'item', new.id);
  return null;
end; $$;

drop trigger if exists notify_screen on public.lili_items;
create trigger notify_screen after insert on public.lili_items
  for each row execute function lili.notify_screening();
