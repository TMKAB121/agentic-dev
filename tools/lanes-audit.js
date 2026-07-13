#!/usr/bin/env node
// Lanes template audit — proves the shipped plugin/templates/lanes.json (the
// copy-and-adapt starter a reused project drops in as .claude/lanes.json) is
// valid, covers all five agents, and actually agrees with the enforcement hook.
//
// This is the regression guard for the reuse gap the template closes: with the
// template active, backend-developer can write terraform/ and server/ (the
// paths the built-in defaults lack), while cross-lane and excluded writes still
// deny. If the hook's config schema and the template ever drift apart, this
// fails instead of a downstream /feature run stalling.
//
// Exit 0 = clean, exit 1 = violation (prints a GitHub ::error:: annotation).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const at = (p) => path.join(root, p);
const TEMPLATE = 'plugin/templates/lanes.json';
const HOOK = at('plugin/hooks/enforce-lanes.js');
const AGENTS = ['ux-designer', 'frontend-developer', 'backend-developer', 'qa-engineer', 'technical-writer'];

function fail(msg) {
  console.error(`::error::${msg}`);
  process.exit(1);
}

// --- Static checks: valid JSON, every agent has a lane -----------------------
let tpl;
try {
  tpl = JSON.parse(fs.readFileSync(at(TEMPLATE), 'utf8'));
} catch (e) {
  fail(`${TEMPLATE} is missing or not valid JSON: ${e.message}`);
}
if (!tpl.lanes || typeof tpl.lanes !== 'object') {
  fail(`${TEMPLATE} has no "lanes" object — a reused project needs one lane per agent.`);
}
const missing = AGENTS.filter((a) => !tpl.lanes[a] || !Array.isArray(tpl.lanes[a].allow));
if (missing.length) {
  fail(`${TEMPLATE} is missing an allow-list lane for: ${missing.join(', ')}`);
}

// --- Functional checks: run the shipped hook with the template active --------
// Stage the template as a target project's .claude/lanes.json in a temp dir and
// ask the hook to rule on writes. Empty stdout = allowed; a deny payload = blocked.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lanes-audit-'));
fs.mkdirSync(path.join(tmp, '.claude'), { recursive: true });
fs.copyFileSync(at(TEMPLATE), path.join(tmp, '.claude', 'lanes.json'));

function ruling(agent, file) {
  const payload = { tool_name: 'Write', agent_type: agent, tool_input: { file_path: file }, cwd: tmp };
  const out = execFileSync('node', [HOOK], {
    input: JSON.stringify(payload),
    env: { ...process.env, CLAUDE_PROJECT_DIR: tmp },
    encoding: 'utf8',
  }).trim();
  if (!out) return { allowed: true };
  return { allowed: false, reason: JSON.parse(out).hookSpecificOutput.permissionDecisionReason };
}

// [agent, file, expectAllowed, why]
const cases = [
  ['backend-developer', 'terraform/main.tf', true, 'infra lane must reach terraform/ (the gap this template closes)'],
  ['backend-developer', 'server/index.js', true, 'backend lane must reach the server/ backend'],
  ['frontend-developer', 'server/index.js', false, 'frontend must not write the backend (cross-lane)'],
  ['backend-developer', 'server/__tests__/api.test.js', false, 'tests are QA\'s lane (backend exclude must bite)'],
  ['technical-writer', 'README.md', true, 'docs lane must reach the root README.md'],
  ['technical-writer', 'docs/project/overview.md', true, 'docs lane must reach docs/project/'],
  ['technical-writer', 'server/index.js', false, 'writer must not touch code (cross-lane)'],
];

const problems = [];
try {
  for (const [agent, file, expectAllowed, why] of cases) {
    const r = ruling(agent, file);
    if (r.allowed !== expectAllowed) {
      problems.push(
        `${agent} → ${file}: expected ${expectAllowed ? 'ALLOW' : 'DENY'} but got ` +
          `${r.allowed ? 'ALLOW' : 'DENY'} (${why})`,
      );
    }
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (problems.length) {
  fail(`${TEMPLATE} and the hook disagree:\n  - ${problems.join('\n  - ')}`);
}

console.log(`Lanes template audit: ${TEMPLATE} valid, all ${AGENTS.length} lanes present, ${cases.length} hook rulings correct.`);
