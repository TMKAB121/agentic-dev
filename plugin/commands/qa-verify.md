---
description: Run a standalone QA verification pass against a spec
---

Scope requested by the product owner (may be empty = most recent spec): **$ARGUMENTS**

You are the orchestrator:

1. Identify the spec to verify: the one named in the arguments, or the
   highest-numbered file in `docs/specs/` if none was given.
2. Invoke the `qa-engineer` subagent in Mode 1 with the spec path. It updates
   the test plan, authors/updates tests, runs `node --test app/test/*.test.js`, and
   files defect reports for any failures.
3. Report the verdict (PASS | FAIL) and any defect file paths to the product
   owner.
4. If FAIL, ask the product owner whether to run the fix loop now (route each
   defect by its `Area` field to the owning dev agent, then QA re-verifies —
   max 2 iterations, as in `/feature` Phase 4).
