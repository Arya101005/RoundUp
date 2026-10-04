/**
 * Auction engine (Section 10.6): live bidding with anti-snipe extensions,
 * public budgets, hidden reference values revealed only at REVEAL.
 * Values are scaled at initialize so the pool totals ~1.6x one budget.
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
import { addTotals, ev, failResult, shuffle, tr } from '../../engine/helpers.ts';
import { auctionLots } from '../../content/seed.ts';
import { randomUUID } from '../../std/uuid.ts';

const INTRO = 'item_intro';
const BIDDING = 'bidding';
const REVEAL = 'reveal';
const RESULTS = 'round_results';

const TABLE: Record<string, readonly string[]> = {
  [INTRO]: [BIDDING],
  [BIDDING]: [BIDDING, INTRO, REVEAL],
  [REVEAL]: [RESULTS],
  [RESULTS]: [INTRO],
};

const INTRO_S = 3;
const REVEAL_S = 10;
const RESULTS_S = 10;
const EXTENSION_MS = 5_000;
const MAX_EXTENSIONS = 10;

export const auctionScoring = {
  /** acquired_value * 0.05 * (distinctCategoriesWon - 1), min 0. */
  setBonusRate: 0.05,
  /** Reference pool target: ~1.6x one player's budget (scarcity). */
  scarcityRatio: 1.6,
} as const;

interface AuctionItem {
  name: string;
  value: number;
  startingBid: number;
}

interface AuctionRound {
  items: AuctionItem[];
}

interface AuctionState {
  order: string[];
  roundIndex: number;
  totalRounds: number;
  startingBudget: number;
  auctionSeconds: number;
  minIncrement: number;
  rounds: AuctionRound[];
  current: {
    itemIndex: number;
    high: { bidderId: string; amount: number } | null;
    extensions: number;
    spent: Record<string, number>;
    wonItems: Record<string, { name: string; value: number }[]>;
    sold: { name: string; winnerId: string | null; amount: number }[];
    scoresThisRound: Record<string, number> | null;
  };
  finished: boolean;
  pub: Record<string, unknown>;
}

function asState(state: Record<string, unknown>): AuctionState {
  return state as unknown as AuctionState;
}

function activeRound(st: AuctionState): AuctionRound {
  const round = st.rounds[Math.min(st.roundIndex, st.rounds.length - 1)];
  if (!round) throw new Error('auction: no round setup');
  return round;
}

function activeItem(st: AuctionState): AuctionItem | null {
  return activeRound(st).items[st.current.itemIndex] ?? null;
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

function budgetsOf(st: AuctionState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of st.order) {
    out[id] = st.startingBudget - (st.current.spent[id] ?? 0);
  }
  return out;
}

function refreshBidState(st: AuctionState): void {
  const item = activeItem(st);
  st.pub.high = st.current.high;
  st.pub.minNextBid = item
    ? st.current.high
      ? st.current.high.amount + st.minIncrement
      : item.startingBid
    : null;
  st.pub.budgets = budgetsOf(st);
}

