/**
 * Focused engine tests for the room-flow guarantees the UI depends on:
 *
 * - Imposter: the starting player is chosen at random, turns then run
 *   clockwise, and the round ends after every player has given one clue.
 * - Auction: the bid window is a single hard countdown. A bid never re-arms
 *   it, so a flurry of bids can never push the sale out.
 */
import { describe, expect, it } from 'vitest';
import type { GameEngine, PlayerInfo, Transition } from '@shared/engine/types';
import { imposterEngine } from '@shared/games/imposter/engine';
import { auctionEngine } from '@shared/games/auction/engine';
import { defaultGameConfig } from '@shared/games/configs';

const THEME = 'movies';
const NOW = 1_000_000;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function players(n: number): PlayerInfo[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    teamId: null,
    connected: true,
  }));
}

function startGame(engine: GameEngine, ps: PlayerInfo[], seed: number, config: Record<string, unknown> = {}) {
  const playerList = ps;
  return engine.initialize({
    players: playerList,
    config: { ...defaultGameConfig(engine.id), ...config },
    theme: THEME,
    themeLabel: 'Movies',
    difficulty: 'medium',
    totalRounds: 1,
    now: NOW,
    hostId: playerList[0]?.id ?? '',
    teamIds: null,
    rng: mulberry32(seed),
  });
}

function stepCtx(ps: PlayerInfo[], hostId: string, over: {
  now: number;
  phase: string;
  phaseId: string;
  phaseEndsAt: number | null;
}) {
  return {
    now: over.now,
    players: ps,
    phaseId: over.phaseId,
    currentPhase: over.phase,
    phaseEndsAt: over.phaseEndsAt,
    expired: true,
    hostId,
  };
}

describe('imposter clue round', () => {
  it('picks the starting player at random and runs turns clockwise', () => {
    const ps = players(5);
    const starts = new Set<number>();

    for (let seed = 1; seed <= 12; seed++) {
      const started = startGame(imposterEngine, ps, seed * 7919);
      const st = started.state as unknown as { order: string[]; current: { speakerIndex: number } };
      // The starting seat is whatever the RNG chose, so it must not be pinned
      // to seat 0 across seeds.
      starts.add(st.current.speakerIndex);
      expect(st.current.speakerIndex).toBeGreaterThanOrEqual(0);
      expect(st.current.speakerIndex).toBeLessThan(ps.length);
    }
    expect(starts.size).toBeGreaterThan(1);
  });

  it('gives every seated player exactly one clue before voting', () => {
    const ps = players(4);
    const started = startGame(imposterEngine, ps, 24680);
    const st0 = started.state as unknown as { order: string[] };
    let state = started.state;
    let phase = started.phase;
    let phaseId = 'role-reveal';
    let phaseEndsAt = started.phaseEndsAt;
    let now = NOW;
    // The engine's public state is committed on every transition, so track it
    // alongside the private state: `pub.speakerId` is what the stage renders.
    let pub: Record<string, unknown> = started.publicState;

    const speakOrder: string[] = [];

    for (let guard = 0; guard < 40 && phase !== 'voting'; guard++) {
      // Advance the clock past the role_reveal window to open the clue round.
      if (phase !== 'discussion') {
        now = Math.max(now, phaseEndsAt ?? now);
        const t = imposterEngine.tick(
          state,
          stepCtx(ps, ps[0]?.id ?? '', { now, phase, phaseId, phaseEndsAt }),
        ) as Transition | null;
        if (!t) break;
        state = t.state;
        pub = t.publicState;
        phase = t.phase;
        phaseId = t.phaseId;
        phaseEndsAt = t.phaseEndsAt;
        continue;
      }

      // In the clue round the current speaker ends their own turn. This is the
      // only thing that advances the round, so the loop proves the clue round
      // terminates on its own.
      const speakerId = (pub.speakerId as string | null) ?? null;
      if (!speakerId) break;
      speakOrder.push(speakerId);

      const acted = imposterEngine.handleAction(
        state,
        { type: 'end_turn', payload: {}, actionId: `turn-${speakOrder.length}` },
        ps.find((p) => p.id === speakerId) ?? null,
        {
          now,
          players: ps,
          phaseId,
          currentPhase: phase,
          phaseEndsAt,
          expired: false,
          hostId: ps[0]?.id ?? '',
        },
      );
      expect(acted.ok, `turn ${speakOrder.length}`).toBe(true);
      if (!acted.ok) return;
      const at = acted.transition;
      state = at.state;
      pub = at.publicState;
      phase = at.phase;
      phaseId = at.phaseId;
      phaseEndsAt = at.phaseEndsAt;
    }

    expect(phase).toBe('voting');
    expect(speakOrder).toHaveLength(ps.length);
    expect(new Set(speakOrder).size).toBe(ps.length);

    // Clockwise from the randomly chosen starting seat: every consecutive
    // speaker is the next seat in the join order.
    const seatOf = new Map(st0.order.map((id, i) => [id, i]));
    const startSeat = seatOf.get(speakOrder[0] ?? '') ?? 0;
    for (let i = 0; i < speakOrder.length; i++) {
      expect(seatOf.get(speakOrder[i] ?? '')).toBe((startSeat + i) % ps.length);
    }
  });
});

describe('auction bid window', () => {
  it('never re-arms the window, however many bids land', () => {
    const ps = players(3);
    const started = startGame(auctionEngine, ps, 555, { bidSeconds: 30, itemCount: 4 });
    let state = started.state;
    let phase = started.phase;
    let phaseId = 'intro';
    let phaseEndsAt = started.phaseEndsAt;
    let now = NOW;

    // item_intro -> bidding
    const opened = auctionEngine.tick(
      state,
      stepCtx(ps, ps[0]?.id ?? '', { now, phase, phaseId, phaseEndsAt }),
    ) as Transition;
    state = opened.state;
    phase = opened.phase;
    phaseId = opened.phaseId;
    phaseEndsAt = opened.phaseEndsAt;
    expect(phase).toBe('bidding');

    const windowEndsAt = phaseEndsAt;
    expect(windowEndsAt).not.toBeNull();
    expect((windowEndsAt ?? 0) - now).toBe(30_000);

    // Three bids inside the window, none may move the deadline.
    let amount = (opened.publicState.minNextBid as number) ?? 10;
    for (let i = 0; i < 3; i++) {
      const bidder = ps[i % ps.length];
      if (!bidder) continue;
      const ctx = {
        now,
        players: ps,
        phaseId,
        currentPhase: phase,
        phaseEndsAt,
        expired: false,
        hostId: ps[0]?.id ?? '',
      };
      const res = auctionEngine.handleAction(
        state,
        { type: 'bid', payload: { amount }, actionId: `bid-${i}` },
        bidder,
        ctx,
      );
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const t = res.transition;
      state = t.state;
      phaseId = t.phaseId;
      phaseEndsAt = t.phaseEndsAt;
      expect(phaseEndsAt).toBe(windowEndsAt);
      amount += 10;
    }

    // A tick before the deadline is a no-op (null) so polling can never cut
    // the bidding short; one past it sells the lot.
    const early = auctionEngine.tick(
      state,
      stepCtx(ps, ps[0]?.id ?? '', { now: (windowEndsAt ?? 0) - 1_000, phase, phaseId, phaseEndsAt }),
    );
    expect(early).toBeNull();

    const late = auctionEngine.tick(
      state,
      stepCtx(ps, ps[0]?.id ?? '', { now: (windowEndsAt ?? 0) + 1, phase, phaseId, phaseEndsAt }),
    ) as Transition | null;
    expect(late?.phase).not.toBe('bidding');
  });
});