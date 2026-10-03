import { z } from 'zod';
import type { GameId } from './types.ts';

/** Room-level settings shared by every game. */
export const commonSettingsSchema = z.object({
  theme: z.string().min(1).max(40),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  rounds: z.number().int().min(1).max(10),
});

export type CommonSettings = z.infer<typeof commonSettingsSchema>;

export const imposterConfigSchema = z.object({
  discussionMode: z.enum(['free_chat', 'turn_based']).default('free_chat'),
  discussionSeconds: z.number().int().min(60).max(600).default(180),
  turnSeconds: z.number().int().min(10).max(60).default(25),
  laps: z.number().int().min(1).max(3).default(2),
  votingSeconds: z.number().int().min(20).max(120).default(45),
  imposterSeesTheme: z.boolean().default(true),
  imposterGuessEnabled: z.boolean().default(true),
  guessSeconds: z.number().int().min(15).max(60).default(30),
});

export const headsUpConfigSchema = z.object({
  turnSeconds: z.number().int().min(30).max(120).default(60),
  turnsPerPlayer: z.number().int().min(1).max(3).default(2),
  guessesPerTurn: z.number().int().min(1).max(5).default(3),
});

export const passwordConfigSchema = z.object({
  clueSeconds: z.number().int().min(15).max(60).default(30),
  guessSeconds: z.number().int().min(10).max(45).default(20),
  maxClues: z.number().int().min(3).max(5).default(5),
});

export const charadesConfigSchema = z.object({
  performanceSeconds: z.number().int().min(45).max(180).default(90),
  skips: z.number().int().min(0).max(3).default(1),
});

export const blindRankingConfigSchema = z.object({
  rankingSize: z.number().int().min(4).max(10).default(5),
  perItemSeconds: z.number().int().min(10).max(45).default(20),
});

export const auctionConfigSchema = z.object({
  startingBudget: z.number().int().min(500).max(5000).default(1000),
  itemCount: z.number().int().min(4).max(15).default(8),
  auctionSeconds: z.number().int().min(10).max(45).default(20),
  minIncrement: z.number().int().min(1).max(100).default(10),
});

export type ImposterConfig = z.infer<typeof imposterConfigSchema>;
export type HeadsUpConfig = z.infer<typeof headsUpConfigSchema>;
export type PasswordConfig = z.infer<typeof passwordConfigSchema>;
export type CharadesConfig = z.infer<typeof charadesConfigSchema>;
export type BlindRankingConfig = z.infer<typeof blindRankingConfigSchema>;
export type AuctionConfig = z.infer<typeof auctionConfigSchema>;

export type GameConfig = {
  imposter: ImposterConfig;
  heads_up: HeadsUpConfig;
  password: PasswordConfig;
  charades: CharadesConfig;
  blind_ranking: BlindRankingConfig;
  auction: AuctionConfig;
};

interface GameConfigEntry {
  schema: z.ZodType<unknown>;
  defaults: Record<string, unknown>;
  rounds: { min: number; max: number; default: number };
}

function entry<T extends z.ZodTypeAny>(schema: T, rounds: GameConfigEntry['rounds']): GameConfigEntry {
  const parsed = schema.parse({});
  return { schema, defaults: parsed as Record<string, unknown>, rounds };
}

/** The only map from game id to its settings schema. */
export const gameConfigSchemas = {
  imposter: entry(imposterConfigSchema, { min: 1, max: 10, default: 3 }),
  heads_up: entry(headsUpConfigSchema, { min: 1, max: 10, default: 3 }),
  password: entry(passwordConfigSchema, { min: 1, max: 10, default: 3 }),
  charades: entry(charadesConfigSchema, { min: 1, max: 10, default: 3 }),
  blind_ranking: entry(blindRankingConfigSchema, { min: 1, max: 5, default: 1 }),
  auction: entry(auctionConfigSchema, { min: 1, max: 5, default: 1 }),
} as const satisfies Record<GameId, GameConfigEntry>;

export function validateGameConfig(gameId: GameId, config: unknown): 
  | { ok: true; config: Record<string, unknown> }
  | { ok: false; message: string } {
  const entryForGame = gameConfigSchemas[gameId];
  const result = entryForGame.schema.safeParse(config ?? {});
  if (!result.success) {
    const first = result.error.issues[0];
    const field = first?.path.join('.') || 'settings';
    return { ok: false, message: `Invalid setting "${field}": ${first?.message ?? 'out of range'}.` };
  }
  return { ok: true, config: result.data as Record<string, unknown> };
}

export function defaultGameConfig(gameId: GameId): Record<string, unknown> {
  return { ...gameConfigSchemas[gameId].defaults };
}

export function roundsBounds(gameId: GameId): { min: number; max: number; default: number } {
  return gameConfigSchemas[gameId].rounds;
}
