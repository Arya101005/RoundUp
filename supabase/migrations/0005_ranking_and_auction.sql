-- Blind Ranking: items and reference values are hidden until reveal,
-- so these tables have no client read policies (service role only).
create table if not exists public.ranking_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions (id) on delete cascade,
  round_index int not null,
  criterion text not null,
  direction text not null check (direction in ('asc', 'desc')),
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ranking_entries (
  id uuid primary key default gen_random_uuid(),
  ranking_session_id uuid not null references public.ranking_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  placements jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  score int not null default 0,
  submitted_at timestamptz not null default now(),
  unique (ranking_session_id, user_id)
);

-- Auction: reference_value stays hidden until the reveal phase.
create table if not exists public.auction_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions (id) on delete cascade,
  round_index int not null,
  starting_budget int not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.auction_items (
  id uuid primary key default gen_random_uuid(),
  auction_session_id uuid not null references public.auction_sessions (id) on delete cascade,
  position int not null,
  content_id uuid references public.generated_content (id) on delete set null,
  name text not null,
  category text,
  description text,
  starting_bid int not null,
  reference_value numeric not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'sold', 'unsold')),
  winner_id uuid references auth.users (id) on delete set null,
  final_price int,
  unique (auction_session_id, position)
);

create table if not exists public.auction_bids (
  id uuid primary key default gen_random_uuid(),
  auction_item_id uuid not null references public.auction_items (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  amount int not null check (amount > 0),
  accepted boolean not null default false,
  reject_reason text,
  action_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists auction_bids_item_idx on public.auction_bids (auction_item_id, created_at);
