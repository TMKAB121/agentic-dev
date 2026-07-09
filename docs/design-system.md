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

## Accessibility baseline (applies to every feature)

- Semantic landmarks: `<header>`, `<main>`; headings in order.
- Dynamic regions announce updates: `role="status"` / `aria-live="polite"`.
- All interactive elements keyboard-reachable with a visible focus state.
- Color is never the only carrier of meaning (pair with text).
- Text contrast meets WCAG AA.
