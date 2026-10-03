import { useEffect, useRef, useState, type FormEvent } from 'react';
import clsx from 'clsx';
import { MessageSquare, SendHorizonal, X } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { formatClock } from '@/utils/format';
import type { ChatMessage } from '@/types/domain';
import { CHAT_MAX } from '@shared/validation/sanitize';

export interface ChatPanelProps {
  messages: ChatMessage[];
  currentUserId: string | null;
  onSend: (body: string) => Promise<void>;
  /** When set, chat input is disabled with this visible reason. */
  disabledReason?: string;
  onTyping?: () => void;
  onClose?: () => void;
  title?: string;
}

export function ChatPanel({
  messages,
  currentUserId,
  onSend,
  disabledReason,
  onTyping,
  onClose,
  title = 'Chat',
}: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const atBottomRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      atBottomRef.current = nearBottom;
      if (nearBottom) setUnread(0);
    };
    el.addEventListener('scroll', handler);
    return () => el.removeEventListener('scroll', handler);
  }, []);

  useEffect(() => {
    if (atBottomRef.current) {
      bottomRef.current?.scrollIntoView({ block: 'end' });
    } else {
      setUnread((n) => n + 1);
    }
  }, [messages.length]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || disabledReason || sending) return;
    setSending(true);
    try {
      setDraft('');
      await onSend(body);
    } finally {
      setSending(false);
    }
  }

  return (
    <section
      aria-label={title}
      className="flex h-full min-h-0 flex-col rounded-lg border border-line bg-surface"
    >
      <header className="flex items-center justify-between border-b border-line px-3 py-2.5">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
          <MessageSquare className="h-3.5 w-3.5" aria-hidden />
          {title}
          {unread > 0 && (
            <span className="rounded-full bg-accent px-1.5 py-px text-2xs font-semibold text-white">
              {unread} new
            </span>
          )}
        </h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat"
            className="rounded p-1 text-muted transition hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {messages.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted">
            No messages yet. Say hello.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {messages.map((m) => {
              if (m.kind === 'system' || m.channel === 'system') {
                return (
                  <li key={m.id} className="py-0.5 text-center">
                    <span className="text-2xs text-muted">{m.body}</span>
                  </li>
                );
              }
              const mine = m.senderId === currentUserId;
              return (
                <li
                  key={m.id}
                  className={clsx('flex flex-col', mine ? 'items-end' : 'items-start')}
                >
                  <span className="mb-0.5 flex items-center gap-1.5 text-2xs text-muted">
                    <span className="font-medium text-ink">{m.senderName ?? 'Player'}</span>
                    <span>{formatClock(m.createdAt)}</span>
                  </span>
                  <span
                    className={clsx(
                      'max-w-[85%] break-words rounded-lg px-2.5 py-1.5 text-sm',
                      mine ? 'bg-accent/15 text-ink' : 'bg-elevated text-ink',
                      m.kind === 'question' && 'border border-accent/40',
                      m.kind === 'statement' && 'border border-line',
                    )}
                  >
                    {m.body}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="border-t border-line p-2.5">
        <div className="flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value.slice(0, CHAT_MAX));
              onTyping?.();
            }}
            disabled={Boolean(disabledReason) || sending}
            placeholder={disabledReason ?? 'Type a message...'}
            aria-label="Chat message"
            maxLength={CHAT_MAX}
            className="h-10 w-full rounded-md border border-line bg-elevated px-3 text-sm text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none disabled:opacity-60"
          />
          <Button
            type="submit"
            size="sm"
            aria-label="Send message"
            disabled={Boolean(disabledReason) || draft.trim().length === 0}
            loading={sending}
            icon={<SendHorizonal className="h-4 w-4" aria-hidden />}
          />
        </div>
        <div className="mt-1 flex justify-between text-2xs text-muted">
          <span>{disabledReason ?? (draft.length > CHAT_MAX - 20 ? `${CHAT_MAX - draft.length} left` : '')}</span>
        </div>
      </form>
    </section>
  );
}
