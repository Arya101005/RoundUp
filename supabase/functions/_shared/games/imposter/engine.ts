/**
 * Imposter engine (Section 10.1). Pure state machine: roles are dealt once at
 * start, every round re-deals, and phases advance only through transition()
 * or validated player actions. Secrets live in the secure state or in the
 * owning player's view — never in publicState before VOTE_REVEAL.
 *
 * `state.pub` mirrors the public projection so actions and ticks can update it
 * without receiving it as an argument; the caller commits `state.pub` as the
 * row's public_state on every transition.
 */
import type {
  ActionInput,
  ActionResult,
  ChatCheck,
  EngineInit,
  GameEngine,
  InitCtx,
  PlayerInfo,
  StepCtx,
  Transition,
} from '../../engine/types.ts';
import { nextIndex, transition } from '../../engine/machine.ts';
import { addTotals, ev, failResult, pick, tr, sameWord } from '../../engine/helpers.ts';
import { wordsForTheme } from '../../content/seed.ts';
import { STATEMENT_MAX } from '../../validation/sanitize.ts';
import { randomUUID } from '../../std/uuid.ts';
import { imposterDurations as D, imposterScoring as S } from './scoring.ts';

const ROLE_REVEAL = 'role_reveal';
const DISCUSSION = 'discussion';
const VOTING = 'voting';
const VOTE_REVEAL = 'vote_reveal';
const GUESS = 'imposter_guess';
const RESULTS = 'round_results';

const TABLE: Record<string, readonly string[]> = {
  [ROLE_REVEAL]: [DISCUSSION],
  [DISCUSSION]: [VOTING],
  [VOTING]: [VOTE_REVEAL],
  [VOTE_REVEAL]: [GUESS, RESULTS],
  [GUESS]: [RESULTS],
  [RESULTS]: [ROLE_REVEAL],
};

interface RoundSetup {
  word: string;
  category: string;
  imposterId: string;
  speakerStart: number;
}

interface RoundData {
  votes: Record<string, string>;
  caughtId: string | null;
  guessOk: boolean | null;
  finalized: boolean;
  speakerIndex: number;
  turnsDone: number;
  turnsTarget: number;
}

export interface ImposterState {
  order: string[];
  hostId: string;
  roundIndex: number;
  totalRounds: number;
  mode: 'free_chat' | 'turn_based';
  discussionSeconds: number;
  turnSeconds: number;
  laps: number;
  votingSeconds: number;
  imposterSeesTheme: boolean;
  imposterGuessEnabled: boolean;
  guessSeconds: number;
  themeLabel: string;
  rounds: RoundSetup[];
  current: RoundData;
  history: {
    round: number;
    word: string;
    category: string;
    imposterId: string;
    caughtId: string | null;
    guessOk: boolean | null;
  }[];
  stats: Record<string, { correctVotes: number; caughtCount: number }>;
  finished: boolean;
  pub: Record<string, unknown>;
}

function asState(state: Record<string, unknown>): ImposterState {
  return state as unknown as ImposterState;
}

function freshRoundData(speakerStart: number): RoundData {
  return {
    votes: {},
    caughtId: null,
    guessOk: null,
    finalized: false,
    speakerIndex: speakerStart,
    turnsDone: 0,
    turnsTarget: 0,
  };
}

function activeSetup(st: ImposterState): RoundSetup {
  const setup = st.rounds[Math.min(st.roundIndex, st.rounds.length - 1)];
  if (!setup) throw new Error('imposter: no round setup');
  return setup;
}

function eligible(st: ImposterState, players: PlayerInfo[]): PlayerInfo[] {
  const inGame = new Set(st.order);
  return players.filter((p) => inGame.has(p.id));
}

/** Strict plurality: a unique top vote-getter is caught; ties catch nobody. */
export function computeCaught(votes: Record<string, string>): {
  caughtId: string | null;
  tally: Record<string, number>;
} {
  const tally: Record<string, number> = {};
  for (const target of Object.values(votes)) {
    tally[target] = (tally[target] ?? 0) + 1;
  }
  let top = 0;
  let leaders: string[] = [];
  for (const [target, count] of Object.entries(tally)) {
    if (count > top) {
      top = count;
      leaders = [target];
    } else if (count === top) {
      leaders.push(target);
    }
  }
  if (top === 0 || leaders.length !== 1) return { caughtId: null, tally };
  return { caughtId: leaders[0] as string, tally };
}

