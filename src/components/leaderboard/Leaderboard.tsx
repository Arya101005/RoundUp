import clsx from 'clsx';
import { Medal } from 'lucide-react';
import { Avatar } from '@/components/common/Avatar';
import { formatScore } from '@/utils/format';
import { rankEntries } from '@/utils/room';
import type { ScoreEntry } from '@/components/common/Scoreboard';

export interface LeaderboardRow extends ScoreEntry {
  perRound: number[];
  stats?: string[];
}

export function Leaderboard({
  rows,
  roundCount,
  title = 'Final standings',
}: {
  rows: LeaderboardRow[];
  roundCount: number;
  title?: string;
}) {
  const ranked = rankEntries(rows).map((r) => ({
    ...r,
    row: rows.find((x) => x.id === r.id),
  }));

  return (
    <section aria-label={title} className="overflow-hidden rounded-lg border border-line bg-surface">
      <h2 className="border-b border-line px-4 py-3 font-display text-sm font-semibold uppercase tracking-wider text-muted">
        {title}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-2xs uppercase tracking-wider text-muted">
              <th scope="col" className="px-3 py-2 font-medium">
                Rank
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Player
              </th>
              {Array.from({ length: roundCount }, (_, i) => (
                <th key={i} scope="col" className="px-3 py-2 text-right font-medium">
                  R{i + 1}
                </th>
              ))}
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((entry) => (
              <tr
                key={entry.id}
                className={clsx('border-b border-line/60 last:border-0', entry.isYou && 'bg-accent/5')}
              >
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-1 font-semibold text-ink tabular">
                    {entry.rank <= 3 && (
                      <Medal
                        className={clsx(
                          'h-4 w-4',
                          entry.rank === 1 && 'text-warning',
                          entry.rank === 2 && 'text-muted',
                          entry.rank === 3 && 'text-warning/70',
                        )}
                        aria-hidden
                      />
                    )}
                    {entry.rank}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-2">
                    <Avatar name={entry.name} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{entry.name}</span>
                      {entry.row?.stats && entry.row.stats.length > 0 && (
                        <span className="block text-2xs text-muted">{entry.row.stats.join(' · ')}</span>
                      )}
                    </span>
                  </span>
                </td>
                {Array.from({ length: roundCount }, (_, r) => (
                  <td key={r} className="px-3 py-2.5 text-right text-muted tabular">
                    {entry.row ? formatScore(entry.row.perRound[r] ?? 0) : '-'}
                  </td>
                ))}
                <td className="px-3 py-2.5 text-right font-semibold text-ink tabular">
                  {formatScore(entry.score)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
