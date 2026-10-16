create or replace function public.lili_report_conversation(p_conversation_id uuid, p_reasons text[], p_detail text, p_attach_transcript boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
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
  if v_uid is distinct from c.buyer_uid and v_uid is distinct from c.seller_uid then
    return jsonb_build_object('ok', false, 'reason', 'not_your_conversation');
  end if;

  v_other := case when v_uid = c.buyer_uid then c.seller_uid else c.buyer_uid end;
  v_shop  := c.shop_id;

  insert into public.lili_moderation_cases (kind, source, shop_id, reported_by, reasons, detail)
  values ('conversation', 'user_report', v_shop, v_uid, p_reasons, left(coalesce(p_detail,''), 2000))
  returning id into v_case;
  -- guard_case_insert derives the reported person from the shop during a client
  -- request; for a conversation it is whoever is on the other side.
  update public.lili_moderation_cases set reported_uid = v_other where id = v_case;

  if p_attach_transcript then
    select coalesce(jsonb_agg(jsonb_build_object(
             'at', m.created_at,
             'from', case when m.sender_uid = v_uid then 'reporter' else 'reported' end,
             'body', m.body) order by m.created_at), '[]'::jsonb),
           count(*)
      into v_transcript, v_count
      from public.lili_messages m where m.conversation_id = p_conversation_id;
    insert into public.lili_case_evidence (case_id, conversation_id, disclosed_by, transcript, message_count)
    values (v_case, p_conversation_id, v_uid, v_transcript, coalesce(v_count,0));
  end if;

  insert into public.lili_audit (kind, actor_uid, subject, meta)
  values ('conversation.reported', v_uid, v_case::text,
          jsonb_build_object('conversation', p_conversation_id, 'reported_party', v_other,
                             'transcript_attached', p_attach_transcript, 'messages', coalesce(v_count, 0)));

  return jsonb_build_object('ok', true, 'case_id', v_case, 'transcript_attached', p_attach_transcript);
end; $$;
