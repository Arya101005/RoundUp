import { create } from 'zustand';
import type { ChatMessage, Room, RoomPlayer, SessionSummary, Snapshot } from '@/types/domain';

const MAX_CHAT = 200;

interface RoomStore {
  snapshot: Snapshot | null;
  myUserId: string | null;
  loading: boolean;
  error: string | null;
  reconnecting: boolean;

  setSnapshot: (snapshot: Snapshot) => void;
  setMyUserId: (userId: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setReconnecting: (reconnecting: boolean) => void;

  patchRoom: (patch: Partial<Room>) => void;
  upsertPlayer: (player: RoomPlayer) => void;
  removePlayer: (playerId: string) => void;
  addMessage: (message: ChatMessage) => void;
  setSession: (session: SessionSummary) => void;
  setMyView: (view: Record<string, unknown> | null) => void;
  reset: () => void;
}

export const useRoomStore = create<RoomStore>((set) => ({
  snapshot: null,
  myUserId: null,
  loading: false,
  error: null,
  reconnecting: false,

  setSnapshot: (snapshot) => set({ snapshot, error: null }),
  setMyUserId: (myUserId) => set({ myUserId }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setReconnecting: (reconnecting) => set({ reconnecting }),

  patchRoom: (patch) =>
    set((state) =>
      state.snapshot ? { snapshot: { ...state.snapshot, room: { ...state.snapshot.room, ...patch } } } : {},
    ),

  upsertPlayer: (player) =>
    set((state) => {
      if (!state.snapshot || player.roomId !== state.snapshot.room.id) return {};
      const players = state.snapshot.players.some((p) => p.id === player.id)
        ? state.snapshot.players.map((p) => (p.id === player.id ? player : p))
        : [...state.snapshot.players, player];
      return { snapshot: { ...state.snapshot, players } };
    }),

  removePlayer: (playerId) =>
    set((state) => {
      if (!state.snapshot) return {};
      const players = state.snapshot.players.map((p) =>
        p.id === playerId ? { ...p, leftAt: new Date().toISOString(), presence: 'offline' as const } : p,
      );
      return { snapshot: { ...state.snapshot, players } };
    }),

  addMessage: (message) =>
    set((state) => {
      if (!state.snapshot) return {};
      if (state.snapshot.chat.some((m) => m.id === message.id)) return {};
      const chat = [...state.snapshot.chat, message].slice(-MAX_CHAT);
      return { snapshot: { ...state.snapshot, chat } };
    }),

  setSession: (session) =>
    set((state) => {
      if (!state.snapshot) return {};
      const current = state.snapshot.session;
      // Version guard: never apply an update older than what we already have.
      if (current && session.id === current.id && session.version <= current.version) return {};
      return { snapshot: { ...state.snapshot, session } };
    }),

  setMyView: (view) =>
    set((state) => {
      if (!state.snapshot) return {};
      return { snapshot: { ...state.snapshot, myView: view } };
    }),

  reset: () =>
    set({ snapshot: null, loading: false, error: null, reconnecting: false }),
}));
