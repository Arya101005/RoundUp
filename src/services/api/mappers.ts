import type {
  ChatMessage,
  Room,
  RoomPlayer,
  SessionSummary,
} from '@/types/domain';

/* eslint-disable @typescript-eslint/no-explicit-any */

export function mapRoom(r: any): Room {
  return {
    id: r.id,
    code: r.code,
    hostId: r.host_id,
    status: r.status,
    gameId: r.game_id ?? null,
    theme: r.theme,
    difficulty: r.difficulty,
    rounds: r.rounds,
    config: r.config ?? {},
    maxPlayers: r.max_players,
    createdAt: r.created_at,
    lastActivityAt: r.last_activity_at,
  };
}

export function mapPlayer(p: any): RoomPlayer {
  const lastSeen = new Date(p.last_seen_at).getTime();
  const age = Date.now() - lastSeen;
  const left = Boolean(p.left_at);
  const presence: RoomPlayer['presence'] = left
    ? 'offline'
    : age < 45_000
      ? 'online'
      : age < 180_000
        ? 'away'
        : 'offline';
  return {
    id: p.id,
    roomId: p.room_id,
    userId: p.user_id,
    displayName: p.display_name,
    ready: Boolean(p.ready),
    teamId: p.team_id ?? null,
    joinedAt: p.joined_at,
    leftAt: p.left_at ?? null,
    lastSeenAt: p.last_seen_at,
    presence,
  };
}

export function mapChat(m: any): ChatMessage {
  return {
    id: m.id,
    roomId: m.room_id,
    sessionId: m.session_id ?? null,
    channel: m.channel,
    teamId: m.team_id ?? null,
    senderId: m.sender_id ?? null,
    senderName: m.sender_name ?? null,
    kind: m.kind,
    body: m.body,
    createdAt: m.created_at,
  };
}

export function mapSession(s: any | null): SessionSummary | null {
  if (!s) return null;
  return {
    id: s.id,
    roomId: s.room_id,
    gameId: s.game_id,
    phase: s.phase,
    phaseEndsAt: s.phase_ends_at ?? null,
    roundIndex: s.round_index,
    totalRounds: s.total_rounds,
    status: s.status,
    version: s.version,
    publicState: s.public_state ?? null,
  };
}
