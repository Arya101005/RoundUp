import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Crown, Check, Circle, WifiOff, Clock } from 'lucide-react';
import { Avatar } from '@/components/common/Avatar';
import type { RoomPlayer } from '@/types/domain';

export interface PlayerCardProps {
  player: RoomPlayer;
  isHost: boolean;
  isYou: boolean;
  actions?: ReactNode;
}

const presenceMeta = {
  online: { label: 'Online', icon: Circle, className: 'text-success' },
  away: { label: 'Away', icon: Clock, className: 'text-warning' },
  offline: { label: 'Offline', icon: WifiOff, className: 'text-muted' },
} as const;

export function PlayerCard({ player, isHost, isYou, actions }: PlayerCardProps) {
  const presence = presenceMeta[player.presence];
  const PresenceIcon = presence.icon;

  return (
    <div
      className={clsx(
        'flex items-center gap-3 rounded-lg border bg-surface px-3 py-2.5',
        isYou ? 'border-accent/50' : 'border-line',
      )}
    >
      <Avatar name={player.displayName} status={player.presence} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-ink">
            {player.displayName}
            {isYou && <span className="ml-1 text-xs text-muted">(you)</span>}
          </span>
          {isHost && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-1.5 py-px text-2xs font-medium text-warning"
              title="Room host"
            >
              <Crown className="h-3 w-3" aria-hidden />
              Host
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-2xs">
          <span
            className={clsx('inline-flex items-center gap-1', presence.className)}
            title={presence.label}
          >
            <PresenceIcon className="h-3 w-3" aria-hidden />
            {presence.label}
          </span>
          <span
            className={clsx(
              'inline-flex items-center gap-1',
              player.ready ? 'text-success' : 'text-muted',
            )}
          >
            {player.ready ? <Check className="h-3 w-3" aria-hidden /> : <Circle className="h-3 w-3" aria-hidden />}
            {player.ready ? 'Ready' : 'Not ready'}
          </span>
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}
