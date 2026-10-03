import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { PageShell } from '@/components/common/PageShell';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { ErrorState, LoadingState } from '@/components/common/States';
import { useToast } from '@/components/common/toastContext';
import { joinRoom } from '@/services/api/rooms';
import { ApiError } from '@/services/api/client';
import { sanitizeDisplayName, normalizeRoomCode, NAME_MAX, NAME_MIN } from '@shared/validation/sanitize';
import { routes } from '@/config/routes';
import { getStoredName, storeName } from '@/utils/room';
import { supabaseConfigured } from '@/services/supabase/client';

export function JoinRoomPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [code, setCode] = useState(() => normalizeRoomCode(roomCode ?? ''));
  const [displayName, setDisplayName] = useState(() => getStoredName());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (roomCode) setCode(normalizeRoomCode(roomCode));
  }, [roomCode]);

  const canSubmit = useMemo(() => code.length === 5 && !submitting, [code, submitting]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotFound(false);

    const nameCheck = sanitizeDisplayName(displayName);
    if (!nameCheck.ok) {
      setNameError(
        nameCheck.reason === 'length'
          ? `Name must be ${NAME_MIN} to ${NAME_MAX} characters.`
          : 'That name contains characters that are not allowed.',
      );
      return;
    }
    setNameError(null);

    setSubmitting(true);
    try {
      storeName(nameCheck.value);
      const { room } = await joinRoom(normalizeRoomCode(code), nameCheck.value);
      navigate(routes.room(room.code));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ROOM_NOT_FOUND') {
        setNotFound(true);
        return;
      }
      const message =
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
      setError(message);
      toast('error', 'Could not join the room', message);
    } finally {
      setSubmitting(false);
    }
  }

  if (notFound) {
    return (
      <PageShell>
        <div className="mx-auto w-full max-w-3xl px-4 py-16">
          <ErrorState
            title="Room not found."
            description={`No room exists with the code ${code}. Check the code and try again.`}
            action={
              <Button variant="secondary" onClick={() => setNotFound(false)}>
                Try another code
              </Button>
            }
          />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <h1 className="font-display text-2xl font-semibold text-ink">Join a room</h1>
        <p className="mt-1 text-sm text-muted">Enter the 5-character code from your host.</p>

        {!supabaseConfigured && (
          <div className="mt-6">
            <ErrorState
              title="Server not configured"
              description="Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in your environment, then reload."
            />
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
          <Input
            label="Room code"
            value={code}
            onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
            placeholder="AB7KQ"
            maxLength={5}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="font-mono text-xl uppercase tracking-[0.3em]"
            hint="Letters and numbers, for example AB7KQ."
          />
          <Input
            label="Your name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Rahul"
            maxLength={NAME_MAX}
            error={nameError ?? undefined}
            hint={`Visible to players in the room, ${NAME_MIN} to ${NAME_MAX} characters.`}
            autoComplete="nickname"
          />

          {error && (
            <div
              role="alert"
              className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
            >
              {error}
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            loading={submitting}
            disabled={!canSubmit || !supabaseConfigured}
            icon={<LogIn className="h-4 w-4" aria-hidden />}
          >
            {submitting ? 'Joining room...' : 'Join room'}
          </Button>
        </form>

        {submitting && <LoadingState message="Joining room..." />}
      </div>
    </PageShell>
  );
}
