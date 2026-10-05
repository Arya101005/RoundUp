/**
 * Auction stage (Section 10.6). Phases: item_intro -> bidding -> reveal ->
 * round_results.
 *
 * Budgets and the current high bid are public; reference values stay hidden
 * until the reveal, which is what makes over- and under-shooting interesting.
 */
import { useEffect, useState } from 'react';
import { Gavel } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Timer } from '@/components/common/Timer';
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  nameMap,
  type StageContext,
} from '@/components/game/stage-context';
import {
  ActionError,
  Reveal,
  Stage,
  StageHeading,
  StatsGrid,
} from '@/components/game/stage-kit';
import { formatScore } from '@/utils/format';

export function AuctionStage({ ctx }: { ctx: StageContext }) {
  const { session, pub, players, meId, pending } = ctx;
  const names = nameMap(players);
  const phase = session.phase;

  const budgets = asRecord(pub.budgets);
  const itemName = asString(asRecord(pub.item).name, 'Mystery lot');
  const itemIndex = asNumber(pub.itemIndex, 0);
  const high = asRecord(pub.high);
  const highId = typeof high.bidderId === 'string' ? high.bidderId : null;
  const highAmount = asNumber(high.amount, 0);
  const minNextBid = asNumber(pub.minNextBid, 0);
  const bidSeconds = asNumber(pub.bidSeconds, 30);
  const sold = asArray(pub.sold).map((s) => asRecord(s));
  const revealed = asArray(pub.revealed).map((r) => asRecord(r));
  const acquired = asRecord(pub.acquired);
  const scoresThisRound = asRecord(pub.scoresThisRound);
  const totalScores = asRecord(pub.totalScores);

  const myBudget = meId ? asNumber(budgets[meId], 0) : 0;
  const iAmHigh = highId !== null && highId === meId;

  if (phase === 'reveal' || phase === 'round_results') {
    const rows = players.map((p) => ({
      label: p.displayName + (p.userId === meId ? ' (you)' : ''),
      value:
        phase === 'reveal'
          ? formatScore(Number(scoresThisRound[p.userId] ?? 0))
          : formatScore(Number(totalScores[p.userId] ?? 0)),
    }));
    return (
      <Stage>
        <StageHeading
          title={phase === 'reveal' ? 'Reference values' : 'Round results'}
          description="What each lot was actually worth."
        />
        <div className="rounded-md border border-line bg-elevated p-3">
          <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted">Lots</h3>
          <ul className="flex flex-col gap-1.5 text-sm">
            {revealed.map((r, i) => {
              const winner = typeof r.winnerId === 'string' ? r.winnerId : null;
              return (
                <li key={`${asString(r.name)}-${i}`} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-ink">{asString(r.name)}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-2xs text-muted">
                      {winner ? names[winner] ?? 'Someone' : 'no bids'}
                    </span>
                    <span className="font-semibold text-accent tabular">
                      {formatScore(asNumber(r.value, 0))}
                    </span>
                  </span>
                </li>
              );
            })}
            {revealed.length === 0 && <li className="text-xs text-muted">Nothing revealed yet.</li>}
          </ul>
        </div>
        <div className="rounded-md border border-line bg-elevated p-3">
          <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted">
            Value collected
          </h3>
          <StatsGrid
            rows={players.map((p) => ({
              label: p.displayName + (p.userId === meId ? ' (you)' : ''),
              value: formatScore(Number(acquired[p.userId] ?? 0)),
            }))}
          />
        </div>
        <StatsGrid rows={rows} />
        {phase === 'round_results' && (
          <p className="text-center text-sm text-muted">
            {session.roundIndex + 1 < session.totalRounds
              ? 'Next auction starting shortly...'
              : 'Final round complete.'}
          </p>
        )}
      </Stage>
    );
  }

  if (phase === 'item_intro') {
    return (
      <Stage>
        <StageHeading title={`Lot ${itemIndex + 1}`} description="Get ready to bid." />
        <Reveal label="up for auction" tone="accent" icon={<Gavel className="h-6 w-6" />}>
          {itemName}
        </Reveal>
        <StatsGrid
          rows={players.map((p) => ({
            label: p.displayName + (p.userId === meId ? ' (you)' : ''),
            value: formatScore(asNumber(budgets[p.userId], 0)),
          }))}
        />
        <p className="text-center text-sm text-muted">Bidding opens shortly...</p>
      </Stage>
    );
  }

  // bidding: the hard bid window is driven by the server's phase deadline,
  // so a refresh can never shorten or extend it.
  return (
    <Stage>
      <StageHeading
        title={`Bidding: ${itemName}`}
        description="Highest bid wins the lot. No bid can be entered once the bid window closes."
        action={<Timer endsAt={session.phaseEndsAt} label="Bid window" compact />}
      />
      <Reveal label="current high bid" tone={highId ? 'accent' : 'warning'}>
        {highId ? `${formatScore(highAmount)} - ${names[highId] ?? 'Someone'}` : 'No bids yet'}
      </Reveal>
      <BidPanel
        ctx={ctx}
        minNextBid={minNextBid}
        myBudget={myBudget}
        iAmHigh={iAmHigh}
        pending={pending === 'bid'}
      />
      {sold.length > 0 && (
        <div className="rounded-md border border-line bg-elevated p-3">
          <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted">
            Sold so far
          </h3>
          <ul className="flex flex-col gap-1 text-sm">
            {sold.slice(-6).map((s, i) => {
              const w = typeof s.winnerId === 'string' ? s.winnerId : null;
              return (
                <li key={`${asString(s.name)}-${i}`} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-ink">{asString(s.name)}</span>
                  <span className="shrink-0 text-2xs text-muted">
                    {w ? `${names[w] ?? 'Someone'} - ${formatScore(asNumber(s.amount, 0))}` : 'no bids'}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <ActionError message={ctx.actionError} onDismiss={ctx.onDismissError} />
      <p className="text-center text-2xs text-muted">
        The lot sells when the {bidSeconds} s bid window closes.
      </p>
    </Stage>
  );
}

function BidPanel({
  ctx,
  minNextBid,
  myBudget,
  iAmHigh,
  pending,
}: {
  ctx: StageContext;
  minNextBid: number;
  myBudget: number;
  iAmHigh: boolean;
  pending: boolean;
}) {
  const [amount, setAmount] = useState('');
  useEffect(() => {
    setAmount('');
  }, [minNextBid]);

  if (iAmHigh) {
    return (
      <p className="rounded-md border border-success/40 bg-success/10 px-3 py-3 text-center text-sm text-ink">
        You hold the highest bid. Wait for someone to raise you.
      </p>
    );
  }

  const value = Number(amount);
  const valid = Number.isInteger(value) && value >= minNextBid && value <= myBudget;
  const quick = [minNextBid, minNextBid + 100, minNextBid + 250].filter((v) => v <= myBudget);

  return (
    <div className="flex flex-col gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) void ctx.act('bid', { amount: value });
        }}
        className="flex flex-col gap-1.5"
      >
        <div className="flex gap-2">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, '').slice(0, 7))}
            disabled={pending}
            inputMode="numeric"
            placeholder={`${minNextBid}`}
            aria-label="Your bid"
            className="h-11 w-full rounded-md border border-line bg-elevated px-3 text-base text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none disabled:opacity-60"
          />
          <Button type="submit" loading={pending} disabled={!valid}>
            Place bid
          </Button>
        </div>
        <p className="text-2xs text-muted">
          Minimum {formatScore(minNextBid)} - your budget {formatScore(myBudget)}
          {amount && !valid && (
            <span className="ml-1 text-warning">
              {value > myBudget ? 'too high for your budget' : 'below the minimum'}
            </span>
          )}
        </p>
      </form>
      {quick.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {quick.map((q) => (
            <Button
              key={q}
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => void ctx.act('bid', { amount: q })}
            >
              Bid {formatScore(q)}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}