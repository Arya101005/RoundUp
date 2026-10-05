import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, LogOut } from 'lucide-react';
import clsx from 'clsx';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { PageShell } from '@/components/common/PageShell';
import { Button } from '@/components/common/Button';
import { ConnectionBanner } from '@/components/common/ConnectionBanner';
import { ErrorState, LoadingState } from '@/components/common/States';
import { GameHeader } from '@/components/common/GameHeader';
import { Scoreboard } from '@/components/common/Scoreboard';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { GameStage } from '@/components/game/GameStage';
import {
  asRecord,
  asString,
  phaseLabel,
  type StageContext,
} from '@/components/game/stage-context';
import {
  FinishedBanner,
  HowToPlay,
} from '@/components/game/stage-kit';
import { useToast } from '@/components/common/toastContext';
import { useRoom } from '@/hooks/useRoom';
import { useRoomStore } from '@/store/roomStore';
import { gameRegistry } from '@shared/games/registry';
import { getTheme } from '@/config/themes';
import { gameAction, leaveRoom, type LeaveRoomResult } from '@/services/api/rooms';
import { ApiError } from '@/services/api/client';
import { clearStoredRoomCode, getStoredRoomCode, storeRoomCode } from '@/utils/room';
import { routes } from '@/config/routes';

const RESULTS_REDIRECT_MS = 8000;

