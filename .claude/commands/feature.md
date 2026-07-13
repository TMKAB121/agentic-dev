---
description: Run the full agentic feature pipeline (UX → dev → QA → design verification) for a product-owner ask
---

The product owner's ask: **$ARGUMENTS**

You are the orchestrator. Run the pipeline below using the Agent tool with the
project subagents (`ux-designer`, `frontend-developer`, `backend-developer`,
`qa-engineer`). Rules that apply throughout:

- Pass explicit file paths in every agent prompt — subagents share no context.
- **OPEN QUESTIONS is a hard stop (all four agents, every phase).** After each
  agent returns, read its handoff footer. If its OPEN QUESTIONS is anything
  other than "none", STOP the pipeline immediately — do not start the next
  phase, do not invoke any other agent — and put the questions to the product
  owner with AskUserQuestion. When a phase ran multiple agents (e.g. the
  parallel dev phase or a fix loop), collect the open questions from all of
  them and surface them together. Only after the product owner answers do you
  re-invoke the raising agent(s) with those answers and continue. Log every
  question and its answer in the pipeline state file's "Open questions log".
  Never answer an agent's open question yourself.
- **A subagent's quoted lane/Bash denial is authoritative — do not "verify" it
  by attempting the action yourself.** The hook exempts the orchestrator
  (`if (!agent) return`), so your own probe (writing the file, running `npm`)
  always succeeds and will fool you into thinking the subagent confabulated. To
  check a reported block, replay it *as the subagent* — pipe a simulated
  PreToolUse payload to the hook:
  `echo '{"tool_name":"Write","agent_type":"backend-developer","tool_input":{"file_path":"terraform/main.tf"}}' | node "${CLAUDE_PLUGIN_ROOT:-.claude}/hooks/enforce-lanes.js"`
  — a `"permissionDecision":"deny"` in the output confirms the block is real.
  When a lane genuinely blocks work the pipeline requires, the fix is the
  product owner retargeting `.claude/lanes.json`, never a workaround.
- After each phase, update the pipeline state file (Phase 0) before starting
  the next phase — it is what makes the run resumable via `/feature-resume`.
- Do not skip phases, do not do an agent's work yourself, do not commit unless
  the product owner asks.

## Phase 0 — Pipeline state file

Determine the next spec number NNN: if `docs/backlog.md` exists and this ask
is (or should be) tracked there, allocate NNN via the backlog (see `/backlog`);
otherwise NNN = highest in `docs/specs/` + 1. Create
`docs/pipeline/NNN-<slug>.md`:

```
# Pipeline state — NNN-<slug>

Status: in-progress            <!-- in-progress | complete | stopped -->
Current phase: 1 — Design
QA fix-loop iteration: 0/2
Design fix-loop iteration: 0/2

## Ask

<the product owner's ask, verbatim>

## Phase log

| Phase | Agent | Artifacts | Status | When |
|---|---|---|---|---|

## Open questions log

(none yet)
```

Update `Current phase`, the loop counters, and append a phase-log row after
every phase. On stop (exhausted loop, open questions the owner must answer
offline) set `Status: stopped`; after Phase 7 acceptance set
`Status: complete`.

**Lane pre-flight (still Phase 0, before any dev agent runs).** The lane hook
only lets each dev agent write the dirs its lane lists; the built-in defaults
cover *this* repo's tree (`app/`, `.github/`, `tools/` for backend). If
CLAUDE.md's declared stack puts code a dev agent must write outside its lane —
most often infra like `terraform/` or a `server/` backend — confirm
`.claude/lanes.json` already covers it. Probe the risky path with a simulated
payload (the authoritative-denial rule above shows how); a
`"permissionDecision":"deny"` means Phase 2 would stall. If so, STOP and ask the
product owner to add a `.claude/lanes.json` (copy the plugin's
`templates/lanes.json` and adapt the paths) before continuing. Never write
`.claude/lanes.json` yourself — it is the product owner's protected file.

## Phase 1 — Design

Invoke `ux-designer` (Mode 1) with the ask and instruct it to write
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
from both dev handoffs. Remind it to capture rendered evidence with
`tools/browser.js` into `docs/qa/evidence/NNN-<slug>/` for browser-behavior
criteria — the design verification in Phase 5 consumes those screenshots.

## Phase 4 — QA fix loop (max 2 iterations)

If VERDICT: FAIL — **batch the routing**: group all open defects by their
`Area` field, then dispatch ONE invocation per owning agent carrying ALL of
that agent's defect paths:
- `frontend` defects → one `frontend-developer` (Mode 2) invocation
- `backend` defects → one `backend-developer` (Mode 2) invocation
- `design` defects → `ux-designer` first (spec clarification), then include
  the outcome in the owning dev's batch

When both dev agents have defects, invoke them **in parallel in a single
message** — they own disjoint files. After fixes, invoke `qa-engineer`
(Mode 2) once with every defect path to re-verify. If still FAIL after
2 iterations, stop and report the open defects to the product owner.

## Phase 5 — Design verification

Once QA passes, invoke `ux-designer` (Mode 2) with the spec path and the
evidence directory `docs/qa/evidence/NNN-<slug>/` (if QA produced one). It
writes `docs/design-reviews/NNN-<slug>.md` and returns APPROVED or
CHANGES REQUIRED.

## Phase 6 — Design fix loop (max 2 iterations)

If CHANGES REQUIRED — batch findings by owning area exactly as in Phase 4
(one invocation per dev agent, parallel when both have work), then
`qa-engineer` (Mode 2) for a regression run, then `ux-designer` (Mode 2)
re-review. If still not APPROVED after 2 iterations, stop and report the open
findings to the product owner.

## Phase 7 — Report to the product owner

Present a summary table: phase · agent · artifacts written · status. State
the final QA verdict and design verdict, list any open items, and ask the
product owner for acceptance. On acceptance, set the state file's
`Status: complete` (and the backlog row to `done`, if one exists). Do not
commit unless they ask.
