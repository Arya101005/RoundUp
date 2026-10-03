import { describe, expect, it } from 'vitest';
import { CODE_ALPHABET, generateCode, isValidCode } from '@shared/rooms/codes';
import { checkDisplayName, suggestName, validateRoomSettings } from '@shared/rooms/validation';
import { defaultGameConfig } from '@shared/games/configs';

describe('room codes', () => {
  it('excludes ambiguous characters', () => {
    expect(CODE_ALPHABET).not.toMatch(/[0O1IL]/);
  });

  it('generates valid five-character codes', () => {
    const code = generateCode();
    expect(code).toHaveLength(5);
    expect(isValidCode(code)).toBe(true);
  });

  it('rejects malformed codes', () => {
    expect(isValidCode('ABC')).toBe(false);
    expect(isValidCode('ABCD0')).toBe(false); // 0 not allowed
    expect(isValidCode('ABCIO')).toBe(false); // I and O not allowed
  });
});

describe('validateRoomSettings', () => {
  it('accepts a valid configuration', () => {
    const result = validateRoomSettings({
      gameId: 'imposter',
      theme: 'movies',
      difficulty: 'medium',
      rounds: 3,
      config: defaultGameConfig('imposter'),
    });
    expect(result.ok).toBe(true);
    expect(result.gameId).toBe('imposter');
  });

  it('rejects unknown games, themes, and out-of-range rounds', () => {
    expect(
      validateRoomSettings({ gameId: 'chess', theme: 'movies', difficulty: 'medium', rounds: 3 }).ok,
    ).toBe(false);
    expect(
      validateRoomSettings({ gameId: 'imposter', theme: 'underwater', difficulty: 'medium', rounds: 3 })
        .ok,
    ).toBe(false);
    expect(
      validateRoomSettings({ gameId: 'auction', theme: 'cars', difficulty: 'medium', rounds: 9 }).ok,
    ).toBe(false);
  });

  it('rejects out-of-range game config values with a friendly message', () => {
    const result = validateRoomSettings({
      gameId: 'imposter',
      theme: 'movies',
      difficulty: 'medium',
      rounds: 3,
      config: { votingSeconds: 5 },
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('votingSeconds');
  });
});

describe('name checks', () => {
  it('flags invalid names', () => {
    expect(checkDisplayName('A').ok).toBe(false);
    expect(checkDisplayName('<b>').ok).toBe(false);
    expect(checkDisplayName('Priya').ok).toBe(true);
  });

  it('suggests an available alternative for taken names', () => {
    expect(suggestName('Rahul', ['rahul'])).toBe('Rahul2');
    expect(suggestName('Rahul', ['rahul', 'rahul2'])).toBe('Rahul3');
  });
});
