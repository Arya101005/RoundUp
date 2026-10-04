/**
 * Heads Up engine (Section 10.2): everyone knows everyone else's word except
 * its owner. Strict rotation, time-scaled scoring, question/answer flow via
 * chat kind + answer actions. Each player's view holds all OTHER players'
 * words and never their own.
 */
import type {
  ActionInput,
  ActionResult,
  ChatCheck,
  EngineInit,
  GameEventRow,
  GameEngine,
  InitCtx,
  PlayerInfo,
  StepCtx,
  Transition,
} from '../../engine/types.ts';
import { transition } from '../../engine/machine.ts';
import { ev, failResult, pick, shuffle, tr } from '../../engine/helpers.ts';
import { wordsForTheme } from '../../content/seed.ts';
import { matchAnswer } from '../../content/matcher.ts';
import { STATEMENT_MAX } from '../../validation/sanitize.ts';
import { randomUUID } from '../../std/uuid.ts';
import {
  headsUpDurations as D,
  headsUpPoints,
  headsUpScoring as S,
} from './scoring.ts';

const TURN = 'turn';
const RESULTS = 'round_results';

const TABLE: Record<string, readonly string[]> = {
  [TURN]: [TURN, RESULTS],
  // Self-loop guards the degenerate case where nobody is present at round
  // start: the round fast-forwards instead of throwing IllegalTransition.
  [RESULTS]: [TURN, RESULTS],
};

type AnswerValue = 'yes' | 'no' | 'unknown';

interface HeadsUpRound {
  assignments: Record<string, string>;
  order: string[]; // randomized once per round
}

interface HeadsUpState {
  order: string[];
  hostId: string;
  roundIndex: number;
  totalRounds: number;
  turnSeconds: number;
  turnsPerPlayer: number;
  guessesPerTurn: number;
  rounds: HeadsUpRound[];
  current: {
    seatIndex: number;
    turnsUsed: Record<string, number>;
    finished: Record<string, boolean>;
    finishOrder: string[];
    wrongByUser: Record<string, number>;
    guessesThisTurn: number;
    lastGuessAt: Record<string, number>;
    solveMs: Record<string, number>;
    guessFeed: { byId: string; text: string; near: boolean }[];
    roundScore: Record<string, number>;
    activeId: string | null;
  };
  stats: Record<string, { solved: number; solveMs: number }>;
  finished: boolean;
  pub: Record<string, unknown>;
}

function asState(state: Record<string, unknown>): HeadsUpState {
  return state as unknown as HeadsUpState;
}

function self(st: HeadsUpState): Record<string, unknown> {
  return st as unknown as Record<string, unknown>;
}

function activeRound(st: HeadsUpState): HeadsUpRound {
  const round = st.rounds[Math.min(st.roundIndex, st.rounds.length - 1)];
  if (!round) throw new Error('heads up: no round setup');
  return round;
}

function go(
  state: Record<string, unknown>,
  input: {
    phase: string;
    phaseId: string;
    phaseEndsAt: number | null;
    events?: GameEventRow[];
    systemMessages?: string[];
    views?: Record<string, Record<string, unknown>>;
    status?: 'active' | 'finished';
  },
): Transition {
  const st = asState(state);
  return tr({
    state,
    publicState: st.pub,
    phase: input.phase,
    phaseId: input.phaseId,
    phaseEndsAt: input.phaseEndsAt,
    roundIndex: st.roundIndex,
    events: input.events,
    systemMessages: input.systemMessages,
    views: input.views,
    status: input.status,
  });
}

/** Views: every other player's word, never your own. */
function roundViews(
  round: HeadsUpRound,
  players: PlayerInfo[],
): Record<string, Record<string, unknown>> {
  const views: Record<string, Record<string, unknown>> = {};
  for (const p of players) {
    const others: Record<string, string> = {};
    for (const [id, word] of Object.entries(round.assignments)) {
      if (id !== p.id) others[id] = word;
    }
    views[p.id] = { assignments: others };
  }
  return views;
}

function inGameIds(st: HeadsUpState, players: PlayerInfo[]): Set<string> {
  const ids = new Set(players.map((p) => p.id));
  return new Set(st.order.filter((id) => ids.has(id)));
}

