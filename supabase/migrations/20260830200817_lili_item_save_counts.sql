-- "Most Saved" was an option in the filter sheet that nothing could implement.
--
-- lili_saves is row-level-secured to the person who saved the piece, which is
-- right: who wants what is nobody else's business, and a client that could read
-- the table could read every shopper's wishlist. So the client cannot count.
--
-- A total is different from a list. How many people saved a piece discloses
-- nothing about any one of them, and it is the only engagement signal this
-- catalogue has. Maintained here by trigger so no client can write it, and so
-- it cannot drift from the rows it counts.

alter table public.lili_items
  add column if not exists saves integer not null default 0;

create or replace function public.lili_bump_item_saves()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (tg_op = 'INSERT') then
    update public.lili_items set saves = saves + 1 where id = new.item_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.lili_items set saves = greatest(0, saves - 1) where id = old.item_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists lili_saves_count on public.lili_saves;
create trigger lili_saves_count
  after insert or delete on public.lili_saves
  for each row execute function public.lili_bump_item_saves();

-- Backfill so the column is true the moment it exists, not eventually.
update public.lili_items i
   set saves = coalesce(c.n, 0)
  from (select item_id, count(*)::int as n from public.lili_saves group by item_id) c
 where c.item_id = i.id
   and i.saves is distinct from c.n;
