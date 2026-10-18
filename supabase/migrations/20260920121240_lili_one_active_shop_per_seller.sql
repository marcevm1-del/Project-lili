-- ONE ACTIVE SHOP PER SELLER
--
-- `lili_shops` had a primary key on `id` and nothing else: no uniqueness on
-- `owner_uid`, and no rate-limit trigger. The INSERT policy gates on beta
-- membership, so any beta member could create unlimited public storefronts —
-- each one readable by everybody, each one a name she can squat.
--
-- The app has only ever modelled ONE shop per seller: repo.js keeps `myShop`
-- as a single stored object and the tab bar switches on its presence. So the
-- client assumed a rule the database did not hold, which is the same shape as
-- every other defect this project has found — a control that exists in the
-- interface and nowhere that enforces it.
--
-- A partial unique index rather than a trigger, deliberately: an index REFUSES
-- the second insert. A trigger that silently fixed things up would hide the
-- attempt. Partial on status='active' so a closed shop stays in her history and
-- does not block her opening a new one.
create unique index if not exists lili_shops_one_active_per_owner
  on public.lili_shops (owner_uid)
  where status = 'active';