/** Next seat in rotation: not finished, turns left, in the game, present. */
function nextSeat(st: HeadsUpState, inGame: Set<string>, present: Set<string>): number {
  const round = activeRound(st);
  const n = round.order.length;
  if (n === 0) return -1;
  for (let step = 1; step <= n; step++) {
    const idx = ((st.current.seatIndex + step) % n + n) % n;
    const id = round.order[idx];
    if (!id || !inGame.has(id) || !present.has(id)) continue;
    if (st.current.finished[id]) continue;
    if ((st.current.turnsUsed[id] ?? 0) >= st.turnsPerPlayer) continue;
    return idx;
  }
  return -1;
}

function beginSeat(st: HeadsUpState, seat: number): string | null {
  const round = activeRound(st);
  const id = round.order[seat] ?? null;
  if (!id) return null;
  st.current.seatIndex = seat;
  st.current.activeId = id;
  st.current.turnsUsed[id] = (st.current.turnsUsed[id] ?? 0) + 1;
  st.current.guessesThisTurn = 0;
  st.pub.currentId = id;
  return id;
}

function endRound(
  state: Record<string, unknown>,
  ctx: StepCtx,
  from: string,
  extraEvents: GameEventRow[] = [],
): Transition {
  const st = asState(state);
  const round = activeRound(st);

  // Merge round scores into the running totals exactly once, here.
  scoreRound(st);
  st.pub.assignments = { ...round.assignments };
  st.pub.scoresThisRound = { ...st.current.roundScore };
  st.pub.currentId = null;

  const stats = { ...st.stats };
  for (const userId of st.order) {
    const prev = stats[userId] ?? { solved: 0, solveMs: 0 };
    const solvedNow = st.current.finished[userId] ? 1 : 0;
    stats[userId] = {
      solved: prev.solved + solvedNow,
      solveMs: prev.solveMs + (st.current.solveMs[userId] ?? 0),
    };
  }
  st.stats = stats;
  st.pub.stats = stats;

  const dl = transition(from, TABLE, RESULTS, ctx.now, D.roundResults);
  return go(state, {
    phase: dl.phase,
    phaseId: dl.phaseId,
    phaseEndsAt: dl.phaseEndsAt,
    events: [...extraEvents, ev('ROUND_ENDED', { payload: { round: st.roundIndex } })],
  });
}

function advanceTurn(
  state: Record<string, unknown>,
  ctx: StepCtx,
  from: string,
  extraEvents: GameEventRow[] = [],
): Transition {
  const st = asState(state);
  const prev = st.current.activeId;
  const players = ctx.players;
  const seat = nextSeat(st, inGameIds(st, players), new Set(players.filter((p) => p.connected).map((p) => p.id)));

  if (seat === -1) {
    return endRound(state, ctx, from, extraEvents);
  }

  const newId = beginSeat(st, seat);
  const dl = transition(from, TABLE, TURN, ctx.now, st.turnSeconds);
  const events: GameEventRow[] = [...extraEvents];
  if (prev && prev !== newId) events.push(ev('TURN_ENDED', { actorId: prev }));
  if (newId) events.push(ev('TURN_STARTED', { actorId: newId }));
  const name = players.find((p) => p.id === newId)?.name ?? 'Someone';
  return go(state, {
    phase: dl.phase,
    phaseId: dl.phaseId,
    phaseEndsAt: dl.phaseEndsAt,
    events,
    systemMessages: newId && newId !== prev ? [`${name}'s turn.`] : [],
  });
}

function scoreRound(st: HeadsUpState): void {
  const total = (st.pub.totalScores as Record<string, number>) ?? {};
  for (const [userId, points] of Object.entries(st.current.roundScore)) {
    total[userId] = (total[userId] ?? 0) + points;
  }
  st.pub.totalScores = total;
}

function startRound(state: Record<string, unknown>, ctx: StepCtx, from: string): Transition {
  const st = asState(state);
  st.current = {
    seatIndex: -1,
    turnsUsed: {},
    finished: {},
    finishOrder: [],
    wrongByUser: {},
    guessesThisTurn: 0,
    lastGuessAt: {},
    solveMs: {},
    guessFeed: [],
    roundScore: {},
    activeId: null,
  };
  st.pub.assignments = null;
  st.pub.finishedIds = [];
  st.pub.guessFeed = [];
  st.pub.lastAnswers = {};
  st.pub.scoresThisRound = null;
  st.pub.currentId = null;
  const views = roundViews(activeRound(st), ctx.players);
  const extra = advanceTurn(state, ctx, from, [
    ev('ROUND_STARTED', { payload: { round: st.roundIndex } }),
  ]);
  return {
    ...extra,
    views: { ...views, ...(extra.views as Record<string, Record<string, unknown>> | undefined) },
    systemMessages: [
      `Round ${st.roundIndex + 1} of ${st.totalRounds}.`,
      ...(extra.systemMessages ?? []),
    ],
  };
}

