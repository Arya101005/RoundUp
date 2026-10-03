# MASTER SPEC: "Parlor" Real-Time Multiplayer Party Games Platform

> Save this file in the repo root as `MASTER_SPEC.md` (and reference it from `AGENTS.md` / `CLAUDE.md` / `.cursorrules`). It is the single source of truth. When anything is ambiguous, follow Section 2 (Resolved Decisions). If still ambiguous, choose the simplest option that satisfies the Non-Negotiables, record the choice in `DECISIONS.md`, and continue. Do not stop to ask unless a human-only action is required (Section 22).

---

## 0. YOUR ROLE AND OPERATING RULES

You are a senior full-stack engineer, realtime-systems architect, database engineer, UI/UX designer, and QA engineer. You will build a complete, deployable, production-quality web app. It is NOT a mockup or prototype.

**Operating rules (apply for the whole project):**

1. Work in the phases of Section 20. Never start a phase until the previous phase's **gate** passes.
2. After every phase run, and fix until green: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`. Then commit with a clear message and print a short phase report: what was built, how it was verified, known gaps.
3. The app must stay runnable after every phase. Never replace working functionality with mocks, stubs, or TODOs.
4. No placeholder buttons, fake data, fake AI output, fake players, hardcoded scores or room state, "Coming soon" labels, or dead links. If a feature is not built, it is not shown.
5. No emojis anywhere (UI, code comments, commit messages, copy, seed data). Use `lucide-react` icons.
6. Never put secrets in the frontend bundle, in git, or in `VITE_*` variables.
7. Keep files small and cohesive (target under 300 lines; split otherwise). No giant switch statements on game id outside the engine registry.
8. Prefer boring, well-understood solutions. Do not add abstractions that are not used by at least two call sites.
9. Verify by running things. Do not claim something works unless you executed the test or flow that proves it. If a verification is impossible in your environment, say so explicitly and provide the exact manual steps.
10. When you hit an error, find the root cause. Do not suppress errors, disable lint rules, use `any`/`@ts-ignore` to silence problems, or delete failing tests.

---

## 1. PRODUCT SUMMARY

A web app where friends create a private room, share a 5-character code or link, join as guests (no signup), pick a game and settings, and play fully online in real time.

Working name: **Parlor** (define once in `src/config/brand.ts`; never hardcode the name elsewhere).

Games (six pluggable engines on ONE shared platform; never six separate apps):

1. Imposter (free-for-all, social deduction)
2. Heads Up (online deduction, strict turns)
3. Password (teams, one-word clues)
4. Charades (teams, performer vs guessers)
5. Blind Ranking (individual, simultaneous)
6. Auction (individual, real-time bidding)

Core flow: Landing -> Create/Join -> Lobby -> Host picks game and settings -> Content preparation -> Game start -> Rounds with realtime play -> Round results -> Next round -> Final leaderboard -> Play Again / Return to Lobby / Leave.

---

## 2. RESOLVED DECISIONS (the original brief had gaps and contradictions; these settle them)

| Topic | Decision |
| --- | --- |
| Identity | Supabase **anonymous sign-in** (guest). Identity persists across refresh via the Supabase session. No email/password. Display name is per room. |
| Where is the game server? | There is no long-running server. **Supabase Edge Functions (Deno) + Postgres** form the authoritative game server. State lives in Postgres; every action is a stateless function call that loads state, runs the pure engine, and commits with optimistic concurrency. |
| How do clients get updates without leaks? | **Supabase Realtime Postgres Changes** on tables protected by RLS (public state table, per-player private view table, chat, room players). Plus **Presence** for online status and **Broadcast** only for harmless ephemeral signals (typing). Secrets are never in any table a client can read other than the owner's own private view. |
| Timers | Server stores `phase_started_at` / `phase_ends_at`. Clients render countdowns from a server-clock offset. Expiry is resolved by (a) idempotent client-triggered `game-tick` calls at `ends_at` plus random jitter, (b) lazy tick at the start of every action, and (c) a `pg_cron` sweeper every 5 seconds as the safety net. |
| Heads Up "private word" | The server NEVER sends a player their OWN word; it sends them everyone else's words. (Otherwise there is no deduction game.) |
| Charades online | The platform does not stream video. Performers act over the group's own video call or in person. Show a clear notice in the Charades lobby and rules panel. Do NOT build WebRTC. |
| Blind Ranking reference ranking | Every ranking set has an explicit **criterion** (e.g. "Population, highest first") and each item has a numeric `reference_value`. The criterion is announced before the first item. Reference order is derived by sorting the values, never by asking an LLM to rank. |
| Auction reference values | Each item has a hidden numeric `reference_value` (revealed at the end). Used only for objective scoring. |
| "No hardcoded content database" vs. resilience | No large static lists. Content comes from providers (cache, external APIs, AI). A tiny **emergency seed** (about 25 verified items per theme per game type, in `config/seed/`) exists ONLY as the last-resort fallback so a game never dies; it is clearly labelled `source: "seed"` in code and data. |
| Embeddings | Use Supabase's built-in `gte-small` (384-dim) via `Supabase.ai.Session` in Edge Functions, stored in pgvector. Used for (a) semantic duplicate detection of content, (b) "close" feedback on guesses. Embeddings never auto-accept a guess for named entities (see Section 13). |
| Privacy / Terms | Implement short, truthful `/privacy` and `/terms` pages (what is stored: guest display name, chat messages, gameplay data; no ads; no tracking beyond Vercel/Supabase operational logs). No dead links. |
| Test bots | Bot clients exist ONLY in `scripts/` and tests for automated multiplayer verification. They are never part of the product UI. |
| Light mode | Dark-first. Light theme is implemented via the same design tokens with a persisted toggle. |
| Imposter count | Exactly 1 imposter per round in v1 (do not expose a multi-imposter setting). |
| Team games | Exactly 2 teams in v1. Teams have 2 to 5 players each. Total players even, minimum 4, maximum 10. |

---

## 3. TECH STACK (pin versions in package.json; commit the lockfile)

**Frontend:** React 18+, TypeScript (`strict: true`, `noUncheckedIndexedAccess: true`), Vite, React Router, Tailwind CSS, Radix UI primitives (accessible Dialog, Toast, Tooltip, Tabs, Switch, Select), `lucide-react`, TanStack Query (server snapshots), a tiny Zustand store (UI/ephemeral state only), Zod (shared schemas), Framer Motion only for phase transitions (respect `prefers-reduced-motion`).

**Backend:** Supabase (Postgres, Realtime, Auth anonymous, Edge Functions, pg_cron, pg_net, pgvector, Vault). Supabase CLI for migrations and local dev.

**Testing:** Vitest (unit + integration), Playwright (multi-browser-context e2e), `@axe-core/playwright` (a11y).

**Tooling:** ESLint, Prettier, GitHub Actions CI (typecheck, lint, test, build), Vercel (or Cloudflare Pages) for the frontend with SPA rewrites.

**Shared code rule:** all engine, matcher, scoring, schema, and content-validation code is **pure TypeScript with no Node or Deno APIs**, located in `supabase/functions/_shared/`. Edge Functions import it directly; Vitest runs it in Node; the frontend imports **types and constants only** via a Vite/TS path alias. Use an import map (`deno.json`) mapping `zod` to `npm:zod@3` so the same import works in Deno and Node. Engines receive `now` and `rng` as injected parameters (seedable RNG) so every test is deterministic.

---

## 4. ARCHITECTURE

```
Browser (React)
  |-- rpc/fetch --> Edge Functions (JWT verified, Zod validated, rate limited)
  |                    |-- load state (service role) -> pure Engine -> commit via apply_game_action() RPC
  |                    |-- writes: game_sessions.public_state, player_views, game_events, chat, scores
  |<-- Realtime Postgres Changes (RLS filtered) -- Postgres
  |<-- Presence (online users) / Broadcast (typing only)
