/**
 * Charades engine (Section 10.4): teams alternate turns, the performer
 * rotates, and only the performer's teammates may guess. The prompt lives in
 * the performer's private view and is revealed when the turn ends. Performers
 * act over the group's video call or in person — the app carries guesses.
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
import { ev, failResult, pick, tr } from '../../engine/helpers.ts';
import { wordsForTheme } from '../../content/seed.ts';
import { matchAnswer } from '../../content/matcher.ts';
import { STATEMENT_MAX } from '../../validation/sanitize.ts';
import { randomUUID } from '../../std/uuid.ts';
import { charadesDurations as D, charadesScoring as S } from './scoring.ts';

const PERFORM = 'perform';
const REVEAL = 'turn_reveal';
const RESULTS = 'round_results';

const TABLE: Record<string, readonly string[]> = {
  // Self-loop: a skip deals a new prompt with a fresh phase id.
  [PERFORM]: [PERFORM, REVEAL],
  [REVEAL]: [PERFORM, RESULTS],
  [RESULTS]: [PERFORM],
};

type TeamKey = 'a' | 'b';

interface PerformTurn {
  pool: string[]; // primary prompt plus one backup per allowed skip
  team: TeamKey;
  performerId: string;
}

interface CharadesState {
  order: string[];
  teams: Record<TeamKey, string[]>;
  teamIds: Record<TeamKey, string> | null;
  roundIndex: number;
  turnInRound: number;
  totalRounds: number;
  performanceSeconds: number;
  skipsAllowed: number;
  rounds: { turns: [PerformTurn, PerformTurn] }[];
  current: {
    turn: PerformTurn;
    wordIndex: number;
    skipsUsed: number;
    solved: boolean;
    solvedBy: string | null;
    guessFeed: { byId: string; text: string; near: boolean }[];
    lastGuessAt: Record<string, number>;
    roundPoints: Record<TeamKey, number>;
  };
  teamTotals: Record<TeamKey, number>;
  history: {
    round: number;
    word: string;
    team: TeamKey;
    performerId: string;
    solved: boolean;
    points: number;
  }[];
  finished: boolean;
  pub: Record<string, unknown>;
}

function asState(state: Record<string, unknown>): CharadesState {
  return state as unknown as CharadesState;
}

function self(st: CharadesState): Record<string, unknown> {
  return st as unknown as Record<string, unknown>;
}

function currentWord(st: CharadesState): string {
  const turn = st.current.turn;
  return turn.pool[Math.min(st.current.wordIndex, turn.pool.length - 1)] ?? '';
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
    scores?: Transition['scores'];
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
    scores: input.scores,
    status: input.status,
  });
}

function teamName(key: TeamKey): string {
  return key === 'a' ? 'Team A' : 'Team B';
}

/** Publishes the next performer's turn and deals private views. */
function beginTurn(
  st: CharadesState,
  players: PlayerInfo[],
  turn: PerformTurn,
): {
  views: Record<string, Record<string, unknown>>;
  systemMessages: string[];
  events: GameEventRow[];
} {
  st.current.turn = turn;
  st.current.wordIndex = 0;
  st.current.skipsUsed = 0;
  st.current.solved = false;
  st.current.solvedBy = null;
  st.current.guessFeed = [];
  st.pub.performerId = turn.performerId;
  st.pub.activeTeam = turn.team;
  st.pub.word = null;
  st.pub.guessFeed = [];
  st.pub.turnOver = null;

  const views: Record<string, Record<string, unknown>> = {};
  for (const p of players) {
    if (p.id === turn.performerId) {
      views[p.id] = { secret: currentWord(st), role: 'performer', team: turn.team };
    } else {
      views[p.id] = {
        secret: null,
        role: p.teamId === turn.team ? 'guesser' : 'spectator',
        team: p.teamId,
      };
    }
  }

  const performerName = players.find((p) => p.id === turn.performerId)?.name ?? 'someone';
  return {
    views,
    systemMessages: [`${performerName} is performing for ${teamName(turn.team)}.`],
    events: [ev('TURN_STARTED', { actorId: turn.performerId })],
  };
}

