-- ═══════════════════════════════════════════════════════════════════════════
--  MESSAGING
--
--  "A group chat with a checkout button" is the whole idea, so this is not a
--  side feature. It is also the most sensitive table in the schema: private
--  conversations between two named women, often about where and when to meet.
--
--  The rules below are stricter than anywhere else in this database.
--  A conversation is visible ONLY to its two participants — not to a shop
--  owner, not to a moderator through the API, not to anyone holding the
--  publishable key. Nothing here is public, ever.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.lili_conversations (
  id           uuid primary key default gen_random_uuid(),
  buyer_uid    uuid not null references auth.users(id) on delete cascade,
  seller_uid   uuid not null references auth.users(id) on delete cascade,
  shop_id      uuid references public.lili_shops(id) on delete set null,
  item_id      uuid references public.lili_items(id) on delete set null,
  last_message text,
  last_at      timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  constraint lili_conv_distinct check (buyer_uid <> seller_uid)
);
-- one thread per buyer/seller/item, so a shop does not fragment into ten
create unique index if not exists lili_conv_uniq
  on public.lili_conversations (buyer_uid, seller_uid, coalesce(item_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists lili_conv_buyer on public.lili_conversations(buyer_uid, last_at desc);
create index if not exists lili_conv_seller on public.lili_conversations(seller_uid, last_at desc);

create table if not exists public.lili_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.lili_conversations(id) on delete cascade,
  sender_uid      uuid not null references auth.users(id) on delete cascade,
  body            text not null check (length(btrim(body)) between 1 and 2000),
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists lili_msg_conv on public.lili_messages(conversation_id, created_at);

alter table public.lili_conversations enable row level security;
alter table public.lili_messages      enable row level security;

-- ── who may see a conversation ─────────────────────────────────────────────
create policy conv_read on public.lili_conversations for select
  using (buyer_uid = auth.uid() or seller_uid = auth.uid());

-- A buyer opens the thread. She cannot invent one on someone else's behalf,
-- and she cannot open one with a seller who has blocked her.
create policy conv_create on public.lili_conversations for insert
  with check (
    buyer_uid = auth.uid()
    and seller_uid <> auth.uid()
    and not exists (
      select 1 from public.lili_blocks b
       where b.user_id = seller_uid
         and b.shop_id in (select id from public.lili_shops where owner_uid = auth.uid())
    )
  );

create policy conv_update on public.lili_conversations for update
  using (buyer_uid = auth.uid() or seller_uid = auth.uid())
  with check (buyer_uid = auth.uid() or seller_uid = auth.uid());

-- ── who may see a message ──────────────────────────────────────────────────
create policy msg_read on public.lili_messages for select
  using (exists (
    select 1 from public.lili_conversations c
     where c.id = conversation_id
       and (c.buyer_uid = auth.uid() or c.seller_uid = auth.uid())));

-- You may only send AS yourself, and only into a thread you are part of.
create policy msg_create on public.lili_messages for insert
  with check (
    sender_uid = auth.uid()
    and exists (
      select 1 from public.lili_conversations c
       where c.id = conversation_id
         and (c.buyer_uid = auth.uid() or c.seller_uid = auth.uid()))
  );

-- Marking as read is the only update anyone may make. A sent message cannot be
-- silently rewritten afterwards: it is evidence in a dispute.
create policy msg_mark_read on public.lili_messages for update
  using (exists (
    select 1 from public.lili_conversations c
     where c.id = conversation_id
       and (c.buyer_uid = auth.uid() or c.seller_uid = auth.uid())
       and sender_uid <> auth.uid()))
  with check (true);

create or replace function lili.guard_message_immutable()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user in ('postgres','service_role') then return new; end if;
  -- only read_at may change
  new.body            := old.body;
  new.sender_uid      := old.sender_uid;
  new.conversation_id := old.conversation_id;
  new.created_at      := old.created_at;
  return new;
end; $$;

drop trigger if exists guard_msg on public.lili_messages;
create trigger guard_msg before update on public.lili_messages
  for each row execute function lili.guard_message_immutable();

-- keep the thread preview current without a second round trip
create or replace function lili.touch_conversation()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.lili_conversations
     set last_message = left(new.body, 140), last_at = new.created_at
   where id = new.conversation_id;
  return null;
end; $$;

drop trigger if exists touch_conv on public.lili_messages;
create trigger touch_conv after insert on public.lili_messages
  for each row execute function lili.touch_conversation();

grant select, insert, update on public.lili_conversations to authenticated;
grant select, insert, update on public.lili_messages to authenticated;
-- anon gets nothing at all: no select, no insert
revoke all on public.lili_conversations from anon;
revoke all on public.lili_messages from anon;
