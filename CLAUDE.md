# Crow

Private prediction game for friend groups (formerly Verdict, before that
Predikt), live at playcrow.app. npm workspaces monorepo:

- `apps/web`: React 18 + Vite + TypeScript PWA, Tailwind CSS v4, shadcn/ui
  (Radix / Base UI), TanStack Query, React Router
- `supabase/`: Postgres schema (`schemas/`), migrations, edge functions, SQL tests

Read `apps/web/PRODUCT.md` and `apps/web/DESIGN.md` before UI work.
The app is mobile first: phone styles are the unprefixed classes, and
tablet/desktop only add `md:`/`lg:` overrides (DESIGN.md, Layout and
Breakpoints). Never change the phone view for a bigger screen.

## Commands (run from the repo root)

- `npm run dev`: start the web app
- `npm run lint` / `npm run typecheck`: what CI runs; both must pass before pushing
- `npm run check`: lint + typecheck + build
- `npm run db:types`: regenerate `apps/web/src/shared/lib/supabase.types.ts` after schema changes

## Styling

- Colors come only from the theme tokens in
  `apps/web/src/shared/assets/styles/global.css` (`bg-card`,
  `text-muted-foreground`, `text-win`, `bg-accent/10`, ...).
- Use token classes wherever possible. Don't use hex/`rgb()`/`oklch()`,
  arbitrary color values (`[#...]`) or raw palette classes (`zinc-900`,
  `red-500`) when a token would work.
- When a class can't be used (it's dynamic, inline style, SVG), still use the
  token: `var(--win)` or `twColor("win", 0.2)` from `@/shared/lib/utils`.
- Literal colors only as a last resort (canvas/WebGL, third-party brand marks),
  with a comment saying why.
- Need a new color? Add a token (`:root`, `.dark`, `@theme inline`), don't inline it.
- Details and patterns: the `tailwind-theming` skill.

## Code layout

- Features live in `apps/web/src/features/<feature>`; import them through their
  public API (`@/features/<feature>`) or `pages/*`, not their internals.
- Shared UI is in `apps/web/src/shared/ui`; reuse it before writing new components.
- The logo is `CrowTile` / `CrowGlyph` (`shared/ui/crow-mark.tsx`). Icon files are
  generated from `apps/web/brand/crow.svg` with `node brand/render-icons.mjs`
  (from `apps/web`); change the path in both places.
