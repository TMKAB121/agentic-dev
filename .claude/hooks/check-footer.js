#!/usr/bin/env node
// SubagentStop hook: mechanically enforces the handoff-footer contract from
// CLAUDE.md — every subagent reply must end with ARTIFACTS WRITTEN / STATUS /
// OPEN QUESTIONS. If the footer is missing, block the stop once so the agent
// finishes properly.
//
// Failure posture: FAIL OPEN (exit 0) on any parse/read error.
'use strict';

const fs = require('node:fs');

const REQUIRED = ['ARTIFACTS WRITTEN', 'STATUS', 'OPEN QUESTIONS'];
// Only the pipeline role agents owe a footer; utility agents are exempt.
const PIPELINE_AGENTS = new Set([
  'ux-designer',
  'frontend-developer',
  'backend-developer',
  'qa-engineer',
]);

function lastAssistantText(transcriptPath) {
  const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const msg = entry.message;
    if (entry.type !== 'assistant' || !msg || !Array.isArray(msg.content)) continue;
    const text = msg.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    if (text.trim()) return text;
  }
  return '';
}

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(raw);
    if (input.stop_hook_active) process.exit(0); // never loop
    if (input.agent_type && !PIPELINE_AGENTS.has(input.agent_type)) process.exit(0);

    const text =
      input.last_assistant_message || lastAssistantText(input.transcript_path);
    if (!text) process.exit(0); // nothing to judge — fail open

    const missing = REQUIRED.filter((k) => !text.includes(`${k}:`));
    if (missing.length === 0) process.exit(0);

    process.stdout.write(
      JSON.stringify({
        decision: 'block',
        reason:
          `Your reply is missing the required handoff footer field(s): ${missing.join(', ')}. ` +
          'End your reply with the exact footer from CLAUDE.md: ' +
          'ARTIFACTS WRITTEN: <paths, or "none"> / STATUS: <role-specific status> / ' +
          'OPEN QUESTIONS: <numbered list, or "none">.',
      }),
    );
    process.exit(0);
  } catch (err) {
    process.stderr.write(`check-footer hook error (failing open): ${err.message}\n`);
    process.exit(0);
  }
});
