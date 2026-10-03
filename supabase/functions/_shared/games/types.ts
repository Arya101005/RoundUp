/**
 * Shared game types. Pure TypeScript: no Node, no Deno, no DOM.
 * Imported by Edge Functions (Deno), Vitest (Node), and the frontend
 * (types and constants only via the @shared alias).
 */
export const gameIds = [
  'imposter',
  'heads_up',
  'password',
  'charades',
  'blind_ranking',
  'auction',
] as const;

export type GameId = (typeof gameIds)[number];

export type GameMode = 'ffa' | 'teams' | 'individual';

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface GameMeta {
  id: GameId;
  name: string;
  mode: GameMode;
  minPlayers: number;
  maxPlayers: number;
  /** True when the player count must be even (two balanced teams). */
  evenPlayersOnly: boolean;
  description: string;
  rulesSummary: string[];
  rounds: { min: number; max: number; default: number };
}

export function isGameId(value: string): value is GameId {
  return (gameIds as readonly string[]).includes(value);
}
