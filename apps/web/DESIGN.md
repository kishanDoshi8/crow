---
name: Crow
description: Private-first prediction UI for friend groups with compact, state-explicit interaction design.
colors:
    primary-live-rose: "oklch(0.645 0.246 16.439)"
    activity-cyan: "oklch(0.715 0.129 215.221)"
    accent-ember-orange: "oklch(0.769 0.188 70.08)"
    bg-paper: "oklch(1 0 0)"
    bg-night: "oklch(0.21 0.006 285.885)"
    surface-soft: "oklch(0.968 0.007 247.896)"
    ink-strong: "oklch(0.129 0.042 264.695)"
    ink-muted: "oklch(0.554 0.046 257.417)"
    ink-inverse: "oklch(0.984 0.003 247.858)"
    border-subtle: "oklch(0.929 0.013 255.508)"
    success-win: "oklch(0.723 0.191 142.542)"
    danger-loss: "oklch(0.645 0.246 16.439)"
    rank-gold: "oklch(0.828 0.189 84.429)"
typography:
    display:
        fontFamily: "Fira Code Variable, ui-monospace, monospace"
        fontSize: "2rem"
        fontWeight: 700
        lineHeight: 1.2
        letterSpacing: "-0.01em"
    headline:
        fontFamily: "Fira Code Variable, ui-monospace, monospace"
        fontSize: "1.5rem"
        fontWeight: 600
        lineHeight: 1.3
        letterSpacing: "-0.01em"
    title:
        fontFamily: "Fira Code Variable, ui-monospace, monospace"
        fontSize: "1.125rem"
        fontWeight: 600
        lineHeight: 1.35
        letterSpacing: "0"
    body:
        fontFamily: "Fira Code Variable, ui-monospace, monospace"
        fontSize: "0.875rem"
        fontWeight: 400
        lineHeight: 1.5
        letterSpacing: "0"
    label:
        fontFamily: "Fira Code Variable, ui-monospace, monospace"
        fontSize: "0.75rem"
        fontWeight: 500
        lineHeight: 1.3
        letterSpacing: "0.01em"
rounded:
    sm: "0.375rem"
    md: "0.5rem"
    lg: "0.625rem"
    xl: "0.875rem"
spacing:
    xs: "0.5rem"
    sm: "0.75rem"
    md: "1rem"
    lg: "1.5rem"
    xl: "2rem"
components:
    button-primary:
        backgroundColor: "{colors.primary-live-rose}"
        textColor: "{colors.ink-inverse}"
        rounded: "{rounded.md}"
        padding: "0.5rem 1rem"
    button-primary-hover:
        backgroundColor: "oklch(0.605 0.236 16.439)"
    button-outline:
        backgroundColor: "{colors.bg-paper}"
        textColor: "{colors.ink-strong}"
        rounded: "{rounded.md}"
        padding: "0.5rem 1rem"
    input-default:
        backgroundColor: "transparent"
        textColor: "{colors.ink-strong}"
        rounded: "{rounded.md}"
        height: "2.25rem"
    badge-success:
        backgroundColor: "oklch(0.723 0.191 142.542 / 0.1)"
        textColor: "{colors.success-win}"
        rounded: "9999px"
        padding: "0.125rem 0.5rem"
    tabs-trigger-active:
        backgroundColor: "{colors.bg-paper}"
        textColor: "{colors.ink-strong}"
        rounded: "{rounded.md}"
        height: "2rem"
---

# Design System: Crow

## 1. Overview

**Creative North Star: "Friendly Matchday Ledger"**

Crow’s interface behaves like a fast, trustworthy score desk for friend-group competition. It keeps social energy visible, but it never sacrifices legibility or game-rule clarity for spectacle. The visual rhythm is compact, direct, and state-explicit, so players can make decisions quickly and verify outcomes without friction.

The voice is calm precision with competitive energy: sharp information hierarchy, disciplined color semantics, and interaction states that always declare intent. Primary color appears as signal, not decoration. Surfaces stay neutral so scoring cues, rank cues, and outcome cues remain cognitively immediate.

**Key Characteristics:**

- Compact spacing and explicit state signaling over decorative layout density.
- Monospace-forward typography for scoreboarding clarity and numerical stability.
- Restrained base surfaces with high-contrast competitive accents.
- Interaction-first depth: motion and elevation only when state changes.

### Logo

