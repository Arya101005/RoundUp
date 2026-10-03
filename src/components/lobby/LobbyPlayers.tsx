import { useState } from 'react';
import { LogOut, Play, UserMinus, UserPlus } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { PlayerCard } from '@/components/lobby/PlayerCard';
import type { RoomPlayer } from '@/types/domain';

export interface LobbyPlayersProps {
  players: RoomPlayer[];
  myUserId: string | null;
  hostId: string;
  isHost: boolean;
  blockReason: string | null;
  busy?: boolean;
  onToggleReady: () => void;
  onKick: (userId: string) => void;
  onTransferHost: (userId: string) => void;
  onStart: () => void;
  onLeave: () => void;
}

export function LobbyPlayers({
  players,
  myUserId,
  hostId,
  isHost,
  blockReason,
  busy = false,
  onToggleReady,
  onKick,
  onTransferHost,
  onStart,
  onLeave,
}: LobbyPlayersProps) {
  const [kickTarget, setKickTarget] = useState<RoomPlayer | null>(null);
  const [transferTarget, setTransferTarget] = useState<RoomPlayer | null>(null);

  const active = players.filter((p) => p.leftAt === null);
  const me = active.find((p) => p.userId === myUserId);

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="players-heading" className="rounded-lg border border-line bg-surface p-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2
            id="players-heading"
            className="text-xs font-semibold uppercase tracking-wider text-muted"
          >
            Players
          </h2>
          <span className="text-2xs text-muted tabular">{active.length} in room</span>
        </div>
        <ul className="flex flex-col gap-2">
          {active.map((player) => (
            <li key={player.id}>
              <PlayerCard
                player={player}
                isHost={player.userId === hostId}
                isYou={player.userId === myUserId}
                actions={
                  isHost && player.userId !== myUserId ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setTransferTarget(player)}
                        aria-label={`Make ${player.displayName} the host`}
                        title="Make host"
                        className="rounded border border-line p-1.5 text-muted transition hover:border-accent/60 hover:text-ink"
                      >
                        <UserPlus className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => setKickTarget(player)}
                        aria-label={`Remove ${player.displayName} from the room`}
                        title="Remove from room"
                        className="rounded border border-line p-1.5 text-muted transition hover:border-danger/60 hover:text-danger"
                      >
                        <UserMinus className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </>
                  ) : undefined
                }
              />
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-col gap-2">
        {isHost ? (
          <>
            <Button
              size="lg"
              onClick={onStart}
              loading={busy}
              disabled={Boolean(blockReason)}
              icon={<Play className="h-4 w-4" aria-hidden />}
            >
              Start game
            </Button>
            {blockReason && (
              <p role="status" className="text-center text-xs text-warning">
                {blockReason}
              </p>
            )}
          </>
        ) : (
          <>
            <Button
              size="lg"
              variant={me?.ready ? 'secondary' : 'primary'}
              loading={busy}
              onClick={onToggleReady}
              disabled={!me}
            >
              {me?.ready ? 'Not ready' : 'I am ready'}
            </Button>
            <p className="text-center text-xs text-muted">
              {me?.ready ? 'Waiting for the host to start...' : 'Mark ready when you are set.'}
            </p>
          </>
        )}

        <Button variant="ghost" onClick={onLeave} icon={<LogOut className="h-4 w-4" aria-hidden />}>
          Leave room
        </Button>
      </div>

      <ConfirmDialog
        open={kickTarget !== null}
        onOpenChange={(open) => !open && setKickTarget(null)}
        title={`Remove ${kickTarget?.displayName ?? ''}?`}
        description="They will leave the room and need the code to come back."
        confirmLabel="Remove"
        danger
        onConfirm={() => {
          if (kickTarget) onKick(kickTarget.userId);
          setKickTarget(null);
        }}
      />

      <ConfirmDialog
        open={transferTarget !== null}
        onOpenChange={(open) => !open && setTransferTarget(null)}
        title={`Make ${transferTarget?.displayName ?? ''} the host?`}
        description="You will keep playing, but they will control the room settings."
        confirmLabel="Make host"
        onConfirm={() => {
          if (transferTarget) onTransferHost(transferTarget.userId);
          setTransferTarget(null);
        }}
      />
    </div>
  );
}
