# Engineering Standards (apps/web)

This document defines guardrails for `apps/web` so architecture quality stays high as features grow.

## 1. Architecture principles

- Keep `src/app` as the composition layer (providers, router, layouts).
- Keep `src/features/*` as domain modules with explicit public APIs.
- Keep `src/shared` framework-agnostic and reusable.
- Prefer small, composable modules and clear ownership over convenience imports.
- Avoid cross-layer coupling (`shared` should not depend on feature internals).

## 2. Folder ownership

- `src/app/**`: app shell, routing, providers, layout composition.
- `src/features/auth|home|rooms|predictions|duels|leaderboard|preferences|onboarding/**`: feature code owned by that domain.
- `src/shared/ui/**`: UI primitives only.
- `src/shared/lib/**`: cross-feature utilities and infrastructure clients.
- `src/shared/hooks/**`: generic reusable hooks.

## 3. Public API rules

- Every feature exposes an `index.ts` public API.
- Other layers should import from `@/features/<feature>` instead of internals.
- Route modules may lazy-load page entry points from `@/features/<feature>/pages/*`.
- Internal folders (`components`, `hooks`, `lib`, `types`, `context`) are private unless exported by feature `index.ts`.
- Pages are not exported from `index.ts`. The router imports them from
  `@/features/<feature>/pages/*` (or the feature root, e.g. `home/HomePage`).
  A barrel that exports pages drags every feature those pages use into any
  module that imports one hook from it, which creates import cycles.
- Keep page-level views that compose other features' UI (e.g.
  `SeriesDetailView`) out of `index.ts` too; import them directly from the page.

## 4. Import conventions

- Use alias imports (`@/...`) instead of deep relative paths.
- Keep imports grouped by external, app/features, shared.
- Avoid duplicate imports and circular dependencies. `import/no-cycle` is an
  error at any depth, so CI fails on a cycle.
- Inside a feature, import the defining module (`@/features/rooms/hooks/room`),
  never the feature's own `@/features/rooms`: the barrel re-exports the file
  doing the importing.
- Mark type-only imports with `import type` (enforced by
  `@typescript-eslint/consistent-type-imports`). They're erased at build time,
  so they never form a runtime cycle.
- Context hooks that features read but `src/app` provides live in
  `src/shared/lib` (`roomContext.ts`, `roomActions.ts`), so features never
  import from `src/app`.
- `src/app/**` cannot import feature internals directly; use feature public API or page entrypoints.

## 5. Feature conventions

- Keep feature-local folders inside each feature (`components`, `hooks`, `pages`, `types`, `lib`).
- Export only stable contracts in `index.ts`.
- Keep page files as route entry points; move reusable logic into hooks/components/lib.
- Keep feature state/data hooks in feature-owned `hooks`.

### Feature template (recommended)

```text
src/features/<feature-name>/
  index.ts
  pages/
    <FeaturePage>.tsx
  components/
    <FeatureComponent>.tsx
  hooks/
    use<Feature>.ts
  types/
    types.ts
  lib/
    <feature>Utils.ts
```

## 6. Shared conventions

- `shared/ui` exports reusable primitives only (no domain-specific behavior).
- `shared/lib` contains utilities and clients used by multiple features.
- `shared/hooks` must be domain-agnostic and safe for reuse across features.
- Shared code should never depend on feature-private implementation details.

## 7. Tooling recommendations

- ESLint flat config (`apps/web/eslint.config.js`) enforces:
  - import hygiene (`import/no-duplicates`, `import/no-cycle`, `import/first`)
  - unused import cleanup (`eslint-plugin-unused-imports`)
  - feature boundary guardrail in `src/app/**` via `no-restricted-imports`
- Knip (`apps/web/knip.json`) is added for dead code/dependency detection.
- Keep rules pragmatic: start as warnings where adoption risk is high, then tighten over time.
- Consider adding `eslint-plugin-boundaries` in a future phase if stricter multi-layer boundary policies are needed.

## 8. CI recommendations

No GitHub Actions workflow currently exists in this repository. Add a web-quality workflow that runs on PRs:

1. `npm run lint`
2. `npm run typecheck`
3. `npm run build`
4. `npm run unused`

Optional:
- Upload `apps/web/dist/stats.html` as an artifact for periodic bundle review.
- Add architecture checks as lint rules mature.

## 9. Bundle analysis workflow

- Run: `npm run analyze`
- Output: `apps/web/dist/stats.html`
- Review:
  - unexpectedly large chunks
  - accidental eager imports
  - duplicate heavy dependencies
- Use findings to prioritize lazy-loading and dependency cleanup work.

## 10. Dependency management strategy

- Run `npm run unused` regularly and on release branches.
- Remove packages only when clearly unused in source/build config.
- Keep dependencies feature-justified; avoid overlapping libraries for same purpose.
- Prefer incremental removals with verification (`lint`, `typecheck`, `build`) after each cleanup.

### Initial unused-code review policy

- Knip results should be triaged into:
  - safe removals (confirmed unused)
  - deferred candidates (possible dynamic/runtime usage)
  - intentional keepers (tooling/CLI/dev ergonomics)
- Do not auto-delete uncertain files or dependencies.

### Current baseline findings (from `npm run unused`)

- Unused files (6):
  - `src/features/home/controls/PlayerNew.tsx`
  - `src/features/predictions/components/RoomStatRenderer.tsx`
  - `src/features/predictions/components/stats/DefaultStatCard.tsx`
  - `src/features/predictions/components/stats/PodiumStatCard.tsx`
  - `src/features/predictions/components/stats/RoomStats.tsx`
  - `src/shared/ui/animations/background-gradient.tsx`
- Unused dependencies flagged: `@fontsource-variable/fira-code`, `tailwindcss`
- Unused devDependencies flagged: `eslint`, `shadcn`, `tw-animate-css`
- Unlisted dependency usage flagged: `react-router`, `@radix-ui/react-separator`
- Action: triage each item before removal; do not auto-delete based on a single tool result.

## 11. Definition of Done for future pull requests

- [ ] Imports follow alias and feature public API rules.
- [ ] No new deep imports into other feature internals.
- [ ] `npm run lint` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes.
- [ ] `npm run unused` results reviewed (and explained if intentionally deferred).
- [ ] Documentation updated when folder ownership or public APIs change.
- [ ] No business logic/UI/routing/API behavior changes unless explicitly scoped.
