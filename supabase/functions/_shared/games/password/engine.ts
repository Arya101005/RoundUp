/**
 * Password engine (Section 10.3): each round plays two word turns (teams
 * alternate who starts). A word runs an exchange loop — clue, guesses, next
 * clue — up to maxClues. The secret is visible only to the active clue giver
 * until the word ends.
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
import { categoryWords, wordsForTheme } from '../../content/seed.ts';
import { matchAnswer } from '../../content/matcher.ts';
import { validateClue } from '../../content/clue.ts';
import { STATEMENT_MAX } from '../../validation/sanitize.ts';
import { randomUUID } from '../../std/uuid.ts';
import { attemptPointsFor, passwordDurations as D, passwordScoring } from './scoring.ts';

const CLUE = 'clue';
const GUESS = 'guess';
const RESULTS = 'round_results';

const TABLE: Record<string, readonly string[]> = {
  [CLUE]: [CLUE, GUESS, RESULTS],
  [GUESS]: [CLUE, RESULTS],
  [RESULTS]: [CLUE],
};

type TeamKey = 'a' | 'b';

interface WordTurn {
  word: string;
  category: string;
  team: TeamKey;
  giverId: string;
}

interface ClueRecord {
  text: string;
  byId: string;
}

interface PasswordState {
  order: string[];
  teams: Record<TeamKey, string[]>;
  teamIds: Record<TeamKey, string> | null;
  themeId: string;
  difficulty: string;
  roundIndex: number;
  turnInRound: number;
  totalRounds: number;
  clueSeconds: number;
  guessSeconds: number;
  maxClues: number;
  rounds: { turns: [WordTurn, WordTurn] }[];
  current: {
    wordTurn: WordTurn;
    clues: ClueRecord[];
    stalls: number;
    solved: boolean;
    points: number;
    solvedBy: string | null;
    guessersDone: Record<string, boolean>;
    guessFeed: { byId: string; text: string; near: boolean }[];
    roundPoints: Record<TeamKey, number>;
  };
  teamTotals: Record<TeamKey, number>;
  history: {
    round: number;
    word: string;
    team: TeamKey;
    giverId: string;
    solved: boolean;
    points: number;
  }[];
  finished: boolean;
  pub: Record<string, unknown>;
}

const CLUE_REJECTION_CODE: Record<string, string> = {
  empty: 'CLUE_NOT_ONE_WORD',
  multi_word: 'CLUE_NOT_ONE_WORD',
  is_secret: 'CLUE_TOO_CLOSE',
  too_close: 'CLUE_TOO_CLOSE',
  duplicate: 'CLUE_DUPLICATE',
  forbidden: 'CLUE_FORBIDDEN',
};

function asState(state: Record<string, unknown>): PasswordState {
  return state as unknown as PasswordState;
}

function self(st: PasswordState): Record<string, unknown> {
  return st as unknown as Record<string, unknown>;
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

/**
 * Points the current word at a new clue window: resets the exchange loop,
 * publishes the giver, and deals private views. Returns side outputs the
 * caller merges into its transition.
 */
function beginWord(
  st: PasswordState,
  now: number,
  players: PlayerInfo[],
  turn: WordTurn,
): {
  views: Record<string, Record<string, unknown>>;
  systemMessages: string[];
  events: GameEventRow[];
} {
  st.current.wordTurn = turn;
  st.current.clues = [];
  st.current.stalls = 0;
  st.current.solved = false;
  st.current.points = 0;
  st.current.solvedBy = null;
  st.current.guessersDone = {};
  st.current.guessFeed = [];
  st.pub.word = null;
  st.pub.category = null;
  st.pub.giverId = turn.giverId;
  st.pub.activeTeam = turn.team;
  st.pub.clues = [];
  st.pub.guessFeed = [];
  st.pub.wordOver = null;
  void now;

  const views: Record<string, Record<string, unknown>> = {};
  for (const p of players) {
    if (p.id === turn.giverId) {
      views[p.id] = { secret: turn.word, role: 'giver', team: turn.team };
    } else {
      views[p.id] = {
        secret: null,
        role: p.teamId === turn.team ? 'guesser' : 'spectator',
        team: p.teamId,
      };
    }
  }

  const giverName = players.find((p) => p.id === turn.giverId)?.name ?? 'someone';
  const teamName = turn.team === 'a' ? 'Team A' : 'Team B';
  return {
    views,
    systemMessages: [`${teamName}: ${giverName} is the clue giver.`],
    events: [ev('TURN_STARTED', { actorId: turn.giverId })],
  };
}

