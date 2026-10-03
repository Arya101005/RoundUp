import { z } from 'zod';
import { gameRegistry } from '../games/registry.ts';
import { roundsBounds, validateGameConfig } from '../games/configs.ts';
import type { GameId } from '../games/types.ts';
import { isThemeId, themeSupportsGame } from '../config/themes.ts';
import { sanitizeDisplayName } from '../validation/sanitize.ts';

export const createRoomSchema = z.object({
  displayName: z.string().min(1).max(60),
  gameId: z.string(),
  theme: z.string().min(1).max(40),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  rounds: z.number().int(),
  config: z.unknown().optional(),
  maxPlayers: z.number().int().min(2).max(12).optional(),
});

export const joinRoomSchema = z.object({
  code: z.string().min(1).max(10),
  displayName: z.string().min(1).max(60),
});

export interface RoomSettingsCheck {
  ok: boolean;
  message?: string;
  gameId?: GameId;
  rounds?: number;
  config?: Record<string, unknown>;
}

/** Validates game, theme, difficulty, rounds, and per-game config together. */
export function validateRoomSettings(input: {
  gameId: string;
  theme: string;
  difficulty: string;
  rounds: number;
  config?: unknown;
}): RoomSettingsCheck {
  const { gameId, theme, difficulty, rounds, config } = input;

  if (!Object.prototype.hasOwnProperty.call(gameRegistry, gameId)) {
    return { ok: false, message: 'Unknown game selected.' };
  }
  const id = gameId as GameId;
  if (!isThemeId(theme)) {
    return { ok: false, message: 'Unknown theme selected.' };
  }
  if (!themeSupportsGame(theme, id)) {
    return { ok: false, message: 'This theme does not support the selected game.' };
  }
  if (!['easy', 'medium', 'hard'].includes(difficulty)) {
    return { ok: false, message: 'Unknown difficulty selected.' };
  }
  const bounds = roundsBounds(id);
  if (rounds < bounds.min || rounds > bounds.max) {
    return {
      ok: false,
      message: `Rounds must be between ${bounds.min} and ${bounds.max} for this game.`,
    };
  }
  const configResult = validateGameConfig(id, config ?? {});
  if (!configResult.ok) {
    return { ok: false, message: configResult.message };
  }
  return { ok: true, gameId: id, rounds, config: configResult.config };
}

export function checkDisplayName(raw: string): { ok: true; name: string } | { ok: false; message: string } {
  const check = sanitizeDisplayName(raw);
  if (!check.ok) {
    if (check.reason === 'length') {
      return { ok: false, message: 'Name must be 2 to 20 characters.' };
    }
    return { ok: false, message: 'That name contains characters that are not allowed.' };
  }
  return { ok: true, name: check.value };
}

/** Suggests an available variant when a name is taken (e.g. "Rahul2"). */
export function suggestName(base: string, takenNames: string[]): string {
  const taken = new Set(takenNames.map((n) => n.toLowerCase()));
  for (let i = 2; i <= 99; i++) {
    const suffix = String(i);
    const trimmed = base.slice(0, 20 - suffix.length);
    const candidate = `${trimmed}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base.slice(0, 16)}${Math.floor(Math.random() * 9000 + 1000)}`;
}