function scoreRows(st: CharadesState, team: TeamKey, points: number): Transition['scores'] {
  if (points <= 0) return [];
  return [
    {
      round_index: st.roundIndex,
      user_id: null,
      team_id: st.teamIds ? st.teamIds[team] : null,
      points,
      breakdown: { team, word: currentWord(st), skips: st.current.skipsUsed },
    },
  ];
}

/** Ends the current performer's turn: reveal the prompt, score, move on. */
function endTurn(
  state: Record<string, unknown>,
  ctx: StepCtx,
  from: string,
  points: number,
  extraEvents: GameEventRow[] = [],
): Transition {
  const st = asState(state);
  const turn = st.current.turn;
  const word = currentWord(st);
  const solved = st.current.solved;
  const team = turn.team;

  if (points > 0) st.teamTotals[team] += points;
  st.current.roundPoints[team] += points;
  st.pub.teamTotals = { ...st.teamTotals };
  const totals = (st.pub.totalScores as Record<string, number>) ?? {};
  for (const userId of st.teams[team]) totals[userId] = st.teamTotals[team];
  st.pub.totalScores = totals;

  st.history.push({
    round: st.roundIndex,
    word,
    team,
    performerId: turn.performerId,
    solved,
    points,
  });
  st.pub.history = [...st.history];
  st.pub.word = word;
  st.pub.turnOver = { solved, points, team, performerId: turn.performerId };
  st.pub.scoresThisRound = { ...st.current.roundPoints };

  const events: GameEventRow[] = [
    ...extraEvents,
    ev('ROUND_ENDED', { payload: { round: st.roundIndex, team, solved } }),
  ];
  const messages = [
    solved
      ? `${teamName(team)} solved it: +${points}.`
      : `The prompt was ${word}.`,
  ];
  const scores = scoreRows(st, team, points);

  const dl = transition(from, TABLE, REVEAL, ctx.now, D.turnReveal);
  return go(state, {
    phase: dl.phase,
    phaseId: dl.phaseId,
    phaseEndsAt: dl.phaseEndsAt,
    events,
    systemMessages: messages,
    scores,
  });
}

