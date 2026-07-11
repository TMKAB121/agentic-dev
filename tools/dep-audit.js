#!/usr/bin/env node
// Dependency audit — the CI-side mirror of the enforce-lanes dependency policy.
//
// Reads the approved allowlist from .claude/lanes.json (dependencies.allow):
//   - empty/absent  -> zero-dependency posture: fail if package.json, any
//                      lockfile, or node_modules is present.
//   - non-empty     -> dependencies are permitted; fail only if package.json
//                      declares a package that is NOT on the approved allowlist.
//
// Exit 0 = clean, exit 1 = violation (prints a GitHub ::error:: annotation).
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const at = (p) => path.join(root, p);

let allow = [];
try {
  const cfg = JSON.parse(fs.readFileSync(at('.claude/lanes.json'), 'utf8'));
  if (cfg.dependencies && Array.isArray(cfg.dependencies.allow)) {
    allow = cfg.dependencies.allow.filter((x) => typeof x === 'string');
  }
} catch {
  /* no lanes.json / unparseable -> zero-dependency default */
}

const LOCKFILES = ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb'];

function fail(msg) {
  console.error(`::error::${msg}`);
  process.exit(1);
}

if (allow.length === 0) {
  const present = ['package.json', ...LOCKFILES, 'node_modules'].filter((f) => fs.existsSync(at(f)));
  if (present.length) {
    fail(
      `zero-dependency rule violated — no packages are approved in .claude/lanes.json ` +
        `(dependencies.allow is empty) but these are present: ${present.join(', ')}`,
    );
  }
  console.log('Dependency audit: zero-dependency posture clean.');
  process.exit(0);
}

// Allowlist active — validate that package.json only declares approved packages.
if (fs.existsSync(at('package.json'))) {
  let pj;
  try {
    pj = JSON.parse(fs.readFileSync(at('package.json'), 'utf8'));
  } catch {
    fail('package.json is not valid JSON.');
  }
  const fields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
  const bad = [];
  for (const field of fields) {
    const section = pj[field];
    if (section && typeof section === 'object') {
      for (const name of Object.keys(section)) {
        if (!allow.includes(name)) bad.push(name);
      }
    }
  }
  if (bad.length) {
    fail(
      `package.json declares dependencies not on the approved allowlist ` +
        `(.claude/lanes.json dependencies.allow): ${bad.join(', ')}`,
    );
  }
}

console.log(`Dependency audit: ${allow.length} approved package(s), manifest clean.`);
