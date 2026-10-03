import type { Difficulty, GameId } from '@shared/games/types';
import type { ChatMessage, Room, Snapshot } from '@/types/domain';
import { serverClockOffset } from '@/services/clock';
import { invokeFunction } from './client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { mapChat, mapPlayer, mapRoom, mapSession } from './mappers';

export interface CreateRoomInput {
  displayName: string;
  gameId: GameId;
  theme: string;
  difficulty: Difficulty;
  rounds: number;
  config?: Record<string, unknown>;
  maxPlayers?: number;
}

export async function createRoom(
  input: CreateRoomInput,
): Promise<{ room: Room; playerId: string }> {
  const res = await invokeFunction<{ room: any; playerId: string }>('create-room', {
    ...input,
  });
  return { room: mapRoom(res.room), playerId: res.playerId };
}

export async function joinRoom(
  code: string,
  displayName: string,
): Promise<{ room: Room; playerId: string }> {
  const res = await invokeFunction<{ room: any; playerId: string }>('join-room', {
    code,
    displayName,
  });
  return { room: mapRoom(res.room), playerId: res.playerId };
}

export async function leaveRoom(roomId: string): Promise<void> {
  await invokeFunction('leave-room', { roomId });
}

export interface UpdateRoomInput {
  roomId: string;
  gameId?: GameId;
  theme?: string;
  difficulty?: Difficulty;
  rounds?: number;
  config?: Record<string, unknown>;
  ready?: boolean;
  kickUserId?: string;
  transferHostTo?: string;
  assignTeam?: { userId: string; teamId: string | null };
  assignTeams?: { userId: string; teamId: string }[];
}

export async function updateRoom(input: UpdateRoomInput): Promise<{ room: Room | null }> {
  const res = await invokeFunction<{ room: any | null }>('update-room', input as unknown as Record<string, unknown>);
  return { room: res.room ? mapRoom(res.room) : null };
}

export async function getSnapshot(roomCode: string): Promise<Snapshot> {
  const res = await invokeFunction<{
    room: any;
    players: any[];
    session: any | null;
    myView: Record<string, unknown> | null;
    chat: any[];
  }>('get-snapshot', { roomCode });
  return {
    room: mapRoom(res.room),
    players: res.players.map(mapPlayer),
    session: mapSession(res.session),
    myView: res.myView,
    chat: res.chat.map(mapChat),
    serverNow: Date.now() + serverClockOffset(),
  };
}

export async function sendChat(input: {
  roomId: string;
  body: string;
  channel?: 'room' | 'team';
}): Promise<{ message: ChatMessage }> {
  const res = await invokeFunction<{ message: any }>('send-chat', input);
  return { message: mapChat(res.message) };
}

export async function startGame(roomId: string): Promise<{ sessionId: string }> {
  return invokeFunction<{ sessionId: string }>('start-game', { roomId });
}

export async function gameAction<T extends object>(input: {
  sessionId: string;
  actionId: string;
  type: string;
  payload?: Record<string, unknown>;
  expectedPhaseId?: string;
}): Promise<T> {
  return invokeFunction<T>('game-action', input as Record<string, unknown>);
}

export async function gameTick(sessionId: string, phaseId: string): Promise<{ advanced: boolean }> {
  return invokeFunction<{ advanced: boolean }>('game-tick', { sessionId, phaseId });
}
