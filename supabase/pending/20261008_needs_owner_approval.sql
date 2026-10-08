-- lili: one fix from the 8 Oct 2026 review that is NOT applied yet.
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

commit;