function buildViews(
  players: PlayerInfo[],
  setup: RoundSetup,
  themeLabel: string,
  seesTheme: boolean,
): Record<string, Record<string, unknown>> {
  const views: Record<string, Record<string, unknown>> = {};
  for (const p of players) {
    if (p.id === setup.imposterId) {
      views[p.id] = { role: 'imposter', theme: seesTheme ? themeLabel : null };
    } else {
      views[p.id] = { role: 'crew', secret: setup.word, category: setup.category };
    }
  }
  return views;
}

/** Commits the mutated state plus its public mirror. */
function go(
  state: Record<string, unknown>,
  input: {
    phase: string;
    phaseId: string;
    phaseEndsAt: number | null;
    events?: ReturnType<typeof ev>[];
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

function toVoting(
  state: Record<string, unknown>,
  ctx: StepCtx,
  extraEvents: ReturnType<typeof ev>[] = [],
): Transition {
  const st = asState(state);
  const dl = transition(DISCUSSION, TABLE, VOTING, ctx.now, st.votingSeconds);
  st.pub.speakerId = null;
  return go(state, {
    phase: dl.phase,
    phaseId: dl.phaseId,
    phaseEndsAt: dl.phaseEndsAt,
    events: [...extraEvents, ev('VOTING_ENDED')],
    systemMessages: ['Voting is open.'],
  });
}

function revealVotes(
  state: Record<string, unknown>,
  ctx: StepCtx,
  extraEvents: ReturnType<typeof ev>[] = [],
): Transition {
  const st = asState(state);
  const setup = activeSetup(st);
  const { caughtId, tally } = computeCaught(st.current.votes);
  st.current.caughtId = caughtId;
  st.pub.word = setup.word;
  st.pub.category = setup.category;
  st.pub.caughtId = caughtId;
  st.pub.votes = { ...st.current.votes };
  st.pub.voteTally = tally;
  st.pub.speakerId = null;
  const dl = transition(VOTING, TABLE, VOTE_REVEAL, ctx.now, D.voteReveal);
  return go(state, {
    phase: dl.phase,
    phaseId: dl.phaseId,
    phaseEndsAt: dl.phaseEndsAt,
    events: [
      ...extraEvents,
      ev('VOTING_ENDED', { payload: { caught: caughtId !== null } }),
    ],
    systemMessages: [
      caughtId ? 'The room caught the imposter.' : 'Nobody was caught.',
    ],
  });
}

function advanceTurn(
  state: Record<string, unknown>,
  ctx: StepCtx,
  extraEvents: ReturnType<typeof ev>[] = [],
): Transition {
  const st = asState(state);
  const players = eligible(st, ctx.players);
  const seats = new Set(players.map((p) => p.id));
  const prevSpeaker = st.order[st.current.speakerIndex] ?? null;
  st.current.turnsDone += 1;

  if (st.current.turnsTarget === 0) {
    st.current.turnsTarget = st.laps * Math.max(players.length, 1);
  }

  if (st.current.turnsDone >= st.current.turnsTarget || players.length === 0) {
    const dl = transition(DISCUSSION, TABLE, VOTING, ctx.now, st.votingSeconds);
    st.pub.speakerId = null;
    return go(state, {
      phase: dl.phase,
      phaseId: dl.phaseId,
      phaseEndsAt: dl.phaseEndsAt,
      events: [
        ...extraEvents,
        ev('TURN_ENDED', { actorId: prevSpeaker }),
        ev('VOTING_ENDED'),
      ],
      systemMessages: ['Discussion is over. Voting is open.'],
    });
  }

  let nextSeat = nextIndex(st.order, st.current.speakerIndex, seats);
  if (seats.size === 1 && prevSpeaker && seats.has(prevSpeaker)) {
    // nextIndex never returns the same seat; with a single eligible player the
    // same seat must be reused.
    nextSeat = st.current.speakerIndex;
  }
  st.current.speakerIndex = nextSeat;
  const speakerId = st.order[nextSeat] ?? null;
  // Same phase, new phase_id: stale ticks and turns for the old seat no-op.
  const phaseId = randomUUID();
  return go(state, {
    phase: DISCUSSION,
    phaseId,
    phaseEndsAt: ctx.now + st.turnSeconds * 1000,
    events: [
      ...extraEvents,
      ev('TURN_ENDED', { actorId: prevSpeaker }),
      ev('TURN_STARTED', { actorId: speakerId }),
    ],
    systemMessages: speakerId ? [] : [],
  });
}

function finalizeRound(
  state: Record<string, unknown>,
  ctx: StepCtx,
  extraEvents: ReturnType<typeof ev>[] = [],
): Transition {
  const st = asState(state);
  const setup = activeSetup(st);
  if (!st.current.finalized) {
    st.current.finalized = true;
    const caughtId = st.current.caughtId;
    const guessOk = st.current.guessOk;
    const deltas: Record<string, number> = {};

    if (caughtId) {
      for (const [voter, target] of Object.entries(st.current.votes)) {
        const stats = st.stats[voter] ?? { correctVotes: 0, caughtCount: 0 };
        if (target === caughtId) {
          stats.correctVotes += 1;
          deltas[voter] = (deltas[voter] ?? 0) + S.correctVote + S.correctVoteCaughtBonus;
        }
        st.stats[voter] = stats;
      }
      if (guessOk) {
        deltas[setup.imposterId] = (deltas[setup.imposterId] ?? 0) + S.guessSuccess;
      }
    } else {
      deltas[setup.imposterId] = (deltas[setup.imposterId] ?? 0) + S.survives;
    }
    const impStats = st.stats[setup.imposterId] ?? { correctVotes: 0, caughtCount: 0 };
    if (caughtId === setup.imposterId) impStats.caughtCount += 1;
    st.stats[setup.imposterId] = impStats;

    st.pub.totalScores = addTotals(
      (st.pub.totalScores as Record<string, number>) ?? {},
      deltas,
    );
    st.pub.stats = { ...st.stats };
    st.history.push({
      round: st.roundIndex,
      word: setup.word,
      category: setup.category,
      imposterId: setup.imposterId,
      caughtId,
      guessOk,
    });
    st.pub.history = [...st.history];
    st.pub.guessOk = caughtId ? guessOk : null;
    st.pub.scoresThisRound = deltas;
  }

  const dl = transition(ctx.currentPhase, TABLE, RESULTS, ctx.now, D.roundResults);
  return go(state, {
    phase: dl.phase,
    phaseId: dl.phaseId,
    phaseEndsAt: dl.phaseEndsAt,
    events: [
      ...extraEvents,
      ev('ROUND_ENDED', {
        payload: {
          round: st.roundIndex,
          caught: st.current.caughtId !== null,
          guessOk: st.current.guessOk,
        },
      }),
    ],
  });
}

function nextRound(state: Record<string, unknown>, ctx: StepCtx): Transition {
  const st = asState(state);
  st.roundIndex += 1;
  const setup = activeSetup(st);
  st.current = freshRoundData(setup.speakerStart);
  st.pub.word = null;
  st.pub.category = null;
  st.pub.caughtId = null;
  st.pub.votes = null;
  st.pub.voteTally = null;
  st.pub.speakerId = null;
  st.pub.guessOk = null;
  st.pub.scoresThisRound = null;

  const dl = transition(RESULTS, TABLE, ROLE_REVEAL, ctx.now, D.roleReveal);
  return go(state, {
    phase: dl.phase,
    phaseId: dl.phaseId,
    phaseEndsAt: dl.phaseEndsAt,
    views: buildViews(ctx.players, setup, st.themeLabel, st.imposterSeesTheme),
    events: [ev('ROUND_STARTED', { payload: { round: st.roundIndex } })],
    systemMessages: [`Round ${st.roundIndex + 1} of ${st.totalRounds}. Roles are dealt.`],
  });
}

export const imposterEngine: GameEngine = {
  id: 'imposter',
  initialPhase: ROLE_REVEAL,

  initialize(ctx: InitCtx & { rng: () => number }): EngineInit {
    const entries = wordsForTheme(ctx.theme, ctx.difficulty);
    if (entries.length === 0) {
      throw new Error(`no seed content for theme ${ctx.theme}`);
    }
    const order = ctx.players.map((p) => p.id);
    const rounds: RoundSetup[] = [];
    const usedWords = new Set<string>();
    let lastImposter: string | null = null;
    for (let r = 0; r < ctx.totalRounds; r++) {
      const fresh = entries.filter((e) => !usedWords.has(e.word));
      const pool = fresh.length > 0 ? fresh : entries;
      const entry = pick(pool, ctx.rng);
      usedWords.add(entry.word);
      const candidates =
        order.length > 2 && lastImposter ? order.filter((id) => id !== lastImposter) : order;
      const imposterId: string = pick(candidates, ctx.rng);
      lastImposter = imposterId;
      rounds.push({
        word: entry.word,
        category: entry.category,
        imposterId,
        speakerStart: order.length > 0 ? Math.floor(ctx.rng() * order.length) : 0,
      });
    }

    const first = rounds[0] as RoundSetup;
    const pub: Record<string, unknown> = {
      totalScores: {},
      stats: {},
      history: [],
      scoresThisRound: null,
      word: null,
      category: null,
      caughtId: null,
      votes: null,
      voteTally: null,
      speakerId: null,
      guessOk: null,
    };
    const state: ImposterState = {
      order,
      hostId: ctx.hostId,
      roundIndex: 0,
      totalRounds: ctx.totalRounds,
      mode: (ctx.config.discussionMode as 'free_chat' | 'turn_based') ?? 'free_chat',
      discussionSeconds: (ctx.config.discussionSeconds as number) ?? 180,
      turnSeconds: (ctx.config.turnSeconds as number) ?? 25,
      laps: (ctx.config.laps as number) ?? 2,
      votingSeconds: (ctx.config.votingSeconds as number) ?? 45,
      imposterSeesTheme: (ctx.config.imposterSeesTheme as boolean) ?? true,
      imposterGuessEnabled: (ctx.config.imposterGuessEnabled as boolean) ?? true,
      guessSeconds: (ctx.config.guessSeconds as number) ?? 30,
      themeLabel: ctx.themeLabel,
      rounds,
      current: freshRoundData(first.speakerStart),
      history: [],
      stats: {},
      finished: false,
      pub,
    };

    return {
      state: state as unknown as Record<string, unknown>,
      publicState: pub,
      views: buildViews(ctx.players, first, ctx.themeLabel, state.imposterSeesTheme),
      phase: ROLE_REVEAL,
      phaseEndsAt: ctx.now + D.roleReveal * 1000,
      events: [
        ev('GAME_STARTED', { payload: { game: 'imposter' } }),
        ev('ROUND_STARTED', { payload: { round: 0 } }),
      ],
      systemMessages: ['Round 1: roles are dealt.'],
    };
  },

  handleAction(
    state: Record<string, unknown>,
    action: ActionInput,
    actor: PlayerInfo | null,
    ctx: StepCtx,
  ): ActionResult {
    const st = asState(state);
    const setup = activeSetup(st);

    switch (action.type) {
      case 'vote': {
        if (ctx.currentPhase !== VOTING) return failResult('WRONG_PHASE');
        if (!actor) return failResult('INVALID_ACTION');
        const voters = eligible(st, ctx.players);
        if (!voters.some((p) => p.id === actor.id)) return failResult('NOT_IN_ROOM');
        const target = String(action.payload.targetId ?? '');
        if (!target) return failResult('INVALID_ACTION');
        if (target === actor.id) return failResult('CANNOT_SELF_VOTE');
        if (!voters.some((p) => p.id === target)) return failResult('INVALID_ACTION');

        const firstVote = st.current.votes[actor.id] === undefined;
        st.current.votes[actor.id] = target;
        const events = [ev('VOTE_SUBMITTED', { actorId: actor.id, actionId: action.actionId })];
        const allVoted = voters.every((p) => st.current.votes[p.id] !== undefined);
        if (allVoted) {
          return { ok: true, transition: revealVotes(state, ctx, events) };
        }
        return {
          ok: true,
          transition: go(state, {
            phase: VOTING,
            phaseId: ctx.phaseId,
            // Keep the running deadline; a null here would cancel the phase.
            phaseEndsAt: ctx.phaseEndsAt,
            events,
            systemMessages: firstVote ? [`${actor.name} has voted.`] : [],
          }),
        };
      }

      case 'end_discussion': {
        if (ctx.currentPhase !== DISCUSSION) return failResult('WRONG_PHASE');
        if (!actor || actor.id !== ctx.hostId) return failResult('NOT_HOST');
        return {
          ok: true,
          transition: toVoting(state, ctx, [
            ev('TURN_ENDED', { actorId: actor.id, actionId: action.actionId }),
          ]),
        };
      }

      case 'end_turn': {
        if (ctx.currentPhase !== DISCUSSION) return failResult('WRONG_PHASE');
        if (st.mode !== 'turn_based') return failResult('INVALID_ACTION');
        const speakerId = st.order[st.current.speakerIndex];
        if (!actor || actor.id !== speakerId) return failResult('NOT_YOUR_TURN');
        return {
          ok: true,
          transition: advanceTurn(state, ctx, []),
        };
      }

      case 'guess': {
        if (ctx.currentPhase !== GUESS) return failResult('WRONG_PHASE');
        if (!actor || actor.id !== setup.imposterId) return failResult('INVALID_ACTION');
        const word = String(action.payload.word ?? '').slice(0, STATEMENT_MAX).trim();
        if (!word) return failResult('INVALID_INPUT');
        const correct = sameWord(word, setup.word);
        st.current.guessOk = correct;
        return {
          ok: true,
          transition: finalizeRound(state, ctx, [
            ev(correct ? 'GUESS_CORRECT' : 'GUESS_SUBMITTED', {
              actorId: actor.id,
              actionId: action.actionId,
              payload: { correct },
            }),
          ]),
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
      case ROLE_REVEAL: {
        const players = eligible(st, ctx.players);
        const seats = new Set(players.map((p) => p.id));
        if (st.mode === 'turn_based' && players.length > 0) {
          const currentSeat = st.order[st.current.speakerIndex];
          if (!currentSeat || !seats.has(currentSeat)) {
            st.current.speakerIndex = nextIndex(st.order, st.current.speakerIndex, seats);
          }
          st.current.turnsTarget = st.laps * players.length;
          st.current.turnsDone = 0;
          const speakerId = st.order[st.current.speakerIndex] ?? null;
          const dl = transition(ROLE_REVEAL, TABLE, DISCUSSION, ctx.now, st.turnSeconds);
          st.pub.speakerId = speakerId;
          return go(state, {
            phase: dl.phase,
            phaseId: dl.phaseId,
            phaseEndsAt: dl.phaseEndsAt,
            events: speakerId ? [ev('TURN_STARTED', { actorId: speakerId })] : [],
          });
        }
        const dl = transition(ROLE_REVEAL, TABLE, DISCUSSION, ctx.now, st.discussionSeconds);
        st.pub.speakerId = null;
        return go(state, {
          phase: dl.phase,
          phaseId: dl.phaseId,
          phaseEndsAt: dl.phaseEndsAt,
        });
      }

      case DISCUSSION: {
        if (st.mode === 'turn_based') return advanceTurn(state, ctx, []);
        return toVoting(state, ctx, []);
      }

      case VOTING:
        return revealVotes(state, ctx, []);

      case VOTE_REVEAL: {
        if (st.current.caughtId && st.imposterGuessEnabled) {
          const dl = transition(VOTE_REVEAL, TABLE, GUESS, ctx.now, st.guessSeconds);
          return go(state, {
            phase: dl.phase,
            phaseId: dl.phaseId,
            phaseEndsAt: dl.phaseEndsAt,
            systemMessages: ['The imposter gets one chance to name the secret word.'],
          });
        }
        return finalizeRound(state, ctx, []);
      }

      case GUESS: {
        st.current.guessOk = false;
        return finalizeRound(state, ctx, []);
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
        return nextRound(state, ctx);
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
    body: string,
  ): ChatCheck {
    const st = asState(state);
    if (st.mode === 'turn_based' && ctx.currentPhase === DISCUSSION) {
      const speakerId = st.order[st.current.speakerIndex];
      if (!actor || actor.id !== speakerId) return { ok: false, code: 'NOT_YOUR_TURN' };
      if (body.length > STATEMENT_MAX) return { ok: false, code: 'INVALID_INPUT' };
      return { ok: true, kind: 'statement' };
    }
    return { ok: true, kind: 'chat' };
  },
};
