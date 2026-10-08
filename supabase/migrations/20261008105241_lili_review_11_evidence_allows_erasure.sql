-- Erasure failed for anyone who had ever attached a conversation to a report:
-- deleting her auth user sets lili_case_evidence.disclosed_by (and, once the
-- pending FK change lands, conversation_id) to NULL, and this guard refused
-- every UPDATE, so lili_erase_me aborted. The record stays frozen; the only
-- change allowed is a referential action clearing those two links.
create or replace function lili.guard_evidence_immutable()
returns trigger language plpgsql set search_path to 'public', 'pg_temp'
as $$
begin
  if new.id = old.id
     and new.case_id = old.case_id
     and new.transcript = old.transcript
     and new.message_count = old.message_count
     and new.captured_at = old.captured_at
     and (new.disclosed_by is not distinct from old.disclosed_by or new.disclosed_by is null)
     and (new.conversation_id is not distinct from old.conversation_id or new.conversation_id is null)
  then
    return new;
  end if;
  raise exception 'case evidence is a frozen record and cannot be edited';
end; $$;
