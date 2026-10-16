-- Surface reduction, not a fix for an exploit.
--
-- `lili_case_transcript` refuses anyone who is not a moderator — it checks
-- lili_is_moderator(), which reads a JWT app_metadata claim that no anonymous
-- caller can hold — so the anon EXECUTE grant was never exploitable. But a
-- moderator-only function reachable at /rest/v1/rpc/ without signing in is
-- surplus surface, and the next person to edit that guard should not have an
-- unauthenticated path waiting behind their mistake.
--
-- `lili_invite_code` only generates a random string, but nothing anonymous has
-- any reason to call it either.
--
-- `lili_redeem_invite` is deliberately LEFT callable by anon. It answers
-- {ok:false, reason:'sign_in_required'}, and the compliance screen turns that
-- reason into a sentence a woman can act on. Revoking it would replace that
-- with a bare 403 that the UI has no case for.
revoke execute on function public.lili_case_transcript(uuid) from anon;
revoke execute on function public.lili_invite_code() from anon;