/** Sell the current item at expiry, then advance to the next intro or REVEAL. */
function sellOrReveal(
  state: Record<string, unknown>,
  ctx: StepCtx,
): Transition {
  const st = asState(state);
  const round = activeRound(st);
  const item = round.items[st.current.itemIndex];
  const messages: string[] = [];
  const events: ReturnType<typeof ev>[] = [];
  const systemMessagesAll = messages;

  if (item) {
    const high = st.current.high;
    if (high) {
      st.current.spent[high.bidderId] = (st.current.spent[high.bidderId] ?? 0) + high.amount;
      const won = st.current.wonItems[high.bidderId] ?? [];
      won.push({ name: item.name, value: item.value });
      st.current.wonItems[high.bidderId] = won;
      st.current.sold.push({ name: item.name, winnerId: high.bidderId, amount: high.amount });
      const winnerName = ctx.players.find((p) => p.id === high.bidderId)?.name ?? 'A player';
      messages.push(`${winnerName} won ${item.name} for ${high.amount}.`);
      events.push(
        ev('ITEM_SOLD', {
          actorId: high.bidderId,
          payload: { amount: high.amount, item: item.name },
        }),
      );
    } else {
      st.current.sold.push({ name: item.name, winnerId: null, amount: 0 });
      messages.push(`${item.name} received no bids.`);
      events.push(ev('ITEM_SOLD', { payload: { item: item.name } }));
    }
    st.pub.sold = [...st.current.sold];
    st.pub.budgets = budgetsOf(st);
  }

  st.current.itemIndex += 1;
  st.current.high = null;
  st.current.extensions = 0;

  if (st.current.itemIndex < round.items.length) {
    const next = round.items[st.current.itemIndex] as AuctionItem;
    const dl = transition(BIDDING, TABLE, INTRO, ctx.now, INTRO_S);
    st.pub.item = { name: next.name };
    st.pub.itemIndex = st.current.itemIndex;
    refreshBidState(st);
    return go(state, {
      phase: dl.phase,
      phaseId: dl.phaseId,
      phaseEndsAt: dl.phaseEndsAt,
      events,
      systemMessages: messages,
    });
  }

  // Last item sold: score the round and reveal hidden values.
  const acquired: Record<string, number> = {};
  for (const id of st.order) {
    acquired[id] = (st.current.wonItems[id] ?? []).reduce((sum, i) => sum + i.value, 0);
  }
  const deltas: Record<string, number> = {};
  for (const id of st.order) {
    const wonList = st.current.wonItems[id] ?? [];
    const categories = new Set(wonList.map((i) => i.name)); // seed lots have one category
    const roundValue =
      Math.round((acquired[id] ?? 0) + (auctionScoring.setBonusRate * (categories.size - 1)) * (acquired[id] ?? 0));
    deltas[id] = roundValue + st.startingBudget;
  }
  st.current.scoresThisRound = deltas;
  st.pub.scoresThisRound = deltas;
  st.pub.spent = deltas;
  st.pub.acquired = acquired;
  st.pub.revealed = round.items.map((item) => {
    const winner = st.current.sold.find((s) => s.name === item.name)?.winnerId ?? null;
    return { name: item.name, value: item.value, winnerId: winner };
  });
  st.pub.item = null;
  st.pub.totalScores = addTotals(
    (st.pub.totalScores as Record<string, number>) ?? {},
    deltas,
  );
  systemMessagesAll.push('Reference values revealed.');

  const dl = transition(BIDDING, TABLE, REVEAL, ctx.now, REVEAL_S);
  return go(state, {
    phase: dl.phase,
    phaseId: dl.phaseId,
    phaseEndsAt: dl.phaseEndsAt,
    events: [...events, ev('AUCTION_ENDED'), ev('ROUND_ENDED', { payload: { round: st.roundIndex } })],
    systemMessages: systemMessagesAll,
  });
}

function nextRound(state: Record<string, unknown>, ctx: StepCtx): Transition {
  const st = asState(state);
  st.roundIndex += 1;
  const round = activeRound(st);
  st.current = {
    itemIndex: 0,
    high: null,
    extensions: 0,
    spent: {},
    wonItems: {},
    sold: [],
    scoresThisRound: null,
  };
  const first = round.items[0] as AuctionItem;
  st.pub.item = { name: first.name };
  st.pub.itemIndex = 0;
  st.pub.high = null;
  st.pub.sold = [];
  st.pub.revealed = null;
  st.pub.scoresThisRound = null;
  st.pub.spent = null;
  st.pub.acquired = null;
  st.pub.totalScores = st.pub.totalScores ?? {};
  refreshBidState(st);

  const dl = transition(RESULTS, TABLE, INTRO, ctx.now, INTRO_S);
  return go(state, {
    phase: dl.phase,
    phaseId: dl.phaseId,
    phaseEndsAt: dl.phaseEndsAt,
    events: [ev('ROUND_STARTED', { payload: { round: st.roundIndex } })],
    systemMessages: [`Round ${st.roundIndex + 1} of ${st.totalRounds}. New auction.`],
  });
}

