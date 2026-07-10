# agentic-dev — Project Constitution

This repo is an in-house, baseline **agentic development process template** built
entirely on Claude Code's native subagents (no third-party frameworks), plus a
minimal zero-dependency demo app the process operates on.

## Roles

- **Product owner** — the human user. Originates every feature ask, answers all
  OPEN QUESTIONS escalated by agents, and gives final acceptance. Nothing is
  "done" until QA passes, the UX designer approves design verification, and the
  product owner accepts.
- **Orchestrator** — the main Claude Code session. Sequences the agents below
  via the Agent tool (subagents cannot spawn subagents) and routes artifacts
  between them. The pipeline is encoded in `/feature`.
- **ux-designer** — owns design AND design verification. Writes specs and design
  tokens; after QA passes, reviews the implemented product against the spec.
  Never writes application code.
- **frontend-developer** — implements UI from specs. Never designs, never edits
  backend code or tests.
- **backend-developer** — implements APIs, server, data, and infra/CI. Never
  touches UI files or tests.
- **qa-engineer** — writes test plans and automated tests, runs them, verifies
  acceptance criteria, files defect reports. Never fixes product code.

## Tech stack (single source of truth — agents read this, never assume)

- **Frontend**: vanilla HTML/CSS/JS in `app/public/`. No frameworks.
- **Backend**: Node.js built-in `node:http` in `app/server.js`. **No npm
  dependencies allowed** — there is deliberately no `package.json`.
- **Tests**: Node's built-in runner (`node:test` + `node:assert`) in `app/test/`.

Agents: derive all stack decisions from this section. Do not introduce
frameworks, dependencies, or package managers. If the stack here changes,
adapt to it — nothing about the stack is hardcoded in your role.

## Commands

- Run the app: `node app/server.js` → http://localhost:3000
- Run the tests: `node --test app/test/*.test.js`
- Capture rendered evidence (QA): `node tools/browser.js dom <url>` (post-JS
  DOM) and `node tools/browser.js shot <url> <out.png> [WxH]` — zero-dep
  headless-Chromium wrapper; exits 2 with a clear message when no browser is
  installed (fall back to static checks).

## Workflow rules

1. Features flow: UX spec → frontend + backend (parallel) → QA → QA fix loop →
   UX design verification → design fix loop → product-owner acceptance.
2. No agent leaves its lane: UX never writes app code; devs never edit
   `docs/specs/` or `docs/design-system.md`; QA never fixes product code;
   devs never write tests.
3. Fix loops are bounded (max 2 iterations each). When exhausted, stop and
   report open items to the product owner.
4. Ambiguity is never improvised away — it goes in OPEN QUESTIONS, and the
   orchestrator escalates it to the product owner.
5. Fix routing is batched: defects/findings are grouped by `Area` and each
   owning dev agent gets ONE invocation carrying all its items; frontend and
   backend fixers run in parallel (single message) when both have work.
6. Every `/feature` run maintains a pipeline state file (see Artifact
   conventions) so interrupted runs resume via `/feature-resume` instead of
   restarting.
7. Agents are pinned to `model: sonnet` in their frontmatter so runs don't
   inherit a pricier session model. Change deliberately, not per-run.

## Artifact conventions (the handoff contract)

Subagents share no context. Every handoff is a file; every invocation passes
explicit file paths.

- UX specs: `docs/specs/NNN-<slug>.md` (next NNN = highest existing + 1).
- Design tokens: `docs/design-system.md`. `app/public/styles.css` may only use
  values via the CSS custom properties defined from these tokens.
- Test plans: `docs/qa/test-plans/NNN-<slug>.md`.
- Defects: `docs/qa/defects/NNN-<slug>-<n>.md` per `docs/qa/TEMPLATE-defect.md`.
  The `Area` field (frontend | backend | design) routes the fix.
- Design verification reports: `docs/design-reviews/NNN-<slug>.md`.
- QA evidence (screenshots, DOM dumps): `docs/qa/evidence/NNN-<slug>/` —
  produced by the qa-engineer with `tools/browser.js`, consumed by the
  ux-designer during design verification.
- Pipeline state: `docs/pipeline/NNN-<slug>.md` — created at `/feature`
  Phase 0, updated after every phase (`Status: in-progress | complete |
  stopped`, `Current phase`, loop counters, phase log). Read by
  `/feature-resume` and surfaced at session start by a hook.
- Backlog / spec-number registry: `docs/backlog.md`, managed via `/backlog`.
  When features run concurrently (e.g. parallel worktrees), spec NNNs are
  allocated here, not by scanning `docs/specs/`.
- Every subagent ends its reply with a structured handoff footer:

  ```
  ARTIFACTS WRITTEN: <paths, or "none">
  STATUS: <role-specific status or verdict>
  OPEN QUESTIONS: <numbered list, or "none">
  ```

## Enforcement note

Lane boundaries are mechanically enforced, not just prompted:

- Tool access is restricted per agent in `.claude/agents/*.md` frontmatter
  (e.g. the ux-designer has no Bash).
- `.claude/hooks/enforce-lanes.js` (a PreToolUse hook registered in
  `.claude/settings.json`) blocks `Write`/`Edit` outside each agent's lane,
  blocks every actor from creating `package.json`/lockfiles/`node_modules`,
  and blocks subagents from touching the enforcement layer itself. Unknown
  agents fail closed — register new agents in its lane table.
- `.claude/hooks/check-footer.js` (SubagentStop) blocks a role agent from
  finishing without the required handoff footer.
- Honest limitation: Bash is policed by command heuristics only (package
  managers, `git commit/push`); file writes routed through shell redirection
  are not caught. The hard-enforced write channels are `Write`/`Edit`, and
  the hooks fail open on internal errors so a hook bug can never brick the
  pipeline.
