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
// Dependency policy: this repo is zero-dependency BY DEFAULT. The product
// owner can approve specific packages per project by adding them to
// `dependencies.allow` in $CLAUDE_PROJECT_DIR/.claude/lanes.json (a protected
// file only the product owner / orchestrator can edit). Once a package is on
// the allowlist, the installer lane (default: backend-developer) may install
// it and declare it in package.json; everything else stays denied and must be
// escalated under OPEN QUESTIONS. See resolveDependencyDecision below.
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
  'technical-writer': {
    allow: ['README.md', 'docs/project/'],
    hint: 'You document the shipped state; code, specs, tests, and other docs are other lanes — raise an OPEN QUESTION if you are blocked.',
  },
};

// Subagents may not touch the enforcement layer itself.
const DEFAULT_PROTECTED = ['.claude/settings.json', '.claude/hooks/', '.claude/lanes.json', '.claude/qa.json'];

// Bash heuristics, subagents only. (Package managers are handled separately by
// the dependency-policy logic, not by this static list.)
const DEFAULT_BASH_DENY = [
  {
    re: /\bgit\s+(commit|push)\b/,
    why: 'committing and pushing are the orchestrator/product owner\'s call, never a subagent\'s',
  },
];

// The zero-dependency invariant is enforced against these basenames — unless
// the product owner has approved packages (see dependency policy).
const MANIFEST = 'package.json';
const LOCKFILES = new Set(['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb']);

// Package managers and their install-type subcommands (which add packages).
const PACKAGE_MANAGERS = new Set(['npm', 'pnpm', 'yarn', 'bun', 'npx', 'pip', 'pip3']);
const INSTALL_SUBCMDS = {
  npm: new Set(['install', 'i', 'add', 'ci']),
  pnpm: new Set(['install', 'i', 'add']),
  yarn: new Set(['add', 'install']),
  bun: new Set(['install', 'i', 'add']),
  pip: new Set(['install']),
  pip3: new Set(['install']),
};

// Resolve config, layering an optional $CLAUDE_PROJECT_DIR/.claude/lanes.json
// over the built-ins. The file may be either a bare lane map ({ "<agent>":
// { allow, ... } }) or a structured object ({ lanes, protected, bashDeny,
// dependencies }). bashDeny entries are { pattern, flags?, why } since JSON
// can't hold regexes. Any parse/read error falls back to the built-ins (fail
// open — but note that fail-open here means the zero-dependency DEFAULT, i.e.
// dependencies stay denied).
function loadConfig(root) {
  const defaultDeps = { allow: [], installers: ['backend-developer'] };
  const fallback = {
    lanes: DEFAULT_LANES,
    protectedPaths: DEFAULT_PROTECTED,
    bashDeny: DEFAULT_BASH_DENY,
    dependencies: defaultDeps,
  };
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'lanes.json'), 'utf8'));
    const reserved = new Set(['lanes', 'protected', 'bashDeny', 'dependencies']);
    const bareLanes = Object.fromEntries(
      Object.entries(cfg).filter(([k]) => !reserved.has(k)),
    );
    const lanes = cfg.lanes || bareLanes;
    const bashDeny = Array.isArray(cfg.bashDeny)
      ? cfg.bashDeny.map((d) => ({ re: new RegExp(d.pattern, d.flags), why: d.why }))
      : DEFAULT_BASH_DENY;
    const depRaw = cfg.dependencies && typeof cfg.dependencies === 'object' ? cfg.dependencies : {};
    const dependencies = {
      allow: Array.isArray(depRaw.allow)
        ? depRaw.allow.filter((x) => typeof x === 'string')
        : [],
      installers: Array.isArray(depRaw.installers) && depRaw.installers.length
        ? depRaw.installers.filter((x) => typeof x === 'string')
        : ['backend-developer'],
    };
    return {
      lanes: lanes && Object.keys(lanes).length ? lanes : DEFAULT_LANES,
      protectedPaths: Array.isArray(cfg.protected) ? cfg.protected : DEFAULT_PROTECTED,
      bashDeny,
      dependencies,
    };
  } catch {
    return fallback;
  }
}

// Strip a plugin namespace ("agentic-dev:backend-developer" -> "backend-developer").
function bareAgent(agent) {
  return agent && agent.includes(':') ? agent.split(':').pop() : agent;
}

// Resolve an agent to its lane, tolerating plugin namespacing.
function laneFor(lanes, agent) {
  if (lanes[agent]) return lanes[agent];
  if (agent && agent.includes(':')) return lanes[agent.split(':').pop()];
  return undefined;
}

