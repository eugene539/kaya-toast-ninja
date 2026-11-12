# tests/adversarial

Written by Codex from `spec/` only, in a spec-only worktree (branch `spec-base`). Builders never
edit these files; the main session may change one only with a reason recorded in
`docs/CHANGELOG.md`. Tests import the core through the `@core` alias (tsconfig paths): on
`spec-base` it resolves to `spec/api.d.ts` for type checking; on `main` it resolves to
`src/core/index.ts`. Run with `bun test tests/adversarial`.
