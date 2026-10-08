-- lili: two fixes from the 8 Oct 2026 review that are NOT applied yet.
--
-- Both contain statements the Supabase connector treats as destructive
-- (DROP CONSTRAINT, and a function body that deletes a row), so they need the
-- project owner to run them. Paste this file into Supabase → SQL Editor for
-- project yjsmkjwvoolsszsedony and press Run. It is one transaction; nothing
-- here deletes any data (the tables involved are empty, and the DROP only
-- swaps a foreign-key rule).

begin;

-- ── 1. Erasure keeps the other person's half of a conversation ───────────────
-- lili_erase_me redacts a deleted user's messages and promises the person she
-- spoke to keeps a thread that makes sense. But with ON DELETE CASCADE,
-- deleting the auth user deleted every conversation she was in, with both
-- sides' messages and any meet plans. SET NULL keeps them, attributed to no one.
alter table public.lili_conversations alter column buyer_uid  drop not null;
alter table public.lili_conversations alter column seller_uid drop not null;
alter table public.lili_messages      alter column sender_uid drop not null;
alter table public.lili_meets         alter column proposed_by drop not null;

alter table public.lili_conversations drop constraint lili_conversations_buyer_uid_fkey;
alter table public.lili_conversations add constraint lili_conversations_buyer_uid_fkey
  foreign key (buyer_uid) references auth.users(id) on delete set null;
alter table public.lili_conversations drop constraint lili_conversations_seller_uid_fkey;
alter table public.lili_conversations add constraint lili_conversations_seller_uid_fkey
  foreign key (seller_uid) references auth.users(id) on delete set null;
alter table public.lili_messages drop constraint lili_messages_sender_uid_fkey;
alter table public.lili_messages add constraint lili_messages_sender_uid_fkey
  foreign key (sender_uid) references auth.users(id) on delete set null;
alter table public.lili_meets drop constraint lili_meets_proposed_by_fkey;
alter table public.lili_meets add constraint lili_meets_proposed_by_fkey
  foreign key (proposed_by) references auth.users(id) on delete set null;

-- ── 2. A seller can take her own listing down ────────────────────────────────
-- There is no DELETE policy on lili_items and status is not client-writable,
-- so today a listing can only disappear by erasing the whole account.
create or replace function public.lili_withdraw_listing(p_item uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if not exists (select 1 from public.lili_items where id = p_item and owner_uid = me) then
    raise exception 'That listing is not yours' using errcode = '42501';
  end if;
  -- taking a listing down is not a way to end a review of it
  if exists (select 1 from public.lili_moderation_cases
              where target_item_id = p_item and state in ('pending', 'reviewing')) then
    raise exception 'This listing is being reviewed. It can be taken down once that is decided.'
      using errcode = '55000';
  end if;
  delete from public.lili_items where id = p_item;
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function public.lili_withdraw_listing(uuid) from public, anon;
grant execute on function public.lili_withdraw_listing(uuid) to authenticated;

commit;
