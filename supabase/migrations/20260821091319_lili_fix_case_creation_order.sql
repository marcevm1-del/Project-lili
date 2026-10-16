-- The screening trigger filed its moderation case from a BEFORE INSERT, when
-- the item row does not exist yet — so the foreign key rejected it and the
-- whole insert failed. Any listing that needed review was impossible to create.
--
-- BEFORE decides the verdict; AFTER files the case, once the row is real.

create or replace function lili.screen_listing()
returns trigger
language plpgsql
security definer
set search_path = lili, public
as $$
declare
  blob      text;
  floor_val numeric;
  found     text[] := '{}';
  verdict   text  := 'live';
begin
  blob := lower(coalesce(new.title,'') || ' ' || coalesce(new.description,'') || ' ' || coalesce(new.brand,''));

  if blob ~ '(replica|counterfeit|\mfake\M|mirror quality|1:1|aaa grade|\mdupe\M)'
     or blob ~ '(ivory|tortoiseshell|shahtoosh|python skin|crocodile skin)'
     or blob ~ '(firearm|\mgun\M|ammunition|taser|pepper spray|\mdagger\M)'
     or blob ~ '(tramadol|xanax|viagra|steroid|prescription)'
     or blob ~ '(whisky|vodka|\mwine\M|vape|e-cigarette|shisha|tobacco)'
     or blob ~ 'used (underwear|panties|lingerie|swimwear|socks)'
  then
    verdict := 'removed'; found := array_append(found, 'prohibited');
  elsif blob ~ '(inspired by|style of|similar to|looks like|unauthenticated|no receipt|factory direct|wholesale|\mmoq\M)'
  then
    verdict := 'in_review'; found := array_append(found, 'signals');
  end if;

  if verdict = 'live' then
    floor_val := case lower(coalesce(new.brand,''))
      when 'hermès' then 4000 when 'hermes' then 4000
      when 'chanel' then 3000 when 'louis vuitton' then 1500
      when 'dior' then 1500   when 'cartier' then 3000
      when 'rolex' then 15000 when 'bottega veneta' then 1200
      when 'gucci' then 1000  else null end;
    if floor_val is not null and new.price < floor_val and not new.authenticated then
      verdict := 'in_review'; found := array_append(found, 'price_floor');
    end if;
  end if;

  new.status := verdict;
  new.screening := jsonb_build_object('verdict', verdict, 'findings', to_jsonb(found), 'at', now());
  return new;
end;
$$;

-- files the case once the item row actually exists
create or replace function lili.file_screening_case()
returns trigger language plpgsql security definer set search_path = lili as $$
declare found text[];
begin
  if new.status = 'live' then return null; end if;
  select array(select jsonb_array_elements_text(new.screening->'findings')) into found;

  -- one open case per item, so an edit does not pile up duplicates
  if exists (select 1 from lili.moderation_cases
             where target_item_id = new.id and state in ('pending','reviewing')) then
    return null;
  end if;

  insert into lili.moderation_cases (kind, source, target_item_id, shop_id, reasons, state, sla_hours)
  values ('listing', 'auto_screen', new.id, new.shop_id, coalesce(found,'{}'), 'pending',
          case when 'prohibited' = any(coalesce(found,'{}')) then 24 else 72 end);
  return null;
end; $$;

drop trigger if exists file_case_ins on lili.items;
create trigger file_case_ins after insert on lili.items
  for each row execute function lili.file_screening_case();

drop trigger if exists file_case_upd on lili.items;
create trigger file_case_upd after update of status on lili.items
  for each row when (new.status in ('removed','in_review'))
  execute function lili.file_screening_case();
