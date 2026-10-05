import { describe, expect, it } from 'vitest';
import { gameIds } from '@shared/games/types';
import { gameRegistry } from '@shared/games/registry';
import {
  defaultGameConfig,
  defaultTurnSeconds,
  gameConfigSchemas,
  roundsBounds,
  validateGameConfig,
} from '@shared/games/configs';
import { getTheme, themes, themeSupportsGame } from '@shared/config/themes';

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
    if (result.ok) expect(result.config.turnSeconds).toBe(defaultTurnSeconds.heads_up);
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
  it('gives every theme ranking criteria and an auction metric', () => {
    // Sports and Cricket join the general-purpose bank, so this is a
    // "every theme is complete" check rather than a fixed headcount.
    expect(themes.length).toBeGreaterThanOrEqual(14);
    for (const theme of themes) {
      expect(theme.rankingCriteria.length).toBeGreaterThan(0);
      expect(theme.auctionValueMetric.length).toBeGreaterThan(0);
      expect(theme.supportedGames.length).toBeGreaterThan(0);
    }
  });

  it('prices every theme in USD', () => {
    for (const theme of themes) {
      expect(theme.auctionValueMetric, theme.id).toContain('USD');
      for (const criterion of theme.rankingCriteria) {
        expect(criterion.metricLabel, `${theme.id}.${criterion.id}`).not.toMatch(/EUR|GBP|INR/);
      }
    }
  });

  it('ships both sport themes', () => {
    for (const id of ['sports', 'cricket']) {
      expect(getTheme(id), id).toBeDefined();
    }
  });

  it('answers theme/game support consistently', () => {
    expect(themeSupportsGame('cricket', 'imposter')).toBe(true);
    expect(themeSupportsGame('nope', 'imposter')).toBe(false);
  });
});
