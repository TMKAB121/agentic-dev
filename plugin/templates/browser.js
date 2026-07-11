#!/usr/bin/env node
// Zero-dependency headless-Chromium wrapper for QA evidence capture.
//
// Usage:
//   node tools/browser.js dom  <url>                    # post-JS DOM → stdout
//   node tools/browser.js shot <url> <out.png> [WxH]    # screenshot (default 1280x800)
//
// Exit codes: 0 success · 1 usage/capture error · 2 no browser found
// (on exit 2, fall back to static HTML/CSS checks and note it in the test plan).
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// Executes the page's JS for up to 3s of virtual time before capturing, so
// fetch-driven states (loading → success) have settled.
const BASE_FLAGS = [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--hide-scrollbars',
  '--virtual-time-budget=3000',
];

function findBrowser() {
  const candidates = [];
  if (process.env.CHROME_BIN) candidates.push(process.env.CHROME_BIN);
  const pw = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (pw && fs.existsSync(pw)) {
    for (const entry of fs.readdirSync(pw).sort().reverse()) {
      if (!entry.startsWith('chromium')) continue;
      candidates.push(
        path.join(pw, entry),
        path.join(pw, entry, 'chrome-linux', 'chrome'),
        path.join(pw, entry, 'chrome-linux', 'headless_shell'),
      );
    }
  }
  candidates.push('chromium', 'chromium-browser', 'google-chrome', 'chrome');
  for (const c of candidates) {
    try {
      if (spawnSync(c, ['--version'], { stdio: 'ignore', timeout: 10000 }).status === 0) {
        return c;
      }
    } catch {
      // not runnable — try the next candidate
    }
  }
  return null;
}

function usage() {
  process.stderr.write(
    'usage: node tools/browser.js dom <url>\n' +
      '       node tools/browser.js shot <url> <out.png> [WxH]\n',
  );
  process.exit(1);
}

const [cmd, url, out, size] = process.argv.slice(2);
if (!url || (cmd !== 'dom' && cmd !== 'shot') || (cmd === 'shot' && !out)) usage();

const browser = findBrowser();
if (!browser) {
  process.stderr.write(
    'browser unavailable — no Chromium/Chrome found (checked CHROME_BIN, ' +
      'PLAYWRIGHT_BROWSERS_PATH, PATH). Fall back to static checks.\n',
  );
  process.exit(2);
}

let flags;
if (cmd === 'dom') {
  flags = [...BASE_FLAGS, '--dump-dom', url];
} else {
  const [w, h] = (size || '1280x800').split('x');
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  flags = [
    ...BASE_FLAGS,
    `--screenshot=${path.resolve(out)}`,
    `--window-size=${w || 1280},${h || 800}`,
    url,
  ];
}

const res = spawnSync(browser, flags, { encoding: 'utf8', timeout: 30000 });
if (res.error || res.status !== 0) {
  process.stderr.write(
    `capture failed (${res.error ? res.error.message : `exit ${res.status}`})\n${res.stderr || ''}`,
  );
  process.exit(1);
}
if (cmd === 'dom') {
  process.stdout.write(res.stdout);
} else {
  process.stderr.write(`screenshot written: ${path.resolve(out)}\n`);
}
