# DECISIONS

Every ambiguity resolved while building, with the reason. Newest first.

| # | Decision | Why |
|---|---|---|
| 1 | Product name is **RoundUp** (the spec's "Parlor" was a working name) | The owner renamed the project; the name lives only in `src/config/brand.ts`. |
| 2 | Frontend keeps a small custom snapshot hook instead of TanStack Query for now | Nothing used it yet (dead 33 kB); it will return with the async AI-results fetch in Phase 6. |
| 3 | Framer Motion not installed; phase transitions use CSS transitions | Spec allows Motion *only* for phase transitions; 160 ms ease-out CSS already meets the motion rules and keeps the bundle smaller. Motion returns if a transition needs gestures. |
| 4 | No production sourcemaps | Keeps the shipped artifact small (saves ~2.5 MB). Debugging uses local builds. |
| 5 | `@radix-ui/react-tabs` removed | Mobile lobby tabs are three buttons with `aria-pressed`; a Tabs dependency did not earn its place. |
| 6 | One `tsconfig.node.json` also typechecks `supabase/functions` (DOM + node libs) | Fewer configs; Edge Function code uses web APIs only, so both type systems apply cleanly. |
| 7 | Relative imports inside `supabase/functions` always carry the `.ts` extension | Deno (Edge Runtime) requires explicit extensions; TypeScript accepts them via `allowImportingTsExtensions`. |
| 8 | `pg_cron` fires `sweeper_round()` every minute; that function loops 12 × `pg_sleep(5)` + `http_post`, guarded by an advisory lock | `pg_cron` has minute granularity, but the spec requires a 5-second sweep; the loop delivers it with no overlap. |
| 9 | Cron → Edge auth uses a Vault-generated `cron_secret`; the app URL comes from a Vault `app_url` secret set in SETUP | No secret in git or migration source; the Edge `sweeper` reads the same secret from Vault to verify the caller. |
| 10 | Display names allow `\p{M}` combining marks | Devanagari and other Indic names are written with combining vowel signs that are not letters; rejecting them would fail real users (caught by a unit test). |
| 11 | Lobby team assignment stores `room_players.team_id` as `'a'` / `'b'`; real `teams` rows are created at `start-game` | The spec puts `teams` under `session_id`, but teams must be arranged in the lobby before a session exists. |
| 12 | `ranking_sessions`, `auction_*`, `generated_content`, `rate_limits` have RLS enabled with **no** policies | Hidden values (reference values, ranking order) must be invisible to clients until reveal; reveal copies go through `public_state` / `player_views`. |
| 13 | Local `supabase start` integration tests cannot run in this environment (no Docker, no Supabase CLI, no Deno) | Recorded as a limitation; the SQL and functions are typechecked and unit-tested, and SETUP.md documents the exact commands to run them on a real project. |
| 14 | AI is not wired yet (Phases 4/6); the app works with AI disabled end to end | The spec forbids AI work before the multiplayer foundation and Imposter gates pass. |
