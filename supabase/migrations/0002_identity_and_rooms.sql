-- Guest profiles (anonymous Supabase auth users).
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Profiles are inserted by a trigger on auth.users (see below).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Rooms: the shared lobby container.
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code char(5) not null unique,
  host_id uuid not null references auth.users (id) on delete restrict,
  status text not null default 'lobby'
    check (status in ('lobby', 'preparing', 'in_game', 'closed')),
  game_id text check (game_id in ('imposter', 'heads_up', 'password', 'charades', 'blind_ranking', 'auction')),
  theme text not null default 'movies',
  difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  rounds int not null default 3 check (rounds between 1 and 10),
  config jsonb not null default '{}'::jsonb,
  max_players int not null default 10 check (max_players between 2 and 12),
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rooms_code_idx on public.rooms (code);
create index if not exists rooms_last_activity_idx on public.rooms (last_activity_at);

create or replace trigger rooms_updated_at
  before update on public.rooms
  for each row execute function public.set_updated_at();

-- Room players: one row per membership; leaving is a soft delete.
create table if not exists public.room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null,
  ready boolean not null default false,
  team_id text check (team_id in ('a', 'b')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  last_seen_at timestamptz not null default now(),
  is_host_cached boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (room_id, user_id)
);

create unique index if not exists room_players_unique_name
  on public.room_players (room_id, lower(display_name))
  where left_at is null;

create index if not exists room_players_room_idx
  on public.room_players (room_id)
  where left_at is null;

create index if not exists room_players_user_idx on public.room_players (user_id);

create or replace trigger room_players_updated_at
  before update on public.room_players
  for each row execute function public.set_updated_at();
