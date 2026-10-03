-- Realtime: add watched tables to the publication (idempotent).
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'rooms', 'room_players', 'game_sessions', 'player_views',
    'chat_messages', 'scores', 'rounds', 'game_events', 'ai_evaluations'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    exception
      when duplicate_object or undefined_object then
        null;
    end;
  end loop;
end $$;

-- Full row images where updates must carry the whole row to subscribers.
alter table public.rooms replica identity full;
alter table public.room_players replica identity full;
alter table public.game_sessions replica identity full;
alter table public.player_views replica identity full;
alter table public.chat_messages replica identity full;
alter table public.scores replica identity full;

-- Shared URL secret for cron -> Edge Function calls. Setup writes it once:
--   select vault.create_secret('https://PROJECT.supabase.co', 'app_url', 'Base URL for cron HTTP calls');
-- The sweeper validates its bearer token against the cron_secret vault entry,
-- which this migration generates (nobody needs to know its value).

do $$
begin
  if exists (select 1 from pg_extension where extname = 'vault') then
    if not exists (select 1 from vault.decrypted_secrets where name = 'cron_secret') then
      perform vault.create_secret(gen_random_uuid()::text, 'cron_secret', 'Bearer token for pg_cron -> Edge Functions');
    end if;
  end if;
exception
  when others then
    raise notice 'vault setup skipped: %', sqlerrm;
end $$;

-- Sweeper round: POST to the sweeper function every 5 seconds for one minute.
-- The sweeper itself is idempotent, so overlapping or missed calls are safe.
create or replace function public.sweeper_round()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
  i int;
begin
  if not pg_try_advisory_lock(727271) then
    return; -- previous round still running; skip this minute
  end if;

  begin
    select decrypted_secrets into v_url from vault.decrypted_secrets where name = 'app_url' limit 1;
    select decrypted_secrets into v_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1;
  exception when others then
    raise notice 'vault read skipped: %', sqlerrm;
    perform pg_advisory_unlock(727271);
    return;
  end;

  if v_url is null or v_secret is null then
    raise notice 'sweeper skipped: app_url or cron_secret not set';
    perform pg_advisory_unlock(727271);
    return;
  end if;

  for i in 1..12 loop
    perform net.http_post(
      url := v_url || '/functions/v1/sweeper',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_secret
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 4000
    );
    perform pg_sleep(5);
  end loop;

  perform pg_advisory_unlock(727271);
end;
$$;

revoke all on function public.sweeper_round() from public, anon, authenticated;
grant execute on function public.sweeper_round() to service_role;

-- Retention: close rooms idle over 6 hours, purge expired content and old limits.
create or replace function public.retention_sweep()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.rooms
  set status = 'closed'
  where status <> 'closed'
    and last_activity_at < now() - interval '6 hours';

  update public.game_sessions
  set status = 'aborted',
      ended_at = now()
  where status in ('preparing', 'active')
    and room_id in (
      select id from public.rooms
      where status = 'closed'
    );

  delete from public.generated_content where expires_at < now();
  delete from public.rate_limits where window_start < now() - interval '1 day';
end;
$$;

revoke all on function public.retention_sweep() from public, anon, authenticated;
grant execute on function public.retention_sweep() to service_role;

-- Schedule cron jobs (idempotent; requires pg_cron).
do $$
begin
  perform cron.schedule('roundup-sweeper', '* * * * *', 'select public.sweeper_round()');
  perform cron.schedule('roundup-retention', '17 * * * *', 'select public.retention_sweep()');
exception
  when others then
    raise notice 'cron scheduling skipped: %', sqlerrm;
end $$;