pg_cron (every 5 s) --> sweeper function --> game-tick for any session with phase_ends_at < now()
```

### 4.1 State split (the anti-leak core)

| Table | Contents | Client access |
| --- | --- | --- |
| `game_state_secure` | Full authoritative engine state including all secrets | **None** (no RLS policies; service role only) |
| `game_sessions.public_state` | Everything every room member may see | Room members: SELECT |
| `player_views` | Per-player private projection (`getPrivateState`) | Owner only: SELECT |

Engines expose `getPublicState(state)` and `getPrivateState(state, playerId)`. After every committed action the server writes the new public state and each player's private view. Secrets move into public state ONLY when the engine explicitly reveals them (round end).

### 4.2 Action pipeline (`game-action` function)

1. Verify JWT; derive `userId` from the token, NEVER from the request body.
2. Zod-validate the envelope: `{ sessionId, actionId (uuid), type, payload, expectedPhaseId? }`.
3. Rate limit (per user, per session).
4. Verify the user is an active member of the session's room.
5. Idempotency: if `(session_id, action_id)` already exists in `game_events`, return the stored result without re-applying.
6. Load state and version from `game_state_secure`. Run lazy tick (`engine.tick`) if the phase is expired.
7. `engine.validateAction` (permission, phase, turn, payload, timer not expired with 300 ms network grace). Return a typed, user-friendly error on failure.
8. `engine.handleAction` returns `{ state, events }`.
9. Commit with the Postgres function `apply_game_action(session_id, expected_version, new_secure_state, new_public_state, private_views jsonb, events jsonb, scores jsonb)` (SECURITY DEFINER, callable by service role only). It checks `version = expected_version`, writes everything atomically, and bumps the version. On conflict, re-load and retry up to 3 times.
10. Return `{ ok: true, version, serverNow }`. Clients do NOT apply the result locally; they wait for the realtime update (optimistic UI is allowed only for pure UI feedback, such as a pending spinner, and is always reconciled with server state).

### 4.3 Realtime gotchas you MUST handle

- Add tables to the `supabase_realtime` publication. Set `REPLICA IDENTITY FULL` where updates must carry full rows.
- Realtime row filters allow a single `eq` filter; rely on RLS for the rest.
- DELETE events are not RLS-filtered: never delete rows that clients watch; use soft deletes (`left_at`).
- Keep `public_state` under about 64 KB. Chat is fetched/subscribed separately from state.
- Every subscription must be cleaned up on unmount. Handle React StrictMode double-mount without duplicate channels.
- On every (re)connect or tab-visibility return, call `get-snapshot` and replace local state with it (this is the reconnection mechanism). Never rely on having seen every event.
- Version-guard updates on the client: ignore any payload with `version <= current`.

### 4.4 Clock sync

Every function response includes `serverNow`. The client computes `offset = serverNow - clientNow` (keep the lowest-latency sample of the last 5), and renders `remaining = endsAt - (Date.now() + offset)`. Timers never decide anything client-side; at zero the client calls `game-tick` after `random(0..1500ms)` and shows "Waiting for server..." until the phase changes.

---

## 5. DATABASE (migrations in `supabase/migrations/`, reproducible with `supabase db reset`)

Use UUID PKs (`gen_random_uuid()`), `timestamptz`, FKs with sensible `ON DELETE`, `CHECK` constraints, and `updated_at` triggers. Enable extensions: `pgcrypto`, `pg_trgm`, `vector`, `pg_cron`, `pg_net`.

**Tables (columns are minimum required; add what you need):**

- `profiles(id uuid pk = auth.users.id, created_at)`
- `rooms(id, code char(5) unique, host_id, status enum[lobby,preparing,in_game,closed], game_id, theme, difficulty, rounds, config jsonb, max_players, created_at, last_activity_at)`. Code alphabet excludes ambiguous characters (no 0/O/1/I/L). Retry on collision.
- `room_players(id, room_id, user_id, display_name, ready bool, team_id null, joined_at, left_at null, last_seen_at, is_host_cached)`. Unique `(room_id, user_id)`; unique `(room_id, lower(display_name)) WHERE left_at IS NULL`.
- `game_sessions(id, room_id, game_id, phase text, phase_id uuid, phase_started_at, phase_ends_at, round_index, total_rounds, config jsonb, public_state jsonb, version int, status enum[preparing,active,finished,aborted], created_at, ended_at)`
- `game_state_secure(session_id pk, state jsonb, version int)`
- `player_views(session_id, user_id, view jsonb, version int, pk(session_id,user_id))`
- `rounds(id, session_id, index, started_at, ended_at, summary jsonb)`
- `teams(id, session_id, name, color_token)`; `team_members(team_id, user_id, order_index)`
- `scores(id, session_id, round_index, user_id null, team_id null, points int, breakdown jsonb)`
- `game_events(id bigserial, session_id, room_id, type, actor_id, action_id uuid, payload jsonb [public-safe only], created_at)`. Unique `(session_id, action_id) WHERE action_id IS NOT NULL`.
- `chat_messages(id, room_id, session_id null, channel enum[room,team,system], team_id null, sender_id null, kind enum[chat,question,answer,statement,system], body text check(char_length<=280), created_at)`
- `generated_content(id, theme, game_type, difficulty, name, normalized, aliases text[], category, forbidden text[], metadata jsonb [reference_value, metric_label, answer_type, difficulty_signals], fingerprint, embedding vector(384), source enum[external,ai,seed], provider, generated_at, expires_at, times_used)`. Unique `(theme, game_type, fingerprint)`; trigram index on `normalized`; HNSW index on `embedding`.
- `session_content_usage(session_id, content_id, fingerprint, used_at)`: drives uniqueness within a session.
- `ranking_sessions(id, session_id, round_index, criterion, direction, items jsonb [no values until reveal in client-readable form], created_at)`; `ranking_entries(id, ranking_session_id, user_id, placements jsonb, metrics jsonb, score int, submitted_at)`
- `auction_sessions(id, session_id, round_index, starting_budget, config jsonb)`; `auction_items(id, auction_session_id, position, content_id, name, category, starting_bid, reference_value [hidden until reveal], status, winner_id, final_price)`; `auction_bids(id, auction_item_id, user_id, amount, accepted bool, reject_reason, action_id, created_at)`
- `ai_evaluations(id, session_id, user_id, kind enum[blind_ranking,auction], input_hash, output jsonb, status enum[pending,done,fallback,failed], provider, model, created_at)`
- `rate_limits(key, window_start, count)` with `check_rate_limit(key, max, window_seconds)` function.

Hidden-value columns (`reference_value`, ranking reference order) must be in tables/columns clients cannot read until reveal. Store the full set in `game_state_secure`; write the revealed copy to the client-readable tables only at the reveal phase.

**Indexes:** `rooms(code)`, `room_players(room_id) WHERE left_at IS NULL`, `room_players(user_id)`, `game_sessions(room_id, status)`, `game_sessions(phase_ends_at) WHERE status='active'`, `game_events(session_id, id)`, `chat_messages(room_id, created_at)`, `scores(session_id)`, `auction_bids(auction_item_id, created_at)`.

**Helper functions (SECURITY DEFINER, `search_path` pinned):** `is_room_member(room_id)`, `is_session_member(session_id)`, `my_team_id(session_id)`. Use them in policies to avoid recursive RLS.

**RLS (enable on every table, deny by default):**

- `rooms`: SELECT for members. No client INSERT/UPDATE/DELETE (functions only). Code lookup for joining happens in `join-room` (service role), never by listing rooms.
- `room_players`: SELECT for members of the same room. No direct writes.
- `game_sessions`: SELECT for members. No writes.
- `game_state_secure`: no policies at all.
- `player_views`: SELECT where `user_id = auth.uid()`.
- `chat_messages`: SELECT where member AND (channel in (room, system) OR team_id = my_team_id). No client INSERT (send via `send-chat`).
- `scores`, `rounds`, `game_events`, `teams`, `team_members`: SELECT for members.
- `generated_content`, `rate_limits`, `ai_evaluations` (other users' rows), `session_content_usage`: service role only; `ai_evaluations` readable by the owner and, after the game, by room members for the results screen.
- Grant nothing to `anon` beyond what anonymous-auth users (role `authenticated`) need.

**Retention:** pg_cron jobs: close rooms idle over 6 hours; delete expired `generated_content` and old `rate_limits`.

---

## 6. EDGE FUNCTIONS (`supabase/functions/`)

All functions: verify JWT, CORS locked to the app origin(s) from env, Zod validation, structured JSON errors `{ error: { code, message } }` with user-friendly messages (never stack traces; log details server-side), rate limiting, and a `serverNow` field in successful responses.

| Function | Purpose |
| --- | --- |
| `create-room` | Validates name/game/theme/difficulty/rounds; creates room, host player, unique code; returns code. |
| `join-room` | Validates code, room joinable (status lobby, not full, not closed), name valid (2 to 20 chars, letters/numbers/space/basic punctuation, no leading/trailing space, no HTML), duplicate names rejected with a suggested alternative. Rejoining by the same user restores their seat (also while a game is in progress: reconnect, not new join). |
| `leave-room` | Marks `left_at`; transfers host if the host leaves; handles in-game departure per engine rules. |
| `update-room` | Host-only: game, theme, difficulty, rounds, game config, kick, transfer host, assign teams. Any member: toggle own ready. Rejected when a game is running. Validated against the selected engine's `configSchema`. |
| `start-game` | Host-only. Checks min/max players, team validity, everyone-ready rule (connected non-host players), then enters PREPARING: calls content preparation, builds initial state, creates session, rounds, teams, first views. |
| `game-action` | The pipeline in 4.2. |
| `game-tick` | Idempotent: if `now >= phase_ends_at` and `phase_id` matches, ask the engine to advance. Safe to call by any member any number of times. |
| `send-chat` | Sanitizes, rate-limits, asks `engine.validateChat`, writes message, applies side effects (for example Heads Up question registration). |
| `get-snapshot` | Returns room, players, session public state, own private view, recent chat, `serverNow`. The reconnection entry point. |
| `prepare-content` | Internal: runs the content pipeline (Section 14) for a session; also called in the background to pre-generate upcoming rounds. |
| `evaluate` | Internal/async: runs AI evaluations after objective scoring (Section 15). |
| `sweeper` | Called by pg_cron every 5 s: ticks expired sessions, marks stale players disconnected, promotes new host if needed, closes dead rooms. |

Client presence heartbeat: a cheap RPC `touch_presence(room_id)` every 20 s updates `last_seen_at` (rate limited). A player is "connected" if `last_seen_at` is within 45 s.

---

## 7. ENGINE FRAMEWORK (`supabase/functions/_shared/engine/`)

```ts
export interface GameEngine<Config, State, Action> {
  id: GameId;
  meta: { name: string; mode: 'ffa' | 'teams' | 'individual'; minPlayers: number; maxPlayers: number; description: string };
  configSchema: z.ZodType<Config>;                       // only settings that are really implemented
  contentRequirements(config: Config, players: number): ContentRequest;
  initialize(ctx: InitCtx<Config>): State;               // pure; ctx has players, teams, config, content, rng, now
  validateAction(state: State, action: Action, actor: PlayerId, now: number): Result<void, GameError>;
  handleAction(state: State, action: Action, actor: PlayerId, ctx: StepCtx): { state: State; events: GameEvent[] };
  tick(state: State, ctx: StepCtx): { state: State; events: GameEvent[] };   // timer expiry / auto-advance
  validateChat(state: State, actor: PlayerId, text: string, now: number): Result<{ kind: ChatKind; channel: Channel }, GameError>;
  onPresenceChange(state: State, playerId: PlayerId, connected: boolean, ctx: StepCtx): { state: State; events: GameEvent[] };
  startRound(state: State, ctx: StepCtx): State;
  endRound(state: State, ctx: StepCtx): State;           // computes round scores via calculateScore
  calculateScore(state: State, ctx: StepCtx): ScoreDelta[];
  isGameOver(state: State): boolean;
  getPublicState(state: State): PublicState;
  getPrivateState(state: State, playerId: PlayerId): PrivateState;
}
```

- A registry `engines = { imposter, heads_up, password, charades, blind_ranking, auction }` is the only place game ids are enumerated. The game manager is generic.
- **State machine:** each engine declares `phases` and an explicit transition table `Record<Phase, Phase[]>`. A helper `transition(state, to, ctx)` throws on illegal transitions and sets `phase_id` (new uuid), `phase_started_at`, `phase_ends_at`. Common phases: `PREPARING -> ROUND_INTRO -> (game phases) -> ROUND_RESULTS -> (next round | FINAL)`. Lobby is a room status, not an engine phase.
- **Shared services in `_shared/engine/`:** `TurnManager` (rotation that skips absent/finished players), `Timer` helpers, `ScoreManager` (round and cumulative, ranks with ties, per-game tie-breakers), `EventLog` helpers, `Rng` (seedable), `Result`/`GameError` types with stable error codes and friendly messages.
- **Absent players:** a disconnected player never destroys the game. Their turn simply times out and is skipped. After 3 minutes disconnected they are marked `away`: excluded from "everyone has acted" checks and vote quorums, but their seat, score, and ability to return remain. If too few connected players remain for the game to function (below engine minimum) for more than 3 minutes, the session pauses with a visible banner and resumes automatically when enough players return; the host may end the game.
- **Host migration:** if the host is disconnected for over 90 s, the longest-connected player becomes host (event + system chat message). The host may also transfer manually.

---

## 8. ROOM, LOBBY, PRESENCE, RECONNECTION

**Routes:** `/`, `/create`, `/join`, `/join/:roomCode`, `/room/:roomCode`, `/game/:sessionId`, `/results/:sessionId`, `/privacy`, `/terms`, `*` (not found). Guard `/room`, `/game`, `/results` by room membership (redirect to `/join/:code` with a helpful message otherwise).

**Create:** fields: player name, game, theme, difficulty, rounds (game-specific max). Shows loading "Creating room...". Result: code (e.g. `AB7KQ`) and link `/join/AB7KQ`.

**Join:** code (auto-uppercase, 5 chars) + name. Errors: "Room not found.", "Room has already started.", "Room is full.", "That name is already taken in this room.", "Name must be 2 to 20 characters." Loading: "Joining room...".

**Lobby shows:** room code (large, copyable), copy-link button with toast, player list (avatar from name initials and a deterministic color, host badge, ready state shown with icon AND text, online/away/offline), selected game card with rules summary, theme, difficulty, rounds, game-specific settings. Host controls: change game/theme/difficulty/rounds/settings, assign teams (team games: auto-balance by default, manual move buttons), kick, transfer host, Start. Non-host: Ready/Unready, Leave. Start is disabled with a visible reason ("Needs an even number of players, at least 4"). Everything syncs in realtime. The lobby never contains private game information.

**Presence/reconnection:** handle join, leave, disconnect, browser refresh, tab sleep, and network drop. Flow on any reconnect: re-establish the session (Supabase persists it) -> verify membership -> `get-snapshot` -> resubscribe -> render the current phase (not a restart). Show a non-blocking "Reconnecting..." banner. If the user opens `/room/CODE` mid-game they are routed to `/game/:sessionId`.

---

## 9. CHAT

Realtime chat with timestamps, sender, system messages (visually distinct: centered, muted, no avatar), and engine-aware permissions enforced by `send-chat` via `engine.validateChat`. Message kinds: `chat`, `question`, `answer`, `statement`, `system`.

- Body: trimmed, whitespace collapsed, control characters stripped, 1 to 280 chars, rendered as plain text only (React escaping; no HTML, no markdown, no auto-linking). Rate limit: 5 messages per 5 seconds per user.
- System messages are emitted from engine events: "Rahul joined the room.", "Round 2 started.", "Arjun submitted a vote.", "Karthik won the auction for Virat Kohli at 420.", and so on. Do not reveal secrets or vote targets in them.
- Mobile: chat is a bottom sheet with an unread badge; desktop: a side panel. Auto-scroll only when the user is at the bottom.

---

## 10. GAME SPECIFICATIONS

General: every game exposes only implemented settings (Section 11). All scoring constants live in `games/<id>/scoring.ts` as an exported config object so rules are tunable. Final ranking = cumulative points; ties share rank; per-game tie-breakers are listed below. For team games the leaderboard ranks teams, and also shows each player's contribution stats.

### 10.1 Imposter (free-for-all, 3 to 12 players)

- **Content:** one secret term per round (with category). The imposter receives only the theme name (setting `imposterSeesTheme`, default true) and NOT the secret.
- **Phases:** `ROLE_REVEAL (8 s, auto-advance, players tap to hide) -> DISCUSSION -> VOTING -> VOTE_REVEAL -> IMPOSTER_GUESS (only if caught and enabled) -> ROUND_RESULTS`.
- **Discussion modes:** `free_chat` (all players may chat for `discussionSeconds`) or `turn_based` (randomized order; each player submits ONE statement of up to 80 chars within `turnSeconds`, for `laps` laps; others cannot post statements out of turn; reactions/chat between turns disabled).
- **Voting:** each player votes for exactly one other player (no self vote); may change their vote until voting ends; ends early when all connected players have voted, otherwise at the deadline. Players who do not vote cast no vote. Plurality target is "caught" only if it is a strict plurality; ties mean nobody is caught. Vote counts are hidden until VOTE_REVEAL; chat shows only "X has voted", never the target.
- **Imposter guess:** if the imposter is caught and `imposterGuessEnabled`, they get `guessSeconds` and one free-text guess evaluated by `AnswerMatcher` (exact/alias/fuzzy; embeddings are not used to accept).
- **Default scoring:** crew member who voted for the imposter +100; imposter caught: each correct-voter +50 extra, imposter 0; imposter caught but guesses the secret: imposter +150; imposter survives: imposter +200. No AI or NLP decides the outcome except the matcher on the imposter's secret guess.
- **Private views:** crew: `{role:'crew', secret, category}`; imposter: `{role:'imposter', theme}`. Public state never contains roles or secret until VOTE_REVEAL/ROUND_RESULTS.
- **Tie-breakers:** more correct votes, then fewer times caught.

### 10.2 Heads Up (online deduction, 3 to 10 players)

- **Round setup:** every player is assigned a word. Each player's private view contains all OTHER players' words and never their own. Public state shows who has finished (without words).
- **Turn order:** strict rotation (randomized once per round, skipping finished and away players). Each turn lasts `turnSeconds`. A player gets `turnsPerPlayer` turns per round (default 2). Round ends when all players have finished, or all turns are used.
- **During a turn:** the active player may send questions via chat (kind `question`). All other players may answer the latest question with buttons YES / NO / DON'T KNOW (one answer per player per question, changeable until the next question). Free-text chat from non-active players is rejected server-side during a turn (prevents leaking the word); chat opens between turns and in results.
- **Guessing:** the active player submits a guess (free text) via the `GUESS` action, max `guessesPerTurn` (default 3), 2 second cooldown. Matching via `AnswerMatcher`. Correct: record time, award points, turn ends, player is finished. Wrong: shown to everyone in a guess feed; "Close" feedback when confidence is in the near-miss band. The active player may also pass (ends the turn).
- **Scoring:** `points = round(baseScore * max(minRatio, remainingTime / turnSeconds))` with `baseScore=100`, `minRatio=0.2`, minus a configurable `-5` per wrong guess (floor at the minimum). Placement bonus for finishing order within the round: +40 / +25 / +10 for 1st / 2nd / 3rd. Players who answered questions get nothing extra.
- **Tie-breakers:** more words solved, then lower total solve time.

### 10.3 Password (teams, 4 to 10 players, even)

- **Teams:** two teams; assigned in the lobby (auto-balance or manual). Start is blocked if teams are invalid.
- **Round structure:** one round = each team plays one word turn, alternating. Clue giver rotates within the team each round; the team's other members are guessers. The secret is visible ONLY to the active clue giver (public state: "Clue giver: X"). It is revealed to everyone when the word ends.
- **Exchange loop (up to `maxClues`, default 5, per word):** clue giver submits exactly one clue within `clueSeconds`; then each guesser may submit one guess within `guessSeconds`; first correct ends the word; if all guessers are wrong or time expires, the next clue is required. Free-text chat is disabled for the active team's members during their turn; the opposing team may chat among themselves in the team channel.
- **Clue validation (deterministic, server-side), all must pass:** non-empty; exactly one token of letters only (hyphens and apostrophes allowed inside a single word; spaces rejected); not equal to the secret or any alias after normalization; not a variation (same stem via a small built-in stemmer, edit distance \<= 2 for words of 6+ chars, one contains the other when 4+ chars, common prefix >= 5 chars and >= 70% of the shorter word); not in the item's `forbidden` list; not a clue already used for this word. Error: "That clue must contain exactly one word." and specific variants ("That clue is too close to the secret word.").
- **Scoring (team points):** `attemptPoints = [100, 80, 60, 40, 20]` by clue number, plus `timeBonus = round(30 * remainingRatio)` of the current guess window. Failed word: 0. The clue giver and the successful guesser are credited as MVP stats.
- **Tie-breakers:** team with more words solved, then fewer total clues used.

### 10.4 Charades (teams, 4 to 10 players, even)

- **Notice:** the lobby and rules panel state that performers act over the group's video call or in person.
- **Turn:** teams alternate; the performer rotates within the team. The performer's private view holds the prompt; teammates and opponents see "X is performing" and a timer. The performer cannot send free-text chat during their turn (server enforced), so the secret cannot leak through the UI. The performer may skip up to `skips` times (default 1) at a `-20` point cost per skip.
- **Guessing:** only the performer's teammates submit guesses (guess input, not chat). Opponents may watch but cannot guess. `AnswerMatcher` decides. Wrong guesses are listed with a "Close" hint when in the near-miss band. Unlimited guesses with a 1 second cooldown.
- **End of turn:** correct guess, timer expiry, or performer ends it. The prompt is revealed to everyone at the end.
- **Scoring (team points):** `50 + round(100 * remainingRatio)` on a correct guess; skips subtract as above. Performer and guesser are credited in contribution stats.
- **Tie-breakers:** more prompts solved, then lower total time.

### 10.5 Blind Ranking (individual, 2 to 12 players, simultaneous)

- **Content per round (one ranking set):** `rankingSize` items (default 5, 4 to 10), each with a numeric `reference_value`, plus `criterion` and `direction` shown before the first item (for example "Rank by population, highest first").
- **Phases:** `ROUND_INTRO (criterion screen) -> PLACING (one item at a time) -> REVEAL -> ROUND_RESULTS`.
- **Placing:** all players see the same item at the same time. Each places it into an empty slot within `perItemSeconds` (default 20). Placement is final (no undo setting is exposed). The item advances when all connected players have placed or the timer ends. Players who time out get the item auto-placed in the first empty slot (deterministic) and a flag is recorded. Public state shows who has placed, never where.
- **Objective score (0 to 1000), computed by the backend only:**
  - Position accuracy: `1 - mean(|placed - reference|) / (N - 1)`, weight 0.40
  - Spearman correlation mapped to `(rho + 1) / 2`, weight 0.20
  - Kendall pairwise agreement: fraction of concordant pairs, weight 0.25
  - Exact-position fraction, weight 0.10
  - Top-K accuracy (`K = min(3, N)`, fraction of reference top K that the player placed in their top K), weight 0.05
  - `score = round(1000 * weighted sum)`. Also store each metric, per-item position differences, and the largest misplacements.
- **Reveal:** shows each player's ranking beside the reference ranking with the reference values, differences, and metrics. Then AI interpretation (Section 15) loads asynchronously ("Analyzing your strategy..."); results are fully usable before it arrives.
- **Tie-breakers:** exact matches, then Kendall agreement.

### 10.6 Auction (individual, 2 to 10 players, real time)

- **Config:** `startingBudget` (default 1000), `itemCount` (default 8, 4 to 15), `auctionSeconds` (default 20 per item), `minIncrement` (default 10), anti-sniping: a bid in the final 5 s resets the remaining time to 5 s (max 10 extensions per item).
- **Item generation:** items have name, category, short public description, `starting_bid` (about 10 percent of reference rounded to the nearest 10, minimum 10), and a hidden `reference_value`. Reference values are scaled so that their total is about 1.6x one player's budget (scarcity: nobody can buy everything). Budgets are public to all players (`budgetVisibility: 'public'` is fixed in v1; do not expose a toggle).
- **Phases per item:** `ITEM_INTRO (3 s) -> BIDDING -> SOLD`; after the last item: `REVEAL -> ROUND_RESULTS`.
- **Bid validation (server, inside the row-locked commit):** actor is an active player; phase is BIDDING and not expired; amount is a positive integer; `amount >= starting_bid` if no bids else `>= current + minIncrement`; `amount <= actor.remaining_budget` (server-computed, never client-supplied); actor is not already the highest bidder; `action_id` unused. Competing simultaneous bids are serialized by the version check; the earlier committed bid wins. Errors: "Invalid bid.", "Insufficient budget.", "Bid must be at least N.", "You already hold the highest bid.", "Bidding has ended for this item."
- **Sale:** at expiry the highest bidder pays, budget is deducted, the item joins their collection, a system message is posted. No bids: item is unsold.
- **Objective scoring (final, deterministic):**
  - `acquired_value = sum(reference_value of won items)`
  - `set_bonus = acquired_value * 0.05 * (distinctCategoriesWon - 1)` (min 0)
  - `final_score = round(acquired_value + set_bonus + remaining_budget)`
  - Also compute and display: total spent, remaining budget, average acquisition value, price efficiency (`acquired_value / spent`), per-item over/underpayment vs reference, category coverage, scarcity captured (share of top-value items won).
- **Tie-breakers:** higher price efficiency, then more items.

---

## 11. GAME SETTINGS (expose ONLY these; each must be fully functional and validated)

| Game | Settings (range, default) |
| --- | --- |
| Common | theme, difficulty (easy/medium/hard), rounds (1 to 10, default 3; Blind Ranking and Auction 1 to 5, default 1) |
| Imposter | discussionMode (free_chat/turn_based), discussionSeconds (60 to 600, 180), turnSeconds (10 to 60, 25), laps (1 to 3, 2), votingSeconds (20 to 120, 45), imposterSeesTheme (true), imposterGuessEnabled (true), guessSeconds (15 to 60, 30) |
| Heads Up | turnSeconds (30 to 120, 60), turnsPerPlayer (1 to 3, 2), guessesPerTurn (1 to 5, 3) |
| Password | clueSeconds (15 to 60, 30), guessSeconds (10 to 45, 20), maxClues (3 to 5, 5) |
| Charades | performanceSeconds (45 to 180, 90), skips (0 to 3, 1) |
| Blind Ranking | rankingSize (4 to 10, 5), perItemSeconds (10 to 45, 20) |
| Auction | startingBudget (500 to 5000, 1000), itemCount (4 to 15, 8), auctionSeconds (10 to 45, 20) |

Themes live in `src/config/themes.ts` (and a shared server copy): Food, Animals, Movies, Countries, Technology, Cricket, Football, Music, Science, Gaming, Cars, History. Each theme config declares: id, label, icon (lucide name), supported games, categories, external data sources, AI prompt hints, ranking criteria options (with metric label and direction), and auction value metric. Adding a theme = adding one config entry; no theme logic elsewhere. If a theme cannot support a game (for example, no objective metric for Blind Ranking), that combination is disabled in the UI with a tooltip explaining why.

---

## 12. DETERMINISM AND SECURITY RULES (non-negotiable)

An LLM is NEVER involved in: room/player state, turns, timers, scoring, voting, bids, budgets, transitions, winners, permissions, teams, secrets. LLMs are used only for content generation, difficulty estimation, and post-game explanations. No LLM call is on the gameplay path of any player action.

Protect against and TEST for: unauthorized room access; spoofed user IDs (identity from JWT only); score/budget/bid manipulation; fake or duplicate votes; action replay (idempotency keys); invalid state transitions; acting out of turn; secret leakage (via tables, realtime payloads, snapshots, events, chat, error messages, logs returned to client); excessive requests (rate limits on every function); malicious chat input and names (sanitized, rendered as text only); CORS abuse; oversized payloads (limit body size and string lengths). Service role key and AI keys exist only as Edge Function secrets. `.env` is gitignored; commit `.env.example` only.

---

## 13. ANSWER MATCHER (`_shared/matching/`)

`matchAnswer(userAnswer, expected: { name, aliases, answerType }, opts) -> { correct, confidence, matchType: 'exact'|'alias'|'fuzzy'|'semantic'|'none', near: boolean }`

Pipeline: (1) Unicode NFKD and strip diacritics; (2) lowercase; (3) trim; (4) `&` to `and`; (5) remove punctuation; (6) collapse spaces; (7) drop leading articles (the/a/an); (8) normalize variations (number words \<-> digits, `st`/`saint`, `mr`/`mister`, hyphen/space/compound joins, simple plural/singular); (9) exact match against normalized name; (10) alias match; (11) fuzzy: Damerau-Levenshtein / Jaro-Winkler implemented in-house, thresholds by length (len \<= 3: exact only; 4 to 7: distance \<= 1; 8+: distance \<= 2); for multi-word names use token-set comparison and accept surname-only ONLY if present in aliases; (12) semantic (embedding) step is optional and gated.

**Semantic policy (strict):** embeddings may set `correct: true` only when `answerType === 'common_noun'`, similarity >= 0.92, and the expected answer is closer than every other item currently in play by a margin >= 0.05. For named entities (people, places, titles) embeddings only set `near: true` (confidence 0.75 to threshold) so the UI can show "Close". Never call an LLM here. Provide a large unit-test table covering typos, aliases, diacritics, plurals, near-misses that must be rejected (for example, two different athletes), and short words.

---

## 14. CONTENT PIPELINE (`_shared/content/`)

```ts
interface ContentProvider { name: string; generate(req: ContentRequest): Promise<RawContentItem[]>; }
```

Providers: `CachedContentProvider` (reads `generated_content`, excludes session-used items), `ExternalDataProvider` (public APIs chosen per theme in theme config; for example Wikidata/Wikipedia, REST Countries, TheMealDB, PokeAPI; every external call has a timeout, retry with backoff, and response validation; only use free APIs that permit this use), `AIContentProvider` (via the AI abstraction, Section 15), and the emergency seed. Orchestrator order: cache -> external -> AI -> seed. It stops as soon as the request is satisfied with validated, unique items.

**Request/response:** `{ game, theme, difficulty, count, excluded_content[] , criterion? }` -> `{ items: [{ name, difficulty, aliases[], category, forbidden?[], reference_value?, metric_label?, answer_type }] }`.

**Validation of EVERY item before use:** schema (Zod); name length and character rules; no profanity or prohibited terms; theme/category consistency; aliases sane and deduplicated; Password items must have no alias equal to common clue words; Blind Ranking/Auction items must have finite, distinct numeric reference values and a consistent metric (and prefer externally sourced values; AI-sourced values are accepted only if they pass sanity bounds and are marked `source: ai`); difficulty metadata present.

**Uniqueness (per session, enforced in code, not trusted to the LLM):** (1) exact name, (2) normalized name, (3) alias intersection, (4) semantic: cosine similarity >= 0.88 against used items in the session rejects (embedding via `gte-small`). Record each used item in `session_content_usage`.

**Difficulty engine:** difficulty is game-specific, stored as metadata. Deterministic signals where available (popularity proxy such as Wikidata sitelinks/pageviews, name length, alias count) combined with an AI estimate when available, bucketed by explicit rules into easy/medium/hard. Per-game rubric: Imposter (how broad vs specific the secret is, and ambiguity within the category); Heads Up (familiarity, number of plausible alternatives, answerability by yes/no); Password (how many strong single-word clues exist, polysemy); Charades (actability); Blind Ranking (how close reference values are and how well-known items are); Auction (value spread and recognizability).

**Preparation timing:** `start-game` enters PREPARING ("Preparing round...") and blocks only until round 1 content is ready. Remaining rounds are pre-generated in the background during play and just-in-time guarded: if the next round's content is not ready at round end, show "Preparing next round..." and fall back down the provider chain. Never break gameplay: if everything fails, the host sees a clear error and can change theme or retry.

**Cache:** TTL (default 14 days), fingerprint = hash of normalized name + theme + game type, track `generated_at`, `used_at`, `times_used`.

---

## 15. AI SERVICE (`_shared/ai/`)

```ts
interface AIProvider {
  generateGameContent(req: ContentRequest): Promise<unknown>;
  evaluateBlindRanking(input: BlindRankingEvalInput): Promise<unknown>;
  evaluateAuction(input: AuctionEvalInput): Promise<unknown>;
  generateExplanation(input: ExplanationInput): Promise<unknown>;
}
```

Implement `OpenAICompatibleProvider` (configurable `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`; works with OpenAI-compatible endpoints such as OpenRouter, Together, Groq, vLLM, Ollama, hosting GPT-OSS, Qwen, etc.). Selection by `AI_PROVIDER` env with a registry so adding `QwenProvider` or `GPTOSSProvider` is one file. Optional `AI_FALLBACK_PROVIDER`.

- Low temperature, JSON-only prompts, request timeout 20 s, max 2 retries with a repair prompt, per-room hourly call cap, concurrency limit.
- Parse (strip code fences) -> Zod validate -> semantic checks -> accept or reject. Never execute AI output as code or SQL. Prompts are versioned files; player-provided strings (names) are passed as JSON data, never concatenated into instructions.
- **Blind Ranking evaluator:** input = theme, difficulty, criterion, reference ranking, player ranking, objective metrics, notable differences. Output Zod schema: `{ summary, strengths[], weaknesses[], strategic_observations[], explanation }`. **No numeric score fields are allowed in the schema.**
- **Auction evaluator:** input = structured stats (spent, remaining, per-item prices vs reference, timing of bids, categories). Output: `{ summary, strengths[], weaknesses[], strategy_analysis[], explanation }`. It never determines winners or scores.
- Evaluations run asynchronously after objective scores are committed; results stream into the results screen via the `ai_evaluations` table. If the AI is unavailable or invalid after retries, store a **rules-based analysis generated from the metrics** with `status: 'fallback'` and label it "Automated analysis" in the UI. Never present fallback text as AI output and never fabricate AI responses.

---

## 16. DESIGN SYSTEM AND UI

**Feel:** premium, minimal, playful but not childish, fast, highly readable. It must NOT look like a college project, admin dashboard, CRUD app, card-soup template, or AI-generated gradient site. No emojis. No decorative gradients; at most a single subtle radial glow behind the hero.

**Tokens (CSS variables, dark default; define the light equivalents):**

- Background `#0B0D12`, surface `#12151C`, elevated `#181C25`, border `#232834`, text `#E8EAF0`, muted text `#98A0B3` (verify 4.5:1 contrast), one primary accent (choose one saturated hue, used for primary actions and focus rings), semantic success/warning/danger. Each game has one muted accent hue used sparingly (game header rule, icon tint).
- Typography: a distinctive display face for headings and codes (for example Space Grotesk or Sora) plus Inter for UI; tabular numerals for scores and timers; a type scale from 12 to 48 px; room code in a large monospace-like tracking.
- Spacing on a 4 px grid; radii 8/12/16; borders over shadows; subtle layered shadows only on floating elements.
- Motion: 120 to 200 ms ease-out transitions for hover, press, and phase changes; no looping decorative animation; disable under `prefers-reduced-motion`. Never delay results with fake animation.

