-- Invites existed as a table with no way to create one except by hand in SQL.
-- The private beta is the launch shape, so minting a code is an operation the
-- founder does weekly and should not need a database console for.
--
-- Codes are generated from an alphabet with no O/0, I/1, S/5 or B/8, because a
-- code is read aloud in a WhatsApp voice note and typed by someone who has
-- never seen it written down. Four-four with a dash: LILI-K7QM.

create or replace function public.lili_invite_code()
returns text
language sql
volatile
as $$
  select 'LILI-' || string_agg(
    substr('ACDEFGHJKLMNPQRTUVWXY2346789',
           1 + floor(random() * 28)::int, 1), '')
  from generate_series(1, 4);
$$;

/**
 * Mint invitations. Moderators only — the check is here, not in the client.
 */
create or replace function public.lili_mint_invites(p_count int, p_label text default null)
returns setof text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare i int; c text;
begin
  if not public.lili_is_moderator() then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_count is null or p_count < 1 or p_count > 200 then
    raise exception 'between 1 and 200 at a time' using errcode = '22023';
  end if;
  for i in 1..p_count loop
    loop
      c := public.lili_invite_code();
      exit when not exists (select 1 from public.lili_invites where code = c);
    end loop;
    insert into public.lili_invites (code, label) values (c, p_label);
    return next c;
  end loop;
end;
$$;

/**
 * Who has an invitation, and who used it.
 *
 * Moderators only, and it deliberately returns the email of the person who
 * redeemed — this is the founder looking at her own beta roster of thirty
 * women she is onboarding by hand, not a general user directory.
 */
create or replace function public.lili_invite_roster()
returns table (code text, label text, created_at timestamptz,
               redeemed_at timestamptz, redeemed_email text,
               revoked boolean, has_shop boolean, listings int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.lili_is_moderator() then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  return query
    select i.code, i.label, i.created_at, i.redeemed_at,
           u.email::text,
           i.revoked,
           exists (select 1 from public.lili_shops s where s.owner_uid = i.redeemed_by),
           (select count(*)::int from public.lili_items it where it.owner_uid = i.redeemed_by)
      from public.lili_invites i
      left join auth.users u on u.id = i.redeemed_by
     order by i.created_at desc;
end;
$$;

/** Withdraw an invitation that has not been used. */
create or replace function public.lili_revoke_invite(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.lili_is_moderator() then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  update public.lili_invites set revoked = true
   where upper(code) = upper(btrim(p_code)) and redeemed_by is null;
  return found;
end;
$$;

revoke all on function public.lili_mint_invites(int, text) from public, anon;
revoke all on function public.lili_invite_roster() from public, anon;
revoke all on function public.lili_revoke_invite(text) from public, anon;
grant execute on function public.lili_mint_invites(int, text) to authenticated;
grant execute on function public.lili_invite_roster() to authenticated;
grant execute on function public.lili_revoke_invite(text) to authenticated;
