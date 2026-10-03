# RoundUp

Real-time multiplayer party games platform. Create a private room, share a 5-character
code or link, join as a guest (no signup), and play six games together:

**Imposter · Heads Up · Password · Charades · Blind Ranking · Auction**

One shared engine platform — not six apps. The spec that drives this repository lives in
[MASTER_SPEC.md](MASTER_SPEC.md); resolved ambiguities are logged in [DECISIONS.md](DECISIONS.md).

## Architecture

```
Browser (React + Vite + Tailwind)
  |-- fetch --> Edge Functions (Deno, JWT verified, Zod validated, rate limited)
  |                |-- load state (service role) --> pure Engine --> apply_game_action() RPC
  |                |      (optimistic concurrency: version check, 3 retries, atomic commit)
  |                |-- writes: game_sessions.public_state, player_views, game_events, chat
  |<-- Realtime Postgres Changes (RLS filtered) -- Postgres
  |<-- Presence (online status) / Broadcast (typing only)
pg_cron (every 5 s) --> sweeper --> game-tick for expired sessions
```

Anti-leak split: `game_state_secure` holds every secret (service-role only, no RLS
policies), `game_sessions.public_state` holds what everyone may see, and `player_views`
holds each player's private projection (owner-only SELECT).

## Commands

```bash
npm install
npm run dev        # local dev server
npm run typecheck  # app + node + edge function TypeScript
npm run lint
npm test           # Vitest unit tests
npm run build      # production build
npm run test:e2e   # Playwright (needs a running Supabase; see SETUP.md)
```

## Layout

```
src/            React app (pages, components, services, hooks, store, config)
supabase/
  migrations/   0001-0009: tables, RLS, functions, realtime, cron
  functions/    Edge functions + _shared/ (pure TS: engines, matching, content, http)
tests/          unit (Vitest), e2e (Playwright), setup
.github/        CI: typecheck, lint, test, build
```

## Status

Phases 1-2 complete: design system, routes, migrations, RLS, room/lobby/chat/realtime,
reconnection via `get-snapshot`, presence. Engine framework (Phase 3), content pipeline
(Phase 4), the six games (Phase 5), AI evaluation (Phase 6), hardening and deploy
(Phases 7-8) follow in that order per MASTER_SPEC section 20.

Setup against a real Supabase project: [SETUP.md](SETUP.md).
