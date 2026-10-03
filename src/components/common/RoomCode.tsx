import { Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { copyText } from '@/utils/format';

export interface RoomCodeProps {
  code: string;
  label?: string;
  onCopied?: () => void;
  onCopyFailed?: () => void;
}

export function RoomCode({ code, label = 'Room code', onCopied, onCopyFailed }: RoomCodeProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const ok = await copyText(code);
    if (ok) {
      setCopied(true);
      onCopied?.();
      window.setTimeout(() => setCopied(false), 1800);
    } else {
      onCopyFailed?.();
    }
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-xs font-medium uppercase tracking-widest text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <span
          className="font-mono text-3xl font-bold tracking-[0.3em] text-ink tabular sm:text-4xl"
          data-testid="room-code"
        >
          {code}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? 'Room code copied' : 'Copy room code'}
          className="rounded-md border border-line bg-elevated p-2 text-muted transition hover:border-accent/60 hover:text-ink"
        >
          {copied ? (
            <Check className="h-4 w-4 text-success" aria-hidden />
          ) : (
            <Copy className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>
    </div>
  );
}
