// Verifies acceptance criteria 1–2 of docs/specs/001-status-dashboard.md.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const server = require('../server.js');

let baseUrl;

before(async () => {
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

test('GET /api/status returns 200 JSON matching the contract', async () => {
  const response = await fetch(`${baseUrl}/api/status`);
  assert.strictEqual(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);

  const body = await response.json();
  assert.strictEqual(body.status, 'ok');
  assert.strictEqual(typeof body.uptimeSeconds, 'number');
  assert.ok(Number.isInteger(body.uptimeSeconds) && body.uptimeSeconds >= 0);
  assert.strictEqual(typeof body.timestamp, 'string');
  assert.ok(!Number.isNaN(Date.parse(body.timestamp)), 'timestamp is ISO-8601');
});

test('unknown /api/* paths return 404 with a JSON error body', async () => {
  const response = await fetch(`${baseUrl}/api/nope`);
  assert.strictEqual(response.status, 404);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.deepStrictEqual(await response.json(), { error: 'not found' });
});
