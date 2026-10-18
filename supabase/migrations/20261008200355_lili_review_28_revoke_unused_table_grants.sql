-- M-1 · defence in depth. These tables were protected by row-level security
-- alone (RLS on, no permissive policy) while anon and authenticated kept the
-- default table grants. One mistaken policy later and report evidence or invite
-- codes would be readable. Every legitimate path goes through definer
-- functions, which run as the owner and are unaffected.

revoke all on public.lili_case_evidence from anon, authenticated;
revoke all on public.lili_invites       from anon, authenticated;

-- read-only reference data: readable, never writable by a client
revoke insert, update, delete, truncate on public.lili_settings     from anon, authenticated;
revoke insert, update, delete, truncate on public.lili_search_terms from anon, authenticated;

-- membership is granted by lili_redeem_invite; a member may read her own row
revoke insert, update, delete, truncate on public.lili_beta_members from anon, authenticated;
revoke all on public.lili_beta_members from anon;
