/**
 * Password stage (Section 10.3). Phases: clue -> guess -> round_results.
 *
 * Only the clue giver sees the secret word (view.secret). Guessers on the
 * active team submit guesses; everyone else watches.
 */
import { useState } from 'react';
import {
  asArray,
  asBoolean,
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

export function PasswordStage({ ctx }: { ctx: StageContext }) {
  const { session, pub, view, players } = ctx;
  const names = nameMap(players);
  const phase = session.phase;

  const role = asString(view.role);
  const secret = asString(view.secret);
  const giverId = typeof pub.giverId === 'string' ? pub.giverId : null;
  const activeTeam = typeof pub.activeTeam === 'string' ? pub.activeTeam : null;
  const giverName = giverId ? names[giverId] ?? 'Someone' : 'Someone';
  const teamName = activeTeam === 'a' ? 'Team A' : 'Team B';

  const clues = asArray(pub.clues)
    .map((c) => asRecord(c))
    .filter((c) => typeof c.text === 'string')
    .map((c) => ({ text: c.text as string, byId: typeof c.byId === 'string' ? c.byId : '' }));
  const guessFeed = asArray(pub.guessFeed)
    .map((g) => asRecord(g))
    .filter((g) => typeof g.byId === 'string' && typeof g.text === 'string')
    .map((g) => ({ byId: g.byId as string, text: g.text as string, near: g.near === true }));

  const teamTotals = asRecord(pub.teamTotals);
  const scoresThisRound = asRecord(pub.scoresThisRound);
  const word = typeof pub.word === 'string' ? pub.word : null;
  const wordOver = asRecord(pub.wordOver);

  if (phase === 'round_results') {
    return (
      <Stage>
        <StageHeading title="Round results" description="Team standings and what was solved." />
        <StatsGrid
          rows={[
            { label: 'Team A', value: formatScore(Number(teamTotals.a ?? 0)) },
            { label: 'Team B', value: formatScore(Number(teamTotals.b ?? 0)) },
            { label: 'This round A', value: formatScore(Number(scoresThisRound.a ?? 0)) },
            { label: 'This round B', value: formatScore(Number(scoresThisRound.b ?? 0)) },
          ]}
        />
        {Object.keys(wordOver).length > 0 && (
          <Reveal
            label={asBoolean(wordOver.solved) ? 'solved' : 'unsolved word'}
            tone={asBoolean(wordOver.solved) ? 'success' : 'warning'}
          >
            {word ?? '—'}
          </Reveal>
        )}
        <p className="text-center text-sm text-muted">
          {session.roundIndex + 1 < session.totalRounds
            ? 'Next round starting shortly…'
            : 'Final round complete.'}
        </p>
      </Stage>
    );
  }

  if (phase === 'clue') {
    return (
      <Stage>
        <StageHeading
          title={`${teamName}: ${giverName} gives a clue`}
          description={
            role === 'giver'
              ? 'One word only. It cannot be the secret, a variation of it, or repeat a clue.'
              : 'Listen for the clue, then get ready to guess.'
          }
          action={<Tag tone={activeTeam === 'a' ? 'accent' : 'warning'}>{teamName}</Tag>}
        />
        {role === 'giver' ? (
          <>
            <Reveal label="secret word" tone="success">
              {secret}
            </Reveal>
            <ClueInput ctx={ctx} />
          </>
        ) : (
          <Reveal label="secret word" tone="warning">
            hidden
          </Reveal>
        )}
        <ClueList clues={clues} names={names} />
        <ActionError message={ctx.actionError} onDismiss={ctx.onDismissError} />
      </Stage>
    );
  }

  // guess
  return (
    <Stage>
      <StageHeading
        title={`${teamName} is guessing`}
        description={
          role === 'guesser'
            ? 'Use the clues to name the word. First correct solve scores the most.'
            : role === 'giver'
              ? 'Your team is guessing — stay quiet and hope they get it.'
              : 'The other team has the word. Watch and wait.'
        }
        action={<Tag tone={activeTeam === 'a' ? 'accent' : 'warning'}>{teamName}</Tag>}
      />
      <ClueList clues={clues} names={names} />
      {role === 'guesser' ? <GuessInput ctx={ctx} /> : <Reveal label="secret word" tone="warning">hidden</Reveal>}
      <GuessFeed items={guessFeed} names={names} emptyText="No guesses yet." />
      <ActionError message={ctx.actionError} onDismiss={ctx.onDismissError} />
    </Stage>
  );
}

function ClueList({
  clues,
  names,
}: {
  clues: { text: string; byId: string }[];
  names: Record<string, string>;
}) {
  if (clues.length === 0) {
    return <p className="text-center text-sm text-muted">No clues yet.</p>;
  }
  return (
    <div className="rounded-md border border-line bg-elevated p-3">
      <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted">Clues</h3>
      <ul className="flex flex-col gap-1.5">
        {clues.map((c, i) => (
          <li key={i} className="text-sm">
            <span className="text-muted">{names[c.byId] ?? 'Someone'}:</span>{' '}
            <span className="font-medium text-ink">{c.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ClueInput({ ctx }: { ctx: StageContext }) {
  const [text, setText] = useState('');
  return (
    <InputRow
      value={text}
      onChange={setText}
      onSubmit={() => void ctx.act('clue', { text })}
      placeholder="One-word clue"
      submitLabel="Send clue"
      pending={ctx.pending === 'clue'}
      maxLength={40}
      hint="A single word, letters only."
    />
  );
}

function GuessInput({ ctx }: { ctx: StageContext }) {
  const [word, setWord] = useState('');
  return (
    <InputRow
      value={word}
      onChange={setWord}
      onSubmit={() => void ctx.act('guess', { word })}
      placeholder="Guess the word"
      submitLabel="Guess"
      pending={ctx.pending === 'guess'}
      maxLength={60}
    />
  );
}