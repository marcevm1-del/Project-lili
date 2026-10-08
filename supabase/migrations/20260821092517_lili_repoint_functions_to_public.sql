-- The trigger functions still name lili.* internally. Repoint them at the
-- moved tables, and pin search_path to public.
create or replace function lili.screen_listing()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare blob text; floor_val numeric; found text[] := '{}'; verdict text := 'live';
begin
  blob := lower(coalesce(new.title,'') || ' ' || coalesce(new.description,'') || ' ' || coalesce(new.brand,''));
  if blob ~ '(replica|counterfeit|\mfake\M|mirror quality|1:1|aaa grade|\mdupe\M)'
     or blob ~ '(ivory|tortoiseshell|shahtoosh|python skin|crocodile skin)'
     or blob ~ '(firearm|\mgun\M|ammunition|taser|pepper spray|\mdagger\M)'
     or blob ~ '(tramadol|xanax|viagra|steroid|prescription)'
     or blob ~ '(whisky|vodka|\mwine\M|vape|e-cigarette|shisha|tobacco)'
     or blob ~ 'used (underwear|panties|lingerie|swimwear|socks)'
  then verdict := 'removed'; found := array_append(found,'prohibited');
  elsif blob ~ '(inspired by|style of|similar to|looks like|unauthenticated|no receipt|factory direct|wholesale|\mmoq\M)'
  then verdict := 'in_review'; found := array_append(found,'signals');
  end if;
  if verdict = 'live' then
    floor_val := case lower(coalesce(new.brand,''))
      when 'hermès' then 4000 when 'hermes' then 4000 when 'chanel' then 3000
      when 'louis vuitton' then 1500 when 'dior' then 1500 when 'cartier' then 3000
      when 'rolex' then 15000 when 'bottega veneta' then 1200 when 'gucci' then 1000
      else null end;
    if floor_val is not null and new.price < floor_val and not new.authenticated then
      verdict := 'in_review'; found := array_append(found,'price_floor');
    end if;
  end if;
  new.status := verdict;
  new.screening := jsonb_build_object('verdict',verdict,'findings',to_jsonb(found),'at',now());
  return new;
end; $$;

create or replace function lili.file_screening_case()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare found text[];
begin
  if new.status = 'live' then return null; end if;
  select array(select jsonb_array_elements_text(new.screening->'findings')) into found;
  if exists (select 1 from public.lili_moderation_cases
             where target_item_id = new.id and state in ('pending','reviewing')) then
    return null; end if;
  insert into public.lili_moderation_cases (kind, source, target_item_id, shop_id, reasons, state, sla_hours)
  values ('listing','auto_screen',new.id,new.shop_id,coalesce(found,'{}'),'pending',
          case when 'prohibited' = any(coalesce(found,'{}')) then 24 else 72 end);
  return null;
end; $$;

create or replace function lili.guard_shop_columns()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if current_setting('role', true) = 'service_role' then return new; end if;
  new.owner_uid := old.owner_uid; new.followers := old.followers;
  new.strikes := old.strikes; new.status := old.status;
  new.created_at := old.created_at; new.updated_at := now();
  return new;
end; $$;

create or replace function lili.sync_followers()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    update public.lili_shops set followers = followers + 1 where id = new.shop_id;
  elsif tg_op = 'DELETE' then
    update public.lili_shops set followers = greatest(0, followers - 1) where id = old.shop_id;
  end if;
  return null;
end; $$;

create or replace function lili.touch()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin new.updated_at := now(); return new; end; $$;
