-- ═══════════════════════════════════════════════════════════════════════════
--  lili — marketplace schema
--
--  Deliberately in its own schema, NOT public. This project already runs a
--  different app whose public schema owns tables called follows, reports,
--  blocks and notifications — exactly the names lili needs. Writing into
--  public would have collided with a live application.
--
--  Access is decided here, not in the app. Anyone can call PostgREST directly
--  with the publishable key, so every rule the client relies on is enforced
--  again as a row-level policy.
-- ═══════════════════════════════════════════════════════════════════════════

create schema if not exists lili;
grant usage on schema lili to anon, authenticated;

-- ── shops ──────────────────────────────────────────────────────────────────
create table if not exists lili.shops (
  id            uuid primary key default gen_random_uuid(),
  owner_uid     uuid not null references auth.users(id) on delete cascade,
  name          text not null check (length(trim(name)) between 1 and 60),
  name_ar       text check (length(name_ar) <= 60),
  bio           text check (length(bio) <= 300),
  banner        text default '#C4856A',
  seller_type   text not null default 'private'
                check (seller_type in ('private','business')),
  status        text not null default 'active'
                check (status in ('active','suspended','closed')),
  followers     integer not null default 0 check (followers >= 0),
  strikes       integer not null default 0 check (strikes >= 0),
  market_code   text not null default 'AE',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- one shop per seller
create unique index if not exists shops_owner_uniq on lili.shops(owner_uid);

-- ── items ──────────────────────────────────────────────────────────────────
create table if not exists lili.items (
  id            uuid primary key default gen_random_uuid(),
  owner_uid     uuid not null references auth.users(id) on delete cascade,
  shop_id       uuid not null references lili.shops(id) on delete cascade,
  title         text not null check (length(trim(title)) between 1 and 120),
  title_ar      text,
  brand         text,
  price         numeric(12,2) not null check (price > 0 and price <= 10000000),
  currency      text not null default 'AED',
  condition     text,
  size          text,
  era           text,
  color         text default '#E8D5C6',
  icon          text,
  description   text check (length(description) <= 2000),
  photos        text[] not null default '{}',
  authenticated boolean not null default false,
  -- 'pending' is the only status a client may create. A trigger screens the
  -- listing and decides whether it becomes 'live'.
  status        text not null default 'pending'
                check (status in ('pending','live','in_review','removed','sold')),
  screening     jsonb not null default '{}'::jsonb,
  market_code   text not null default 'AE',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists items_live_idx on lili.items(status, created_at desc);
create index if not exists items_shop_idx on lili.items(shop_id);
create index if not exists items_owner_idx on lili.items(owner_uid);

-- ── shopper state ──────────────────────────────────────────────────────────
create table if not exists lili.profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  market      text not null default 'AE',
  consents    jsonb not null default '{}'::jsonb,
  birth_year  integer check (birth_year between 1900 and 2100),
  created_at  timestamptz not null default now()
);

create table if not exists lili.follows (
  user_id   uuid not null references auth.users(id) on delete cascade,
  shop_id   uuid not null references lili.shops(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, shop_id)
);

create table if not exists lili.saves (
  user_id   uuid not null references auth.users(id) on delete cascade,
  item_id   uuid not null references lili.items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table if not exists lili.carts (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  lines      jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists lili.blocks (
  user_id    uuid not null references auth.users(id) on delete cascade,
  shop_id    uuid not null references lili.shops(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, shop_id)
);

-- ── moderation ─────────────────────────────────────────────────────────────
create table if not exists lili.moderation_cases (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null,
  source         text not null default 'user_report',
  target_item_id uuid references lili.items(id) on delete set null,
  shop_id        uuid references lili.shops(id) on delete set null,
  reported_by    uuid references auth.users(id) on delete set null,
  reasons        text[] not null default '{}',
  detail         text check (length(detail) <= 2000),
  state          text not null default 'pending'
                 check (state in ('pending','reviewing','upheld','dismissed','appealed','overturned')),
  sla_hours      integer not null default 72,
  decision       jsonb,
  created_at     timestamptz not null default now(),
  decided_at     timestamptz
);
create index if not exists cases_state_idx on lili.moderation_cases(state, created_at);

-- Append-only. Not readable by any client, including a moderator's session.
create table if not exists lili.audit (
  id         bigserial primary key,
  kind       text not null,
  actor_uid  uuid,
  subject    text,
  meta       jsonb not null default '{}'::jsonb,
  at         timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════
alter table lili.shops             enable row level security;
alter table lili.items             enable row level security;
alter table lili.profiles          enable row level security;
alter table lili.follows           enable row level security;
alter table lili.saves             enable row level security;
alter table lili.carts             enable row level security;
alter table lili.blocks            enable row level security;
alter table lili.moderation_cases  enable row level security;
alter table lili.audit             enable row level security;

-- shops: anyone may browse an active shop; only its owner may edit it
create policy shops_read   on lili.shops for select using (status = 'active' or owner_uid = auth.uid());
create policy shops_create on lili.shops for insert with check (
  owner_uid = auth.uid() and status = 'active' and followers = 0 and strikes = 0
);
create policy shops_update on lili.shops for update using (owner_uid = auth.uid())
  with check (owner_uid = auth.uid());

-- items: only live listings are public; a seller sees her own whatever the state
create policy items_read   on lili.items for select using (status = 'live' or owner_uid = auth.uid());
create policy items_create on lili.items for insert with check (
  owner_uid = auth.uid()
  and status = 'pending'                      -- a client cannot publish directly
  and screening = '{}'::jsonb
  and exists (select 1 from lili.shops s where s.id = shop_id and s.owner_uid = auth.uid())
);
create policy items_update on lili.items for update using (owner_uid = auth.uid())
  with check (owner_uid = auth.uid());

-- personal rows: yours and nobody else's
create policy profiles_own on lili.profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy follows_own  on lili.follows  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy saves_own    on lili.saves    for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy carts_own    on lili.carts    for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy blocks_own   on lili.blocks   for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- follower counts are public, individual follows are not
create policy follows_count_read on lili.follows for select using (true);

-- moderation: anyone signed in may report; nobody may read or decide from a client
create policy cases_create on lili.moderation_cases for insert with check (
  reported_by = auth.uid() and state = 'pending' and decision is null
);

-- audit: no policy at all, so RLS denies everything. Only the service role,
-- which bypasses RLS, can write it.

grant select, insert, update on lili.shops, lili.items to authenticated;
grant select on lili.shops, lili.items to anon;
grant select, insert, update, delete on lili.profiles, lili.follows, lili.saves,
  lili.carts, lili.blocks to authenticated;
grant select on lili.follows to anon;
grant insert on lili.moderation_cases to authenticated;
grant usage, select on all sequences in schema lili to authenticated;
