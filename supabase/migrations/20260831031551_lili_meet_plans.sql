-- The meet is the transaction.
--
-- lili holds no money, there is no escrow and no shipping, so everything that
-- happens between two women on this platform ends with them standing in front
-- of each other. MeetSafely.jsx already tells her the three things that matter
-- — meet in public, keep it in lili, check before you pay — as static advice
-- on a sheet she has to open.
--
-- Advice she has to go and find is not a safety feature. This makes the meet a
-- thing in the thread, that both sides confirm, that can be looked at
-- afterwards, and that a report can point at.
--
-- ── what this deliberately does not do
--
-- It does not track anybody. No live location, no "share my journey", no
-- background anything. `place_key` is one of a short list of public places
-- SHE picks; `place_note` is what she typed. Nothing here is a coordinate, and
-- the check-in is a single tap she chooses to make.
--
-- It also does not claim any endorsement. There is no Dubai Police
-- safe-exchange-zone programme — I looked, and the guidance Dubai Police
-- publishes about second-hand trading is about fake ads and cloned sites, not
-- designated meeting points. So the app offers criteria and examples she
-- chooses from, and states plainly that these are busy public places, not
-- verified or supervised ones. Implying a police-approved location that does
-- not exist would be the most dangerous fabrication in this codebase.

create table if not exists public.lili_meets (
  id             uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.lili_conversations(id) on delete cascade,
  item_id        uuid references public.lili_items(id) on delete set null,
  proposed_by    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  place_key      text not null,
  place_note     text,
  meet_at        timestamptz not null,
  state          text not null default 'proposed',
  confirmed_at   timestamptz,
  cancelled_by   uuid references auth.users(id) on delete set null,
  checkin_by     uuid references auth.users(id) on delete set null,
  checkin_state  text,
  checkin_at     timestamptz,
  created_at     timestamptz not null default now(),
  constraint lili_meets_state   check (state in ('proposed','confirmed','declined','cancelled','done')),
  constraint lili_meets_checkin check (checkin_state is null or checkin_state in ('fine','no_show','felt_wrong')),
  constraint lili_meets_place   check (char_length(place_key) between 1 and 48),
  constraint lili_meets_note    check (place_note is null or char_length(place_note) <= 140)
);

create index if not exists lili_meets_convo on public.lili_meets (conversation_id, created_at desc);

alter table public.lili_meets enable row level security;

-- Only the two people in the conversation. Same shape as the messages policy:
-- the thread decides, nothing else.
create or replace function public.lili_in_conversation(p_convo uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.lili_conversations c
     where c.id = p_convo and auth.uid() in (c.buyer_uid, c.seller_uid));
$$;

drop policy if exists lili_meets_read on public.lili_meets;
create policy lili_meets_read on public.lili_meets
  for select to authenticated
  using (public.lili_in_conversation(conversation_id));

drop policy if exists lili_meets_propose on public.lili_meets;
create policy lili_meets_propose on public.lili_meets
  for insert to authenticated
  with check (proposed_by = auth.uid() and public.lili_in_conversation(conversation_id));

-- Either participant may answer or cancel. The guard below decides which
-- columns each of them may actually move.
drop policy if exists lili_meets_answer on public.lili_meets;
create policy lili_meets_answer on public.lili_meets
  for update to authenticated
  using (public.lili_in_conversation(conversation_id))
  with check (public.lili_in_conversation(conversation_id));

/**
 * The rules of a meet plan, enforced where they cannot be edited out.
 *
 * The one that matters: you cannot confirm your own proposal. A meet plan whose
 * whole value is "we both agreed to this" is worth nothing if one side can
 * agree on behalf of both — and that is a client-side rule anywhere else.
 */
