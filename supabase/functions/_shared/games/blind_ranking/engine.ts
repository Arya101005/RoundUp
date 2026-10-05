/**
 * Blind Ranking engine (Section 10.5). Items arrive one at a time; every
 * player places each item into their ranking before the per-item timer. The
 * reference values and every player's placement stay server-side until REVEAL.
 */
import type {
  ActionInput,
  ActionResult,
  EngineInit,
  GameEngine,
  InitCtx,
  PlayerInfo,
  StepCtx,
  Transition,
} from '../../engine/types.ts';
import { transition } from '../../engine/machine.ts';
import { ev, failResult, pick, shuffle, tr } from '../../engine/helpers.ts';
import { getTheme } from '../../config/themes.ts';
import { rankingFor } from '../../content/seed.ts';
import { randomUUID } from '../../std/uuid.ts';
import { blindRankingDurations as D, rankMetrics } from './scoring.ts';

const INTRO = 'round_intro';
const PLACING = 'placing';
const REVEAL = 'reveal';
const RESULTS = 'round_results';

const TABLE: Record<string, readonly string[]> = {
  [INTRO]: [PLACING],
  // Self-loop: each new item restarts the PLACING deadline with a fresh id.
  [PLACING]: [PLACING, REVEAL],
  [REVEAL]: [RESULTS],
  [RESULTS]: [INTRO],
};

interface RoundSetup {
  criterionId: string;
  criterionLabel: string;
  metricLabel: string;
  direction: 'asc' | 'desc';
  items: string[]; // presentation order (shuffled)
  reference: string[]; // best-first subset order
}

interface RankingState {
  order: string[];
  roundIndex: number;
  totalRounds: number;
  rankingSize: number;
  perItemSeconds: number;
  rounds: RoundSetup[];
  current: {
    itemIndex: number;
    placed: Record<string, string[]>;
    placedCount: Record<string, number>;
    timeouts: Record<string, number>;
  };
  finished: boolean;
  pub: Record<string, unknown>;
}

function asState(state: Record<string, unknown>): RankingState {
  return state as unknown as RankingState;
}

function activeSetup(st: RankingState): RoundSetup {
  const setup = st.rounds[Math.min(st.roundIndex, st.rounds.length - 1)];
  if (!setup) throw new Error('blind ranking: no round setup');
  return setup;
}

function go(
  state: Record<string, unknown>,
  input: {
    phase: string;
    phaseId: string;
    phaseEndsAt: number | null;
    events?: ReturnType<typeof ev>[];
    systemMessages?: string[];
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
    status: input.status,
  });
}

function allPlaced(st: RankingState, players: PlayerInfo[]): boolean {
  const inGame = new Set(st.order);
  return players
    .filter((p) => inGame.has(p.id))
    .every((p) => (st.current.placed[p.id]?.length ?? 0) > st.current.itemIndex);
}

function currentItem(st: RankingState): string | null {
  const setup = activeSetup(st);
  return setup.items[st.current.itemIndex] ?? null;
}

/** Advance to the next item, or to REVEAL when the last item is placed. */
function advanceItem(
  state: Record<string, unknown>,
  ctx: StepCtx,
  extraEvents: ReturnType<typeof ev>[] = [],
): Transition {
  const st = asState(state);
  const setup = activeSetup(st);
  st.current.itemIndex += 1;

  if (st.current.itemIndex >= setup.items.length) {
    return reveal(state, ctx, extraEvents);
  }

  st.pub.item = setup.items[st.current.itemIndex] ?? null;
  st.pub.itemsShown = st.current.itemIndex + 1;
  st.pub.placedCounts = { ...st.current.placedCount };
  const dl = transition(PLACING, TABLE, PLACING, ctx.now, st.perItemSeconds);
  return go(state, {
    phase: PLACING,
    // Fresh id per item: ticks and actions for the old item no-op.
    phaseId: dl.phaseId,
    phaseEndsAt: dl.phaseEndsAt,
    events: [...extraEvents],
  });
}

function reveal(
  state: Record<string, unknown>,
  ctx: StepCtx,
  extraEvents: ReturnType<typeof ev>[] = [],
): Transition {
  const st = asState(state);
  const setup = activeSetup(st);
  const metrics: Record<string, ReturnType<typeof rankMetrics>> = {};
  const scores: Record<string, number> = {};
  const inGame = new Set(st.order);
  for (const p of ctx.players) {
    if (!inGame.has(p.id)) continue;
    const playerOrder = st.current.placed[p.id] ?? [];
    const m = rankMetrics(playerOrder, setup.reference);
    metrics[p.id] = m;
    scores[p.id] = m.score;
  }

  st.pub.rankings = { ...st.current.placed };
  st.pub.reference = [...setup.reference];
  st.pub.metrics = Object.fromEntries(
    Object.entries(metrics).map(([id, m]) => [
      id,
      { position: m.position, spearman: m.spearman, kendall: m.kendall, exact: m.exact, topK: m.topK },
    ]),
  );
  st.pub.scoresThisRound = scores;
  st.pub.item = null;

  const dl = transition(PLACING, TABLE, REVEAL, ctx.now, D.reveal);
  return go(state, {
    phase: dl.phase,
    phaseId: dl.phaseId,
    phaseEndsAt: dl.phaseEndsAt,
    events: [...extraEvents, ev('ROUND_ENDED', { payload: { round: st.roundIndex } })],
  });
}

