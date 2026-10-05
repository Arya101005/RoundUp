import { z } from 'zod';
import type { GameId } from './types.ts';

/** Room-level settings shared by every game. */
export const commonSettingsSchema = z.object({
  theme: z.string().min(1).max(40),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  rounds: z.number().int().min(1).max(10),
});

/** Turn duration in seconds. The platform chose a default fast mode: 5 s for a
 * quick pass-and-play, 15 s for standard talk, 30 s for the slower deep-dive;
 * games that must not time out (the secret-match round, the auction bid window)
 * use this for clock *presentation only* and always drive the actual phase end
 * from the server (`phase_ends_at`), so no client can fast-forward a turn.
 *
 * Default: true. Games that need a hard wall-clock in *every* turn set this
 * true and reference the value below; games with no per-turn clock leave it
 * false (or set it explicitly, e.g. auction bids always get a visible 30 s). */
export const GAME_TIMERS: Record<GameId, boolean> = {
  imposter: true,
  heads_up: true,
  password: false,
  charades: true,
  blind_ranking: true,
  auction: false,
};

/** Per-game default turn durations (5 / 15 / 30 s) — the platform selects the
 * close-to-play default, the host can still override each in lobby settings.
 * Games with no turn clock get `undefined` so the phase clock just isn't shown. */
export const defaultTurnSeconds: Record<GameId, number | undefined> = {
  imposter: 15,
  heads_up: 15,
  password: undefined,
  charades: 15,
  blind_ranking: 20,
  auction: undefined,
};

export type CommonSettings = z.infer<typeof commonSettingsSchema>;

export const imposterConfigSchema = z.object({
  discussionMode: z.enum(['free_chat', 'turn_based']).default('turn_based'),
  discussionSeconds: z.number().int().min(60).max(600).default(180),
  turnSeconds: z.number().int().min(5).max(30).default(15),
  // One clue per player per round (the room flow's CLUE ROUND). Hosts who want
  // a second lap can raise it in lobby settings.
  laps: z.number().int().min(1).max(3).default(1),
  votingSeconds: z.number().int().min(20).max(120).default(45),
  imposterSeesTheme: z.boolean().default(true),
  imposterGuessEnabled: z.boolean().default(true),
  guessSeconds: z.number().int().min(15).max(60).default(30),
  // Every discussion turn gets a visible 5 / 15 / 30 s countdown. The actual
  // turn end is enforced server-side via `phase_ends_at`, so the clock is
  // presentation only — never fast-forwarded by a client refresh.
  showTurnTimer: z.boolean().default(true),
});

export const headsUpConfigSchema = z.object({
  // Head Up turns get a visible 5 / 15 / 30 s countdown; turn end is enforced
  // server-side by `phase_ends_at`, so the clock is presentation only.
  showTurnTimer: z.boolean().default(true),
  turnSeconds: z.number().int().min(5).max(30).default(15),
  turnsPerPlayer: z.number().int().min(1).max(3).default(2),
  guessesPerTurn: z.number().int().min(1).max(5).default(3),
});

export const passwordConfigSchema = z.object({
  // Each word turn gets a visible 5 / 15 / 30 s countdown; the phase end is
  // enforced server-side, clock is presentation only.
  showTurnTimer: z.boolean().default(true),
  clueSeconds: z.number().int().min(15).max(60).default(30),
  guessSeconds: z.number().int().min(10).max(45).default(20),
  maxClues: z.number().int().min(3).max(5).default(5),
});

export const charadesConfigSchema = z.object({
  // Each performance gets a visible 5 / 15 / 30 s countdown; phase end enforced
  // server-side, clock is presentation only.
  showTurnTimer: z.boolean().default(true),
  performanceSeconds: z.number().int().min(45).max(180).default(90),
  skips: z.number().int().min(0).max(3).default(1),
});

export const blindRankingConfigSchema = z.object({
  // Each item gets a visible 5 / 15 / 30 s countdown; the placement is atomic
  // (replace-at-current-position), never a reorder. Phase end enforced
  // server-side, clock is presentation only.
  showTurnTimer: z.boolean().default(true),
  rankingSize: z.number().int().min(4).max(10).default(5),
  perItemSeconds: z.number().int().min(10).max(45).default(20),
});

export const auctionConfigSchema = z.object({
  // Bids use a HARD wall-clock window (default 30 s), not a 5 / 15 / 30 s
  // per-bid dial: the server enforces the timeout (`phase_ends_at`), the
  // client shows the countdown and disables bidding when time is up � once
  // time is up no bid can be entered even if the user acts fast.
  // Bids get a hard 30 s wall-clock (shown as a 30 s countdown). `bidSeconds`
  // is the actual timeout the server enforces via `phase_ends_at`; once it
  // runs out no bid can be entered even if the player acts fast. The client
  // shows the same countdown so the player sees the window closing in real
  // time. `showTurnTimer` stays false here because this is a real clock, not a
  // 5/15/30 s per-bid dial.
  showTurnTimer: z.boolean().default(false),
  bidSeconds: z.number().int().min(15).max(60).default(30),
  startingBudget: z.number().int().min(500).max(5000).default(1000),
  itemCount: z.number().int().min(4).max(15).default(8),
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
