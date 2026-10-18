-- Widen the keyspace, and put the counter in front of the door.
--
-- Four characters over 28 symbols is ~614k. Eight is ~3.8×10^11 — six orders of
-- magnitude, for two extra syllables when it is read aloud. The alphabet stays
-- deliberately unambiguous (no O/0, I/1, S/5, B/8) because a code gets dictated
-- in a voice note and typed by someone who has never seen it written.
--
-- Format goes from LILI-K7QM to LILI-K7QM-4TXR: still one recognisable thing,
-- still groupable, and now not enumerable.

create or replace function public.lili_invite_code()
returns text
language sql
volatile
as $$
  select 'LILI-' ||
         string_agg(substr('ACDEFGHJKLMNPQRTUVWXY2346789', 1 + floor(random()*28)::int, 1), '')
           filter (where i <= 4) ||
         '-' ||
         string_agg(substr('ACDEFGHJKLMNPQRTUVWXY2346789', 1 + floor(random()*28)::int, 1), '')
           filter (where i > 4)
    from generate_series(1, 8) as g(i);
$$;

/**
 * Redeem an invitation — now with a limit, and a real reason when it refuses.
 *
 * Ten attempts an hour per identity. A woman typing her own code gets it wrong
 * once or twice; ten is generous for her and useless for a search. Combined
 * with the widened keyspace, enumerating is no longer a strategy: at ten an
 * hour it is longer than the age of the marketplace by many orders.
 *
 * A SUCCESSFUL redemption is not counted, so somebody with a valid code is
 * never punished for a housemate's typos on the same account.
 */
create or replace function public.lili_redeem_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid(); v_code text; v_row public.lili_invites; v_anon boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'sign_in_required');
  end if;

  v_anon := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  if v_anon then
    return jsonb_build_object('ok', false, 'reason', 'needs_real_account');
  end if;

  if exists (select 1 from public.lili_beta_members where uid = v_uid) then
    return jsonb_build_object('ok', true, 'reason', 'already_a_member');
  end if;

  -- The counter goes here: after the cheap checks, before the code is compared,
  -- so a lockout cannot be probed for information about a code.
  if not public.lili_rate_ok('invite.redeem', 10, interval '1 hour') then
    return jsonb_build_object('ok', false, 'reason', 'too_many_tries');
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

  -- She got in; forget the failed attempts that came before.
  delete from public.lili_attempts where actor = v_uid and action = 'invite.redeem';

  return jsonb_build_object('ok', true, 'reason', 'welcome');
end;
$$;

-- Reissue the unused codes at the new length. Nothing has been handed out yet
-- — none of the thirty is redeemed — so this costs nothing and closes the old
-- keyspace rather than leaving thirty four-character codes live alongside.
delete from public.lili_invites where redeemed_by is null and not revoked;
insert into public.lili_invites (code, label)
select public.lili_invite_code(), 'launch cohort 1'
from generate_series(1,30)
on conflict (code) do nothing;