function scoreRound(st: RankingState): void {
  const scores = (st.pub.scoresThisRound as Record<string, number>) ?? {};
  const total = (st.pub.totalScores as Record<string, number>) ?? {};
  for (const [userId, points] of Object.entries(scores)) {
    total[userId] = (total[userId] ?? 0) + points;
  }
  st.pub.totalScores = total;
}

function nextRound(state: Record<string, unknown>, ctx: StepCtx): Transition {
  const st = asState(state);
  // Scoring already happened on the REVEAL -> RESULTS tick (see `tick`).
  // Adding it here counted every round except the last one twice.
  st.roundIndex += 1;
  const setup = activeSetup(st);
  st.current = {
    itemIndex: 0,
    placed: Object.fromEntries(st.order.map((id) => [id, []])),
    placedCount: Object.fromEntries(st.order.map((id) => [id, 0])),
    timeouts: Object.fromEntries(st.order.map((id) => [id, 0])),
  };
  st.pub.item = setup.items[0] ?? null;
  st.pub.itemsShown = 1;
  st.pub.placedCounts = { ...st.current.placedCount };
  st.pub.rankings = null;
  st.pub.reference = null;
  st.pub.metrics = null;
  st.pub.scoresThisRound = null;
  st.pub.criterion = {
    label: setup.criterionLabel,
    metricLabel: setup.metricLabel,
    direction: setup.direction,
  };

  const dl = transition(RESULTS, TABLE, INTRO, ctx.now, D.roundIntro);
  return go(state, {
    phase: dl.phase,
    phaseId: dl.phaseId,
    phaseEndsAt: dl.phaseEndsAt,
    events: [ev('ROUND_STARTED', { payload: { round: st.roundIndex } })],
    systemMessages: [`Round ${st.roundIndex + 1} of ${st.totalRounds}.`],
  });
}

