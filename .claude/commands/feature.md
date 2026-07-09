---
description: Run the full agentic feature pipeline (UX → dev → QA → design verification) for a product-owner ask
---

The product owner's ask: **$ARGUMENTS**

You are the orchestrator. Run the pipeline below using the Agent tool with the
project subagents (`ux-designer`, `frontend-developer`, `backend-developer`,
`qa-engineer`). Rules that apply throughout:

- Pass explicit file paths in every agent prompt — subagents share no context.
- After each phase, read the agent's handoff footer. If OPEN QUESTIONS is not
  "none", stop and put the questions to the product owner (AskUserQuestion),
  then re-invoke that agent with the answers.
- Do not skip phases, do not do an agent's work yourself, do not commit unless
  the product owner asks.

## Phase 1 — Design

Determine the next spec number NNN (highest in `docs/specs/` + 1). Invoke
`ux-designer` (Mode 1) with the ask and instruct it to write
`docs/specs/NNN-<slug>.md`. Wait, then read the spec. Proceed only when
STATUS is `ready-for-dev`.

## Phase 2 — Implementation (parallel)

In a single message, invoke both:
- `backend-developer` (Mode 1) with the spec path — implement the API contract.
- `frontend-developer` (Mode 1) with the spec path — implement the UI.

This is safe because the spec pre-defines the API contract and the two agents
own disjoint files. Exception: if the spec leaves the API contract undefined,
run backend first and pass its contract block to the frontend afterwards.

## Phase 3 — QA

Invoke `qa-engineer` (Mode 1) with the spec path and the changed-files lists
from both dev handoffs.

## Phase 4 — QA fix loop (max 2 iterations)

If VERDICT: FAIL — for each defect file, route by its `Area` field:
- `frontend` → `frontend-developer` (Mode 2)
- `backend` → `backend-developer` (Mode 2)
- `design` → `ux-designer` first (spec clarification), then the owning dev
After fixes, invoke `qa-engineer` (Mode 2) to re-verify. If still FAIL after
2 iterations, stop and report the open defects to the product owner.

## Phase 5 — Design verification

Once QA passes, invoke `ux-designer` (Mode 2) with the spec path to review the
implementation. It writes `docs/design-reviews/NNN-<slug>.md` and returns
APPROVED or CHANGES REQUIRED.

## Phase 6 — Design fix loop (max 2 iterations)

If CHANGES REQUIRED — route findings to the owning dev agent (Mode 2), then
`qa-engineer` (Mode 2) for a regression run, then `ux-designer` (Mode 2)
re-review. If still not APPROVED after 2 iterations, stop and report the open
findings to the product owner.

## Phase 7 — Report to the product owner

Present a summary table: phase · agent · artifacts written · status. State
the final QA verdict and design verdict, list any open items, and ask the
product owner for acceptance. Do not commit unless they ask.
