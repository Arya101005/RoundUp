/**
 * Charades stage (Section 10.4). Phases: perform -> turn_reveal -> round_results.
 *
 * The prompt lives only in the performer's private view. Teammates guess it in
 * text while the performer acts over the group call; spectators cannot guess.
 */
import { useState } from 'react';
import { SkipForward, Square } from 'lucide-react';
import { Button } from '@/components/common/Button';
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

export function CharadesStage({ ctx }: { ctx: StageContext }) {
  const { session, pub, view, players, act, pending } = ctx;
  const names = nameMap(players);
  const phase = session.phase;

  const role = asString(view.role);
  const secret = asString(view.secret);
  const performerId = typeof pub.performerId === 'string' ? pub.performerId : null;
  const activeTeam = typeof pub.activeTeam === 'string' ? pub.activeTeam : null;
  const performerName = performerId ? names[performerId] ?? 'Someone' : 'Someone';
  const teamName = activeTeam === 'a' ? 'Team A' : 'Team B';

  const guessFeed = asArray(pub.guessFeed)
    .map((g) => asRecord(g))
    .filter((g) => typeof g.byId === 'string' && typeof g.text === 'string')
    .map((g) => ({ byId: g.byId as string, text: g.text as string, near: g.near === true }));

  const teamTotals = asRecord(pub.teamTotals);
  const scoresThisRound = asRecord(pub.scoresThisRound);
  const word = typeof pub.word === 'string' ? pub.word : null;
  const turnOver = asRecord(pub.turnOver);

  if (phase === 'round_results') {
    return (
      <Stage>
        <StageHeading title="Round results" description="Team standings for this round." />
        <StatsGrid
          rows={[
            { label: 'Team A', value: formatScore(Number(teamTotals.a ?? 0)) },
            { label: 'Team B', value: formatScore(Number(teamTotals.b ?? 0)) },
            { label: 'This round A', value: formatScore(Number(scoresThisRound.a ?? 0)) },
            { label: 'This round B', value: formatScore(Number(scoresThisRound.b ?? 0)) },
          ]}
        />
        <p className="text-center text-sm text-muted">
          {session.roundIndex + 1 < session.totalRounds
            ? 'Next round starting shortly…'
            : 'Final round complete.'}
        </p>
      </Stage>
    );
  }

  if (phase === 'turn_reveal') {
    const solved = asBoolean(turnOver.solved);
    return (
      <Stage>
        <StageHeading title="The prompt was" description="How that performance went." />
        <Reveal label={solved ? 'solved' : 'unsolved'} tone={solved ? 'success' : 'warning'}>
          {word ?? '—'}
        </Reveal>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Tag tone={solved ? 'success' : 'warning'}>{solved ? 'Got it!' : 'No solve'}</Tag>
          <Tag>{formatScore(Number(turnOver.points ?? 0))} points</Tag>
        </div>
        <p className="text-center text-sm text-muted">Next turn starting shortly…</p>
      </Stage>
    );
  }

  // perform
  return (
    <Stage>
      <StageHeading
        title={role === 'performer' ? 'Your turn to act' : `${performerName} is performing`}
        description={
          role === 'performer'
            ? 'Act it out on your call. Your teammates type what they think it is.'
            : role === 'guesser'
              ? `Team ${teamName === 'Team A' ? 'A' : 'B'} — type your guesses.`
              : 'The other team has the word right now. You are not guessing this turn.'
        }
        action={<Tag tone={activeTeam === 'a' ? 'accent' : 'warning'}>{teamName}</Tag>}
      />

      {role === 'performer' ? (
        <>
          <Reveal label="your prompt" tone="success">
            {secret}
          </Reveal>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              icon={<SkipForward className="h-4 w-4" aria-hidden />}
              loading={pending === 'skip'}
              onClick={() => void act('skip')}
            >
              Skip prompt
            </Button>
            <Button
              variant="danger"
              icon={<Square className="h-4 w-4" aria-hidden />}
              loading={pending === 'end_turn'}
              onClick={() => void act('end_turn')}
            >
              End turn
            </Button>
          </div>
          <p className="text-center text-xs text-muted">
            Skipping costs the team points. Only your team can guess.
          </p>
        </>
      ) : role === 'guesser' ? (
        <>
          <Reveal label="prompt hidden" tone="warning">
            ——
          </Reveal>
          <GuessInput ctx={ctx} />
        </>
      ) : (
        <Reveal label="opposing team" tone="warning">
          watch
        </Reveal>
      )}

      <GuessFeed items={guessFeed} names={names} emptyText="No guesses yet." />
      <ActionError message={ctx.actionError} onDismiss={ctx.onDismissError} />
    </Stage>
  );
}

function GuessInput({ ctx }: { ctx: StageContext }) {
  const [word, setWord] = useState('');
  return (
    <InputRow
      value={word}
      onChange={setWord}
      onSubmit={() => void ctx.act('guess', { word })}
      placeholder="What is being acted out?"
      submitLabel="Guess"
      pending={ctx.pending === 'guess'}
      maxLength={60}
    />
  );
}