-- The first version of this guard blocked UPDATE *and* DELETE. Blocking delete
-- is the wrong call, for a reason that only shows up later:
--
--   Under the PDPL and the GDPR a person can ask for her data to be erased. A
--   transcript that literally cannot be deleted by anyone turns a lawful
--   erasure request into a schema migration under time pressure. It also breaks
--   the ON DELETE CASCADE from the case itself.
--
-- Immutability here means "nobody rewrites the evidence", not "this outlives
-- every obligation". So UPDATE stays impossible and DELETE is allowed — and the
-- audit row for the report survives regardless, because lili_audit is append
-- only and records that a transcript was attached and how many messages it held.
-- The record that it existed is not erased by erasing the content.

create or replace function lili.guard_evidence_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'case evidence is a frozen record and cannot be edited';
end; $$;

drop trigger if exists guard_evidence on public.lili_case_evidence;
create trigger guard_evidence before update on public.lili_case_evidence
  for each row execute function lili.guard_evidence_immutable();
