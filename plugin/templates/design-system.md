# Design System

Owner: `ux-designer` agent. Developers implement these tokens as CSS custom
properties in `app/public/styles.css` and may not introduce visual values that
are not defined here. New values are added *here first*, by the ux-designer.

## Color tokens

| Token | Value | Use |
|---|---|---|
| `--color-bg` | `#f5f7fa` | Page background |
| `--color-surface` | `#ffffff` | Cards, panels |
| `--color-text` | `#1a2233` | Primary text (AA on bg and surface) |
| `--color-text-muted` | `#5a6478` | Secondary text (AA on surface) |
| `--color-accent` | `#2455c3` | Buttons, links, focus ring |
| `--color-accent-contrast` | `#ffffff` | Text on accent |
| `--color-success` | `#1a7f37` | Healthy/OK states |
| `--color-success-bg` | `#e6f4ea` | Success badge background |
| `--color-danger` | `#b42318` | Error states |
| `--color-danger-bg` | `#fdecea` | Error badge background |
| `--color-border` | `#d7dce5` | Card borders, dividers |

Contrast: all text/background pairs above meet WCAG AA (4.5:1) for normal text.

## Spacing scale

| Token | Value |
|---|---|
| `--space-1` | `0.25rem` |
| `--space-2` | `0.5rem` |
| `--space-3` | `1rem` |
| `--space-4` | `2rem` |

## Shape & typography

| Token | Value |
|---|---|
| `--radius` | `8px` |
| `--font-sans` | `system-ui, -apple-system, "Segoe UI", sans-serif` |
| `--font-size-base` | `1rem` |
| `--font-size-lg` | `1.25rem` |
| `--font-size-xl` | `1.75rem` |

## Component rules

- **Card**: `--color-surface` background, `1px solid --color-border`,
  `--radius` corners, `--space-3` padding.
- **Badge**: pill shape (`999px` radius is the one permitted literal), bold
  label, success or danger color pair depending on state.
- **Button**: `--color-accent` background with `--color-accent-contrast` text,
  `--radius` corners; visible focus outline (2px `--color-accent`, offset 2px).

## Dark / terminal theme tokens (used by: welcome page, spec 002)

A second, dark palette for marketing/landing surfaces that want a distinct
identity from the light admin surfaces above. Values are the widely-used
GitHub Primer dark set, chosen because the pairings are pre-verified AA and
battle-tested for long-form reading on a dark background.

| Token | Value | Use |
|---|---|---|
| `--color-bg-dark` | `#0d1117` | Dark-theme page background |
| `--color-surface-dark` | `#161b22` | Dark-theme panels (e.g. terminal window body) |
| `--color-text-dark` | `#e6edf3` | Primary text on dark surfaces (AA on bg-dark/surface-dark) |
| `--color-text-dark-muted` | `#8b949e` | Secondary text on dark surfaces (AA on bg-dark/surface-dark) |
| `--color-border-dark` | `#30363d` | Borders/dividers on dark surfaces |
| `--color-accent-terminal` | `#3fb950` | Prompt glyphs, links, cursor, primary CTA background (AA as text on bg-dark) |
| `--color-accent-amber` | `#d29922` | Secondary highlight only (e.g. step index numerals); AA as text on bg-dark |

Contrast: all text/background pairs above meet WCAG AA (4.5:1) for normal
text. The primary CTA button uses `--color-bg-dark` as its text color on a
`--color-accent-terminal` background (dark-on-bright-green passes AA; do not
use `--color-text-dark` on this background).

## Motion tokens

| Token | Value |
|---|---|
| `--motion-fast` | `150ms` |
| `--motion-blink` | `1000ms` |

Any animation built from these tokens (e.g. a blinking cursor) must be
disabled under `@media (prefers-reduced-motion: reduce)` — show the static
end-state instead of looping.

## Breakpoints (documented values, not CSS custom properties)

CSS media-query conditions cannot reference custom properties, so breakpoints
are recorded here as the single source of truth instead of a `var()` token.
Implementers must use the literal value below and no other.

| Name | Value | Use |
|---|---|---|
| `--breakpoint-sm` (documented only) | `640px` | Below this width, stacked/single-column layouts apply |

## Extended shape tokens

| Token | Value | Use |
|---|---|---|
| `--radius-lg` | `16px` | Larger chrome, e.g. the terminal-window frame (distinct from `--radius` used by cards/buttons) |
| `--space-5` | `3rem` | Generous section rhythm on landing/marketing pages (hero and section vertical spacing) |
| `--font-mono` | `ui-monospace, "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace` | Monospace accents (prompts, code-like labels) on the terminal theme |

## Accessibility baseline (applies to every feature)

- Semantic landmarks: `<header>`, `<main>`; headings in order.
- Dynamic regions announce updates: `role="status"` / `aria-live="polite"`.
- All interactive elements keyboard-reachable with a visible focus state.
- Color is never the only carrier of meaning (pair with text).
- Text contrast meets WCAG AA.
- Any looping/animated motion (e.g. a blinking cursor) is disabled under
  `@media (prefers-reduced-motion: reduce)`.
- Purely decorative elements (e.g. window-chrome dots) are `aria-hidden="true"`
  and never the sole carrier of information.
