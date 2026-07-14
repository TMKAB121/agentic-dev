#!/usr/bin/env node
// Zero-dependency HTTP contract/smoke runner for QA. The backend counterpart to
// tools/browser.js: drives a checks file against a running server so QA verifies
// the spec's API contract without hand-authoring bespoke fetch tests each run.
//
// Usage:
//   node tools/http-check.js <base-url> <checks.json>
//
// checks.json is a JSON array of check objects (or an object with a `checks`
// array). Each check:
//   {
//     "name":            "human label",          // optional
//     "method":          "GET",                  // default GET
//     "path":            "/api/status",          // required
//     "body":            { ... } | "raw string", // optional request body (objects sent as JSON)
//     "headers":         { ... },                // optional request headers
//     "expectStatus":    200,                    // optional exact status match
//     "expectJsonSubset":{ "status": "ok" },     // optional: response JSON must contain this (deep subset)
//     "expectContains":  "substring" | [ ... ]   // optional: raw body must contain each substring
//   }
//
// Exit codes: 0 all checks passed · 1 usage/one-or-more-failures.
// Prints one `PASS`/`FAIL` line per check plus a summary; FAIL lines say why.
'use strict';

const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');

function usage(msg) {
  if (msg) process.stderr.write(`${msg}\n`);
  process.stderr.write('usage: node tools/http-check.js <base-url> <checks.json>\n');
  process.exit(1);
}

// Deep-subset match: every key/value in `expected` must be present and equal in
// `actual`. Arrays must match element-by-element as subsets. Primitives compare
// with strict equality. Returns null on match, or a human path string on mismatch.
function subsetMismatch(expected, actual, pathStr = '') {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return `${pathStr || '<root>'}: expected array, got ${typeof actual}`;
    for (let i = 0; i < expected.length; i++) {
      const m = subsetMismatch(expected[i], actual[i], `${pathStr}[${i}]`);
      if (m) return m;
    }
    return null;
  }
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object') {
      return `${pathStr || '<root>'}: expected object, got ${actual === null ? 'null' : typeof actual}`;
    }
    for (const key of Object.keys(expected)) {
      const childPath = pathStr ? `${pathStr}.${key}` : key;
      if (!(key in actual)) return `${childPath}: missing`;
      const m = subsetMismatch(expected[key], actual[key], childPath);
      if (m) return m;
    }
    return null;
  }
  // primitive
  if (expected !== actual) {
    return `${pathStr || '<root>'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
  }
  return null;
}

function request(baseUrl, check) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(check.path, baseUrl);
    } catch (err) {
      reject(new Error(`invalid path/base-url: ${err.message}`));
      return;
    }
    const lib = url.protocol === 'https:' ? https : http;
    const headers = { ...(check.headers || {}) };
    let payload;
    if (check.body !== undefined && check.body !== null) {
      if (typeof check.body === 'string') {
        payload = check.body;
      } else {
        payload = JSON.stringify(check.body);
        if (!Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) {
          headers['Content-Type'] = 'application/json';
        }
      }
    }
    const req = lib.request(
      url,
      { method: (check.method || 'GET').toUpperCase(), headers },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (raw += c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, raw }));
      },
    );
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

function evaluate(check, res) {
  const failures = [];
  if (check.expectStatus !== undefined && res.status !== check.expectStatus) {
    failures.push(`status ${res.status} !== expected ${check.expectStatus}`);
  }
  if (check.expectContains !== undefined) {
    const needles = Array.isArray(check.expectContains) ? check.expectContains : [check.expectContains];
    for (const needle of needles) {
      if (!res.raw.includes(needle)) failures.push(`body missing substring ${JSON.stringify(needle)}`);
    }
  }
  if (check.expectJsonSubset !== undefined) {
    let parsed;
    try {
      parsed = JSON.parse(res.raw);
    } catch {
      failures.push('response body is not valid JSON');
      return failures;
    }
    const m = subsetMismatch(check.expectJsonSubset, parsed);
    if (m) failures.push(`json subset mismatch — ${m}`);
  }
  return failures;
}

async function main() {
  const [baseUrl, checksPath] = process.argv.slice(2);
  if (!baseUrl || !checksPath) usage();

  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(checksPath, 'utf8'));
  } catch (err) {
    usage(`cannot read checks file: ${err.message}`);
  }
  const checks = Array.isArray(doc) ? doc : Array.isArray(doc.checks) ? doc.checks : null;
  if (!checks) usage('checks file must be a JSON array or an object with a `checks` array');

  let passed = 0;
  let failed = 0;
  for (let i = 0; i < checks.length; i++) {
    const check = checks[i];
    const label = check.name || `${(check.method || 'GET').toUpperCase()} ${check.path}`;
    if (!check.path) {
      console.log(`FAIL  ${label} — check #${i} has no "path"`);
      failed++;
      continue;
    }
    try {
      const res = await request(baseUrl, check);
      const failures = evaluate(check, res);
      if (failures.length === 0) {
        console.log(`PASS  ${label}`);
        passed++;
      } else {
        console.log(`FAIL  ${label} — ${failures.join('; ')}`);
        failed++;
      }
    } catch (err) {
      console.log(`FAIL  ${label} — request error: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${passed}/${checks.length} checks passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
