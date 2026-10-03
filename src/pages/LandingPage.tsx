import { Link } from 'react-router-dom';
import { ArrowRight, Copy, Gamepad2, Gauge, Layers, Sparkles, Users } from 'lucide-react';
import { PageShell } from '@/components/common/PageShell';
import { GameCard } from '@/components/common/GameCard';
import { brand } from '@/config/brand';
import { routes } from '@/config/routes';
import { gameRegistry } from '@shared/games/registry';

const steps = [
  { title: 'Create a room', body: 'Pick a game, theme, and difficulty. No signup needed.' },
  { title: 'Share the code', body: 'Send the 5-character code or the invite link to friends.' },
  { title: 'Get ready', body: 'Everyone joins with a display name and marks ready.' },
  { title: 'Play in real time', body: 'Rounds, timers, and scores stay in sync for every player.' },
] as const;

const features = [
  {
    icon: Users,
    title: 'Real-time multiplayer',
    body: 'Every action, turn, and score updates instantly for all players.',
  },
  {
    icon: Layers,
    title: 'Six games, one platform',
    body: 'Imposter, Heads Up, Password, Charades, Blind Ranking, and Auction.',
  },
  {
    icon: Gauge,
    title: 'Difficulty levels',
    body: 'Easy, medium, and hard change the content, not the rules.',
  },
  {
    icon: Sparkles,
    title: 'AI-assisted analysis',
    body: 'Strategy breakdowns after Blind Ranking and Auction rounds.',
  },
] as const;

export function LandingPage() {
  const games = Object.values(gameRegistry);

  return (
    <PageShell wide>
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40"
          style={{
            background:
              'radial-gradient(closest-side, color-mix(in srgb, var(--c-accent) 45%, transparent), transparent)',
          }}
        />
        <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center px-4 py-20 text-center sm:py-24">
          <h1 className="font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
            {brand.name}
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted">{brand.tagline}</p>
          <p className="mt-2 max-w-xl text-sm text-muted">{brand.description}</p>
          <div className="mt-8 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
            <Link
              to={routes.create}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-accent px-6 font-medium text-white transition hover:bg-accent-hover sm:w-auto"
            >
              Create Room
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              to={routes.join}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-line bg-elevated px-6 font-medium text-ink transition hover:border-accent/60 sm:w-auto"
            >
              Join Room
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="games-heading" className="mx-auto w-full max-w-6xl px-4 py-14">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 id="games-heading" className="font-display text-xl font-semibold text-ink">
              Games
            </h2>
            <p className="mt-1 text-sm text-muted">Six real-time games on one shared platform.</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((meta) => (
            <GameCard key={meta.id} meta={meta} />
          ))}
        </div>
      </section>

      <section aria-labelledby="how-heading" className="border-y border-line bg-surface/50">
        <div className="mx-auto w-full max-w-6xl px-4 py-14">
          <h2 id="how-heading" className="font-display text-xl font-semibold text-ink">
            How it works
          </h2>
          <ol className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, i) => (
              <li key={step.title} className="flex flex-col gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-line bg-surface text-xs font-semibold text-accent tabular">
                  {i + 1}
                </span>
                <h3 className="font-display text-sm font-semibold text-ink">{step.title}</h3>
                <p className="text-sm text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="features-heading" className="mx-auto w-full max-w-6xl px-4 py-14">
        <h2 id="features-heading" className="font-display text-xl font-semibold text-ink">
          Built for groups
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {features.map((feature) => (
            <div key={feature.title} className="flex gap-3 rounded-lg border border-line bg-surface p-4">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line bg-elevated text-accent">
                <feature.icon className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <h3 className="font-display text-sm font-semibold text-ink">{feature.title}</h3>
                <p className="mt-0.5 text-sm text-muted">{feature.body}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-8 flex items-center justify-center gap-2 text-sm text-muted">
          <Gamepad2 className="h-4 w-4" aria-hidden />
          <span>No accounts, no downloads. Just a room code.</span>
          <Copy className="hidden h-4 w-4 sm:block" aria-hidden />
        </div>
      </section>
    </PageShell>
  );
}
