import { describe, expect, it } from 'vitest';
import { activePlayers, rankEntries, startBlockReason } from '@/utils/room';
import { gameRegistry } from '@shared/games/registry';
import type { Room, RoomPlayer } from '@/types/domain';

function player(id: string, over: Partial<RoomPlayer> = {}): RoomPlayer {
  return {
    id,
    roomId: 'r1',
    userId: id,
    displayName: id,
    ready: true,
    teamId: null,
    joinedAt: '2026-01-01T00:00:00Z',
    leftAt: null,
    lastSeenAt: '2026-01-01T00:00:00Z',
    presence: 'online',
    ...over,
  };
}

function room(over: Partial<Room> = {}): Room {
  return {
    id: 'r1',
    code: 'AB7KQ',
    hostId: 'h',
    status: 'lobby',
    gameId: 'imposter',
    theme: 'movies',
    difficulty: 'medium',
    rounds: 3,
    config: {},
    maxPlayers: 10,
    createdAt: '2026-01-01T00:00:00Z',
    lastActivityAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

const meta = gameRegistry.imposter;

describe('startBlockReason', () => {
  it('is null when enough ready players exist', () => {
    const players = [player('h'), player('p2'), player('p3')];
    expect(startBlockReason({ room: room(), players, meta, hostId: 'h' })).toBeNull();
  });

  it('requires the minimum player count', () => {
    const players = [player('h')];
    expect(startBlockReason({ room: room(), players, meta, hostId: 'h' })).toContain('at least 3');
  });

  it('waits for non-host players to be ready', () => {
    const players = [player('h'), player('p2'), player('p3', { ready: false })];
    expect(startBlockReason({ room: room(), players, meta, hostId: 'h' })).toContain('p3');
  });

  it('requires even teams for team games', () => {
    const teamMeta = gameRegistry.password;
    const players = [
      player('h', { teamId: 'a' }),
      player('p2', { teamId: 'a' }),
      player('p3', { teamId: 'b' }),
      player('p4', { teamId: 'b' }),
      player('p5', { teamId: 'b' }),
    ];
    expect(
      startBlockReason({ room: room({ gameId: 'password' }), players, meta: teamMeta, hostId: 'h' }),
    ).toContain('even number');
  });

  it('requires balanced teams when counts differ', () => {
    const teamMeta = gameRegistry.password;
    const players = [
      player('h', { teamId: 'a' }),
      player('p2', { teamId: 'a' }),
      player('p3', { teamId: 'a' }),
      player('p4', { teamId: 'b' }),
    ];
    expect(
      startBlockReason({ room: room({ gameId: 'password' }), players, meta: teamMeta, hostId: 'h' }),
    ).toContain('balanced');
  });

  it('blocks a theme that does not support the game', () => {
    const players = [player('h'), player('p2'), player('p3')];
    const reason = startBlockReason({
      room: room({ theme: 'not-a-theme' }),
      players,
      meta,
      hostId: 'h',
    });
    expect(reason).toContain('does not support');
  });

  it('ignores players who already left', () => {
    const players = [player('h'), player('p2', { leftAt: '2026-01-01T00:01:00Z' }), player('p3')];
    expect(activePlayers(players)).toHaveLength(2);
    expect(startBlockReason({ room: room(), players, meta, hostId: 'h' })).toContain('at least 3');
  });
});

describe('rankEntries', () => {
  it('shares ranks on ties and skips the next rank', () => {
    const ranked = rankEntries([
      { id: 'a', name: 'A', score: 10 },
      { id: 'b', name: 'B', score: 10 },
      { id: 'c', name: 'C', score: 5 },
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 3]);
  });

  it('sorts descending by score', () => {
    const ranked = rankEntries([
      { id: 'a', name: 'A', score: 1 },
      { id: 'b', name: 'B', score: 30 },
      { id: 'c', name: 'C', score: 20 },
    ]);
    expect(ranked.map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });
});
