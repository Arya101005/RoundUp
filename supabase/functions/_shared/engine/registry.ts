/**
 * Engine registry (Section 7): the only map from game id to its engine. Edge
 * Functions and tests resolve engines through here, never by importing a
 * specific game directly.
 */
import type { GameId } from '../games/types.ts';
import type { GameEngine } from './types.ts';
import { imposterEngine } from '../games/imposter/engine.ts';
import { headsUpEngine } from '../games/heads_up/engine.ts';
import { passwordEngine } from '../games/password/engine.ts';
import { charadesEngine } from '../games/charades/engine.ts';
import { blindRankingEngine } from '../games/blind_ranking/engine.ts';
import { auctionEngine } from '../games/auction/engine.ts';

export const gameEngines: Record<GameId, GameEngine> = {
  imposter: imposterEngine,
  heads_up: headsUpEngine,
  password: passwordEngine,
  charades: charadesEngine,
  blind_ranking: blindRankingEngine,
  auction: auctionEngine,
};

export function getEngine(id: string): GameEngine {
  const engine = gameEngines[id as GameId];
  if (!engine) throw new Error(`no engine registered for game ${id}`);
  return engine;
}
