-- The counterfeit screen's working was public. lili_items.screening held the
-- rule version, score, threshold, price band and the names of the rules that
-- fired, and every listing is readable signed out — a seller could edit a
-- title until the findings went empty and the score fell under the threshold.
--
-- The details now live in lili_item_screening, which no client can read.
-- The listing keeps only what other code and the seller need: the verdict, when
-- it was reached, and the owner-withdrawal flags.

create table if not exists public.lili_item_screening (
  item_id    uuid primary key references public.lili_items(id) on delete cascade
             deferrable initially deferred,
  details    jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.lili_item_screening enable row level security;
revoke all on public.lili_item_screening from anon, authenticated;

-- Runs after screen_listing (BEFORE triggers fire in name order): keep the
-- details private, leave the public summary on the row.
create or replace function lili.keep_screening_private()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
begin
  if new.screening is null or not (new.screening ? 'findings' or new.screening ? 'score') then
    return new;
  end if;
  insert into public.lili_item_screening (item_id, details, updated_at)
  values (new.id, new.screening, now())
  on conflict (item_id) do update set details = excluded.details, updated_at = now();
  new.screening := jsonb_strip_nulls(jsonb_build_object(
    'verdict', new.screening -> 'verdict',
    'at', new.screening -> 'at',
    'withdrawn_by_owner', new.screening -> 'withdrawn_by_owner',
    'withdrawn_at', new.screening -> 'withdrawn_at'));
  return new;
end; $$;
revoke all on function lili.keep_screening_private() from public, anon, authenticated;

create or replace trigger zz_keep_screening_private
  before insert or update on public.lili_items
  for each row execute function lili.keep_screening_private();

-- The moderation case reads the findings from the private record now.
create or replace function lili.file_screening_case()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare found text[];
begin
  if new.status = 'live' then return null; end if;
  select array(select jsonb_array_elements_text(s.details -> 'findings'))
    into found from public.lili_item_screening s where s.item_id = new.id;
  if exists (select 1 from public.lili_moderation_cases
             where target_item_id = new.id and state in ('pending','reviewing')) then
    return null; end if;
  insert into public.lili_moderation_cases
    (kind, source, target_item_id, shop_id, reported_uid, reasons, state, sla_hours)
  values ('listing', 'auto_screen', new.id, new.shop_id, new.owner_uid,
          coalesce(found, '{}'), 'pending',
          case when new.status = 'removed' then 24 else 72 end);
  return null;
end; $$;
