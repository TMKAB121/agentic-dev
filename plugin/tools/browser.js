#!/usr/bin/env node
// Zero-dependency headless-Chromium wrapper for QA evidence + assertions.
//
// Usage:
//   node tools/browser.js dom   <url>                    # post-JS DOM → stdout
//   node tools/browser.js shot  <url> <out.png> [WxH]    # screenshot (default 1280x800)
//   node tools/browser.js check <url> <assertions.json>  # assert against the post-JS DOM
//
// Exit codes: 0 success · 1 usage/capture/assertion failure · 2 no browser found
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

// Absolute launcher paths worth probing before PATH lookups — covers common
// macOS app-bundle installs that never land on PATH (the reason QA silently
// fell back to static checks on macOS before).
const ABSOLUTE_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
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
  candidates.push(...ABSOLUTE_CANDIDATES);
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
    'usage: node tools/browser.js dom   <url>\n' +
      '       node tools/browser.js shot  <url> <out.png> [WxH]\n' +
      '       node tools/browser.js check <url> <assertions.json>\n',
  );
  process.exit(1);
}

// Dump the post-JS DOM for `url` as a string, or exit with the right code on
// failure (2 = no browser, 1 = capture error).
function dumpDom(url) {
  const browser = findBrowser();
  if (!browser) {
    process.stderr.write(
      'browser unavailable — no Chromium/Chrome found (checked CHROME_BIN, ' +
        'PLAYWRIGHT_BROWSERS_PATH, macOS app bundles, PATH). Fall back to static checks.\n',
    );
    process.exit(2);
  }
  const res = spawnSync(browser, [...BASE_FLAGS, '--dump-dom', url], {
    encoding: 'utf8',
    timeout: 30000,
  });
  if (res.error || res.status !== 0) {
    process.stderr.write(
      `capture failed (${res.error ? res.error.message : `exit ${res.status}`})\n${res.stderr || ''}`,
    );
    process.exit(1);
  }
  return res.stdout;
}

// `check` mode: evaluate a small assertions list against the post-JS DOM.
// assertions.json is a JSON array (or an object with an `assertions` array) of:
//   { "name": "...", "contains": "substring in the rendered DOM" }
//   { "matches": "regex source" }        // tested against the DOM string
//   { "absent":  "substring that must NOT appear" }
// Prints PASS/FAIL per assertion; exits 1 if any fail.
function runChecks(url, assertionsPath) {
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(assertionsPath, 'utf8'));
  } catch (err) {
    process.stderr.write(`cannot read assertions file: ${err.message}\n`);
    process.exit(1);
  }
  const assertions = Array.isArray(doc) ? doc : Array.isArray(doc.assertions) ? doc.assertions : null;
  if (!assertions) {
    process.stderr.write('assertions file must be a JSON array or an object with an `assertions` array\n');
    process.exit(1);
  }

  const dom = dumpDom(url);
  let passed = 0;
  let failed = 0;
  for (let i = 0; i < assertions.length; i++) {
    const a = assertions[i];
    let ok;
    let label;
    if (a.contains !== undefined) {
      ok = dom.includes(a.contains);
      label = a.name || `contains ${JSON.stringify(a.contains)}`;
    } else if (a.matches !== undefined) {
      let re;
      try {
        re = new RegExp(a.matches);
      } catch (err) {
        console.log(`FAIL  ${a.name || `matches ${JSON.stringify(a.matches)}`} — bad regex: ${err.message}`);
        failed++;
        continue;
      }
      ok = re.test(dom);
      label = a.name || `matches /${a.matches}/`;
    } else if (a.absent !== undefined) {
      ok = !dom.includes(a.absent);
      label = a.name || `absent ${JSON.stringify(a.absent)}`;
    } else {
      console.log(`FAIL  assertion #${i} — needs one of "contains", "matches", or "absent"`);
      failed++;
      continue;
    }
    if (ok) {
      console.log(`PASS  ${label}`);
      passed++;
    } else {
      console.log(`FAIL  ${label}`);
      failed++;
    }
  }
  console.log(`\n${passed}/${assertions.length} assertions passed`);
  process.exit(failed === 0 ? 0 : 1);
}

const [cmd, url, arg3, arg4] = process.argv.slice(2);
if (!url || !['dom', 'shot', 'check'].includes(cmd)) usage();

if (cmd === 'dom') {
  process.stdout.write(dumpDom(url));
  process.exit(0);
}

if (cmd === 'check') {
  if (!arg3) usage();
  runChecks(url, arg3);
} else {
  // shot
  const out = arg3;
  if (!out) usage();
  const browser = findBrowser();
  if (!browser) {
    process.stderr.write(
      'browser unavailable — no Chromium/Chrome found (checked CHROME_BIN, ' +
        'PLAYWRIGHT_BROWSERS_PATH, macOS app bundles, PATH). Fall back to static checks.\n',
    );
    process.exit(2);
  }
  const [w, h] = (arg4 || '1280x800').split('x');
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  const res = spawnSync(
    browser,
    [...BASE_FLAGS, `--screenshot=${path.resolve(out)}`, `--window-size=${w || 1280},${h || 800}`, url],
    { encoding: 'utf8', timeout: 30000 },
  );
  if (res.error || res.status !== 0) {
    process.stderr.write(
      `capture failed (${res.error ? res.error.message : `exit ${res.status}`})\n${res.stderr || ''}`,
    );
    process.exit(1);
  }
  process.stderr.write(`screenshot written: ${path.resolve(out)}\n`);
}
