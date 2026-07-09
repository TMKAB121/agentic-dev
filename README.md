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

Standalone commands: `/design-review` (UX audit of the current UI) and
`/qa-verify` (standalone QA pass against a spec).

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
.claude/commands/         /feature, /design-review, /qa-verify
docs/design-system.md     design tokens + component rules (UX-owned)
docs/specs/               UX feature specs (NNN-<slug>.md)
docs/qa/                  test plans, defect template, defect reports
docs/design-reviews/      UX design-verification reports
app/server.js             zero-dependency Node http server (API + static)
app/public/               vanilla HTML/CSS/JS frontend
app/test/                 node --test suite
```

## Using this process in another codebase

The process is plain markdown — nothing to install, no runtime, no cloning
required beyond grabbing the files once. To adopt it in any repo where you
use Claude Code:

1. **Copy verbatim** (fully stack-agnostic):
   - `.claude/agents/` — the four role agents
   - `.claude/commands/` — `/feature`, `/design-review`, `/qa-verify`
   - `docs/qa/TEMPLATE-defect.md`
2. **Copy, then edit for the target project**:
   - `CLAUDE.md` — rewrite the **Tech stack** section (agents build with
     whatever it declares: React, Vue, Python, anything) and the **Commands**
     section (how to run and test that project). Keep the Roles, Workflow
     rules, and Artifact conventions sections as-is.
   - `docs/design-system.md` — swap the placeholder tokens for the target
     product's brand values.
3. **Create the artifact directories**: `docs/specs/`, `docs/qa/test-plans/`,
   `docs/qa/defects/`, `docs/design-reviews/`.
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
mkdir -p docs/specs docs/qa/test-plans docs/qa/defects docs/design-reviews
cp "$SRC/docs/design-system.md" docs/
cp "$SRC/docs/qa/TEMPLATE-defect.md" docs/qa/
# then edit CLAUDE.md (Tech stack + Commands) and docs/design-system.md
```

(If the target repo already has a `CLAUDE.md` or `.claude/`, merge instead of
overwrite: append the Roles/Workflow/Artifact sections to the existing
`CLAUDE.md` and drop the agent/command files into the existing directories.)

## Hardening lane boundaries

Tool access is already restricted per agent via frontmatter (the ux-designer
has no Bash); path-level rules (e.g. "UX writes only under docs/") are
prompt-level discipline here, upgradeable with hooks or permission deny rules.

## Limitations (by design, it's a baseline)

- Subagents cannot spawn subagents — the main session must orchestrate.
- Path discipline is enforced by prompts, not the platform.
- Fix loops are capped at 2 iterations before escalating to the product owner.
