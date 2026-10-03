-- Membership helpers (SECURITY DEFINER with pinned search_path to avoid RLS recursion).
create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.room_players rp
    where rp.room_id = p_room_id
      and rp.user_id = auth.uid()
      and rp.left_at is null
  );
$$;

create or replace function public.is_session_member(p_session_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.game_sessions gs
    join public.room_players rp on rp.room_id = gs.room_id
    where gs.id = p_session_id
      and rp.user_id = auth.uid()
      and rp.left_at is null
  );
$$;

create or replace function public.is_room_code_member(p_code char(5))
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.rooms r
    join public.room_players rp on rp.room_id = r.id
    where r.code = p_code
      and rp.user_id = auth.uid()
      and rp.left_at is null
  );
$$;

-- My team in a session (teams are created at start; lobby team lives on room_players).
create or replace function public.my_team_id(p_session_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select tm.team_id
  from public.team_members tm
  join public.teams t on t.id = tm.team_id
  where t.session_id = p_session_id
    and tm.user_id = auth.uid()
  limit 1;
$$;

-- Presence heartbeat: rate limited client-side by the caller interval.
create or replace function public.touch_presence(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  update public.room_players
  set last_seen_at = now()
  where room_id = p_room_id
    and user_id = auth.uid()
    and left_at is null;

  update public.rooms
  set last_activity_at = now()
  where id = p_room_id;
end;
$$;

grant execute on function public.touch_presence(uuid) to authenticated;
grant execute on function public.is_room_member(uuid) to anon, authenticated;
grant execute on function public.is_session_member(uuid) to anon, authenticated;
grant execute on function public.is_room_code_member(char) to anon, authenticated;
grant execute on function public.my_team_id(uuid) to anon, authenticated;

-- Atomic, version-checked commit of one game action.
-- Raises -1 (STALE_STATE) when the expected version does not match.
create or replace function public.apply_game_action(
  p_session_id uuid,
  p_expected_version int,
  p_secure_state jsonb,
  p_public_state jsonb,
  p_private_views jsonb,
  p_events jsonb,
  p_scores jsonb,
  p_phase text,
  p_phase_id uuid,
  p_phase_started_at timestamptz,
  p_phase_ends_at timestamptz,
  p_round_index int,
  p_status text
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current int;
  v_view jsonb;
  v_event jsonb;
  v_score jsonb;
  v_new_version int;
begin
  select gs.version into v_current
  from public.game_sessions gs
  where gs.id = p_session_id
  for update;

  if v_current is null then
    raise exception 'SESSION_NOT_FOUND';
  end if;
  if v_current <> p_expected_version then
    raise exception 'STALE_STATE';
  end if;

  v_new_version := p_expected_version + 1;

  insert into public.game_state_secure (session_id, state, version)
  values (p_session_id, p_secure_state, v_new_version)
  on conflict (session_id) do update
    set state = excluded.state,
        version = excluded.version,
        updated_at = now();

  update public.game_sessions
  set public_state = p_public_state,
      version = v_new_version,
      phase = p_phase,
      phase_id = p_phase_id,
      phase_started_at = p_phase_started_at,
      phase_ends_at = p_phase_ends_at,
      round_index = p_round_index,
      status = p_status
  where id = p_session_id;

  if p_private_views is not null then
    for v_view in select * from jsonb_array_elements(p_private_views) loop
      insert into public.player_views (session_id, user_id, view, version)
      values (
        p_session_id,
        (v_view->>'user_id')::uuid,
        coalesce(v_view->'view', '{}'::jsonb),
        v_new_version
      )
      on conflict (session_id, user_id) do update
        set view = excluded.view,
            version = excluded.version,
            updated_at = now();
    end loop;
  end if;

  if p_events is not null then
    for v_event in select * from jsonb_array_elements(p_events) loop
      insert into public.game_events (session_id, room_id, type, actor_id, action_id, payload)
      values (
        p_session_id,
        (select room_id from public.game_sessions where id = p_session_id),
        v_event->>'type',
        nullif(v_event->>'actor_id', '')::uuid,
        nullif(v_event->>'action_id', '')::uuid,
        coalesce(v_event->'payload', '{}'::jsonb)
      )
      on conflict (session_id, action_id) where action_id is not null do nothing;
    end loop;
  end if;

  if p_scores is not null then
    for v_score in select * from jsonb_array_elements(p_scores) loop
      insert into public.scores (session_id, round_index, user_id, team_id, points, breakdown)
      values (
        p_session_id,
        nullif(v_score->>'round_index', '')::int,
        nullif(v_score->>'user_id', '')::uuid,
        nullif(v_score->>'team_id', '')::uuid,
        coalesce((v_score->>'points')::int, 0),
        coalesce(v_score->'breakdown', '{}'::jsonb)
      );
    end loop;
  end if;

  return v_new_version;
end;
$$;

revoke all on function public.apply_game_action(uuid, int, jsonb, jsonb, jsonb, jsonb, jsonb, text, uuid, timestamptz, timestamptz, int, text) from public, anon, authenticated;
grant execute on function public.apply_game_action(uuid, int, jsonb, jsonb, jsonb, jsonb, jsonb, text, uuid, timestamptz, timestamptz, int, text) to service_role;
