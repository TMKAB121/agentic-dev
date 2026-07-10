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

## Using this process in other projects

The process is plain markdown plus three small hook scripts — nothing to
install, no runtime. There are three ways to reuse it, ordered by how much
you intend to keep iterating on the process itself:

| Route | Best for | How process updates reach projects |
|---|---|---|
| **A. Copy the files** | Adopting once in a repo that will diverge | Manual re-copy |
| **B. Package as a Claude Code plugin** | Running the same process across several repos while evolving it here | Push here → `/plugin marketplace update` in each project |
| **C. Personal `~/.claude`** | Quick personal reuse of the agents/commands only | Edit in place; applies to all your projects |

Whichever route you pick, four things are **always per-project** and never
port as-is:

1. `CLAUDE.md` — rewrite the **Tech stack** and **Commands** sections (agents
   build with whatever the target's CLAUDE.md declares: React, Python,
   anything). The Roles, Workflow rules, and Artifact conventions sections
   carry over unchanged — they *are* the process.
2. `docs/design-system.md` — swap the placeholder tokens for the target
   product's brand values.
3. The artifact directories: `docs/specs/`, `docs/qa/test-plans/`,
   `docs/qa/defects/`, `docs/qa/evidence/`, `docs/design-reviews/`,
   `docs/pipeline/`.
4. The `LANES` path table in `enforce-lanes.js` — the one deliberately
   project-coupled piece; it maps each agent to the target repo's real paths
   (e.g. `src/components/` instead of `app/public/`). The package-manager
   `permissions.deny` rules are likewise this demo's zero-dependency policy,
   not part of the process — keep or drop per project.

### Route A: copy the files

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
2. **Copy `CLAUDE.md` and `docs/design-system.md`, then do the four
   per-project edits** listed above (CLAUDE.md sections, tokens, artifact
   directories, lane table).
3. **Optional but recommended**: copy the three seeded `001-status-dashboard`
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

### Route B: package as a Claude Code plugin (recommended for multi-project use)

A [plugin](https://code.claude.com/docs/en/plugins) makes this repo the single
source of truth: every project installs the same agents, commands, and hooks;
process improvements land by pushing here, and each project pulls them with
`/plugin marketplace update` instead of re-copying files. This repo doubles as
its own [marketplace](https://code.claude.com/docs/en/plugin-marketplaces) —
no separate hosting.

1. **Create the plugin layout** in this repo. Plugin component directories
   must sit at the plugin root (not under `.claude-plugin/` and not under
   `.claude/`), so mirror the existing files into a `plugin/` directory:

   ```
   plugin/
   ├── .claude-plugin/plugin.json    # {"name": "agentic-dev", "version": "0.1.0", "description": "..."}
   ├── agents/                       # copy of .claude/agents/
   ├── commands/                     # copy of .claude/commands/
   ├── hooks/
   │   ├── hooks.json                # hook registration (step 2)
   │   ├── enforce-lanes.js          # copies of .claude/hooks/*.js
   │   ├── check-footer.js
   │   └── session-start.js
   └── templates/                    # TEMPLATE-defect.md, design-system.md, browser.js
   ```

2. **Register the hooks in `plugin/hooks/hooks.json`** — same shape as the
   `hooks` block in `.claude/settings.json`, but script paths must use
   `${CLAUDE_PLUGIN_ROOT}`: installed plugins run from a cache directory, so
   `$CLAUDE_PROJECT_DIR/.claude/hooks/...` no longer points at the scripts.

   ```json
   {
     "hooks": {
       "PreToolUse": [
         {
           "matcher": "Write|Edit|Bash",
           "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/enforce-lanes.js\"" }]
         }
       ],
       "SubagentStop": [
         { "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/check-footer.js\"" }] }
       ],
       "SessionStart": [
         { "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/session-start.js\"" }] }
       ]
     }
   }
   ```

3. **Make the lane table per-project.** Inside a plugin, `enforce-lanes.js`
   lives in the read-only plugin cache, so target projects can't edit `LANES`
   directly. Change the plugin copy to read an optional
   `$CLAUDE_PROJECT_DIR/.claude/lanes.json` (same shape as the `LANES` object,
   plus optional `protected` and `bashDeny` overrides) and fall back to the
   built-in table when absent. Each project then declares its own paths
   without forking the hook.

4. **Publish it via a marketplace file** at the **repo root**,
   `.claude-plugin/marketplace.json`:

   ```json
   {
     "name": "agentic-dev",
     "owner": { "name": "tmkab121" },
     "plugins": [
       { "name": "agentic-dev", "source": "./plugin", "description": "Agentic dev process: 4 role agents, /feature pipeline, lane enforcement" }
     ]
   }
   ```

   Push, and the plugin is installable from the GitHub repo. Bump `version`
   in `plugin.json` when you cut a release — projects then update
   deliberately instead of on every commit.

5. **Install in a target project**:

   ```shell
   /plugin marketplace add tmkab121/agentic-dev
   /plugin install agentic-dev@agentic-dev
   ```

   Then do the four per-project edits from the top of this section
   (CLAUDE.md sections, design tokens, artifact dirs, `.claude/lanes.json`).
   Plugin commands are namespaced: `/agentic-dev:feature "add X"`,
   `/agentic-dev:backlog list`, etc.

6. **Smoke-test once per install**: run a trivial
   `/agentic-dev:feature` and confirm the lane hook isn't denying everything.
   The hook keys off the `agent_type` field in hook input, and unknown agents
   fail closed — if plugin-provided agents surface with a namespaced type
   (e.g. `agentic-dev:ux-designer`), add those keys to the lane table /
   `lanes.json`. `claude plugin validate` catches structural mistakes before
   you push.

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

### Route C: personal user-level install

Copy `.claude/agents/` and `.claude/commands/` into `~/.claude/agents/` and
`~/.claude/commands/` and the four roles plus the slash commands exist in
every project you open, with un-namespaced names and zero project setup.
Do **not** move the hooks into `~/.claude/settings.json`: they would fire in
every repo you touch, and the lane table only makes sense per project. Use
this as a stopgap for trying the roles somewhere quickly; for real adoption
the target still needs the per-project pieces (routes A/B).

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
