-- Authoritative game session row (public projection lives in public_state).
create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  game_id text not null check (game_id in ('imposter', 'heads_up', 'password', 'charades', 'blind_ranking', 'auction')),
  phase text not null,
  phase_id uuid not null default gen_random_uuid(),
  phase_started_at timestamptz not null default now(),
  phase_ends_at timestamptz,
  round_index int not null default 0,
  total_rounds int not null default 1,
  config jsonb not null default '{}'::jsonb,
  public_state jsonb not null default '{}'::jsonb,
  version int not null default 1,
  status text not null default 'preparing'
    check (status in ('preparing', 'active', 'finished', 'aborted')),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists game_sessions_room_idx on public.game_sessions (room_id, status);
create index if not exists game_sessions_expiry_idx
  on public.game_sessions (phase_ends_at)
  where status = 'active';

-- Full engine state including every secret. No RLS policies: service role only.
create table if not exists public.game_state_secure (
  session_id uuid primary key references public.game_sessions (id) on delete cascade,
  state jsonb not null,
  version int not null default 1,
  updated_at timestamptz not null default now()
);

create or replace trigger game_state_secure_updated_at
  before update on public.game_state_secure
  for each row execute function public.set_updated_at();

-- Per-player private projection; readable only by its owner.
create table if not exists public.player_views (
  session_id uuid not null references public.game_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  view jsonb not null default '{}'::jsonb,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create index if not exists player_views_user_idx on public.player_views (user_id);

create or replace trigger player_views_updated_at
  before update on public.player_views
  for each row execute function public.set_updated_at();

-- Round ledger.
create table if not exists public.rounds (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions (id) on delete cascade,
  index int not null,
  started_at timestamptz,
  ended_at timestamptz,
  summary jsonb not null default '{}'::jsonb,
  unique (session_id, index)
);

-- Teams are created when a session starts; lobby team choice lives in room_players.team_id.
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions (id) on delete cascade,
  key text not null check (key in ('a', 'b')),
  name text not null,
  color_token text not null,
  unique (session_id, key)
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  order_index int not null default 0,
  primary key (team_id, user_id)
);

-- Scores: one row per user or team per round, plus cumulative rows with round_index null.
create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions (id) on delete cascade,
  round_index int,
  user_id uuid references auth.users (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade,
  points int not null default 0,
  breakdown jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (user_id is not null or team_id is not null)
);

create index if not exists scores_session_idx on public.scores (session_id);

-- Public-safe event log (never contains secrets).
create table if not exists public.game_events (
  id bigserial primary key,
  session_id uuid references public.game_sessions (id) on delete cascade,
  room_id uuid references public.rooms (id) on delete cascade,
  type text not null,
  actor_id uuid,
  action_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists game_events_action_uniq
  on public.game_events (session_id, action_id)
  where action_id is not null;

create index if not exists game_events_session_idx on public.game_events (session_id, id);
