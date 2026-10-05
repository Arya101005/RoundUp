/**
 * Imposter stage (Section 10.1). Phases: role_reveal -> discussion -> voting
 * -> vote_reveal -> [imposter_guess] -> round_results.
 */
import { useEffect, useState } from 'react';
import { Skull, UserCheck } from 'lucide-react';
import { Button } from '@/components/common/Button';
import {
  asBoolean,
  asNullableString,
  asNumber,
  asRecord,
  asString,
  nameMap,
  type StageContext,
} from '@/components/game/stage-context';
import {
  ActionError,
  InputRow,
  PlayerOption,
  Reveal,
  Stage,
  StageHeading,
  StatsGrid,
  Tag,
} from '@/components/game/stage-kit';
import { formatScore } from '@/utils/format';

export function ImposterStage({ ctx }: { ctx: StageContext }) {
  const { session, pub, view, players, meId, act, pending } = ctx;
  const names = nameMap(players);
  const phase = session.phase;

  const role = asString(view.role);
  const isImposter = role === 'imposter';
  const secret = asString(view.secret);
  const category = asString(view.category);
  const word = asNullableString(pub.word);
  const caughtId = asNullableString(pub.caughtId);
  const tally = asRecord(pub.voteTally);
  const scoresThisRound = asRecord(pub.scoresThisRound);
  // Turn-based discussion: the engine rotates the speaker; free chat has no
  // speaker. Show who is speaking so a refresh never loses the turn pointer.
  const speakerId = asNullableString(pub.speakerId);
  const discussionMode = asString(view.discussionMode, 'turn_based');

  // Free chat has no speaker; turn-based rotates mechanically or hands the
  // next turn to the host when the expiry policy is 'host'.
  const isTurnBased = discussionMode === 'turn_based';
  const speaking = isTurnBased && speakerId ? names[speakerId] ?? 'Someone' : null;

  // Votes are only published once voting closes, so the local selection stands
  // in until then. Cleared whenever we leave the voting phase.
  const turnSeconds = asNumber(pub.turnSeconds, 15);
  const [myVote, setMyVote] = useState<string | null>(null);
  useEffect(() => {
    if (phase !== 'voting') setMyVote(null);
  }, [phase]);

  if (phase === 'role_reveal') {
    return (
      <Stage>
        <StageHeading
          title="Roles are dealt"
          description="Check your secret below. Keep it to yourself."
        />
        {isImposter ? (
          <>
            <Reveal label="your role" tone="danger" icon={<Skull className="h-6 w-6 text-danger" />}>
              Imposter
            </Reveal>
            <p className="text-center text-sm text-muted">
              You do not know the secret word. Blend in, and if you get caught you will get one
              chance to name it.
              {asString(view.theme) ? ` The theme is ${asString(view.theme)}.` : ''}
            </p>
          </>
        ) : (
          <>
            <Reveal label={`secret word · ${category || 'category hidden'}`} tone="success">
              {secret}
            </Reveal>
            <p className="text-center text-sm text-muted">
              Describe it without saying it. Do not vote for yourself.
            </p>
          </>
        )}
      </Stage>
    );
  }

  if (phase === 'discussion') {
    return (
      <Stage>
        <StageHeading
          title="Discussion"
          description={
            isTurnBased
              ? 'Each player speaks in turn, ' + turnSeconds + ' s per statement. The host ends discussion & votes.'
              : 'Talk it out in the chat. The host moves on to voting when ready.'
          }
          action={
            isTurnBased
              ? (
                  <>
                    <Tag>Turn-based · {speaking ?? 'no speaker'}</Tag>
                    <Button onClick={() => void act('end_turn')} loading={pending === 'end_turn'}>
                      End turn & vote
                    </Button>
                  </>
                )
              : (
                  <Button onClick={() => void act('end_discussion')} loading={pending === 'end_discussion'}>
                    End discussion & vote
                  </Button>
                )
          }
        />
        {speaking && (
          <p className="text-sm text-muted">
            <span className="font-medium text-ink">{speaking}</span> is speaking.
          </p>
        )}
        {secret && (
          <Reveal label="your secret word" tone="success">
            {secret}
          </Reveal>
        )}
        {isImposter && (
          <Reveal label="your role" tone="danger" icon={<Skull className="h-6 w-6 text-danger" />}>
            Imposter
          </Reveal>
        )}
        <ActionError message={ctx.actionError} onDismiss={ctx.onDismissError} />
      </Stage>
    );
  }

  if (phase === 'voting') {
    const total = players.length;
    return (
      <Stage>
        <StageHeading
          title="Vote for the imposter"
          description="Pick who you think is the imposter. You cannot vote for yourself."
        />
        <div className="grid gap-2 sm:grid-cols-2">
          {players.map((p) => (
            <PlayerOption
              key={p.userId}
              player={p}
              meId={meId}
              selected={myVote === p.userId}
              disabled={p.userId === meId || ctx.pending === 'vote'}
              onClick={() => {
                setMyVote(p.userId);
                void act('vote', { targetId: p.userId });
              }}
              hint={p.userId === meId ? 'That is you' : undefined}
            />
          ))}
        </div>
        <p className="text-center text-xs text-muted">
          {myVote
            ? `You voted for ${names[myVote] ?? 'someone'}. `
            : 'Pick someone above. '}
          Waiting for all {total} players to vote…
        </p>
        <ActionError message={ctx.actionError} onDismiss={ctx.onDismissError} />
      </Stage>
    );
  }

  if (phase === 'vote_reveal') {
    return (
      <Stage>
        <StageHeading title="The vote is in" description="Here is how the room voted." />
        <Reveal label="secret word" tone="success">
          {word ?? secret ?? '—'}
        </Reveal>
        {caughtId ? (
          <Reveal
            label="caught"
            tone="danger"
            icon={<UserCheck className="h-6 w-6 text-danger" />}
          >
            {names[caughtId] ?? 'Someone'}
          </Reveal>
        ) : (
          <Reveal label="result" tone="warning">
            Nobody was caught
          </Reveal>
        )}
        <div className="rounded-md border border-line bg-elevated p-3">
          <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted">Votes</h3>
          {Object.keys(tally).length === 0 ? (
            <p className="text-xs text-muted">No votes recorded.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {Object.entries(tally)
                .sort((a, b) => Number(b[1]) - Number(a[1]))
                .map(([id, count]) => (
                  <li key={id} className="flex items-center justify-between">
                    <span className="text-ink">{names[id] ?? 'Someone'}</span>
                    <span className="text-muted tabular">{String(count)}</span>
                  </li>
                ))}
            </ul>
          )}
        </div>
        <ActionError message={ctx.actionError} onDismiss={ctx.onDismissError} />
      </Stage>
    );
  }

  if (phase === 'imposter_guess') {
    return (
      <Stage>
        <StageHeading
          title="The imposter gets one guess"
          description="Name the secret word to salvage the round."
        />
        {isImposter ? (
          <ImposterGuess ctx={ctx} />
        ) : (
          <Reveal label="secret word" tone="success">
            {word ?? secret ?? '—'}
          </Reveal>
        )}
        <ActionError message={ctx.actionError} onDismiss={ctx.onDismissError} />
      </Stage>
    );
  }

  // round_results
  const guessOk = asBoolean(pub.guessOk, false);
  const rows = Object.entries(scoresThisRound).map(([id, points]) => ({
    label: names[id] ?? 'Player',
    value: <span className={Number(points) > 0 ? 'text-success' : undefined}>{formatScore(Number(points))}</span>,
  }));

  return (
    <Stage>
      <StageHeading title="Round results" description="What this round decided." />
      <div className="flex flex-wrap items-center justify-center gap-2">
        {caughtId ? (
          <Tag tone="danger">{names[caughtId] ?? 'Someone'} was caught</Tag>
        ) : (
          <Tag tone="success">The imposter survived</Tag>
        )}
        {caughtId && (
          <Tag tone={guessOk ? 'success' : 'warning'}>
            {guessOk ? 'The imposter guessed it right' : 'The imposter guessed wrong'}
          </Tag>
        )}
      </div>
      <Reveal label="secret word" tone="success">
        {word ?? '—'}
      </Reveal>
      {rows.length > 0 && (
        <div>
          <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted">
            Points this round
          </h3>
          <StatsGrid rows={rows} />
        </div>
      )}
      {session.roundIndex + 1 < session.totalRounds ? (
        <p className="text-center text-sm text-muted">Next round starting shortly…</p>
      ) : (
        <p className="text-center text-sm text-muted">Final round complete.</p>
      )}
    </Stage>
  );
}

function ImposterGuess({ ctx }: { ctx: StageContext }) {
  const [word, setWord] = useState('');
  return (
    <InputRow
      value={word}
      onChange={setWord}
      onSubmit={() => void ctx.act('guess', { word })}
      placeholder="Type the secret word"
      submitLabel="Guess"
      pending={ctx.pending === 'guess'}
      maxLength={40}
      hint="One word, any spelling."
    />
  );
}