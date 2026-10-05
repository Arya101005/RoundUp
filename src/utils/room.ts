import type { GameMeta } from '@shared/games/types';
import { themeSupportsGame } from '@/config/themes';
import type { Room, RoomPlayer } from '@/types/domain';

/* ---- Avatar ---- */

const PALETTE = [
  '#5B8CFF',
  '#3ECF8E',
  '#F5B544',
  '#F4675F',
  '#B48CFF',
  '#4DD0E1',
  '#FF8A65',
  '#9CCC65',
] as const;

/** Deterministic avatar color derived from a name. No randomness, no emoji. */
export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % PALETTE.length;
  return PALETTE[idx] ?? PALETTE[0];
}

/** Initials from a display name: up to 2 letters, uppercased. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + second).toUpperCase();
}

/* ---- Stored display name ---- */

const NAME_KEY = 'roundup.displayName';

export function getStoredName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function storeName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // storage unavailable; name still used for this request
  }
}

/* ---- Stored room code ---- */

const ROOM_KEY = 'roundup.roomCode';

/**
 * The last room this browser entered. The game and results routes only carry a
 * `sessionId`, but the snapshot API is keyed by room code, and the shared room
 * store is cleared when leaving the lobby — so the code is persisted here to
 * survive that transition (and a page refresh / deep link).
 */
export function getStoredRoomCode(): string | null {
  try {
    return localStorage.getItem(ROOM_KEY);
  } catch {
    return null;
  }
}

export function storeRoomCode(code: string): void {
  try {
    localStorage.setItem(ROOM_KEY, code.toUpperCase());
  } catch {
    // storage unavailable; in-session navigation still works via router state
  }
}

export function clearStoredRoomCode(): void {
  try {
    localStorage.removeItem(ROOM_KEY);
  } catch {
    // nothing to clear
  }
}

/* ---- Ranking ---- */

export interface RankableEntry {
  id: string;
  name: string;
  score: number;
}

/** Standard competition ranking: ties share a rank, next rank is skipped. */
export function rankEntries<T extends RankableEntry>(entries: T[]): (T & { rank: number })[] {
  const sorted = [...entries].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  let lastScore: number | null = null;
  let lastRank = 0;
  return sorted.map((entry, i) => {
    const rank = entry.score === lastScore ? lastRank : i + 1;
    lastScore = entry.score;
    lastRank = rank;
    return { ...entry, rank };
  });
}

/* ---- Lobby rules ---- */

export function activePlayers(players: RoomPlayer[]): RoomPlayer[] {
  return players.filter((p) => p.leftAt === null);
}

/** Returns a human-readable reason the host cannot start, or null when ready. */
export function startBlockReason(args: {
  room: Room;
  players: RoomPlayer[];
  meta: GameMeta;
  hostId: string;
}): string | null {
  const { room, players, meta, hostId } = args;
  const active = activePlayers(players);

  if (room.gameId && !themeSupportsGame(room.theme, room.gameId)) {
    return 'This theme does not support the selected game. Pick another theme.';
  }
  if (active.length < meta.minPlayers) {
    return `Needs at least ${meta.minPlayers} players (currently ${active.length}).`;
  }
  if (active.length > meta.maxPlayers) {
    return `Supports at most ${meta.maxPlayers} players.`;
  }
  if (meta.evenPlayersOnly && (active.length < 4 || active.length % 2 !== 0)) {
    return 'Needs an even number of players, at least 4.';
  }
  if (meta.mode === 'teams') {
    const teamA = active.filter((p) => p.teamId === 'a').length;
    const teamB = active.filter((p) => p.teamId === 'b').length;
    const perTeam = active.length / 2;
    if (teamA !== perTeam || teamB !== perTeam) {
      return 'Teams must be balanced with equal players on both sides.';
    }
  }
  const notReady = active.filter((p) => p.userId !== hostId && !p.ready);
  if (notReady.length > 0) {
    return `Waiting for ${notReady.map((p) => p.displayName).join(', ')} to get ready.`;
  }
  return null;
}
