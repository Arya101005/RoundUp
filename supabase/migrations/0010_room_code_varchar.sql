-- Realtime payload fix: rooms.code was char(5).
--
-- Postgres logical decoding (which Supabase Realtime uses for postgres_changes)
-- truncates a `bpchar`/char(n) column to its first character in the replica
-- identity it sends to clients. Every UPDATE of `rooms` (the presence
-- heartbeat alone does one every 20 s) therefore delivered code = 'C', and the
-- client replaced the real 5-character room code with it — which broke both
-- the on-screen code and the /join/<code> share link.
--
-- varchar is decoded in full, so switching the column type fixes the payload.
-- The RPC that takes the code keeps a matching signature.

alter table public.rooms
  alter column code type varchar(5) using btrim(code::varchar);

create or replace function public.is_room_code_member(p_code varchar(5))
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.rooms r
    join public.room_players rp on rp.room_id = r.id
    where r.code = btrim(p_code)
      and rp.user_id = auth.uid()
      and rp.left_at is null
  );
$$;

grant execute on function public.is_room_code_member(varchar) to anon, authenticated;