import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Copy, Link2, MessageSquare, Settings2, Users } from 'lucide-react';
import { PageShell } from '@/components/common/PageShell';
import { Button } from '@/components/common/Button';
import { RoomCode } from '@/components/common/RoomCode';
import { ConnectionBanner } from '@/components/common/ConnectionBanner';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/States';
import { useToast } from '@/components/common/toastContext';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { LobbyPlayers } from '@/components/lobby/LobbyPlayers';
import { LobbySettings } from '@/components/lobby/LobbySettings';
import { TeamPanel } from '@/components/lobby/TeamPanel';
import { useRoom } from '@/hooks/useRoom';
import { useRoomStore } from '@/store/roomStore';
import {
  leaveRoom,
  startGame,
  updateRoom,
} from '@/services/api/rooms';
import { ApiError } from '@/services/api/client';
import { gameRegistry } from '@shared/games/registry';
import { activePlayers, startBlockReason } from '@/utils/room';
import { copyText } from '@/utils/format';
import { routes } from '@/config/routes';

type MobileTab = 'players' | 'settings' | 'chat';

export function RoomPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { sendRoomChat, sendTyping } = useRoom(roomCode);

  const snapshot = useRoomStore((s) => s.snapshot);
  const loading = useRoomStore((s) => s.loading);
  const error = useRoomStore((s) => s.error);
  const reconnecting = useRoomStore((s) => s.reconnecting);
  const myUserId = useRoomStore((s) => s.myUserId);

  const [busy, setBusy] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>('players');

  const room = snapshot?.room ?? null;
  const players = useMemo(() => snapshot?.players ?? [], [snapshot]);
  const isHost = room !== null && room.hostId === myUserId;
  const meta = room?.gameId ? gameRegistry[room.gameId] : null;

  const active = useMemo(() => activePlayers(players), [players]);

  const blockReason = useMemo(() => {
    if (!room || !meta) return 'Pick a game first.';
    return startBlockReason({ room, players, meta, hostId: room.hostId });
  }, [room, players, meta]);

  // Mid-game entry: route into the game session instead of the lobby.
  useEffect(() => {
    if (!snapshot) return;
    const session = snapshot.session;
    if (session && snapshot.room.status !== 'lobby' && snapshot.room.status !== 'closed') {
      navigate(routes.game(session.id), { replace: true });
    }
  }, [snapshot, navigate]);

  const runUpdate = useCallback(
    async (input: Omit<Parameters<typeof updateRoom>[0], 'roomId'>, failMessage: string) => {
      if (!room) return;
      setBusy(true);
      try {
        await updateRoom({ roomId: room.id, ...input });
      } catch (err) {
        toast('error', failMessage, err instanceof ApiError ? err.message : undefined);
      } finally {
        setBusy(false);
      }
    },
    [room, toast],
  );

  const handleStart = useCallback(async () => {
    if (!room) return;
    setBusy(true);
    try {
      const { sessionId } = await startGame(room.id);
      navigate(routes.game(sessionId));
    } catch (err) {
      toast('error', 'Could not start the game', err instanceof ApiError ? err.message : undefined);
      setBusy(false);
    }
  }, [room, navigate, toast]);

  const handleLeave = useCallback(async () => {
    if (!room) return;
    try {
      await leaveRoom(room.id);
    } catch {
      // Leaving is best-effort; navigate regardless.
    }
    navigate(routes.home, { replace: true });
  }, [room, navigate]);

  const handleCopyLink = useCallback(async () => {
    if (!room) return;
    const url = `${window.location.origin}${routes.joinWithCode(room.code)}`;
    const ok = await copyText(url);
    if (ok) toast('success', 'Invite link copied');
    else toast('error', 'Could not copy', 'Your browser blocked clipboard access.');
  }, [room, toast]);

  if (loading && !snapshot) {
    return (
      <PageShell>
        <LoadingState message="Loading room..." />
      </PageShell>
    );
  }

  if (error || !snapshot || !room) {
    return (
      <PageShell>
        <div className="mx-auto w-full max-w-3xl px-4 py-16">
          <ErrorState
            title={error ?? 'Room not found.'}
            description="You may not be a member of this room, or it has closed."
            action={
              <Button variant="secondary" onClick={() => navigate(routes.join)}>
                Join a room
              </Button>
            }
          />
        </div>
      </PageShell>
    );
  }

  const chat = (
    <ChatPanel
      messages={snapshot.chat}
      currentUserId={myUserId}
      onSend={sendRoomChat}
      onTyping={sendTyping}
      title="Room chat"
    />
  );

  return (
    <PageShell wide>
      <ConnectionBanner reconnecting={reconnecting} />

      <div className="mx-auto w-full max-w-6xl px-4 py-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-3">
            <RoomCode
              code={room.code}
              onCopied={() => toast('success', 'Room code copied')}
              onCopyFailed={() => toast('error', 'Could not copy', 'Select the code and copy it.')}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopyLink}
              icon={<Link2 className="h-4 w-4" aria-hidden />}
            >
              Copy link
            </Button>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted">
            <Copy className="hidden h-4 w-4 sm:block" aria-hidden />
            <span>
              Share the code so friends can join at{' '}
              <span className="font-medium text-ink">{routes.joinWithCode(room.code)}</span>
            </span>
          </div>
        </div>

        {/* Mobile tabs */}
        <div className="mt-5 flex gap-1 rounded-lg border border-line bg-surface p-1 lg:hidden">
          {(
            [
              { id: 'players', label: 'Players', icon: Users },
              { id: 'settings', label: 'Settings', icon: Settings2 },
              { id: 'chat', label: 'Chat', icon: MessageSquare },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMobileTab(tab.id)}
              aria-pressed={mobileTab === tab.id}
              className={
                mobileTab === tab.id
                  ? 'flex flex-1 items-center justify-center gap-1.5 rounded-md bg-elevated py-2 text-sm font-medium text-ink'
                  : 'flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-sm text-muted transition hover:text-ink'
              }
            >
              <tab.icon className="h-4 w-4" aria-hidden />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)_320px]">
          <div className={mobileTab === 'players' ? 'block' : 'hidden lg:block'}>
            <LobbyPlayers
              players={players}
              myUserId={myUserId}
              hostId={room.hostId}
              isHost={isHost}
              blockReason={blockReason}
              busy={busy}
              onToggleReady={() =>
                void runUpdate({ ready: !(active.find((p) => p.userId === myUserId)?.ready ?? false) }, 'Could not update ready state')
              }
              onKick={(userId) => void runUpdate({ kickUserId: userId }, 'Could not remove the player')}
              onTransferHost={(userId) => void runUpdate({ transferHostTo: userId }, 'Could not transfer host')}
              onStart={() => void handleStart()}
              onLeave={() => void handleLeave()}
            />
            {meta?.mode === 'teams' && (
              <div className="mt-4">
                <TeamPanel
                  players={active}
                  isHost={isHost}
                  onChange={(assignments) =>
                    void runUpdate({ assignTeams: assignments }, 'Could not update teams')
                  }
                />
              </div>
            )}
          </div>

          <div className={mobileTab === 'settings' ? 'block' : 'hidden lg:block'}>
            <LobbySettings
              room={room}
              isHost={isHost}
              onChange={(patch) => void runUpdate(patch, 'Could not update settings')}
            />
          </div>

          <div className={mobileTab === 'chat' ? 'block h-[60vh]' : 'hidden lg:block lg:h-[70vh]'}>
            {chat}
          </div>
        </div>

        {active.length === 0 && (
          <EmptyState
            title="You are the only one here."
            description="Share the room code so friends can join."
          />
        )}
      </div>
    </PageShell>
  );
}