function teamName(key: TeamKey): string {
  return key === 'a' ? 'Team A' : 'Team B';
}

function scoreRows(st: PasswordState, team: TeamKey, points: number): Transition['scores'] {
  if (points <= 0) return [];
  return [
    {
      round_index: st.roundIndex,
      user_id: null,
      team_id: st.teamIds ? st.teamIds[team] : null,
      points,
      breakdown: { team, cluesUsed: st.current.clues.length },
    },
  ];
}

/**
 * The word is over (solved or exhausted): reveal it, credit the team, then
 * open the other team's word or fall into round results.
 */
function endWord(
  state: Record<string, unknown>,
  ctx: StepCtx,
  from: string,
  solved: boolean,
  extraEvents: GameEventRow[] = [],
): Transition {
  const st = asState(state);
  const turn = st.current.wordTurn;
  const points = solved ? st.current.points : 0;

  st.history.push({
    round: st.roundIndex,
    word: turn.word,
    team: turn.team,
    giverId: turn.giverId,
    solved,
    points,
  });
  st.current.roundPoints[turn.team] += points;
  if (points > 0) st.teamTotals[turn.team] += points;
  st.pub.teamTotals = { ...st.teamTotals };
  const totals = (st.pub.totalScores as Record<string, number>) ?? {};
  for (const userId of st.teams[turn.team]) {
    totals[userId] = st.teamTotals[turn.team];
  }
  st.pub.totalScores = totals;
  st.pub.history = [...st.history];
  st.pub.word = turn.word;
  st.pub.category = turn.category;
  st.pub.wordOver = { solved, points, team: turn.team, solvedBy: st.current.solvedBy };
  st.pub.scoresThisRound = { ...st.current.roundPoints };

  const events: GameEventRow[] = [
    ...extraEvents,
    ev('ROUND_ENDED', { payload: { round: st.roundIndex, team: turn.team, solved } }),
  ];
  const messages = [
    solved
      ? `Solved with clue ${st.current.clues.length}: +${points} for ${teamName(turn.team)}.`
      : `No solve — the word was ${turn.word}.`,
  ];
  const scores = scoreRows(st, turn.team, points);

  if (st.turnInRound === 0) {
    const nextRound = st.rounds[st.roundIndex];
    if (!nextRound) throw new Error('password: missing round');
    st.turnInRound = 1;
    const extra = beginWord(st, ctx.now, ctx.players, nextRound.turns[1]);
    const dl = transition(from, TABLE, CLUE, ctx.now, st.clueSeconds);
    return go(state, {
      phase: dl.phase,
      phaseId: dl.phaseId,
      phaseEndsAt: dl.phaseEndsAt,
      events: [...events, ...extra.events],
      systemMessages: [...messages, ...extra.systemMessages],
      views: extra.views,
      scores,
    });
  }

  const dl = transition(from, TABLE, RESULTS, ctx.now, D.roundResults);
  return go(state, {
    phase: dl.phase,
    phaseId: dl.phaseId,
    phaseEndsAt: dl.phaseEndsAt,
    events,
    systemMessages: messages,
    scores,
  });
}

/**
 * The exchange loop continues: another clue for the same word, unless the
 * clue budget (clues + stalls) is exhausted, which fails the word.
 */
function nextClue(
  state: Record<string, unknown>,
  ctx: StepCtx,
  from: string,
  extraEvents: GameEventRow[] = [],
): Transition {
  const st = asState(state);
  if (st.current.clues.length + st.current.stalls >= st.maxClues) {
    return endWord(state, ctx, from, false, extraEvents);
  }
  st.current.guessersDone = {};
  const dl = transition(from, TABLE, CLUE, ctx.now, st.clueSeconds);
  return go(state, {
    phase: dl.phase,
    phaseId: dl.phaseId,
    phaseEndsAt: dl.phaseEndsAt,
    events: extraEvents,
    systemMessages: ['Another clue, please.'],
  });
}