export function GamePage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const snapshot = useRoomStore((s) => s.snapshot);
  const loading = useRoomStore((s) => s.loading);
  const error = useRoomStore((s) => s.error);
  const reconnecting = useRoomStore((s) => s.reconnecting);
  const myUserId = useRoomStore((s) => s.myUserId);
  const resetRoom = useRoomStore((s) => s.reset);
  const { toast } = useToast();

  // The route only carries a sessionId, but the snapshot API is keyed by room
  // code and the shared store is cleared when the lobby unmounts. Resolve the
  // code from the navigation state, then the persisted code, then the snapshot.
  const stateRoomCode = (location.state as { roomCode?: string } | null)?.roomCode ?? null;
  const roomCode = stateRoomCode ?? snapshot?.room.code ?? getStoredRoomCode() ?? undefined;
  const { refreshSnapshot, sendRoomChat } = useRoom(roomCode);

  useEffect(() => {
    if (roomCode) storeRoomCode(roomCode);
  }, [roomCode]);

  const session = snapshot?.session ?? null;
  const meta = session ? gameRegistry[session.gameId] : null;

  useEffect(() => {
    if (!roomCode && !snapshot && !loading && !error) {
      navigate(routes.home, { replace: true });
    }
  }, [roomCode, snapshot, loading, error, navigate]);

  useEffect(() => {
    if (!loading && snapshot?.session && snapshot.session.id !== sessionId) {
      navigate(routes.game(snapshot.session.id), {
        replace: true,
        state: { roomCode: snapshot.room.code },
      });
    }
  }, [loading, snapshot, sessionId, navigate]);

  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const actionSeq = useRef(0);

  // One in-flight action at a time; the newest call wins the response race.
  const act = useCallback(
    async (type: string, payload?: Record<string, unknown>): Promise<boolean> => {
      if (!session) return false;
      const seq = ++actionSeq.current;
      setPending(type);
      setActionError(null);
      try {
        await gameAction({ sessionId: session.id, actionId: crypto.randomUUID(), type, payload });
        await refreshSnapshot();
        return true;
      } catch (err) {
        if (seq === actionSeq.current) {
          setActionError(err instanceof ApiError ? err.message : 'That action did not go through.');
        }
        return false;
      } finally {
        if (seq === actionSeq.current) setPending(null);
      }
    },
    [session, refreshSnapshot],
  );

  const finished = session?.status === 'finished';
  // Per-game turn clock. Games with a phase clock show it in the header;
  // auction hides the header clock (its bid window is a hard bidSeconds in the
  // stage, driven by `session.phaseEndsAt` and enforced server-side).
  const showTurnTimer = meta?.timer ?? true;

  // Rules panel: collapsed by default, opened by the "How to play" toggle that
  // sits directly above the stage so the rules are always one tap away.
  const [rulesOpen, setRulesOpen] = useState(false);

  /** Leaves the room and returns to the lobby, exactly like the lobby screen. */
  const handleLeaveGame = useCallback(async () => {
    if (!snapshot) return;
    try {
      const res: LeaveRoomResult = await leaveRoom(snapshot.room.id);
      if (res.roomLeft) {
        toast('success', 'Room deleted', 'You were the last player, so all room data was purged.');
      } else if (res.status === 'closed') {
        toast('info', 'Game closed', 'The room is now idle and will be cleared by the retention sweep.');
      }
    } catch {
      // Leaving is best-effort; navigate regardless.
    }
    resetRoom();
    clearStoredRoomCode();
    navigate(routes.home, { replace: true });
  }, [snapshot, toast, resetRoom, navigate]);

  // Once the session is over, move the player on to the standings unless they
  // choose to stay (they may want to read the last phase first).
  const goToResults = useCallback(() => {
    if (!session) return;
    resetRoom();
    clearStoredRoomCode();
    navigate(routes.results(session.id), { replace: true });
  }, [session, resetRoom, navigate]);
  const [staying, setStaying] = useState(false);
  useEffect(() => {
    if (!finished || staying) return;
    const timer = window.setTimeout(goToResults, RESULTS_REDIRECT_MS);
    return () => window.clearTimeout(timer);
  }, [finished, staying, goToResults]);

  const players = useMemo(
    () => (snapshot?.players ?? []).filter((p) => p.leftAt === null),
    [snapshot?.players],
  );

  const stage = useMemo<StageContext | null>(() => {
    if (!snapshot || !session || !meta) return null;
    return {
      gameId: session.gameId,
      session,
      pub: session.publicState ?? {},
      view: snapshot.myView ?? {},
      players,
      meId: myUserId,
      hostId: snapshot.room.hostId,
      themeLabel: getTheme(snapshot.room.theme)?.label ?? snapshot.room.theme,
      act,
      pending,
      actionError,
      onDismissError: () => setActionError(null),
      onOpenResults: goToResults,
      finished,
    };
  }, [snapshot, session, meta, players, myUserId, act, pending, actionError, goToResults, finished]);

  const finishBlock = stage ? (
    <FinishedBanner
      onOpenResults={goToResults}
      {...(staying ? { onStay: () => setStaying(false) } : {})}
    />
  ) : null;

  if (loading && !snapshot) {
    return (
      <PageShell>
        <LoadingState message="Loading game..." />
      </PageShell>
    );
  }

  if (error || !snapshot || !session || !meta || !stage) {
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

  const totalScores = asRecord(session.publicState?.totalScores);
  const entries = players.map((p) => ({
    id: p.userId,
    name: p.displayName,
    score: Number(totalScores[p.userId] ?? 0) || 0,
    isYou: p.userId === myUserId,
    isHost: p.userId === snapshot.room.hostId,
  }));

  const chatReason = chatDisabledReason(stage);

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <ConnectionBanner reconnecting={reconnecting} />
      <GameHeader
        meta={meta}
        phaseLabel={phaseLabel(session.gameId, session.phase)}
        roundIndex={session.roundIndex}
        totalRounds={session.totalRounds}
        // Games without a turn clock (auction) render 'Round' instead of a
        // header clock. Auction's bid window shows a real countdown in the
        // stage itself from `session.phase_ends_at`.
        showTurnTimer={showTurnTimer}
        endsAt={showTurnTimer ? session.phaseEndsAt : null}
        right={
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void handleLeaveGame()}
            title="Leave this game and return to the lobby"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Exit game
          </Button>
        }
      />
      <main className="mx-auto flex w-full max-w-7xl flex-1 gap-4 px-4 py-4">
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-4 flex flex-col gap-3">
            <Scoreboard entries={entries} />
            {meta.mode === 'teams' && <TeamTotals ctx={stage} />}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="lg:hidden">
            <Scoreboard entries={entries} />
          </div>

          {finished && finishBlock}

          {finished && !staying && (
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" onClick={() => setStaying(true)}>
                Keep me on this screen
              </Button>
            </div>
          )}

          <section className="rounded-lg border border-line bg-surface">
            <button
              type="button"
              onClick={() => setRulesOpen((v) => !v)}
              aria-expanded={rulesOpen}
              className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left"
            >
              <span className="font-display text-sm font-semibold text-ink">
                How to play {meta.name}
              </span>
              <span className="flex items-center gap-2 text-2xs text-muted">
                {rulesOpen ? 'Hide rules' : `Theme: ${stage.themeLabel}`}
                <ChevronDown
                  className={clsx('h-4 w-4 transition-transform', rulesOpen && 'rotate-180')}
                  aria-hidden
                />
              </span>
            </button>
            {rulesOpen && <HowToPlay rules={meta.rulesSummary} />}
          </section>

          <GameStage ctx={stage} />

          <div className="h-80 xl:hidden">
            <ChatPanel
              messages={snapshot.chat}
              currentUserId={myUserId}
              onSend={sendRoomChat}
              disabledReason={chatReason}
            />
          </div>
        </section>

        <aside className="hidden w-80 shrink-0 xl:block">
          <div className="sticky top-4 h-[calc(100dvh-6rem)]">
            <ChatPanel
              messages={snapshot.chat}
              currentUserId={myUserId}
              onSend={sendRoomChat}
              disabledReason={chatReason}
            />
          </div>
        </aside>
      </main>
    </div>
  );
}