**Reusable components (each with loading/disabled/error states where relevant):** Button, Input, Select, Modal, Dialog, ConfirmDialog, Toast, Avatar, PlayerCard, RoomCode, Timer (server-synced), ChatPanel, Scoreboard, GameHeader, GameSettings, GameCard, Leaderboard, ProgressBar, LoadingState, EmptyState, ErrorState, ConnectionBanner.

**Landing page:** hero (name, one-line tagline, Create Room, Join Room), game showcase (six games: name, one-line description, mode label, player count, a lucide icon, no emojis), How it works (4 steps), Features (real-time multiplayer, dynamic rounds, difficulty levels, multiple game modes, AI-assisted evaluation for Blind Ranking and Auction only), footer (name, GitHub link to the real repo URL from config, Privacy, Terms). No fake statistics, testimonials, or logos.

**Responsive gameplay (design separately, do not just shrink desktop):**

- Desktop/laptop: three regions (players and scores | game stage | chat/activity), stage dominant.
- Tablet: two columns, chat collapsible.
- Mobile: single column stage; header with phase, round, and timer pinned at top; primary action bar pinned at the bottom in the thumb zone; chat and scoreboard as bottom sheets; minimum 44 px touch targets; safe-area insets; no horizontal scroll; Blind Ranking slots and Auction bid controls are designed for one-handed use.

