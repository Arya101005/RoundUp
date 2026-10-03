import { RefreshCw } from 'lucide-react';

export function ConnectionBanner({ reconnecting }: { reconnecting: boolean }) {
  if (!reconnecting) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 top-3 z-[55] flex -translate-x-1/2 items-center gap-2 rounded-full border border-warning/40 bg-elevated px-4 py-2 text-xs font-medium text-ink shadow-[var(--shadow-float)] animate-fade-in"
    >
      <RefreshCw className="h-3.5 w-3.5 animate-spin text-warning" aria-hidden />
      Reconnecting...
    </div>
  );
}