The mark is a black crow mid-caw on the rose-to-amber tile (`CrowTile` / `CrowGlyph` in `src/shared/ui/crow-mark.tsx`). The crow uses `--brand-ink` in both themes; the tile is the `primary` → `accent` gradient at 135°. The wordmark is lowercase "crow" in Fira Code, set tight. Icon files come from `brand/crow.svg` via `node brand/render-icons.mjs`.

## 2. Colors

The palette is a restrained product system where neutral architecture carries reading comfort, rose/orange carry competition energy, and cyan carries activity-feed interaction context.

### Primary

- **Live Signal Rose** (oklch(0.645 0.246 16.439)): Reserved for primary actions, active competitive status, and high-priority game calls where immediate attention is required.

### Secondary

- **Ember Accent Orange** (oklch(0.769 0.188 70.08)): Used for supporting emphasis, hot-state cues, and secondary action highlighting where urgency is directional, not critical.

### Activity Signal

- **Activity Cyan** (oklch(0.715 0.129 215.221)): Reserved for activity cards and timeline interaction cues where we want clarity without implying destructive intent.

### Tertiary

- **Rank Gold** (oklch(0.828 0.189 84.429)): Used only for podium/rank semantics and celebratory position indicators.

### Neutral

- **Paper Background** (oklch(1 0 0)): Main reading surface and form/copy background.
- **Night Surface** (oklch(0.21 0.006 285.885)): Dark-mode raised container and dialog/card body.
- **Strong Ink** (oklch(0.129 0.042 264.695)): Default body text and high-contrast UI labels.
- **Muted Ink** (oklch(0.554 0.046 257.417)): Secondary metadata and explanatory copy.
- **Subtle Border** (oklch(0.929 0.013 255.508)): Input, card, and divider boundary definition.

### Named Rules

**The Signal Scarcity Rule.** Primary and accent are signaling tools, not atmosphere paint. If everything is loud, nothing is readable.

**The Outcome Color Rule.** Win/loss colors communicate game state only. They never stand in for neutral UI semantics.

## 3. Typography

**Display Font:** Fira Code Variable (fallback: ui-monospace, monospace)
**Body Font:** Fira Code Variable (fallback: ui-monospace, monospace)
**Label/Mono Font:** Fira Code Variable

**Character:** Technical and compact, with stable glyph rhythm for numbers, scores, and leaderboard data.

### Hierarchy

- **Display** (700, 2rem, 1.2): Hero-equivalent page titles and high-priority room/prediction headers.
- **Headline** (600, 1.5rem, 1.3): Section-leading headings and panel titles.
- **Title** (600, 1.125rem, 1.35): Card titles, dialog headings, and dense list headers.
- **Body** (400, 0.875rem, 1.5): Main copy and most UI text; prose blocks should remain within 65-75ch when used.
- **Label** (500, 0.75rem, 1.3, 0.01em): Status tags, auxiliary labels, and compact metadata.

### Named Rules

**The Numeric Stability Rule.** Any score, payout, streak, or rank value uses title/body weights that favor readability over stylistic contrast.

**The One-Family Rule.** Use one type family with weight shifts, not mixed display/body families, to keep high-density UI coherent.

## 4. Elevation

Crow is flat by default. Elevation appears only when interaction state changes (hover, active tab, modal open) or when focus needs explicit affordance.

### Shadow Vocabulary

- **Micro Lift** (shadow-xs, equivalent to 0 1px 2px rgba(0,0,0,0.06)): Inputs and outline controls at rest where subtle affordance is needed.
- **Interactive Lift** (shadow-sm, equivalent to 0 2px 6px rgba(0,0,0,0.1)): Active segmented controls and selected tab triggers.
- **Modal Lift** (shadow-lg, equivalent to 0 10px 25px rgba(0,0,0,0.18)): Dialog surfaces over scrim.

### Named Rules

**The Flat-By-Default Rule.** No persistent decorative depth on passive surfaces.

**The State-Driven Depth Rule.** Shadow exists to confirm interaction state, not to stylize containers.

## 5. Components

All core components are compact, tactile, and state-explicit.

### Buttons

- **Shape:** Rounded medium rectangle (0.5rem radius).
- **Primary:** Live Signal Rose fill with inverse ink text; compact horizontal padding (0.5rem 1rem).
- **Hover / Focus:** Hover darkens fill; focus uses ring with 3px visible treatment.
- **Outline / Secondary / Ghost:** Outline uses neutral boundary on transparent/paper surfaces; ghost relies on muted/hover surface swap rather than border noise.

