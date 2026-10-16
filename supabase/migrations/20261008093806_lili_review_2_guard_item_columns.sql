create or replace function lili.guard_item_columns()
returns trigger language plpgsql set search_path to 'public', 'pg_temp'
as $$
begin
  if current_user in ('postgres', 'service_role') then return new; end if;
  if tg_op = 'INSERT' then
    new.authenticated := false; new.saves := 0;
    new.previous_price := null; new.price_changed_at := null; new.created_at := now();
  else
    new.authenticated := old.authenticated; new.shop_id := old.shop_id;
  end if;
  return new;
end; $$;
create or replace trigger guard_item_cols before insert or update on public.lili_items
  for each row execute function lili.guard_item_columns();
