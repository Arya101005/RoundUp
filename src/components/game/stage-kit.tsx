/**
 * Presentational blocks shared by the six per-game stage screens. The data
 * helpers and the stage contract live in `./stage-context`.
 */
import type { ReactNode } from 'react';
import clsx from 'clsx';
import { AlertTriangle, Lock } from 'lucide-react';
import { Avatar } from '@/components/common/Avatar';
import { Button } from '@/components/common/Button';
import type { RoomPlayer } from '@/types/domain';

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const toneClass: Record<Tone, string> = {
  neutral: 'border-line bg-elevated text-ink',
  accent: 'border-accent/50 bg-accent/10 text-ink',
  success: 'border-success/50 bg-success/10 text-ink',
  warning: 'border-warning/50 bg-warning/10 text-ink',
  danger: 'border-danger/50 bg-danger/10 text-ink',
};

export function Stage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        'flex flex-col gap-5 rounded-lg border border-line bg-surface p-5',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function StageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * A compact how-to-play panel: one short rule per item, exactly as the host
 * reads it before the game starts. Supplied from `GameMeta.rulesSummary`.
 *
 * Accessory: a small icon on the right so the panel reads as a sidebar on
 * wide layouts. Mobile stacks it under the stage.
 */
export function HowToPlay({
  rules,
  accessory,
  className,
}: {
  rules: string[];
  accessory?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'flex gap-3 border-b border-line px-5 py-3 text-sm text-muted',
        className,
      )}
    >
      <ol className="flex flex-col gap-1.5 list-decimal list-inside pl-2 text-ink">
        {rules.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ol>
      {accessory && <div className="flex shrink-0 items-center font-display text-xs text-muted">{accessory}</div>}
    </div>
  );
}

/** The hero panel: a secret word, a role, or a headline number. */
export function Reveal({
  label,
  children,
  tone = 'neutral',
  icon,
}: {
  label?: string;
  children: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
}) {
  return (
    <div className={clsx('rounded-lg border p-6 text-center', toneClass[tone])}>
      {label && (
        <p className="text-2xs font-semibold uppercase tracking-wider opacity-70">{label}</p>
      )}
      <div className="mt-1.5 flex items-center justify-center gap-2">
        {icon}
        <div className="font-display text-3xl font-semibold tracking-tight break-words">
          {children}
        </div>
      </div>
    </div>
  );
}

export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-2xs font-medium',
        toneClass[tone],
      )}
    >
      {children}
    </span>
  );
}

/** A tappable player row (voting, choosing a target). */
export function PlayerOption({
  player,
  meId,
  selected,
  disabled,
  onClick,
  hint,
}: {
  player: RoomPlayer;
  meId: string | null;
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
  hint?: string;
}) {
  const isMe = player.userId === meId;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={clsx(
        'flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition',
        'disabled:cursor-not-allowed disabled:opacity-50',
        selected ? 'border-accent bg-accent/15' : 'border-line bg-elevated hover:border-accent/60',
      )}
    >
      <Avatar name={player.displayName} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">
          {player.displayName}
          {isMe && <span className="ml-1 text-xs text-muted">(you)</span>}
        </span>
        {hint && <span className="block text-2xs text-muted">{hint}</span>}
      </span>
      {selected && <Tag tone="accent">selected</Tag>}
    </button>
  );
}

/** Scrolling feed of wrong guesses. */
export function GuessFeed({
  items,
  names,
  emptyText = 'No guesses yet.',
}: {
  items: { byId: string; text: string; near?: boolean }[];
  names: Record<string, string>;
  emptyText?: string;
}) {
  return (
    <div className="rounded-md border border-line bg-elevated p-3">
      <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted">Guesses</h3>
      {items.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted">{emptyText}</p>
      ) : (
        <ul className="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
          {items.map((g, i) => (
            <li key={`${g.byId}-${i}`} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-ink">
                <span className="text-muted">{names[g.byId] ?? 'Someone'}:</span> {g.text}
              </span>
              {g.near && <Tag tone="warning">close</Tag>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Key/value grid for score breakdowns. */
export function StatsGrid({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {rows.map((r) => (
        <div key={r.label} className="rounded-md border border-line bg-elevated px-3 py-2">
          <dt className="text-2xs uppercase tracking-wider text-muted">{r.label}</dt>
          <dd className="mt-0.5 text-sm font-semibold text-ink tabular">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ActionError({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss: () => void;
}) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-ink"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
      <span className="min-w-0 flex-1">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-xs text-muted hover:text-ink"
      >
        Dismiss
      </button>
    </div>
  );
}

/** Shown when a secret is deliberately hidden from this player. */
export function HiddenNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center justify-center gap-1.5 text-xs text-muted">
      <Lock className="h-3.5 w-3.5" aria-hidden />
      {children}
    </p>
  );
}

/** Reusable single-input submit row (guess / clue / bid). */
export function InputRow({
  value,
  onChange,
  onSubmit,
  placeholder,
  submitLabel,
  pending,
  disabled,
  maxLength,
  hint,
  inputMode,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder: string;
  submitLabel: string;
  pending: boolean;
  disabled?: boolean;
  maxLength?: number;
  hint?: string;
  inputMode?: 'text' | 'numeric';
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled && !pending && value.trim()) onSubmit();
      }}
      className="flex flex-col gap-1.5"
    >
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, maxLength ?? 60))}
          disabled={disabled || pending}
          placeholder={placeholder}
          aria-label={submitLabel}
          inputMode={inputMode}
          className="h-11 w-full rounded-md border border-line bg-elevated px-3 text-base text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none disabled:opacity-60"
        />
        <Button type="submit" loading={pending} disabled={disabled || value.trim().length === 0}>
          {submitLabel}
        </Button>
      </div>
      {hint && <p className="text-2xs text-muted">{hint}</p>}
    </form>
  );
}

/** Banner shown on the finished session, with a route to the full results. */
export function FinishedBanner({
  onOpenResults,
  onStay,
}: {
  onOpenResults: () => void;
  onStay?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-success/50 bg-success/10 px-4 py-3">
      <div className="min-w-0">
        <p className="font-display text-base font-semibold text-ink">Game over!</p>
        <p className="text-sm text-muted">
          {onStay
            ? 'Stay here as long as you like, or open the standings.'
            : 'Taking you to the final standings shortly.'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {onStay && (
          <Button size="sm" variant="secondary" onClick={onStay}>
            Stay here
          </Button>
        )}
        <Button size="sm" onClick={onOpenResults}>
          See results
        </Button>
      </div>
    </div>
  );
}