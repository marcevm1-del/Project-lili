-- lili: three changes from the 8 Oct 2026 review that are NOT applied yet.
--
-- It uses DROP CONSTRAINT / DROP NOT NULL, which the Supabase connector treats
-- as destructive, so it needs the project owner to run it. Paste this file into Supabase → SQL Editor for
-- project yjsmkjwvoolsszsedony and press Run. It is one transaction; nothing
-- here deletes any data: the DROPs only swap a foreign-key rule and relax a
-- NOT NULL.

begin;

-- ── 1. Erasure works, and keeps the other person's half of a conversation ────
-- lili_erase_me redacts a deleted user's messages and promises the person she
-- spoke to keeps a thread that makes sense. But with ON DELETE CASCADE,
-- deleting the auth user deleted every conversation she was in, with both
-- sides' messages and any meet plans. SET NULL keeps them, attributed to no one.
alter table public.lili_conversations alter column buyer_uid  drop not null;
alter table public.lili_conversations alter column seller_uid drop not null;
alter table public.lili_messages      alter column sender_uid drop not null;
alter table public.lili_meets         alter column proposed_by drop not null;
-- Found by the functional test: lili_case_evidence links to the reporter and
-- the conversation with ON DELETE SET NULL, but both columns were NOT NULL, so
-- erasure failed outright for anyone who had ever attached a chat to a report.
alter table public.lili_case_evidence alter column disclosed_by    drop not null;
alter table public.lili_case_evidence alter column conversation_id drop not null;

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

-- ── 2. Saved-search alerts can be delivered ─────────────────────────────────
-- Saved searches (migration lili_review_18) already count new matches in the
-- app. The notification itself needs its own kind, which this CHECK does not
-- list; until it does, the alert is skipped quietly.
alter table public.lili_notifications drop constraint lili_notifications_kind_check;
alter table public.lili_notifications add constraint lili_notifications_kind_check check (kind = any (array[
  'message', 'offer', 'price_drop', 'moderation_outcome', 'moderation_report_outcome',
  'listing_live', 'listing_blocked', 'shop_action', 'meet_proposed', 'meet_confirmed',
  'meet_declined', 'meet_cancelled', 'saved_search']));

-- ── 3. Retention ────────────────────────────────────────────────────────────
-- Analytics events are kept 13 months and read notifications 90 days, instead
-- of forever. A nightly job; nothing else deletes these rows.
create or replace function lili.prune_retention()
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare n_events int; n_notes int;
begin
  delete from public.lili_events where created_at < now() - interval '13 months';
  get diagnostics n_events = row_count;
  delete from public.lili_notifications where read_at is not null and read_at < now() - interval '90 days';
  get diagnostics n_notes = row_count;
  return jsonb_build_object('events', n_events, 'notifications', n_notes);
end; $$;
revoke all on function lili.prune_retention() from public, anon, authenticated;
select cron.schedule('lili-retention', '41 3 * * *', 'select lili.prune_retention()');

commit;
