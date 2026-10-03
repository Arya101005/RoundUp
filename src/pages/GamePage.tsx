import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageShell } from '@/components/common/PageShell';
import { Button } from '@/components/common/Button';
import { ConnectionBanner } from '@/components/common/ConnectionBanner';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/States';
import { GameHeader } from '@/components/common/GameHeader';
import { Scoreboard } from '@/components/common/Scoreboard';
import { useRoom } from '@/hooks/useRoom';
import { useRoomStore } from '@/store/roomStore';
import { gameRegistry } from '@shared/games/registry';
import { routes } from '@/config/routes';

/**
 * Generic game shell: header, timer, scoreboard, phase stage.
 * Individual phase screens are mounted by the engine registry (Phase 3+).
 */
export function GamePage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const snapshot = useRoomStore((s) => s.snapshot);
  const loading = useRoomStore((s) => s.loading);
  const error = useRoomStore((s) => s.error);
  const reconnecting = useRoomStore((s) => s.reconnecting);
  const myUserId = useRoomStore((s) => s.myUserId);

  const roomCode = snapshot?.room.code;
  useRoom(roomCode);

  const session = snapshot?.session ?? null;
  const meta = session ? gameRegistry[session.gameId] : null;

  // Route into the room first so the membership guard runs, then bind the game.
  useEffect(() => {
    if (!snapshot && !loading && !error) {
      navigate(routes.home, { replace: true });
    }
  }, [snapshot, loading, error, navigate]);

  if (loading && !snapshot) {
    return (
      <PageShell>
        <LoadingState message="Loading game..." />
      </PageShell>
    );
  }

  if (error || !snapshot || !session || !meta) {
    return (
      <PageShell>
        <div className="mx-auto w-full max-w-3xl px-4 py-16">
          <ErrorState
            title="Game not found."
            description={error ?? 'This game session does not exist or has ended.'}
            action={
              <Button variant="secondary" onClick={() => navigate(routes.home)}>
                Back to home
              </Button>
            }
          />
        </div>
      </PageShell>
    );
  }

  if (session.id !== sessionId) {
    return (
      <PageShell>
        <LoadingState message="Loading game..." />
      </PageShell>
    );
  }

  const scores = (session.publicState?.scores as
    | { id: string; name: string; score: number }[]
    | undefined) ?? [];

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <ConnectionBanner reconnecting={reconnecting} />
      <GameHeader
        meta={meta}
        phaseLabel={session.phase.replace(/_/g, ' ').toLowerCase()}
        roundIndex={session.roundIndex}
        totalRounds={session.totalRounds}
        endsAt={session.phaseEndsAt}
      />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-4 lg:flex-row">
        <aside className="w-full shrink-0 lg:w-64">
          <Scoreboard
            entries={
              scores.length > 0
                ? scores
                : snapshot.players
                    .filter((p) => p.leftAt === null)
                    .map((p) => ({
                        id: p.userId,
                        name: p.displayName,
                        score: 0,
                        isYou: p.userId === myUserId,
                      }))
            }
          />
        </aside>
        <section className="min-w-0 flex-1" aria-label="Game stage">
          <div className="rounded-lg border border-line bg-surface p-6">
            <EmptyState
              title={meta.name}
              description={`Round ${session.roundIndex + 1} of ${session.totalRounds}. Waiting for the server to advance the phase.`}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
