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
'use strict';

const path = require('node:path');

// Lane table — the single mechanical source of truth for who may write where.
// Paths are repo-relative; a trailing '/' means "anything under this dir".
// New agents MUST be registered here: unknown agents fail closed for writes.
const LANES = {
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

// No actor may write these (the repo is zero-dependency by design).
const ZERO_DEP_BASENAMES = new Set(['package.json', 'package-lock.json']);

// Subagents may not touch the enforcement layer itself.
const SUBAGENT_PROTECTED = ['.claude/settings.json', '.claude/hooks/'];

// Bash heuristics, subagents only.
const BASH_DENY = [
  {
    re: /(^|[\s;&|(])(npm|npx|pnpm|yarn|bun|pip3?)(\s|$)/,
    why: 'package managers are banned — this repo is zero-dependency by design',
  },
  {
    re: /\bgit\s+(commit|push)\b/,
    why: 'committing and pushing are the orchestrator/product owner\'s call, never a subagent\'s',
  },
];

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

  if (tool === 'Bash') {
    if (!agent) return; // orchestrator Bash is not policed here
    const cmd = String(args.command || '');
    for (const { re, why } of BASH_DENY) {
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

  if (matches(rel, SUBAGENT_PROTECTED)) {
    deny(
      `Blocked for ${agent}: the enforcement layer (.claude/settings.json, .claude/hooks/) ` +
        'is maintained by the product owner only.',
    );
  }

  const lane = LANES[agent];
  if (!lane) {
    deny(
      `Blocked: agent "${agent}" has no registered lane in .claude/hooks/enforce-lanes.js. ` +
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
