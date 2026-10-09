alter table public.lili_moderation_cases
  add column if not exists reported_uid uuid references auth.users(id) on delete set null;
create index if not exists lili_moderation_cases_reported_uid_idx
  on public.lili_moderation_cases (reported_uid);

create or replace function lili.guard_case_insert()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  v_owner uuid; v_shop uuid;
  v_client boolean := coalesce(current_setting('role', true), '') in ('authenticated', 'anon')
                      and pg_trigger_depth() = 1;
begin
  if v_client then new.reported_uid := null; end if;
  if new.target_item_id is not null then
    select owner_uid, shop_id into v_owner, v_shop from public.lili_items where id = new.target_item_id;
    if found then
      new.shop_id := v_shop;
      new.reported_uid := coalesce(new.reported_uid, v_owner);
    end if;
  elsif new.reported_uid is null and new.shop_id is not null then
    select owner_uid into new.reported_uid from public.lili_shops where id = new.shop_id;
  end if;
  if v_client then
    new.source := 'user_report'; new.reported_by := auth.uid(); new.state := 'pending';
    new.decision := null; new.decided_at := null; new.sla_hours := 72; new.created_at := now();
  end if;
  return new;
end; $$;
create or replace trigger guard_case_ins before insert on public.lili_moderation_cases
  for each row execute function lili.guard_case_insert();

create or replace function lili.file_screening_case()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare found text[];
begin
  if new.status = 'live' then return null; end if;
  select array(select jsonb_array_elements_text(new.screening->'findings')) into found;
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
