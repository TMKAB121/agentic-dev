# Spec 001 — Status Dashboard

- Status: implemented
- Author: ux-designer
- Requested by: product owner

## Overview

A single-page dashboard showing the health of the demo service: current
status, uptime, and last-checked time, with a manual refresh.

## User flow

1. User opens `/`. The status card shows a loading state.
2. The app fetches `GET /api/status`; on success the card shows the status
   badge, uptime, and timestamp.
3. On fetch failure the card shows an error state with a Retry action.
4. The Refresh button re-runs step 2 at any time.

## Layout

```
┌──────────────────────────────────────────────┐
│  header: Service Status                      │
├──────────────────────────────────────────────┤
│  main                                        │
│   ┌────────────────────────────────────┐     │
│   │  Status card                       │     │
│   │  [● OK]  (badge)                   │     │
│   │  Uptime: 3m 12s                    │     │
│   │  Last checked: 14:02:11            │     │
│   │  [ Refresh ]                       │     │
│   └────────────────────────────────────┘     │
└──────────────────────────────────────────────┘
```

## Components & states

- **Status card** (Card per design system)
  - *Loading*: badge area reads "Checking…", muted text, Refresh disabled.
  - *Success*: success badge with status text ("OK"), uptime formatted as
    `Nm Ns` (hours shown when ≥ 1h), last-checked as local `HH:MM:SS`.
  - *Error*: danger badge reading "Unreachable", explanatory muted line,
    Refresh acts as Retry.
- **Refresh button** (Button per design system).

## API contract (implemented by backend, consumed by frontend and QA)

`GET /api/status` → `200 OK`, `Content-Type: application/json`

```json
{ "status": "ok", "uptimeSeconds": 192, "timestamp": "2026-07-09T14:02:11.000Z" }
```

- `status`: string, `"ok"` in this baseline.
- `uptimeSeconds`: non-negative integer (whole seconds since server start).
- `timestamp`: ISO-8601 string, server time of the response.

Unknown `/api/*` paths → `404` with JSON body `{ "error": "not found" }`.

## Design tokens used

Card, Badge (success + danger pairs), Button per `docs/design-system.md`.
No values outside the token set.

## Accessibility requirements

- Page uses `<header>` and `<main>`; single `<h1>`.
- The status card is a `role="status"` / `aria-live="polite"` region.
- Refresh is a real `<button>` with a visible focus state.
- State is conveyed by badge *text*, not color alone.

## Acceptance criteria

1. `GET /api/status` returns 200 with JSON matching the contract above
   (correct types for all three fields).
2. Unknown `/api/*` paths return 404 with a JSON error body.
3. `GET /` serves the dashboard HTML containing the status card region.
4. Static assets are served with correct content types (`text/css` for the
   stylesheet); requests outside `app/public/` are rejected.
5. On load, the card shows a loading state, then renders status, uptime, and
   last-checked from the API response.
6. If the API is unreachable, the card shows the error state with Retry.
7. The Refresh button re-fetches and updates the card.
8. The card region has `role="status"` and `aria-live="polite"`; all styling
   values come from the design tokens.
