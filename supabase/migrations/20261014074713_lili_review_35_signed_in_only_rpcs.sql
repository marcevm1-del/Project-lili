-- Advisor 0028: two SECURITY DEFINER functions were executable by `anon`.
-- Both already return 'sign_in_required' for a caller with no uid, and the app
-- only calls them after ensureUser() has a session (anonymous sign-ins carry
-- the `authenticated` role), so signed-out visitors never need them. Revoking
-- removes the reachable surface instead of relying on the first line of each
-- body. No data changes.
revoke execute on function public.lili_redeem_invite(text) from public, anon;
revoke execute on function public.lili_report_conversation(uuid, text[], text, boolean) from public, anon;
grant execute on function public.lili_redeem_invite(text) to authenticated, service_role;
grant execute on function public.lili_report_conversation(uuid, text[], text, boolean) to authenticated, service_role;
