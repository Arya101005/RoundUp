/**
 * Full playthrough harness for every game engine (Section 7 framework).
 *
 * Each engine is driven from `initialize` to a `finished` status using its real
 * public API — `initialize`, `handleAction`, `tick` — with simulated time. This
 * exercises the parts unit tests miss: random generation (roles, words, subsets,
 * lots), the phase machine, scoring/evaluation, and secret-visibility rules.
 *
 * The harness plays "correctly" (guesses the real answer, ranks perfectly, size
 * the top bid) so scoring paths are actually taken, and asserts the resulting
 * numbers. Every game is replayed across several RNG seeds.
 */
import { describe, expect, it } from 'vitest';
import { gameEngines } from '@shared/engine/registry';
import { gameRegistry } from '@shared/games/registry';
import { defaultGameConfig } from '@shared/games/configs';
import { getTheme } from '@shared/config/themes';
import type { GameId } from '@shared/games/types';
import type { GameEventRow, PlayerInfo, ScoreRow, Transition } from '@shared/engine/types';

const THEME = 'movies';
const DIFFICULTY = 'medium';
const TOTAL_ROUNDS = 2;
const MAX_STEPS = 4000;

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Sim {
  gameId: GameId;
  state: any;
  pub: Record<string, unknown>;
  phase: string;
  phaseId: string;
  phaseEndsAt: number | null;
  status: 'active' | 'finished';
  views: Record<string, Record<string, unknown>>;
  scores: ScoreRow[];
  events: GameEventRow[];
  now: number;
  leaks: string[];
}

interface Plan {
  actorId: string;
  type: string;
  payload: Record<string, unknown>;
}

function apply(sim: Sim, t: Transition): void {
  sim.state = t.state;
  sim.pub = t.publicState;
  sim.phase = t.phase;
  sim.phaseId = t.phaseId;
  sim.phaseEndsAt = t.phaseEndsAt;
  sim.status = t.status;
  sim.views = { ...sim.views, ...t.views };
  if (t.scores) sim.scores.push(...t.scores);
  if (t.events) sim.events.push(...t.events);
}

function stepCtx(sim: Sim, players: PlayerInfo[], hostId: string, expired: boolean) {
  return {
    now: sim.now,
    players,
    phaseId: sim.phaseId,
    currentPhase: sim.phase,
    phaseEndsAt: sim.phaseEndsAt,
    expired,
    hostId,
  };
}

function buildSim(
  gameId: GameId,
  players: PlayerInfo[],
  hostId: string,
  teamIds: { a: string; b: string } | null,
  seed: number,
): Sim {
  const engine = gameEngines[gameId];
  const theme = getTheme(THEME);
  const now = 1_000_000;
  const init = engine.initialize({
    players,
    config: { ...defaultGameConfig(gameId) },
    theme: THEME,
    themeLabel: theme?.label ?? THEME,
    difficulty: DIFFICULTY,
    totalRounds: TOTAL_ROUNDS,
    now,
    hostId,
    teamIds,
    rng: mulberry32(seed),
  });
  const sim: Sim = {
    gameId,
    state: init.state,
    pub: init.publicState,
    phase: init.phase,
    phaseId: 'phase-0',
    phaseEndsAt: init.phaseEndsAt,
    status: 'active',
    views: { ...init.views },
    scores: [],
    events: [...(init.events ?? [])],
    now,
    leaks: [],
  };
  return sim;
}

/* ----------------------------- per-game planners ----------------------------- */

function planImposter(sim: Sim, players: PlayerInfo[], hostId: string): Plan | null {
  const st = sim.state;
  const round = st.rounds[st.roundIndex];
  const imposterId: string = round.imposterId;
  if (sim.phase === 'discussion') {
    return { actorId: hostId, type: 'end_discussion', payload: {} };
  }
  if (sim.phase === 'voting') {
    const votes = st.current.votes as Record<string, string>;
    const notVoted = players.filter((p) => votes[p.id] === undefined);
    const voter = notVoted.find((p) => p.id !== imposterId) ?? notVoted[0];
    if (!voter) return null;
    const target =
      voter.id === imposterId
        ? (players.find((p) => p.id !== imposterId) as PlayerInfo).id
        : imposterId;
    return { actorId: voter.id, type: 'vote', payload: { targetId: target } };
  }
  if (sim.phase === 'imposter_guess') {
    return { actorId: imposterId, type: 'guess', payload: { word: round.word } };
  }
  return null;
}

function planHeadsUp(sim: Sim): Plan | null {
  const st = sim.state;
  if (sim.phase !== 'turn') return null;
  const activeId: string | null = st.current.activeId;
  if (!activeId) return null;
  const round = st.rounds[st.roundIndex];
  const word: string | undefined = round.assignments[activeId];
  if (!word) return null;
  return { actorId: activeId, type: 'guess', payload: { word } };
}

