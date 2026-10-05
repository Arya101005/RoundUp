/**
 * Renders every phase of every game stage with realistic engine payloads.
 *
 * The stages read the untyped `publicState` / `myView`, so the point of this
 * suite is breadth: any missing key, wrong assumption about a field name, or
 * hook-order mistake shows up as a render crash or a missing secret instead of
 * a white screen in production.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { GameStage } from '@/components/game/GameStage';
import type { StageContext } from '@/components/game/stage-context';
import type { RoomPlayer, SessionSummary } from '@/types/domain';
import type { GameId } from '@shared/games/types';

afterEach(cleanup);

const PLAYERS: RoomPlayer[] = ['u1', 'u2', 'u3', 'u4'].map((id, i) => ({
  id: `seat-${id}`,
  roomId: 'r1',
  userId: id,
  displayName: ['Ada', 'Ben', 'Cleo', 'Dev'][i] as string,
  ready: true,
  teamId: i % 2 === 0 ? 'a' : 'b',
  joinedAt: '2026-01-01T00:00:00Z',
  leftAt: null,
  lastSeenAt: '2026-01-01T00:00:00Z',
  presence: 'online',
}));

function session(gameId: GameId, phase: string, over: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 's1',
    roomId: 'r1',
    gameId,
    phase,
    phaseId: 'p1',
    phaseEndsAt: '2099-01-01T00:00:00Z',
    roundIndex: 0,
    totalRounds: 3,
    status: 'active',
    version: 1,
    publicState: {},
    ...over,
  };
}

function ctx(
  gameId: GameId,
  phase: string,
  pub: Record<string, unknown>,
  view: Record<string, unknown> = {},
  over: Partial<StageContext> = {},
): StageContext {
  return {
    gameId,
    session: session(gameId, phase, { publicState: pub }),
    pub,
    view,
    players: PLAYERS,
    meId: 'u1',
    hostId: 'u1',
    themeLabel: 'Movies',
    act: async () => true,
    pending: null,
    actionError: null,
    onDismissError: () => {},
    onOpenResults: () => {},
    finished: false,
    ...over,
  };
}

const CRITERION = {
  label: 'Worldwide box office, highest first',
  metricLabel: 'USD millions',
  direction: 'desc',
};

describe('game stages render every phase', () => {
  it('imposter: role reveal shows the crew word and hides it from the imposter', () => {
    const { unmount } = render(
      <GameStage ctx={ctx('imposter', 'role_reveal', {}, { role: 'crew', secret: 'Inception', category: 'Classics' })} />,
    );
    expect(screen.getByText('Inception')).toBeInTheDocument();
    unmount();

    render(<GameStage ctx={ctx('imposter', 'role_reveal', {}, { role: 'imposter', theme: 'Movies' })} />);
    expect(screen.getByText('Imposter')).toBeInTheDocument();
    expect(screen.queryByText('Inception')).not.toBeInTheDocument();
  });

  it('imposter: discussion, voting, reveal, guess and results all render', () => {
    const crew = { role: 'crew', secret: 'Inception', category: 'Classics' };
    render(<GameStage ctx={ctx('imposter', 'discussion', { speakerId: 'u2', totalScores: {} }, crew)} />);
    cleanup();
    render(<GameStage ctx={ctx('imposter', 'voting', { totalScores: {} }, crew)} />);
    expect(screen.getByRole('button', { name: /Ben/ })).toBeInTheDocument();
    cleanup();
    render(
      <GameStage
        ctx={ctx('imposter', 'vote_reveal', { word: 'Inception', caughtId: 'u2', voteTally: { u2: 2, u3: 1 } }, crew)}
      />,
    );
    expect(screen.getAllByText(/Ben/).length).toBeGreaterThan(0);
    cleanup();
    render(
      <GameStage
        ctx={ctx('imposter', 'imposter_guess', { word: 'Inception', caughtId: 'u2' }, { role: 'imposter' })}
      />,
    );
    expect(screen.getByLabelText('Guess')).toBeInTheDocument();
    cleanup();
    render(
      <GameStage
        ctx={ctx(
          'imposter',
          'round_results',
          { word: 'Inception', caughtId: 'u2', guessOk: true, scoresThisRound: { u1: 150, u3: 0 } },
          crew,
        )}
      />,
    );
    expect(screen.getByText(/Points this round/i)).toBeInTheDocument();
  });

  it('heads up: the active player cannot see their own word, others can', () => {
    const pub = {
      currentId: 'u1',
      finishedIds: ['u3'],
      guessFeed: [{ byId: 'u1', text: 'inseption', near: true }],
      lastAnswers: {},
      totalScores: {},
    };
    // A player's own view lists every OTHER player's word, never their own.
    const view = { assignments: { u2: 'Titanic', u3: 'Avatar', u4: 'Gladiator' } };
    const { unmount } = render(<GameStage ctx={ctx('heads_up', 'turn', pub, view)} />);
    expect(screen.queryByText('Titanic')).not.toBeInTheDocument();
    unmount();

    render(<GameStage ctx={ctx('heads_up', 'turn', { ...pub, currentId: 'u2' }, view)} />);
    expect(screen.getAllByText('Titanic').length).toBeGreaterThan(0);
  });

  it('heads up: round results reveal every word', () => {
    render(
      <GameStage
        ctx={ctx('heads_up', 'round_results', {
          assignments: { u1: 'Inception', u2: 'Titanic', u3: 'Avatar', u4: 'Gladiator' },
          scoresThisRound: { u1: 120, u2: 90 },
        })}
      />,
    );
    expect(screen.getByText('Gladiator')).toBeInTheDocument();
  });

  it('password: only the clue giver sees the secret', () => {
    const pub = { giverId: 'u1', activeTeam: 'a', clues: [{ text: 'mind', byId: 'u1' }] };
    const { unmount } = render(
      <GameStage ctx={ctx('password', 'clue', pub, { secret: 'Inception', role: 'giver', team: 'a' })} />,
    );
    expect(screen.getByLabelText('Send clue')).toBeInTheDocument();
    expect(screen.getByText('Inception')).toBeInTheDocument();
    unmount();

    render(<GameStage ctx={ctx('password', 'clue', pub, { secret: null, role: 'guesser', team: 'a' })} />);
    expect(screen.getByText('hidden')).toBeInTheDocument();
    expect(screen.queryByText('Inception')).not.toBeInTheDocument();
  });

  it('password: guess and round results render with team totals', () => {
    render(<GameStage ctx={ctx('password', 'guess', { giverId: 'u1', activeTeam: 'a', clues: [] }, { role: 'guesser', team: 'a' })} />);
    expect(screen.getByLabelText('Guess')).toBeInTheDocument();
    cleanup();
    render(
      <GameStage
        ctx={ctx('password', 'round_results', {
          teamTotals: { a: 120, b: 100 },
          scoresThisRound: { a: 120, b: 100 },
          word: 'Inception',
          wordOver: { solved: true, points: 120 },
        })}
      />,
    );
    expect(screen.getAllByText('120').length).toBeGreaterThan(0);
  });

  it('charades: only the performer sees the prompt and owns skip/end-turn', () => {
    const pub = { performerId: 'u1', activeTeam: 'a', guessFeed: [] };
    const { unmount } = render(
      <GameStage ctx={ctx('charades', 'perform', pub, { secret: 'Titanic', role: 'performer', team: 'a' })} />,
    );
    expect(screen.getByText('Titanic')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Skip prompt/i })).toBeInTheDocument();
    unmount();

    render(<GameStage ctx={ctx('charades', 'perform', pub, { role: 'guesser', team: 'a' })} />);
    expect(screen.queryByText('Titanic')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Guess')).toBeInTheDocument();
  });

  it('charades: reveal and round results render', () => {
    render(<GameStage ctx={ctx('charades', 'turn_reveal', { word: 'Titanic', turnOver: { solved: true, points: 140 } })} />);
    expect(screen.getByText('Titanic')).toBeInTheDocument();
    cleanup();
    render(<GameStage ctx={ctx('charades', 'round_results', { teamTotals: { a: 140, b: 120 }, scoresThisRound: { a: 140, b: 120 } })} />);
    expect(screen.getAllByText('140').length).toBeGreaterThan(0);
  });

  it('blind ranking: intro, placing, reveal and results render', () => {
    render(<GameStage ctx={ctx('blind_ranking', 'round_intro', { criterion: CRITERION })} />);
    expect(screen.getByText(/Worldwide box office/)).toBeInTheDocument();
    cleanup();

    render(
      <GameStage
        ctx={ctx('blind_ranking', 'placing', { criterion: CRITERION, item: 'Avatar', placedCounts: { u1: 0 } })}
      />,
    );
    expect(screen.getByText('Avatar')).toBeInTheDocument();
    cleanup();

    render(
      <GameStage
        ctx={ctx('blind_ranking', 'reveal', {
          criterion: CRITERION,
          reference: ['Avatar', 'Titanic'],
          rankings: { u1: ['Avatar', 'Titanic'] },
          scoresThisRound: { u1: 1000 },
        })}
      />,
    );
    expect(screen.getByText(/Reference order/i)).toBeInTheDocument();
  });

  it('auction: bidding shows the minimum, and the high bidder is told to wait', () => {
    const pub = { budgets: { u1: 1000 }, itemIndex: 0, item: { name: 'Avatar' }, high: null, minNextBid: 40, sold: [] };
    const { unmount } = render(<GameStage ctx={ctx('auction', 'bidding', pub)} />);
    expect(screen.getByLabelText('Your bid')).toBeInTheDocument();
    expect(screen.getByText(/No bids yet/)).toBeInTheDocument();
    unmount();

    render(<GameStage ctx={ctx('auction', 'bidding', { ...pub, high: { bidderId: 'u1', amount: 40 } })} />);
    expect(screen.getByText(/You hold the highest bid/)).toBeInTheDocument();
  });

  it('auction: item intro, reveal and results render', () => {
    render(<GameStage ctx={ctx('auction', 'item_intro', { budgets: { u1: 1000 }, itemIndex: 0, item: { name: 'Avatar' } })} />);
    expect(screen.getByText('Avatar')).toBeInTheDocument();
    cleanup();
    render(
      <GameStage
        ctx={ctx('auction', 'reveal', {
          revealed: [{ name: 'Avatar', value: 400, winnerId: 'u1' }],
          acquired: { u1: 400 },
          scoresThisRound: { u1: 1400 },
        })}
      />,
    );
    expect(screen.getAllByText('400').length).toBeGreaterThan(0);
    cleanup();
    render(<GameStage ctx={ctx('auction', 'round_results', { revealed: [{ name: 'Avatar', value: 400, winnerId: 'u1' }], acquired: { u1: 400 }, totalScores: { u1: 2840 } })} />);
    expect(screen.getByText('2,840')).toBeInTheDocument();
  });

  it('surfaces a server error message instead of failing silently', () => {
    render(
      <GameStage
        ctx={ctx('imposter', 'discussion', {}, { role: 'crew', secret: 'X' }, { actionError: 'That is not allowed right now.' })}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('That is not allowed right now.');
  });
});