/** Compact team totals for the two team games. */
function TeamTotals({ ctx }: { ctx: StageContext }) {
  const totals = asRecord(ctx.pub.teamTotals);
  if (Object.keys(totals).length === 0) return null;
  return (
    <section className="rounded-lg border border-line bg-surface p-3">
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted">
        Teams
      </h2>
      <div className="flex gap-2">
        <div className="flex-1 rounded-md border border-line bg-elevated px-3 py-2">
          <p className="text-2xs uppercase tracking-wider text-muted">Team A</p>
          <p className="text-base font-semibold text-ink tabular">{Number(totals.a ?? 0)}</p>
        </div>
        <div className="flex-1 rounded-md border border-line bg-elevated px-3 py-2">
          <p className="text-2xs uppercase tracking-wider text-muted">Team B</p>
          <p className="text-base font-semibold text-ink tabular">{Number(totals.b ?? 0)}</p>
        </div>
      </div>
    </section>
  );
}

/**
 * Mirrors the engines' chat gates so the input is disabled with a readable
 * reason instead of bouncing server-side errors.
 */
function chatDisabledReason(ctx: StageContext): string | undefined {
  const view = ctx.view;
  const role = asString(view.role);
  const pub = ctx.pub;
  switch (ctx.gameId) {
    case 'imposter':
      if (ctx.session.phase === 'discussion' && asString(pub.speakerId) !== '') {
        return 'only the current speaker may talk right now';
      }
      return undefined;
    case 'heads_up':
      if (ctx.session.phase === 'turn' && asString(pub.currentId) !== ctx.meId) {
        return 'only the player on air may ask a question';
      }
      return undefined;
    case 'password':
      if (ctx.session.phase === 'clue' || ctx.session.phase === 'guess') {
        return 'chat is locked during a Password word turn';
      }
      return undefined;
    case 'charades':
      if (ctx.session.phase === 'perform' && role === 'performer') {
        return 'the performer cannot chat — it would leak the prompt';
      }
      return undefined;
    default:
      return undefined;
  }
}