function beginRound(state: Record<string, unknown>, ctx: StepCtx, from: string): Transition {
  const st = asState(state);
  st.current.roundPoints = { a: 0, b: 0 };
  st.pub.scoresThisRound = null;
  const round = st.rounds[st.roundIndex];
  if (!round) throw new Error('password: missing round');
  const extra = beginWord(st, ctx.now, ctx.players, round.turns[0]);
  const dl = transition(from, TABLE, CLUE, ctx.now, st.clueSeconds);
  return go(state, {
    phase: dl.phase,
    phaseId: dl.phaseId,
    phaseEndsAt: dl.phaseEndsAt,
    events: extra.events,
    systemMessages: extra.systemMessages,
    views: extra.views,
  });
}

function eligibleGuessers(st: PasswordState, ctx: StepCtx): PlayerInfo[] {
  const turn = st.current.wordTurn;
  const inGame = new Set(st.order);
  return ctx.players.filter(
    (p) => inGame.has(p.id) && p.teamId === turn.team && p.id !== turn.giverId,
  );
}

export const passwordEngine: GameEngine = {
  id: 'password',
  initialPhase: CLUE,

  initialize(ctx: InitCtx & { rng: () => number }): EngineInit {
    const entries = wordsForTheme(ctx.theme, ctx.difficulty);
    if (entries.length === 0) throw new Error(`NO_CONTENT: no words for ${ctx.theme}`);
    const teams: Record<TeamKey, string[]> = { a: [], b: [] };
    for (const p of ctx.players) {
      if (p.teamId === 'a' || p.teamId === 'b') teams[p.teamId].push(p.id);
    }
    if (teams.a.length === 0 || teams.b.length === 0) {
      throw new Error('NO_CONTENT: password requires two teams');
    }

    const rounds: { turns: [WordTurn, WordTurn] }[] = [];
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
      const one = pickEntry();
      const two = pickEntry();
      rounds.push({
        turns: [
          {
            word: one.word,
            category: one.category,
            team: firstTeam,
            giverId: teams[firstTeam][r % teams[firstTeam].length] as string,
          },
          {
            word: two.word,
            category: two.category,
            team: secondTeam,
            giverId: teams[secondTeam][r % teams[secondTeam].length] as string,
          },
        ],
      });
    }

    const firstTurn = (rounds[0] as { turns: [WordTurn, WordTurn] }).turns[0];
    const pub: Record<string, unknown> = {
      totalScores: {},
      teamTotals: { a: 0, b: 0 },
      history: [],
      scoresThisRound: null,
      word: null,
      category: null,
      giverId: null,
      activeTeam: null,
      clues: [],
      guessFeed: [],
      wordOver: null,
    };
    const state: PasswordState = {
      order: ctx.players.map((p) => p.id),
      teams,
      teamIds: ctx.teamIds,
      themeId: ctx.theme,
      difficulty: ctx.difficulty,
      roundIndex: 0,
      turnInRound: 0,
      totalRounds: ctx.totalRounds,
      clueSeconds: (ctx.config.clueSeconds as number) ?? 30,
      guessSeconds: (ctx.config.guessSeconds as number) ?? 20,
      maxClues: (ctx.config.maxClues as number) ?? 5,
      rounds,
      current: {
        wordTurn: firstTurn,
        clues: [],
        stalls: 0,
        solved: false,
        points: 0,
        solvedBy: null,
        guessersDone: {},
        guessFeed: [],
        roundPoints: { a: 0, b: 0 },
      },
      teamTotals: { a: 0, b: 0 },
      history: [],
      finished: false,
      pub,
    };
    const begun = beginWord(state, ctx.now, ctx.players, firstTurn);

    return {
      state: self(state),
      publicState: pub,
      views: begun.views,
      phase: CLUE,
      phaseEndsAt: ctx.now + state.clueSeconds * 1000,
      events: [ev('GAME_STARTED', { payload: { game: 'password' } }), ...begun.events],
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
    const turn = st.current.wordTurn;

    switch (action.type) {
      case 'clue': {
        if (ctx.currentPhase !== CLUE) return failResult('WRONG_PHASE');
        if (!actor || actor.id !== turn.giverId) return failResult('NOT_YOUR_TURN');
        const raw = String(action.payload.text ?? '').trim().slice(0, 40);
        const forbidden = categoryWords(st.themeId, turn.category, st.difficulty).filter(
          (w) => w !== turn.word,
        );
        const check = validateClue(
          raw,
          turn.word,
          st.current.clues.map((c) => c.text),
          forbidden,
        );
        if (!check.ok) {
          return failResult(CLUE_REJECTION_CODE[check.reason] ?? 'INVALID_ACTION');
        }
        st.current.clues.push({ text: raw, byId: actor.id });
        st.current.guessersDone = {};
        st.pub.clues = [...st.current.clues];
        const dl = transition(CLUE, TABLE, GUESS, ctx.now, st.guessSeconds);
        return {
          ok: true,
          transition: go(state, {
            phase: dl.phase,
            phaseId: dl.phaseId,
            phaseEndsAt: dl.phaseEndsAt,
            events: [
              ev('CLUE_SUBMITTED', {
                actorId: actor.id,
                actionId: action.actionId,
                payload: { number: st.current.clues.length },
              }),
            ],
          }),
        };
      }

      case 'guess': {
        if (ctx.currentPhase !== GUESS) return failResult('WRONG_PHASE');
        if (!actor) return failResult('INVALID_ACTION');
        if (actor.id === turn.giverId) return failResult('NOT_YOUR_TURN');
        if (actor.teamId !== turn.team) return failResult('INVALID_ACTION');
        if (st.current.guessersDone[actor.id]) return failResult('ALREADY_GUESSED');

        const word = String(action.payload.word ?? '').trim().slice(0, STATEMENT_MAX);
        if (!word) return failResult('INVALID_INPUT');
        const match = matchAnswer(word, turn.word);

        if (match.match) {
          const windowMs = st.guessSeconds * 1000;
          const ratio = Math.max(
            0,
            Math.min(1, ((ctx.phaseEndsAt ?? ctx.now) - ctx.now) / windowMs),
          );
          st.current.points =
            attemptPointsFor(st.current.clues.length) +
            Math.round(passwordScoring.maxTimeBonus * ratio);
          st.current.solved = true;
          st.current.solvedBy = actor.id;
          return {
            ok: true,
            transition: endWord(state, ctx, GUESS, true, [
              ev('GUESS_CORRECT', { actorId: actor.id, actionId: action.actionId }),
            ]),
          };
        }

        st.current.guessersDone[actor.id] = true;
        st.current.guessFeed.push({ byId: actor.id, text: word, near: match.confidence === 'near' });
        st.pub.guessFeed = [...st.current.guessFeed];
        const events = [
          ev('GUESS_SUBMITTED', {
            actorId: actor.id,
            actionId: action.actionId,
            payload: { near: match.confidence === 'near' },
          }),
        ];

        const allDone = eligibleGuessers(st, ctx).every((p) => st.current.guessersDone[p.id]);
        if (allDone) {
          return { ok: true, transition: nextClue(state, ctx, GUESS, events) };
        }
        return {
          ok: true,
          transition: go(state, {
            phase: GUESS,
            phaseId: ctx.phaseId,
            phaseEndsAt: ctx.phaseEndsAt,
            events,
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
      case CLUE: {
        // The giver ran out of time: the clue slot is spent anyway.
        st.current.stalls += 1;
        return nextClue(state, ctx, CLUE, [ev('TURN_ENDED', { actorId: st.current.wordTurn.giverId })]);
      }
      case GUESS:
        return nextClue(state, ctx, GUESS, [ev('TURN_ENDED')]);
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
        return beginRound(state, ctx, RESULTS);
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
    if (ctx.currentPhase === CLUE || ctx.currentPhase === GUESS) {
      const activeTeam = st.pub.activeTeam;
      if (actor && actor.teamId === activeTeam) {
        // The active team's turn is locked to clue/guess actions only.
        return { ok: false, code: 'INVALID_ACTION' };
      }
    }
    return { ok: true, kind: 'chat' };
  },
};
