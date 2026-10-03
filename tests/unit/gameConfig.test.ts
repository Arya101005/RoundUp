import { describe, expect, it } from 'vitest';
import { gameIds } from '@shared/games/types';
import { gameRegistry } from '@shared/games/registry';
import {
  defaultGameConfig,
  gameConfigSchemas,
  roundsBounds,
  validateGameConfig,
} from '@shared/games/configs';
import { themes, themeSupportsGame } from '@shared/config/themes';

describe('game registry', () => {
  it('registers every game id with sane metadata', () => {
    for (const id of gameIds) {
      const meta = gameRegistry[id];
      expect(meta.id).toBe(id);
      expect(meta.minPlayers).toBeGreaterThanOrEqual(2);
      expect(meta.maxPlayers).toBeGreaterThanOrEqual(meta.minPlayers);
      expect(meta.rulesSummary.length).toBeGreaterThan(0);
      expect(meta.rounds.min).toBeLessThanOrEqual(meta.rounds.default);
      expect(meta.rounds.default).toBeLessThanOrEqual(meta.rounds.max);
    }
  });

  it('marks team games as even-player games', () => {
    expect(gameRegistry.password.evenPlayersOnly).toBe(true);
    expect(gameRegistry.charades.evenPlayersOnly).toBe(true);
    expect(gameRegistry.imposter.evenPlayersOnly).toBe(false);
  });
});

describe('game config schemas', () => {
  it('parses defaults for every game', () => {
    for (const id of gameIds) {
      const defaults = defaultGameConfig(id);
      expect(validateGameConfig(id, defaults).ok).toBe(true);
      expect(Object.keys(defaults).length).toBeGreaterThan(0);
    }
  });

  it('fills missing values with defaults', () => {
    const result = validateGameConfig('heads_up', {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.turnSeconds).toBe(60);
  });

  it('rejects out-of-range values', () => {
    expect(validateGameConfig('auction', { itemCount: 99 }).ok).toBe(false);
    expect(validateGameConfig('password', { maxClues: 2 }).ok).toBe(false);
    expect(validateGameConfig('charades', { skips: -1 }).ok).toBe(false);
  });

  it('caps rounds per game (blind ranking and auction are short)', () => {
    expect(roundsBounds('auction').max).toBe(5);
    expect(roundsBounds('imposter').max).toBe(10);
  });

  it('exposes only the implemented settings per game', () => {
    expect(Object.keys(gameConfigSchemas.imposter.defaults)).toContain('votingSeconds');
    expect(Object.keys(gameConfigSchemas.auction.defaults)).toContain('startingBudget');
    expect(Object.keys(gameConfigSchemas.auction.defaults)).not.toContain('discussionSeconds');
  });
});

describe('themes', () => {
  it('covers all twelve themes with ranking criteria and auction metrics', () => {
    expect(themes).toHaveLength(12);
    for (const theme of themes) {
      expect(theme.rankingCriteria.length).toBeGreaterThan(0);
      expect(theme.auctionValueMetric.length).toBeGreaterThan(0);
      expect(theme.supportedGames.length).toBeGreaterThan(0);
    }
  });

  it('answers theme/game support consistently', () => {
    expect(themeSupportsGame('cricket', 'imposter')).toBe(true);
    expect(themeSupportsGame('nope', 'imposter')).toBe(false);
  });
});
