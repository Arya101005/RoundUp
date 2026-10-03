import type { Difficulty, GameId } from '@shared/games/types';

export type RoomStatus = 'lobby' | 'preparing' | 'in_game' | 'closed';
export type PlayerPresence = 'online' | 'away' | 'offline';
export type ChatChannel = 'room' | 'team' | 'system';
export type ChatKind = 'chat' | 'question' | 'answer' | 'statement' | 'system';

export interface Room {
  id: string;
  code: string;
  hostId: string;
  status: RoomStatus;
  gameId: GameId | null;
  theme: string;
  difficulty: Difficulty;
  rounds: number;
  config: Record<string, unknown>;
  maxPlayers: number;
  createdAt: string;
  lastActivityAt: string;
}

export interface RoomPlayer {
  id: string;
  roomId: string;
  userId: string;
  displayName: string;
  ready: boolean;
  teamId: string | null;
  joinedAt: string;
  leftAt: string | null;
  lastSeenAt: string;
  presence: PlayerPresence;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  sessionId: string | null;
  channel: ChatChannel;
  teamId: string | null;
  senderId: string | null;
  senderName: string | null;
  kind: ChatKind;
  body: string;
  createdAt: string;
}

export interface SessionSummary {
  id: string;
  roomId: string;
  gameId: GameId;
  phase: string;
  phaseEndsAt: string | null;
  roundIndex: number;
  totalRounds: number;
  status: 'preparing' | 'active' | 'finished' | 'aborted';
  version: number;
  publicState: Record<string, unknown> | null;
}

export interface Snapshot {
  room: Room;
  players: RoomPlayer[];
  session: SessionSummary | null;
  myView: Record<string, unknown> | null;
  chat: ChatMessage[];
  serverNow: number;
}