function finishRoundResults(state: Record<string, unknown>): Transition {
  const st = asState(state);
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

export const blindRankingEngine: GameEngine = {
  id: 'blind_ranking',
  initialPhase: INTRO,

  initialize(ctx: InitCtx & { rng: () => number }): EngineInit {
    const theme = getTheme(ctx.theme);
    if (!theme) throw new Error(`NO_CONTENT: unknown theme ${ctx.theme}`);
    const rounds: RoundSetup[] = [];
    const used = new Set<string>();
    for (let r = 0; r < ctx.totalRounds; r++) {
      const available = theme.rankingCriteria.filter(
        (c) => rankingFor(ctx.theme, c.id).length >= 2,
      );
      if (available.length === 0) throw new Error(`NO_CONTENT: no rankings for ${ctx.theme}`);
      // Prefer a criterion not used yet this session.
      const fresh = available.filter((c) => !used.has(c.id));
      const criterion = pick(fresh.length > 0 ? fresh : available, ctx.rng);
      used.add(criterion.id);
      const full = rankingFor(ctx.theme, criterion.id);
      const size = Math.min((ctx.config.rankingSize as number) ?? 5, full.length);
      const subset = shuffle(full, ctx.rng).slice(0, size);
      const subsetSet = new Set(subset);
      const reference = full.filter((item) => subsetSet.has(item));
      rounds.push({
        criterionId: criterion.id,
        criterionLabel: criterion.label,
        metricLabel: criterion.metricLabel,
        direction: criterion.direction,
        items: shuffle(subset, ctx.rng),
        reference,
      });
    }

    const first = rounds[0] as RoundSetup;
    const pub: Record<string, unknown> = {
      totalScores: {},
      criterion: {
        label: first.criterionLabel,
        metricLabel: first.metricLabel,
        direction: first.direction,
      },
      item: first.items[0] ?? null,
      itemsShown: 1,
      placedCounts: Object.fromEntries(ctx.players.map((p) => [p.id, 0])),
      rankings: null,
      reference: null,
      metrics: null,
      scoresThisRound: null,
    };
    const state: RankingState = {
      order: ctx.players.map((p) => p.id),
      roundIndex: 0,
      totalRounds: ctx.totalRounds,
      rankingSize: (ctx.config.rankingSize as number) ?? 5,
      perItemSeconds: (ctx.config.perItemSeconds as number) ?? 20,
      rounds,
      current: {
        itemIndex: 0,
        placed: Object.fromEntries(ctx.players.map((p) => [p.id, []])),
        placedCount: Object.fromEntries(ctx.players.map((p) => [p.id, 0])),
        timeouts: Object.fromEntries(ctx.players.map((p) => [p.id, 0])),
      },
      finished: false,
      pub,
    };

    return {
      state: state as unknown as Record<string, unknown>,
      publicState: pub,
      views: {},
      phase: INTRO,
      phaseEndsAt: ctx.now + D.roundIntro * 1000,
      events: [
        ev('GAME_STARTED', { payload: { game: 'blind_ranking' } }),
        ev('ROUND_STARTED', { payload: { round: 0 } }),
      ],
      systemMessages: [`Criterion: ${first.criterionLabel}`],
    };
  },

  handleAction(
    state: Record<string, unknown>,
    action: ActionInput,
    actor: PlayerInfo | null,
    ctx: StepCtx,
  ): ActionResult {
    const st = asState(state);
    if (action.type !== 'place') return failResult('INVALID_ACTION');
    if (ctx.currentPhase !== PLACING) return failResult('WRONG_PHASE');
    if (!actor) return failResult('INVALID_ACTION');

    const item = currentItem(st);
    const requested = String(action.payload.item ?? '');
    if (!item || requested !== item) return failResult('INVALID_ACTION');
    if ((st.current.placed[actor.id]?.length ?? 0) > st.current.itemIndex) {
      return failResult('INVALID_ACTION'); // already placed this item
    }

    const list = st.current.placed[actor.id] ?? [];
    const position = Number(action.payload.position);
    if (!Number.isInteger(position) || position < 0 || position > list.length) {
      return failResult('INVALID_ACTION');
    }
    // Atomic placement: the item lands *in the chosen slot* and everything below
    // it shifts one rank down. It is an insert into the list, never a reorder
    // of the whole ranking, so a refresh keeps the spot the player picked.
    const next = [...list];
    next.splice(position, 0, item);
    const placedNow = next.filter((x): x is string => typeof x === 'string');
    st.current.placed[actor.id] = placedNow;
    st.current.placedCount[actor.id] = placedNow.length;
    st.pub.placedCounts = { ...st.current.placedCount };

    const events = [ev('ITEM_PLACED', { actorId: actor.id, actionId: action.actionId })];
    if (allPlaced(st, ctx.players)) {
      return { ok: true, transition: advanceItem(state, ctx, events) };
    }
    return {
      ok: true,
      transition: go(state, {
        phase: PLACING,
        phaseId: ctx.phaseId,
        phaseEndsAt: ctx.phaseEndsAt,
        events,
      }),
    };
  },

  tick(state: Record<string, unknown>, ctx: StepCtx): Transition | null {
    const st = asState(state);
    if (st.finished) return null;

    switch (ctx.currentPhase) {
      case INTRO: {
        const dl = transition(INTRO, TABLE, PLACING, ctx.now, st.perItemSeconds);
        st.pub.item = currentItem(st);
        st.pub.itemsShown = st.current.itemIndex + 1;
        return go(state, {
          phase: dl.phase,
          phaseId: dl.phaseId,
          phaseEndsAt: dl.phaseEndsAt,
        });
      }

      case PLACING: {
        // Time out: auto-place the current item at the end for absent players.
        const item = currentItem(st);
        if (item) {
          const inGame = new Set(st.order);
          for (const p of ctx.players) {
            if (!inGame.has(p.id)) continue;
            const list = st.current.placed[p.id] ?? [];
            if (list.length <= st.current.itemIndex) {
              list.push(item);
              st.current.placed[p.id] = list;
              st.current.placedCount[p.id] = list.length;
              st.current.timeouts[p.id] = (st.current.timeouts[p.id] ?? 0) + 1;
            }
          }
        }
        return advanceItem(state, ctx, []);
      }

      case REVEAL: {
        scoreRound(st);
        const dl = transition(REVEAL, TABLE, RESULTS, ctx.now, D.roundResults);
        return go(state, {
          phase: dl.phase,
          phaseId: dl.phaseId,
          phaseEndsAt: dl.phaseEndsAt,
        });
      }

      case RESULTS: {
        if (st.roundIndex + 1 >= st.totalRounds) return finishRoundResults(state);
        return nextRound(state, ctx);
      }

      default:
        return null;
    }
  },

  isFinished(state: Record<string, unknown>): boolean {
    return asState(state).finished;
  },
};
