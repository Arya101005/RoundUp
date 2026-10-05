/**
 * Blind Ranking stage (Section 10.5). Phases: round_intro -> placing ->
 * reveal -> round_results.
 *
 * The engine keeps every player's ranking server-side until the reveal, so the
 * player tracks *their own* ordering locally (mirroring exactly the insertion
 * they chose) and persists it per round so a refresh does not lose it.
 */
import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ListOrdered } from 'lucide-react';
import clsx from 'clsx';
import {
  asRecord,
  asString,
  asStringArray,
  type StageContext,
} from '@/components/game/stage-context';
import {
  ActionError,
  Reveal,
  Stage,
  StageHeading,
  StatsGrid,
  Tag,
} from '@/components/game/stage-kit';
import { formatScore } from '@/utils/format';

function storageKey(sessionId: string, roundIndex: number, meId: string): string {
  return `roundup.rank.${sessionId}.${roundIndex}.${meId}`;
}

function readStored(key: string): string[] {
  try {
    const raw = sessionStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function RankingStage({ ctx }: { ctx: StageContext }) {
  const { session, pub, players, meId, pending } = ctx;
  const phase = session.phase;

  const criterion = asRecord(pub.criterion);
  const criterionLabel = asString(criterion.label, 'Rank these');
  const metricLabel = asString(criterion.metricLabel);
  const direction = asString(criterion.direction, 'desc');
  const item = typeof pub.item === 'string' ? pub.item : null;
  const placedCounts = asRecord(pub.placedCounts);
  const reference = asStringArray(pub.reference);
  const rankings = asRecord(pub.rankings);
  const scoresThisRound = asRecord(pub.scoresThisRound);

  const key = storageKey(session.id, session.roundIndex, meId ?? 'anon');
  const [mine, setMine] = useState<string[]>(() => readStored(key));

  useEffect(() => {
    setMine(readStored(key));
  }, [key]);

  const place = useCallback(
    async (position: number) => {
      if (!item) return;
      const next = [...mine];
      next.splice(position, 0, item);
      setMine(next);
      try {
        sessionStorage.setItem(key, JSON.stringify(next));
      } catch {
        // storage unavailable; the in-memory list still drives the UI
      }
      await ctx.act('place', { item, position });
    },
    [ctx, item, key, mine],
  );

  if (phase === 'round_intro') {
    return (
      <Stage>
        <StageHeading title="This round's criterion" description="Rank the items by this." />
        <Reveal label={metricLabel || 'criterion'} tone="accent">
          {criterionLabel}
        </Reveal>
        <p className="text-center text-sm text-muted">
          Items appear one at a time. Place each one before the timer runs out.
          {direction === 'asc' ? ' Lower values rank higher.' : ' Higher values rank higher.'}
        </p>
        <p className="text-center text-xs text-muted">Starting shortly…</p>
      </Stage>
    );
  }

  if (phase === 'reveal' || phase === 'round_results') {
    const showPerRound = phase === 'reveal';
    const rows = players.map((p) => ({
      label: p.displayName + (p.userId === meId ? ' (you)' : ''),
      value: showPerRound
        ? formatScore(Number(scoresThisRound[p.userId] ?? 0))
        : formatScore(Number(asRecord(pub.totalScores)[p.userId] ?? 0)),
    }));
    return (
      <Stage>
        <StageHeading
          title={phase === 'reveal' ? 'True ranking' : 'Round results'}
          description={criterionLabel}
        />
        <div className="rounded-md border border-line bg-elevated p-3">
          <h3 className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted">
            <ListOrdered className="h-3.5 w-3.5" aria-hidden /> Reference order
          </h3>
          <ol className="flex flex-col gap-1 text-sm">
            {reference.map((r, i) => (
              <li key={r} className="flex items-center gap-2">
                <span className="w-5 text-right text-xs text-muted tabular">{i + 1}</span>
                <span className="text-ink">{r}</span>
              </li>
            ))}
            {reference.length === 0 && <li className="text-xs text-muted">Not revealed yet.</li>}
          </ol>
        </div>
        <div className="rounded-md border border-line bg-elevated p-3">
          <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted">
            Your ranking
          </h3>
          <ol className="flex flex-col gap-1 text-sm">
            {mine.length === 0 && <li className="text-xs text-muted">Nothing placed.</li>}
            {mine.map((r, i) => {
              const rank = reference.indexOf(r);
              const off = rank >= 0 && rank !== i;
              return (
                <li key={r} className="flex items-center gap-2">
                  <span className="w-5 text-right text-xs text-muted tabular">{i + 1}</span>
                  <span className={clsx('text-ink', off && 'text-warning')}>{r}</span>
                  {off && (
                    <span className="text-2xs text-warning">
                      true #{rank + 1}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
        {Object.keys(rankings).length > 0 && (
          <div className="rounded-md border border-line bg-elevated p-3">
            <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted">
              Everyone's rankings
            </h3>
            <div className="flex flex-col gap-2">
              {players.map((p) => (
                <div key={p.userId}>
                  <p className="text-xs font-medium text-ink">
                    {p.displayName}
                    {p.userId === meId && <span className="text-muted"> (you)</span>}
                  </p>
                  <ol className="mt-0.5 flex list-inside list-decimal gap-x-2 text-2xs text-muted">
                    {asStringArray(rankings[p.userId]).map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </div>
        )}
        <StatsGrid rows={rows} />
        {phase === 'reveal' && (
          <p className="text-center text-sm text-muted">Scores updating shortly…</p>
        )}
        {phase === 'round_results' && (
          <p className="text-center text-sm text-muted">
            {session.roundIndex + 1 < session.totalRounds
              ? 'Next round starting shortly…'
              : 'Final round complete.'}
          </p>
        )}
      </Stage>
    );
  }

  // placing
  const othersPlaced = players
    .filter((p) => p.userId !== meId)
    .map((p) => ({ name: p.displayName, count: Number(placedCounts[p.userId] ?? 0) }));

  if (!item) {
    return (
      <Stage>
        <StageHeading title="Placing" description="Waiting for the next item." />
        <p className="text-center text-sm text-muted">Hang tight…</p>
        <ActionError message={ctx.actionError} onDismiss={ctx.onDismissError} />
      </Stage>
    );
  }

  return (
    <Stage>
      <StageHeading title="Place the item" description={criterionLabel} />
      <Reveal label="new item" tone="accent">
        {item}
      </Reveal>

      <div className="rounded-md border border-line bg-elevated p-3">
        <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted">
          Your ranking so far
        </h3>
        <ol className="flex flex-col gap-1.5">
          {mine.map((m, i) => (
            <li key={m} className="flex items-center gap-2 text-sm">
              <span className="w-5 text-right text-xs text-muted tabular">{i + 1}</span>
              <span className="text-ink">{m}</span>
            </li>
          ))}
          {mine.length === 0 && (
            <li className="text-xs text-muted">This is your first item.</li>
          )}
        </ol>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-2xs font-semibold uppercase tracking-wider text-muted">
          Where does "{item}" go?
        </p>
        {Array.from({ length: mine.length + 1 }, (_, i) => (
          <button
            key={i}
            type="button"
            disabled={pending === 'place'}
            onClick={() => void place(i)}
            className="flex items-center justify-between rounded-md border border-line bg-elevated px-3 py-2 text-left text-sm transition hover:border-accent/60 disabled:opacity-50"
          >
            <span className="text-ink">
              {i === 0 ? 'Top' : i === mine.length ? 'Bottom' : `Position ${i + 1}`}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted">
              {i === 0 ? <ArrowUp className="h-3.5 w-3.5" aria-hidden /> : null}
              {i === mine.length ? <ArrowDown className="h-3.5 w-3.5" aria-hidden /> : null}
              {mine[i] ? `above ${mine[i]}` : 'first item'}
            </span>
          </button>
        ))}
      </div>

      {othersPlaced.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-2xs text-muted">Placed:</span>
          {othersPlaced.map((o) => (
            <Tag key={o.name}>
              {o.name}: {o.count}
            </Tag>
          ))}
        </div>
      )}
      <ActionError message={ctx.actionError} onDismiss={ctx.onDismissError} />
    </Stage>
  );
}