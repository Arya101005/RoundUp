import clsx from 'clsx';
import { CheckCircle2, Users } from 'lucide-react';
import type { GameMeta } from '@shared/games/types';
import { gameAccent, gameIcons } from '@/config/gameIcons';

const modeLabel: Record<GameMeta['mode'], string> = {
  ffa: 'Free for all',
  teams: 'Teams',
  individual: 'Individual',
};

export interface GameCardProps {
  meta: GameMeta;
  selected?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onSelect?: () => void;
  compact?: boolean;
}

export function GameCard({
  meta,
  selected = false,
  disabled = false,
  disabledReason,
  onSelect,
  compact = false,
}: GameCardProps) {
  const Icon = gameIcons[meta.id];
  const accent = gameAccent[meta.id];
  const interactive = Boolean(onSelect) && !disabled;

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border"
          style={{ borderColor: `${accent}55`, color: accent, backgroundColor: `${accent}14` }}
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
        {selected && (
          <CheckCircle2 className="h-[18px] w-[18px] text-accent" aria-label="Selected" />
        )}
      </div>
      <div className="mt-3">
        <h3 className="font-display text-base font-semibold text-ink">{meta.name}</h3>
        <p className={clsx('mt-1 text-sm text-muted', compact && 'line-clamp-2')}>{meta.description}</p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-2xs">
        <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-muted">
          {modeLabel[meta.mode]}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-muted">
          <Users className="h-3 w-3" aria-hidden />
          {meta.minPlayers}-{meta.maxPlayers} players
        </span>
      </div>
      {disabled && disabledReason && (
        <p className="mt-2 text-xs text-warning">{disabledReason}</p>
      )}
    </>
  );

  const base = clsx(
    'w-full rounded-lg border p-4 text-left transition',
    selected ? 'border-accent bg-surface' : 'border-line bg-surface',
    interactive && 'hover:border-accent/60 cursor-pointer',
    !interactive && 'cursor-default',
    disabled && 'opacity-60',
  );

  if (interactive && onSelect) {
    return (
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={base}
        title={disabled ? disabledReason : undefined}
      >
        {body}
      </button>
    );
  }

  return <div className={base}>{body}</div>;
}