// Is `agent` an approved dependency installer for this project?
function isInstaller(agent, deps) {
  const a = bareAgent(agent);
  return deps.installers.some((i) => bareAgent(i) === a);
}

// Strip a version specifier: "express@^4" -> "express", "@scope/pkg@1" ->
// "@scope/pkg".
function stripVersion(token) {
  if (token.startsWith('@')) {
    const at = token.indexOf('@', 1);
    return at === -1 ? token : token.slice(0, at);
  }
  const at = token.indexOf('@');
  return at === -1 ? token : token.slice(0, at);
}

// Deny messages shared by the install and npx paths.
function zeroDepDeny(agent) {
  return {
    deny:
      `Blocked for ${agent}: package managers are disabled — this project has no ` +
      'approved dependencies (zero-dependency by default). Raise the package you need ' +
      'under OPEN QUESTIONS so the product owner can add it to .claude/lanes.json ' +
      'dependencies.allow. Do not retry.',
  };
}
function installerLaneDeny(agent, deps) {
  return {
    deny:
      `Blocked for ${agent}: installing dependencies is the ${deps.installers.join('/')} ` +
      "lane's responsibility, not yours. Raise it under OPEN QUESTIONS. Do not retry.",
  };
}

// Decide whether a Bash command that touches a package manager is allowed under
// the project's dependency policy. Returns:
//   null              -> no package manager involved; caller proceeds normally
//   { allow: true }   -> permitted
//   { deny: reason }  -> blocked, with a message that steers to OPEN QUESTIONS
function resolveDependencyDecision(cmd, agent, deps) {
  const active = deps.allow.length > 0;
  // Split on shell separators so a chained `cd x && npm i y` is inspected
  // segment by segment. This is heuristic (does not parse quoting/subshells) —
  // consistent with the documented Bash soft spot; it fails closed on installs.
  const segments = cmd.split(/&&|\|\||[;\n|]/);
  let sawPackageManager = false;

  for (const segment of segments) {
    const tokens = segment.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    const mgr = tokens[0];
    if (!PACKAGE_MANAGERS.has(mgr)) continue;
    sawPackageManager = true;

    // Classify the command FIRST — only *installs* (and `npx`, which fetches/
    // runs a package) are gated by the active/installer/allowlist policy.
    // Non-install runs (`npm run`, `npm test`, `npm ls`, `pnpm exec`, …) are
    // plain script execution and are allowed for ANY lane, regardless of
    // whether dependencies are active. Gating them here was the bug that stopped
    // frontend/QA lanes from building or testing frontend-only projects.
    if (mgr === 'npx') {
      // npx runs (and may fetch) a package — gate it like an install.
      if (!active) return zeroDepDeny(agent);
      if (!isInstaller(agent, deps)) return installerLaneDeny(agent, deps);
      const target = tokens.slice(1).find((t) => !t.startsWith('-'));
      if (target && !deps.allow.includes(stripVersion(target))) {
        return {
          deny:
            `Blocked for ${agent}: npx would fetch/run "${stripVersion(target)}", which is not on ` +
            'the approved allowlist (.claude/lanes.json dependencies.allow). Raise it under ' +
            'OPEN QUESTIONS. Do not retry.',
        };
      }
      continue;
    }

    const sub = tokens[1];
    const installSubs = INSTALL_SUBCMDS[mgr] || new Set();
    // Bare `yarn` (no subcommand) installs from the manifest.
    const isInstall = sub ? installSubs.has(sub) : mgr === 'yarn';
    if (!isInstall) continue; // `npm run`, `npm test`, `npm ls`, … — allowed for any lane.

    // From here down the command installs packages — apply the full policy.
    if (!active) return zeroDepDeny(agent);
    if (!isInstaller(agent, deps)) return installerLaneDeny(agent, deps);

    const rest = tokens.slice(2);
    if (rest.includes('-r') || rest.includes('--requirement') || rest.includes('-e')) {
      return {
        deny:
          `Blocked for ${agent}: installing from a requirements/editable target can't be checked ` +
          'against the approved allowlist. List the specific packages under OPEN QUESTIONS. Do not retry.',
      };
    }
    // Explicit package targets (skip flags); strip version specifiers. No
    // targets means "install from the manifest", which is validated on write.
    const targets = rest.filter((t) => !t.startsWith('-')).map(stripVersion);
    const bad = targets.filter((t) => !deps.allow.includes(t));
    if (bad.length) {
      const plural = bad.length > 1;
      return {
        deny:
          `Blocked for ${agent}: ${bad.join(', ')} ${plural ? 'are' : 'is'} not on the approved ` +
          'dependency allowlist (.claude/lanes.json dependencies.allow). Raise ' +
          `${plural ? 'them' : 'it'} under OPEN QUESTIONS for the product owner to approve. Do not retry.`,
      };
    }
  }

  return sawPackageManager ? { allow: true } : null;
}