**Every screen must have** loading, empty, and error states: Landing, Create, Join, Lobby (including game selection and settings), each of the six game screens (every phase), Round Results, Final Leaderboard, Privacy, Terms, Not Found. Use specific loading copy: "Creating room...", "Joining room...", "Preparing next round...", "Analyzing your strategy...". Never a blank screen.

**Results:** per-game result screen shows winner, scores, round breakdown, stats; Blind Ranking additionally shows player ranking vs reference ranking, metrics, AI/automated analysis; Auction additionally shows purchases, spend, remaining budget, objective metrics, strategy analysis. Final leaderboard: rank, name, total, per-round scores, relevant stats. Actions: Play Again (host: same game and settings, new content, scores reset), Return to Lobby (host, then everyone moves), Leave Room. Non-hosts see "Waiting for the host..." and update live.

**Accessibility:** semantic landmarks and headings; full keyboard operation; visible focus ring on every interactive element; `aria-live` regions for timers (throttled), phase changes, and new chat messages; labelled controls; focus trapping and restoration in dialogs; state is never conveyed by color alone (always icon plus text); WCAG AA contrast; respects reduced motion; zoom to 200 percent without breakage.

---

## 17. ERROR MESSAGES (stable codes + friendly copy; no stack traces to users)

Examples that must exist: "Room not found.", "Room has already started.", "Room is full.", "You are not the host.", "It is not your turn.", "Invalid bid.", "Insufficient budget.", "That clue must contain exactly one word.", "That clue is too close to the secret word.", "Game has ended.", "You are not in this room.", "You are sending messages too quickly.", "Something went wrong. Please try again." Each function returns `{ error: { code, message } }`; the client maps codes to toasts or inline errors and never shows raw server text for unknown codes.

