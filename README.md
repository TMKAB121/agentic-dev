# agentic-dev

A baseline, in-house **agentic development process** built entirely on Claude
Code's native subagents — no third-party orchestration frameworks, no npm
dependencies. Five role agents collaborate through files in this repo, driven
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
            + technical-writer → README.md · docs/project/
```

Subagents share no context, so **every handoff is a file** — specs, defect
reports, design reviews — and the orchestrator passes explicit paths between
phases. The full rules live in [CLAUDE.md](CLAUDE.md).

## The five agents

| Agent | Owns | Forbidden | Key artifacts |
|---|---|---|---|
| `ux-designer` | Design specs, design tokens, accessibility, **design verification** after QA | Writing any app code; has no Bash access | `docs/specs/`, `docs/design-system.md`, `docs/design-reviews/` |
| `frontend-developer` | UI implementation per spec | Editing specs, backend code, or tests | `app/public/` |
| `backend-developer` | API, server, data, infra/CI; installing product-owner-approved dependencies | Editing UI files, specs, or tests; adding unapproved dependencies | `app/server.js` |
| `qa-engineer` | Test plans, automated tests, verification, defect reports | Fixing product code | `app/test/`, `docs/qa/` |
| `technical-writer` | Project docs kept in sync with the shipped feature (idempotent) | Writing code, specs, or tests | `README.md`, `docs/project/` |

## The pipeline (`/feature`)

```
You (product owner): /feature "add X"
  1. ux-designer writes docs/specs/NNN-<slug>.md
  2. frontend-developer + backend-developer implement in parallel
  3. qa-engineer writes a test plan + tests, runs them → PASS | FAIL
  4. QA fix loop: defects routed by Area to the owning dev, QA re-verifies (max 2)
  5. ux-designer verifies the implementation against the spec → APPROVED | CHANGES REQUIRED
  6. Design fix loop: findings → dev → QA regression → UX re-review (max 2)
  7. technical-writer creates/updates README.md + docs/project/ for the shipped feature
  8. Summary back to you for final acceptance
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
.claude/agents/           the five role agents (markdown + YAML frontmatter)
.claude/commands/         /feature, /feature-resume, /backlog, /design-review, /qa-verify
.claude/hooks/            lane enforcement, footer check, session-start state surfacing
.claude/settings.json     hook registration + package-manager deny rules
plugin/                   Claude Code plugin bundle — mirrors .claude/ + templates/
.claude-plugin/marketplace.json  makes this repo its own installable plugin marketplace
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
.github/workflows/ci.yml  CI: test suite + zero-dependency + design-token + plugin-parity audits
```

## Using this process in other projects

This process is packaged as a **Claude Code plugin**, and that is how you adopt
it: every project installs the same agents, commands, and hooks from this repo
as the single source of truth. Process improvements land by pushing here; each
project pulls them with `/plugin marketplace update` instead of re-copying
files. This repo doubles as its own
[marketplace](https://code.claude.com/docs/en/plugin-marketplaces) — no separate
hosting.

Four things are **always authored per-project** — the plugin ships the process,
not your product's specifics:

1. `CLAUDE.md` — write the **Tech stack** and **Commands** sections for the
   target (agents build with whatever it declares: React, Python, anything).
   The Roles, Workflow rules, and Artifact conventions sections carry over
   unchanged — they *are* the process (copy them from this repo's `CLAUDE.md`).
2. `docs/design-system.md` — start from `plugin/templates/design-system.md` and
   swap the placeholder tokens for the target product's brand values.
3. The artifact directories (`docs/specs/`, `docs/qa/test-plans/`,
   `docs/qa/defects/`, `docs/qa/evidence/`, `docs/design-reviews/`,
   `docs/pipeline/`) — created as the agents write them; no setup needed.
4. `.claude/lanes.json` — the one deliberately project-coupled file. It maps
   each agent to the target repo's real paths (e.g. `src/components/` instead of
   `app/public/`) and lists which packages the product owner has approved
   (`dependencies.allow`) and which lane may install them
   (`dependencies.installers`). Copy `plugin/templates/lanes.json` and adapt the
   paths; leaving `dependencies.allow` empty keeps the zero-dependency posture.
   You only need this file when the target's paths differ from the demo's — the
   plugin's `enforce-lanes.js` ships a built-in table for this repo's tree.

### How the plugin bundle fits together

**This repo is already packaged** — the plugin bundle lives in `plugin/` and
the marketplace file at `.claude-plugin/marketplace.json`, so you install it
rather than build it. How it fits together, for when you evolve it:

```
.claude-plugin/marketplace.json   # marketplace at the repo root → source: ./plugin
plugin/
├── .claude-plugin/plugin.json    # name, version — bump on release
├── agents/                       # mirror of .claude/agents/
├── commands/                     # mirror of .claude/commands/
├── hooks/
│   ├── hooks.json                # hook registration (paths via ${CLAUDE_PLUGIN_ROOT})
│   ├── enforce-lanes.js          # mirrors of .claude/hooks/*.js
│   ├── check-footer.js
│   └── session-start.js
└── templates/                    # TEMPLATE-defect.md, design-system.md, browser.js, lanes.json
```

Three things make the bundle behave once installed to a read-only plugin cache:

- **`hooks/hooks.json`** registers the same three hooks as
  `.claude/settings.json`, but the command paths use `${CLAUDE_PLUGIN_ROOT}`
  (not `$CLAUDE_PROJECT_DIR/.claude/...`, which points at the *target* repo,
  not the cached plugin).
- **`enforce-lanes.js` reads an optional `$CLAUDE_PROJECT_DIR/.claude/lanes.json`**
  in the target project and falls back to its built-in table when absent — so
  a project retargets lanes to its own paths (`src/components/` instead of
  `app/public/`) without forking the cached hook. The file is either a bare
  `{ "<agent>": { "allow": [...], "hint": "..." } }` map or a structured
  `{ "lanes": {...}, "protected": [...], "bashDeny": [{ "pattern", "flags?", "why" }] }`.
  The built-in table mirrors *this* repo's tree (`app/`, `.github/`, `tools/`),
  so a project whose layout differs **must** supply a `lanes.json` — otherwise
  the lane hook denies writes to dirs the defaults don't list. The most common
  trap is infra-as-code: `backend-developer` is the infra lane, but the default
  table has no `terraform/`/`server/`, so those writes hard-deny until you
  retarget. Copy `plugin/templates/lanes.json` (an Express-plus-Terraform layout
  with `backend-developer` allowing `server/` and `terraform/`) to
  `.claude/lanes.json` and adapt the paths.
- **The hooks strip plugin namespacing** — an agent surfacing as
  `agentic-dev:ux-designer` resolves to the `ux-designer` lane/footer rule, so
  the process works out of the box without per-project lane edits.

**Editing the process:** change the `.claude/` copies (that's what dogfoods in
this repo), then re-copy into `plugin/`. CI's *plugin parity audit* fails the
build if `plugin/agents`, `plugin/commands`, or the three hook scripts drift
from their `.claude/` sources — the bundle stays a faithful mirror. Bump
`version` in `plugin.json` when you cut a release so projects update
deliberately, not on every commit.

### Install in a target project

```shell
/plugin marketplace add tmkab121/agentic-dev
/plugin install agentic-dev@agentic-dev
```

Then author the per-project pieces above (CLAUDE.md sections, design tokens,
and — if your paths differ from the demo's — a `.claude/lanes.json` copied from
`plugin/templates/lanes.json`). Plugin commands are namespaced:
`/agentic-dev:feature "add X"`, `/agentic-dev:backlog list`, etc.

**Smoke-test once per install**: run a trivial `/agentic-dev:feature` and
confirm the lane hook isn't denying everything. The hook keys off the
`agent_type` field and unknown agents fail closed; namespaced types like
`agentic-dev:ux-designer` are stripped back to the built-in lane
automatically, so you only need `.claude/lanes.json` when the target's *paths*
differ. `claude plugin validate` catches structural mistakes before you push.

For teams, the target repo can auto-prompt installation by declaring the
marketplace in its `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "agentic-dev": { "source": { "source": "github", "repo": "tmkab121/agentic-dev" } }
  },
  "enabledPlugins": { "agentic-dev@agentic-dev": true }
}
```

### Experimenting with process variants

The process being markdown makes variants cheap — a variant is a branch:

- Develop a variant on a branch of this repo, then trial it inside any real
  project with `claude --plugin-dir /path/to/agentic-dev/plugin` (no install
  needed; a local `--plugin-dir` copy overrides the installed plugin of the
  same name for that session). `/reload-plugins` picks up edits live while
  you tune prompts mid-session.
- Keep `main` as the stable process. When a variant proves out on a real
  feature, merge it and bump the plugin `version`; projects adopt it on their
  next `/plugin marketplace update`.
- The demo app in `app/` stays valuable here: it's a fixed, known-good target
  for A/B-ing process changes (same ask, `main` vs. variant branch) without
  risking a real codebase.

## Lane enforcement

Lane boundaries are enforced mechanically, on top of the prompt discipline:

- **Tool access** is restricted per agent via frontmatter (the ux-designer
  has no Bash).
- **Path lanes** are enforced by `.claude/hooks/enforce-lanes.js`, a
  PreToolUse hook (registered in `.claude/settings.json`) that identifies the
  active subagent from the hook input and denies `Write`/`Edit` outside its
  lane — with deny messages that steer the agent back into the process (file
  a defect, raise an OPEN QUESTION) instead of retrying. It protects the
  enforcement layer from subagent edits, and unknown agents fail closed.
- **Dependency policy** rides the same hook. Zero dependencies is the default,
  but the product owner can approve specific packages per project via a
  `dependencies.allow` allowlist in `.claude/lanes.json`. With an empty
  allowlist the hook denies package managers, `package.json`, lockfiles, and
  `node_modules` for everyone (the zero-dependency posture). Add a package name
  and the installer lane (default `backend-developer`) may install *that*
  package and declare it in `package.json` — nothing else. Agents can't edit
  `.claude/lanes.json`, so the approval is always the product owner's: backend
  raises the package under OPEN QUESTIONS, you add it to the allowlist, backend
  wires it up.
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