create or replace function public.lili_meet_guard()
returns trigger
language plpgsql
as $$
begin
  -- the immutable spine of the plan
  new.id := old.id;
  new.conversation_id := old.conversation_id;
  new.proposed_by := old.proposed_by;
  new.created_at := old.created_at;

  if new.state is distinct from old.state then
    if new.state = 'confirmed' then
      if auth.uid() = old.proposed_by then
        raise exception 'the other person confirms a meet, not the one who proposed it'
          using errcode = '42501';
      end if;
      if old.state <> 'proposed' then
        raise exception 'only a proposed meet can be confirmed' using errcode = '22023';
      end if;
      new.confirmed_at := now();
    elsif new.state = 'declined' then
      if auth.uid() = old.proposed_by then
        raise exception 'decline is for the other person; cancel your own'
          using errcode = '42501';
      end if;
    elsif new.state = 'cancelled' then
      new.cancelled_by := auth.uid();
    elsif new.state = 'done' then
      null;   -- either side may mark it over
    end if;
  end if;

  -- a check-in is the person's own, and is written once
  if new.checkin_state is distinct from old.checkin_state then
    if old.checkin_state is not null then
      raise exception 'a check-in is not edited afterwards' using errcode = '42501';
    end if;
    new.checkin_by := auth.uid();
    new.checkin_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists lili_meets_guard on public.lili_meets;
create trigger lili_meets_guard before update on public.lili_meets
  for each row execute function public.lili_meet_guard();

-- Server-owned columns, as privileges rather than as a list in JavaScript.
revoke all on public.lili_meets from anon, authenticated;
grant select on public.lili_meets to authenticated;
grant insert (conversation_id, item_id, place_key, place_note, meet_at) on public.lili_meets to authenticated;
grant update (state, place_key, place_note, meet_at, checkin_state) on public.lili_meets to authenticated;

/**
 * Tell the other person, in the notifications she already has.
 *
 * A meet proposed and never seen is worse than no meet: one woman turns up.
 */
create or replace function public.lili_notify_meet()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare other uuid; c public.lili_conversations;
begin
  select * into c from public.lili_conversations where id = new.conversation_id;
  if not found then return null; end if;

  if tg_op = 'INSERT' then
    other := case when new.proposed_by = c.buyer_uid then c.seller_uid else c.buyer_uid end;
    insert into public.lili_notifications (user_id, kind, title, body, link_kind, link_id)
    values (other, 'meet_proposed', 'A time and place to meet',
            'She has suggested somewhere to hand the piece over. Confirm it, or suggest another.',
            'conversation', new.conversation_id);
  elsif tg_op = 'UPDATE' and new.state is distinct from old.state
        and new.state in ('confirmed','declined','cancelled') then
    other := case when auth.uid() = c.buyer_uid then c.seller_uid else c.buyer_uid end;
    insert into public.lili_notifications (user_id, kind, title, body, link_kind, link_id)
    values (other, 'meet_' || new.state,
            case new.state when 'confirmed' then 'The meet is agreed'
                           when 'declined'  then 'She suggested a different time'
                           else 'The meet was cancelled' end,
            case new.state when 'confirmed' then 'Both of you have agreed the time and place. It is in your conversation.'
                           when 'declined'  then 'Open the conversation and agree another.'
                           else 'Open the conversation to arrange another.' end,
            'conversation', new.conversation_id);
  end if;
  return null;
end;
$$;

drop trigger if exists lili_meets_notify_ins on public.lili_meets;
create trigger lili_meets_notify_ins after insert on public.lili_meets
  for each row execute function public.lili_notify_meet();
drop trigger if exists lili_meets_notify_upd on public.lili_meets;
create trigger lili_meets_notify_upd after update on public.lili_meets
  for each row execute function public.lili_notify_meet();

-- The CHECK on lili_notifications.kind predates all of this. Extending it is
-- the step that was forgotten when offers were added, which is how offers came
-- to be filed as kind='message'.
alter table public.lili_notifications drop constraint if exists lili_notifications_kind_check;
alter table public.lili_notifications add constraint lili_notifications_kind_check
  check (kind in ('message','offer','price_drop','moderation_outcome','moderation_report_outcome',
                  'listing_live','listing_blocked','shop_action',
                  'meet_proposed','meet_confirmed','meet_declined','meet_cancelled'));
