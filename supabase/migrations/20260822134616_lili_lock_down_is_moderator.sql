-- I revoked the three moderation functions from anon but missed this one, and
-- Postgres grants EXECUTE to PUBLIC by default — so a signed-out caller could
-- invoke a SECURITY DEFINER function over the API. It only ever returns false
-- for them, but an unauthenticated caller should not be able to reach into a
-- privileged function at all. Least privilege is not only about what leaks.
revoke all on function public.lili_is_moderator() from public, anon;
grant execute on function public.lili_is_moderator() to authenticated;

-- confirm the other three are equally tight
revoke all on function public.lili_moderation_list(text) from public, anon;
revoke all on function public.lili_moderation_claim(uuid) from public, anon;
revoke all on function public.lili_moderation_decide(uuid, text, text) from public, anon;
grant execute on function public.lili_moderation_list(text) to authenticated;
grant execute on function public.lili_moderation_claim(uuid) to authenticated;
grant execute on function public.lili_moderation_decide(uuid, text, text) to authenticated;