export const auctionEngine: GameEngine = {
  id: 'auction',
  initialPhase: INTRO,

  initialize(ctx: InitCtx & { rng: () => number }): EngineInit {
    const pool = auctionLots(ctx.theme);
    if (pool.length === 0) throw new Error(`NO_CONTENT: no auction items for ${ctx.theme}`);
    const startingBudget = (ctx.config.startingBudget as number) ?? 1000;
    const configured = (ctx.config.itemCount as number) ?? 8;
    const itemCount = Math.max(1, Math.min(configured, pool.length));
    const minIncrement = (ctx.config.minIncrement as number) ?? 10;

    const rounds: AuctionRound[] = [];
    for (let r = 0; r < ctx.totalRounds; r++) {
      const sample = shuffle(pool, ctx.rng).slice(0, itemCount);
      const rawTotal = sample.reduce((sum, i) => sum + i.value, 0);
      const scale =
        rawTotal > 0 ? (auctionScoring.scarcityRatio * startingBudget) / rawTotal : 1;
      const items: AuctionItem[] = sample.map((i) => {
        const value = Math.max(1, Math.round(i.value * scale));
        const startingBid = Math.max(10, Math.round((value * 0.1) / 10) * 10);
        return { name: i.name, value, startingBid };
      });
      rounds.push({ items });
    }

    const budgets: Record<string, number> = {};
    for (const p of ctx.players) budgets[p.id] = startingBudget;
    const first = (rounds[0] as AuctionRound).items[0] as AuctionItem;

    const pub: Record<string, unknown> = {
      totalScores: {},
      budgets,
      itemIndex: 0,
      item: { name: first.name },
      high: null,
      minNextBid: first.startingBid,
      sold: [],
      revealed: null,
      scoresThisRound: null,
      spent: null,
      acquired: null,
    };
    const state: AuctionState = {
      order: ctx.players.map((p) => p.id),
      roundIndex: 0,
      totalRounds: ctx.totalRounds,
      startingBudget,
      auctionSeconds: (ctx.config.auctionSeconds as number) ?? 20,
      minIncrement,
      rounds,
      current: {
        itemIndex: 0,
        high: null,
        extensions: 0,
        spent: {},
        wonItems: {},
        sold: [],
        scoresThisRound: null,
      },
      finished: false,
      pub,
    };

    return {
      state: state as unknown as Record<string, unknown>,
      publicState: pub,
      views: {},
      phase: INTRO,
      phaseEndsAt: ctx.now + INTRO_S * 1000,
      events: [
        ev('GAME_STARTED', { payload: { game: 'auction' } }),
        ev('ROUND_STARTED', { payload: { round: 0 } }),
      ],
      systemMessages: [`Auction starts with ${itemCount} items. Budget: ${startingBudget}.`],
    };
  },

  handleAction(
    state: Record<string, unknown>,
    action: ActionInput,
    actor: PlayerInfo | null,
    ctx: StepCtx,
  ): ActionResult {
    const st = asState(state);
    if (action.type !== 'bid') return failResult('INVALID_ACTION');
    if (ctx.currentPhase !== BIDDING) return failResult('BIDDING_ENDED');
    if (!actor || !st.order.includes(actor.id)) return failResult('NOT_IN_ROOM');

    const item = activeItem(st);
    if (!item) return failResult('BIDDING_ENDED');

    const amount = Number(action.payload.amount);
    if (!Number.isInteger(amount) || amount <= 0) return failResult('INVALID_BID');
    if (st.current.high && st.current.high.bidderId === actor.id) {
      return failResult('ALREADY_HIGHEST_BID');
    }

    const required = st.current.high
      ? st.current.high.amount + st.minIncrement
      : item.startingBid;
    if (amount < required) return failResult('BID_TOO_LOW', { amount: required });

    const remaining = st.startingBudget - (st.current.spent[actor.id] ?? 0);
    if (amount > remaining) return failResult('INSUFFICIENT_BUDGET');

    st.current.high = { bidderId: actor.id, amount };
    st.pub.high = st.current.high;
    st.pub.minNextBid = amount + st.minIncrement;

    const events = [
      ev('BID_SUBMITTED', {
        actorId: actor.id,
        actionId: action.actionId,
        payload: { amount },
      }),
    ];

    // Anti-sniping: a bid in the final 5 s resets the clock (capped).
    let phaseId = ctx.phaseId;
    let phaseEndsAt = ctx.phaseEndsAt;
    const remainingMs = (ctx.phaseEndsAt ?? ctx.now) - ctx.now;
    if (remainingMs < EXTENSION_MS && st.current.extensions < MAX_EXTENSIONS) {
      st.current.extensions += 1;
      phaseEndsAt = ctx.now + EXTENSION_MS;
      const dl = transition(BIDDING, TABLE, BIDDING, ctx.now, null);
      phaseId = dl.phaseId;
      phaseEndsAt = ctx.now + EXTENSION_MS;
    }

    return {
      ok: true,
      transition: go(state, {
        phase: BIDDING,
        phaseId,
        phaseEndsAt,
        events,
      }),
    };
  },

  tick(state: Record<string, unknown>, ctx: StepCtx): Transition | null {
    const st = asState(state);
    if (st.finished) return null;

    switch (ctx.currentPhase) {
      case INTRO: {
        const dl = transition(INTRO, TABLE, BIDDING, ctx.now, st.auctionSeconds);
        return go(state, {
          phase: dl.phase,
          phaseId: dl.phaseId,
          phaseEndsAt: dl.phaseEndsAt,
        });
      }

      case BIDDING:
        return sellOrReveal(state, ctx);

      case REVEAL: {
        const dl = transition(REVEAL, TABLE, RESULTS, ctx.now, RESULTS_S);
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
