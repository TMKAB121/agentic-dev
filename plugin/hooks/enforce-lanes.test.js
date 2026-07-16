'use strict';

// Tests for the dependency-policy path of enforce-lanes.js. Each case feeds a
// simulated PreToolUse payload on stdin (the hook's own contract) and inspects
// the JSON deny response, if any. Run: node --test plugin/hooks/enforce-lanes.test.js
//
// Regression coverage for two fixed bugs:
//   1. non-install package-manager commands were gated by the installer lane
//   2. the deny reason was dropped, so agents saw a blank denial

const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, 'enforce-lanes.js');

// A project dir with an ACTIVE allowlist (vite, left-pad approved; backend is
// the installer lane).
function activeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lanes-active-'));
  fs.mkdirSync(path.join(dir, '.claude'));
  fs.writeFileSync(
    path.join(dir, '.claude', 'lanes.json'),
    JSON.stringify({
      dependencies: { allow: ['vite', 'left-pad'], installers: ['backend-developer'] },
    }),
  );
  return dir;
}

// A zero-dependency project dir (empty allowlist).
function zeroDepProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lanes-zerodep-'));
  fs.mkdirSync(path.join(dir, '.claude'));
  fs.writeFileSync(
    path.join(dir, '.claude', 'lanes.json'),
    JSON.stringify({ dependencies: { allow: [], installers: ['backend-developer'] } }),
  );
  return dir;
}

// Run the hook against a Bash command as `agent`, in project `dir`. Returns the
// parsed hook output ({} when the hook allows / stays silent).
function runHook(dir, agent, command) {
  const payload = JSON.stringify({
    tool_name: 'Bash',
    agent_type: agent,
    tool_input: { command },
  });
  const res = spawnSync(process.execPath, [HOOK], {
    input: payload,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    encoding: 'utf8',
  });
  assert.strictEqual(res.status, 0, 'hook must always exit 0 (fail-open posture)');
  const out = res.stdout.trim();
  return out ? JSON.parse(out) : {};
}

function isDeny(out) {
  return out.hookSpecificOutput && out.hookSpecificOutput.permissionDecision === 'deny';
}
function reasonOf(out) {
  return out.hookSpecificOutput && out.hookSpecificOutput.permissionDecisionReason;
}

test('non-installer running a non-install command is allowed (Bug 1)', () => {
  const dir = activeProject();
  try {
    for (const cmd of ['npm run build', 'npm run dev', 'npm test', 'npm ls']) {
      const out = runHook(dir, 'frontend-developer', cmd);
      assert.ok(!isDeny(out), `expected "${cmd}" to be allowed, got deny: ${reasonOf(out)}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('non-installer running an install is denied WITH a reason (Bug 2)', () => {
  const dir = activeProject();
  try {
    const out = runHook(dir, 'frontend-developer', 'npm install left-pad');
    assert.ok(isDeny(out), 'expected a deny for a non-installer install');
    assert.ok(reasonOf(out) && reasonOf(out).length > 0, 'deny reason must be non-empty');
    assert.match(reasonOf(out), /backend-developer/, 'reason names the installer lane');
    assert.match(reasonOf(out), /OPEN QUESTIONS/, 'reason steers to OPEN QUESTIONS');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('installer installing an allowlisted package is allowed', () => {
  const dir = activeProject();
  try {
    const out = runHook(dir, 'backend-developer', 'npm install left-pad');
    assert.ok(!isDeny(out), `expected allow, got deny: ${reasonOf(out)}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('installer installing a non-allowlisted package is denied WITH a reason', () => {
  const dir = activeProject();
  try {
    const out = runHook(dir, 'backend-developer', 'npm install express');
    assert.ok(isDeny(out), 'expected a deny for a non-allowlisted install');
    assert.match(reasonOf(out), /express/, 'reason names the offending package');
    assert.match(reasonOf(out), /allowlist/, 'reason mentions the allowlist');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('npx is still gated by the installer lane WITH a reason', () => {
  const dir = activeProject();
  try {
    const out = runHook(dir, 'frontend-developer', 'npx vite');
    assert.ok(isDeny(out), 'expected npx to be gated for a non-installer');
    assert.ok(reasonOf(out) && reasonOf(out).length > 0, 'deny reason must be non-empty');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('npx of a non-allowlisted target is denied for the installer WITH a reason', () => {
  const dir = activeProject();
  try {
    const out = runHook(dir, 'backend-developer', 'npx cowsay hi');
    assert.ok(isDeny(out), 'expected npx of a non-allowlisted target to be denied');
    assert.match(reasonOf(out), /cowsay/, 'reason names the npx target');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('zero-dep project allows a non-install run but denies an install WITH a reason', () => {
  const dir = zeroDepProject();
  try {
    const run = runHook(dir, 'frontend-developer', 'npm test');
    assert.ok(!isDeny(run), `expected "npm test" allowed in zero-dep, got: ${reasonOf(run)}`);

    const install = runHook(dir, 'frontend-developer', 'npm install left-pad');
    assert.ok(isDeny(install), 'expected an install to be denied in a zero-dep project');
    assert.ok(reasonOf(install) && reasonOf(install).length > 0, 'deny reason must be non-empty');
    assert.match(reasonOf(install), /OPEN QUESTIONS/, 'reason steers to OPEN QUESTIONS');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
