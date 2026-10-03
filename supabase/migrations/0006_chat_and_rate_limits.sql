-- Chat: read by room members, written only via the send-chat function.
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  session_id uuid references public.game_sessions (id) on delete cascade,
  channel text not null default 'room' check (channel in ('room', 'team', 'system')),
  team_id text check (team_id in ('a', 'b')),
  sender_id uuid references auth.users (id) on delete set null,
  sender_name text,
  kind text not null default 'chat' check (kind in ('chat', 'question', 'answer', 'statement', 'system')),
  body text not null check (char_length(body) between 1 and 280),
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_room_idx on public.chat_messages (room_id, created_at);
create index if not exists chat_messages_session_idx on public.chat_messages (session_id, id)
  where session_id is not null;

alter table public.chat_messages enable row level security;

-- Fixed-window rate limiter used by every Edge Function.
create table if not exists public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

alter table public.rate_limits enable row level security;

create or replace function public.check_rate_limit(
  p_key text,
  p_max int,
  p_window_seconds int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_count int;
begin
  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limits (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start)
  do update set count = public.rate_limits.count + 1
  returning count into v_count;

  return v_count <= p_max;
end;
$$;

grant execute on function public.check_rate_limit(text, int, int) to service_role, authenticated;
