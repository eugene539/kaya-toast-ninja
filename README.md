# Kaya Toast Ninja

A free fractions arcade game for P1 and P2 children by Genius Plus Academy. A customer at
Nelli's kopitiam stall orders a fraction of the toast; the child picks how many pieces on a brass
dial, swipes to cut, and flicks the right pieces onto the plate.

Stack: Phaser 3, TypeScript, Vite, bun (never npm). Capacitor 8.5.x comes later. No backend, no
login, no runtime AI, no analytics.

- `spec/` the rules (Codex sees only this folder): geometry, orders, state, `api.d.ts`
- `src/core/` pure TypeScript implementing `spec/api.d.ts` (no Phaser imports)
- `src/game/` Phaser scenes; `src/copy/` every string a child reads
- `tests/unit/` builders' tests; `tests/adversarial/` Codex's blind tests (builders never edit)
- `tools/` order enumeration, solver diff, copy lint
- `docs/` CHANGELOG, ARCHITECTURE, PLATFORM, evidence

Commands: `bun install`, `bun run dev`, `bun run ci` (typecheck, tests, copy lint, solver diff,
web build).
