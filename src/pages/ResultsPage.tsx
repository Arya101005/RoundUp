import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageShell } from '@/components/common/PageShell';
import { Button } from '@/components/common/Button';
import { ErrorState, LoadingState } from '@/components/common/States';
import { Leaderboard, type LeaderboardRow } from '@/components/leaderboard/Leaderboard';
import { getSnapshot } from '@/services/api/rooms';
import { ApiError } from '@/services/api/client';
import type { Snapshot } from '@/types/domain';
import { gameRegistry } from '@shared/games/registry';
import { getStoredRoomCode } from '@/utils/room';
import { routes } from '@/config/routes';
import { useRoomStore } from '@/store/roomStore';

export function ResultsPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const storeSnapshot = useRoomStore((s) => s.snapshot);

  const [snapshot, setSnapshot] = useState<Snapshot | null>(storeSnapshot);
  const [loading, setLoading] = useState(storeSnapshot === null);
  const [error, setError] = useState<string | null>(null);

  const code = snapshot?.room.code ?? storeSnapshot?.room.code ?? getStoredRoomCode();
  const myUserId = useRoomStore((s) => s.myUserId);

  useEffect(() => {
    if (snapshot || !code) return;
    let cancelled = false;
    setLoading(true);
    getSnapshot(code)
      .then((snap) => {
        if (!cancelled) setSnapshot(snap);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Could not load results.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code, snapshot]);

  const session = snapshot?.session ?? null;
  const roomCode = snapshot?.room.code ?? null;

  if (loading) {
    return (
      <PageShell>
        <LoadingState message="Loading results..." />
      </PageShell>
    );
  }

  if (error || !snapshot || !session || session.id !== sessionId) {
    return (
      <PageShell>
        <div className="mx-auto w-full max-w-3xl px-4 py-16">
          <ErrorState
            title="Results not found."
            description={error ?? 'This game session does not exist or has not finished.'}
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

  const meta = gameRegistry[session.gameId];
  const totalScores = (session.publicState?.totalScores as Record<string, number> | undefined) ??
    {};
  const rows: LeaderboardRow[] = snapshot.players
    .filter((p) => p.leftAt === null)
    .map((p) => ({
      id: p.userId,
      name: p.displayName,
      score: totalScores[p.userId] ?? 0,
      perRound: [],
      isYou: p.userId === myUserId,
    }));

  return (
    <PageShell wide>
      <div className="mx-auto w-full max-w-4xl px-4 py-10">
        <h1 className="font-display text-2xl font-semibold text-ink">{meta.name} results</h1>
        <p className="mt-1 text-sm text-muted">
          Round {session.roundIndex + 1} of {session.totalRounds} complete.
        </p>
        <div className="mt-6">
          <Leaderboard rows={rows} roundCount={session.roundIndex + 1} />
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            variant="secondary"
            onClick={() => (roomCode ? navigate(routes.room(roomCode)) : navigate(routes.home))}
          >
            Return to lobby
          </Button>
          <Button variant="ghost" onClick={() => navigate(routes.home)}>
            Leave room
          </Button>
        </div>
      </div>
    </PageShell>
  );
}
