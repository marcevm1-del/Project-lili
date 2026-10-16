-- Reverting the previous migration. `lili_shops_owner_uniq` already enforced
-- one shop per owner and has done all along; my survey queried pg_constraint,
-- which does not show a unique INDEX created without a constraint, so I read an
-- absence of rows as an absence of the rule and added a second, weaker index
-- saying the same thing.
--
-- Two indexes expressing one rule is worse than one: a later reader cannot tell
-- which is authoritative, and the partial one implies closed shops are exempt
-- when the full index means they are not.
drop index if exists public.lili_shops_one_active_per_owner;
