-- Extensions required by the platform.
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists vector;

-- pg_cron and pg_net are available on Supabase hosted; enable when possible.
-- The dashboard may require these to be enabled manually for self-hosted setups.
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron not enabled: %', sqlerrm;
  end;
  begin
    create extension if not exists pg_net;
  exception when others then
    raise notice 'pg_net not enabled: %', sqlerrm;
  end;
end $$;

-- Shared updated_at trigger.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
