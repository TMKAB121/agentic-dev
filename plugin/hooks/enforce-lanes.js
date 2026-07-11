#!/usr/bin/env node
// PreToolUse hook: mechanically enforces the per-agent path lanes defined in
// CLAUDE.md. Runs on Write | Edit | Bash for every actor; lane rules apply
// only to subagents (hook input carries `agent_type` inside a subagent and
// omits it in the main/orchestrator session).
//
// Failure posture: FAIL OPEN. If input is unparseable or this script throws,
// exit 0 with a stderr warning — a buggy hook must degrade to prompt-level
// discipline, never brick the pipeline.
//
// Known soft spot (documented in CLAUDE.md): Bash is policed by command
// heuristics only; the hard-enforced write channels are Write/Edit.
//
// Per-project override: this file ships unchanged both in .claude/hooks/ (for
// dogfooding this repo) and inside the published plugin cache (read-only). A
// target project retargets the lanes to its own paths via an optional
// $CLAUDE_PROJECT_DIR/.claude/lanes.json instead of forking this script.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Built-in lane table — the default source of truth for who may write where.
// Paths are repo-relative; a trailing '/' means "anything under this dir".
// New agents MUST be registered here (or in lanes.json): unknown agents fail
// closed for writes.
const DEFAULT_LANES = {
  'ux-designer': {
    allow: ['docs/specs/', 'docs/design-system.md', 'docs/design-reviews/'],
    hint: 'Findings about code are reported in your review, not fixed.',
  },
  'frontend-developer': {
    allow: ['app/public/'],
    hint: 'Backend files, specs, and tests are other lanes — raise an OPEN QUESTION if you are blocked.',
  },
  'backend-developer': {
    allow: ['app/', '.github/', 'tools/'],
    exclude: ['app/public/', 'app/test/'],
    hint: 'UI files and tests are other lanes — raise an OPEN QUESTION if you are blocked.',
  },
  'qa-engineer': {
    allow: ['app/test/', 'docs/qa/'],
    hint: 'A failing behavior becomes a defect report in docs/qa/defects/ — never a code fix.',
  },
};

// Subagents may not touch the enforcement layer itself.
const DEFAULT_PROTECTED = ['.claude/settings.json', '.claude/hooks/', '.claude/lanes.json'];

// Bash heuristics, subagents only.
const DEFAULT_BASH_DENY = [
  {
    re: /(^|[\s;&|(])(npm|npx|pnpm|yarn|bun|pip3?)(\s|$)/,
    why: 'package managers are banned — this repo is zero-dependency by design',
  },
  {
    re: /\bgit\s+(commit|push)\b/,
    why: 'committing and pushing are the orchestrator/product owner\'s call, never a subagent\'s',
  },
];

// No actor may write these (the repo is zero-dependency by design).
const ZERO_DEP_BASENAMES = new Set(['package.json', 'package-lock.json']);

// Resolve config, layering an optional $CLAUDE_PROJECT_DIR/.claude/lanes.json
// over the built-ins. The file may be either a bare lane map ({ "<agent>":
// { allow, ... } }) or a structured object ({ lanes, protected, bashDeny }).
// bashDeny entries are { pattern, flags?, why } since JSON can't hold regexes.
// Any parse/read error falls back to the built-ins (fail open).
function loadConfig(root) {
  const fallback = {
    lanes: DEFAULT_LANES,
    protectedPaths: DEFAULT_PROTECTED,
    bashDeny: DEFAULT_BASH_DENY,
  };
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'lanes.json'), 'utf8'));
    const reserved = new Set(['lanes', 'protected', 'bashDeny']);
    const bareLanes = Object.fromEntries(
      Object.entries(cfg).filter(([k]) => !reserved.has(k)),
    );
    const lanes = cfg.lanes || bareLanes;
    const bashDeny = Array.isArray(cfg.bashDeny)
      ? cfg.bashDeny.map((d) => ({ re: new RegExp(d.pattern, d.flags), why: d.why }))
      : DEFAULT_BASH_DENY;
    return {
      lanes: lanes && Object.keys(lanes).length ? lanes : DEFAULT_LANES,
      protectedPaths: Array.isArray(cfg.protected) ? cfg.protected : DEFAULT_PROTECTED,
      bashDeny,
    };
  } catch {
    return fallback;
  }
}

// Resolve an agent to its lane, tolerating plugin namespacing — an installed
// plugin may surface an agent as "agentic-dev:ux-designer".
function laneFor(lanes, agent) {
  if (lanes[agent]) return lanes[agent];
  if (agent && agent.includes(':')) return lanes[agent.split(':').pop()];
  return undefined;
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

function matches(rel, prefixes) {
  return prefixes.some((p) => (p.endsWith('/') ? rel.startsWith(p) : rel === p));
}

function run(raw) {
  const input = JSON.parse(raw);
  const tool = input.tool_name;
  const args = input.tool_input || {};
  const agent = input.agent_type; // undefined in the main session
  const cwd = input.cwd || process.cwd();
  const root = process.env.CLAUDE_PROJECT_DIR || cwd;
  const cfg = loadConfig(root);

  if (tool === 'Bash') {
    if (!agent) return; // orchestrator Bash is not policed here
    const cmd = String(args.command || '');
    for (const { re, why } of cfg.bashDeny) {
      if (re.test(cmd)) {
        deny(
          `Blocked for ${agent}: ${why}. Do not retry — raise it under OPEN QUESTIONS if you believe it is required.`,
        );
      }
    }
    return;
  }

  if (tool !== 'Write' && tool !== 'Edit') return;
  if (!args.file_path) return;

  const abs = path.resolve(cwd, args.file_path);
  const rel = path.relative(root, abs);
  const outsideRepo = rel.startsWith('..') || path.isAbsolute(rel);

  // Lane rules protect repo artifacts; writes outside the repo (scratchpads,
  // temp files) are out of scope.
  if (outsideRepo) return;

  // Global invariants — apply to every actor, orchestrator included.
  if (ZERO_DEP_BASENAMES.has(path.basename(rel)) || rel.split(path.sep).includes('node_modules')) {
    deny(
      'Blocked: this repo is zero-dependency by design (CLAUDE.md Tech stack). ' +
        'No package.json, lockfiles, or node_modules may be created.',
    );
  }

  if (!agent) return; // orchestrator may write anywhere else in the repo

  if (matches(rel, cfg.protectedPaths)) {
    deny(
      `Blocked for ${agent}: the enforcement layer (${cfg.protectedPaths.join(', ')}) ` +
        'is maintained by the product owner only.',
    );
  }

  const lane = laneFor(cfg.lanes, agent);
  if (!lane) {
    deny(
      `Blocked: agent "${agent}" has no registered lane (enforce-lanes.js / .claude/lanes.json). ` +
        'Writes fail closed until the product owner adds it to the lane table.',
    );
  }

  if (lane.exclude && matches(rel, lane.exclude)) {
    deny(`Lane violation: ${agent} may not modify ${rel}. ${lane.hint} Do not retry.`);
  }
  if (!matches(rel, lane.allow)) {
    deny(`Lane violation: ${agent} may not modify ${rel}. ${lane.hint} Do not retry.`);
  }
}

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  try {
    run(raw);
    process.exit(0);
  } catch (err) {
    process.stderr.write(`enforce-lanes hook error (failing open): ${err.message}\n`);
    process.exit(0);
  }
});
