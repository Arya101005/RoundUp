import clsx from 'clsx';
import { Crown } from 'lucide-react';
import { Avatar } from '@/components/common/Avatar';
import { formatScore } from '@/utils/format';
import { rankEntries } from '@/utils/room';

export interface ScoreEntry {
  id: string;
  name: string;
  score: number;
  isYou?: boolean;
  isHost?: boolean;
  connected?: boolean;
}

export function Scoreboard({
  entries,
  title = 'Scores',
  className,
}: {
  entries: ScoreEntry[];
  title?: string;
  className?: string;
}) {
  const ranked = rankEntries(entries);
  return (
    <section
      aria-label={title}
      className={clsx('rounded-lg border border-line bg-surface p-3', className)}
    >
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted">{title}</h2>
      <ol className="flex flex-col gap-1.5">
        {ranked.map((entry) => (
          <li
            key={entry.id}
            className={clsx(
              'flex items-center gap-2.5 rounded-md px-2 py-1.5',
              entry.isYou && 'bg-accent/10',
            )}
          >
            <span className="w-5 shrink-0 text-center text-xs font-semibold text-muted tabular">
              {entry.rank}
            </span>
            <Avatar name={entry.name} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm text-ink">
              {entry.name}
              {entry.isYou && <span className="ml-1 text-xs text-muted">(you)</span>}
              {entry.isHost && <Crown className="ml-1 inline h-3 w-3 text-warning" aria-hidden />}
              {entry.connected === false && (
                <span className="ml-1.5 text-2xs text-warning">disconnected</span>
              )}
            </span>
            <span className="shrink-0 text-sm font-semibold text-ink tabular">
              {formatScore(entry.score)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