---

## 18. EVENT MODEL

Persist public-safe events in `game_events` with these types (extend as needed): `ROOM_CREATED, PLAYER_JOINED, PLAYER_LEFT, PLAYER_DISCONNECTED, PLAYER_RECONNECTED, PLAYER_READY, HOST_CHANGED, GAME_SELECTED, GAME_STARTED, ROUND_STARTED, TURN_STARTED, TURN_ENDED, MESSAGE_SENT, QUESTION_ASKED, ANSWER_GIVEN, CLUE_SUBMITTED, GUESS_SUBMITTED, GUESS_CORRECT, VOTE_SUBMITTED, VOTING_ENDED, ITEM_PLACED, BID_SUBMITTED, BID_ACCEPTED, BID_REJECTED, ITEM_SOLD, AUCTION_ENDED, RANKING_SUBMITTED, ROUND_ENDED, GAME_ENDED`. Event payloads never contain secrets. A developer-only debug view is not required; events are queryable in SQL.

---

## 19. TESTING (must exist and pass in CI)

**Unit (Vitest, deterministic with seeded RNG and injected clock):** every engine's state machine (legal and illegal transitions), validation, scoring (golden-value tests with hand-computed expectations), turn rotation with absent players; AnswerMatcher table tests; Password clue validator; content validators and dedup; Blind Ranking metrics (Spearman, Kendall, top-K against known examples); Auction bid validation, budget deduction, concurrent-bid ordering, set bonus; AI output schema validation including rejection of numeric scores and malformed JSON; sanitization utilities.

