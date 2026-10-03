import type { Difficulty, GameId } from '@shared/games/types';
import { gameRegistry } from '@shared/games/registry';
import { roundsBounds } from '@shared/games/configs';
import { GameCard } from '@/components/common/GameCard';
import { GameSettings } from '@/components/lobby/GameSettings';
import { Select } from '@/components/common/Select';
import { getTheme, themeSupportsGame, themes } from '@/config/themes';
import type { Room } from '@/types/domain';

const difficulties: Difficulty[] = ['easy', 'medium', 'hard'];

export interface LobbySettingsProps {
  room: Room;
  isHost: boolean;
  onChange: (patch: {
    gameId?: GameId;
    theme?: string;
    difficulty?: Difficulty;
    rounds?: number;
    config?: Record<string, unknown>;
  }) => void;
}

export function LobbySettings({ room, isHost, onChange }: LobbySettingsProps) {
  const gameId = room.gameId;
  const meta = gameId ? gameRegistry[gameId] : null;
  const bounds = gameId ? roundsBounds(gameId) : { min: 1, max: 10, default: 3 };

  const gameOptions = gameIdsForTheme(room.theme);

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="game-select-heading">
        <h2
          id="game-select-heading"
          className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted"
        >
          Game
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {gameOptions.map(({ id, supported }) => (
            <GameCard
              key={id}
              meta={gameRegistry[id]}
              compact
              selected={gameId === id}
              disabled={!isHost || !supported}
              disabledReason={
                !supported ? `Not available in the ${getTheme(room.theme)?.label} theme.` : undefined
              }
              onSelect={
                isHost && supported
                  ? () => {
                      const nextBounds = roundsBounds(id);
                      onChange({
                        gameId: id,
                        rounds: Math.min(Math.max(room.rounds, nextBounds.min), nextBounds.max),
                        config: {},
                      });
                    }
                  : undefined
              }
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="room-settings-heading" className="rounded-lg border border-line bg-surface p-4">
        <h2
          id="room-settings-heading"
          className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted"
        >
          Room settings
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Select
            label="Theme"
            value={room.theme}
            onValueChange={(v) => isHost && onChange({ theme: v })}
            disabled={!isHost}
            options={themes
              .filter((t) => !gameId || t.supportedGames.includes(gameId))
              .map((t) => ({ value: t.id, label: t.label, description: t.auctionValueMetric }))}
          />
          <Select
            label="Difficulty"
            value={room.difficulty}
            onValueChange={(v) => isHost && onChange({ difficulty: v as Difficulty })}
            disabled={!isHost}
            options={difficulties.map((d) => ({ value: d, label: d }))}
          />
          <Select
            label="Rounds"
            value={String(room.rounds)}
            onValueChange={(v) => isHost && onChange({ rounds: Number(v) })}
            disabled={!isHost || !gameId}
            options={Array.from({ length: bounds.max - bounds.min + 1 }, (_, i) => {
              const value = bounds.min + i;
              return { value: String(value), label: String(value) };
            })}
          />
        </div>

        {gameId && meta && (
          <div className="mt-5 border-t border-line pt-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
              {meta.name} settings
            </h3>
            <GameSettings
              gameId={gameId}
              values={room.config}
              readOnly={!isHost}
              onChange={(next) => isHost && onChange({ config: next })}
            />
          </div>
        )}
      </section>
    </div>
  );
}

function gameIdsForTheme(theme: string): { id: GameId; supported: boolean }[] {
  return (Object.keys(gameRegistry) as GameId[]).map((id) => ({
    id,
    supported: themeSupportsGame(theme, id),
  }));
}
