-- RLS: deny by default, then narrow grants (Section 5).

-- profiles: owner read only.
alter table public.profiles enable row level security;
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

-- rooms: members select; all writes go through functions (service role).
alter table public.rooms enable row level security;
drop policy if exists rooms_select_members on public.rooms;
create policy rooms_select_members on public.rooms
  for select to authenticated
  using (public.is_room_member(id));

-- room_players: same-room members read each other; no client writes.
alter table public.room_players enable row level security;
drop policy if exists room_players_select_members on public.room_players;
create policy room_players_select_members on public.room_players
  for select to authenticated
  using (public.is_room_member(room_id));

-- game_sessions: members select.
alter table public.game_sessions enable row level security;
drop policy if exists game_sessions_select_members on public.game_sessions;
create policy game_sessions_select_members on public.game_sessions
  for select to authenticated
  using (public.is_room_member(room_id));

-- game_state_secure: no policies at all (service role only).
alter table public.game_state_secure enable row level security;

-- player_views: owner only.
alter table public.player_views enable row level security;
drop policy if exists player_views_select_own on public.player_views;
create policy player_views_select_own on public.player_views
  for select to authenticated
  using (user_id = auth.uid());

-- chat: members read room/system chat; team chat only for that team.
-- Writes happen exclusively through the send-chat function.
drop policy if exists chat_select on public.chat_messages;
create policy chat_select on public.chat_messages
  for select to authenticated
  using (
    public.is_room_member(room_id)
    and (
      channel in ('room', 'system')
      or (
        channel = 'team'
        and team_id = (
          case
            when session_id is null then (
              select rp.team_id from public.room_players rp
              where rp.room_id = chat_messages.room_id
                and rp.user_id = auth.uid()
                and rp.left_at is null
            )
            else null
          end
        )
      )
      or (
        channel = 'team'
        and session_id is not null
        and exists (
          select 1
          from public.team_members tm
          join public.teams t on t.id = tm.team_id
          where t.session_id = chat_messages.session_id
            and t.key = chat_messages.team_id
            and tm.user_id = auth.uid()
        )
      )
    )
  );

-- scores, rounds, game_events, teams, team_members: members read.
alter table public.scores enable row level security;
drop policy if exists scores_select_members on public.scores;
create policy scores_select_members on public.scores
  for select to authenticated
  using (public.is_session_member(session_id));

alter table public.rounds enable row level security;
drop policy if exists rounds_select_members on public.rounds;
create policy rounds_select_members on public.rounds
  for select to authenticated
  using (public.is_session_member(session_id));

alter table public.game_events enable row level security;
drop policy if exists game_events_select_members on public.game_events;
create policy game_events_select_members on public.game_events
  for select to authenticated
  using (session_id is not null and public.is_session_member(session_id));

alter table public.teams enable row level security;
drop policy if exists teams_select_members on public.teams;
create policy teams_select_members on public.teams
  for select to authenticated
  using (public.is_session_member(session_id));

alter table public.team_members enable row level security;
drop policy if exists team_members_select_members on public.team_members;
create policy team_members_select_members on public.team_members
  for select to authenticated
  using (
    exists (
      select 1 from public.teams t
      where t.id = team_members.team_id
        and public.is_session_member(t.session_id)
    )
  );

-- Service-role-only tables (no policies): game_state_secure, generated_content,
-- session_content_usage, rate_limits, ranking_sessions, ranking_entries,
-- auction_sessions, auction_items, auction_bids.
alter table public.generated_content enable row level security;
alter table public.session_content_usage enable row level security;
alter table public.ranking_sessions enable row level security;
alter table public.ranking_entries enable row level security;
alter table public.auction_sessions enable row level security;
alter table public.auction_items enable row level security;
alter table public.auction_bids enable row level security;

-- ai_evaluations: readable by the owner; by room members after the game ends.
alter table public.ai_evaluations enable row level security;
drop policy if exists ai_evaluations_select on public.ai_evaluations;
create policy ai_evaluations_select on public.ai_evaluations
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.game_sessions gs
      where gs.id = ai_evaluations.session_id
        and gs.status = 'finished'
        and public.is_room_member(gs.room_id)
    )
  );
