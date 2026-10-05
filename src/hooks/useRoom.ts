import { useCallback, useEffect, useRef } from 'react';
import { gameTick, getSnapshot, sendChat } from '@/services/api/rooms';
import { remainingUntil } from '@/services/clock';
import { currentUserId, getSupabase, supabaseConfigured } from '@/services/supabase/client';
import { mapChat, mapPlayer, mapRoom, mapSession } from '@/services/api/mappers';
import {
  subscribeRoom,
  type RoomSubscription,
} from '@/services/realtime/roomSubscription';
import { useRoomStore } from '@/store/roomStore';

const HEARTBEAT_MS = 20_000;

/**
 * Loads the authoritative snapshot, subscribes to realtime changes, keeps the
 * presence heartbeat, and re-fetches on reconnect or tab visibility (4.3).
 */
export function useRoom(roomCode: string | undefined) {
  const snapshot = useRoomStore((s) => s.snapshot);
  const setSnapshot = useRoomStore((s) => s.setSnapshot);
  const setLoading = useRoomStore((s) => s.setLoading);
  const setError = useRoomStore((s) => s.setError);
  const setReconnecting = useRoomStore((s) => s.setReconnecting);
  const setMyUserId = useRoomStore((s) => s.setMyUserId);
  const setSession = useRoomStore((s) => s.setSession);
  const setMyView = useRoomStore((s) => s.setMyView);
  const patchRoom = useRoomStore((s) => s.patchRoom);
  const upsertPlayer = useRoomStore((s) => s.upsertPlayer);
  const addMessage = useRoomStore((s) => s.addMessage);
  const reset = useRoomStore((s) => s.reset);

  const subRef = useRef<RoomSubscription | null>(null);
  const sessionSubIdRef = useRef<string | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const loadedRef = useRef(false);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const hadErrorRef = useRef(false);

  const attachSubscription = useCallback(
    async (roomId: string, sessionId: string | null, userId: string) => {
      const supabase = getSupabase();
      if (!supabase) return;
      subRef.current?.unsubscribe();
      sessionSubIdRef.current = sessionId;
      roomIdRef.current = roomId;

      subRef.current = subscribeRoom(supabase, {
        roomId,
        sessionId,
        userId,
        handlers: {
          onRoom: (row) => {
            const mapped = mapRoom(row);
            // A room code never changes. Postgres logical decoding also
            // truncates the char(5) code column to a single character in
            // realtime UPDATE payloads (migration 0010 fixes the column), so
            // the code carried by an event must never overwrite the loaded one.
            const existing = useRoomStore.getState().snapshot?.room;
            patchRoom(existing ? { ...mapped, code: existing.code } : mapped);
          },
          onPlayer: (row) => upsertPlayer(mapPlayer(row)),
          onChat: (row) => addMessage(mapChat(row)),
          onSession: (row) => {
            const session = mapSession(row);
            if (!session) return;
            if (session.id !== sessionSubIdRef.current) {
              // A game started (or a new session replaced the old one):
              // refresh the snapshot and resubscribe with the new session.
              void refreshRef.current();
              return;
            }
            setSession(session);
          },
          onMyView: (row) =>
            setMyView((row.view as Record<string, unknown> | null) ?? null),
          onStatus: (status) => {
            if (status === 'SUBSCRIBED') {
              setReconnecting(false);
              if (hadErrorRef.current) {
                hadErrorRef.current = false;
                void refreshRef.current();
              }
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              hadErrorRef.current = true;
              setReconnecting(true);
            }
          },
        },
      });      },
    [addMessage, patchRoom, setMyView, setReconnecting, setSession, upsertPlayer],
  );

  const refreshSnapshot = useCallback(async () => {
    const code = roomCode ?? roomIdRef.current;
    if (!code) return;
    try {
      const snap = await getSnapshot(code);
      setSnapshot(snap);
      loadedRef.current = true;
      const userId = await currentUserId();
      setMyUserId(userId);
      const sessionId = snap.session?.id ?? null;
      if (userId && sessionId !== sessionSubIdRef.current) {
        await attachSubscription(snap.room.id, sessionId, userId);
      }
    } catch {
      setReconnecting(true);
    }
  }, [roomCode, attachSubscription, setMyUserId, setReconnecting, setSnapshot]);

  useEffect(() => {
    refreshRef.current = refreshSnapshot;
  }, [refreshSnapshot]);

  // Initial load + subscription setup.
  useEffect(() => {
    if (!roomCode || !supabaseConfigured) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const snap = await getSnapshot(roomCode);
        if (cancelled) return;
        setSnapshot(snap);
        loadedRef.current = true;
        const userId = await currentUserId();
        if (cancelled) return;
        setMyUserId(userId);
        if (userId) {
          await attachSubscription(snap.room.id, snap.session?.id ?? null, userId);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load the room.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      subRef.current?.unsubscribe();
      subRef.current = null;
      sessionSubIdRef.current = null;
      loadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);

  // Presence heartbeat while the tab is open. Touched immediately on entry (so
  // a freshly opened page is not shown as "offline" until the first interval),
  // then every HEARTBEAT_MS. Keyed on the room id from the snapshot rather than
  // a ref, so it cannot silently no-op before the subscription attaches.
  const presenceRoomId = snapshot?.room.id ?? null;
  useEffect(() => {
    if (!presenceRoomId || !supabaseConfigured) return;
    const supabase = getSupabase();
    if (!supabase) return;
    const touch = () => {
      void supabase
        .rpc('touch_presence', { p_room_id: presenceRoomId })
        .then(({ error }) => {
          if (error) console.error('[roundup:presence] heartbeat failed', error.message);
        });
    };
    touch();
    const interval = window.setInterval(touch, HEARTBEAT_MS);
    return () => window.clearInterval(interval);
  }, [presenceRoomId]);

  // Phase progression: when the current phase deadline passes, ask any member's
  // client to resolve it. The pg_cron sweeper is only a backstop (and is dead
  // whenever the Edge gateway is not deployed), so without this the game would
  // sit on "waiting for the server to advance the phase" forever. Ticks are
  // idempotent and phase/version-guarded server-side, so every client may ask.
  const sessionId = snapshot?.session?.id;
  const sessionPhaseId = snapshot?.session?.phaseId;
  const sessionPhaseEndsAt = snapshot?.session?.phaseEndsAt;
  const sessionStatus = snapshot?.session?.status;

  useEffect(() => {
    if (!sessionId || !sessionPhaseId || sessionStatus !== 'active') return;
    if (!sessionPhaseEndsAt) return;
    let cancelled = false;
    const run = async () => {
      try {
        const { advanced } = await gameTick(sessionId, sessionPhaseId);
        if (advanced && !cancelled) await refreshRef.current();
      } catch {
        // The realtime subscription (or the sweeper) will catch up.
      }
    };
    const dueIn = remainingUntil(sessionPhaseEndsAt);
    if (dueIn <= 0) {
      void run();
      return () => {
        cancelled = true;
      };
    }
    const timer = window.setTimeout(
      () => void run(),
      Math.min(dueIn + 400, 60_000),
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [sessionId, sessionPhaseId, sessionPhaseEndsAt, sessionStatus]);

  // Reconnection entry point: refetch on visibility return.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && loadedRef.current) {
        void refreshSnapshot();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshSnapshot]);

  // Reset store when leaving the room route.
  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset, roomCode]);

  const sendRoomChat = useCallback(
    async (body: string) => {
      const snapshot = useRoomStore.getState().snapshot;
      if (!snapshot) return;
      const { message } = await sendChat({ roomId: snapshot.room.id, body });
      addMessage(message);
    },
    [addMessage],
  );

  const sendTyping = useCallback(() => {
    subRef.current?.sendTyping();
  }, []);

  return { refreshSnapshot, sendRoomChat, sendTyping };
}
