# Project instructions

The single source of truth for this repository is [MASTER_SPEC.md](MASTER_SPEC.md).

- When anything is ambiguous, follow Section 2 (Resolved Decisions).
- If still ambiguous, choose the simplest option that satisfies the Non-Negotiables,
  record the choice in [DECISIONS.md](DECISIONS.md), and continue.
- Work phase by phase (Section 20); never start a phase until the previous gate passes.
- After every phase: `npm run typecheck && npm run lint && npm test && npm run build`, then commit.

The same file may be referenced as `CLAUDE.md` or `.cursorrules`; keep the pointer identical.