**Integration (against local `supabase start`):** a bot harness in `scripts/` creates N anonymous users with supabase-js and plays full games for ALL six engines end to end, asserting synchronized public state across clients and correct final scores. Must cover: create/join/duplicate names/full room/invalid code/started room; lobby sync; reconnect mid-game (drop the realtime channel, then `get-snapshot`, state matches); host migration; timer expiry via tick and via sweeper; idempotent duplicate actions; out-of-turn and invalid actions rejected.

**Security tests:** with a second user's JWT attempt to SELECT `game_state_secure`, other users' `player_views`, other rooms' chat/state, and team chat of the opposing team (all must return nothing); attempt to write to every table directly (all denied); attempt to call functions with a spoofed `userId` in the body (ignored); verify Imposter crew/imposter views, Heads Up own-word absence, Password/Charades secret exclusivity, Auction/Ranking hidden values absent from all client-readable payloads including realtime messages and `get-snapshot`.

**E2E (Playwright, 3+ browser contexts):** the acceptance sequence in Section 21 for every game, including mid-game refresh and a mobile viewport project; axe checks on every screen with zero serious/critical violations; assert no console errors.

---

## 20. DEVELOPMENT PHASES AND GATES

**Phase 1: Foundation.** Vite + React + TS strict + Tailwind + Radix + router + design tokens + base components; Supabase client config; env handling; CI; project structure (below). *Gate:* app builds, routes render, lint/typecheck/test pass, CI green.

