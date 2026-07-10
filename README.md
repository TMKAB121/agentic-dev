# agentic-dev

A baseline, in-house **agentic development process** built entirely on Claude
Code's native subagents — no third-party orchestration frameworks, no npm
dependencies. Four role agents collaborate through files in this repo, driven
by slash commands, with the human acting as **product owner**. A minimal
zero-dependency demo app (a status dashboard) gives the process something real
to operate on.

## Architecture

```
                         Product owner (you)
                    makes the ask, answers questions,
                        gives final acceptance
                                 │
                        /feature "the ask"
                                 │
                 Orchestrator (main Claude Code session)
                                 │
   ┌───────────────┬─────────────┴────────────┬────────────────┐
   ▼               ▼                          ▼                ▼
ux-designer   frontend-developer      backend-developer    qa-engineer
(design +     (UI per spec)           (API / server /      (test plans,
 design                                infra)               tests, defects)
 verification)
   │               │                          │                │
   └──────► artifacts on disk: docs/specs/ · docs/design-system.md ◄──┘
            docs/qa/ · docs/design-reviews/ · app/
```

Subagents share no context, so **every handoff is a file** — specs, defect
reports, design reviews — and the orchestrator passes explicit paths between
phases. The full rules live in [CLAUDE.md](CLAUDE.md).

## The four agents

| Agent | Owns | Forbidden | Key artifacts |
|---|---|---|---|
| `ux-designer` | Design specs, design tokens, accessibility, **design verification** after QA | Writing any app code; has no Bash access | `docs/specs/`, `docs/design-system.md`, `docs/design-reviews/` |
| `frontend-developer` | UI implementation per spec | Editing specs, backend code, or tests | `app/public/` |
| `backend-developer` | API, server, data, infra/CI | Editing UI files, specs, or tests; adding dependencies | `app/server.js` |
| `qa-engineer` | Test plans, automated tests, verification, defect reports | Fixing product code | `app/test/`, `docs/qa/` |

## The pipeline (`/feature`)

```
You (product owner): /feature "add X"
  1. ux-designer writes docs/specs/NNN-<slug>.md
  2. frontend-developer + backend-developer implement in parallel
  3. qa-engineer writes a test plan + tests, runs them → PASS | FAIL
  4. QA fix loop: defects routed by Area to the owning dev, QA re-verifies (max 2)
  5. ux-designer verifies the implementation against the spec → APPROVED | CHANGES REQUIRED
  6. Design fix loop: findings → dev → QA regression → UX re-review (max 2)
  7. Summary back to you for final acceptance
```

Open questions from any agent stop the line and come back to you. Exhausted
fix loops stop the line and come back to you with the open items.

Standalone commands: `/design-review` (UX audit of the current UI),
`/qa-verify` (standalone QA pass against a spec), `/feature-resume` (continue
an interrupted run from its `docs/pipeline/` state file), and `/backlog`
(queue feature asks and allocate spec numbers).

Every `/feature` run writes a state file to `docs/pipeline/NNN-<slug>.md` and
updates it after each phase, so interrupted runs are resumable and auditable;
a SessionStart hook surfaces in-flight runs and queued backlog items when a
session opens. QA captures rendered evidence (screenshots + post-JS DOM) with
the zero-dependency `tools/browser.js` wrapper into `docs/qa/evidence/`, and
the ux-designer verifies design against those screenshots — not just the
source.

## Quickstart

1. Open this repo in Claude Code.
2. Run the demo app: `node app/server.js` → http://localhost:3000
3. Run the tests: `node --test app/test/*.test.js`
4. Run the pipeline on a real ask, e.g.:
   `/feature "show the server's Node.js version on the status card"`

## Repo layout

```
CLAUDE.md                 project constitution: roles, stack, workflow, handoff contract
.claude/agents/           the four role agents (markdown + YAML frontmatter)
.claude/commands/         /feature, /feature-resume, /backlog, /design-review, /qa-verify
.claude/hooks/            lane enforcement, footer check, session-start state surfacing
.claude/settings.json     hook registration + package-manager deny rules
tools/browser.js          zero-dep headless-Chromium wrapper (QA evidence)
docs/design-system.md     design tokens + component rules (UX-owned)
docs/specs/               UX feature specs (NNN-<slug>.md)
docs/qa/                  test plans, defect template, defect reports, evidence/
docs/design-reviews/      UX design-verification reports
docs/pipeline/            per-feature pipeline state files (resumability + audit)
docs/backlog.md           feature queue + spec-number registry (created by /backlog)
app/server.js             zero-dependency Node http server (API + static)
app/public/               vanilla HTML/CSS/JS frontend
app/test/                 node --test suite
.github/workflows/ci.yml  CI: test suite + zero-dependency + design-token audits
```

## Using this process in another codebase

The process is plain markdown — nothing to install, no runtime, no cloning
required beyond grabbing the files once. To adopt it in any repo where you
use Claude Code:

1. **Copy verbatim** (fully stack-agnostic):
   - `.claude/agents/` — the four role agents
   - `.claude/commands/` — `/feature`, `/feature-resume`, `/backlog`,
     `/design-review`, `/qa-verify`
   - `.claude/hooks/` + `.claude/settings.json` — mechanical lane enforcement
     (if the target repo already has a `settings.json`, merge the `hooks` and
     `permissions.deny` entries instead of overwriting; adjust the lane table
     in `enforce-lanes.js` if the target's paths differ)
   - `tools/browser.js` — QA evidence capture (degrades gracefully where no
     Chromium is installed)
   - `docs/qa/TEMPLATE-defect.md`
2. **Copy, then edit for the target project**:
   - `CLAUDE.md` — rewrite the **Tech stack** section (agents build with
     whatever it declares: React, Vue, Python, anything) and the **Commands**
     section (how to run and test that project). Keep the Roles, Workflow
     rules, and Artifact conventions sections as-is.
   - `docs/design-system.md` — swap the placeholder tokens for the target
     product's brand values.
3. **Create the artifact directories**: `docs/specs/`, `docs/qa/test-plans/`,
   `docs/qa/defects/`, `docs/qa/evidence/`, `docs/design-reviews/`,
   `docs/pipeline/`.
4. **Optional but recommended**: copy the three seeded `001-status-dashboard`
   artifacts (spec, test plan, design review) as format exemplars — the agent
   prompts reference them as the pattern to follow. They work without them
   (the required sections are also described inline in each agent prompt),
   and your first `/feature` run produces fresh exemplars.

Leave behind: everything under `app/` — that's the demo product, not the
process.

One-liner from a checkout of this repo, run inside the target repo:

```sh
SRC=/path/to/agentic-dev
cp -r "$SRC/.claude" . && cp "$SRC/CLAUDE.md" .
mkdir -p tools docs/specs docs/qa/test-plans docs/qa/defects docs/qa/evidence \
         docs/design-reviews docs/pipeline
cp "$SRC/tools/browser.js" tools/
cp "$SRC/docs/design-system.md" docs/
cp "$SRC/docs/qa/TEMPLATE-defect.md" docs/qa/
# then edit CLAUDE.md (Tech stack + Commands) and docs/design-system.md
```

(If the target repo already has a `CLAUDE.md` or `.claude/`, merge instead of
overwrite: append the Roles/Workflow/Artifact sections to the existing
`CLAUDE.md` and drop the agent/command files into the existing directories.)

## Lane enforcement

Lane boundaries are enforced mechanically, on top of the prompt discipline:

- **Tool access** is restricted per agent via frontmatter (the ux-designer
  has no Bash).
- **Path lanes** are enforced by `.claude/hooks/enforce-lanes.js`, a
  PreToolUse hook (registered in `.claude/settings.json`) that identifies the
  active subagent from the hook input and denies `Write`/`Edit` outside its
  lane — with deny messages that steer the agent back into the process (file
  a defect, raise an OPEN QUESTION) instead of retrying. It also blocks
  `package.json`/lockfiles/`node_modules` for everyone (the zero-dependency
  rule) and protects the enforcement layer from subagent edits. Unknown
  agents fail closed.
- **Handoff contract**: `.claude/hooks/check-footer.js` (SubagentStop) blocks
  a role agent from finishing without the ARTIFACTS WRITTEN / STATUS /
  OPEN QUESTIONS footer.
- Honest limitation: Bash is policed by heuristics only (package managers,
  `git commit/push`); shell-redirection writes aren't caught. Hooks fail open
  on internal errors, so a hook bug degrades to prompt discipline rather than
  blocking work.

## Running multiple features

- Queue asks with `/backlog add "<ask>"` and start the top item with
  `/backlog next`. The backlog doubles as the **spec-number registry**: NNN is
  allocated when an item goes in-progress, which prevents numbering
  collisions between concurrent runs.
- For truly parallel features, run one `/feature` per `git worktree`
  (`git worktree add ../repo-feat-x -b feat-x`). Only do this for features
  that touch disjoint files — shared files like `app/public/styles.css` and
  `app/server.js` will conflict at merge time. Always allocate NNN via the
  backlog first, since concurrent worktrees can't see each other's
  `docs/specs/`.
- Interrupted runs resume with `/feature-resume` from their
  `docs/pipeline/NNN-<slug>.md` state file; the SessionStart hook lists
  in-flight runs when you open a session.

## Limitations (by design, it's a baseline)

- Subagents cannot spawn subagents — the main session must orchestrate.
- Bash file writes are heuristically policed, not fully sandboxed (see Lane
  enforcement).
- Fix loops are capped at 2 iterations before escalating to the product owner.
- Browser evidence is capture-only (DOM dump + screenshot). Click-driven
  verification would need a CDP driver (`tools/cdp.js` over Node ≥21's
  built-in WebSocket is the intended zero-dep path) — add it when a feature's
  criteria actually require interaction.
