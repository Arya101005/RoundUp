import clsx from 'clsx';
import { avatarColor, initialsOf } from '@/utils/room';

export type PresenceStatus = 'online' | 'away' | 'offline';

export interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  status?: PresenceStatus;
  title?: string;
}

const sizeClasses = {
  sm: 'h-7 w-7 text-2xs',
  md: 'h-9 w-9 text-xs',
  lg: 'h-12 w-12 text-sm',
} as const;

const statusLabel: Record<PresenceStatus, string> = {
  online: 'Online',
  away: 'Away',
  offline: 'Offline',
};

export function Avatar({ name, size = 'md', status, title }: AvatarProps) {
  return (
    <span className="relative inline-flex shrink-0" title={title ?? name}>
      <span
        className={clsx(
          'inline-flex items-center justify-center rounded-full font-semibold text-white',
          sizeClasses[size],
        )}
        style={{ backgroundColor: avatarColor(name) }}
        aria-hidden
      >
        {initialsOf(name)}
      </span>
      {status && (
        <span
          className={clsx(
            'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface',
            status === 'online' && 'bg-success',
            status === 'away' && 'bg-warning',
            status === 'offline' && 'bg-muted',
          )}
          role="img"
          aria-label={statusLabel[status]}
        />
      )}
      <span className="sr-only">{statusLabel[status ?? 'offline']}</span>
    </span>
  );
}