**Phase 2: Database, identity, rooms, lobby.** Migrations, RLS, helper functions, anonymous auth, `create-room`, `join-room`, `leave-room`, `update-room`, `touch_presence`, lobby UI, Presence, Realtime sync, chat (`send-chat` with the generic engine-less chat rules for lobby), reconnection via `get-snapshot`, rate limiting. *Gate:* three browsers create/join/ready/change settings/chat in sync; refresh and reconnect work; RLS tests pass.

**Phase 3: Engine framework.** Engine interface, registry, state machine helper, TurnManager, Timer, ScoreManager, `apply_game_action`, `start-game`, `game-action`, `game-tick`, `sweeper`, generic game shell UI (header, timer, scoreboard, chat sheet, phase transitions, results/leaderboard shell), plus a minimal test engine used ONLY in tests. *Gate:* tests prove optimistic concurrency, idempotency, tick/sweeper resolution, version-guarded client updates.

**Phase 4: Content + matching (build before the games that depend on them).** AnswerMatcher, content providers, validation, uniqueness, difficulty, cache, seed fallback, AI abstraction with content generation. *Gate:* content requests return validated unique items for every theme/game combination supported; provider failure falls through to seed; matcher test table green.

**Phase 5: Games, one at a time, in this order:** Imposter, Heads Up, Password, Charades, Blind Ranking, Auction. For each: engine + unit tests -> Edge Function wiring -> UI for every phase (mobile and desktop) -> results screen -> bot-harness integration test -> leak test -> Playwright e2e. *Gate per game:* all of the above green and a manual 3-browser playthrough documented. Do not begin the next game until the current gate passes.

