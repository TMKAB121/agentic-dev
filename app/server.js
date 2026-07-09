// Zero-dependency demo server: JSON API + static files from app/public/.
// See docs/specs/001-status-dashboard.md for the API contract.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PUBLIC_DIR = path.join(__dirname, 'public');
const START_TIME = Date.now();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function handleApi(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/status') {
    sendJson(res, 200, {
      status: 'ok',
      uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
      timestamp: new Date().toISOString(),
    });
    return;
  }
  sendJson(res, 404, { error: 'not found' });
}

function serveStatic(res, pathname) {
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = path.normalize(path.join(PUBLIC_DIR, relative));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    sendJson(res, 403, { error: 'forbidden' });
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendJson(res, 404, { error: 'not found' });
      return;
    }
    const mime = MIME_TYPES[path.extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname.startsWith('/api/')) {
    handleApi(req, res, pathname);
  } else {
    serveStatic(res, pathname);
  }
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  server.listen(port, () => {
    console.log(`Status dashboard running at http://localhost:${port}`);
  });
}

module.exports = server;
