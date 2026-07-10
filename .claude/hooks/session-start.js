#!/usr/bin/env node
// SessionStart hook: surfaces in-flight pipeline state and queued backlog
// items so a fresh or resumed session immediately knows where work stands.
// Prints nothing (and exits 0) when there is nothing pending.
//
// Failure posture: FAIL OPEN — errors never block session start.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function firstMatch(text, re) {
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

try {
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const out = [];

  // Pipeline state files: docs/pipeline/NNN-<slug>.md with a "Status:" line.
  // Anything not `complete` is worth surfacing (in-progress AND stopped runs
  // both carry open items for the product owner).
  const pipelineDir = path.join(root, 'docs', 'pipeline');
  if (fs.existsSync(pipelineDir)) {
    for (const f of fs.readdirSync(pipelineDir).sort()) {
      if (!f.endsWith('.md')) continue;
      const text = fs.readFileSync(path.join(pipelineDir, f), 'utf8');
      const status = firstMatch(text, /^Status:\s*(.+)$/m);
      if (!status || status === 'complete') continue;
      const phase = firstMatch(text, /^Current phase:\s*(.+)$/m) || 'unknown phase';
      out.push(`- docs/pipeline/${f}: ${status} — ${phase}`);
    }
  }

  // Backlog: table rows in docs/backlog.md whose status is queued/in-progress.
  const backlogPath = path.join(root, 'docs', 'backlog.md');
  if (fs.existsSync(backlogPath)) {
    const rows = fs
      .readFileSync(backlogPath, 'utf8')
      .split('\n')
      .filter((l) => /^\|/.test(l) && /\b(queued|in-progress)\b/.test(l));
    if (rows.length) {
      out.push(`- docs/backlog.md: ${rows.length} item(s) queued or in progress`);
    }
  }

  if (out.length) {
    process.stdout.write(
      'Agentic pipeline state (from docs/pipeline/ and docs/backlog.md):\n' +
        out.join('\n') +
        '\nUse /feature-resume to continue an in-progress run, or /backlog to manage the queue.\n',
    );
  }
  process.exit(0);
} catch (err) {
  process.stderr.write(`session-start hook error (ignored): ${err.message}\n`);
  process.exit(0);
}
