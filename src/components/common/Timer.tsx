import { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import clsx from 'clsx';
import { remainingUntil } from '@/services/clock';
import { formatDuration } from '@/utils/format';

export interface TimerProps {
  /** ISO timestamp of phase end on the server clock; null = no timer. */
  endsAt: string | null;
  /** Called once when the countdown reaches zero (client triggers a tick). */
  onExpired?: () => void;
  /** Rendered when the phase has no timer. */
  label?: string;
  compact?: boolean;
  className?: string;
}

export function Timer({ endsAt, onExpired, label = 'Time left', compact, className }: TimerProps) {
  const [remaining, setRemaining] = useState<number | null>(() =>
    endsAt ? remainingUntil(endsAt) : null,
  );
  const firedRef = useRef(false);
  const callbackRef = useRef(onExpired);
  callbackRef.current = onExpired;

  useEffect(() => {
    firedRef.current = false;
    if (!endsAt) {
      setRemaining(null);
      return;
    }
    setRemaining(remainingUntil(endsAt));
    const interval = window.setInterval(() => {
      const ms = remainingUntil(endsAt);
      setRemaining(ms);
      if (ms <= 0 && !firedRef.current) {
        firedRef.current = true;
        window.setTimeout(() => callbackRef.current?.(), Math.floor(Math.random() * 1500));
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [endsAt]);

  if (remaining === null) {
    return label ? <span className="text-sm text-muted">{label}</span> : null;
  }

  const expired = remaining <= 0;
  const urgent = !expired && remaining <= 10_000;
  const text = expired ? 'Waiting for server...' : formatDuration(remaining);
  const minutes = Math.ceil(remaining / 60_000);

  return (
    <div
      className={clsx(
        'inline-flex items-center gap-1.5 font-medium tabular',
        compact ? 'text-sm' : 'text-base',
        expired ? 'text-muted' : urgent ? 'text-warning' : 'text-ink',
        className,
      )}
      role="timer"
      aria-live={expired ? 'polite' : 'off'}
      aria-label={`${label}: ${expired ? 'waiting for server' : text}`}
    >
      <Clock className={clsx(compact ? 'h-3.5 w-3.5' : 'h-4 w-4', 'text-muted')} aria-hidden />
      {/* Screen readers get throttled updates via aria-label, not the ticking text. */}
      <span aria-hidden>{text}</span>
      {!expired && remaining < 60_000 && remaining >= 10_000 && (
        <span className="sr-only">{minutes} minutes left</span>
      )}
    </div>
  );
}
