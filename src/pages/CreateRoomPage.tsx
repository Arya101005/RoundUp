import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { PageShell } from '@/components/common/PageShell';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Select } from '@/components/common/Select';
import { ErrorState } from '@/components/common/States';
import { useToast } from '@/components/common/toastContext';
import { createRoom } from '@/services/api/rooms';
import { ApiError } from '@/services/api/client';
import { sanitizeDisplayName, NAME_MAX, NAME_MIN } from '@shared/validation/sanitize';
import { gameRegistry } from '@shared/games/registry';
import { gameIds, type Difficulty, type GameId } from '@shared/games/types';
import { gameConfigSchemas, roundsBounds } from '@shared/games/configs';
import { getTheme, themeSupportsGame, themes } from '@/config/themes';
import { routes } from '@/config/routes';
import { getStoredName, storeName } from '@/utils/room';
import { supabaseConfigured } from '@/services/supabase/client';

const difficulties: Difficulty[] = ['easy', 'medium', 'hard'];

export function CreateRoomPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [displayName, setDisplayName] = useState(() => getStoredName());
  const [gameId, setGameId] = useState<GameId>('imposter');
  const [theme, setTheme] = useState('movies');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [rounds, setRounds] = useState(3);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const meta = gameRegistry[gameId];
  const bounds = roundsBounds(gameId);

  const gameOptions = useMemo(
    () =>
      gameIds
        .filter((id) => themeSupportsGame(theme, id))
        .map((id) => ({ value: id, label: gameRegistry[id].name })),
    [theme],
  );

  const themeOptions = useMemo(
    () =>
      themes
        .filter((t) => t.supportedGames.includes(gameId))
        .map((t) => ({ value: t.id, label: t.label })),
    [gameId],
  );

  function handleGameChange(id: string) {
    const next = id as GameId;
    setGameId(next);
    const nextBounds = roundsBounds(next);
    setRounds((r) => Math.min(Math.max(r, nextBounds.min), nextBounds.max));
    if (!themeSupportsGame(theme, next)) {
      const fallback = themes.find((t) => t.supportedGames.includes(next));
      setTheme(fallback?.id ?? theme);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

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
      const { room } = await createRoom({
        displayName: nameCheck.value,
        gameId,
        theme,
        difficulty,
        rounds,
        config: { ...gameConfigSchemas[gameId].defaults },
      });
      navigate(routes.room(room.code), { state: { created: true } });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
      setError(message);
      toast('error', 'Could not create the room', message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <h1 className="font-display text-2xl font-semibold text-ink">Create a room</h1>
        <p className="mt-1 text-sm text-muted">
          Pick a game and settings. You can fine-tune them in the lobby.
        </p>

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
            label="Your name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Priya"
            maxLength={NAME_MAX}
            error={nameError ?? undefined}
            hint={`Visible to players in the room, ${NAME_MIN} to ${NAME_MAX} characters.`}
            autoComplete="nickname"
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <Select
              label="Game"
              value={gameId}
              onValueChange={handleGameChange}
              options={gameOptions}
            />
            <Select
              label="Theme"
              value={theme}
              onValueChange={setTheme}
              options={themeOptions}
              hint={getTheme(theme)?.auctionValueMetric}
            />
            <Select
              label="Difficulty"
              value={difficulty}
              onValueChange={(v) => setDifficulty(v as Difficulty)}
              options={difficulties.map((d) => ({ value: d, label: d }))}
            />
            <Select
              label="Rounds"
              value={String(rounds)}
              onValueChange={(v) => setRounds(Number(v))}
              options={Array.from({ length: bounds.max - bounds.min + 1 }, (_, i) => {
                const value = bounds.min + i;
                return { value: String(value), label: String(value) };
              })}
              hint={`${meta.name}: ${bounds.min} to ${bounds.max} rounds`}
            />
          </div>

          <div className="rounded-lg border border-line bg-surface p-4">
            <h2 className="font-display text-sm font-semibold text-ink">{meta.name}</h2>
            <p className="mt-1 text-sm text-muted">{meta.description}</p>
            <ul className="mt-3 flex flex-col gap-1.5">
              {meta.rulesSummary.map((rule) => (
                <li key={rule} className="flex gap-2 text-xs text-muted">
                  <span className="text-accent" aria-hidden>
                    &ndash;
                  </span>
                  {rule}
                </li>
              ))}
            </ul>
          </div>

          {error && (
            <div role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}

          <Button type="submit" size="lg" loading={submitting} disabled={!supabaseConfigured} icon={<ArrowRight className="h-4 w-4" aria-hidden />}>
            {submitting ? 'Creating room...' : 'Create room'}
          </Button>
        </form>
      </div>
    </PageShell>
  );
}