### Chips

- **Style:** Full-pill shape with compact x-padding and very small y-padding.
- **State:** Success badges use low-alpha win background + win text + thin semantic border.

### Cards / Containers

- **Corner Style:** 0.625rem default card/dialog corner language.
- **Background:** Neutral paper in light mode, night surface in dark mode.
- **Shadow Strategy:** Flat at rest; modal-level elevation only when context isolation is needed.
- **Border:** Subtle neutral border token.
- **Internal Padding:** Defaults to 1rem-1.5rem based on context density.

### Inputs / Fields

- **Style:** Transparent field body on bordered container with compact height (2.25rem).
- **Focus:** Explicit ring + border color shift to ring token.
- **Error / Disabled:** Invalid state uses destructive border/ring semantics; disabled state drops opacity and pointer affordance.

### Navigation

- **Tabs:** Compact segmented control with active-state background and state-explicit text color promotion.
- **Active indicator:** In line-variant tabs, active marker is rendered via pseudo-element underline/edge rail, not extra decorative chrome.

## 6. Layout and Breakpoints

Crow is played on phones, so it is designed **mobile first**: the unprefixed Tailwind classes are the phone design, and wider screens only add `md:` / `lg:` overrides on top. A change for a bigger screen must never change the phone.

| Size | Width | Layout |
| --- | --- | --- |
| Phone | < 768px | The app as designed: room header on top, bottom tab bar, one column (`max-w-md` / `max-w-lg`). |
| Tablet | 768–1023px (`md`) | The phone layout. Columns stay centred; nothing new. |
| Desktop | ≥ 1024px (`lg`) | Sidebar layout, below. Tablets in landscape land here. |

### Desktop

- **Sidebar, not a top bar** (the Slack / Discord pattern). A fixed 16rem sidebar (`bg-sidebar`, right border) holds what the phone spreads across the header, bottom tab bar and room menu: the room switcher (a dropdown, not the phone's drawer), the series picker (dropdown) and points, the four tabs, Staff (Needs you with its count, New prediction), then Activity, Invite friends and the room menu at the bottom. `RoomSidebar` in `src/app/layouts`.
- **No header on tab pages.** Inner pages keep a slim header with Back and their title; a page without a title shows "Back".
- **Content widths.** Lists and feeds (Standings, History, Needs you, Members, Activity, Series) widen to `lg:max-w-2xl`. Forms stay `max-w-md`. Two-column pages are capped at `max-w-260` (65rem):
  - **Home:** where you stand and What's Hot on the left, the side cards (your week, needs you, results, invite, stats, up next) in a 20rem column on the right. What's Hot shows its cards two across (one card fills the column) instead of the swipe carousel.
  - **Prediction:** the prediction on the left, Room talk in a 22rem column on the right. The phone's bottom action bar becomes a control pinned to the bottom of the left column.
- **Sheets stay sheets.** Bottom sheets (bet, phrases, menus) keep working as centred sheets; dialogs are unchanged.
- **Structure vs style.** Use responsive classes for style. Where desktop needs a different structure (Home, the prediction page), branch on `useIsDesktop()` (`src/shared/lib/useMediaQuery.ts`) so the phone keeps rendering exactly the tree it had.

### Named Rules

**The Phone Is The Product Rule.** Every screen is designed and judged at 390px first. Desktop rearranges what the phone has; it never adds features of its own.

**The One Sidebar Rule.** Desktop navigation lives in the sidebar only. Don't add a second navigation surface (top tabs, a bottom bar) at desktop widths.

## 7. Do's and Don'ts

### Do:

- **Do** keep primary/accent usage intentional and tied to action or competitive status.
- **Do** preserve compact control heights and spacing for high-frequency interaction flows.
- **Do** keep focus-visible rings explicit (3px ring treatment) on all interactive primitives.
- **Do** use win/loss/rank tokens only for game semantics and leaderboard interpretation.

### Don't:

- **Don't** resemble casino or gambling dark-pattern products.
- **Don't** resemble noisy, overloaded gamer interfaces where visual aggression overwhelms clarity and task flow.
- **Don't** use side-stripe borders (border-left or border-right accents above 1px) as decorative emphasis.
- **Don't** use gradient text or decorative glassmorphism as default UI treatments.
- **Don't** ship inconsistent button/input/tab vocabulary across screens; consistency is part of trust.
