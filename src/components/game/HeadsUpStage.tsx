/**
 * Heads Up stage (Section 10.2). Phases: turn -> round_results.
 *
 * The active player cannot see their own word; everyone else can (their own
 * private view lists every *other* player's word, so the active player's word
 * is already on every other screen).
 */
import { useState } from 'react';
import { EyeOff, Mic } from 'lucide-react';
import { Button } from '@/components/common/Button';
import {
  asArray,
  asRecord,
  asString,
  nameMap,
  type StageContext,
} from '@/components/game/stage-context';
import {
  ActionError,
  GuessFeed,
  InputRow,
  Reveal,
  Stage,
  StageHeading,
  StatsGrid,
  Tag,
} from '@/components/game/stage-kit';
import { formatScore } from '@/utils/format';

export function HeadsUpStage({ ctx }: { ctx: StageContext }) {
  const { session, pub, view, players, meId } = ctx;
  const names = nameMap(players);
  const phase = session.phase;

  const currentId = typeof pub.currentId === 'string' ? pub.currentId : null;
  const finishedIds = asArray(pub.finishedIds).filter((x): x is string => typeof x === 'string');
  const guessFeed = asArray(pub.guessFeed)
    .map((g) => asRecord(g))
    .filter((g) => typeof g.byId === 'string' && typeof g.text === 'string')
    .map((g) => ({ byId: g.byId as string, text: g.text as string, near: g.near === true }));
  const lastAnswers = asRecord(pub.lastAnswers);

  if (phase === 'round_results') {
    const scoresThisRound = asRecord(pub.scoresThisRound);
    const assignments = asRecord(pub.assignments);
    const rows = players.map((p) => ({
      label: p.displayName + (p.userId === meId ? ' (you)' : ''),
      value: formatScore(Number(scoresThisRound[p.userId] ?? 0)),
    }));
    return (
      <Stage>
        <StageHeading title="Round results" description="All words revealed." />
        <div className="rounded-md border border-line bg-elevated p-3">
          <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted">Words</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {players.map((p) => (
              <li key={p.userId} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-ink">{p.displayName}</span>
                <span className="truncate font-medium text-accent">
                  {asString(assignments[p.userId], '—')}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <StatsGrid rows={rows} />
        <p className="text-center text-sm text-muted">
          {session.roundIndex + 1 < session.totalRounds
            ? 'Next round starting shortly…'
            : 'Final round complete.'}
        </p>
      </Stage>
    );
  }

  // turn
  const activeName = currentId ? names[currentId] ?? 'Someone' : 'Someone';
  const iAmActive = currentId === meId;
  const theirWord = currentId ? asString(asRecord(view.assignments)[currentId]) : '';
  const othersRemaining = players.filter((p) => p.userId !== meId && !finishedIds.includes(p.userId));

  return (
    <Stage>
      <StageHeading
        title={iAmActive ? 'Your turn — guess your word' : `${activeName} is on air`}
        description={
          iAmActive
            ? 'Ask yes/no questions in the chat, then guess. Wrong guesses cost points.'
            : `You can see ${activeName}'s word. Answer their questions.`
        }
        action={
          currentId ? (
            <Tag tone={iAmActive ? 'accent' : 'neutral'}>
              <Mic className="h-3 w-3" aria-hidden /> {activeName}
            </Tag>
          ) : undefined
        }
      />

      {iAmActive ? (
        <Reveal label="your word is hidden" tone="warning" icon={<EyeOff className="h-6 w-6" />}>
          ???
        </Reveal>
      ) : theirWord ? (
        <Reveal label={`${activeName}'s word`} tone="success">
          {theirWord}
        </Reveal>
      ) : (
        <Reveal label="word hidden" tone="warning">
          ——
        </Reveal>
      )}

      {iAmActive ? (
        <GuessInput ctx={ctx} />
      ) : (
        <AnswerButtons ctx={ctx} lastAnswers={lastAnswers} disabled={!currentId} />
      )}

      <GuessFeed items={guessFeed} names={names} emptyText="No guesses yet." />

      {finishedIds.length > 0 && (
        <p className="text-center text-xs text-muted">
          Solved: {finishedIds.map((id) => names[id] ?? 'Someone').join(', ')}
        </p>
      )}
      {!iAmActive && othersRemaining.length > 0 && currentId && (
        <p className="text-center text-xs text-muted">
          Still to play: {othersRemaining.map((p) => p.displayName).join(', ')}
        </p>
      )}
      <ActionError message={ctx.actionError} onDismiss={ctx.onDismissError} />
    </Stage>
  );
}

function GuessInput({ ctx }: { ctx: StageContext }) {
  const [guess, setGuess] = useState('');
  return (
    <InputRow
      value={guess}
      onChange={setGuess}
      onSubmit={() => void ctx.act('guess', { word: guess })}
      placeholder="Guess your word"
      submitLabel="Guess"
      pending={ctx.pending === 'guess'}
      maxLength={60}
      hint="You have a limited number of guesses per turn."
    />
  );
}

function AnswerButtons({
  ctx,
  lastAnswers,
  disabled,
}: {
  ctx: StageContext;
  lastAnswers: Record<string, unknown>;
  disabled: boolean;
}) {
  const options = [
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
    { value: 'unknown', label: "Don't know" },
  ] as const;
  const mine = typeof lastAnswers[ctx.meId ?? ''] === 'string' ? lastAnswers[ctx.meId ?? ''] : null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-center text-sm text-muted">Answer the player on air:</p>
      <div className="grid grid-cols-3 gap-2">
        {options.map((o) => (
          <Button
            key={o.value}
            variant={mine === o.value ? 'primary' : 'secondary'}
            disabled={disabled}
            loading={ctx.pending === 'answer' && mine !== o.value}
            onClick={() => void ctx.act('answer', { value: o.value })}
          >
            {o.label}
          </Button>
        ))}
      </div>
    </div>
  );
}