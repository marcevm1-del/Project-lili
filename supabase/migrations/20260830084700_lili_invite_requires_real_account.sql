-- An invite must attach to an account she can get back into.
--
-- The app signs everyone in anonymously so a shopper never meets a wall just to
-- look. That is right for browsing and wrong for redemption: an anonymous
-- session is a uid on one device. If she redeems while anonymous and later
-- signs in properly, Supabase issues a DIFFERENT uid — and she loses the
-- membership, the shop and every listing under it, with a used-up code and no
-- obvious way back.
--
-- Thirty invited sellers is exactly the population where that happens twice and
-- costs you two of them. So redemption now requires a real account, and says so
-- rather than failing vaguely.

create or replace function public.lili_redeem_invite(p_code text)
returns jsonb
language plpgsql volatile security definer set search_path to 'public','pg_temp'
as $$
declare v_uid uuid := auth.uid(); v_code text; v_row public.lili_invites;
        v_anon boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'sign_in_required');
  end if;

  -- is_anonymous is a top-level JWT claim on Supabase anonymous sessions.
  v_anon := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  if v_anon then
    return jsonb_build_object('ok', false, 'reason', 'needs_real_account');
  end if;

  if exists (select 1 from public.lili_beta_members where uid = v_uid) then
    return jsonb_build_object('ok', true, 'reason', 'already_a_member');
  end if;

  v_code := upper(btrim(coalesce(p_code,'')));
  if v_code = '' then
    return jsonb_build_object('ok', false, 'reason', 'empty');
  end if;

  select * into v_row from public.lili_invites
   where upper(code) = v_code and not revoked
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown');
  end if;
  if v_row.redeemed_by is not null and v_row.redeemed_by <> v_uid then
    return jsonb_build_object('ok', false, 'reason', 'already_used');
  end if;

  update public.lili_invites
     set redeemed_by = v_uid, redeemed_at = now()
   where code = v_row.code;

  insert into public.lili_beta_members (uid, invited_via)
  values (v_uid, v_row.code)
  on conflict (uid) do nothing;

  return jsonb_build_object('ok', true, 'reason', 'welcome');
end; $$;
revoke all on function public.lili_redeem_invite(text) from public;
grant execute on function public.lili_redeem_invite(text) to authenticated;
