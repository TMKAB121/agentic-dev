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
- **Backend**: Node.js built-in `node:http` in `app/server.js`. **Zero
  dependencies by default** — there is deliberately no `package.json` until the
  product owner approves one (see Dependency policy below).
- **Tests**: Node's built-in runner (`node:test` + `node:assert`) in `app/test/`.

Agents: derive all stack decisions from this section. Do not introduce
frameworks, dependencies, or package managers on your own. If you believe a
dependency is warranted, escalate it under OPEN QUESTIONS — do not add it
silently. If the stack here changes, adapt to it — nothing about the stack is
hardcoded in your role.

### Dependency policy (product-owner gated)

Zero dependencies is the **default**, not an absolute ban. The product owner
can approve specific packages per project by adding their bare names to
`dependencies.allow` in `.claude/lanes.json` (a protected, product-owner-only
file). The model is a **per-package allowlist**:

- With an **empty** allowlist (this repo's default), package managers,
  `package.json`, and lockfiles are all denied for everyone — the zero-dep
  posture is unchanged.
- Once a package is on the allowlist, the **installer lane**
  (`dependencies.installers`, default `backend-developer`) may install *that*
  package and declare it in `package.json`; anything not on the list stays
  denied.
- Agents cannot edit `.claude/lanes.json` (it is in the protected set), so the
  approval decision is always the product owner's. The flow is: backend raises
  the package under OPEN QUESTIONS → product owner adds it to the allowlist →
  backend installs and wires it up.

This is enforced mechanically by `.claude/hooks/enforce-lanes.js` (see the
Enforcement note).

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
4. Ambiguity and product-owner-level decisions are never improvised away. Any
   choice the product owner should get a say in — design direction,
   infrastructure/architecture, scope, security or data tradeoffs, or a
   genuinely ambiguous requirement — goes in OPEN QUESTIONS rather than being
   decided silently. This holds for all four agents. The orchestrator treats a
   non-empty OPEN QUESTIONS from any phase as a hard stop: it surfaces the
   items to the product owner and waits for answers before proceeding, then
   re-invokes the agent with those answers.
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
  `.claude/settings.json`) blocks `Write`/`Edit` outside each agent's lane and
  blocks subagents from touching the enforcement layer itself. Unknown agents
  fail closed — register new agents in its lane table.
- The same hook enforces the **Dependency policy**: it reads
  `dependencies.allow` / `dependencies.installers` from `.claude/lanes.json`
  and, per package-manager Bash command and per `package.json` write, permits
  only approved packages for the installer lane. With an empty allowlist it
  denies package managers, `package.json`, lockfiles, and `node_modules` for
  everyone (the zero-dependency default). Deny messages steer the agent to
  OPEN QUESTIONS rather than a retry.
- `.claude/hooks/check-footer.js` (SubagentStop) blocks a role agent from
  finishing without the required handoff footer.
- Honest limitation: Bash is policed by command heuristics only (package
  managers, `git commit/push`); file writes routed through shell redirection,
  and `package.json` files created by a package manager rather than through
  `Write`/`Edit`, are not caught. The hard-enforced write channels are
  `Write`/`Edit`, and the hooks fail open on internal errors so a hook bug can
  never brick the pipeline.