// Compute the resulting file content for a Write (full content) or Edit
// (simulate the string replacement against the current file). Returns null if
// the result can't be determined (e.g. Edit whose old_string isn't present).
function resultingContent(tool, cwd, args) {
  if (tool === 'Write') return args.content != null ? String(args.content) : '';
  let current;
  try {
    current = fs.readFileSync(path.resolve(cwd, args.file_path), 'utf8');
  } catch {
    return null;
  }
  const oldStr = String(args.old_string ?? '');
  const newStr = String(args.new_string ?? '');
  if (!current.includes(oldStr)) return null;
  return args.replace_all ? current.split(oldStr).join(newStr) : current.replace(oldStr, newStr);
}

// Validate a package.json write: every declared dependency must be on the
// approved allowlist. Returns { parseError } | { unknown } | { bad: [...] }.
function manifestViolations(tool, cwd, args, allow) {
  const content = resultingContent(tool, cwd, args);
  if (content == null) return { unknown: true };
  let json;
  try {
    json = JSON.parse(content);
  } catch {
    return { parseError: true };
  }
  const fields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
  const bad = [];
  for (const field of fields) {
    const section = json[field];
    if (section && typeof section === 'object') {
      for (const name of Object.keys(section)) {
        if (!allow.includes(name)) bad.push(name);
      }
    }
  }
  return { bad };
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
  const deps = cfg.dependencies;
  const depActive = deps.allow.length > 0;

  if (tool === 'Bash') {
    if (!agent) return; // orchestrator Bash is not policed here
    const cmd = String(args.command || '');
    const depDecision = resolveDependencyDecision(cmd, agent, deps);
    if (depDecision && depDecision.deny) deny(depDecision.deny);
    // A permitted package-manager command still falls through to the other
    // Bash heuristics below (e.g. it must not also `git push`).
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

  const base = path.basename(rel);
  const relParts = rel.split(path.sep);

  // Global invariants — apply to every actor, orchestrator included.

  // node_modules is managed by the package manager, never hand-written.
  if (relParts.includes('node_modules')) {
    deny('Blocked: node_modules is managed by the package manager, not written by hand.');
  }

  // package.json: gated by the dependency allowlist.
  if (base === MANIFEST) {
    if (!depActive) {
      deny(
        'Blocked: this project is zero-dependency (no packages approved). ' +
          'The product owner approves packages by adding them to .claude/lanes.json ' +
          'dependencies.allow before any package.json may be created.',
      );
    }
    const v = manifestViolations(tool, cwd, args, deps.allow);
    if (v.parseError) {
      deny(`Blocked: ${base} is not valid JSON, so its dependencies can't be checked against the approved allowlist.`);
    }
    if (v.unknown) {
      deny(`Blocked: can't determine the resulting ${base} to validate it — write the full file instead of a partial Edit.`);
    }
    if (v.bad && v.bad.length) {
      const plural = v.bad.length > 1;
      deny(
        `Blocked: ${base} declares ${v.bad.join(', ')}, not on the approved allowlist ` +
          `(.claude/lanes.json dependencies.allow). The product owner must approve ${plural ? 'them' : 'it'} first ` +
          '(raise it under OPEN QUESTIONS).',
      );
    }
    if (!agent) return; // orchestrator may write a validated manifest
    if (!isInstaller(agent, deps)) {
      deny(`Blocked for ${agent}: only the ${deps.installers.join('/')} lane may write ${base}.`);
    }
    return;
  }

  // Lockfiles: generated alongside an approved manifest; permitted when the
  // dependency policy is active, denied otherwise.
  if (LOCKFILES.has(base)) {
    if (!depActive) {
      deny(
        'Blocked: this project is zero-dependency, so lockfiles are not allowed. ' +
          'The product owner enables dependencies via .claude/lanes.json dependencies.allow.',
      );
    }
    if (!agent) return;
    if (!isInstaller(agent, deps)) {
      deny(`Blocked for ${agent}: only the ${deps.installers.join('/')} lane may write ${base}.`);
    }
    return;
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
