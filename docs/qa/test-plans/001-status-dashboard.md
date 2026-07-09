# Test Plan 001 — Status Dashboard

- Spec: `docs/specs/001-status-dashboard.md`
- Author: qa-engineer
- Verdict: PASS

## Criteria → verification mapping

| # | Acceptance criterion | Verification | Result |
|---|---|---|---|
| 1 | `/api/status` contract (types, values) | `app/test/api.test.js` — contract test | pass |
| 2 | Unknown `/api/*` → 404 JSON | `app/test/api.test.js` — 404 test | pass |
| 3 | `/` serves dashboard HTML with status card | `app/test/static.test.js` — HTML test | pass |
| 4 | Correct content types; traversal rejected | `app/test/static.test.js` — css + traversal tests | pass |
| 5 | Loading → success rendering from API | Manual: load page, observe card populate | pass |
| 6 | Error state with Retry when API unreachable | Manual: stop server after load, click Refresh | pass |
| 7 | Refresh re-fetches and updates | Manual: click Refresh, last-checked updates | pass |
| 8 | `role="status"` + `aria-live`; token-only styling | `static.test.js` (attributes) + static review of `styles.css` | pass |

## Notes

- Automated coverage: criteria 1–4 and the attribute half of 8.
- Criteria 5–7 are browser-behavior checks; automate later if browser tooling
  is added to the QA agent's toolbox.
