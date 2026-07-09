// Verifies acceptance criteria 3–4 and 8 (static half) of
// docs/specs/001-status-dashboard.md.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const server = require('../server.js');

let baseUrl;

before(async () => {
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

test('GET / serves the dashboard HTML with the status card region', async () => {
  const response = await fetch(`${baseUrl}/`);
  assert.strictEqual(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);

  const html = await response.text();
  assert.match(html, /id="status-card"/);
  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
});

test('stylesheet is served as text/css', async () => {
  const response = await fetch(`${baseUrl}/styles.css`);
  assert.strictEqual(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/css/);
});

test('path traversal outside app/public is rejected', async () => {
  // fetch() normalizes "..", so exercise the raw path via http.request.
  const http = require('node:http');
  const status = await new Promise((resolve, reject) => {
    const req = http.request(
      { port: server.address().port, path: '/%2e%2e/server.js' },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      }
    );
    req.on('error', reject);
    req.end();
  });
  assert.ok(status === 403 || status === 404, `expected 403/404, got ${status}`);
});