export const headsUpEngine: GameEngine = {
  id: 'heads_up',
  initialPhase: TURN,

  initialize(ctx: InitCtx & { rng: () => number }): EngineInit {
    const entries = wordsForTheme(ctx.theme, ctx.difficulty);
    if (entries.length === 0) throw new Error(`NO_CONTENT: no words for ${ctx.theme}`);
    const order = ctx.players.map((p) => p.id);

    const rounds: HeadsUpRound[] = [];
    for (let r = 0; r < ctx.totalRounds; r++) {
      const used = new Set<string>();
      const assignments: Record<string, string> = {};
      for (const id of order) {
        const fresh = entries.filter((e) => !used.has(e.word));
        const pool = fresh.length > 0 ? fresh : entries;
        const entry = pick(pool, ctx.rng);
        used.add(entry.word);
        assignments[id] = entry.word;
      }
      rounds.push({ assignments, order: shuffle(order, ctx.rng) });
    }

    const pub: Record<string, unknown> = {
      totalScores: {},
      stats: {},
      currentId: null,
      finishedIds: [],
      guessFeed: [],
      lastAnswers: {},
      assignments: null,
      scoresThisRound: null,
    };
    const state: HeadsUpState = {
      order,
      hostId: ctx.hostId,
      roundIndex: 0,
      totalRounds: ctx.totalRounds,
      turnSeconds: (ctx.config.turnSeconds as number) ?? 60,
      turnsPerPlayer: (ctx.config.turnsPerPlayer as number) ?? 2,
      guessesPerTurn: (ctx.config.guessesPerTurn as number) ?? 3,
      rounds,
      current: {
        seatIndex: -1,
        turnsUsed: {},
        finished: {},
        finishOrder: [],
        wrongByUser: {},
        guessesThisTurn: 0,
        lastGuessAt: {},
        solveMs: {},
        guessFeed: [],
        roundScore: {},
        activeId: null,
      },
      stats: {},
      finished: false,
      pub,
    };

    const present = new Set(
      ctx.players.filter((p) => p.connected).map((p) => p.id),
    );
    const seat = nextSeat(state, new Set(order), present);
    const firstId = seat >= 0 ? beginSeat(state, seat) : null;
    const views = roundViews(rounds[0] as HeadsUpRound, ctx.players);
    const name = ctx.players.find((p) => p.id === firstId)?.name ?? 'Someone';

    return {
      state: self(state),
      publicState: pub,
      views,
      phase: TURN,
      phaseEndsAt: ctx.now + state.turnSeconds * 1000,
      events: [
        ev('GAME_STARTED', { payload: { game: 'heads_up' } }),
        ...(firstId ? [ev('TURN_STARTED', { actorId: firstId })] : []),
      ],
      systemMessages: ['Round 1 starts.', firstId ? `${name}'s turn.` : ''].filter(Boolean),
    };
  },

  handleAction(
    state: Record<string, unknown>,
    action: ActionInput,
    actor: PlayerInfo | null,
    ctx: StepCtx,
  ): ActionResult {
    const st = asState(state);
    const round = activeRound(st);

    switch (action.type) {
      case 'guess': {
        if (ctx.currentPhase !== TURN) return failResult('WRONG_PHASE');
        if (!actor) return failResult('INVALID_ACTION');
        if (actor.id !== st.current.activeId) return failResult('NOT_YOUR_TURN');
        if (st.current.guessesThisTurn >= st.guessesPerTurn) return failResult('GUESS_LIMIT');
        const last = st.current.lastGuessAt[actor.id] ?? 0;
        if (ctx.now - last < S.guessCooldownMs) return failResult('RATE_LIMITED');

        const guess = String(action.payload.word ?? '').trim().slice(0, STATEMENT_MAX);
        if (!guess) return failResult('INVALID_INPUT');
        const target = round.assignments[actor.id];
        if (!target) return failResult('INVALID_ACTION');
        const match = matchAnswer(guess, target);
        st.current.lastGuessAt[actor.id] = ctx.now;
        st.current.guessesThisTurn += 1;

        if (match.match) {
          const windowMs = st.turnSeconds * 1000;
          const remaining = Math.max(0, (ctx.phaseEndsAt ?? ctx.now) - ctx.now);
          const remainingRatio = remaining / windowMs;
          const base = headsUpPoints(remainingRatio, st.current.wrongByUser[actor.id] ?? 0);
          const placementIndex = st.current.finishOrder.length;
          const placement = placementIndex < S.placement.length ? (S.placement[placementIndex] ?? 0) : 0;
          st.current.roundScore[actor.id] = base + placement;
          st.current.finished[actor.id] = true;
          st.current.finishOrder.push(actor.id);
          st.current.solveMs[actor.id] = windowMs - remaining;
          st.pub.finishedIds = [...st.current.finishOrder];

          const allDone = st.order.every(
            (id) =>
              st.current.finished[id] ||
              (st.current.turnsUsed[id] ?? 0) >= st.turnsPerPlayer,
          );
          const events = [
            ev('GUESS_CORRECT', { actorId: actor.id, actionId: action.actionId, payload: { points: st.current.roundScore[actor.id] } }),
          ];
          if (allDone) {
            return { ok: true, transition: endRound(state, ctx, TURN, events) };
          }
          return { ok: true, transition: advanceTurn(state, ctx, TURN, events) };
        }

        st.current.wrongByUser[actor.id] = (st.current.wrongByUser[actor.id] ?? 0) + 1;
        st.current.guessFeed.push({ byId: actor.id, text: guess, near: match.confidence === 'near' });
        st.pub.guessFeed = [...st.current.guessFeed];
        return {
          ok: true,
          transition: go(state, {
            phase: TURN,
            phaseId: ctx.phaseId,
            phaseEndsAt: ctx.phaseEndsAt,
            events: [
              ev('GUESS_SUBMITTED', {
                actorId: actor.id,
                actionId: action.actionId,
                payload: { near: match.confidence === 'near' },
              }),
            ],
          }),
        };
      }

      case 'pass': {
        if (ctx.currentPhase !== TURN) return failResult('WRONG_PHASE');
        if (!actor || actor.id !== st.current.activeId) return failResult('NOT_YOUR_TURN');
        return {
          ok: true,
          transition: advanceTurn(state, ctx, TURN, [
            ev('TURN_ENDED', { actorId: actor.id, actionId: action.actionId }),
          ]),
        };
      }

      case 'answer': {
        if (ctx.currentPhase !== TURN) return failResult('WRONG_PHASE');
        if (!actor || actor.id === st.current.activeId) return failResult('INVALID_ACTION');
        const value = String(action.payload.value ?? '');
        if (value !== 'yes' && value !== 'no' && value !== 'unknown') {
          return failResult('INVALID_ACTION');
        }
        const answers = (st.pub.lastAnswers as Record<string, AnswerValue>) ?? {};
        answers[actor.id] = value as AnswerValue;
        st.pub.lastAnswers = { ...answers };
        return {
          ok: true,
          transition: go(state, {
            phase: TURN,
            phaseId: ctx.phaseId,
            phaseEndsAt: ctx.phaseEndsAt,
            events: [
              ev('ANSWER_GIVEN', {
                actorId: actor.id,
                actionId: action.actionId,
                payload: { value },
              }),
            ],
          }),
        };
      }

      default:
        return failResult('INVALID_ACTION');
    }
  },

  tick(state: Record<string, unknown>, ctx: StepCtx): Transition | null {
    const st = asState(state);
    if (st.finished) return null;

    switch (ctx.currentPhase) {
      case TURN: {
        const events = st.current.activeId
          ? [ev('TURN_ENDED', { actorId: st.current.activeId })]
          : [];
        return advanceTurn(state, ctx, TURN, events);
      }
      case RESULTS: {
        if (st.roundIndex + 1 >= st.totalRounds) {
          st.finished = true;
          return go(state, {
            phase: RESULTS,
            phaseId: randomUUID(),
            phaseEndsAt: null,
            status: 'finished',
            events: [ev('GAME_ENDED')],
            systemMessages: ['Game over.'],
          });
        }
        st.roundIndex += 1;
        return startRound(state, ctx, RESULTS);
      }
      default:
        return null;
    }
  },

  isFinished(state: Record<string, unknown>): boolean {
    return asState(state).finished;
  },

  validateChat(
    state: Record<string, unknown>,
    actor: PlayerInfo | null,
    ctx: StepCtx,
    _body: string,
  ): ChatCheck {
    const st = asState(state);
    if (ctx.currentPhase === TURN) {
      if (!actor || actor.id !== st.current.activeId) {
        // Non-active players answer with buttons only: free text could leak.
        return { ok: false, code: 'NOT_YOUR_TURN' };
      }
      return { ok: true, kind: 'question' };
    }
    return { ok: true, kind: 'chat' };
  },
};
