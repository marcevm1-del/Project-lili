-- ═══════════════════════════════════════════════════════════════════════════
--  PRIVATE BETA — enforced by the database, not by the app
--
--  The launch shape is a private beta behind the market gate: AE stays on
--  `waitlist`, anyone may browse, and only invited women can open a shop, list
--  a piece or start a conversation.
--
--  The client CANNOT be the control here. An invite code checked in JavaScript
--  is a string sitting in a bundle anyone can read, and shipping one would be
--  the same kind of decorative control this codebase has spent v2.8 removing.
--  So membership is a row, redemption is a gated function, and the rule lives
--  in the row-level policies where bypassing the app changes nothing.
--
--  There is one switch to open the doors: `lili_settings.beta_gate`. Set
--  enabled=false and every check below passes for everyone, with no migration
--  and no deploy.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.lili_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
alter table public.lili_settings enable row level security;
-- Readable by anyone (it holds switches, not secrets); writable only by the
-- service role, which has no policy to satisfy.
drop policy if exists settings_read on public.lili_settings;
create policy settings_read on public.lili_settings for select using (true);

insert into public.lili_settings (key, value)
values ('beta_gate', '{"enabled": true}'::jsonb)
on conflict (key) do nothing;

create table if not exists public.lili_invites (
  code         text primary key,
  label        text,                       -- who it was written for, in your words
  created_at   timestamptz not null default now(),
  redeemed_by  uuid references auth.users(id) on delete set null,
  redeemed_at  timestamptz,
  revoked      boolean not null default false
);
alter table public.lili_invites enable row level security;
-- No select policy at all. The code list is not readable by anon or by a
-- signed-in user — not filtered to zero rows, simply no access. Redemption
-- happens through the gated function below.

create table if not exists public.lili_beta_members (
  uid          uuid primary key references auth.users(id) on delete cascade,
  invited_via  text,
  joined_at    timestamptz not null default now()
);
alter table public.lili_beta_members enable row level security;
drop policy if exists beta_self_read on public.lili_beta_members;
create policy beta_self_read on public.lili_beta_members
  for select using (uid = auth.uid());

-- ── the check ──────────────────────────────────────────────────────────────
-- SECURITY DEFINER so it can read lili_beta_members past that table's own
-- policy. It reads auth.uid() rather than current_user, so the handover's
-- "SECURITY DEFINER on a guard defeats the guard" trap does not apply: uid
-- comes from the caller's JWT and a definer context does not change it.
create or replace function public.lili_is_beta_member()
returns boolean
language sql stable security definer set search_path to 'public','pg_temp'
as $$
  select
    coalesce((select (value->>'enabled')::boolean from public.lili_settings where key='beta_gate'), true) = false
    or coalesce((select true from public.lili_beta_members where uid = auth.uid()), false)
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'moderator')::boolean, false);
$$;
revoke all on function public.lili_is_beta_member() from public;
grant execute on function public.lili_is_beta_member() to authenticated;

-- ── redemption ─────────────────────────────────────────────────────────────
-- One code, one woman. Codes are matched case-insensitively and trimmed
-- because they will be typed from a message on a phone.
create or replace function public.lili_redeem_invite(p_code text)
returns jsonb
language plpgsql volatile security definer set search_path to 'public','pg_temp'
as $$
declare v_uid uuid := auth.uid(); v_code text; v_row public.lili_invites;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'sign_in_required');
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

-- ── the gate, in the policies ──────────────────────────────────────────────
-- Browsing is untouched: the SELECT policies still let anyone read live
-- listings and active shops. Only the three doors that create things are
-- narrowed.
drop policy if exists shops_create on public.lili_shops;
create policy shops_create on public.lili_shops for insert
  with check (
    owner_uid = auth.uid() and status = 'active' and followers = 0 and strikes = 0
    and public.lili_is_beta_member()
  );

drop policy if exists items_create on public.lili_items;
create policy items_create on public.lili_items for insert
  with check (
    owner_uid = auth.uid() and status = 'pending' and screening = '{}'::jsonb
    and exists (select 1 from public.lili_shops s
                 where s.id = lili_items.shop_id and s.owner_uid = auth.uid())
    and public.lili_is_beta_member()
  );

drop policy if exists conv_create on public.lili_conversations;
create policy conv_create on public.lili_conversations for insert
  with check (
    buyer_uid = auth.uid() and seller_uid <> auth.uid()
    and not exists (
      select 1 from public.lili_blocks b
       where b.user_id = lili_conversations.seller_uid
         and b.shop_id in (select id from public.lili_shops where owner_uid = auth.uid()))
    and public.lili_is_beta_member()
  );

comment on table public.lili_invites is
  'Private-beta invite codes. No SELECT policy: the list is unreadable from any client. Create codes with the service role; redeem through lili_redeem_invite().';
comment on table public.lili_settings is
  'Runtime switches. beta_gate {"enabled":false} opens listing, shops and messaging to everyone without a deploy.';
