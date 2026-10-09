-- ═══════════════════════════════════════════════════════════════════════════
--  CONSENTED DISCLOSURE — making a harassment report reviewable
--
--  The problem, stated honestly in the go-live checklist: moderators cannot
--  read a reported conversation, because NOTHING can. `anon` holds no grant,
--  and only the two participants have a policy. So a harassment report could be
--  filed and could never be assessed — the only outcome available was a block,
--  which the woman could already do herself.
--
--  Three ways out were on the table. This is the one that gives NOBODY a power
--  they did not already have:
--
--    The reporter may attach a copy of HER OWN conversation to HER OWN report.
--
--  She can already read that thread. She chooses to hand a copy over, at the
--  moment she asks for help, and nothing else is disclosed. There is no
--  moderator key, no "open any thread" button, and no quiet convenience that
--  grows into surveillance later. If she does not attach it, nobody sees it and
--  the case is judged on what she wrote.
--
--  What is deliberately built in:
--
--    · The snapshot is taken AT REPORT TIME and is immutable. A harasser
--      cannot undo it, and neither can she — evidence that can be edited later
--      is not evidence.
--    · Only a moderator can read it, only through a gated function, and every
--      read writes an audit row nobody can erase.
--    · The reported party is NOT told a report was filed. Telling someone they
--      have been reported for harassment, before any decision, is how reporting
--      gets people hurt. Both parties are still told the OUTCOME, through the
--      existing statement-of-reasons path.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.lili_case_evidence (
  id              uuid primary key default gen_random_uuid(),
  case_id         uuid not null references public.lili_moderation_cases(id) on delete cascade,
  conversation_id uuid not null references public.lili_conversations(id) on delete set null,
  disclosed_by    uuid not null references auth.users(id) on delete set null,
  -- the thread as it stood when she asked for help, frozen
  transcript      jsonb not null,
  message_count   int not null,
  captured_at     timestamptz not null default now()
);

alter table public.lili_case_evidence enable row level security;
-- No policy at all. Not readable, not writable, from any client, by anyone —
-- including the moderator. The only way in is the gated function below.

create index if not exists lili_case_evidence_case on public.lili_case_evidence(case_id);

-- Immutable once written. A transcript you can edit is not a transcript.
create or replace function lili.guard_evidence_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'case evidence is a frozen record and cannot be changed';
end; $$;

drop trigger if exists guard_evidence on public.lili_case_evidence;
create trigger guard_evidence before update or delete on public.lili_case_evidence
  for each row execute function lili.guard_evidence_immutable();

-- ── she reports her own conversation ───────────────────────────────────────
create or replace function public.lili_report_conversation(
  p_conversation_id uuid,
  p_reasons text[],
  p_detail text,
  p_attach_transcript boolean default false)
returns jsonb
language plpgsql volatile security definer set search_path to 'public','pg_temp'
as $$
declare v_uid uuid := auth.uid(); c public.lili_conversations;
        v_case uuid; v_other uuid; v_shop uuid; v_transcript jsonb; v_count int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'sign_in_required');
  end if;
  if coalesce(array_length(p_reasons,1),0) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'reason_required');
  end if;

  select * into c from public.lili_conversations where id = p_conversation_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_conversation');
  end if;
  -- Only a participant. This is the whole basis of the consent: she is
  -- disclosing something that is already hers to read.
  if v_uid <> c.buyer_uid and v_uid <> c.seller_uid then
    return jsonb_build_object('ok', false, 'reason', 'not_your_conversation');
  end if;

  v_other := case when v_uid = c.buyer_uid then c.seller_uid else c.buyer_uid end;
  v_shop  := c.shop_id;

  insert into public.lili_moderation_cases (kind, source, shop_id, reported_by, reasons, detail)
  values ('conversation', 'user_report', v_shop, v_uid, p_reasons,
          left(coalesce(p_detail,''), 2000))
  returning id into v_case;

  if p_attach_transcript then
    select coalesce(jsonb_agg(jsonb_build_object(
             'at', m.created_at,
             'from', case when m.sender_uid = v_uid then 'reporter' else 'reported' end,
             'body', m.body) order by m.created_at), '[]'::jsonb),
           count(*)
      into v_transcript, v_count
      from public.lili_messages m
     where m.conversation_id = p_conversation_id;

    insert into public.lili_case_evidence
      (case_id, conversation_id, disclosed_by, transcript, message_count)
    values (v_case, p_conversation_id, v_uid, v_transcript, coalesce(v_count,0));
  end if;

  insert into public.lili_audit (kind, actor_uid, subject, meta)
  values ('conversation.reported', v_uid, v_case::text,
          jsonb_build_object('conversation', p_conversation_id,
                             'reported_party', v_other,
                             'transcript_attached', p_attach_transcript,
                             'messages', coalesce(v_count, 0)));

  -- Deliberately no notification to the reported party. She learns the outcome
  -- through the statement of reasons, not that a report exists.
  return jsonb_build_object('ok', true, 'case_id', v_case,
                            'transcript_attached', p_attach_transcript);
end; $$;
revoke all on function public.lili_report_conversation(uuid, text[], text, boolean) from public;
grant execute on function public.lili_report_conversation(uuid, text[], text, boolean) to authenticated;

-- ── a moderator reads it, and the reading is recorded ──────────────────────
create or replace function public.lili_case_transcript(p_case uuid)
returns jsonb
language plpgsql volatile security definer set search_path to 'public','pg_temp'
as $$
declare v_uid uuid := auth.uid(); e public.lili_case_evidence;
begin
  if not public.lili_is_moderator() then
    raise exception 'not authorized';
  end if;

  select * into e from public.lili_case_evidence where case_id = p_case
   order by captured_at limit 1;
  if not found then
    return jsonb_build_object('attached', false,
      'note', 'The person who reported this did not attach the conversation. Decide on what she wrote, or ask her.');
  end if;

  -- Every read leaves a mark. An audited path nobody audits is an unaudited
  -- path with extra steps.
  insert into public.lili_audit (kind, actor_uid, subject, meta)
  values ('case.transcript.read', v_uid, p_case::text,
          jsonb_build_object('evidence', e.id, 'messages', e.message_count,
                             'disclosed_by', e.disclosed_by));

  return jsonb_build_object('attached', true,
                            'captured_at', e.captured_at,
                            'messages', e.message_count,
                            'transcript', e.transcript);
end; $$;
revoke all on function public.lili_case_transcript(uuid) from public;
grant execute on function public.lili_case_transcript(uuid) to authenticated;

comment on table public.lili_case_evidence is
  'Frozen transcripts a reporter chose to attach to her own report. No RLS policy: unreadable from any client. Moderators read through lili_case_transcript(), which writes an audit row on every read.';