**Phase 6: AI evaluation.** Evaluators for Blind Ranking and Auction with async pipeline, fallback analysis, schema validation tests. *Gate:* results screens show objective scores immediately and analysis arrives afterward; works with AI disabled (labelled automated analysis).

**Phase 7: Hardening.** Full security review against Section 12, rate-limit tuning, accessibility pass, performance (bundle analysis, route-level code splitting, avoid re-render storms, memoized selectors), error/empty/loading state audit of every screen, console-error sweep. *Gate:* full test suite and axe green.

**Phase 8: Deployment.** `vercel.json` (SPA rewrite and security headers including a CSP allowing only your Supabase origin), GitHub Actions, README, `SETUP.md`, production Supabase configuration. *Gate:* production build tested against a real Supabase project.

**Suggested structure:**

```
src/
  components/{common,lobby,chat,games,leaderboard}/
  games/<id>/   (UI only: screens per phase, hooks)
  services/{supabase,realtime,api}/
  hooks/  pages/  types/  utils/  config/{brand,themes,seed}/
supabase/
  migrations/
  functions/
    _shared/{engine,games/<id>,matching,content,ai,validation,errors}/
    create-room/ join-room/ ... (one folder per function)
scripts/  (bot harness, tooling)
tests/{unit,integration,e2e}/
```

---

## 21. FINAL ACCEPTANCE TEST (you are not done until this passes for EVERY game)

1. Open the site; landing page is complete and responsive.
2. Create a room; copy the link.
3. Open a second and third browser (separate profiles or incognito); join via the link.
4. Host configures game, theme, difficulty, rounds, game settings; all browsers update instantly.
5. Start the game; all browsers move through PREPARING to round 1 in sync.
6. Play several rounds; scores, turns, timers, chat, and phases stay synchronized and match server truth.
7. Refresh a browser mid-round; it returns to the same phase with correct private state. Kill the network for 20 s and restore it; state recovers.
8. Verify no secret is exposed: inspect network responses, realtime frames, and direct table queries from each client.
9. Finish the game; leaderboard and results are correct and hand-verifiable; Blind Ranking and Auction show objective metrics and the analysis.
10. Host chooses Play Again (new content, scores reset) or Return to Lobby; switch to a different game and play it.
11. Repeat on a phone-sized viewport.
12. Zero console errors or warnings, zero TypeScript errors, zero unhandled promise rejections, no broken layouts, no hardcoded gameplay state anywhere.

---

## 22. HUMAN-ONLY STEPS (write them into `SETUP.md` with exact commands/clicks, and ask the human only when a step is reached)

1. Create a Supabase project; enable **Anonymous sign-ins** (and optionally Turnstile CAPTCHA to limit abuse).
2. `supabase link`, `supabase db push`; enable extensions; add tables to the Realtime publication (migrations should do this).
3. Set function secrets: `SUPABASE_SERVICE_ROLE_KEY`, `AI_PROVIDER`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, optional `AI_FALLBACK_PROVIDER`, `ALLOWED_ORIGINS`. Store the cron-to-function auth secret in Vault.
4. `supabase functions deploy`; confirm the pg_cron job exists.
5. Vercel/Cloudflare: import the GitHub repo; set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` only; deploy; add the production URL to Supabase Auth redirect/CORS settings.
6. `.env.example` must list every variable with comments; `.env` is gitignored.

The app must work with AI disabled (content falls back to cache, external, then seed; evaluations use the automated analysis).

---

## 23. DEFINITION OF DONE (checklist you must self-verify and report)

- [ ] Typecheck, lint, unit, integration, security, e2e, and a11y suites all pass in CI
- [ ] All six games complete the Section 21 test on desktop and mobile
- [ ] RLS enabled everywhere; leak tests pass; service key and AI keys only in server secrets
- [ ] Every function validates input, rate limits, and returns friendly errors
- [ ] Reconnect works mid-game for every game and every phase
- [ ] Timers resolve correctly even if all clients are closed (sweeper)
- [ ] No emojis, placeholders, dead links, fake data, fake AI, or hardcoded gameplay state
- [ ] Every screen has loading, empty, and error states and is responsive
- [ ] README (what it is, architecture diagram, local dev, tests, deploy) and SETUP.md complete
- [ ] `DECISIONS.md` lists every ambiguity you resolved and why

---

## 24. HOW TO START

Begin with Phase 1 and Phase 2 only. Before writing code, output a concise plan: repository structure, the exact migration list, the function list, and the Realtime subscription map (table, filter, who receives it). Then implement, verify against the gate, commit, and report. Proceed phase by phase. Do not begin AI work until the multiplayer foundation and at least the Imposter game pass their gates.

Build it as: **REALTIME ENGINE + DETERMINISTIC RULES + NLP MATCHING + DYNAMIC CONTENT + AI EVALUATION.** The multiplayer engine is the product. AI is a supporting service.