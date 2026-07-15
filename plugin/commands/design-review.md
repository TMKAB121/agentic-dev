---
description: Have the UX designer audit the implemented UI against its spec and the design system
---

Scope requested by the product owner (may be empty = most recent spec): **$ARGUMENTS**

You are the orchestrator:

1. Identify the spec to review against: the one named in the arguments, or the
   highest-numbered file in `docs/specs/` if none was given.
2. Invoke the `ux-designer` subagent in Mode 2 (design verification) with the
   spec path and `app/public/` as the scope — synchronously, with
   `run_in_background: false`, and wait for it to return before reading its
   report (the Agent tool defaults to background; a backgrounded call reads as a
   stall). It writes its report to `docs/design-reviews/` and returns APPROVED or
   CHANGES REQUIRED.
3. Present the findings table and verdict to the product owner.
4. If the verdict is CHANGES REQUIRED, ask the product owner whether to route
   the findings to `frontend-developer` (or `backend-developer` where
   applicable) for fixes now. If yes, run the fix → QA regression → UX
   re-review loop from `/feature` Phase 6 (max 2 iterations).
