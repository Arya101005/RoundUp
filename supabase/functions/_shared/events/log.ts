import type { SupabaseClient } from '@supabase/supabase-js';

/** Public-safe event types (Section 18). */
export const eventTypes = [
  'ROOM_CREATED',
  'PLAYER_JOINED',
  'PLAYER_LEFT',
  'PLAYER_DISCONNECTED',
  'PLAYER_RECONNECTED',
  'PLAYER_READY',
  'HOST_CHANGED',
  'GAME_SELECTED',
  'GAME_STARTED',
  'ROUND_STARTED',
  'TURN_STARTED',
  'TURN_ENDED',
  'MESSAGE_SENT',
  'QUESTION_ASKED',
  'ANSWER_GIVEN',
  'CLUE_SUBMITTED',
  'GUESS_SUBMITTED',
  'GUESS_CORRECT',
  'VOTE_SUBMITTED',
  'VOTING_ENDED',
  'ITEM_PLACED',
  'BID_SUBMITTED',
  'BID_ACCEPTED',
  'BID_REJECTED',
  'ITEM_SOLD',
  'AUCTION_ENDED',
  'RANKING_SUBMITTED',
  'ROUND_ENDED',
  'GAME_ENDED',
] as const;

export type EventType = (typeof eventTypes)[number];

export async function logEvent(
  client: SupabaseClient,
  input: {
    type: EventType;
    roomId?: string | null;
    sessionId?: string | null;
    actorId?: string | null;
    actionId?: string | null;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await client.from('game_events').insert({
    type: input.type,
    room_id: input.roomId ?? null,
    session_id: input.sessionId ?? null,
    actor_id: input.actorId ?? null,
    action_id: input.actionId ?? null,
    payload: input.payload ?? {},
  });
  if (error) {
    console.error('logEvent failed', input.type, error.message);
  }
}

/** Writes a system chat message (rendered centered, muted, no avatar). */
export async function postSystemMessage(
  client: SupabaseClient,
  input: { roomId: string; sessionId?: string | null; body: string },
): Promise<{ id: string } | null> {
  const { data, error } = await client
    .from('chat_messages')
    .insert({
      room_id: input.roomId,
      session_id: input.sessionId ?? null,
      channel: 'system',
      kind: 'system',
      sender_id: null,
      sender_name: null,
      body: input.body.slice(0, 280),
    })
    .select('id')
    .single();

  if (error) {
    console.error('postSystemMessage failed', error.message);
    return null;
  }
  return data as { id: string };
}