export const charadesEngine: GameEngine = {
  id: 'charades',
  initialPhase: PERFORM,

  initialize(ctx: InitCtx & { rng: () => number }): EngineInit {
    const entries = wordsForTheme(ctx.theme, ctx.difficulty);
    if (entries.length === 0) throw new Error(`NO_CONTENT: no words for ${ctx.theme}`);
    const teams: Record<TeamKey, string[]> = { a: [], b: [] };
    for (const p of ctx.players) {
      if (p.teamId === 'a' || p.teamId === 'b') teams[p.teamId].push(p.id);
    }
    if (teams.a.length === 0 || teams.b.length === 0) {
      throw new Error('NO_CONTENT: charades requires two teams');
    }

    const skipsAllowed = (ctx.config.skips as number) ?? 1;
    const rounds: { turns: [PerformTurn, PerformTurn] }[] = [];
    const usedWords = new Set<string>();
    const pickEntry = () => {
      const fresh = entries.filter((e) => !usedWords.has(e.word));
      const pool = fresh.length > 0 ? fresh : entries;
      const entry = pick(pool, ctx.rng);
      usedWords.add(entry.word);
      return entry;
    };
    for (let r = 0; r < ctx.totalRounds; r++) {
      const firstTeam: TeamKey = r % 2 === 0 ? 'a' : 'b';
      const secondTeam: TeamKey = firstTeam === 'a' ? 'b' : 'a';
      const makeTurn = (team: TeamKey): PerformTurn => {
        const pool: string[] = [pickEntry().word];
        for (let i = 0; i < skipsAllowed; i++) pool.push(pickEntry().word);
        return {
          pool,
          team,
          performerId: teams[team][r % teams[team].length] as string,
        };
      };
      rounds.push({ turns: [makeTurn(firstTeam), makeTurn(secondTeam)] });
    }

    const firstTurn = (rounds[0] as { turns: [PerformTurn, PerformTurn] }).turns[0];
    const pub: Record<string, unknown> = {
      totalScores: {},
      teamTotals: { a: 0, b: 0 },
      history: [],
      scoresThisRound: null,
      performerId: null,
      activeTeam: null,
      word: null,
      guessFeed: [],
      turnOver: null,
    };
    const state: CharadesState = {
      order: ctx.players.map((p) => p.id),
      teams,
      teamIds: ctx.teamIds,
      roundIndex: 0,
      turnInRound: 0,
      totalRounds: ctx.totalRounds,
      performanceSeconds: (ctx.config.performanceSeconds as number) ?? 90,
      skipsAllowed,
      rounds,
      current: {
        turn: firstTurn,
        wordIndex: 0,
        skipsUsed: 0,
        solved: false,
        solvedBy: null,
        guessFeed: [],
        lastGuessAt: {},
        roundPoints: { a: 0, b: 0 },
      },
      teamTotals: { a: 0, b: 0 },
      history: [],
      finished: false,
      pub,
    };
    const begun = beginTurn(state, ctx.players, firstTurn);

    return {
      state: self(state),
      publicState: pub,
      views: begun.views,
      phase: PERFORM,
      phaseEndsAt: ctx.now + state.performanceSeconds * 1000,
      events: [ev('GAME_STARTED', { payload: { game: 'charades' } }), ...begun.events],
      systemMessages: ['Round 1 starts.', ...begun.systemMessages],
    };
  },

  handleAction(
    state: Record<string, unknown>,
    action: ActionInput,
    actor: PlayerInfo | null,
    ctx: StepCtx,
  ): ActionResult {
    const st = asState(state);
    const turn = st.current.turn;

    switch (action.type) {
      case 'guess': {
        if (ctx.currentPhase !== PERFORM) return failResult('WRONG_PHASE');
        if (!actor) return failResult('INVALID_ACTION');
        if (actor.id === turn.performerId) return failResult('NOT_YOUR_TURN');
        if (actor.teamId !== turn.team) return failResult('INVALID_ACTION');
        const last = st.current.lastGuessAt[actor.id] ?? 0;
        if (ctx.now - last < 1000) return failResult('RATE_LIMITED');

        const word = String(action.payload.word ?? '').trim().slice(0, STATEMENT_MAX);
        if (!word) return failResult('INVALID_INPUT');
        const match = matchAnswer(word, currentWord(st));
        st.current.lastGuessAt[actor.id] = ctx.now;

        if (match.match) {
          const windowMs = st.performanceSeconds * 1000;
          const ratio = Math.max(
            0,
            Math.min(1, ((ctx.phaseEndsAt ?? ctx.now) - ctx.now) / windowMs),
          );
          const raw =
            S.base +
            Math.round(S.timeWeight * ratio) -
            S.skipPenalty * st.current.skipsUsed;
          const points = Math.max(S.floor, raw);
          st.current.solved = true;
          st.current.solvedBy = actor.id;
          return {
            ok: true,
            transition: endTurn(state, ctx, PERFORM, points, [
              ev('GUESS_CORRECT', { actorId: actor.id, actionId: action.actionId }),
            ]),
          };
        }

        st.current.guessFeed.push({ byId: actor.id, text: word, near: match.confidence === 'near' });
        st.pub.guessFeed = [...st.current.guessFeed];
        return {
          ok: true,
          transition: go(state, {
            phase: PERFORM,
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

      case 'skip': {
        if (ctx.currentPhase !== PERFORM) return failResult('WRONG_PHASE');
        if (!actor || actor.id !== turn.performerId) return failResult('NOT_YOUR_TURN');
        if (st.current.skipsUsed >= st.skipsAllowed) return failResult('INVALID_ACTION');
        st.current.skipsUsed += 1;
        st.current.wordIndex = Math.min(st.current.wordIndex + 1, turn.pool.length - 1);
        st.current.guessFeed = [];
        st.current.lastGuessAt = {};
        st.pub.guessFeed = [];
        // A new prompt deals a fresh view to the performer.
        const views: Record<string, Record<string, unknown>> = {
          [turn.performerId]: { secret: currentWord(st), role: 'performer', team: turn.team },
        };
        const dl = transition(PERFORM, TABLE, PERFORM, ctx.now, st.performanceSeconds);
        return {
          ok: true,
          transition: go(state, {
            phase: dl.phase,
            phaseId: dl.phaseId,
            phaseEndsAt: dl.phaseEndsAt,
            views,
            events: [
              ev('SKIPPED', { actorId: actor.id, actionId: action.actionId, payload: { skips: st.current.skipsUsed } }),
            ],
            systemMessages: [
              `Skipped (${st.current.skipsUsed}/${st.skipsAllowed}). New prompt for the performer.`,
            ],
          }),
        };
      }

      case 'end_turn': {
        if (ctx.currentPhase !== PERFORM) return failResult('WRONG_PHASE');
        if (!actor || actor.id !== turn.performerId) return failResult('NOT_YOUR_TURN');
        return {
          ok: true,
          transition: endTurn(state, ctx, PERFORM, 0, [
            ev('TURN_ENDED', { actorId: actor.id, actionId: action.actionId }),
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
      case PERFORM:
        return endTurn(state, ctx, PERFORM, 0, [
          ev('TURN_ENDED', { actorId: st.current.turn.performerId }),
        ]);

      case REVEAL: {
        if (st.turnInRound === 0) {
          st.turnInRound = 1;
          const round = st.rounds[st.roundIndex];
          if (!round) throw new Error('charades: missing round');
          const extra = beginTurn(st, ctx.players, round.turns[1]);
          const dl = transition(REVEAL, TABLE, PERFORM, ctx.now, st.performanceSeconds);
          return go(state, {
            phase: dl.phase,
            phaseId: dl.phaseId,
            phaseEndsAt: dl.phaseEndsAt,
            events: extra.events,
            systemMessages: extra.systemMessages,
            views: extra.views,
          });
        }
        const dl = transition(REVEAL, TABLE, RESULTS, ctx.now, D.roundResults);
        return go(state, {
          phase: dl.phase,
          phaseId: dl.phaseId,
          phaseEndsAt: dl.phaseEndsAt,
        });
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
        st.turnInRound = 0;
        st.current.roundPoints = { a: 0, b: 0 };
        st.pub.scoresThisRound = null;
        const round = st.rounds[st.roundIndex];
        if (!round) throw new Error('charades: missing round');
        const extra = beginTurn(st, ctx.players, round.turns[0]);
        const dl = transition(RESULTS, TABLE, PERFORM, ctx.now, st.performanceSeconds);
        return go(state, {
          phase: dl.phase,
          phaseId: dl.phaseId,
          phaseEndsAt: dl.phaseEndsAt,
          events: [...extra.events, ev('ROUND_STARTED', { payload: { round: st.roundIndex } })],
          systemMessages: [
            `Round ${st.roundIndex + 1} of ${st.totalRounds}.`,
            ...extra.systemMessages,
          ],
          views: extra.views,
        });
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
    if (ctx.currentPhase === PERFORM && actor && actor.id === st.current.turn.performerId) {
      // The performer cannot chat during the turn, so the prompt cannot leak.
      return { ok: false, code: 'INVALID_ACTION' };
    }
    return { ok: true, kind: 'chat' };
  },
};
