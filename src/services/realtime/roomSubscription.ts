import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

export interface SubscriptionHandlers {
  onRoom: (row: Record<string, unknown>) => void;
  onPlayer: (row: Record<string, unknown>) => void;
  onChat: (row: Record<string, unknown>) => void;
  onSession: (row: Record<string, unknown>) => void;
  onMyView: (row: Record<string, unknown>) => void;
  onScore?: (row: Record<string, unknown>) => void;
  onStatus: (status: string) => void;
  onTyping?: (userId: string) => void;
}

export interface SubscribeOptions {
  roomId: string;
  sessionId: string | null;
  userId: string;
  handlers: SubscriptionHandlers;
}

/**
 * Subscribes to every table a room member may read (Section 4.3).
 * Returns controls the caller must dispose on unmount.
 */
export interface RoomSubscription {
  unsubscribe: () => void;
  sendTyping: () => void;
}

export function subscribeRoom(
  supabase: SupabaseClient,
  { roomId, sessionId, userId, handlers }: SubscribeOptions,
): RoomSubscription {
  const channelName = `room:${roomId}:${userId}`;
  const channel: RealtimeChannel = supabase.channel(channelName);

  channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
    (payload) => {
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        handlers.onRoom(payload.new as Record<string, unknown>);
      }
    },
  );

  channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` },
    (payload) => {
      if (payload.eventType === 'DELETE') return; // soft deletes only; ignore leftovers
      handlers.onPlayer(payload.new as Record<string, unknown>);
    },
  );

  channel.on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` },
    (payload) => {
      handlers.onChat(payload.new as Record<string, unknown>);
    },
  );

  if (sessionId) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'game_sessions', filter: `room_id=eq.${roomId}` },
      (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          handlers.onSession(payload.new as Record<string, unknown>);
        }
      },
    );

    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'player_views', filter: `user_id=eq.${userId}` },
      (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          handlers.onMyView(payload.new as Record<string, unknown>);
        }
      },
    );

    if (handlers.onScore) {
      channel.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'scores', filter: `session_id=eq.${sessionId}` },
        (payload) => handlers.onScore?.(payload.new as Record<string, unknown>),
      );
    }
  }

  // Ephemeral typing signal only; never carries game secrets.
  channel.on('broadcast', { event: 'typing' }, (payload) => {
    const sender = (payload.payload as { userId?: unknown } | null)?.userId;
    if (typeof sender === 'string' && sender !== userId) {
      handlers.onTyping?.(sender);
    }
  });

  void channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      void channel.track({ userId, joinedAt: Date.now() });
    }
    handlers.onStatus(status);
  });

  return {
    unsubscribe: () => {
      void supabase.removeChannel(channel);
    },
    sendTyping: () => {
      void channel.send({ type: 'broadcast', event: 'typing', payload: { userId } });
    },
  };
}
