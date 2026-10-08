-- ─────────────────────────────────────────────────────────────────────────────
--  MESSAGING: three things that were not true
--
--  1. LIVE DELIVERY DID NOT EXIST.
--     `watchMessages` subscribes to postgres_changes on lili_messages and
--     returns an unsubscribe function, so every caller believes the thread is
--     live. The supabase_realtime publication was EMPTY — the subscription
--     succeeded and delivered nothing, for ever. A control that only looks
--     like a control.
--
--  2. A PARTICIPANT COULD EDIT THE OTHER WOMAN'S MESSAGES.
--     msg_mark_read is an UPDATE policy with WITH CHECK (true), and
--     authenticated held UPDATE on every column including `body`. The
--     immutability trigger silently RESTORED the old values instead of
--     refusing — so the write reported success, the client's optimistic state
--     showed the edit, and a refresh put it back. Worse: a reporter can freeze
--     a transcript as evidence, so editable messages are tamperable evidence.
--     Column-level GRANTs refuse the write instead. The trigger stays as a
--     second line for the service role path.
--
--  3. A PARTICIPANT COULD REASSIGN A THREAD.
--     authenticated held UPDATE on lili_conversations.seller_uid and
--     last_message. A buyer could point an existing thread at an uninvolved
--     woman and set the preview text she sees in her inbox. No client code
--     updates this table at all — last_at/last_message are written by the
--     SECURITY DEFINER touch trigger — so the grant existed for nothing.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1 ── live delivery, for real
alter publication supabase_realtime add table public.lili_messages;
alter publication supabase_realtime add table public.lili_notifications;

-- 2 ── only read_at may be written by a client
revoke update on public.lili_messages from authenticated, anon;
grant update (read_at) on public.lili_messages to authenticated;

-- 3 ── nothing on a conversation is client-writable
revoke update on public.lili_conversations from authenticated, anon;
drop policy if exists conv_update on public.lili_conversations;

-- 4 ── leftover probe tables from earlier security testing. RLS disabled, so
--      readable and writable by anyone holding the publishable key. They hold
--      nothing and are referenced by nothing.
drop table if exists public._drop_probe;
drop table if exists public._pp_probe;
