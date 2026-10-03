import { ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { Avatar } from '@/components/common/Avatar';
import { Button } from '@/components/common/Button';
import type { RoomPlayer } from '@/types/domain';

export interface TeamPanelProps {
  players: RoomPlayer[];
  isHost: boolean;
  onChange: (assignments: { userId: string; teamId: string }[]) => void;
}

export function TeamPanel({ players, isHost, onChange }: TeamPanelProps) {
  const teamA = players.filter((p) => p.teamId === 'a');
  const teamB = players.filter((p) => p.teamId === 'b');

  function move(player: RoomPlayer, to: 'a' | 'b') {
    if (!isHost || player.teamId === to) return;
    onChange([{ userId: player.userId, teamId: to }]);
  }

  function autoBalance() {
    if (!isHost) return;
    const sorted = players.slice().sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
    onChange(sorted.map((p, i) => ({ userId: p.userId, teamId: i % 2 === 0 ? 'a' : 'b' })));
  }

  function clearTeams() {
    if (!isHost) return;
    onChange(players.map((p) => ({ userId: p.userId, teamId: 'a' })));
  }

  const columns: { key: 'a' | 'b'; label: string; members: RoomPlayer[] }[] = [
    { key: 'a', label: 'Team A', members: teamA },
    { key: 'b', label: 'Team B', members: teamB },
  ];

  return (
    <section aria-labelledby="teams-heading" className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2
          id="teams-heading"
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted"
        >
          <Users className="h-3.5 w-3.5" aria-hidden />
          Teams
        </h2>
        {isHost && (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={autoBalance}>
              Auto balance
            </Button>
            <Button size="sm" variant="ghost" onClick={clearTeams}>
              Reset
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {columns.map((column) => (
          <div key={column.key} className="rounded-md border border-line bg-elevated p-2.5">
            <p className="mb-2 flex items-center justify-between text-2xs font-semibold uppercase tracking-wider text-muted">
              {column.label}
              <span className="tabular">{column.members.length} players</span>
            </p>
            <ul className="flex flex-col gap-1.5">
              {column.members.length === 0 && (
                <li className="py-2 text-center text-2xs text-muted">No players yet</li>
              )}
              {column.members.map((member) => (
                <li key={member.id} className="flex items-center gap-2">
                  <Avatar name={member.displayName} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">
                    {member.displayName}
                  </span>
                  {isHost && (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        aria-label={`Move ${member.displayName} to Team A`}
                        disabled={column.key === 'a'}
                        onClick={() => move(member, 'a')}
                        className="rounded border border-line p-1 text-muted transition hover:text-ink disabled:opacity-30"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${member.displayName} to Team B`}
                        disabled={column.key === 'b'}
                        onClick={() => move(member, 'b')}
                        className="rounded border border-line p-1 text-muted transition hover:text-ink disabled:opacity-30"
                      >
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-2 text-2xs text-muted">
        {teamA.length === teamB.length && teamA.length > 0
          ? 'Teams are balanced.'
          : 'Both teams need the same number of players to start.'}
      </p>
    </section>
  );
}
