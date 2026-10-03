import type { ReactNode } from 'react';
import type { GameMeta } from '@shared/games/types';
import { Timer } from '@/components/common/Timer';
import { gameAccent, gameIcons } from '@/config/gameIcons';

export interface GameHeaderProps {
  meta: GameMeta;
  phaseLabel: string;
  roundIndex: number;
  totalRounds: number;
  endsAt: string | null;
  onTimerExpired?: () => void;
  right?: ReactNode;
}

export function GameHeader({
  meta,
  phaseLabel,
  roundIndex,
  totalRounds,
  endsAt,
  onTimerExpired,
  right,
}: GameHeaderProps) {
  const Icon = gameIcons[meta.id];
  const accent = gameAccent[meta.id];

  return (
    <header className="border-b border-line bg-surface">
      <div
        className="h-0.5 w-full"
        style={{ backgroundColor: accent }}
        aria-hidden
      />
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3">
        <span
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border"
          style={{ borderColor: `${accent}55`, color: accent, backgroundColor: `${accent}14` }}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-sm font-semibold text-ink">{meta.name}</h1>
          <p className="truncate text-2xs text-muted">
            {phaseLabel}
            <span className="mx-1.5" aria-hidden>
              &middot;
            </span>
            <span className="tabular">
              Round {roundIndex + 1} of {totalRounds}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {right}
          <Timer endsAt={endsAt} onExpired={onTimerExpired} compact />
        </div>
      </div>
    </header>
  );
}