// Clues must be a single alphabetic token (see validateClue's CLUE_TOKEN).
const SAFE_CLUES = ['zzq', 'qqz', 'qzz', 'zxz', 'xzz'];

function planPassword(sim: Sim): Plan | null {
  const st = sim.state;
  const turn = st.current.wordTurn;
  if (sim.phase === 'clue') {
    const text = SAFE_CLUES[st.current.clues.length % SAFE_CLUES.length] as string;
    return { actorId: turn.giverId, type: 'clue', payload: { text } };
  }
  if (sim.phase === 'guess') {
    const done: Record<string, boolean> = st.current.guessersDone;
    const guesser = (sim as any).__players.find(
      (p: PlayerInfo) => p.teamId === turn.team && p.id !== turn.giverId && !done[p.id],
    );
    if (!guesser) return null;
    return { actorId: guesser.id, type: 'guess', payload: { word: turn.word } };
  }
  return null;
}

function planCharades(sim: Sim): Plan | null {
  const st = sim.state;
  if (sim.phase !== 'perform') return null;
  const turn = st.current.turn;
  const word: string = turn.pool[st.current.wordIndex];
  const guesser = (sim as any).__players.find(
    (p: PlayerInfo) => p.teamId === turn.team && p.id !== turn.performerId,
  );
  if (!guesser) return null;
  return { actorId: guesser.id, type: 'guess', payload: { word } };
}

function planBlindRanking(sim: Sim): Plan | null {
  const st = sim.state;
  if (sim.phase !== 'placing') return null;
  const round = st.rounds[st.roundIndex];
  const item: string = round.items[st.current.itemIndex];
  const reference: string[] = round.reference;
  const refIdx = reference.indexOf(item);
  for (const p of (sim as any).__players as PlayerInfo[]) {
    const list: string[] = st.current.placed[p.id] ?? [];
    if (list.length > st.current.itemIndex) continue; // already placed this item
    const position = list.filter((x) => reference.indexOf(x) < refIdx).length;
    return { actorId: p.id, type: 'place', payload: { item, position } };
  }
  return null;
}

function planAuction(sim: Sim): Plan | null {
  const st = sim.state;
  if (sim.phase !== 'bidding') return null;
  const bidder = 'p0';
  const high = st.current.high;
  if (high && high.bidderId === bidder) return null;
  const required: number | null = st.pub.minNextBid as number | null;
  const budgets = st.pub.budgets as Record<string, number>;
  if (required === null || (budgets[bidder] ?? 0) < required) return null;
  return { actorId: bidder, type: 'bid', payload: { amount: required } };
}

const PLANNERS: Record<GameId, (sim: Sim, players: PlayerInfo[], hostId: string) => Plan | null> = {
  imposter: planImposter,
  heads_up: planHeadsUp,
  password: planPassword,
  charades: planCharades,
  blind_ranking: planBlindRanking,
  auction: planAuction,
};

function observeLeaks(sim: Sim): void {
  if (sim.gameId === 'imposter' && ['role_reveal', 'discussion', 'voting'].includes(sim.phase)) {
    if (sim.pub.word !== null && sim.pub.word !== undefined) {
      sim.leaks.push(`imposter word leaked during ${sim.phase}`);
    }
  }
  if (sim.gameId === 'blind_ranking' && ['round_intro', 'placing'].includes(sim.phase)) {
    if (sim.pub.reference !== null) sim.leaks.push('blind ranking reference leaked before reveal');
  }
  if (sim.gameId === 'auction' && ['item_intro', 'bidding'].includes(sim.phase)) {
    if (sim.pub.revealed !== null) sim.leaks.push('auction values leaked before reveal');
  }
}

interface PlayResult {
  sim: Sim;
  steps: number;
}

function play(gameId: GameId, players: PlayerInfo[], hostId: string, teamIds: any, seed: number): PlayResult {
  const engine = gameEngines[gameId];
  const sim = buildSim(gameId, players, hostId, teamIds, seed);
  (sim as any).__players = players;
  const planner = PLANNERS[gameId];

  let steps = 0;
  while (sim.status === 'active' && steps < MAX_STEPS) {
    steps += 1;
    observeLeaks(sim);
    const plan = planner(sim, players, hostId);
    if (plan) {
      // Advance the clock a little so per-action cooldowns are satisfied.
      sim.now += 2_100;
      const actor = players.find((p) => p.id === plan.actorId) ?? null;
      const result = engine.handleAction(
        sim.state,
        { type: plan.type, payload: plan.payload, actionId: crypto.randomUUID() },
        actor,
        stepCtx(sim, players, hostId, false),
      );
      if (!result.ok) {
        throw new Error(
          `${gameId}: planned action ${plan.type} was rejected with ${result.code} in phase ${sim.phase}`,
        );
      }
      apply(sim, result.transition);
      continue;
    }
    if (sim.phaseEndsAt === null) break; // nothing left to advance
    sim.now = Math.max(sim.now, sim.phaseEndsAt);
    const ticked = engine.tick(sim.state, stepCtx(sim, players, hostId, true));
    if (ticked) apply(sim, ticked);
    else break;
  }
  return { sim, steps };
}

function playersFor(gameId: GameId): { players: PlayerInfo[]; teamMode: boolean } {
  const meta = gameRegistry[gameId];
  let count = meta.minPlayers;
  if (meta.evenPlayersOnly && count % 2 !== 0) count += 1;
  const teamMode = meta.mode === 'teams';
  const players: PlayerInfo[] = Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player${i}`,
    connected: true,
    teamId: teamMode ? (i % 2 === 0 ? 'a' : 'b') : null,
  }));
  return { players, teamMode };
}

function expectFinished(sim: Sim, players: PlayerInfo[]): void {
  expect(sim.status).toBe('finished');
  expect(sim.leaks).toEqual([]);
  const totals = (sim.pub.totalScores as Record<string, number>) ?? {};
  for (const [id, score] of Object.entries(totals)) {
    expect(Number.isFinite(score), `score for ${id} is finite`).toBe(true);
    expect(score).toBeGreaterThanOrEqual(0);
  }
  // A finished game must contain a GAME_ENDED event.
  expect(sim.events.some((e) => e.type === 'GAME_ENDED')).toBe(true);
  expect(players.length).toBeGreaterThan(0);
}

const ALL_GAMES: GameId[] = ['imposter', 'heads_up', 'password', 'charades', 'blind_ranking', 'auction'];

describe('every game plays to completion', () => {
  for (const gameId of ALL_GAMES) {
    it(`${gameId} finishes across 5 seeds`, () => {
      const { players, teamMode } = playersFor(gameId);
      const teamIds = teamMode ? { a: 'team-a', b: 'team-b' } : null;
      for (let seed = 1; seed <= 5; seed++) {
        const { sim, steps } = play(gameId, players, 'p0', teamIds, seed * 7919);
        expectFinished(sim, players);
        expect(steps).toBeLessThan(MAX_STEPS);
      }
    });
  }
});

describe('scoring and evaluation are applied', () => {
  it('imposter: caught imposter and correct voters score', () => {
    const { players, teamMode } = playersFor('imposter');
    const teamIds = teamMode ? { a: 'team-a', b: 'team-b' } : null;
    const { sim } = play('imposter', players, 'p0', teamIds, 12345);
    const totals = sim.pub.totalScores as Record<string, number>;
    for (const p of players) {
      expect(totals[p.id], `${p.id} scored`).toBeGreaterThan(0);
    }
    // The imposter was caught and guessed correctly -> guessSuccess (150).
    expect(Math.max(...Object.values(totals))).toBeGreaterThanOrEqual(150);
  });

  it('heads_up: every solver earns points', () => {
    const { players, teamMode } = playersFor('heads_up');
    const teamIds = teamMode ? { a: 'team-a', b: 'team-b' } : null;
    const { sim } = play('heads_up', players, 'p0', teamIds, 4242);
    const totals = sim.pub.totalScores as Record<string, number>;
    for (const p of players) {
      expect(totals[p.id], `${p.id} solved`).toBeGreaterThan(0);
    }
  });

  it('password: both teams bank points and totals mirror team totals', () => {
    const { players, teamMode } = playersFor('password');
    const teamIds = { a: 'team-a', b: 'team-b' };
    expect(teamMode).toBe(true);
    const { sim } = play('password', players, 'p0', teamIds, 999);
    const teamTotals = sim.pub.teamTotals as Record<string, number>;
    expect(teamTotals.a).toBeGreaterThan(0);
    expect(teamTotals.b).toBeGreaterThan(0);
    const totals = sim.pub.totalScores as Record<string, number>;
    expect(totals.p0).toBe(teamTotals.a);
  });

  it('charades: both teams bank points', () => {
    const { players } = playersFor('charades');
    const teamIds = { a: 'team-a', b: 'team-b' };
    const { sim } = play('charades', players, 'p0', teamIds, 31337);
    const teamTotals = sim.pub.teamTotals as Record<string, number>;
    expect(teamTotals.a).toBeGreaterThan(0);
    expect(teamTotals.b).toBeGreaterThan(0);
  });

  it('blind_ranking: a perfect ordering earns the maximum score', () => {
    const { players, teamMode } = playersFor('blind_ranking');
    const teamIds = teamMode ? { a: 'team-a', b: 'team-b' } : null;
    const { sim } = play('blind_ranking', players, 'p0', teamIds, 24680);
    const totals = sim.pub.totalScores as Record<string, number>;
    // Two rounds of exact placement -> 1000 per round.
    for (const p of players) {
      expect(totals[p.id], `${p.id} perfect score`).toBe(2000);
    }
  });

  it('auction: winners keep their budget and acquire value', () => {
    const { players, teamMode } = playersFor('auction');
    const teamIds = teamMode ? { a: 'team-a', b: 'team-b' } : null;
    const { sim } = play('auction', players, 'p0', teamIds, 555);
    const totals = sim.pub.totalScores as Record<string, number>;
    // Every player is scored each round (budget + acquired value).
    for (const p of players) {
      expect(totals[p.id], `${p.id} scored`).toBeGreaterThan(0);
    }
  });
});

describe('random generation produces valid, secret-safe state', () => {
  it('imposter: roles are dealt to real players and secrets stay private', () => {
    const { players } = playersFor('imposter');
    // Inspect the freshly dealt state, before play rewrites the views per round.
    const sim = buildSim('imposter', players, 'p0', null, 777);
    const ids = players.map((p) => p.id);
    for (const round of sim.state.rounds) {
      expect(ids).toContain(round.imposterId);
      expect(typeof round.word).toBe('string');
      expect(round.word.length).toBeGreaterThan(0);
    }
    // Crew views carry the word; the imposter view never does.
    const round0 = sim.state.rounds[0];
    const crew = players.find((p) => p.id !== round0.imposterId) as PlayerInfo;
    expect(sim.views[crew.id]?.secret).toBe(round0.word);
    expect(sim.views[round0.imposterId]?.secret).toBeUndefined();
  });

  it('heads_up: everyone sees the others words and never their own', () => {
    const { players } = playersFor('heads_up');
    const sim = buildSim('heads_up', players, 'p0', null, 8080);
    const round = sim.state.rounds[0];
    for (const p of players) {
      const assignments = sim.views[p.id]?.assignments as Record<string, string>;
      expect(assignments).toBeTruthy();
      expect(assignments[p.id]).toBeUndefined();
      for (const other of players.filter((o) => o.id !== p.id)) {
        expect(assignments[other.id]).toBe(round.assignments[other.id]);
      }
    }
  });

  it('password: only the clue giver holds the secret', () => {
    const { players } = playersFor('password');
    const sim = buildSim('password', players, 'p0', { a: 'team-a', b: 'team-b' }, 606);
    const giverId = sim.state.current.wordTurn.giverId;
    const secret = sim.state.current.wordTurn.word;
    for (const p of players) {
      if (p.id === giverId) expect(sim.views[p.id]?.secret).toBe(secret);
      else expect(sim.views[p.id]?.secret ?? null).toBeNull();
    }
  });

  it('charades: only the performer holds the prompt', () => {
    const { players } = playersFor('charades');
    const sim = buildSim('charades', players, 'p0', { a: 'team-a', b: 'team-b' }, 707);
    const performerId = sim.state.current.turn.performerId;
    const word = sim.state.current.turn.pool[0];
    for (const p of players) {
      if (p.id === performerId) expect(sim.views[p.id]?.secret).toBe(word);
      else expect(sim.views[p.id]?.secret ?? null).toBeNull();
    }
  });

  it('blind_ranking: the reference is a permutation of the drawn subset', () => {
    const { players } = playersFor('blind_ranking');
    const sim = buildSim('blind_ranking', players, 'p0', null, 909);
    for (const round of sim.state.rounds) {
      expect([...round.items].sort()).toEqual([...round.reference].sort());
      expect(new Set(round.items).size).toBe(round.items.length);
    }
  });

  it('auction: lots are valued, priced, and scaled to the budget', () => {
    const { players } = playersFor('auction');
    const sim = buildSim('auction', players, 'p0', null, 1010);
    const startingBudget = sim.state.startingBudget as number;
    for (const round of sim.state.rounds) {
      let sum = 0;
      for (const item of round.items) {
        expect(item.value).toBeGreaterThan(0);
        expect(item.startingBid).toBeGreaterThanOrEqual(10);
        expect(item.startingBid % 10).toBe(0);
        sum += item.value;
      }
      // Values are scaled so the pool totals ~1.6x one player's budget.
      const ratio = sum / startingBudget;
      expect(ratio).toBeGreaterThan(1.2);
      expect(ratio).toBeLessThan(2.2);
    }
  });
});
